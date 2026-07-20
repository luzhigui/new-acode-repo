// core/50battle-shared.js - 光明顶5v5 战斗共享工具
// V5.1.0 | 提取06和48的公共依赖，解开循环引用
export const VER = 'core/50battle-shared.js V5.1.0';

import { CONFIG } from './01config-5v5-test.js';
const C = CONFIG;

// ==================== 事件系统 ====================
function emitEvent(unit, eventType, payload) {
    if (typeof window._battleEvents === 'undefined' && !window.GlobalStore) return;
    payload.dmgDealt = unit.dmgDealt;
    payload.dmgTaken = unit.dmgTaken;
    payload.healDone = unit.healDone;
    payload.reboundDone = unit.reboundDone;
    payload.leechDone = unit.leechDone;
    payload.dodgeCount = unit.dodgeCount;
    payload.critCount = unit.critCount;
    payload.survivedRounds = unit.survivedRounds;
    payload.buffAtkBonus = unit.buffAtkBonus || 0;
    payload.buffDefBonus = unit.buffDefBonus || 0;
    payload.buffDodgeBonus = unit.buffDodgeBonus || 0;
    payload.buffHpBonus = unit.buffHpBonus || 0;
    if (unit._phantomTarget !== undefined) payload._phantomTarget = unit._phantomTarget;
    if (unit._resting !== undefined) payload._resting = unit._resting;
    payload._isAbsolute = true;
    window._battleEvents.push({ unitUid: unit.uid, eventType, payload });
}
window._emitEvent = emitEvent;

function emitFullUnitState(unit, eventType) {
    emitEvent(unit, eventType, {
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
        _isDead: unit._isDead || false
    });
}

// ==================== 辅助函数 ====================

function finalizeDeaths(team) {
    for (const u of team) {
        if (u.hp <= 0 && u.alive) {
            u.hp = 0;
            u.alive = false;
            u._isDead = true;
            if (!u._deathTime) u._deathTime = Date.now();
            emitEvent(u, 'hp-change', { hp: 0, maxHp: u.maxHp, alive: false, atk: u.atk, def: u.def, _isDead: true });
            emitEvent(u, 'unit-remove', { uid: u.uid });
        }
    }
}

function getNextAvailableUnit(team) {
    return team.filter(c => c.alive && !c._acted).sort((a, b) => a.pos - b.pos)[0] || null;
}

function checkZhangSwitch(A, log) {
    let zhang = A.find(c => c.isZhang && c.alive && !c._zhangSwitched);
    if (!zhang) return;
    let col = (zhang.pos - 1) % 3;
    let hasFrontAlly = A.some(c => c.alive && !c.isHorse && c.pos === 1 + col && c.uid !== zhang.uid);
    if (!hasFrontAlly) {
        zhang.rangedForm = false; zhang.atk += 3; zhang.def += 2;
        zhang.maxHp = Math.min(zhang.maxHp + 50, zhang._baseMaxHp * 2);
        zhang.hp = Math.min(zhang.hp + 50, zhang.maxHp); zhang.role = '战士';
        zhang._blocked = false; zhang._resting = false; zhang._zhangSwitched = true;
        zhang._baseMaxHp = zhang.maxHp;
        emitEvent(zhang, 'zhang-switch', {
            atk: zhang.atk,
            def: zhang.def,
            maxHp: zhang.maxHp,
            hp: zhang.hp,
            role: zhang.role,
            rangedForm: false
        });
        log.push({ type:'info', text:`<span class="gold">⚔️ 张无忌切换近战形态！攻+3、防+2、生命上限+50</span>`, isZhangSwitch:true, unit: zhang });
        log.push({ type:'info', text:`<span class="gold">🗣️ 张无忌：不好，要顶上去了！</span>`, isZhangTaunt:true });
    }
}

export {
    emitEvent,
    emitFullUnitState,
    finalizeDeaths,
    getNextAvailableUnit,
    checkZhangSwitch
};