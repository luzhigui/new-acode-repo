// core/16effect-handlers.js - 光明顶5v5 效果处理器注册表
// V1.1.0 | ~8000 bytes| 2026-08-26 新增 calcModifier 注册表（calcFinalDamage 五声明类型查表化）
export const VER = 'core/16effect-handlers.js V1.1.0';

import { EFFECT_TYPES } from '../infra/50-event-bus.js';
import { applyStatChange, applyMaxHpChange, query, emitEvent } from './13battle-shared.js';
import { flushBattleEvents } from '../infra/51-core-utils.js';
import { BUFF_TYPES } from '../infra/56-battle-enums.js';

const effectHandlers = new Map();

export function registerEffectHandler(type, handler) {
    effectHandlers.set(type, handler);
}

export function getEffectHandler(type) {
    return effectHandlers.get(type);
}

export function hasEffectHandler(type) {
    return effectHandlers.has(type);
}

// ==================== 伤害计算阶段修饰器（calcFinalDamage 中间变量累积） ====================
// 由 core/12 calcFinalDamage 查表调用；handler 通过 ctx.refs 读写累积变量，
// 逻辑逐字搬移自原 for 循环体，不改变计算顺序/边界
const calcModifierHandlers = new Map();

export function registerCalcModifier(type, handler) {
    calcModifierHandlers.set(type, handler);
}

export function getCalcModifier(type) {
    return calcModifierHandlers.get(type);
}

registerCalcModifier(EFFECT_TYPES.BREAK_DEF, (ctx) => {
    const { decl, unit, target, refs } = ctx;
    const reduce = Math.min(decl.value || 0, refs.defBase);
    refs.defBase -= reduce;
    applyStatChange(target, 'def', -reduce, unit, '破防');
    if (target._baseDef !== undefined) target._baseDef -= reduce;
    refs.defReduced = reduce;
    if (reduce > 0) {
        unit._pendingDefReduceFact = { type:'breakDef', attackerName: unit.name, targetName: target.name, reduce };
        emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: refs.defBase, _isDead: target.state._isDead || false });
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
        if (ctx.unit && ctx.unit.role === '远程' && decl.buffType === 'meteor_splash') {
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
        applyStatChange(decl.target, decl.field, decl.delta, null, decl.reason || '属性变更');
        if (decl.field === 'atk' && decl.target._baseAtk !== undefined) {
            decl.target._baseAtk += decl.delta;
        }
        if (decl.field === 'def' && decl.target._baseDef !== undefined) {
            decl.target._baseDef += decl.delta;
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