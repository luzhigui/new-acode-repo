// core/14buff-effects.js - 光明顶5v5 海克斯效果函数库
// V5.6.0 | ~5700 bytes| 2026-08-24 姐姐强化参数直读 JSON（小昭.hexEnhance），去 ELITE_SKILLS 兜底
export const VER = 'core/14buff-effects.js V5.6.0';

import { CONFIG, getSkillParams } from './01config-5v5-test.js';
import { getUnitRow, getUnitCol } from './03battle-utils.js';
import { eventBus } from '../infra/50-event-bus.js';
import { getBattleRng, swapUnitPositions } from './13battle-shared.js';
import { FACT_TYPES } from '../infra/56-battle-enums.js';
const C = CONFIG;

export function applyFortifyDef_Normal(unit, stats) { stats.defBonus += CONFIG.BUFFS.fortify.defBonus; }
export function applyFortifyDef_Sister(unit, stats) { stats.defBonus += CONFIG.BUFFS.fortify.defBonus; }
export function applyFortifyDef_Brother(unit, stats) { stats.defBonus += CONFIG.BUFFS.fortify.defBonus; }

export function applyCloudBodyDodge_Normal(unit, stats) { stats.dodgeBonus = CONFIG.BUFFS.cloudBody.dodgeBonus; }
export function applyCloudBodyDodge_Sister(unit, stats) { stats.dodgeBonus = getSkillParams('小昭', 'hexEnhance').cloudBody.dodgeBonus; }
export function applyCloudBodyDodge_Brother(unit, stats) { stats.dodgeBonus = CONFIG.BUFFS.cloudBody.dodgeBonus; }

export function applyHolyFlame_Normal(unit, allyTeam, activeBuffs, stats) {
    const holyFlameBuff = activeBuffs.find(b => b.key === 'holyFlame');
    if (!holyFlameBuff || unit.camp !== 'ally') return;
    const cols = holyFlameBuff.cols || (holyFlameBuff.col != null ? [holyFlameBuff.col] : []);
    const rows = holyFlameBuff.rows || (holyFlameBuff.row != null ? [holyFlameBuff.row] : []);
    if (cols.includes(getUnitCol(unit.pos))) stats.atkBonus += CONFIG.BUFFS.holyFlame.atkBonus;
    if (rows.includes(getUnitRow(unit.pos))) stats.defBonus += CONFIG.BUFFS.holyFlame.defBonus;
}

export function applyHolyFlame_Sister(unit, allyTeam, activeBuffs, stats) {
    applyHolyFlame_Normal(unit, allyTeam, activeBuffs, stats);
}

export function applyHolyFlame_Brother(unit, allyTeam, activeBuffs, stats) {
    stats.atkBonus += CONFIG.BUFFS.holyFlame.atkBonus;
    stats.defBonus += CONFIG.BUFFS.holyFlame.defBonus;
}

export function calcCarryBonus_Normal(unit, allyTeam) {
    if (unit.pos !== 5 || !unit.alive || unit.isHorse) return { atkAbs: 0, defAbs: 0, hpAbs: 0 };
    let carryAtkAbs = 0, carryDefAbs = 0, carryHpAbs = 0;
    let allAllies = allyTeam.filter(u => u.uid !== unit.uid && !u.isHorse);
    allAllies.forEach(a => {
        let mult = a.alive ? 1 : (CONFIG.BUFFS.carry.deathMultiplier || 3);
        carryAtkAbs += Math.floor(a.atk * (CONFIG.BUFFS.carry.atkBonus || 0.08) * mult);
        carryDefAbs += Math.floor(a.def * (CONFIG.BUFFS.carry.defBonus || 0.08) * mult);
        if (CONFIG.BUFFS.carry.hpBonus) carryHpAbs += Math.floor(a._baseMaxHp ? a._baseMaxHp * CONFIG.BUFFS.carry.hpBonus * mult : 0);
    });
    return { atkAbs: carryAtkAbs, defAbs: carryDefAbs, hpAbs: carryHpAbs };
}

export function calcCarryBonus_Sister(unit, allyTeam) {
    if ((unit.pos < 4 || unit.pos > 6) || !unit.alive || unit.isHorse) return { atkAbs: 0, defAbs: 0, hpAbs: 0 };
    let carryAtkAbs = 0, carryDefAbs = 0, carryHpAbs = 0;
    let allAllies = allyTeam.filter(u => u.uid !== unit.uid && !u.isHorse);
    allAllies.forEach(a => {
        let mult = a.alive ? 1 : (CONFIG.BUFFS.carry.deathMultiplier || 3);
        carryAtkAbs += Math.floor(a.atk * (CONFIG.BUFFS.carry.atkBonus || 0.08) * mult);
        carryDefAbs += Math.floor(a.def * (CONFIG.BUFFS.carry.defBonus || 0.08) * mult);
        if (CONFIG.BUFFS.carry.hpBonus) carryHpAbs += Math.floor(a._baseMaxHp ? a._baseMaxHp * CONFIG.BUFFS.carry.hpBonus * mult : 0);
    });
    return { atkAbs: carryAtkAbs, defAbs: carryDefAbs, hpAbs: carryHpAbs };
}

function applyMindControlCore(unit, allySide, enemySide, log, swapChanceEnemy, swapChanceAlly) {
    const rng = getBattleRng();
    let frontUnit = allySide.filter(u => u.alive && !u.isHorse).sort((a,b) => a.pos - b.pos)[0];
    if (!frontUnit || frontUnit.uid !== unit.uid) return;

    if (rng.nextInt(1,100) <= swapChanceEnemy) {
        let enemies = enemySide.filter(u => u.alive && u.state._flyMode !== 'butterfly' && u.state._flyMode !== 'spider' && !u.state._spiderFlying);
        if (enemies.length >= 2) {
            let a = enemies[rng.nextInt(0, enemies.length-1)];
            let b; do { b = enemies[rng.nextInt(0, enemies.length-1)]; } while (b.uid === a.uid);
            let posA = a.pos, posB = b.pos;
            swapUnitPositions(a, b);
            log.push({ factType: FACT_TYPES.MIND_CONTROL_SWAP, data: { side: 'enemy', unitA: a, unitB: b, posA, posB } });
        } else {
            log.push({ factType: FACT_TYPES.MIND_CONTROL_FAIL, data: { side: 'enemy', reason: '可用单位不足' } });
        }
    } else {
        log.push({ factType: FACT_TYPES.MIND_CONTROL_FAIL, data: { side: 'enemy', reason: '未触发' } });
    }
    if (rng.nextInt(1,100) <= swapChanceAlly) {
        let allies = allySide.filter(u => u.alive && u.state._flyMode !== 'butterfly' && u.state._flyMode !== 'spider' && !u.state._spiderFlying);
        if (allies.length >= 2) {
            let a = allies[rng.nextInt(0, allies.length-1)];
            let b; do { b = allies[rng.nextInt(0, allies.length-1)]; } while (b.uid === a.uid);
            let posA = a.pos, posB = b.pos;
            swapUnitPositions(a, b);
            log.push({ factType: FACT_TYPES.MIND_CONTROL_SWAP, data: { side: 'ally', unitA: a, unitB: b, posA, posB } });
        } else {
            log.push({ factType: FACT_TYPES.MIND_CONTROL_FAIL, data: { side: 'ally', reason: '可用单位不足' } });
        }
    } else {
        log.push({ factType: FACT_TYPES.MIND_CONTROL_FAIL, data: { side: 'ally', reason: '未触发' } });
    }

    eventBus.emit('onPositionSwap', { allySide, enemySide, log });
}

export function applyMindControl_Normal(unit, allySide, enemySide, log) {
    applyMindControlCore(unit, allySide, enemySide, log, CONFIG.BUFFS.mindControl.enemySwapProb * 100, CONFIG.BUFFS.mindControl.allySwapProb * 100);
}

export function applyMindControl_Sister(unit, allySide, enemySide, log) {
    const s = getSkillParams('小昭', 'hexEnhance').mindControl;
    if (!s) throw new Error('缺技能参数: 小昭.hexEnhance.mindControl');
    applyMindControlCore(unit, allySide, enemySide, log, s.enemySwapProb * 100, s.allySwapProb * 100);
}