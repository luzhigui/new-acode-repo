// V6.1.1 | ~19000 bytes | 2026-09-22 概率连击的 targetUid 回退补 _pendingDeath：原目标同击致死后改打别人（原先白跳）
export const VER = 'core/03battle-utils.js V6.1.1';

import { CONFIG, getGameData } from './01config-5v5-test.js';
import { emitEvent, applyStatChange, query, getBattleRng, addMod, getStat } from './13battle-shared.js';
import { EXECUTION_LAYER as L, EFFECT_TYPES, registerSettlementHook } from '../infra/50-event-bus.js';
import { FACT_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, ROLE_TYPES, SIGNAL_TYPES } from '../infra/56-battle-enums.js';
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

const C = CONFIG;

export { calcDamage, makeFXSnapshot, getUnitRow, getUnitCol, getAdjacentPositions, countEnemyEmptyCols, getBloodAuraBonus, getAuraBonuses };

export function getFangLevel(def, m) {
    return getFangLevelPure(def, m, C.FANG_LEVELS);
}

export function isMelee(role) { return role === ROLE_TYPES.WARRIOR || role === ROLE_TYPES.DEFENDER || role === ROLE_TYPES.FLYER; }

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
    if (!isMelee(unit.role)) return false;
    if (unit.role === ROLE_TYPES.FLYER) return false;
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

// 能否被选中：存活 + 未被标记不可选 + 不处于飞天/附身状态
// 供成昆模仿有效性、混乱目标校验、锁定目标校验等共用
export function canBeTargeted(unit) {
    if (!unit || !unit.alive) return false;
    // 2026-09-19 加 _pendingDeath：血量归零到正式死亡之间不该再被选为目标
    if (unit.state && unit.state._pendingDeath) return false;
    if (unit.state && unit.state._untargetable) return false;
    if (unit.state && (unit.state._flyMode === 'butterfly' || unit.state._flyMode === 'spider')) return false;
    if (unit.state && unit.state._spiderFlying) return false;
    if (unit._fsm && (unit._fsm.is('attached') || unit._fsm.is('flying'))) return false;
    return true;
}

export function getFlyDodgeRate(unit, attacker) {
    const FLY_BASE_DODGE = C.BASE_DODGE_FLY || 0.15;
    if (unit.isWei) return FLY_BASE_DODGE;
    if (unit.role === ROLE_TYPES.FLYER) return FLY_BASE_DODGE;
    return C.BASE_DODGE_GROUND || 0.03;
}

// 2026-09-16 攻击未命中率：唯一算法源（12battle-attack-steps 与详情弹窗同源调用，改算法只改这里）
// 返回 { total, sources }，total 为百分点，sources 为 { label, value } 明细
export function getMissBreakdown(unit, allySide, enemySide) {
    if (!unit) return { total: 0, sources: [] };
    if (unit.state && unit.state._neverMiss) return { total: 0, sources: [{ label: '必中', value: 0 }] };
    const sources = [];
    let total = 0;
    if (unit.role === ROLE_TYPES.RANGED) {
        total = C.RANGED_MISS_CHANCE;
        sources.push({ label: '远程基础', value: C.RANGED_MISS_CHANCE });
    } else if (unit.role === ROLE_TYPES.FLYER) {
        total = C.FLY_MISS_CHANCE;
        sources.push({ label: '飞行基础', value: C.FLY_MISS_CHANCE });
        const allUnits = [...(allySide || []), ...(enemySide || [])];
        const lowHpCount = allUnits.filter(u => u.alive && u.hp / u.maxHp < 0.4).length;
        if (lowHpCount > 0) {
            const v = lowHpCount * C.FLY_MISS_LOWHP_BONUS;
            total += v;
            sources.push({ label: '残血光环×' + lowHpCount, value: v });
        }
        const emptyCols = countEnemyEmptyCols(enemySide || []);
        if (emptyCols > 0) {
            const v = -emptyCols * C.FLY_MISS_EMPTYCOL_REDUCE;
            total += v;
            sources.push({ label: '空列×' + emptyCols, value: v });
        }
    } else {
        total = C.GROUND_MISS_CHANCE;
        sources.push({ label: '地面基础', value: C.GROUND_MISS_CHANCE });
    }
    return { total: Math.max(0, Math.round(total * 10) / 10), sources };
}

export function getRandomTaunt(unit) {
    const rng = getBattleRng();
    const taunts = getGameData().taunts;
    let pool = null;
    if (unit.isZhang) pool = taunts['张无忌'].attack;
    else if (unit.isWei) pool = taunts['韦一笑'].attack;
    else pool = taunts[unit.role].attack;
    if (!pool || pool.length === 0) throw new Error(`台词池缺失: ${unit.name || unit.role}`);
    return pool[rng.nextInt(0, pool.length - 1)];
}
export function getKillTaunt(unit) {
    const rng = getBattleRng();
    const taunts = getGameData().taunts;
    let pool = null;
    if (unit.isZhang) pool = taunts['张无忌'].kill;
    else if (unit.isWei) pool = taunts['韦一笑'].kill;
    else pool = taunts[unit.role].kill;
    if (!pool || pool.length === 0) throw new Error(`击杀台词池缺失: ${unit.name || unit.role}`);
    return pool[rng.nextInt(0, pool.length - 1)];
}
export function getZhangNearTaunt(nearAtkCount) {
    if (nearAtkCount < 1 || nearAtkCount > 3) return null;
    const pool = getGameData().taunts.zhangNear;
    return pool[nearAtkCount - 1] || null;
}

export function getActiveBuffs(allies, enemy) {
    let ally = allies[0]?.camp === CAMP_TYPES.ALLY ? allies : enemy;
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
    if (unit.role !== ROLE_TYPES.FLYER || unit.isWei) return null;
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

// 战士破防：判定后直接 addMod 永久负词条
function submitWarriorBreakDefenseDeclaration(data) {
    const { unit, target, declarations } = data;
    if (!declarations) return;
    if (unit.role !== ROLE_TYPES.WARRIOR || getStat(target, 'def') <= 0) return;
    // 2026-09-14 参数三源收敛：分档表移入 CONFIG.WARRIOR_BREAK_DEF_TIERS（原先内联魔法数字）
    const targetDef = getStat(target, 'def');
    const tier = (C.WARRIOR_BREAK_DEF_TIERS || []).find(t => t.defMax === null || targetDef <= t.defMax)
        || { reduce: C.WARRIOR_BREAK_DEF, chance: null };
    let defReduced = tier.reduce;
    let breakChance = tier.chance === null ? targetDef * (C.WARRIOR_BREAK_CHANCE_PER_DEF ?? 2.5) : tier.chance;
    if (getBattleRng().nextInt(1, 100) > breakChance) return;
    defReduced = Math.min(defReduced, getStat(target, 'def'));
    addMod(target, 'def', { source: '破防', value: -defReduced, ttl: 'permanent', group: 'breakDef', op: 'add' });
    declarations.push({ type: EFFECT_TYPES.BREAK_DEF, value: defReduced, source: unit, target: target, factData: { attackerName: unit.name, targetName: target.name, reduce: defReduced } });
}

export function registerWarriorBreakDefense(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.BEFORE_DAMAGE_CALC,
        priority: L.BEFORE_DAMAGE_CALC.WARRIOR_BREAK,
        handler: (data) => {
            submitWarriorBreakDefenseDeclaration(data);
        }
    });
}

// 远程成长：每次攻击后攻击 +2，走永久词条
function submitRangedGrowthDeclaration(data) {
    const { unit, target, dmg, group } = data;
    if (unit.role !== ROLE_TYPES.RANGED || dmg <= 0) return;
    const growth = C.RANGED_GROWTH_ATK;
    addMod(unit, 'atk', { source: '远程成长', value: growth, ttl: 'permanent', group: 'rangedGrowth', op: 'add' });
    if (group && group.data && group.data.entries) {
        group.data.entries.push({ factType: FACT_TYPES.RANGED_GROWTH, data: { unitName: unit.name, growth, newAtk: Math.floor(getStat(unit, 'atk')) } });
    }
}

export function registerRangedGrowth(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.RANGED_GROWTH,
        handler: (data) => {
            submitRangedGrowthDeclaration(data);
        }
    });
}

// 战士斩杀：目标血量低于阈值时直接击杀（不涉及属性词条）
function submitWarriorExecuteDeclaration(data) {
    const { unit, target, allySide, declarations } = data;
    if (unit.role !== ROLE_TYPES.WARRIOR || !unit.alive) return;
    if (!target || !target.alive || target.hp <= 0) return;
    const unitBuffs = (allySide && allySide._activeBuffs) || [];
    const hasBloodthirst = hasBuff(unitBuffs, BUFF_TYPES.BLOODTHIRST);
    const threshold = hasBloodthirst ? 0.20 : 0.15;
    if (target.hp <= target.maxHp * threshold) {
        if (!declarations) return;
        declarations.push({
            type: EFFECT_TYPES.EXECUTE,
            target: target,
            source: unit,
            threshold: threshold,
            factType: FACT_TYPES.WARRIOR_EXECUTE,
            factData: { unitName: unit.name, targetName: target.name, unitUid: unit.uid, targetUid: target.uid }
        });
    }
}

export function registerWarriorExecute(eventBus) {
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.WARRIOR_EXECUTE,
        handler: (data) => {
            submitWarriorExecuteDeclaration(data);
        }
    });
}

export function registerFortifyShield(eventBus) {
    function tryFortify(unit, chance, group, log, label) {
        if (!unit.alive || unit.role !== ROLE_TYPES.DEFENDER) return;
        const fortifyThisRound = unit.state._fortifyThisRound || 0;
        const increment = unit.state._fortifyIncrement || C.FORTIFY_INCREMENT;
        const cap = unit.state._fortifyCap || C.FORTIFY_CAP;
        if (fortifyThisRound + increment > cap) return;
        if (getBattleRng().nextInt(1, 100) > chance) return;
        Object.assign(unit.state, { _fortifyStacks: unit.state._fortifyStacks + increment, _fortifyThisRound: fortifyThisRound + increment });
        addMod(unit, 'def', { source: '坚盾', value: increment, ttl: 'permanent', group: 'fortify', op: 'add' });
        const entry = { factType: FACT_TYPES.FORTIFY_SHIELD, data: { unitName: unit.name, label, increment, current: fortifyThisRound + increment, cap } };
        if (group && group.data && group.data.entries) {
            group.data.entries.push(entry);
        } else if (log) {
            log.push(entry);
        }
    }

    const fortifyCfg = getGameData().roles[ROLE_TYPES.DEFENDER].fortify;

    function submitFortifyShieldDefend(data) {
        const { target, dmg, group } = data;
        if (dmg <= 0) return;
        tryFortify(target, fortifyCfg.defendChance, group, null, '坚盾');
    }

    function submitFortifyShieldAttack(data) {
        const { unit, group, log } = data;
        tryFortify(unit, fortifyCfg.attackChance, group, log, '攻盾');
    }

    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
        priority: L.AFTER_DAMAGE_APPLIED.SHIELD_DEFEND,
        handler: (data) => { submitFortifyShieldDefend(data); }
    });

    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_ATTACK,
        priority: L.AFTER_ATTACK.SHIELD_ATTACK,
        handler: (data) => { submitFortifyShieldAttack(data); }
    });
}

export function registerDoubleStrike(eventBus, doubleStrikeUnitUid, allyTeam, activeBuffs) {
    if (!doubleStrikeUnitUid) return;
    function submitDoubleStrikeDeclaration(data) {
        const { unit, target, log } = data;
        if (unit.uid !== doubleStrikeUnitUid || !unit.alive || unit.state._doubleStriked) return;
        const xiaoDoubleEnhance = query('xiaoHexEnhance', allyTeam, activeBuffs, BUFF_TYPES.DOUBLE_STRIKE);
        const missChainChance = xiaoDoubleEnhance ? 1.0 : (C.BUFFS.doubleStrike.prob || 0.8);
        if (getBattleRng().next() < missChainChance) {
            log.push({ factType: FACT_TYPES.DOUBLE_STRIKE, data: { success: true } });
            Object.assign(unit.state, { _doubleStriked: true });
            if (!data.extraRequests) data.extraRequests = [];
            data.extraRequests.push({
                unit,
                // 2026-09-22 补 _pendingDeath：原目标同击致死后 alive 仍是 true（死亡结算才清），
                //   只判 alive 会把"待死"的 uid 锁给第二次攻击 → 消费端按严判据找不到人 → 白跳一次。
                //   判 null 后走正常选目标流程（概率连击改打别人）。
                targetUid: (target && target.alive && !target.state._pendingDeath) ? target.uid : null,
                reason: 'doubleStrike',
                actedMode: 'allow',
                priority: 10,
                ignoreBlock: !!xiaoDoubleEnhance
            });
        } else {
            log.push({ factType: FACT_TYPES.DOUBLE_STRIKE, data: { success: false, unitName: unit.name } });
        }
    }
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_ATTACK,
        priority: L.AFTER_ATTACK.DOUBLE_STRIKE,
        handler: (data) => { submitDoubleStrikeDeclaration(data); }
    });
    registerSettlementHook({
        when: SIGNAL_TYPES.AFTER_MISS,
        priority: L.AFTER_MISS.PERMANENT_DOUBLE_RETRY,
        handler: (data) => { submitDoubleStrikeDeclaration(data); }
    });
}

export function registerEmptyColBonus(eventBus) {
    // 空列和残血光环已改为纯函数 getAuraBonuses 实时计算，不再需要事件监听
}