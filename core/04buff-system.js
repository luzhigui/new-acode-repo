// V6.0.0 | ~27900 bytes | 2026-08-24 删除断头的精通查询链（精通已在蛛变首次掌握时增量结算）
// V6.0.0 | 2026-09-07 属性词条化：computeBuffStats 不再产生 stats 对象，圣火令/严阵以待/carry 走 addMod
export const VER = 'core/04buff-system.js V6.0.0';
import {
    applyFortifyDef_Normal, applyFortifyDef_Sister, applyFortifyDef_Brother,
    applyCloudBodyDodge_Normal, applyCloudBodyDodge_Sister, applyCloudBodyDodge_Brother,
    applyHolyFlame_Normal, applyHolyFlame_Sister, applyHolyFlame_Brother,
    calcCarryBonus_Normal, calcCarryBonus_Sister,
    applyMindControl_Normal, applyMindControl_Sister
} from './14buff-effects.js';
import { CONFIG, getGameData } from './01config-5v5-test.js';
import { hasBuff, getUnitRow, getUnitCol, getAdjacentPositions } from './03battle-utils.js';
import { emitEvent, applyStatChange, applyMaxHpChange, query, getBattleRng, swapUnitPositions, moveUnitPosition, addMod, getStat } from './13battle-shared.js';
import { eventBus, EXECUTION_LAYER as L, EFFECT_TYPES, registerSettlementHook } from '../infra/50-event-bus.js';
import { FACT_TYPES, BUFF_TYPES, BUFF_SUBTYPES, UNIT_EVENT_TYPES, CAMP_TYPES, ROLE_TYPES, SIGNAL_TYPES } from '../infra/56-battle-enums.js';
const C = CONFIG;

export function applyHolyFlameBonus(unit, activeBuffs, hasSister) {
    const holyFlameBuff = activeBuffs.find(b => b.key === BUFF_TYPES.HOLY_FLAME);
    if (!holyFlameBuff || unit.camp !== CAMP_TYPES.ALLY) return;
    if (hasSister) applyHolyFlame_Sister(unit, null, activeBuffs);
    else applyHolyFlame_Normal(unit, null, activeBuffs);
}

export function applyFortifyBonus(unit, activeBuffs) {
    if (unit.role !== ROLE_TYPES.DEFENDER || unit.camp !== CAMP_TYPES.ALLY) return;
    if (activeBuffs.some(b => b.key === BUFF_TYPES.FORTIFY)) {
        applyFortifyDef_Normal(unit);
    }
}

export function applyCarryBonus(unit, A, state, log) {
    if (unit.camp !== CAMP_TYPES.ALLY) return;
    const activeBuffs = A._activeBuffs || [];
    const hasCarryActive = hasBuff(activeBuffs, BUFF_TYPES.CARRY);
    const sister = A.some(a => a.isXiaoZhaoSister && a.alive);
    const carryPositions = sister ? [4, 5, 6] : [5];
    if (hasCarryActive && carryPositions.includes(unit.pos) && !unit.isHorse && !unit.isXiaoZhaoSister && !unit.isXiaoZhaoBrother) {
        const bonus = sister ? calcCarryBonus_Sister(unit, A) : calcCarryBonus_Normal(unit, A);
        if (bonus.atkAbs) addMod(unit, 'atk', { source: 'carry', value: bonus.atkAbs, ttl: 'round', op: 'add', group: 'carry' });
        if (bonus.defAbs) addMod(unit, 'def', { source: 'carry', value: bonus.defAbs, ttl: 'round', op: 'add', group: 'carry' });
        if (bonus.hpAbs) addMod(unit, 'maxHp', { source: 'carry', value: bonus.hpAbs, ttl: 'round', op: 'add', group: 'carry' });
        log.push({ factType: FACT_TYPES.CARRY_APPLY, data: { unitName: unit.name, atk: bonus.atkAbs, def: bonus.defAbs, hp: bonus.hpAbs } });
    }
}

export function computeBuffStats(unit, activeBuffs, allyTeam) {
    // 词条系统下，攻防由 getStat 统一计算；此处只保留闪避率计算
    let dodgeBonus = 0;
    if (hasBuff(activeBuffs, BUFF_TYPES.CLOUD_BODY) && unit.camp === CAMP_TYPES.ALLY) {
        if (allyTeam && allyTeam.some(u => u.isXiaoZhaoSister && u.alive)) dodgeBonus = applyCloudBodyDodge_Sister();
        else dodgeBonus = applyCloudBodyDodge_Normal();
    } else if (unit.isXiaoZhaoBrother && query('xiaoPermanentActive', unit, activeBuffs, BUFF_TYPES.CLOUD_BODY)) {
        dodgeBonus = applyCloudBodyDodge_Brother();
    }
    return { atkBonus: 0, defBonus: 0, dodgeBonus, hpBonus: 0, carryAtkAbs: 0, carryDefAbs: 0, carryHpAbs: 0 };
}

export function logBuffSummary(allyTeam, log, doubleStrikeUid) {
    let buffs = allyTeam._activeBuffs || [];
    buffs.forEach(b => {
        log.push({ factType: FACT_TYPES.BUFF_SUMMARY, data: { buff: b, allyTeam, doubleStrikeUid } });
    });
}

// 嗜血狂刀：战士攻击吸血
export function submitBloodthirstDeclaration(data) {
    const { unit, target, dmg, allySide, enemySide, log } = data;
    if (!unit.alive || unit.camp !== CAMP_TYPES.ALLY) return;
    const unitBuffs = allySide._activeBuffs || [];
    const hasSister = allySide.some(u => u.isXiaoZhaoSister && u.alive);
    const isBrother = unit.isXiaoZhaoBrother;

    if (hasBuff(unitBuffs, BUFF_TYPES.BLOODTHIRST) && unit.role === ROLE_TYPES.WARRIOR && dmg > 0) {
        const leechVal = Math.floor(dmg * C.BUFFS.bloodthirst.leechRatio);
        const decl = { type: EFFECT_TYPES.LEECH, value: leechVal, source: unit, factType: FACT_TYPES.BLOOD_THIRST_LEECH, factData: { unitName: unit.name, leechVal, isBrother: false, unitUid: unit.uid } };
        if (!data.declarations) data.declarations = [];
        data.declarations.push(decl);
        if (hasSister && unit.alive && target.alive && !unit._bloodthirstStriked) {
            unit._bloodthirstStriked = true;
            if (!data.extraRequests) data.extraRequests = [];
            data.extraRequests.push({ unit, targetUid: target.uid, reason: 'bloodthirst', actedMode: 'allow', priority: 20 });
        }
    } else if (isBrother && query('xiaoPermanentActive', unit, unitBuffs, BUFF_TYPES.BLOODTHIRST) && unit.role === ROLE_TYPES.WARRIOR) {
        const leechVal = Math.floor(dmg * C.BUFFS.bloodthirst.leechRatio);
        if (!data.declarations) data.declarations = [];
        data.declarations.push({ type: EFFECT_TYPES.LEECH, value: leechVal, source: unit, factType: FACT_TYPES.BLOOD_THIRST_LEECH, factData: { unitName: unit.name, leechVal, isBrother: true, unitUid: unit.uid } });
    }
}

export function registerBloodthirst(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.BLOODTHIRST,
        handler: (data) => { submitBloodthirstDeclaration(data); }
    });
}

// 热血奋战：攻击后回复已损失生命
export function submitHotBloodDeclaration(data) {
    const { unit, dmg, allySide, enemySide, log } = data;
    if (!unit.alive || unit.camp !== CAMP_TYPES.ALLY || unit.hp >= unit.maxHp) return;
    const unitBuffs = allySide._activeBuffs || [];
    const hasSister = allySide.some(u => u.isXiaoZhaoSister && u.alive);
    const isBrother = unit.isXiaoZhaoBrother;
    // 热血奋战仅在持有该 buff 或小昭·妹永久海克斯激活时触发
    const active = hasBuff(unitBuffs, BUFF_TYPES.HOT_BLOOD);
    const brotherActive = isBrother && query('xiaoPermanentActive', unit, unitBuffs, BUFF_TYPES.HOT_BLOOD);
    if (!active && !brotherActive) return;
    const leechPct = hasSister ? (query('xiaoHexEnhance', allySide, unitBuffs, BUFF_TYPES.HOT_BLOOD)?.leechPct || C.BUFFS.hotBlood.leechRatio) : C.BUFFS.hotBlood.leechRatio;
    Object.assign(unit.state, { _hotBloodCount: (unit.state._hotBloodCount || 0) + 1 });
    const critInterval = hasSister ? (query('xiaoHexEnhance', allySide, unitBuffs, BUFF_TYPES.HOT_BLOOD)?.critInterval || 3) : 3;
    const isDouble = unit.state._hotBloodCount % critInterval === 0;
    const ratio = isDouble ? leechPct * 2 : leechPct;
    const leech = Math.min(Math.floor((unit.maxHp - unit.hp) * ratio), unit.maxHp - unit.hp);
    if (leech > 0) {
        if (!data.declarations) data.declarations = [];
        data.declarations.push({ type: EFFECT_TYPES.HEAL, value: leech, source: unit, isDouble, factType: FACT_TYPES.HOT_BLOOD_HEAL, factData: { unitName: unit.name, leech, tag: isDouble ? '❤️‍🔥 热血奋战(翻倍)' : '❤️ 热血奋战', isBrother, unitUid: unit.uid } });
    }
}

export function registerHotBlood(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.HOT_BLOOD,
        handler: (data) => { submitHotBloodDeclaration(data); }
    });
}

// 乘风突袭：飞行单位攻击时波及同行 + 概率击退
export function submitWindAssaultDeclaration(data) {
    const { unit, target, dmg, allySide, enemySide, log } = data;
    const rng = getBattleRng();
    if (!unit.alive || unit.camp !== CAMP_TYPES.ALLY || !target || !target.alive) return;
    if (target.camp === unit.camp) return;
    const unitBuffs = allySide._activeBuffs || [];
    const active = hasBuff(unitBuffs, BUFF_TYPES.WIND_ASSAULT) && unit.role === ROLE_TYPES.FLYER;
    const brotherActive = unit.isXiaoZhaoBrother && unit.role === ROLE_TYPES.FLYER && query('xiaoPermanentActive', unit, unitBuffs, BUFF_TYPES.WIND_ASSAULT);
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
            if (!data.declarations) data.declarations = [];
            data.declarations.push({ type: EFFECT_TYPES.SPLASH, value: splashDmg, targets: rowTargets, buffType: BUFF_SUBTYPES.WIND_ASSAULT, factType: FACT_TYPES.WIND_ASSAULT_SPLASH, factData: { label, targets: rowTargets, splashDmg } });
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
                log.push({ factType: FACT_TYPES.WIND_ASSAULT_PUSH, data: { label, target, behindUnit, oldPos, behindPos, behindOldPos } });
            } else {
                moveUnitPosition(target, behindPos);
                log.push({ factType: FACT_TYPES.WIND_ASSAULT_PUSH, data: { label, target, behindUnit: null, oldPos, behindPos } });
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
        handler: (data) => { submitWindAssaultDeclaration(data); }
    });
}

// 流星赶月：远程攻击加深 + 溅射 + 降防
export function submitMeteorShowerDeclaration(data) {
    const { unit, target, dmg, allySide, enemySide, log } = data;
    if (!unit.alive || unit.camp !== CAMP_TYPES.ALLY || !target || !target.alive) return;
    const unitBuffs = allySide._activeBuffs || [];
    const isBrother = unit.isXiaoZhaoBrother;
    const active = hasBuff(unitBuffs, BUFF_TYPES.METEOR_SHOWER) && unit.role === ROLE_TYPES.RANGED;
    const brotherActive = isBrother && unit.role === ROLE_TYPES.RANGED && query('xiaoPermanentActive', unit, unitBuffs, BUFF_TYPES.METEOR_SHOWER);
    if (!active && !brotherActive) return;
    const label = brotherActive ? '🦋 蝶星' : '☄️ 流星赶月';
    const bonusDmg = Math.floor(dmg * C.BUFFS.meteorShower.bonusRatio);
    if (!data.declarations) data.declarations = [];
    data.declarations.push({ type: EFFECT_TYPES.STAT_CHANGE, field: 'def', delta: -(C.BUFFS.meteorShower.mainDefReduce || 2), target, reason: '流星赶月', logText: null });
    data.declarations.push({ type: EFFECT_TYPES.BONUS_DMG, value: bonusDmg, target, buffType: BUFF_SUBTYPES.METEOR_BONUS, factType: FACT_TYPES.METEOR_SHOWER_MAIN, factData: { label, targetName: target.name, bonusDmg, defReduce: C.BUFFS.meteorShower.mainDefReduce || 2 } });
    const splashDmg = Math.floor(dmg * C.BUFFS.meteorShower.splashRatio);
    const adjPositions = getAdjacentPositions(target.pos);
    const splashSide = target.camp === unit.camp ? allySide : enemySide;
    const splashTargets = splashSide.filter(u => u.alive && adjPositions.includes(u.pos) && !(u.state._flyMode === 'butterfly') && !(u.state._flyMode === 'spider') && !u.state._spiderFlying);
    if (splashTargets.length > 0) {
        data.declarations.push({ type: EFFECT_TYPES.SPLASH, value: splashDmg, targets: splashTargets, buffType: BUFF_SUBTYPES.METEOR_SPLASH, attackerUid: unit.uid, primaryUid: target.uid, splashUids: splashTargets.map(st => st.uid), splashDmg, factType: FACT_TYPES.METEOR_SHOWER_SPLASH, factData: { label, targets: splashTargets, splashDmg, defReduce: C.BUFFS.meteorShower.splashDefReduce || 1 } });
        for (const st of splashTargets) {
            data.declarations.push({ type: EFFECT_TYPES.STAT_CHANGE, field: 'def', delta: -(C.BUFFS.meteorShower.splashDefReduce || 1), target: st, reason: '流星溅射', logText: null });
        }
    }
}

export function registerMeteorShower(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.METEOR_SHOWER,
        handler: (data) => { submitMeteorShowerDeclaration(data); }
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

// Buff 声明化装配器
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