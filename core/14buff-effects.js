export const VER = 'core/14buff-effects.js V6.1.9';

import { CONFIG, getSkillParams, getBrotherHexEnhance } from './01config-5v5-test.js';
import { getUnitRow, getUnitCol } from './03battle-utils.js';
import { eventBus } from '../infra/50-event-bus.js';
import { getBattleRng, swapUnitPositions, addMod, getStat, applyStatChange, emitEvent } from './13battle-shared.js';
import { emitStateChange } from '../infra/59-state-change.js';
import { FACT_TYPES, CAMP_TYPES, SIGNAL_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES, STATE_CHANGE_TYPES } from '../infra/56-battle-enums.js';
const C = CONFIG;

// 严阵以待：防御 +50%（mul 词条）
// 清死重：原 _Normal/_Sister/_Brother 三函数体逐字相同（外部AI清单#2），
//   且 04 只调 _Normal——收口成一个，_Sister/_Brother 全库无调用
export function applyFortifyDef(unit) {
    addMod(unit, 'def', { source: '严阵以待', value: CONFIG.BUFFS.fortify.defBonus, ttl: 'round', op: 'mul', group: 'fortify' });
}

// 流云身法：闪避 +25%（闪避不走属性词条，返回比率给 computeBuffStats 用）
export function applyCloudBodyDodge_Normal() { return CONFIG.BUFFS.cloudBody.dodgeBonus; }
export function applyCloudBodyDodge_Sister() { return getSkillParams('小昭', 'hexEnhance').cloudBody.dodgeBonus; }
// 妹永久流云身法：普通版闪避 × brother.cloudBody.dodgeRatio（唯一真源 201，缺则炸）
export function applyCloudBodyDodge_Brother() {
    const enh = getBrotherHexEnhance('cloudBody');
    if (!enh || enh.dodgeRatio == null) {
        throw new Error('201hex-enhance.json 缺 brother.cloudBody.dodgeRatio');
    }
    return CONFIG.BUFFS.cloudBody.dodgeBonus * enh.dodgeRatio;
}

// 圣火令：命中列 +30% 攻击，命中行 +30% 防御（mul 词条）
// 数值声明 fact：乘法词条共享 getStat 的 (1+mulSum) 乘区、无独立增量，故只发乘率 ratio，供体检按乘率口径核对
function pushHolyFlameFact(log, unit, field, ratio) {
    if (!log) return;
    log.push({ factType: FACT_TYPES.HOLY_FLAME_APPLY, data: { unitName: unit.name, unitUid: unit.uid, camp: unit.camp, field, op: 'mul', ratio } });
}

export function applyHolyFlame_Normal(unit, allyTeam, activeBuffs, log) {
    const holyFlameBuff = activeBuffs.find(b => b.key === BUFF_TYPES.HOLY_FLAME);
    if (!holyFlameBuff) return;
    const cols = holyFlameBuff.cols || (holyFlameBuff.col != null ? [holyFlameBuff.col] : []);
    const rows = holyFlameBuff.rows || (holyFlameBuff.row != null ? [holyFlameBuff.row] : []);
    if (cols.includes(getUnitCol(unit.pos))) {
        addMod(unit, 'atk', { source: '圣火令', value: CONFIG.BUFFS.holyFlame.atkBonus, ttl: 'round', op: 'mul', group: 'holyFlame' });
        pushHolyFlameFact(log, unit, 'atk', CONFIG.BUFFS.holyFlame.atkBonus);
    }
    if (rows.includes(getUnitRow(unit.pos))) {
        addMod(unit, 'def', { source: '圣火令', value: CONFIG.BUFFS.holyFlame.defBonus, ttl: 'round', op: 'mul', group: 'holyFlame' });
        pushHolyFlameFact(log, unit, 'def', CONFIG.BUFFS.holyFlame.defBonus);
    }
}

export function applyHolyFlame_Sister(unit, allyTeam, activeBuffs, log) {
    applyHolyFlame_Normal(unit, allyTeam, activeBuffs, log);
}

// 妹永久圣火令改「画行列、判命中」（老板拍板）：不再无条件双加成——回合初蛛变按全局同口径
//   掷 defRows 行 + atkCols 列存 state._xiaoHolyFlame（modules/27），妹落位命中行→吃防加成、命中列→吃攻加成。
//   3×3 宫格下等价 2/3 概率加防、1/3 概率加攻（独立判定），但逻辑是命中判定而非写死概率，未来扩宫格自适应。
export function applyHolyFlame_Brother(unit, allyTeam, activeBuffs, log) {
    const draw = unit.state._xiaoHolyFlame;
    if (!draw) return;
    if ((draw.rows || []).includes(getUnitRow(unit.pos))) {
        addMod(unit, 'def', { source: '圣火令', value: CONFIG.BUFFS.holyFlame.defBonus, ttl: 'round', op: 'mul', group: 'holyFlame' });
        pushHolyFlameFact(log, unit, 'def', CONFIG.BUFFS.holyFlame.defBonus);
    }
    if ((draw.cols || []).includes(getUnitCol(unit.pos))) {
        addMod(unit, 'atk', { source: '圣火令', value: CONFIG.BUFFS.holyFlame.atkBonus, ttl: 'round', op: 'mul', group: 'holyFlame' });
        pushHolyFlameFact(log, unit, 'atk', CONFIG.BUFFS.holyFlame.atkBonus);
    }
}

// carry：5 号位按队友属性百分比加成，死亡队友加成翻倍
// 拒马双向全开（老板拍板）：① 计入队友池——活 1 份 / 死 deathMultiplier 份，与狮子同口径；
//   ② 受益面也放开——拒马站受益位（无小昭·姊=5 号位，有小昭·姊=4/5/6）时同样吃到加成（门控已去 isHorse）
export function calcCarryBonus_Normal(unit, allyTeam) {
    if (unit.pos !== 5 || !unit.alive) return { atkAbs: 0, defAbs: 0, hpAbs: 0 };
    let carryAtkAbs = 0, carryDefAbs = 0, carryHpAbs = 0;
    let allAllies = allyTeam.filter(u => u.uid !== unit.uid);
    allAllies.forEach(a => {
        let mult = a.alive ? 1 : CONFIG.BUFFS.carry.deathMultiplier;
        carryAtkAbs += Math.floor(getStat(a, 'atk') * CONFIG.BUFFS.carry.atkBonus * mult);
        carryDefAbs += Math.floor(getStat(a, 'def') * CONFIG.BUFFS.carry.defBonus * mult);
        if (CONFIG.BUFFS.carry.hpBonus) carryHpAbs += Math.floor(a.state._baseMaxHp ? a.state._baseMaxHp * CONFIG.BUFFS.carry.hpBonus * mult : 0);
    });
    return { atkAbs: carryAtkAbs, defAbs: carryDefAbs, hpAbs: carryHpAbs };
}

export function calcCarryBonus_Sister(unit, allyTeam) {
    if ((unit.pos < 4 || unit.pos > 6) || !unit.alive) return { atkAbs: 0, defAbs: 0, hpAbs: 0 };
    let carryAtkAbs = 0, carryDefAbs = 0, carryHpAbs = 0;
    let allAllies = allyTeam.filter(u => u.uid !== unit.uid);
    allAllies.forEach(a => {
        let mult = a.alive ? 1 : CONFIG.BUFFS.carry.deathMultiplier;
        carryAtkAbs += Math.floor(getStat(a, 'atk') * CONFIG.BUFFS.carry.atkBonus * mult);
        carryDefAbs += Math.floor(getStat(a, 'def') * CONFIG.BUFFS.carry.defBonus * mult);
        if (CONFIG.BUFFS.carry.hpBonus) carryHpAbs += Math.floor(a.state._baseMaxHp ? a.state._baseMaxHp * CONFIG.BUFFS.carry.hpBonus * mult : 0);
    });
    return { atkAbs: carryAtkAbs, defAbs: carryDefAbs, hpAbs: carryHpAbs };
}

// 惑心 3 格重排：从 team 随机选 3 个格子（不管有没有人），把 3 格里的单位随机重排。
//   控制免疫单位不动（剩下的格子随机 50% 换）；飞天/附身可换。
//   返回实际发生变化的单位 [{ unit, fromPos, toPos }]（长度 0~3）。
function shuffleThreeSlots(team, rng) {
    const allPos = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const pick3 = [];
    for (let i = 0; i < 3; i++) {
        const idx = rng.nextInt(0, allPos.length - 1);
        pick3.push(allPos[idx]);
        allPos.splice(idx, 1);
    }
    const slotUnits = pick3.map(pos => ({
        pos,
        unit: team.find(u => u.pos === pos && u.alive && !u.state._pendingDeath) || null
    }));
    const immuneSlots = slotUnits.filter(s => s.unit && s.unit.state._ctrlImmune);
    const swappableUnits = slotUnits.filter(s => s.unit && !s.unit.state._ctrlImmune).map(s => s.unit);
    if (swappableUnits.length < 2) return [];
    if (immuneSlots.length > 0) {
        if (rng.nextInt(0, 1) === 0) return [];
        const positions = swappableUnits.map(u => u.pos);
        const units = swappableUnits.slice();
        for (let i = units.length - 1; i > 0; i--) {
            const j = rng.nextInt(0, i);
            [units[i], units[j]] = [units[j], units[i]];
        }
        let changed = false;
        for (let i = 0; i < units.length; i++) if (units[i] !== swappableUnits[i]) { changed = true; break; }
        if (!changed) return [];
        const result = [];
        for (let i = 0; i < units.length; i++) {
            const u = swappableUnits[i];
            const fromPos = u.pos;
            u.pos = positions[i];
            result.push({ unit: u, fromPos, toPos: u.pos });
        }
        return result;
    }
    const units = slotUnits.filter(s => s.unit).map(s => s.unit);
    if (units.length < 2) return [];
    const shuffledUnits = units.slice();
    for (let i = shuffledUnits.length - 1; i > 0; i--) {
        const j = rng.nextInt(0, i);
        [shuffledUnits[i], shuffledUnits[j]] = [shuffledUnits[j], shuffledUnits[i]];
    }
    const shuffledPos = pick3.slice();
    for (let i = shuffledPos.length - 1; i > 0; i--) {
        const j = rng.nextInt(0, i);
        [shuffledPos[i], shuffledPos[j]] = [shuffledPos[j], shuffledPos[i]];
    }
    const finalPos = shuffledPos.slice(0, units.length);
    let changed = false;
    for (let i = 0; i < units.length; i++) if (units[i].pos !== finalPos[i]) { changed = true; break; }
    if (!changed) return [];
    const result = [];
    for (let i = 0; i < units.length; i++) {
        const u = units[i];
        const fromPos = u.pos;
        u.pos = finalPos[i];
        result.push({ unit: u, fromPos, toPos: u.pos });
    }
    return result;
}

function applyMindControlCore(unit, allySide, enemySide, log, swapChanceEnemy, swapChanceAlly, enhance = null) {
    const rng = getBattleRng();
    let frontUnit = allySide.filter(u => u.alive && !u.isHorse).sort((a,b) => a.pos - b.pos)[0];
    if (!frontUnit || frontUnit.uid !== unit.uid) return;

    log.push({ factType: FACT_TYPES.MIND_CONTROL_BANNER, data: { side: CAMP_TYPES.ENEMY } });
    if (rng.nextInt(1,100) <= swapChanceEnemy) {
        const swaps = shuffleThreeSlots(enemySide, rng);
        if (swaps.length > 0) {
            const dmgOnSwap = (enhance && enhance.dmgOnSwap) || 0;
            if (dmgOnSwap > 0) {
                for (const s of swaps) {
                    if (s.unit.alive && !s.unit.state._pendingDeath) applyStatChange(s.unit, 'hp', -dmgOnSwap, null, '惑心换位');
                }
            }
            if (enhance && enhance.stunOnSwap) {
                for (const s of swaps) {
                    if (s.unit.alive && !s.unit.state._pendingDeath) {
                        s.unit.state._stunned = true;
                        emitEvent(s.unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: s.unit.hp, maxHp: s.unit.maxHp, alive: s.unit.alive, atk: getStat(s.unit, 'atk'), def: getStat(s.unit, 'def'), _stunned: true });
                        emitStateChange(s.unit, STATE_CHANGE_TYPES.STUNNED, {}, log);
                    }
                }
            }
            for (const s of swaps) {
                emitEvent(s.unit, UNIT_EVENT_TYPES.POS_CHANGE, { pos: s.toPos });
                emitStateChange(s.unit, STATE_CHANGE_TYPES.POSITION, { fromPos: s.fromPos, toPos: s.toPos }, log);
            }
            log.push({ factType: FACT_TYPES.MIND_CONTROL_SWAP, data: { side: CAMP_TYPES.ENEMY, swaps: swaps.map(s => ({ uid: s.unit.uid, name: s.unit.name, fromPos: s.fromPos, toPos: s.toPos })), dmg: dmgOnSwap } });
        } else {
            log.push({ factType: FACT_TYPES.MIND_CONTROL_FAIL, data: { side: CAMP_TYPES.ENEMY, reason: '无变化' } });
        }
    } else {
        log.push({ factType: FACT_TYPES.MIND_CONTROL_FAIL, data: { side: CAMP_TYPES.ENEMY, reason: '未触发' } });
    }
    log.push({ factType: FACT_TYPES.MIND_CONTROL_BANNER, data: { side: CAMP_TYPES.ALLY } });
    if (rng.nextInt(1,100) <= swapChanceAlly) {
        const swaps = shuffleThreeSlots(allySide, rng);
        if (swaps.length > 0) {
            const healOnSwap = (enhance && enhance.healOnSwap) || 0;
            if (healOnSwap > 0) {
                for (const s of swaps) {
                    if (s.unit.alive && !s.unit.state._pendingDeath) applyStatChange(s.unit, 'hp', healOnSwap, unit, '惑心换位');
                }
            }
            for (const s of swaps) {
                emitEvent(s.unit, UNIT_EVENT_TYPES.POS_CHANGE, { pos: s.toPos });
                emitStateChange(s.unit, STATE_CHANGE_TYPES.POSITION, { fromPos: s.fromPos, toPos: s.toPos }, log);
            }
            log.push({ factType: FACT_TYPES.MIND_CONTROL_SWAP, data: { side: CAMP_TYPES.ALLY, swaps: swaps.map(s => ({ uid: s.unit.uid, name: s.unit.name, fromPos: s.fromPos, toPos: s.toPos })), heal: healOnSwap } });
        } else {
            log.push({ factType: FACT_TYPES.MIND_CONTROL_FAIL, data: { side: CAMP_TYPES.ALLY, reason: '无变化' } });
        }
    } else {
        log.push({ factType: FACT_TYPES.MIND_CONTROL_FAIL, data: { side: CAMP_TYPES.ALLY, reason: '未触发' } });
    }

    eventBus.emit(SIGNAL_TYPES.ON_POSITION_SWAP, { allySide, enemySide, log });
}

export function applyMindControl_Normal(unit, allySide, enemySide, log) {
    applyMindControlCore(unit, allySide, enemySide, log, CONFIG.BUFFS.mindControl.enemySwapProb * 100, CONFIG.BUFFS.mindControl.allySwapProb * 100);
}

export function applyMindControl_Sister(unit, allySide, enemySide, log) {
    const s = getSkillParams('小昭', 'hexEnhance').mindControl;
    if (!s) throw new Error('缺技能参数: 小昭.hexEnhance.mindControl');
    applyMindControlCore(unit, allySide, enemySide, log, s.enemySwapProb * 100, s.allySwapProb * 100, s);
}