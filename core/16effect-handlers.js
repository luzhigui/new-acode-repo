// core/16effect-handlers.js - 光明顶5v5 效果处理器注册表
// V1.3.0 | ~7800 bytes| 2026-08-28 修复 infra→core 反向依赖：57 只留容器，五 handler 注册归位 16
export const VER = 'core/16effect-handlers.js V1.3.0';

import { EFFECT_TYPES } from '../infra/50-event-bus.js';
import { applyStatChange, applyMaxHpChange, query, emitEvent } from './13battle-shared.js';
import { flushBattleEvents } from '../infra/51-core-utils.js';
import { BUFF_TYPES, BUFF_SUBTYPES, UNIT_EVENT_TYPES, ROLE_TYPES } from '../infra/56-battle-enums.js';
import { registerCalcModifier, getCalcModifier } from '../infra/57-calc-modifier-registry.js';
export { registerCalcModifier, getCalcModifier };

const effectHandlers = new Map();

export function registerEffectHandler(type, handler) {
    const errors = validateEffectHandlerContract(type, handler);
    if (errors.length > 0) {
        throw new Error(`[16effect-handlers] 契约校验失败: ${errors.join('; ')}`);
    }
    effectHandlers.set(type, handler);
}

/**
 * 声明契约：每种结算类型的 handler 必须满足字段契约。
 * 返回错误列表，空数组表示通过。注册时不会校验，调用方按需用。
 */
export function validateEffectHandlerContract(type, handler) {
    const errors = [];
    if (!type || typeof type !== 'string') {
        errors.push('type 必须是非空字符串');
    }
    if (typeof handler !== 'function') {
        errors.push('handler 必须是函数');
    }
    return errors;
}

/**
 * 字段契约表：每种结算类型的 decl 必须携带这些字段。
 * resolveAfterDamageEffects 执行前逐 decl 校验，缺字段当场抛错。
 */
export const EFFECT_HANDLER_CONTRACTS = Object.freeze({
    [EFFECT_TYPES.BONUS_DMG]: { requiredFields: ['target', 'value'] },
    [EFFECT_TYPES.LEECH]: { requiredFields: ['source', 'value'] },
    [EFFECT_TYPES.HEAL]: { requiredFields: ['source', 'value'] },
    [EFFECT_TYPES.SPLASH]: { requiredFields: ['targets', 'value'] },
    [EFFECT_TYPES.REBOUND]: { requiredFields: ['target', 'value'] },
    [EFFECT_TYPES.STAT_CHANGE]: { requiredFields: ['target', 'field', 'delta'] },
    [EFFECT_TYPES.EXECUTE]: { requiredFields: ['target'] },
    [EFFECT_TYPES.CLAW_CHAIN]: { requiredFields: ['target', 'hits'] },
});

/**
 * 校验单个 decl 是否满足对应结算类型的字段契约。
 * 返回缺失字段数组；空数组表示通过；未知类型返回 null（走 catch-all 不校验）。
 */
export function validateDeclarationFields(type, decl) {
    const contract = EFFECT_HANDLER_CONTRACTS[type];
    if (!contract) return null;
    return contract.requiredFields.filter(f => decl[f] === undefined || decl[f] === null);
}

/**
 * calcModifier 字段契约：伤害计算阶段的 5 种修饰器都只需 value。
 * 与 effectHandler 契约对称，calcFinalDamage 执行前逐 decl 校验。
 */
export const CALC_MODIFIER_CONTRACTS = Object.freeze({
    [EFFECT_TYPES.BREAK_DEF]: { requiredFields: ['value'] },
    [EFFECT_TYPES.IGNORE_DEF]: { requiredFields: ['value'] },
    [EFFECT_TYPES.BONUS_DMG]: { requiredFields: ['value'] },
    [EFFECT_TYPES.DMG_MULTIPLIER]: { requiredFields: ['value'] },
    [EFFECT_TYPES.DMG_REDUCTION]: { requiredFields: ['value'] },
});

/**
 * 校验单个 calcModifier 声明是否满足字段契约。
 * 返回缺失字段数组；空数组通过；未知类型返回 null（不校验）。
 */
export function validateCalcModifierFields(type, decl) {
    const contract = CALC_MODIFIER_CONTRACTS[type];
    if (!contract) return null;
    return contract.requiredFields.filter(f => decl[f] === undefined || decl[f] === null);
}

export function getEffectHandler(type) {
    if (!effectHandlers.has(type)) {
        console.warn(`[16effect-handlers] 未注册的结算类型: ${type}`);
        return null;
    }
    return effectHandlers.get(type);
}

export function hasEffectHandler(type) {
    return effectHandlers.has(type);
}

// ==================== 伤害计算阶段修饰器（calcFinalDamage 中间变量累积） ====================
// 由 core/12 calcFinalDamage 查表调用（getCalcModifier 自 infra/57）；
// handler 通过 ctx.refs 读写累积变量，逻辑逐字搬移自原 for 循环体，不改变计算顺序/边界
registerCalcModifier(EFFECT_TYPES.BREAK_DEF, (ctx) => {
    const { decl, unit, target, refs } = ctx;
    const reduce = Math.min(decl.value || 0, refs.defBase);
    refs.defBase -= reduce;
    if (target._baseDef !== undefined) target._baseDef -= reduce;
    applyStatChange(target, 'def', -reduce, unit, '破防');
    emitEvent(target, UNIT_EVENT_TYPES.HP_CHANGE, { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def, _isDead: target.state._isDead || false });
    refs.defReduced = reduce;
    // 破防记账随声明通道传递（decl.factData 为 03 侧预填版本；reduce>0 覆盖为执行版本），不落 unit
    if (reduce > 0) {
        refs.pendingDefReduceFact = { type:'breakDef', attackerName: unit.name, targetName: target.name, reduce };
        emitEvent(target, UNIT_EVENT_TYPES.HP_CHANGE, { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: refs.defBase, _isDead: target.state._isDead || false });
    } else {
        refs.pendingDefReduceFact = decl.factData || null;
    }
});

registerCalcModifier(EFFECT_TYPES.IGNORE_DEF, (ctx) => {
    ctx.refs.ignoreDefRatio = Math.max(ctx.refs.ignoreDefRatio, ctx.decl.value || 0);
});

registerCalcModifier(EFFECT_TYPES.BONUS_DMG, (ctx) => {
    const val = ctx.decl.value || 0;
    ctx.refs.bonusDmgTotal += val;
    ctx.refs.bonusDmgEntries.push({ label: ctx.decl.label || '额外伤害', value: val });
});

registerCalcModifier(EFFECT_TYPES.DMG_MULTIPLIER, (ctx) => {
    const val = ctx.decl.value || 1;
    ctx.refs.dmgMultiplier *= val;
    ctx.refs.dmgMultiplierEntries.push({ label: ctx.decl.label || '额外加成', value: val });
});

registerCalcModifier(EFFECT_TYPES.DMG_REDUCTION, (ctx) => {
    ctx.refs.bonusDmgTotal -= (ctx.decl.value || 0);
});

registerEffectHandler(EFFECT_TYPES.BONUS_DMG, (ctx) => {
    const executed = [];
    for (const decl of ctx.decls) {
        if (!decl.target || !decl.target.alive) continue;
        applyStatChange(decl.target, 'hp', -(decl.value || 0), ctx.unit, '额外伤害');
        executed.push(decl);
    }
    return { executed };
});

registerEffectHandler(EFFECT_TYPES.LEECH, (ctx) => {
    const executed = [];
    for (const decl of ctx.decls) {
        if (!decl.source || !decl.source.alive) continue;
        if (decl.maxHp) {
            decl.source._baseMaxHp = Math.max(decl.source._baseMaxHp, decl.maxHp);
            applyMaxHpChange(decl.source, decl.maxHp, null, '吸血上限提升');
        }
        const capped = Math.min(decl.value || 0, decl.source.maxHp - decl.source.hp);
        applyStatChange(decl.source, 'hp', capped, null, '吸血');
        decl.source.leechDone = (decl.source.leechDone || 0) + capped;
        executed.push(decl);
    }
    return { executed };
});

registerEffectHandler(EFFECT_TYPES.HEAL, (ctx) => {
    const executed = [];
    for (const decl of ctx.decls) {
        if (!decl.source || !decl.source.alive) continue;
        const capped = Math.min(decl.value || 0, decl.source.maxHp - decl.source.hp);
        if (capped > 0) {
            applyStatChange(decl.source, 'hp', capped, null, '回血');
        }
        executed.push(decl);
    }
    return { executed };
});

registerEffectHandler(EFFECT_TYPES.SPLASH, (ctx) => {
    const executed = [];
    for (const decl of ctx.decls) {
        if (!decl.targets || decl.targets.length === 0) continue;
        for (const st of decl.targets) {
            if (!st.alive) continue;
            applyStatChange(st, 'hp', -(decl.value || 0), ctx.unit, '溅射');
        }
        if (ctx.unit && ctx.unit.role === ROLE_TYPES.RANGED && decl.buffType === BUFF_SUBTYPES.METEOR_SPLASH) {
            const enhance = query('xiaoHexEnhance', ctx.allySide, ctx.unitBuffs, BUFF_TYPES.METEOR_SHOWER);
            const perSplash = enhance ? (enhance.atkPerSplash || 0) : 0;
            const hitCount = decl.targets.filter(t => t.alive).length;
            if (hitCount > 0 && perSplash > 0) {
                const growth = hitCount * perSplash;
                applyStatChange(ctx.unit, 'atk', growth, null, '流星溅射成长');
                if (ctx.unit._baseAtk !== undefined) ctx.unit._baseAtk += growth;
                if (decl.factData) decl.factData.growth = growth;
            }
        }
        executed.push(decl);
    }
    return { executed };
});

registerEffectHandler(EFFECT_TYPES.REBOUND, (ctx) => {
    const executed = [];
    for (const decl of ctx.decls) {
        if (!decl.target || !decl.target.alive) continue;
        applyStatChange(decl.target, 'hp', -(decl.value || 0), decl.source, '反弹');
        if (decl.source) decl.source.reboundDone = (decl.source.reboundDone || 0) + (decl.value || 0);
        if (decl.hasSister && decl.source && decl.source.alive) {
            applyStatChange(decl.source, 'hp', decl.value || 0, null, '反弹回复');
        }
        executed.push(decl);
    }
    return { executed };
});

registerEffectHandler(EFFECT_TYPES.STAT_CHANGE, (ctx) => {
    const executed = [];
    for (const decl of ctx.decls) {
        if (!decl.target || !decl.target.alive) continue;
        if (decl.field === 'atk' && decl.target._baseAtk !== undefined) {
            decl.target._baseAtk += decl.delta;
        }
        if (decl.field === 'def' && decl.target._baseDef !== undefined) {
            decl.target._baseDef += decl.delta;
        }
        applyStatChange(decl.target, decl.field, decl.delta, null, decl.reason || '属性变更');
        executed.push(decl);
    }
    return { executed };
});

registerEffectHandler(EFFECT_TYPES.EXECUTE, (ctx) => {
    const executed = [];
    for (const decl of ctx.decls) {
        if (!decl.target || !decl.target.alive) continue;
        applyStatChange(decl.target, 'hp', -decl.target.hp, decl.source, '斩杀');
        decl._events = flushBattleEvents();
        executed.push(decl);
    }
    return { executed };
});

registerEffectHandler(EFFECT_TYPES.CLAW_CHAIN, (ctx) => {
    const executed = [];
    for (const decl of ctx.decls) {
        if (!decl.target || !decl.target.alive) continue;
        let chainTarget = decl.target;
        let chainSource = decl.source;
        decl._events = decl._events || [];
        for (const hit of decl.hits) {
            if (!chainTarget.alive || chainTarget._pendingDeath) break;
            applyStatChange(chainTarget, 'hp', -hit.dmg, chainSource, '九阴白骨爪');
            hit._events = flushBattleEvents();
            if (hit._events && hit._events.length) decl._events.push(...hit._events);
        }
        if (decl.execute && chainTarget.alive && !chainTarget._pendingDeath && chainTarget.hp > 0) {
            if (decl.execute.data) decl.execute.data.dmg = Math.round(chainTarget.hp);
            applyStatChange(chainTarget, 'hp', -chainTarget.hp, chainSource, '白骨爪斩杀');
            decl.execute._events = flushBattleEvents();
            if (decl.execute._events && decl.execute._events.length) decl._events.push(...decl.execute._events);
        }
        executed.push(decl);
    }
    return { executed };
});

registerEffectHandler(EFFECT_TYPES.ROUND_STAT_GRANT, (ctx) => {
    const executed = [];
    for (const decl of ctx.decls) {
        const targets = decl.targets || (decl.target ? [decl.target] : []);
        for (const t of targets) {
            if (!t.alive) continue;
            if (decl.field === 'maxHp') {
                applyMaxHpChange(t, t.maxHp + decl.delta, decl.source || null, decl.reason || '回合属性');
            } else {
                if (decl.field === 'atk' && t._baseAtk !== undefined) t._baseAtk += decl.delta;
                if (decl.field === 'def' && t._baseDef !== undefined) t._baseDef += decl.delta;
                applyStatChange(t, decl.field, decl.delta, decl.source || null, decl.reason || '回合属性');
            }
        }
        executed.push(decl);
    }
    return { executed };
});

export function resolveRoundStatGrants(declarations) {
    if (!declarations || declarations.length === 0) return [];
    const decls = declarations.filter(d => d && d.type === EFFECT_TYPES.ROUND_STAT_GRANT);
    if (decls.length === 0) return [];
    const result = getEffectHandler(EFFECT_TYPES.ROUND_STAT_GRANT)({
        decls,
        unit: null,
        target: null,
        group: null,
        allySide: null,
        unitBuffs: null,
        log: null
    });
    return result ? result.executed : [];
}