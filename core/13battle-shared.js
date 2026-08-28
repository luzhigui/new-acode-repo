// core/13battle-shared.js - 光明顶5v5 战斗共享工具
// V5.6.1 | ~10000 bytes| 2026-08-26 抽战斗统计统一记账入口 recordCombatStat
export const VER = 'core/13battle-shared.js V5.6.1';

import { CONFIG } from './01config-5v5-test.js';
import { getRoleBonus } from './02unit.js';
import { pushBattleEvent } from '../infra/51-core-utils.js';
import { FACT_TYPES } from '../infra/56-battle-enums.js';
import { getEliteState, setEliteState } from './18-elite-state.js';
const C = CONFIG;

/**
 * 战斗统计统一记账入口（唯一入口，禁止绕过）
 * 所有伤害/治疗/反弹/吸血/闪避/免疫回退的统计字段增减，必须通过此函数。
 * 禁止直接修改 dmgDealt / dmgTaken / healDone / reboundDone / leechDone 字段。
 *
 * @param {object|null} source - 伤害/治疗来源单位（可为 null，治疗溢出或被动时记目标自身）
 * @param {object} target - 承受单位
 * @param {string} type - 记账类型：'damage' | 'heal' | 'rebound' | 'leech' | 'dodge' | 'immuneRollback'
 * @param {object} opts - 记账参数
 *   - rawAmount: 来袭全额（减免前，含溢出），承伤按此记
 *   - actualAmount: 实际损血量/治疗量（减免后/截断后），输出按此记
 */
function recordCombatStat(source, target, type, opts = {}) {
    if (!target || !target.alive) return;
    const rawAmount = opts.rawAmount ?? opts.actualAmount ?? 0;
    const actualAmount = opts.actualAmount ?? 0;

    switch (type) {
        case 'damage':
            // 承伤 = 来袭全额（防御减免前总量）；输出 = 实际损血量（clamp 后）
            target.dmgTaken += Math.abs(rawAmount);
            if (actualAmount > 0 && source) {
                source.dmgDealt = (source.dmgDealt || 0) + actualAmount;
            }
            break;

        case 'heal':
            // 治疗记产出者（source 优先，无 source 记自己），溢出治疗不记
            if (actualAmount > 0) {
                (source || target).healDone += actualAmount;
            }
            break;

        case 'rebound':
            // 反弹：source 记 reboundDone，target 记承伤
            if (source) {
                source.reboundDone = (source.reboundDone || 0) + Math.abs(rawAmount);
            }
            target.dmgTaken += Math.abs(rawAmount);
            break;

        case 'leech':
            // 吸血：治疗记 source，leechDone 也记 source
            if (source) {
                source.healDone += actualAmount;
                source.leechDone = (source.leechDone || 0) + actualAmount;
            }
            break;

        case 'dodge':
            // 闪避：承伤 = 来袭攻击力（rawAmount），无实际输出
            target.dmgTaken += Math.abs(rawAmount);
            break;

        case 'immuneRollback':
            // 免疫回退：承伤已记，只退输出
            if (source && actualAmount > 0) {
                source.dmgDealt = Math.max(0, (source.dmgDealt || 0) - actualAmount);
            }
            break;

        default:
            break;
    }
}

function emitFullUnitState(unit, eventType) {
    emitCoreEvent(unit, eventType, {
        uid: unit.uid,
        name: unit.name,
        role: unit.role,
        camp: unit.camp,
        pos: unit.pos,
        hp: unit.hp,
        maxHp: unit.maxHp,
        atk: unit.atk,
        def: unit.def,
        alive: unit.alive,
        isHorse: unit.isHorse || false,
        _isDead: unit.state._isDead || false
    });
}

let _battleRng = null;
export function setBattleRng(rng) { _battleRng = rng; }
export function getBattleRng() { return _battleRng; }

function finalizeDeaths(team) {
    for (const u of team) {
        if (u.hp <= 0 && u.alive) {
            applyStatChange(u, 'hp', -u.hp, null, '死亡结算', false);
            u.alive = false;
            u.state._isDead = true;
            if (!u._deathTime) u._deathTime = Date.now();
            emitCoreEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: false, atk: u.atk, def: u.def, _isDead: true });
        }
    }
}

function getNextAvailableUnit(team) {
    return team.filter(c => c.alive && !c.state._acted).sort((a, b) => a.pos - b.pos)[0] || null;
}

function swapUnitPositions(unitA, unitB) {
    if (!unitA || !unitB) return;
    const posA = unitA.pos;
    const posB = unitB.pos;
    unitA.pos = posB;
    unitB.pos = posA;
    emitEvent(unitA, 'pos-change', { pos: posB });
    emitEvent(unitB, 'pos-change', { pos: posA });
}

function moveUnitPosition(unit, newPos) {
    if (!unit || newPos == null) return;
    unit.pos = newPos;
    emitEvent(unit, 'pos-change', { pos: newPos });
}

function checkZhangSwitch(A, log) {
    let zhang = A.find(c => c.isZhang && c.alive && !getEliteState(c.uid)._zhangSwitched);
    if (!zhang) return;
    let col = (zhang.pos - 1) % 3;
    let hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.pos === 1 + col && c.uid !== zhang.uid);
    if (!hasFrontAlly) {
        zhang.rangedForm = false;
        const warriorBonus = getRoleBonus('战士');
        zhang.atk += warriorBonus.atk * 3;
        zhang.def += warriorBonus.def * 3;
        const newMaxHp = Math.min(zhang.maxHp + warriorBonus.maxHp * 3, zhang._baseMaxHp * 3);
        applyMaxHpChange(zhang, newMaxHp, null, '乾坤大挪移变身');
        zhang.role = '战士';
        zhang.state._resting = false; setEliteState(zhang.uid, { _zhangSwitched: true });
        zhang._baseMaxHp = zhang.maxHp;
        zhang._baseAtk = zhang.atk;
        zhang._baseDef = zhang.def;
        emitCoreEvent(zhang, 'zhang-switch', {
            atk: zhang.atk,
            def: zhang.def,
            maxHp: zhang.maxHp,
            hp: zhang.hp,
            role: zhang.role,
            rangedForm: false
        });
        log.push({
            factType: FACT_TYPES.ZHANG_SWITCH,
            data: {
                zhang,
                atkGain: warriorBonus.atk * 3,
                defGain: warriorBonus.def * 3,
                maxHpGain: warriorBonus.maxHp * 3
            }
        });
    }
}

function emitCoreEvent(unit, eventType, payload) {
    pushBattleEvent({ unitUid: unit.uid, eventType, payload });
}

function applyStatChange(target, field, delta, source, reason, record = true) {
    if (delta === 0 || !target || !target.alive) return false;
    const oldVal = target[field];
    const stepped = Math.floor((target[field] + delta) * 10) / 10;
    target[field] = field === 'hp' ? Math.min(target.maxHp, Math.max(0, stepped)) : stepped;
    if (field === 'hp' || field === 'maxHp') target[field] = Math.max(0, target[field]);
    if (field === 'hp' && record) {
        // 记账统一走 recordCombatStat：承伤=来袭全额（按 delta 记），输出=clamp 后实际损血；
        // 治疗记产出者（source 优先，无 source 记自己），溢出治疗不记
        const actualDelta = target.hp - oldVal;
        if (delta < 0) {
            recordCombatStat(source, target, 'damage', {
                rawAmount: Math.abs(delta),
                actualAmount: Math.abs(actualDelta)
            });
        } else if (actualDelta > 0) {
            recordCombatStat(source, target, 'heal', {
                actualAmount: actualDelta
            });
        }
    }
    if (field === 'hp' && target.hp <= 0) {
        target._pendingDeath = true;
        if (!target._deathTime) target._deathTime = Date.now();
    }
    emitCoreEvent(target, 'hp-change', {
        hp: target.hp, maxHp: target.maxHp, alive: target.alive,
        atk: target.atk, def: target.def, _isDead: target.state._isDead || false
    });
    return target._pendingDeath || false;
}

function applyMaxHpChange(target, newMaxHp, source, reason) {
    if (!target || !target.alive) return;
    const oldMaxHp = target.maxHp;
    if (oldMaxHp <= 0 || newMaxHp <= 0) return;
    const oldHp = target.hp;
    target.maxHp = newMaxHp;
    let newHp;
    if (newMaxHp > oldMaxHp) {
        newHp = oldHp + (newMaxHp - oldMaxHp);
    } else {
        newHp = Math.floor(oldHp * (newMaxHp / oldMaxHp));
    }
    newHp = Math.min(newHp, target.maxHp);
    const delta = newHp - oldHp;
    if (newHp <= 0) {
        applyStatChange(target, 'hp', -target.hp, null, 'maxHp变更致死', false);
    } else if (delta !== 0) {
        applyStatChange(target, 'hp', delta, source, reason, false);
    }
}

const _queries = {};
export function registerQuery(name, fn) { _queries[name] = fn; }
export function query(name, ...args) { return _queries[name] ? _queries[name](...args) : undefined; }

export {
    emitCoreEvent as emitEvent,
    emitFullUnitState,
    finalizeDeaths,
    getNextAvailableUnit,
    swapUnitPositions,
    moveUnitPosition,
    checkZhangSwitch,
    applyStatChange,
    applyMaxHpChange,
    recordCombatStat
};