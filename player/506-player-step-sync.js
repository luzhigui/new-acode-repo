// player/506-player-step-sync.js — 引擎 step → battleStore 同步 + 阵亡摘格 timer + 回合号读写
//   syncStoreFromStep / readRound / setRound / setupDeathTimers 整块迁入。
//   readRound 仍对外（45 经 42 barrel 取），本文件 export。
export const VER = 'player/506-player-step-sync.js V1.0.3';

import { STORE_ACTION_TYPES, FLASH_TYPES } from '../infra/106-battle-enums.js';
import { GlobalStore } from '../infra/104-global-store.js';
import { getView } from '../infra/110-view-sheet.js';
import { getPerfParam } from '../core/223-perf-params.js';

export function syncStoreFromStep(c, step) {
    if (!c.store || !step) return;
    // 修「复活格子看不见」（圣火不熄实测）：阵亡清除的 timer/黑名单原本没有复活路径——
    //   timer 晚于复活触发 → 把活人从 store 摘掉（复活 3 秒后格子消失）；早于复活触发 → uid 滞留
    //   _removedUids，被下方 filter 永久拦掉（格子从头看不见）。引擎 step.ally/enemy 是生死权威源：
    //   报活（alive===true 且 !_isDead）即撤 pending timer + 出黑名单，格子归位。
    //   正常阵亡/DESTROY 单位引擎恒报 alive=false，不进本分支，尸体清除行为不变。
    for (const u of [...step.ally, ...step.enemy]) {
        if (u.alive === true && !(u.state && u.state._isDead)) {
            if (c._deathTimers && c._deathTimers[u.uid]) { clearTimeout(c._deathTimers[u.uid]); delete c._deathTimers[u.uid]; }
            if (c._removedUids) c._removedUids.delete(u.uid);
            // 圣火不熄复活：引擎报活，但妆造层 _flash 还挂着 'dead'（死亡红叉是视图表数据，
            //   复活路径从不清它）。后果：复活后格子一直顶红叉，直到他出手/挨打
            //   （player/509 attack-group 收尾清闪）才消失。
            //   只清 DEAD 态：attack/defend/cheer 闪由各自收尾负责，不抢。
            if (getView(u.uid, '_flash') === FLASH_TYPES.DEAD) {
                c.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: u.uid });
            }
        }
    }
    // 状态源唯一：格子数据不再从 _mods 词条原料现算、也不再从日志 snap 单点捞（那是补丁），
    //   直接读引擎随 step 下发的 frozenValues——引擎每步为全部单位冻结一份真值（core/11 makeStep），
    //   所有下游读同一份，「谁现算谁对」的歧义消失。
    //   _mods 仍保留数组层深拷：step.ally/enemy 是引擎活体引用，避免引擎下一步 addMod 原地 push 污染
    //   已入 store 的快照（frozenValues 缺失时的 getStat 兜底数据源）。
    const frozen = step.frozenValues || {};
    const units = [...step.ally, ...step.enemy]
        .filter(u => !(c._removedUids && c._removedUids.has(u.uid)))
        .map(u => {
            const unit = { ...u };
            if (u._mods) unit._mods = { atk: [...u._mods.atk], def: [...u._mods.def], maxHp: [...u._mods.maxHp] };
            else unit._mods = { atk: [], def: [], maxHp: [] };
            // 审计账本同款浅拷：hp 审计记账迁出 _mods 后由 recordHpAudit 写 _audit.hp，
            //   {...u} 只带引用 → 引擎下一步原地 push 会污染已入 store 的快照（与 _mods 同因）。
            if (u._audit) unit._audit = { hp: [...u._audit.hp] };
            const fv = frozen[u.uid];
            if (fv) unit._frozen = fv;
            return unit;
        });
    c.store.dispatch({ type: STORE_ACTION_TYPES.SET_UNITS, units });
}

export function readRound(c) {
    // 状态三轨收敛：回合数唯一来源 battleStore；store 未就绪时回退 c.UI.round（开局前）
    if (c && c.store) {
        const r = c.store.getState().round;
        if (r) return r;
    }
    return (c && c.UI && c.UI.round) || 1;
}

export function setRound(c, round) {
    if (!c || !round) return;
    if (c.store) c.store.dispatch({ type: STORE_ACTION_TYPES.SET_ROUND, round });
}

export function setupDeathTimers(c) {
    c._deathTimers = {};
    c._corpseDue = new Set();
    c.store.subscribe((state) => {
        if (!c.UI) return;
        for (const su of state.units) {
            if ((su.state && su.state._isDead || su.alive === false) && !c._deathTimers[su.uid]) {
                const uid = su.uid;
                c._deathTimers[uid] = setTimeout(() => {
                    delete c._deathTimers[uid];
                    // 重开/战后 store 已被 ui/74 清空：本 timer 属于上一局，直接放弃摘格
                    if (!c.store) return;
                    // 复活识别（与 syncStoreFromStep 出黑名单同源的双保险）：触发时 store 已报活 → 不摘格子
                    const cur = c.store.getState().units.find(u => u.uid === uid);
                    if (cur && cur.alive === true && !(cur.state && cur.state._isDead)) return;
                    // 计时起点修正（2026-11-20 老板报韦一笑尸体换位到一半变空格）：
                    //   corpseDelay 从「死亡瞬间」起算，但同一步后面还有 8 条事实+击退动画要播，
                    //   低倍速档（speed300→2100ms）走到换位时已到点清格。步内到点只登记，步末重新计满一整档。
                    if (c._stepPlaying) {
                        if (!c._corpseDue) c._corpseDue = new Set();
                        c._corpseDue.add(uid);
                        return;
                    }
                    if (c._removedUids) c._removedUids.add(uid);
                    c.store.dispatch({ type: STORE_ACTION_TYPES.REMOVE_UNIT, uid: uid });
                }, getPerfParam('corpseDelay', GlobalStore.get('speed') || 300) || 3000);
            }
        }
    });
}

// 步末重挂尸体计时：步内到点的尸体，从「本步播完」此刻起再保留完整一档 corpseDelay 才摘格
export function flushCorpseDue(c) {
    if (!c || !c._corpseDue || !c._corpseDue.size || !c.store) return;
    const due = [...c._corpseDue];
    c._corpseDue.clear();
    const delay = getPerfParam('corpseDelay', GlobalStore.get('speed') || 300) || 3000;
    for (const uid of due) {
        const cur = c.store.getState().units.find(u => u.uid === uid);
        if (cur && cur.alive === true && !(cur.state && cur.state._isDead)) continue;
        c._deathTimers[uid] = setTimeout(() => {
            delete c._deathTimers[uid];
            if (!c.store) return;
            const u2 = c.store.getState().units.find(u => u.uid === uid);
            if (u2 && u2.alive === true && !(u2.state && u2.state._isDead)) return;
            if (c._removedUids) c._removedUids.add(uid);
            c.store.dispatch({ type: STORE_ACTION_TYPES.REMOVE_UNIT, uid: uid });
        }, delay);
    }
}