// core/04buff-system.js - 光明顶5v5 Buff系统
// V5.6.0 | ~27900 bytes| 2026-08-24 删除断头的精通查询链（精通已在蛛变首次掌握时增量结算）
export const VER = 'core/04buff-system.js V5.6.0';
import {
    applyFortifyDef_Normal, applyFortifyDef_Sister, applyFortifyDef_Brother,
    applyCloudBodyDodge_Normal, applyCloudBodyDodge_Sister, applyCloudBodyDodge_Brother,
    applyHolyFlame_Normal, applyHolyFlame_Sister, applyHolyFlame_Brother,
    calcCarryBonus_Normal, calcCarryBonus_Sister,
    applyMindControl_Normal, applyMindControl_Sister
} from './14buff-effects.js';
import { CONFIG, getGameData } from './01config-5v5-test.js';
import { hasBuff, getUnitRow, getUnitCol, getAdjacentPositions } from './03battle-utils.js';
import { emitEvent, applyStatChange, applyMaxHpChange, query, getBattleRng, swapUnitPositions, moveUnitPosition } from './13battle-shared.js';
import { EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { FACT_TYPES } from '../infra/56-battle-enums.js';
const C = CONFIG;

/**
 * 圣火令绝对值加成（独立于Carry）
 */
export function applyHolyFlameBonus(unit, activeBuffs, hasSister) {
    unit._holyAtkBonus = 0;
    unit._holyDefBonus = 0;
    if (!activeBuffs || unit.camp !== 'ally') return;
    const holyFlameBuff = activeBuffs.find(b => b.key === 'holyFlame');
    if (!holyFlameBuff) return;
    const cols = holyFlameBuff.cols || (holyFlameBuff.col != null ? [holyFlameBuff.col] : []);
    const rows = holyFlameBuff.rows || (holyFlameBuff.row != null ? [holyFlameBuff.row] : []);
    const baseAtk = unit._baseAtk || unit.atk;
    const baseDef = unit._baseDef || unit.def;
    if (cols.includes(getUnitCol(unit.pos))) unit._holyAtkBonus = Math.floor(baseAtk * C.BUFFS.holyFlame.atkBonus);
    if (rows.includes(getUnitRow(unit.pos))) unit._holyDefBonus = Math.floor(baseDef * C.BUFFS.holyFlame.defBonus);
    if (hasSister && (unit.isXiaoZhaoSister || unit.isXiaoZhaoBrother)) {
        unit._holyAtkBonus += Math.floor(baseAtk * C.BUFFS.holyFlame.atkBonus);
        unit._holyDefBonus += Math.floor(baseDef * C.BUFFS.holyFlame.defBonus);
    }
}

/**
 * 严阵以待绝对值加成（独立于Carry）
 */
export function applyFortifyBonus(unit, activeBuffs) {
    unit._fortifyDefBonus = 0;
    if (unit.role !== '防战' || unit.camp !== 'ally') return;
    if (activeBuffs && activeBuffs.some(b => b.key === 'fortify')) {
        const baseDef = unit._baseDef || unit.def;
        unit._fortifyDefBonus = Math.floor(baseDef * C.BUFFS.fortify.defBonus);
    }
}

/**
 * 应用 carry 加成（绝对值），含激活和清除逻辑
 */
export function applyCarryBonus(unit, A, state, log, stats) {
    if (unit.camp !== 'ally') return;
    const activeBuffs = A._activeBuffs || [];
    const hasCarryActive = hasBuff(activeBuffs, 'carry');
    const sister = A.some(a => a.isXiaoZhaoSister && a.alive);
    const carryPositions = sister ? [4, 5, 6] : [5];

    if (hasCarryActive && carryPositions.includes(unit.pos) && unit._baseMaxHp !== undefined && !unit.isHorse && !unit.isXiaoZhaoSister && !unit.isXiaoZhaoBrother) {
        // carry 生效：先回到基础血上限，再叠加本次 carry 加成
        applyMaxHpChange(unit, unit._baseMaxHp, null, 'carry归位血上限');
        applyStatChange(unit, 'atk', (unit._baseAtk || unit.atk) + (unit._butterflyAtkBonus || 0) - unit.atk, null, 'carry归位');
        applyStatChange(unit, 'def', (unit._baseDef || unit.def) + (unit._butterflyDefBonus || 0) - unit.def, null, 'carry归位');

        const oldCarryAtk = unit._carryAtkBonus || 0;
        const oldCarryDef = unit._carryDefBonus || 0;
        unit._carryAtkBonus = Math.floor(stats.carryAtkAbs);
        unit._carryDefBonus = Math.floor(stats.carryDefAbs);
        unit._carryHpBonus = Math.floor(stats.carryHpAbs);

        const atkDelta = unit._carryAtkBonus - oldCarryAtk;
        const defDelta = unit._carryDefBonus - oldCarryDef;
        if (atkDelta !== 0) applyStatChange(unit, 'atk', atkDelta, null, 'carry激活');
        if (defDelta !== 0) applyStatChange(unit, 'def', defDelta, null, 'carry激活');

        if (unit._carryHpBonus) {
            let newMaxHp = Math.min(unit._baseMaxHp + unit._carryHpBonus, unit._baseMaxHp * 2);
            applyMaxHpChange(unit, newMaxHp, null, 'carry血上限提升');
        }

        if (stats.carryAtkAbs || stats.carryDefAbs || stats.carryHpAbs) {
            log.push({
                factType: FACT_TYPES.CARRY_APPLY,
                data: {
                    unitName: unit.name,
                    atk: stats.carryAtkAbs,
                    def: stats.carryDefAbs,
                    hp: stats.carryHpAbs
                }
            });
        }
    } else if (!unit.isHorse && !hasCarryActive && !unit.isXiaoZhaoSister && !unit.isXiaoZhaoBrother) {
        // carry 消失：清除加成，恢复基值
        if (carryPositions.includes(unit.pos) && (unit._carryAtkBonus || unit._carryDefBonus || unit._carryHpBonus)) {
            if (unit._carryHpBonus) applyMaxHpChange(unit, unit._baseMaxHp, null, 'carry清除血上限');
            const clearAtk = unit._carryAtkBonus || 0;
            const clearDef = unit._carryDefBonus || 0;
            unit._carryAtkBonus = 0;
            unit._carryDefBonus = 0;
            unit._carryHpBonus = 0;
            applyStatChange(unit, 'atk', -clearAtk, null, 'carry清除');
            applyStatChange(unit, 'def', -clearDef, null, 'carry清除');
        }
    }
}

export function computeBuffStats(unit, activeBuffs, allyTeam) {
    let atkBonus = 0, defBonus = 0, dodgeBonus = 0, hpBonus = 0;
    if (!activeBuffs) return { atkBonus, defBonus, dodgeBonus, hpBonus };

    let carryAtkAbs = 0, carryDefAbs = 0, carryHpAbs = 0;
    const hasCarry = hasBuff(activeBuffs, 'carry');
    if (hasCarry && unit.alive && allyTeam) {
        const hasSister = allyTeam.some(u => u.isXiaoZhaoSister && u.alive);
        if (hasSister) {
            const bonus = calcCarryBonus_Sister(unit, allyTeam);
            carryAtkAbs = bonus.atkAbs; carryDefAbs = bonus.defAbs; carryHpAbs = bonus.hpAbs;
        } else {
            const bonus = calcCarryBonus_Normal(unit, allyTeam);
            carryAtkAbs = bonus.atkAbs; carryDefAbs = bonus.defAbs; carryHpAbs = bonus.hpAbs;
        }
    }

    // 严阵以待防御（比率）
    if (hasBuff(activeBuffs, 'fortify') && unit.role === '防战' && unit.camp === 'ally') {
        if (allyTeam && allyTeam.some(u => u.isXiaoZhaoSister && u.alive)) applyFortifyDef_Sister(unit, { defBonus });
        else applyFortifyDef_Normal(unit, { defBonus });
    } else if (unit.isXiaoZhaoBrother && query('xiaoPermanentActive', unit, activeBuffs, 'fortify') && unit.role === '防战') {
        applyFortifyDef_Brother(unit, { defBonus });
    }

    // 流云身法闪避
    if (hasBuff(activeBuffs, 'cloudBody') && unit.camp === 'ally') {
        if (allyTeam && allyTeam.some(u => u.isXiaoZhaoSister && u.alive)) applyCloudBodyDodge_Sister(unit, { dodgeBonus });
        else applyCloudBodyDodge_Normal(unit, { dodgeBonus });
    } else if (unit.isXiaoZhaoBrother && query('xiaoPermanentActive', unit, activeBuffs, 'cloudBody')) {
        applyCloudBodyDodge_Brother(unit, { dodgeBonus });
    }

    // 圣火令（比率）
    const holyFlameTeam = hasBuff(activeBuffs, 'holyFlame');
    if (holyFlameTeam) {
        if (allyTeam && allyTeam.some(u => u.isXiaoZhaoSister && u.alive)) applyHolyFlame_Sister(unit, allyTeam, activeBuffs, { atkBonus, defBonus });
        else applyHolyFlame_Normal(unit, allyTeam, activeBuffs, { atkBonus, defBonus });
    } else if (unit.isXiaoZhaoBrother && query('xiaoPermanentActive', unit, activeBuffs, 'holyFlame')) {
        applyHolyFlame_Brother(unit, allyTeam, activeBuffs, { atkBonus, defBonus });
    }

    return { atkBonus, defBonus, dodgeBonus, hpBonus, carryAtkAbs, carryDefAbs, carryHpAbs };
}

// 攻击前已迁移至事件总线（空壳保留）
export function applyBuffEffectsBeforeAttack(unit, target, allyTeam, enemyTeam, log) {
}

// 攻击后已迁移至事件总线（保留入口）
export function applyBuffEffectsAfterAttack(unit, target, dmg, allySide, enemySide, log) {
}

export function logBuffSummary(allyTeam, log, doubleStrikeUid) {
    let buffs = allyTeam._activeBuffs || [];
    buffs.forEach(b => {
        log.push({ factType: FACT_TYPES.BUFF_SUMMARY, data: { buff: b, allyTeam, doubleStrikeUid } });
    });
}

// Buff-事件注册：嗜血狂刀吸血+姐姐强化额外攻击
export function registerBloodthirst(eventBus) {
    eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.BLOODTHIRST, async (data) => {
        const { unit, target, dmg, allySide, enemySide, log } = data;
        if (!unit.alive || unit.camp !== 'ally') return;
        const unitBuffs = allySide._activeBuffs || [];
        const hasSister = allySide.some(u => u.isXiaoZhaoSister && u.alive);
        const isBrother = unit.isXiaoZhaoBrother;

        if (hasBuff(unitBuffs, 'bloodthirst') && unit.role === '战士' && dmg > 0) {
            const leechVal = Math.floor(dmg * C.BUFFS.bloodthirst.leechRatio);
            const decl = {
                type: EFFECT_TYPES.LEECH,
                value: leechVal,
                source: unit,
                factType: FACT_TYPES.BLOOD_THIRST_LEECH,
                factData: { unitName: unit.name, leechVal, isBrother: false }
            };
            if (!data.declarations) data.declarations = [];
            data.declarations.push(decl);
            if (hasSister && unit.alive && target.alive && !unit._bloodthirstStriked) {
                unit._bloodthirstStriked = true;
                if (!data.extraRequests) data.extraRequests = [];
                data.extraRequests.push({
                    unit,
                    targetUid: target.uid,
                    reason: 'bloodthirst',
                    actedMode: 'allow',
                    priority: 20
                });
            }
        } else if (isBrother && query('xiaoPermanentActive', unit, unitBuffs, 'bloodthirst') && unit.role === '战士') {
            const leechVal = Math.floor(dmg * C.BUFFS.bloodthirst.leechRatio);
            const decl = {
                type: EFFECT_TYPES.LEECH,
                value: leechVal,
                source: unit,
                factType: FACT_TYPES.BLOOD_THIRST_LEECH,
                factData: { unitName: unit.name, leechVal, isBrother: true }
            };
            if (!data.declarations) data.declarations = [];
            data.declarations.push(decl);
        }
    });
}

// Buff-事件注册：热血奋战攻击回血（每N次翻倍）
export function registerHotBlood(eventBus) {
    eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.HOT_BLOOD, (data) => {
        const { unit, dmg, allySide, enemySide, log } = data;
        if (!unit.alive || unit.camp !== 'ally' || unit.hp >= unit.maxHp) return;
        const unitBuffs = allySide._activeBuffs || [];
        const hasSister = allySide.some(u => u.isXiaoZhaoSister && u.alive);
        const isBrother = unit.isXiaoZhaoBrother;

        if (hasBuff(unitBuffs, 'hotBlood')) {
            if (!unit._hotBloodCount) unit._hotBloodCount = 0;
            unit._hotBloodCount++;
            let ratio, tag;
            if (hasSister) {
                const hotEnhance = query('xiaoHexEnhance', allySide, unitBuffs, 'hotBlood');
                const leechPct = hotEnhance ? hotEnhance.leechPct : C.BUFFS.hotBlood.leechRatio;
                const critInterval = hotEnhance ? hotEnhance.critInterval : C.BUFFS.hotBlood.critInterval;
                ratio = (unit._hotBloodCount % critInterval === 0) ? leechPct * 2 : leechPct;
                tag = (unit._hotBloodCount % critInterval === 0) ? '❤️‍🔥 热血奋战(翻倍)' : '❤️ 热血奋战';
            } else {
                ratio = (unit._hotBloodCount % 3 === 0) ? C.BUFFS.hotBlood.critRatio : C.BUFFS.hotBlood.leechRatio;
                tag = (unit._hotBloodCount % 3 === 0) ? '❤️‍🔥 热血奋战(翻倍)' : '❤️ 热血奋战';
            }
            const leech = Math.min(Math.floor((unit.maxHp - unit.hp) * ratio), unit.maxHp - unit.hp);
            if (leech > 0) {
                const decl = {
                    type: EFFECT_TYPES.HEAL,
                    value: leech,
                    source: unit,
                    isDouble: tag.includes('翻倍'),
                    factType: FACT_TYPES.HOT_BLOOD_HEAL,
                    factData: { unitName: unit.name, leech, tag, isBrother: false }
                };
                if (!data.declarations) data.declarations = [];
                data.declarations.push(decl);
            }
        } else if (isBrother && query('xiaoPermanentActive', unit, unitBuffs, 'hotBlood')) {
            if (!unit._hotBloodCount) unit._hotBloodCount = 0;
            unit._hotBloodCount++;
            if (unit.hp < unit.maxHp) {
                const hotEnhance = query('xiaoHexEnhance', allySide, unitBuffs, 'hotBlood');
                const leechPct = hotEnhance ? hotEnhance.leechPct : C.BUFFS.hotBlood.leechRatio;
                const critInterval = hotEnhance ? hotEnhance.critInterval : C.BUFFS.hotBlood.critInterval;
                let ratio = (unit._hotBloodCount % critInterval === 0) ? leechPct * 2 : leechPct;
                const leech = Math.min(Math.floor((unit.maxHp - unit.hp) * ratio), unit.maxHp - unit.hp);
                const tag = (unit._hotBloodCount % 2 === 0) ? '🕷️ 热血(翻倍)' : '🕷️ 热血';
                if (leech > 0) {
                    const decl = {
                        type: EFFECT_TYPES.HEAL,
                        value: leech,
                        source: unit,
                        isDouble: tag.includes('翻倍'),
                        factType: FACT_TYPES.HOT_BLOOD_HEAL,
                        factData: { unitName: unit.name, leech, tag, isBrother: true }
                    };
                    if (!data.declarations) data.declarations = [];
                    data.declarations.push(decl);
                }
            }
        }
    });
}

// Buff-事件注册：乘风突袭飞行波及同行+击退
export function registerWindAssault(eventBus) {
    eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.WIND_ASSAULT, (data) => {
        const { unit, target, dmg, allySide, enemySide, log } = data;
        const rng = getBattleRng();
        if (!unit.alive || unit.camp !== 'ally' || !target || !target.alive) return;
        if (target.camp === unit.camp) return;
        const unitBuffs = allySide._activeBuffs || [];
        const isBrother = unit.isXiaoZhaoBrother;

        const active = hasBuff(unitBuffs, 'windAssault') && unit.role === '飞行';
        const brotherActive = isBrother && unit.role === '飞行' && query('xiaoPermanentActive', unit, unitBuffs, 'windAssault');
        if (!active && !brotherActive) return;

        const enhance = query('xiaoHexEnhance', allySide, unitBuffs, 'windAssault');
        const hitProb = enhance ? Math.floor(enhance.hitProb * 100) : Math.floor(C.BUFFS.windAssault.hitProb * 100);
        const pushProb = enhance ? Math.floor(enhance.pushProb * 100) : Math.floor(C.BUFFS.windAssault.pushProb * 100);
        const label = brotherActive ? '🦋 蝶翼' : '🦅 乘风突袭';

        if (rng.nextInt(1, 100) <= hitProb) {
            const row = getUnitRow(target.pos);
            const rowTargets = enemySide.filter(u => u.alive && getUnitRow(u.pos) === row && u.uid !== target.uid && !(u.state._flyMode === 'butterfly') && !(u.state._flyMode === 'spider') && !u.state._spiderFlying);
            if (rowTargets.length > 0) {
                const splashDmg = Math.floor(dmg);
                const decl = {
                    type: EFFECT_TYPES.SPLASH,
                    value: splashDmg,
                    targets: rowTargets,
                    buffType: 'wind_assault',
                    factType: FACT_TYPES.WIND_ASSAULT_SPLASH,
                    factData: { label, targets: rowTargets, splashDmg }
                };
                if (!data.declarations) data.declarations = [];
                data.declarations.push(decl);
            }
        }

        if (rng.nextInt(1, 100) <= pushProb) {
            const behindPos = target.pos + 3;
            if (behindPos <= 9) {
                const targetTeam = target.camp === 'ally' ? allySide : enemySide;
                const behindUnit = targetTeam.find(u => u.pos === behindPos && u.alive);
                const oldPos = target.pos;
                if (behindUnit) {
                    const behindOldPos = behindUnit.pos;
                    swapUnitPositions(target, behindUnit);
                    log.push({
                        factType: FACT_TYPES.WIND_ASSAULT_PUSH,
                        data: { label, target, behindUnit, oldPos, behindPos, behindOldPos }
                    });
                } else {
                    moveUnitPosition(target, behindPos);
                    log.push({
                        factType: FACT_TYPES.WIND_ASSAULT_PUSH,
                        data: { label, target, behindUnit: null, oldPos, behindPos }
                    });
                }
            }
        } else {
            log.push({ factType: FACT_TYPES.WIND_ASSAULT_FAIL, data: { label, reason: '击退触发失败' } });
        }

        eventBus.emit('onPositionSwap', { allySide, enemySide, log });
    });
}

// Buff-事件注册：流星赶月远程伤害加深+溅射降防
export function registerMeteorShower(eventBus) {
    eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.METEOR_SHOWER, (data) => {
        const { unit, target, dmg, allySide, enemySide, log } = data;
        if (!unit.alive || unit.camp !== 'ally' || !target || !target.alive) return;
        const unitBuffs = allySide._activeBuffs || [];
        const hasSister = allySide.some(u => u.isXiaoZhaoSister && u.alive);
        const isBrother = unit.isXiaoZhaoBrother;

        const active = hasBuff(unitBuffs, 'meteorShower') && unit.role === '远程';
        const brotherActive = isBrother && unit.role === '远程' && query('xiaoPermanentActive', unit, unitBuffs, 'meteorShower');
        if (!active && !brotherActive) return;

        const label = brotherActive ? '🦋 蝶星' : '☄️ 流星赶月';

        const bonusDmg = Math.floor(dmg * C.BUFFS.meteorShower.bonusRatio);
        if (!data.declarations) data.declarations = [];
        data.declarations.push({
            type: EFFECT_TYPES.STAT_CHANGE,
            field: 'def',
            delta: -(C.BUFFS.meteorShower.mainDefReduce || 2),
            target: target,
            reason: '流星赶月',
            logText: null
        });
        data.declarations.push({
            type: EFFECT_TYPES.BONUS_DMG,
            value: bonusDmg,
            target: target,
            buffType: 'meteor_bonus',
            factType: FACT_TYPES.METEOR_SHOWER_MAIN,
            factData: { label, targetName: target.name, bonusDmg, defReduce: C.BUFFS.meteorShower.mainDefReduce || 2 }
        });

        const splashDmg = Math.floor(dmg * C.BUFFS.meteorShower.splashRatio);
        const adjPositions = getAdjacentPositions(target.pos);
        const splashSide = target.camp === unit.camp ? allySide : enemySide;
        const splashTargets = splashSide.filter(u => u.alive && adjPositions.includes(u.pos) && !(u.state._flyMode === 'butterfly') && !(u.state._flyMode === 'spider') && !u.state._spiderFlying);
        if (splashTargets.length > 0) {
            const decl = {
                type: EFFECT_TYPES.SPLASH,
                value: splashDmg,
                targets: splashTargets,
                buffType: 'meteor_splash',
                attackerUid: unit.uid,
                primaryUid: target.uid,
                splashUids: splashTargets.map(st => st.uid),
                splashDmg: splashDmg,
                factType: FACT_TYPES.METEOR_SHOWER_SPLASH,
                factData: { label, targets: splashTargets, splashDmg, defReduce: C.BUFFS.meteorShower.splashDefReduce || 1 }
            };
            data.declarations.push(decl);
            for (const st of splashTargets) {
                data.declarations.push({
                    type: EFFECT_TYPES.STAT_CHANGE,
                    field: 'def',
                    delta: -(C.BUFFS.meteorShower.splashDefReduce || 1),
                    target: st,
                    reason: '流星溅射',
                    logText: null
                });
            }
        }
    });
}

// Buff-事件注册：惑人心智最前排换位扰乱
export function registerMindControl(eventBus) {
    eventBus.on('afterAttack', L.AFTER_ATTACK.MIND_CONTROL, (data) => {
        const { unit, allySide, enemySide, log } = data;
        if (!unit.alive || unit.camp !== 'ally') return;
        const buffs = allySide._activeBuffs || [];
        const hasSister = allySide.some(u => u.isXiaoZhaoSister && u.alive);

        if (hasBuff(buffs, 'mindControl') && !allySide._mindControlTriggered) {
            allySide._mindControlTriggered = true;
            if (hasSister) applyMindControl_Sister(unit, allySide, enemySide, log);
            else applyMindControl_Normal(unit, allySide, enemySide, log);
        }
    });
}

// Buff 声明化装配器：按 gameData.buffs 中每个 buff 的 effects 声明注册对应处理器
// 新增 buff 的数值和 effects 只需改 JSON；只有全新逻辑才需要新增处理器函数
export function installBuffMechanics(eventBus) {
    const gd = getGameData();
    if (!gd || !gd.buffs) return;
    const processors = {
        bloodthirstLeech: registerBloodthirst,
        hotBloodHeal: registerHotBlood,
        windAssaultSplash: registerWindAssault,
        meteorShowerMain: registerMeteorShower,
        mindControlSwap: registerMindControl
    };
    for (const buff of Object.values(gd.buffs)) {
        if (!buff.effects || !Array.isArray(buff.effects)) continue;
        for (const effectName of buff.effects) {
            const install = processors[effectName];
            if (install) install(eventBus);
        }
    }
}