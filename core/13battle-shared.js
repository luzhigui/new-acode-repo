// core/13battle-shared.js - 光明顶5v5 战斗共享工具
// V5.5.2 | ~6496 bytes| 2026-08-21 infra合并：事件存储改从51-core-utils导入
export const VER = 'core/13battle-shared.js V5.5.2';

import { CONFIG } from './01config-5v5-test.js';
import { ROLE_BONUS } from './02unit.js';
import { pushBattleEvent } from '../infra/51-core-utils.js';
const C = CONFIG;

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
            applyStatChange(u, 'hp', -u.hp, null, '死亡结算');
            u.alive = false;
            u.state._isDead = true;
            if (!u._deathTime) u._deathTime = Date.now();
        }
    }
}

function getNextAvailableUnit(team) {
    return team.filter(c => c.alive && !c.state._acted).sort((a, b) => a.pos - b.pos)[0] || null;
}

function swapUnitPositions(unitA, unitB) {
    if (!unitA || !unitB) return;
    const posA = unitA.pos;
    unitA.pos = unitB.pos;
    unitB.pos = posA;
}

function moveUnitPosition(unit, newPos) {
    if (!unit || newPos == null) return;
    unit.pos = newPos;
}

function checkZhangSwitch(A, log) {
    let zhang = A.find(c => c.isZhang && c.alive && !c._zhangSwitched);
    if (!zhang) return;
    let col = (zhang.pos - 1) % 3;
    let hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.pos === 1 + col && c.uid !== zhang.uid);
    if (!hasFrontAlly) {
        zhang.rangedForm = false;
        const warriorBonus = ROLE_BONUS['战士'];
        zhang.atk += warriorBonus.atk * 3;
        zhang.def += warriorBonus.def * 3;
        const newMaxHp = Math.min(zhang.maxHp + warriorBonus.maxHp * 3, zhang._baseMaxHp * 3);
        applyMaxHpChange(zhang, newMaxHp, null, '乾坤大挪移变身');
        zhang.role = '战士';
        zhang.state._resting = false; zhang._zhangSwitched = true;
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
            factType: 'zhangSwitch',
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

function applyStatChange(target, field, delta, source, reason) {
    if (delta === 0 || !target || !target.alive) return false;
    const oldVal = target[field];
    const stepped = Math.floor((target[field] + delta) * 10) / 10;
    target[field] = field === 'hp' ? Math.min(target.maxHp, Math.max(0, stepped)) : stepped;
    if (field === 'hp' || field === 'maxHp') target[field] = Math.max(0, target[field]);
    if (field === 'hp') {
        if (delta < 0) {
            target.dmgTaken += Math.abs(delta);
            if (source) source.dmgDealt = (source.dmgDealt || 0) + Math.abs(delta);
        } else {
            target.healDone += delta;
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
        applyStatChange(target, 'hp', -target.hp, null, 'maxHp变更致死');
    } else if (delta !== 0) {
        applyStatChange(target, 'hp', delta, source, reason);
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
    applyMaxHpChange
};