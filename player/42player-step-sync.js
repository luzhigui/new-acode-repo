// player/42player-step-sync.js — 引擎 step → battleStore 同步 + 阵亡摘格 timer + 回合号读写
// V1.0.0 | ~5500 bytes | 2026-10-18 自 player/42player-core.js V6.8.9 拆出（纯搬移，函数体逐字不动）：
//   syncStoreFromStep / readRound / setRound / setupDeathTimers 整块迁入。
//   readRound 仍对外（45 经 42 barrel 取），本文件 export。
export const VER = 'player/42player-step-sync.js V1.0.0';

import { STORE_ACTION_TYPES } from '../infra/56-battle-enums.js';

export function syncStoreFromStep(c, step) {
    if (!c.store || !step) return;
    // 2026-10-14 修「复活格子看不见」（圣火不熄实测）：阵亡清除的 timer/黑名单原本没有复活路径——
    //   timer 晚于复活触发 → 把活人从 store 摘掉（复活 3 秒后格子消失）；早于复活触发 → uid 滞留
    //   _removedUids，被下方 filter 永久拦掉（格子从头看不见）。引擎 step.ally/enemy 是生死权威源：
    //   报活（alive===true 且 !_isDead）即撤 pending timer + 出黑名单，格子归位。
    //   正常阵亡/DESTROY 单位引擎恒报 alive=false，不进本分支，尸体清除行为不变。
    for (const u of [...step.ally, ...step.enemy]) {
        if (u.alive === true && !(u.state && u.state._isDead)) {
            if (c._deathTimers && c._deathTimers[u.uid]) { clearTimeout(c._deathTimers[u.uid]); delete c._deathTimers[u.uid]; }
            if (c._removedUids) c._removedUids.delete(u.uid);
        }
    }
    // 2026-10-11 状态源唯一：格子数据不再从 _mods 词条原料现算、也不再从日志 snap 单点捞（那是补丁），
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
            // 2026-10-15 审计账本同款浅拷：hp 审计记账迁出 _mods 后由 recordHpAudit 写 _audit.hp，
            //   {...u} 只带引用 → 引擎下一步原地 push 会污染已入 store 的快照（与 _mods 同因）。
            if (u._audit) unit._audit = { hp: [...u._audit.hp] };
            const fv = frozen[u.uid];
            if (fv) unit._frozen = fv;
            return unit;
        });
    c.store.dispatch({ type: STORE_ACTION_TYPES.SET_UNITS, units });
}

export function readRound(c) {
    // 2026-09-14 状态三轨收敛：回合数唯一来源 battleStore；store 未就绪时回退 c.UI.round（开局前）
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
    c.store.subscribe((state) => {
        if (!c.UI) return;
        for (const su of state.units) {
            if ((su.state && su.state._isDead || su.alive === false) && !c._deathTimers[su.uid]) {
                const uid = su.uid;
                c._deathTimers[uid] = setTimeout(() => {
                    delete c._deathTimers[uid];
                    // 2026-10-14 重开/战后 store 已被 ui/74 清空：本 timer 属于上一局，直接放弃摘格
                    if (!c.store) return;
                    // 2026-10-14 复活识别（与 syncStoreFromStep 出黑名单同源的双保险）：触发时 store 已报活 → 不摘格子
                    const cur = c.store.getState().units.find(u => u.uid === uid);
                    if (cur && cur.alive === true && !(cur.state && cur.state._isDead)) return;
                    if (c._removedUids) c._removedUids.add(uid);
                    c.store.dispatch({ type: STORE_ACTION_TYPES.REMOVE_UNIT, uid: uid });
                }, 3000);
            }
        }
    });
}