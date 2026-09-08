// V6.0.0 | 2026-09-07 属性词条化：BREAK_DEF/SPLASH成长/STAT_CHANGE/ROUND_STAT_GRANT 改 addMod，不再直改 _base
export const VER = 'core/16effect-handlers.js V6.0.0';

import { EFFECT_TYPES } from '../infra/50-event-bus.js';
import { applyStatChange, applyMaxHpChange, query, emitEvent, addMod, getStat } from './13battle-shared.js';
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

export function validateDeclarationFields(type, decl) {
    const contract = EFFECT_HANDLER_CONTRACTS[type];
    if (!contract) return null;
    return contract.requiredFields.filter(f => decl[f] === undefined || decl[f] === null);
}

export const CALC_MODIFIER_CONTRACTS = Object.freeze({
    [EFFECT_TYPES.BREAK_DEF]: { requiredFields: ['value'] },
    [EFFECT_TYPES.IGNORE_DEF]: { requiredFields: ['value'] },
    [EFFECT_TYPES.BONUS_DMG]: { requiredFields: ['value'] },
    [EFFECT_TYPES.DMG_MULTIPLIER]: { requiredFields: ['value'] },
    [EFFECT_TYPES.DMG_REDUCTION]: { requiredFields: ['value'] },
});

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

// 破防：永久负词条，不再直改 _baseDef
registerCalcModifier(EFFECT_TYPES.BREAK_DEF, (ctx) => {
    const { decl, unit, target, refs } = ctx;
    const reduce = Math.min(decl.value || 0, refs.defBase);
    refs.defBase -= reduce;
    addMod(target, 'def', { source: '破防', value: -reduce, ttl: 'permanent', group: 'breakDef', op: 'add' });
    refs.defReduced = reduce;
    if (reduce > 0) {
        refs.pendingDefReduceFact = { type:'breakDef', attackerName: unit.name, targetName: target.name, reduce };
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
            addMod(decl.source, 'maxHp', { source: '吸血上限提升', value: Math.max(0, decl.maxHp - decl.source.state._baseMaxHp), ttl: 'permanent', group: 'leechMaxHp', op: 'add' });
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
                addMod(ctx.unit, 'atk', { source: '流星溅射成长', value: growth, ttl: 'permanent', group: 'meteorSplashGrowth', op: 'add' });
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
        if (decl.field === 'atk') {
            addMod(decl.target, 'atk', { source: decl.reason || '属性变更', value: decl.delta, ttl: 'permanent', group: 'statChange', op: 'add' });
        } else if (decl.field === 'def') {
            addMod(decl.target, 'def', { source: decl.reason || '属性变更', value: decl.delta, ttl: 'permanent', group: 'statChange', op: 'add' });
        } else {
            applyStatChange(decl.target, decl.field, decl.delta, null, decl.reason || '属性变更');
        }
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
            } else if (decl.field === 'atk') {
                addMod(t, 'atk', { source: decl.reason || '回合属性', value: decl.delta, ttl: 'permanent', group: 'roundStatGrant', op: 'add' });
            } else if (decl.field === 'def') {
                addMod(t, 'def', { source: decl.reason || '回合属性', value: decl.delta, ttl: 'permanent', group: 'roundStatGrant', op: 'add' });
            } else {
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