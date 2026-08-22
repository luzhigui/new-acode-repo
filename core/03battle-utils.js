// core/03battle-utils.js - 光明顶5v5 战斗工具函数
// V5.6.1 | ~15203 bytes| 2026-08-19 import 路径合并至 infra/51-core-utils
export const VER = 'core/03battle-utils.js V5.6.1';

import { CONFIG, TAUNT_LIB, DEF_TAUNT, HP_TAUNT, ZHANG_NEAR_TAUNT, getGameData } from './01config-5v5-test.js';
import { emitEvent, applyStatChange, query, getBattleRng } from './13battle-shared.js';
import { EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/50-event-bus.js';
import {
    calcDamage,
    getFangLevelPure,
    makeFXSnapshot,
    getUnitRow,
    getUnitCol,
    getAdjacentPositions,
    countEnemyEmptyCols,
    getBloodAuraBonus,
    getAuraBonuses
} from '../infra/51-core-utils.js';

const C = CONFIG, TL = TAUNT_LIB, DT = DEF_TAUNT, HT = HP_TAUNT, ZT = ZHANG_NEAR_TAUNT;

export { calcDamage, makeFXSnapshot, getUnitRow, getUnitCol, getAdjacentPositions, countEnemyEmptyCols, getBloodAuraBonus, getAuraBonuses };

export function getFangLevel(def, m) {
    return getFangLevelPure(def, m, C.FANG_LEVELS);
}

export function isMelee(role) { return role === '战士' || role === '防战' || role === '飞行'; }

export function getFronts(units) {
    let fronts = [];
    for (let col = 0; col < 3; col++) {
        let poses = [1+col, 4+col, 7+col];
        let chars = units.filter(c => poses.includes(c.pos) && c.alive && !(c.state._flyMode === 'butterfly') && !(c.state._flyMode === 'spider') && !c.state._spiderFlying && !(c._fsm && (c._fsm.is('attached') || c._fsm.is('flying')))).sort((a, b) => a.pos - b.pos);
        if (chars.length > 0) fronts.push(chars[0]);
    }
    if (fronts.length === 0) {
        let alive = units.filter(c => c.alive);
        if (alive.length > 0) fronts = [alive[getBattleRng().nextInt(0, alive.length - 1)]];
    }
    return fronts;
}

export function isBlocked(unit, allies) {
    if (unit.role === '飞行') return false;
    if (unit.state._flyMode === 'butterfly') return false;
    if (unit.state._flyMode === 'spider') return false;
    if (unit._fsm && (unit._fsm.is('attached') || unit._fsm.is('flying'))) return false;
    let col = (unit.pos - 1) % 3;
    let poses = [1+col, 4+col, 7+col];
    let front = poses.find(p => allies.some(a => a.pos === p && a.alive && !a.isHorse && !(a.state._flyMode === 'butterfly') && !(a.state._flyMode === 'spider')));
    if (!front) return false;
    if (unit.pos === front) return false;
    return unit.pos > front;
}

export function getFlyDodgeRate(unit, attacker) {
    const FLY_BASE_DODGE = C.BASE_DODGE_FLY || 0.15;
    if (unit.isWei) return FLY_BASE_DODGE;
    if (unit.role === '飞行') return FLY_BASE_DODGE;
    return C.BASE_DODGE_GROUND || 0.03;
}

export function getRandomTaunt(unit) {
    const rng = getBattleRng();
    const gd = getGameData();
    const taunts = (gd && gd.taunts) ? gd.taunts : null;
    let pool = null;
    if (unit.isZhang) pool = taunts ? taunts['张无忌']?.attack : TL['张无忌'];
    else if (unit.isWei) pool = taunts ? taunts['韦一笑']?.attack : TL['韦一笑'];
    else pool = taunts ? taunts[unit.role]?.attack : TL[unit.role];
    if (!pool || pool.length === 0) return '看招！';
    return pool[rng.nextInt(0, pool.length - 1)];
}
export function getKillTaunt(unit, KT) {
    const rng = getBattleRng();
    const gd = getGameData();
    const taunts = (gd && gd.taunts) ? gd.taunts : null;
    let pool = null;
    if (unit.isZhang) pool = taunts ? taunts['张无忌']?.kill : KT['张无忌'];
    else if (unit.isWei) pool = taunts ? taunts['韦一笑']?.kill : KT['韦一笑'];
    else pool = taunts ? taunts[unit.role]?.kill : KT[unit.role];
    if (!pool || pool.length === 0) return '受死吧！';
    return pool[rng.nextInt(0, pool.length - 1)];
}
export function getZhangNearTaunt(nearAtkCount) {
    if (nearAtkCount < 1 || nearAtkCount > 3) return null;
    const gd = getGameData();
    const pool = (gd && gd.taunts && gd.taunts.zhangNear) ? gd.taunts.zhangNear : ZT;
    return pool[nearAtkCount - 1] || null;
}

export function getActiveBuffs(allies, enemy) {
    let ally = allies[0]?.camp === 'ally' ? allies : enemy;
    return ally._activeBuffs || [];
}
export function hasBuff(buffs, buffKey) { return buffs.some(b => b.key === buffKey); }

export function hasAnyEnemyEmptyCol(enemySide) {
    const cols = [[1,4,7], [2,5,8], [3,6,9]];
    return cols.some(poses => !enemySide.some(u => u.alive && poses.includes(u.pos)));
}

export function hasEnemyLowHp(enemySide, threshold = 0.4) {
    return enemySide.some(u => u.alive && u.hp / u.maxHp < threshold);
}

export function selectFlyTarget(unit, enemySide) {
    if (unit.role !== '飞行' || unit.isWei) return null;
    const alive = enemySide.filter(u => u.alive && !(u.state._flyMode === 'butterfly') && !(u.state._flyMode === 'spider') && !u.state._spiderFlying && !(u._fsm && (u._fsm.is('attached') || u._fsm.is('flying'))));
    if (alive.length === 0) return null;
    const backRow = [7,8,9], midRow = [4,5,6], frontRow = [1,2,3];
    const priorityOrder = [...backRow, ...midRow, ...frontRow];
    const occupiedFront = new Set(alive.filter(u => [1,2,3].includes(u.pos)).map(u => u.pos));
    const emptySlots = [1,2,3].filter(p => !occupiedFront.has(p));
    if (emptySlots.length === 0) return null;
    for (const pos of priorityOrder) {
        const target = alive.find(u => u.pos === pos);
        if (!target) continue;
        const col = (target.pos - 1) % 3 + 1;
        const row = Math.ceil(target.pos / 3);
        const attackPositions = [];
        if (row > 1) attackPositions.push(target.pos - 3);
        if (row < 3) attackPositions.push(target.pos + 3);
        if (col > 1) attackPositions.push(target.pos - 1);
        if (col < 3) attackPositions.push(target.pos + 1);
        for (const attackPos of attackPositions) {
            for (const slot of emptySlots) {
                if (canReach(slot, attackPos, alive)) return target;
            }
        }
    }
    return null;
}

function canReach(slot, targetPos, enemies) {
    const slotCol = (slot - 1) % 3 + 1;
    const slotRow = Math.ceil(slot / 3);
    const targetCol = (targetPos - 1) % 3 + 1;
    const targetRow = Math.ceil(targetPos / 3);
    if (slotCol === targetCol) {
        const minRow = Math.min(slotRow, targetRow);
        const maxRow = Math.max(slotRow, targetRow);
        for (let r = minRow; r <= maxRow; r++) {
            const checkPos = (r - 1) * 3 + slotCol;
            if (checkPos !== targetPos && enemies.some(e => e.pos === checkPos && e.alive)) return false;
        }
        return true;
    }
    if (slotRow === targetRow) {
        const minCol = Math.min(slotCol, targetCol);
        const maxCol = Math.max(slotCol, targetCol);
        for (let c = minCol; c <= maxCol; c++) {
            const checkPos = (slotRow - 1) * 3 + c;
            if (checkPos !== targetPos && enemies.some(e => e.pos === checkPos && e.alive)) return false;
        }
        return true;
    }
    const corner1 = (slotRow - 1) * 3 + targetCol;
    if (!enemies.some(e => e.pos === corner1 && e.alive) || corner1 === targetPos) {
        const minCol1 = Math.min(slotCol, targetCol);
        const maxCol1 = Math.max(slotCol, targetCol);
        let blocked = false;
        for (let c = minCol1; c <= maxCol1; c++) {
            const p = (slotRow - 1) * 3 + c;
            if (p !== slot && p !== corner1 && enemies.some(e => e.pos === p && e.alive)) { blocked = true; break; }
        }
        if (!blocked) {
            const minRow1 = Math.min(slotRow, targetRow);
            const maxRow1 = Math.max(slotRow, targetRow);
            for (let r = minRow1; r <= maxRow1; r++) {
                const p = (r - 1) * 3 + targetCol;
                if (p !== corner1 && p !== targetPos && enemies.some(e => e.pos === p && e.alive)) { blocked = true; break; }
            }
        }
        if (!blocked) return true;
    }
    const corner2 = (targetRow - 1) * 3 + slotCol;
    if (!enemies.some(e => e.pos === corner2 && e.alive) || corner2 === targetPos) {
        const minRow2 = Math.min(slotRow, targetRow);
        const maxRow2 = Math.max(slotRow, targetRow);
        let blocked = false;
        for (let r = minRow2; r <= maxRow2; r++) {
            const p = (r - 1) * 3 + slotCol;
            if (p !== slot && p !== corner2 && enemies.some(e => e.pos === p && e.alive)) { blocked = true; break; }
        }
        if (!blocked) {
            const minCol2 = Math.min(slotCol, targetCol);
            const maxCol2 = Math.max(slotCol, targetCol);
            for (let c = minCol2; c <= maxCol2; c++) {
                const p = (targetRow - 1) * 3 + c;
                if (p !== corner2 && p !== targetPos && enemies.some(e => e.pos === p && e.alive)) { blocked = true; break; }
            }
        }
        if (!blocked) return true;
    }
    return false;
}

export function registerWarriorBreakDefense(eventBus) {
    eventBus.on('beforeDamageCalc', L.BEFORE_DAMAGE_CALC.WARRIOR_BREAK, (data) => {
        const { unit, target, declarations } = data;
        if (!declarations) return;
        if (unit.role !== '战士' || target.def <= 0) return;
        let defReduced = C.WARRIOR_BREAK_DEF;
        let breakChance = target.def * 2.5;
        if (target.def <= 40) {
            defReduced = 2;
        } else if (target.def <= 50) {
            defReduced = 3;
            breakChance = 100;
        } else {
            defReduced = 4;
            breakChance = 100;
        }
        if (getBattleRng().nextInt(1, 100) > breakChance) return;
        defReduced = Math.min(defReduced, target.def);
        declarations.push({ type: EFFECT_TYPES.BREAK_DEF, value: defReduced, source: unit, target: target });
        unit._pendingDefReduceFact = { attackerName: unit.name, targetName: target.name, reduce: defReduced };
    });
}

export function registerRangedGrowth(eventBus) {
    eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.RANGED_GROWTH, (data) => {
        const { unit, target, dmg, group } = data;
        if (unit.role !== '远程' || dmg <= 0) return;
        const growth = C.RANGED_GROWTH_ATK;
        if (!data.declarations) data.declarations = [];
        data.declarations.push({
            type: EFFECT_TYPES.STAT_CHANGE,
            field: 'atk',
            delta: growth,
            target: unit,
            oldValue: unit.atk,
            logText: null
        });
        if (unit._baseAtk !== undefined) unit._baseAtk += growth;
        if (group && group.data && group.data.entries) {
            group.data.entries.push({ factType: 'rangedGrowth', data: { unitName: unit.name, growth, newAtk: Math.floor(unit.atk + growth) } });
        }
    });
}

export function registerWarriorExecute(eventBus) {
    eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.WARRIOR_EXECUTE, (data) => {
        const { unit, target, allySide, declarations } = data;
        if (unit.role !== '战士' || !unit.alive) return;
        if (!target || !target.alive || target.hp <= 0) return;
        const unitBuffs = (allySide && allySide._activeBuffs) || [];
        const hasBloodthirst = hasBuff(unitBuffs, 'bloodthirst');
        const threshold = hasBloodthirst ? 0.20 : 0.15;
        if (target.hp <= target.maxHp * threshold) {
            if (!declarations) return;
            declarations.push({
                type: EFFECT_TYPES.EXECUTE,
                target: target,
                source: unit,
                threshold: threshold,
                factType: 'warriorExecute',
                factData: { unitName: unit.name, targetName: target.name }
            });
        }
    });
}

export function registerFortifyShield(eventBus) {
    function tryFortify(unit, chance, group, log, label, skipStatChange) {
        if (unit.role !== '防战') return;
        if (unit._fortifyThisRound === undefined) unit._fortifyThisRound = 0;
        if (!unit._fortifyStacks) unit._fortifyStacks = 0;
        const increment = unit._fortifyIncrement || 1;
        const cap = unit._fortifyCap || 3;
        if (unit._fortifyThisRound + increment > cap) return;
        if (getBattleRng().nextInt(1, 100) > chance) return;
        unit._fortifyStacks += increment;
        unit._fortifyThisRound += increment;
        if (!skipStatChange) {
            applyStatChange(unit, 'def', increment, null, '坚盾');
        }
        if (unit._baseDef !== undefined) unit._baseDef += increment;
        const entry = { factType: 'fortifyShield', data: { unitName: unit.name, label, increment, current: unit._fortifyThisRound, cap } };
        if (group && group.data && group.data.entries) {
            group.data.entries.push(entry);
        } else if (log) {
            log.push(entry);
        }
    }

    eventBus.on('afterDamageApplied', L.AFTER_DAMAGE_APPLIED.SHIELD_DEFEND, (data) => {
        const { target, dmg, group } = data;
        if (dmg <= 0) return;
        const prevStacks = target._fortifyStacks || 0;
        tryFortify(target, 60, group, null, '坚盾', true);
        if ((target._fortifyStacks || 0) > prevStacks) {
            const increment = (target._fortifyStacks || 0) - prevStacks;
            if (!data.declarations) data.declarations = [];
            data.declarations.push({
                type: EFFECT_TYPES.STAT_CHANGE,
                field: 'def',
                delta: increment,
                target: target,
                logText: null
            });
        }
    });

    eventBus.on('afterAttack', L.AFTER_ATTACK.SHIELD_ATTACK, (data) => {
        const { unit, group, log } = data;
        tryFortify(unit, 80, group, log, '攻盾');
    });
}

export function registerDoubleStrike(eventBus, doubleStrikeUnitUid, allyTeam, activeBuffs) {
    if (!doubleStrikeUnitUid) return;
    eventBus.on('afterAttack', L.AFTER_ATTACK.DOUBLE_STRIKE, (data) => {
        const { unit, target, log } = data;
        if (unit.uid !== doubleStrikeUnitUid || !unit.alive || unit.camp !== 'ally' || unit._doubleStriked) return;
        const xiaoDoubleEnhance = query('xiaoHexEnhance', allyTeam, activeBuffs, 'doubleStrike');
        const missChainChance = xiaoDoubleEnhance ? 1.0 : (C.BUFFS.doubleStrike.prob || 0.8);
        if (getBattleRng().next() < missChainChance) {
            log.push({ factType: 'doubleStrike', data: { success: true } });
            unit._doubleStriked = true;
            if (!data.extraRequests) data.extraRequests = [];
            data.extraRequests.push({
                unit,
                targetUid: (target && target.alive) ? target.uid : null,
                reason: 'doubleStrike',
                actedMode: 'allow',
                priority: 10,
                ignoreBlock: !!xiaoDoubleEnhance
            });
        } else {
            log.push({ factType: 'doubleStrike', data: { success: false, unitName: unit.name } });
        }
    });
}

export function registerEmptyColBonus(eventBus) {
    // 空列和残血光环已改为纯函数 getAuraBonuses 实时计算，不再需要事件监听
}