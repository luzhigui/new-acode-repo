// V5.6.0 | ~27900 bytes | 2026-08-24 删除断头的精通查询链（精通已在蛛变首次掌握时增量结算）
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
import { eventBus, EXECUTION_LAYER as L, EFFECT_TYPES, registerSettlementHook } from '../infra/50-event-bus.js';
import { FACT_TYPES, BUFF_TYPES, BUFF_SUBTYPES, UNIT_EVENT_TYPES, CAMP_TYPES, ROLE_TYPES, SIGNAL_TYPES } from '../infra/56-battle-enums.js';
const C = CONFIG;

/**
 * 圣火令绝对值加成（独立于Carry）
 */
export function applyHolyFlameBonus(unit, activeBuffs, hasSister) {
    unit.state._holyAtkBonus = 0;
    unit.state._holyDefBonus = 0;
    if (!activeBuffs || unit.camp !== CAMP_TYPES.ALLY) return;
    const holyFlameBuff = activeBuffs.find(b => b.key === BUFF_TYPES.HOLY_FLAME);
    if (!holyFlameBuff) return;
    const cols = holyFlameBuff.cols || (holyFlameBuff.col != null ? [holyFlameBuff.col] : []);
    const rows = holyFlameBuff.rows || (holyFlameBuff.row != null ? [holyFlameBuff.row] : []);
    const baseAtk = unit._baseAtk || unit.atk;
    const baseDef = unit._baseDef || unit.def;
    if (cols.includes(getUnitCol(unit.pos))) unit.state._holyAtkBonus = Math.floor(baseAtk * C.BUFFS.holyFlame.atkBonus);
    if (rows.includes(getUnitRow(unit.pos))) unit.state._holyDefBonus = Math.floor(baseDef * C.BUFFS.holyFlame.defBonus);
    if (hasSister && (unit.isXiaoZhaoSister || unit.isXiaoZhaoBrother)) {
        unit.state._holyAtkBonus += Math.floor(baseAtk * C.BUFFS.holyFlame.atkBonus);
        unit.state._holyDefBonus += Math.floor(baseDef * C.BUFFS.holyFlame.defBonus);
    }
}

/**
 * 严阵以待绝对值加成（独立于Carry）
 */
export function applyFortifyBonus(unit, activeBuffs) {
    unit.state._fortifyDefBonus = 0;
    if (unit.role !== ROLE_TYPES.DEFENDER || unit.camp !== CAMP_TYPES.ALLY) return;
    if (activeBuffs && activeBuffs.some(b => b.key === BUFF_TYPES.FORTIFY)) {
        const baseDef = unit._baseDef || unit.def;
        unit.state._fortifyDefBonus = Math.floor(baseDef * C.BUFFS.fortify.defBonus);
    }
}

/**
 * 应用 carry 加成（绝对值），含激活和清除逻辑
 */
export function applyCarryBonus(unit, A, state, log, stats) {
    if (unit.camp !== CAMP_TYPES.ALLY) return;
    const activeBuffs = A._activeBuffs || [];
    const hasCarryActive = hasBuff(activeBuffs, BUFF_TYPES.CARRY);
    const sister = A.some(a => a.isXiaoZhaoSister && a.alive);
    const carryPositions = sister ? [4, 5, 6] : [5];

    if (hasCarryActive && carryPositions.includes(unit.pos) && unit._baseMaxHp !== undefined && !unit.isHorse && !unit.isXiaoZhaoSister && !unit.isXiaoZhaoBrother) {
        // carry 生效：先回到基础血上限，再叠加本次 carry 加成
        applyMaxHpChange(unit, unit._baseMaxHp, null, 'carry归位血上限');
        applyStatChange(unit, 'atk', (unit._baseAtk || unit.atk) + (unit.state._butterflyAtkBonus || 0) - unit.atk, null, 'carry归位');
        applyStatChange(unit, 'def', (unit._baseDef || unit.def) + (unit.state._butterflyDefBonus || 0) - unit.def, null, 'carry归位');

        const es = unit.state;
        const oldCarryAtk = es._carryAtkBonus || 0;
        const oldCarryDef = es._carryDefBonus || 0;
        Object.assign(es, { _carryAtkBonus: Math.floor(stats.carryAtkAbs), _carryDefBonus: Math.floor(stats.carryDefAbs), _carryHpBonus: Math.floor(stats.carryHpAbs) });

        const atkDelta = es._carryAtkBonus - oldCarryAtk;
        const defDelta = es._carryDefBonus - oldCarryDef;
        if (atkDelta !== 0) applyStatChange(unit, 'atk', atkDelta, null, 'carry激活');
        if (defDelta !== 0) applyStatChange(unit, 'def', defDelta, null, 'carry激活');

        if (es._carryHpBonus) {
            let newMaxHp = Math.min(unit._baseMaxHp + es._carryHpBonus, unit._baseMaxHp * 2);
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
        if (carryPositions.includes(unit.pos) && (unit.state._carryAtkBonus || unit.state._carryDefBonus || unit.state._carryHpBonus)) {
            if (unit.state._carryHpBonus) applyMaxHpChange(unit, unit._baseMaxHp, null, 'carry清除血上限');
            const es = unit.state;
            const clearAtk = es._carryAtkBonus || 0;
            const clearDef = es._carryDefBonus || 0;
            Object.assign(es, { _carryAtkBonus: 0, _carryDefBonus: 0, _carryHpBonus: 0 });
            applyStatChange(unit, 'atk', -clearAtk, null, 'carry清除');
            applyStatChange(unit, 'def', -clearDef, null, 'carry清除');
        }
    }
}

export function computeBuffStats(unit, activeBuffs, allyTeam) {
    let atkBonus = 0, defBonus = 0, dodgeBonus = 0, hpBonus = 0;
    if (!activeBuffs) return { atkBonus, defBonus, dodgeBonus, hpBonus };

    let carryAtkAbs = 0, carryDefAbs = 0, carryHpAbs = 0;
    const hasCarry = hasBuff(activeBuffs, BUFF_TYPES.CARRY);
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
    if (hasBuff(activeBuffs, BUFF_TYPES.FORTIFY) && unit.role === ROLE_TYPES.DEFENDER && unit.camp === CAMP_TYPES.ALLY) {
        if (allyTeam && allyTeam.some(u => u.isXiaoZhaoSister && u.alive)) applyFortifyDef_Sister(unit, { defBonus });
        else applyFortifyDef_Normal(unit, { defBonus });
    } else if (unit.isXiaoZhaoBrother && query('xiaoPermanentActive', unit, activeBuffs, BUFF_TYPES.FORTIFY) && unit.role === ROLE_TYPES.DEFENDER) {
        applyFortifyDef_Brother(unit, { defBonus });
    }

    // 流云身法闪避
    if (hasBuff(activeBuffs, BUFF_TYPES.CLOUD_BODY) && unit.camp === CAMP_TYPES.ALLY) {
        if (allyTeam && allyTeam.some(u => u.isXiaoZhaoSister && u.alive)) applyCloudBodyDodge_Sister(unit, { dodgeBonus });
        else applyCloudBodyDodge_Normal(unit, { dodgeBonus });
    } else if (unit.isXiaoZhaoBrother && query('xiaoPermanentActive', unit, activeBuffs, BUFF_TYPES.CLOUD_BODY)) {
        applyCloudBodyDodge_Brother(unit, { dodgeBonus });
    }

    // 圣火令（比率）
    const holyFlameTeam = hasBuff(activeBuffs, BUFF_TYPES.HOLY_FLAME);
    if (holyFlameTeam) {
        if (allyTeam && allyTeam.some(u => u.isXiaoZhaoSister && u.alive)) applyHolyFlame_Sister(unit, allyTeam, activeBuffs, { atkBonus, defBonus });
        else applyHolyFlame_Normal(unit, allyTeam, activeBuffs, { atkBonus, defBonus });
    } else if (unit.isXiaoZhaoBrother && query('xiaoPermanentActive', unit, activeBuffs, BUFF_TYPES.HOLY_FLAME)) {
        applyHolyFlame_Brother(unit, allyTeam, activeBuffs, { atkBonus, defBonus });
    }

    return { atkBonus, defBonus, dodgeBonus, hpBonus, carryAtkAbs, carryDefAbs, carryHpAbs };
}

export function logBuffSummary(allyTeam, log, doubleStrikeUid) {
    let buffs = allyTeam._activeBuffs || [];
    buffs.forEach(b => {
        log.push({ factType: FACT_TYPES.BUFF_SUMMARY, data: { buff: b, allyTeam, doubleStrikeUid } });
    });
}

// 嗜血狂刀：战士攻击吸血，姐姐在场时额外攻击一次
// 判定与声明分离：本函数只提交 EFFECT_TYPES.LEECH 声明，
// 实际改状态由 16effect-handlers 的 LEECH 处理器统一执行
export function submitBloodthirstDeclaration(data) {
    const { unit, target, dmg, allySide, enemySide, log } = data;
    if (!unit.alive || unit.camp !== CAMP_TYPES.ALLY) return;
    const unitBuffs = allySide._activeBuffs || [];
    const hasSister = allySide.some(u => u.isXiaoZhaoSister && u.alive);
    const isBrother = unit.isXiaoZhaoBrother;

    if (hasBuff(unitBuffs, BUFF_TYPES.BLOODTHIRST) && unit.role === ROLE_TYPES.WARRIOR && dmg > 0) {
        const leechVal = Math.floor(dmg * C.BUFFS.bloodthirst.leechRatio);
        const decl = {
            type: EFFECT_TYPES.LEECH,
            value: leechVal,
            source: unit,
            factType: FACT_TYPES.BLOOD_THIRST_LEECH,
            factData: { unitName: unit.name, leechVal, isBrother: false, unitUid: unit.uid }
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
    } else if (isBrother && query('xiaoPermanentActive', unit, unitBuffs, BUFF_TYPES.BLOODTHIRST) && unit.role === ROLE_TYPES.WARRIOR) {
        const leechVal = Math.floor(dmg * C.BUFFS.bloodthirst.leechRatio);
        const decl = {
            type: EFFECT_TYPES.LEECH,
            value: leechVal,
            source: unit,
            factType: FACT_TYPES.BLOOD_THIRST_LEECH,
            factData: { unitName: unit.name, leechVal, isBrother: true, unitUid: unit.uid }
        };
        if (!data.declarations) data.declarations = [];
        data.declarations.push(decl);
    }
}

export function registerBloodthirst(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.BLOODTHIRST,
        handler: (data) => {
            submitBloodthirstDeclaration(data);
        }
    });
}

// 热血奋战：攻击后回复已损失生命，每第 3 次翻倍
export function submitHotBloodDeclaration(data) {
    const { unit, dmg, allySide, enemySide, log } = data;
    if (!unit.alive || unit.camp !== CAMP_TYPES.ALLY || unit.hp >= unit.maxHp) return;
    const unitBuffs = allySide._activeBuffs || [];
    const hasSister = allySide.some(u => u.isXiaoZhaoSister && u.alive);
    const isBrother = unit.isXiaoZhaoBrother;

    if (hasBuff(unitBuffs, BUFF_TYPES.HOT_BLOOD)) {
        Object.assign(unit.state, { _hotBloodCount: unit.state._hotBloodCount + 1 });
        let ratio, tag;
        if (hasSister) {
            const hotEnhance = query('xiaoHexEnhance', allySide, unitBuffs, BUFF_TYPES.HOT_BLOOD);
            const leechPct = hotEnhance ? hotEnhance.leechPct : C.BUFFS.hotBlood.leechRatio;
            const critInterval = hotEnhance ? hotEnhance.critInterval : C.BUFFS.hotBlood.critInterval;
            ratio = (unit.state._hotBloodCount % critInterval === 0) ? leechPct * 2 : leechPct;
            tag = (unit.state._hotBloodCount % critInterval === 0) ? '❤️‍🔥 热血奋战(翻倍)' : '❤️ 热血奋战';
        } else {
            ratio = (unit.state._hotBloodCount % 3 === 0) ? C.BUFFS.hotBlood.critRatio : C.BUFFS.hotBlood.leechRatio;
            tag = (unit.state._hotBloodCount % 3 === 0) ? '❤️‍🔥 热血奋战(翻倍)' : '❤️ 热血奋战';
        }
        const leech = Math.min(Math.floor((unit.maxHp - unit.hp) * ratio), unit.maxHp - unit.hp);
        if (leech > 0) {
            const decl = {
                type: EFFECT_TYPES.HEAL,
                value: leech,
                source: unit,
                isDouble: tag.includes('翻倍'),
                factType: FACT_TYPES.HOT_BLOOD_HEAL,
                factData: { unitName: unit.name, leech, tag, isBrother: false, unitUid: unit.uid }
            };
            if (!data.declarations) data.declarations = [];
            data.declarations.push(decl);
        }
    } else if (isBrother && query('xiaoPermanentActive', unit, unitBuffs, BUFF_TYPES.HOT_BLOOD)) {
        Object.assign(unit.state, { _hotBloodCount: unit.state._hotBloodCount + 1 });
        if (unit.hp < unit.maxHp) {
            const hotEnhance = query('xiaoHexEnhance', allySide, unitBuffs, BUFF_TYPES.HOT_BLOOD);
            const leechPct = hotEnhance ? hotEnhance.leechPct : C.BUFFS.hotBlood.leechRatio;
            const critInterval = hotEnhance ? hotEnhance.critInterval : C.BUFFS.hotBlood.critInterval;
            let ratio = (unit.state._hotBloodCount % critInterval === 0) ? leechPct * 2 : leechPct;
            const leech = Math.min(Math.floor((unit.maxHp - unit.hp) * ratio), unit.maxHp - unit.hp);
            const tag = (unit.state._hotBloodCount % 2 === 0) ? '🕷️ 热血(翻倍)' : '🕷️ 热血';
            if (leech > 0) {
                const decl = {
                    type: EFFECT_TYPES.HEAL,
                    value: leech,
                    source: unit,
                    isDouble: tag.includes('翻倍'),
                    factType: FACT_TYPES.HOT_BLOOD_HEAL,
                    factData: { unitName: unit.name, leech, tag, isBrother: true, unitUid: unit.uid }
                };
                if (!data.declarations) data.declarations = [];
                data.declarations.push(decl);
            }
        }
    }
}

export function registerHotBlood(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.HOT_BLOOD,
        handler: (data) => {
            submitHotBloodDeclaration(data);
        }
    });
}

// 乘风突袭：飞行单位攻击时波及同行 + 概率击退
export function submitWindAssaultDeclaration(data) {
    const { unit, target, dmg, allySide, enemySide, log } = data;
    const rng = getBattleRng();
    if (!unit.alive || unit.camp !== CAMP_TYPES.ALLY || !target || !target.alive) return;
    if (target.camp === unit.camp) return;
    const unitBuffs = allySide._activeBuffs || [];
    const isBrother = unit.isXiaoZhaoBrother;

    const active = hasBuff(unitBuffs, BUFF_TYPES.WIND_ASSAULT) && unit.role === ROLE_TYPES.FLYER;
    const brotherActive = isBrother && unit.role === ROLE_TYPES.FLYER && query('xiaoPermanentActive', unit, unitBuffs, BUFF_TYPES.WIND_ASSAULT);
    if (!active && !brotherActive) return;

    const enhance = query('xiaoHexEnhance', allySide, unitBuffs, BUFF_TYPES.WIND_ASSAULT);
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
                buffType: BUFF_SUBTYPES.WIND_ASSAULT,
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
            const targetTeam = target.camp === CAMP_TYPES.ALLY ? allySide : enemySide;
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

    eventBus.emit(SIGNAL_TYPES.ON_POSITION_SWAP, { allySide, enemySide, log });
}

export function registerWindAssault(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.WIND_ASSAULT,
        handler: (data) => {
            submitWindAssaultDeclaration(data);
        }
    });
}

// 流星赶月：远程攻击加深 + 溅射 + 降防
export function submitMeteorShowerDeclaration(data) {
    const { unit, target, dmg, allySide, enemySide, log } = data;
    if (!unit.alive || unit.camp !== CAMP_TYPES.ALLY || !target || !target.alive) return;
    const unitBuffs = allySide._activeBuffs || [];
    const hasSister = allySide.some(u => u.isXiaoZhaoSister && u.alive);
    const isBrother = unit.isXiaoZhaoBrother;

    const active = hasBuff(unitBuffs, BUFF_TYPES.METEOR_SHOWER) && unit.role === ROLE_TYPES.RANGED;
    const brotherActive = isBrother && unit.role === ROLE_TYPES.RANGED && query('xiaoPermanentActive', unit, unitBuffs, BUFF_TYPES.METEOR_SHOWER);
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
        buffType: BUFF_SUBTYPES.METEOR_BONUS,
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
            buffType: BUFF_SUBTYPES.METEOR_SPLASH,
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
}

export function registerMeteorShower(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.METEOR_SHOWER,
        handler: (data) => {
            submitMeteorShowerDeclaration(data);
        }
    });
}

// 惑人心智：最前排攻击后扰乱双方换位
export function registerMindControl(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_ATTACK,
        priority: L.AFTER_ATTACK.MIND_CONTROL,
        handler: (data) => {
            const { unit, allySide, enemySide, log } = data;
            if (!unit.alive || unit.camp !== CAMP_TYPES.ALLY) return;
            const buffs = allySide._activeBuffs || [];
            const hasSister = allySide.some(u => u.isXiaoZhaoSister && u.alive);

            if (hasBuff(buffs, BUFF_TYPES.MIND_CONTROL) && !allySide._mindControlTriggered) {
                allySide._mindControlTriggered = true;
                if (hasSister) applyMindControl_Sister(unit, allySide, enemySide, log);
                else applyMindControl_Normal(unit, allySide, enemySide, log);
            }
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