// core/15-skill-mechanisms.js - 光明顶5v5 技能机制解释器
// V5.6.0 | ~6200 bytes| 2026-08-21 声明式技能机制，简单技能填表即可
export const VER = 'core/15-skill-mechanisms.js V5.6.0';

import { EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { CONFIG } from './01config-5v5-test.js';
import { registerDodgeRule } from './12battle-attack-steps.js';

// 安装声明式技能：把声明表翻译成 eventBus 监听
export function installDeclaredSkills(eventBus, A, B, log, declarations) {
    for (const decl of declarations) {
        if (!decl || !decl.name) continue;
        installTargetRule(eventBus, A, B, decl);
        installAttributeModifiers(A, B, decl);
        installDodgeRules(decl);
    }
    installBeforeDamageEffects(eventBus, declarations);
    installOnHitEffects(eventBus, A, B, declarations);
}

// ==================== 目标选择声明 ====================
function installTargetRule(eventBus, A, B, decl) {
    if (!decl.targetRule) return;
    const rule = decl.targetRule;

    if (rule === 'lowestHp') {
        eventBus.on('beforeSelectTarget', L.BEFORE_SELECT_TARGET.SONG_REBEL, (data) => {
            if (data.unit.name !== decl.name) return;
            const sorted = [...data.validTargets].sort((a, b) => a.hp - b.hp);
            if (sorted[0]) data.declaration.targetResult = sorted[0];
        });
    } else if (rule === 'highestHpPct') {
        eventBus.on('beforeSelectTarget', L.BEFORE_SELECT_TARGET.SONG_REBEL, (data) => {
            if (data.unit.name !== decl.name) return;
            const target = data.validTargets.reduce((a, b) => (a.hp / a.maxHp) > (b.hp / b.maxHp) ? a : b);
            if (target) data.declaration.targetResult = target;
        });
    }
}

// ==================== 伤害计算前效果声明 ====================
// 所有声明的 beforeDamageEffects 共用一个监听器（同 onHitEffects，避开 EventBus toString 去重）
function installBeforeDamageEffects(eventBus, declarations) {
    const decls = declarations.filter(d => d && d.name && d.beforeDamageEffects && d.beforeDamageEffects.length > 0);
    if (decls.length === 0) return;

    eventBus.on('beforeDamageCalc', L.BEFORE_DAMAGE_CALC.SONG_TRUE_DMG, (data) => {
        for (const decl of decls) {
            if (data.unit.name !== decl.name) continue;
            for (const eff of decl.beforeDamageEffects) {
                if (eff.type === 'ignoreDef') {
                    data.declarations.push({ type: EFFECT_TYPES.IGNORE_DEF, value: eff.ratio, source: data.unit });
                } else if (eff.type === 'damageMultiplierIfPoisoned') {
                    if (data.target._xuanmingPoison && data.target._xuanmingPoison.remaining > 0) {
                        data.declarations.push({ type: EFFECT_TYPES.DMG_MULTIPLIER, value: 1 + eff.bonus, source: data.unit, label: '鹿角杖法' });
                    }
                } else if (eff.type === 'bonusLostHp') {
                    const lostHp = data.unit.maxHp - data.unit.hp;
                    const bonus = Math.floor(lostHp * eff.ratio);
                    if (bonus > 0) {
                        data.declarations.push({ type: EFFECT_TYPES.BONUS_DMG, value: bonus, source: data.unit, label: eff.label || '额外伤害' });
                    }
                } else if (eff.type === 'bonusTargetCurrentHp') {
                    const trueDmg = Math.floor(data.target.hp * eff.ratio);
                    if (trueDmg > 0) {
                        data.declarations.push({ type: EFFECT_TYPES.BONUS_DMG, value: trueDmg, source: data.unit, label: eff.label || '额外伤害' });
                    }
                }
            }
        }
    });
}

// ==================== 属性修正声明 ====================
function installAttributeModifiers(A, B, decl) {
    if (!decl.attributeMods || decl.attributeMods.length === 0) return;
    const target = decl.camp === 'enemy'
        ? B.find(u => u.name === decl.name && u.alive)
        : A.find(u => u.name === decl.name && u.alive);
    if (!target) return;
    for (const mod of decl.attributeMods) {
        if (mod.type === 'fortifyIncrementMul') {
            target._fortifyIncrement = CONFIG.FORTIFY_INCREMENT * mod.mult;
            target._fortifyCap = CONFIG.FORTIFY_CAP * mod.mult;
        }
    }
}

// ==================== 命中后效果声明 ====================
// 所有声明的 onHitEffects 共用一个监听器（EventBus 按 toString 去重，同模板多闭包会被误杀）
function installOnHitEffects(eventBus, A, B, declarations) {
    const onHitDecls = declarations.filter(d => d && d.name && d.onHitEffects && d.onHitEffects.length > 0);
    if (onHitDecls.length === 0) return;

    eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.WEI_LEECH, (data) => {
        const unit = data.unit;
        const target = data.target;
        const dmg = data.dmg;
        if (!unit || !unit.alive || dmg <= 0) return;

        for (const decl of onHitDecls) {
            if (unit.name !== decl.name) continue;
            for (const eff of decl.onHitEffects) {
                if (eff.type === 'leech') {
                    const lostPct = (unit.maxHp - unit.hp) / unit.maxHp;
                    const ratio = eff.minRatio + (eff.maxRatio - eff.minRatio) * lostPct;
                    const heal = Math.floor(dmg * ratio);
                    const newMaxHp = Math.min(unit.maxHp + heal, unit._baseMaxHp * 2);
                    if (!data.declarations) data.declarations = [];
                    data.declarations.push({
                        type: EFFECT_TYPES.LEECH,
                        value: heal,
                        source: unit,
                        maxHp: newMaxHp,
                        logText: `<span class="green">🦇 ${unit.name}·吸血+${heal}，上限→${Math.floor(newMaxHp)}</span>`
                    });
                } else if (eff.type === 'healMaxHpPct') {
                    const heal = Math.min(Math.floor(unit.maxHp * eff.pct), unit.maxHp - unit.hp);
                    if (heal > 0) {
                        if (!data.declarations) data.declarations = [];
                        data.declarations.push({
                            type: EFFECT_TYPES.HEAL,
                            value: heal,
                            source: unit,
                            logText: `<span class="green">☀️ ${unit.name}回复+${heal}</span>`
                        });
                    }
                } else if (eff.type === 'poison') {
                    target._xuanmingPoison = { remaining: eff.duration, dotPercents: [...eff.dotPercents] };
                    if (data.log) data.log.push({
                        type: 'info',
                        text: `<span class="purple">❄️ ${unit.name}使${target.name}中毒！(${eff.dotPercents.join('%→')}%→消失)</span>`
                    });
                } else if (eff.type === 'bonusLostHp') {
                    const lostHp = unit.maxHp - unit.hp;
                    const bonus = Math.floor(lostHp * eff.ratio);
                    if (bonus > 0) {
                        if (!data.declarations) data.declarations = [];
                        data.declarations.push({
                            type: EFFECT_TYPES.BONUS_DMG,
                            value: bonus,
                            source: unit,
                            label: eff.label || '额外伤害',
                            logText: null
                        });
                    }
                }
            }
        }
    });
}

// ==================== 闪避规则声明 ====================
function installDodgeRules(decl) {
    if (!decl.dodgeRules || decl.dodgeRules.length === 0) return;
    for (const rule of decl.dodgeRules) {
        if (rule.type === 'lostHpPercent') {
            registerDodgeRule((unit) => {
                if (unit.name !== decl.name || !unit.alive) return 0;
                const lostPct = (unit.maxHp - unit.hp) / unit.maxHp;
                return lostPct * rule.max;
            });
        }
    }
}
