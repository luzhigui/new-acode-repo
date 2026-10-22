// core/12battle-attack-edge.js — 攻击流程·边裁与纯工具（快照 / 闪避概率 / 免疫 / 后置效果 / 死亡结算）
// V1.0.0 | ~7300 bytes | 2026-10-18 自 core/12battle-attack-steps.js V6.3.16 拆出（纯搬移，函数体逐字不动）：
//   computeDodgeChance / snapshotUnitForFact / resolveDamageImmune / resolveAfterDamageEffects /
//   resolveDeaths / isUnitStunned 六件整块迁入。
//   归属判据：这些函数被「攻击链之外」的调用方单独使用——modules/26-tangwenliang 取 computeDodgeChance +
//   snapshotUnitForFact，core/10 在每步结束/额外攻击后独立调 resolveDeaths，core/16 独立调 resolveDamageImmune。
//   攻击链内部流转（selectAttackTarget / resolveAttackHit / calcFinalDamage / applyAttackResult / buildAttackGroup /
//   resolveDodgeEffects）留在 12battle-attack-chain.js，保持「一条攻击链一个文件」。
//   原文件死 import（clearEliteDodgeRules / isBlocked / getUnitCol / getUnitRow）未搬入——函数体内未引用，
//   不搬不影响运行时行为（保真探针/金样不感知）。
export const VER = 'core/12battle-attack-edge.js V1.0.0';

import { eventBus, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { getDodgeRules } from './20-registry-dodge.js';
import { getEffectHandler, hasEffectHandler, validateDeclarationFields } from './16effect-handlers.js';
import { emitEvent, applyStatChange, getStat } from './13battle-shared.js';
import { fmtHp } from '../infra/51-core-utils.js';
import { UNIT_EVENT_TYPES, SIGNAL_TYPES, STATE_CHANGE_TYPES } from '../infra/56-battle-enums.js';
import { emitStateChange } from '../infra/59-state-change.js';

// 综合闪避率（0~1）：规则表各源 + buff 闪避，独立相乘后取补——resolveAttackHit 内部与
//   外部「概率直读」消费者（唐文亮·同归于尽反噬，绕开「行动过不能闪避」前置时）共用此单点公式。
//   attacker 参数供规则表按攻击者特判（现有规则不区分，签名与 resolveAttackHit 内调用对齐）
export function computeDodgeChance(target, attacker, defenderBuffStats) {
    const rates = [];
    for (const ruleFn of getDodgeRules()) {
        const r = ruleFn(target, attacker) || 0;
        if (r > 0) rates.push(r);
    }
    if ((defenderBuffStats && defenderBuffStats.dodgeBonus || 0) > 0) rates.push(defenderBuffStats.dodgeBonus);
    let product = 1;
    for (const r of rates) { product *= (1 - r); }
    return 1 - product;
}

// export snapshotUnitForFact：唐文亮·同归于尽反噬的 MISS/DODGE fact 构造需要同款快照
export function snapshotUnitForFact(unit) {
    if (!unit) return null;
    return {
        uid: unit.uid,
        name: unit.name,
        camp: unit.camp,
        pos: unit.pos,
        role: unit.role,
        atk: getStat(unit, 'atk'),
        def: getStat(unit, 'def'),
        hp: fmtHp(unit.hp),
        maxHp: fmtHp(unit.maxHp),
        alive: unit.alive,
        isZhang: unit.isZhang || false,
        isWei: unit.isWei || false,
        isHorse: unit.isHorse || false,
        rangedForm: unit.rangedForm !== false,
        nearAtkCount: unit.nearAtkCount || 0,
        state: {
            _isDead: unit.state?._isDead || false,
            _stunned: unit.state?._stunned || false,
            _acted: unit.state?._acted || false,
            _resting: unit.state?._resting || false,
            _blocked: unit.state?._blocked || false,
            _kuLianActive: unit.state?._kuLianActive || false,
            _isLinkAttack: unit.state?._isLinkAttack || false,
            _linkReason: unit.state?._linkReason || null,
            _flyMode: unit.state?._flyMode || null,
            _spiderFlying: unit.state?._spiderFlying || false,
            _butterflyHost: unit.state?._butterflyHost || null
        }
    };
}

// 伤害免疫边裁
export function resolveDamageImmune(declarations) {
    if (!declarations || declarations.length === 0) return null;
    const immuneDecls = declarations.filter(d => d.immune);
    if (immuneDecls.length === 0) return null;
    return immuneDecls[0];
}

// 攻击后效果结算
export function resolveAfterDamageEffects(declarations, unit, target, group, allySide, unitBuffs, log) {
    if (!declarations || declarations.length === 0) return [];

    const executed = [];
    const typeOrder = [
        EFFECT_TYPES.BONUS_DMG,
        EFFECT_TYPES.LEECH,
        EFFECT_TYPES.HEAL,
        EFFECT_TYPES.SPLASH,
        EFFECT_TYPES.REBOUND,
        EFFECT_TYPES.STAT_CHANGE,
        EFFECT_TYPES.EXECUTE,
        EFFECT_TYPES.CLAW_CHAIN
    ];

    for (const type of typeOrder) {
        if (!hasEffectHandler(type)) continue;
        const decls = declarations.filter(d => d.type === type);
        if (decls.length === 0) continue;
        for (const decl of decls) {
            const missing = validateDeclarationFields(type, decl);
            if (missing && missing.length > 0) {
                throw new Error(`[12battle-attack-steps] ${type} 声明缺字段: ${missing.join(', ')}`);
            }
        }
        const result = getEffectHandler(type)({
            decls,
            unit,
            target,
            group,
            allySide,
            unitBuffs,
            log
        });
        if (result && result.executed) executed.push(...result.executed);
    }

    const knownTypes = new Set(typeOrder);
    for (const decl of declarations) {
        if (!decl || !decl.type || !knownTypes.has(decl.type)) {
            executed.push(decl);
        }
    }

    return executed;
}

// 死亡结算边裁
export function resolveDeaths(allySide, enemySide, log) {
    const allUnits = [...allySide, ...enemySide];
    const pending = allUnits.filter(u => u.state._pendingDeath && u.alive);
    if (pending.length === 0) return;

    eventBus.emit(SIGNAL_TYPES.ON_BEFORE_DEATH, { units: pending, allySide, enemySide, log });

    // 支持「替死」：ON_BEFORE_DEATH 监听器可以清掉自己的 _pendingDeath 来取消本次死亡
    //   （谢逊消耗狮子替死）。pending 是发射前的快照，只清标记是取消不掉循环的，必须逐条复查。
    const died = [];
    for (const u of pending) {
        if (!u.state._pendingDeath) continue;
        applyStatChange(u, 'hp', -u.hp, null, '死亡结算', false);
        u.alive = false;
        u.state._isDead = true;
        // 修字段 bug：标记时写的是 state._pendingDeath，清理时写成了顶层
        u.state._pendingDeath = false;
        emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: false, atk: getStat(u, 'atk'), def: getStat(u, 'def'), _isDead: true });
        // 死亡不再发 UNIT_REMOVE：伤口一结算就把格子从 store 摘掉，会出现「格子先空、死亡特效后到」。
        //   改为只保留 _isDead 状态 → 格子当帧就上死亡态（红底 ✕），尸体交给 player/42 的 3 秒清尸计时统一移除。
        emitStateChange(u, STATE_CHANGE_TYPES.DEATH, {}, log);
        died.push(u);
    }

    if (died.length > 0) {
        eventBus.emit(SIGNAL_TYPES.ON_UNIT_DEATH, { deadUnits: died, allySide, enemySide, log });
    }
}

export function isUnitStunned(unit) {
    return !!(unit && unit.state._stunned);
}