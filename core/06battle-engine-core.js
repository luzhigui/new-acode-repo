// ===== ../core/06battle-engine-core.js =====
// core/06battle-engine-core.js - 光明顶5v5 战斗核心入口
// V5.1.0 | ~22000 bytes | 2026-07-16 拆分攻击模块至47、回合模块至48
export const VER = 'core/06battle-engine-core.js V5.1.0';

import { CONFIG, DEF_TAUNT, HP_TAUNT } from './01config-5v5-test.js';
import { rand, calcDamage, getFangLevel, isMelee, getFronts, isBlocked, getFlyDodgeRate, getRandomTaunt, getZhangNearTaunt, makeFXSnapshot, hasBuff, getUnitCol, getUnitRow } from './03battle-utils.js';
import { Unit } from './02unit.js';

// 从攻击模块导入
import { processUnitAttack } from './47battle-attack.js';
import { selectTarget, resolveDodge, calcAttackDamage, applyPostAttackEffects } from './49battle-attack-steps.js';

// 从回合模块导入
import { createRoundStepper, runBattleRound } from './48battle-round.js';

const C = CONFIG, DT = DEF_TAUNT, HT = HP_TAUNT;

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

// ==================== 重新导出 ====================
export {
    emitEvent,
    emitFullUnitState,
    finalizeDeaths,
    getNextAvailableUnit,
    checkZhangSwitch,
    selectTarget,
    resolveDodge,
    calcAttackDamage,
    applyPostAttackEffects,
    processUnitAttack,
    createRoundStepper,
    runBattleRound
};