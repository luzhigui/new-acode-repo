// V6.0.0 | ~10000 bytes | 2026-08-26 抽战斗统计统一记账入口 recordCombatStat
export const VER = 'core/13battle-shared.js V6.0.0';

import { CONFIG } from './01config-5v5-test.js';
import { getRoleBonus } from './02unit.js';
import { pushBattleEvent } from '../infra/51-core-utils.js';
import { FACT_TYPES, UNIT_EVENT_TYPES, ROLE_TYPES } from '../infra/56-battle-enums.js';
const C = CONFIG;

// 战斗统计统一记账入口（唯一入口）。承伤记 rawAmount（减免前全额），
// 输出记 actualAmount（clamp 后）。禁止绕过此函数直接改统计字段。
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
    if (source && source.uid !== target.uid && (type === 'damage' || type === 'heal' || type === 'rebound' || type === 'leech')) {
        emitCoreEvent(source, UNIT_EVENT_TYPES.HP_CHANGE, {
            hp: source.hp, maxHp: source.maxHp, alive: source.alive,
            atk: source.atk, def: source.def, _isDead: source.state?._isDead || false,
            dmgDealt: source.dmgDealt, healDone: source.healDone,
            reboundDone: source.reboundDone, leechDone: source.leechDone
        });
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
        _isDead: unit.state._isDead || false,
        _baseAtk: unit.state._baseAtk,
        _baseDef: unit.state._baseDef,
        _baseMaxHp: unit.state._baseMaxHp,
        _initAtk: unit.state._initAtk,
        _initDef: unit.state._initDef,
        _initMaxHp: unit.state._initMaxHp,
        _hpDmgRatio: unit.state._hpDmgRatio,
        _originalPos: unit.state._originalPos
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
            if (!u.state._deathTime) u.state._deathTime = Date.now();
            emitCoreEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: false, atk: u.atk, def: u.def, _isDead: true });
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
    // emitEvent 只是导出别名，模块内部必须用真实函数名 emitCoreEvent
    emitCoreEvent(unitA, UNIT_EVENT_TYPES.POS_CHANGE, { pos: posB });
    emitCoreEvent(unitB, UNIT_EVENT_TYPES.POS_CHANGE, { pos: posA });
}

function moveUnitPosition(unit, newPos) {
    if (!unit || newPos == null) return;
    unit.pos = newPos;
    // 同上：模块内部用 emitCoreEvent，不用导出别名 emitEvent
    emitCoreEvent(unit, UNIT_EVENT_TYPES.POS_CHANGE, { pos: newPos });
}

function checkZhangSwitch(A, log) {
    let zhang = A.find(c => c.isZhang && c.alive && !c.state._zhangSwitched);
    if (!zhang) return;
    let col = (zhang.pos - 1) % 3;
    let hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.pos === 1 + col && c.uid !== zhang.uid);
    if (!hasFrontAlly) {
        zhang.rangedForm = false;
        const warriorBonus = getRoleBonus(ROLE_TYPES.WARRIOR);
        addMod(zhang, 'atk', { source: '近战切换', value: warriorBonus.atk * 3, ttl: 'permanent', group: 'zhangSwitch', op: 'add' });
        addMod(zhang, 'def', { source: '近战切换', value: warriorBonus.def * 3, ttl: 'permanent', group: 'zhangSwitch', op: 'add' });
        addMod(zhang, 'maxHp', { source: '近战切换', value: warriorBonus.maxHp * 3, ttl: 'permanent', group: 'zhangSwitch', op: 'add' });
        applyMaxHpChange(zhang, getStat(zhang, 'maxHp'), null, '乾坤大挪移变身');
        zhang.role = ROLE_TYPES.WARRIOR;
        zhang.state._resting = false; Object.assign(zhang.state, { _zhangSwitched: true });
        emitCoreEvent(zhang, UNIT_EVENT_TYPES.ZHANG_SWITCH, {
            atk: getStat(zhang, 'atk'),
            def: getStat(zhang, 'def'),
            maxHp: getStat(zhang, 'maxHp'),
            hp: zhang.hp,
            role: zhang.role,
            rangedForm: false,
            _baseAtk: zhang.state._baseAtk,
            _baseDef: zhang.state._baseDef,
            _baseMaxHp: zhang.state._baseMaxHp
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
        // 承伤记全额，输出记实际值；治疗记产出者，溢出不记
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
        target.state._pendingDeath = true;
        if (!target.state._deathTime) target.state._deathTime = Date.now();
    }
    emitCoreEvent(target, UNIT_EVENT_TYPES.HP_CHANGE, {
        hp: target.hp, maxHp: target.maxHp, alive: target.alive,
        atk: target.atk, def: target.def, _isDead: target.state._isDead || false,
        dmgDealt: target.dmgDealt, dmgTaken: target.dmgTaken,
        healDone: target.healDone, reboundDone: target.reboundDone,
        leechDone: target.leechDone, dodgeCount: target.dodgeCount,
        critCount: target.critCount, survivedRounds: target.survivedRounds,
        _baseAtk: target.state._baseAtk, _baseDef: target.state._baseDef, _baseMaxHp: target.state._baseMaxHp
    });
    return target.state._pendingDeath || false;
}

function applyMaxHpChange(target, newMaxHp, source, reason) {
    if (!target || !target.alive) return;
    const oldMaxHp = target.maxHp;
    if (oldMaxHp <= 0 || newMaxHp <= 0) return;
    const oldHp = target.hp;
    // maxHp 变化时 hp 按比例缩放：上限升则 hp 等量加，上限降则 hp 等比例降
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

// ========== 属性词条系统 ==========
// 属性只算不存：所有加成登记为词条，getStat 现算。
// 词条结构：{ source, value, ttl, group, op }
//   ttl: 'permanent' | 'round' | 'attached'
//   op:  'add'（默认）| 'mul'（百分比，存 0.3 表示 +30%）
// 计算规则：所有 add 求和，所有 mul 求和后统一乘：(base + addSum) × (1 + mulSum)
export function addMod(unit, stat, mod) {
    if (!unit) return;
    if (!unit._mods) unit._mods = { atk: [], def: [], maxHp: [] };
    if (!unit._mods[stat]) unit._mods[stat] = [];
    unit._mods[stat].push(mod);
}

export function removeModsByTTL(unit, ttl) {
    if (!unit || !unit._mods) return;
    for (const stat of Object.keys(unit._mods)) {
        unit._mods[stat] = unit._mods[stat].filter(m => m.ttl !== ttl);
    }
}

export function removeModsByGroup(unit, group) {
    if (!unit || !unit._mods) return;
    for (const stat of Object.keys(unit._mods)) {
        unit._mods[stat] = unit._mods[stat].filter(m => m.group !== group);
    }
}

export function getStat(unit, stat) {
    if (!unit) return 0;
    const baseKey = '_base' + stat.charAt(0).toUpperCase() + stat.slice(1);
    const base = unit.state?.[baseKey] ?? unit[stat] ?? 0;
    const mods = (unit._mods && unit._mods[stat]) || [];
    let addSum = 0;
    let mulSum = 0;
    for (const m of mods) {
        if (m.op === 'mul') mulSum += m.value;
        else addSum += m.value;
    }
    const result = (base + addSum) * (1 + mulSum);
    return Math.max(0, Math.floor(result * 10) / 10);
}

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