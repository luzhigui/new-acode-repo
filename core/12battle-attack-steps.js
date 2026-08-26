// core/12battle-attack-steps.js - 光明顶5v5 攻击步骤拆分模块
// V5.7.0 | ~24200 bytes| 2026-08-26 resolveAfterDamageEffects 8机制抽至 16effect-handlers 注册表
export const VER = 'core/12battle-attack-steps.js V5.7.0';

import { CONFIG, getSkillParams, getGameData } from './01config-5v5-test.js';
import { eventBus, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { calcDamage, getFangLevel, isMelee, getFronts, isBlocked, getRandomTaunt, getZhangNearTaunt, makeFXSnapshot, hasBuff, getUnitCol, getUnitRow } from './03battle-utils.js';
import { applyBuffEffectsBeforeAttack, applyBuffEffectsAfterAttack } from './04buff-system.js';
import { emitEvent, applyStatChange, applyMaxHpChange, query, getBattleRng, recordCombatStat } from './13battle-shared.js';
import { flushBattleEvents, pushBattleEvent, getBattleState, setBattleState, registerDodgeRule, clearEliteDodgeRules, getDodgeRules } from '../infra/51-core-utils.js';
import { getEffectHandler, hasEffectHandler } from './16effect-handlers.js';
import { FACT_TYPES } from '../infra/56-battle-enums.js';

// ==================== 闪避规则注册表（已下沉 infra/51，此处转发） ====================
export { registerDodgeRule, clearEliteDodgeRules, getDodgeRules };

registerDodgeRule((unit, attacker) => {
    if (unit.role === '飞行') return CONFIG.BASE_DODGE_FLY || 0.15;
    return 0;
});

registerDodgeRule((unit, attacker) => {
    if (unit.role !== '飞行') return CONFIG.BASE_DODGE_GROUND || 0.03;
    return 0;
});

const C = CONFIG;

// ==================== 步骤1：选择攻击目标 ====================
export function selectAttackTarget(unit, enemySide, allySide) {
    const rng = getBattleRng();
    const validTargets = enemySide.filter(c => c.alive && !c._untargetable);
    if (validTargets.length === 0) return { target: null, phantomFact: null };

    const declaration = { targetResult: null };
    eventBus.emit('beforeSelectTarget', { unit, enemySide, allySide, validTargets, declaration });

    let target = null;
    let phantomFact = null;

    if (declaration.targetResult) {
        const declared = declaration.targetResult;
        if (declared && declared.alive && !declared._untargetable) {
            target = declared;
            phantomFact = declaration.phantomFact || null;
        }
    }

    if (!target) {
        if (unit.role === '飞行') {
            const lowHpTargets = validTargets.filter(u => u.hp / u.maxHp < 0.4);
            if (lowHpTargets.length > 0) {
                target = lowHpTargets[rng.nextInt(0, lowHpTargets.length - 1)];
            } else {
                let fronts = getFronts(validTargets);
                if (fronts.length > 0) {
                    target = fronts[rng.nextInt(0, fronts.length - 1)];
                } else {
                    target = validTargets[rng.nextInt(0, validTargets.length - 1)];
                }
            }
        } else if (isMelee(unit.role) || unit.isHorse) {
            const fronts = getFronts(validTargets);
            if (fronts.length === 0) return { target: null, phantomFact: null };
            target = fronts[rng.nextInt(0, fronts.length - 1)];
        } else {
            target = validTargets[rng.nextInt(0, validTargets.length - 1)];
        }
    }

    if (!target || !target.alive || target._untargetable) {
        const fallback = validTargets.filter(c => c.alive && !c._untargetable);
        if (fallback.length === 0) return { target: null, phantomFact: null };
        target = fallback[rng.nextInt(0, fallback.length - 1)];
    }

    return { target, phantomFact };
}

// ==================== 步骤2：未命中+闪避判定 ====================
export function resolveAttackHit(unit, target, attackerBuffStats, defenderBuffStats, log, A, B, doubleStrikeUnitUid, eventBus) {
    const rng = getBattleRng();
    let missChance = 0;
    if (unit.role === '远程') { missChance = C.RANGED_MISS_CHANCE; }
    else if (unit.role === '飞行') {
        missChance = C.FLY_MISS_CHANCE;
        const allUnits = [...(A || []), ...(B || [])];
        const lowHpCount = allUnits.filter(u => u.alive && u.hp / u.maxHp < 0.4).length;
        missChance += lowHpCount * C.FLY_MISS_LOWHP_BONUS;
    }
    else { missChance = C.GROUND_MISS_CHANCE; }

    if (missChance > 0 && rng.nextInt(1,100) <= missChance) {
        const missData = {
            skipped: true,
            missFact: {
                type: 'miss',
                attacker: { uid: unit.uid, name: unit.name, camp: unit.camp },
                target: { uid: target.uid, name: target.name, camp: target.camp },
                fxSnapshot: makeFXSnapshot(unit, target)
            }
        };
        unit.state._acted = true;
        missData.missFact.events = flushBattleEvents();

        if (eventBus) {
            let afterMissExtraRequests = [];
            let afterMissData = { unit, target, log, extraRequests: afterMissExtraRequests };
            eventBus.emit('afterMiss', afterMissData);
            if (afterMissExtraRequests.length > 0) {
                missData.extraRequests = afterMissExtraRequests;
            }
        }

        return missData;
    }

    const allyBuffs = (target.camp === 'ally' && A ? A._activeBuffs : (target.camp === 'enemy' && B ? B._activeBuffs : []));
    if (target.state._stunned) return { skipped: false };
    const hasCloudBody = hasBuff(allyBuffs, 'cloudBody') || ((target.isXiaoZhaoSister || target.isXiaoZhaoBrother) && target._permanentBuffs && target._permanentBuffs.some(b => b.key === 'cloudBody'));
    if (target.alive && (target.isWei || hasCloudBody || !target.state._acted)) {
        let dodgeTriggered = false;
        for (const ruleFn of getDodgeRules()) {
            const rate = ruleFn(target, unit) || 0;
            if (rate > 0 && rng.nextInt(1, 100) <= rate * 100) {
                dodgeTriggered = true;
                break;
            }
        }
        if (!dodgeTriggered) {
            let buffDodge = defenderBuffStats.dodgeBonus || 0;
            if (buffDodge > 0 && rng.nextInt(1, 100) <= buffDodge * 100) {
                dodgeTriggered = true;
            }
        }
        const rates = [];
        for (const ruleFn of getDodgeRules()) {
            const r = ruleFn(target, unit) || 0;
            if (r > 0) rates.push(r);
        }
        if ((defenderBuffStats.dodgeBonus || 0) > 0) rates.push(defenderBuffStats.dodgeBonus);
        let product = 1;
        for (const r of rates) { product *= (1 - r); }
        target._dodgeChance = Math.round((1 - product) * 100);
        if (dodgeTriggered) {
            target.dodgeCount++;
            // 闪避承伤：走统一记账入口（承伤 = 来袭攻击力）
            recordCombatStat(unit, target, 'dodge', {
                rawAmount: Math.floor(unit.atk),
                actualAmount: 0
            });
            let reboundDmg = Math.floor((target.atk + target.def) * C.DODGE_REBOUND_RATIO);
            let unitHpBeforeRebound = Math.floor(unit.hp);

            const dodgeDeclarations = [];
            dodgeDeclarations.push({ type: EFFECT_TYPES.REBOUND, value: reboundDmg });
            dodgeDeclarations.push({ type: EFFECT_TYPES.STUN });

            eventBus.emit('onDodge', { unit, target, reboundDmg, declarations: dodgeDeclarations });

            resolveDodgeEffects(dodgeDeclarations, unit, target);

            unit.state._acted = true;
            emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _stunned: true });

            const dodgeData = {
                skipped: true,
                dodgeFact: {
                    type: 'dodge',
                    attacker: { uid: unit.uid, name: unit.name, camp: unit.camp },
                    dodger: { uid: target.uid, name: target.name, camp: target.camp },
                    reboundDmg,
                    attackerHpBefore: unitHpBeforeRebound,
                    attackerHpAfter: Math.floor(unit.hp),
                    attackerAlive: unit.alive,
                    attackerAtk: Math.floor(unit.atk),
                    dodgerDef: Math.floor(target.def),
                    dodgerHp: Math.floor(target.hp),
                    weiHeal: dodgeDeclarations.find(d => d.type === EFFECT_TYPES.WEI_HEAL)?.data || null,
                    fxSnapshot: makeFXSnapshot(target, unit)
                }
            };
            dodgeData.dodgeFact.events = flushBattleEvents();
            return dodgeData;
        }
    }
    return { skipped: false };
}

// ==================== 步骤3：伤害计算 ====================
export function calcFinalDamage(unit, target, attackerBuffStats, defenderBuffStats, allySide, enemySide, log) {
    const damageDeclarations = [];
    eventBus.emit('beforeDamageCalc', { unit, target, allySide, enemySide, log, declarations: damageDeclarations });

    let defBase = Math.floor(target.def);
    let defReduced = 0;
    let ignoreDefRatio = 0;
    let bonusDmgTotal = 0;
    let dmgMultiplier = 1;
    const bonusDmgEntries = [];
    const dmgMultiplierEntries = [];

    for (const decl of damageDeclarations) {
        if (decl.type === EFFECT_TYPES.BREAK_DEF) {
            const reduce = Math.min(decl.value || 0, defBase);
            defBase -= reduce;
            applyStatChange(target, 'def', -reduce, unit, '破防');
            if (target._baseDef !== undefined) target._baseDef -= reduce;
            defReduced = reduce;
            if (reduce > 0) {
                unit._pendingDefReduceFact = { type:'breakDef', attackerName: unit.name, targetName: target.name, reduce };
                emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: defBase, _isDead: target.state._isDead || false });
            }
        } else if (decl.type === EFFECT_TYPES.IGNORE_DEF) {
            ignoreDefRatio = Math.max(ignoreDefRatio, decl.value || 0);
        } else if (decl.type === EFFECT_TYPES.BONUS_DMG) {
            const val = decl.value || 0;
            bonusDmgTotal += val;
            bonusDmgEntries.push({ label: decl.label || '额外伤害', value: val });
        } else if (decl.type === EFFECT_TYPES.DMG_MULTIPLIER) {
            const val = decl.value || 1;
            dmgMultiplier *= val;
            dmgMultiplierEntries.push({ label: decl.label || '额外加成', value: val });
        } else if (decl.type === EFFECT_TYPES.DMG_REDUCTION) {
            bonusDmgTotal -= (decl.value || 0);
        }
    }

    if (ignoreDefRatio > 0) {
        defBase = Math.floor(defBase * (1 - ignoreDefRatio));
    }

    let atkBase = Math.floor(unit.atk);
    const rng = getBattleRng();
    let atkVar = rng.nextInt(1, C.ATK_VAR), defVar = rng.nextInt(1, C.DEF_VAR), hpBonus = rng.nextInt(C.HP_BONUS_MIN + 1, C.HP_BONUS_MAX);
    let atkAct = atkBase + atkVar, defAct = defBase + defVar;
    let hpBefore = Math.floor(target.hp);
    applyStatChange(target, 'hp', hpBonus, unit, '伤害波动回血', false);
    let waveTaunt = null, waveUnit = null;
    if (atkVar === C.ATK_VAR) { waveTaunt = getRandomTaunt(unit); waveUnit = unit; unit.critCount++; }
    else if (defVar + hpBonus >= 7) {
        const defTaunts = getGameData().taunts.def;
        waveTaunt = defTaunts[rng.nextInt(0, defTaunts.length - 1)];
        waveUnit = target;
    }
    if (unit.isZhang && !unit.rangedForm && unit.nearAtkCount < 3) {
        // 张无忌近战前三击专属台词优先级最高，覆盖暴击/防御随机台词（确保每次都有弹幕）
        let zt = getZhangNearTaunt(unit.nearAtkCount + 1);
        if (zt) { waveTaunt = zt; waveUnit = unit; }
    }
    let raw, rawFormula, hpRatio = 0;
    let blockBase = atkAct; // 挡刀值基数：防御减免前的来袭总量（0 防目标应承受的伤害）
    if (unit.role === '防战') {
        let displayDef = Math.floor(unit.def);
        let lv = getFangLevel(displayDef, unit.m), k = C.FANG_K[lv] !== undefined ? C.FANG_K[lv] : C.FANG_K[C.FANG_K.length - 1];
        let penPart = calcDamage(atkAct, defAct);
        hpRatio = unit._hpDmgRatio;
        raw = penPart + displayDef * k + unit.maxHp * hpRatio;
        blockBase = atkAct + displayDef * k + unit.maxHp * hpRatio;
    } else {
        raw = calcDamage(atkAct, defAct);
    }

    raw += bonusDmgTotal;
    raw *= dmgMultiplier;
    const blockValue = Math.floor((blockBase + bonusDmgTotal) * dmgMultiplier * 10) / 10;

    let dmg = Math.floor(raw * 10) / 10;
    let bonusEntries = [];
    const modifierResult = query('damageModifiers', unit, target, dmg, enemySide, allySide, log);
    dmg = modifierResult.modifiedDmg;
    bonusEntries = modifierResult.entries || [];

    return { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula: null, thunderBonus: 0, hornDmgMultiplier: 1, hornDefIgnore: 0, trueDmg: 0, dmg, bonusEntries, defReduced, defReduction: null, bonusDmgTotal, bonusDmgEntries, dmgMultiplier, dmgMultiplierEntries, hpRatio: unit.role === '防战' ? hpRatio : 0, blockValue };
}

// ==================== 步骤4：应用伤害结果 ====================
export function applyAttackResult(unit, target, dmgCalc, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid) {
    const rng = getBattleRng();
    let { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, thunderBonus, hornDmgMultiplier, trueDmg, dmg, bonusEntries, defReduction } = dmgCalc;

    let hpAfter = Math.floor(target.hp) - dmg;
    let dead = hpAfter <= 0;
    applyStatChange(target, 'hp', -dmg, unit, '攻击伤害');
    // 挡刀值补差：applyStatChange 已按实际伤害记承伤（delta = dmg），
    // 此处通过统一入口补上被防御挡掉的部分（承伤 = 防御减免前总量）
    if (dmgCalc.blockValue > dmg) {
        recordCombatStat(unit, target, 'damage', {
            rawAmount: dmgCalc.blockValue - dmg,
            actualAmount: 0
        });
    }
    if (dead) {
        target.alive = false;
        target._pendingDeath = true;
        if (!target._deathTime) target._deathTime = Date.now();
    }

    if (dead && target.camp === 'enemy' && unit.camp === 'ally' && !target._tokenDropped) {
        const stage = getBattleState('currentStage') || 1;
        const dropRate = (C.TOKEN_DROP_RATES[stage] || 0) / 100;
        if (rng.next() < dropRate) {
            target._tokenDropped = true;
            const currentToken = getBattleState('holyToken') || 0;
            setBattleState('holyToken', currentToken + 1);
            localStorage.setItem('ming_holy_token_5v5_test', String(currentToken + 1));
            pushBattleEvent({ unitUid: unit.uid, eventType: 'info', payload: { text: `🔥 圣火令掉落！${unit.name} 击杀 ${target.name}，获得1枚圣火令！当前总数：${currentToken + 1}`, fastEntry: true } });
            log.push({ factType: FACT_TYPES.DROP, data: { kind:'token', killerName: unit.name, victimName: target.name, total: currentToken + 1, unitUid: unit.uid } });
        }
    }
    if (dead && target.camp === 'enemy' && unit.camp === 'ally' && !target._chestDropped) {
        const chestKillRate = C.CHEST_DROP_RATE / 100;
        if (rng.next() < chestKillRate) {
            target._chestDropped = true;
            let chests = parseInt(localStorage.getItem('ming_chest_count') || '0');
            chests++;
            localStorage.setItem('ming_chest_count', String(chests));
            setBattleState('chestCount', chests);
            log.push({ factType: FACT_TYPES.DROP, data: { kind:'chest', killerName: unit.name, victimName: target.name, total: chests, unitUid: unit.uid } });
        }
    }

    let horseReboundDeclarations = [];
    const xiaoHEnhance = query('xiaoHexEnhance', A, A._activeBuffs, 'horseFormation');
    if (target.isHorse && dmg > 0 && xiaoHEnhance && hasBuff(A._activeBuffs, 'horseFormation')) {
        const rebound = xiaoHEnhance.reboundDmg;
        horseReboundDeclarations.push({
            type: EFFECT_TYPES.REBOUND,
            value: rebound,
            source: target,
            target: unit,
            factType: FACT_TYPES.HORSE_REBOUND,
            factData: { unitName: unit.name, rebound, attackerUid: unit.uid, unitUid: target.uid }
        });
    }

    emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def, _isDead: target.state._isDead || false });

    let reboundEntry = null;
    let fortifyDeclarations = null;
    let allyBuffs_fortify = (target.camp === 'ally' ? A._activeBuffs : B._activeBuffs) || [];
    if (hasBuff(allyBuffs_fortify, 'fortify') && target.role === '防战' && dmg > 0) {
        const reboundDmg = Math.floor((atkAct - Math.floor(atkAct * (atkAct / (atkAct + defAct)))) / 2);
        if (reboundDmg > 0) {
            const hasSister = A && A.some(u => u.isXiaoZhaoSister && u.alive);
            fortifyDeclarations = [{
                type: EFFECT_TYPES.REBOUND,
                value: reboundDmg,
                source: target,
                target: unit,
                hasSister,
                factType: FACT_TYPES.FORTIFY_REBOUND,
                factData: { reboundDmg, unitName: unit.name, hasSister, attackerUid: unit.uid, unitUid: target.uid }
            }];
        }
    }

    return { dmg, dead, horseReboundDeclarations, reboundEntry, bonusEntries, hpBefore, defReduction, waveTaunt, waveUnit, rawFormula, thunderBonus, hornDmgMultiplier, trueDmg, atkAct, defAct, hpBonus, fortifyDeclarations };
}

// ==================== 死亡结算边裁 ====================
export function resolveDeaths(allySide, enemySide, log) {
    const allUnits = [...allySide, ...enemySide];
    const pending = allUnits.filter(u => u._pendingDeath && u.alive);
    if (pending.length === 0) return;

    eventBus.emit('onBeforeDeath', { units: pending, allySide, enemySide, log });

    for (const u of pending) {
        applyStatChange(u, 'hp', -u.hp, null, '死亡结算', false);
        u.alive = false;
        u.state._isDead = true;
        u._pendingDeath = false;
        emitEvent(u, 'unit-remove', { uid: u.uid });
    }

    if (pending.length > 0) {
        eventBus.emit('onUnitDeath', { deadUnits: pending, allySide, enemySide, log });
    }
}

// ==================== 伤害免疫边裁 ====================
export function resolveDamageImmune(declarations) {
    if (!declarations || declarations.length === 0) return null;
    const immuneDecls = declarations.filter(d => d.immune);
    if (immuneDecls.length === 0) return null;
    return immuneDecls[0];
}

// ==================== 攻击后效果结算 ====================
export function resolveAfterDamageEffects(declarations, unit, target, group, allySide, unitBuffs) {
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
        const result = getEffectHandler(type)({
            decls,
            unit,
            target,
            group,
            allySide,
            unitBuffs,
            log: null
        });
        if (result && result.executed) executed.push(...result.executed);
    }

    // 原 catch-all：不属于 8 种已知类型的 decl 原样返回
    const knownTypes = new Set(typeOrder);
    for (const decl of declarations) {
        if (!decl || !decl.type || !knownTypes.has(decl.type)) {
            executed.push(decl);
        }
    }

    return executed;
}

// ==================== 步骤5：构建攻击事实（不渲染，由 player 投影）+ 攻击后效果 ====================
export async function buildAttackGroup(unit, target, dmgCalc, dmgResult, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, phantomFact) {
    let { atkBase, defBase, atkAct, defAct, hpBonus, hpBefore, waveTaunt, waveUnit, raw, rawFormula, thunderBonus, hornDmgMultiplier, hornDefIgnore, trueDmg, defReduction, bonusDmgTotal, bonusDmgEntries, dmgMultiplier, dmgMultiplierEntries, hpRatio } = dmgCalc;
    let { dmg, dead, reboundEntry, bonusEntries } = dmgResult;

    let hpPctBefore = Math.floor((hpBefore / target.maxHp) * 100), hpPctAfter = Math.floor((target.hp / target.maxHp) * 100);

    const pendingEntries = [];
    if (unit._pendingDefReduceFact) {
        pendingEntries.push({ factType: FACT_TYPES.BREAK_DEF, data: unit._pendingDefReduceFact });
        delete unit._pendingDefReduceFact;
    }
    if (unit._executeLog) {
        unit._executeLog.forEach(e => pendingEntries.push(e));
        delete unit._executeLog;
    }

    // 渲染快照：日志/格子不能读引擎实时对象，否则连击/联动会让前一行剧透后一行血量
    const snap = {
        attackerPos: unit.pos,
        targetPos: target.pos,
        attackerHp: Math.floor(unit.hp),
        attackerAtkDisplay: Math.floor(unit.atk + unit.atk * attackerBuffStats.atkBonus),
        attackerAtkBonusAbs: Math.floor(unit.atk * attackerBuffStats.atkBonus),
        attackerAtk: Math.floor(unit.atk),
        attackerDef: Math.floor(unit.def),
        attackerMaxHp: Math.floor(unit.maxHp),
        attackerM: unit.m,
        attackerRole: unit.role,
        attackerIsZhangNear: !!(unit.isZhang && !unit.rangedForm),
        attackerNearAtkCount: unit.nearAtkCount,
        isKuLianAttack: !!(unit.name === '宋青书' && unit._kuLianActive),
        isLinkAttack: !!unit._isLinkAttack,
        targetDefDisplay: Math.floor(target.def + target.def * defenderBuffStats.defBonus),
        targetDefBonusAbs: Math.floor(target.def * defenderBuffStats.defBonus),
        targetHpAfter: Math.floor(target.hp),
        targetAlive: target.alive
    };

    const attackFact = {
        factType: FACT_TYPES.ATTACK,
        data: {
            attacker: unit,
            target,
            dmgCalc,
            dmgResult,
            attackerBuffStats,
            defenderBuffStats,
            hpPctBefore,
            hpPctAfter,
            phantomFact,
            entries: pendingEntries,
            snap
        },
        _events: []
    };

    return attackFact;
}

// 辅助函数
export function applyPostAttackEffects(unit, target, dmg, atkAct, defAct, reboundEntry, allySide, enemySide, log, A) {
    if (unit.camp === 'ally') {
        applyBuffEffectsBeforeAttack(unit, target, allySide, enemySide, log);
    } else {
        applyBuffEffectsBeforeAttack(unit, target, enemySide, allySide, log);
    }
    if (unit.camp === 'ally') {
        applyBuffEffectsAfterAttack(unit, target, dmg, allySide, enemySide, log);
    }
    let dead = !target.alive;
    return reboundEntry;
}

export function isUnitStunned(unit) {
    return !!(unit && unit.state._stunned);
}

// ==================== 闪避后效果边裁 ====================
export function resolveDodgeEffects(declarations, unit, target) {
    if (!declarations || declarations.length === 0) return;

    for (const decl of declarations) {
        if (decl.type === EFFECT_TYPES.REBOUND) {
            applyStatChange(unit, 'hp', -decl.value, target, '闪避反击');
        } else if (decl.type === EFFECT_TYPES.STUN) {
            unit.state._stunned = true;
            emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _stunned: true });
        } else if (decl.type === EFFECT_TYPES.WEI_HEAL) {
            const { heal, newMaxHp } = decl.data;
            applyMaxHpChange(target, newMaxHp, null, '韦一笑吸血上限提升');
            target._baseMaxHp = Math.max(target._baseMaxHp, newMaxHp);
            // 吸血记账：source 与 target 同为韦一笑，healDone/leechDone 都记自身（走统一入口）
            recordCombatStat(target, target, 'leech', {
                actualAmount: heal
            });
        }
    }
}