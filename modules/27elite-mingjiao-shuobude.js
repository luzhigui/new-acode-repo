// modules/27elite-mingjiao-shuobude.js — 说不得·布袋（M100 普通兵机制，数据驱动）
// 触发：说不得每次攻击命中后 50% 触发布袋（连击/反击等额外出手独立触发）。
// 触发后掷二选一：
//   ① 保护：己方有红血（<40%）→ 装己方最残的；无红血 → 改为抓敌
//   ② 抓敌：装敌方当前 hp 绝对值最高的
// 装袋期间：不可选 / 不可打 / 不可行动 / 不可被治疗；格子显示布袋标记（render/32 按 _inBag 渲染）。
// 回合末放出：保护回 10 点血；抓敌扣 10% 最大生命值的伤害。
// 袋子同时最多装一个；已装人时再触发 → 本次作废。
export const VER = 'modules/27elite-mingjiao-shuobude.js V1.0.0';

import { CONFIG } from '../core/01config-5v5-test.js';
import { getBattleRng, applyStatChange, emitEvent, getStat } from '../core/13battle-shared.js';
import { registerSettlementHook, EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { SIGNAL_TYPES, FACT_TYPES, CAMP_TYPES, UNIT_EVENT_TYPES } from '../infra/56-battle-enums.js';
import { pushSkillAnnounce } from './23elite-helpers.js';

const RED_HP_THRESHOLD = 0.4;   // 红血阈值（与 UI 详情弹窗同口径）

function findShuobude(A) {
    return (A || []).find(u => u.name === '说不得' && u.alive);
}

// 从队伍里找"当前 hp 绝对值最高"的存活单位
function findHighestHp(team) {
    let best = null;
    for (const u of team) {
        if (!u.alive || u.state._pendingDeath || u.isHorse) continue;
        if (!best || u.hp > best.hp) best = u;
    }
    return best;
}

// 从队伍里找"血量百分比最低"的存活单位（保护己方用）
function findLowestHpPct(team) {
    let best = null;
    for (const u of team) {
        if (!u.alive || u.state._pendingDeath || u.isHorse) continue;
        const pct = u.hp / u.maxHp;
        if (!best || pct < best.pct) best = { u, pct };
    }
    return best ? best.u : null;
}

// 从队伍里找"是否有红血"的单位
function hasRedHp(team) {
    return team.some(u => u.alive && !u.state._pendingDeath && !u.isHorse && u.hp / u.maxHp < RED_HP_THRESHOLD);
}

// 装袋：给 target 打 _inBag 标记（真正"装谁"的字段记在说不得身上），并把它标记为不可选
function putInBag(caster, target, mode, log) {
    Object.assign(caster.state, {
        _inBag: { targetUid: target.uid, mode, casterUid: caster.uid, casterName: caster.name }
    });
    // 用 state._untargetable 屏蔽选敌（canBeTargeted 读它）；同时 state._stunned 屏蔽行动（core/11 跳过）
    Object.assign(target.state, { _untargetable: true, _stunned: true });
    emitEvent(target, UNIT_EVENT_TYPES.HP_CHANGE, {
        hp: target.hp, maxHp: target.maxHp, alive: target.alive,
        atk: getStat(target, 'atk'), def: getStat(target, 'def'),
        _untargetable: true, _stunned: true
    });
    if (log) {
        const label = mode === 'protect' ? '🛍️ 保护' : '🛍️ 装袋';
        pushSkillAnnounce(log, caster, '布袋',
            `${label}：${caster.name} 把 ${target.name} 装进布袋（回合末放出）`,
            { floatText: '🛍️', floatUid: target.uid });
    }
}

// 触发判定（挂 AFTER_DAMAGE_APPLIED）：每次说不得命中后掷一次
function onShuobudeHit(data) {
    const { unit, A, B, log } = data;
    if (!unit || unit.name !== '说不得' || !unit.alive) return;
    if (!data.dmg || data.dmg <= 0) return;
    const rng = getBattleRng();
    // 50% 触发布袋
    if (rng.next() >= 0.5) return;
    // 已装人 → 本次作废
    if (unit.state._inBag) return;
    const allyTeam = A || [];
    const enemyTeam = B || [];
    // 触发后掷二选一：保护 / 抓敌各一半
    const doProtect = rng.next() < 0.5;
    // 保护分支：己方有红血 → 保护；无红血 → 改为抓敌
    if (doProtect && hasRedHp(allyTeam)) {
        const target = findLowestHpPct(allyTeam);
        if (target && target.uid !== unit.uid) {
            putInBag(unit, target, 'protect', log);
            return;
        }
        // 目标是自己或找不到，落到抓敌
    }
    const enemyTarget = findHighestHp(enemyTeam);
    if (enemyTarget) putInBag(unit, enemyTarget, 'capture', log);
}

// 回合末放出（挂 ON_ROUND_END，只认真回合末 forced:true）
function releaseBag(data) {
    if (!data || !data.forced) return;
    const teams = [data.A, data.B].filter(Boolean);
    for (const team of teams) {
        const caster = team.find(u => u.state && u.state._inBag);
        if (!caster) continue;
        const bag = caster.state._inBag;
        caster.state._inBag = null;
        const allUnits = [...(data.A || []), ...(data.B || [])];
        const target = allUnits.find(u => u.uid === bag.targetUid);
        if (!target || !target.alive) continue;
        // 解状态：可被选中 + 可行动
        Object.assign(target.state, { _untargetable: false, _stunned: false });
        if (bag.mode === 'protect') {
            // 保护：回复 10 点生命（走 applyStatChange，吃截脉/寒毒打折是合理口径）
            applyStatChange(target, 'hp', 10, caster, '布袋·放生');
        } else {
            // 抓敌：扣 10% 最大生命值（伤害语义，source 记说不得，走死亡结算）
            const dmg = Math.floor(target.maxHp * 0.1);
            if (dmg > 0) applyStatChange(target, 'hp', -dmg, caster, '布袋·憋死');
        }
        emitEvent(target, UNIT_EVENT_TYPES.HP_CHANGE, {
            hp: target.hp, maxHp: target.maxHp, alive: target.alive,
            atk: getStat(target, 'atk'), def: getStat(target, 'def'),
            _untargetable: false, _stunned: false
        });
        if (data.log) {
            const note = bag.mode === 'protect'
                ? `🛍️ 布袋放生：${caster.name} 把 ${target.name} 放出来，回复 10 点生命`
                : `🛍️ 布袋憋死：${caster.name} 把 ${target.name} 放出来，扣 10% 最大生命`;
            pushSkillAnnounce(data.log, caster, '布袋', note, { floatText: '🛍️', floatUid: target.uid });
        }
    }
}

// 机制 handler：走 core/18 注册表（decl 里带 bagTrap 参数，目前参数硬编码 50%/40%/10，后续可参数化）
export const bagTrapHandler = {
    fields: {},   // 目前无参数，全硬编码；如需参数化后续补 fields
    install({ eventBus }) {
        registerSettlementHook({
            when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
            priority: L.AFTER_DAMAGE_APPLIED.LEECH + 3,
            handler: (data) => onShuobudeHit(data)
        });
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_END,
            priority: L.ROUND_END.BAG_TRAP_RELEASE,
            handler: (data) => releaseBag(data)
        });
    }
};