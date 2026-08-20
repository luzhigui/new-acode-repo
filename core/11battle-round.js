// core/11battle-round.js - 光明顶5v5 回合循环与生成器
// V5.5.3 | ~23500 bytes| 2026-08-17 事实化重构：全部日志走render/30
export const VER = 'core/11battle-round.js V5.5.3';

import { CONFIG } from './01config-5v5-test.js';
import { isMelee, isBlocked, makeFXSnapshot, hasBuff, getUnitCol, getUnitRow, hasAnyEnemyEmptyCol, countEnemyEmptyCols, getBloodAuraBonus, getAuraBonuses, registerWarriorBreakDefense, registerRangedGrowth, registerFortifyShield, registerWarriorExecute, selectFlyTarget, registerEmptyColBonus, registerDoubleStrike } from './03battle-utils.js';
import { computeBuffStats, logBuffSummary, applyHolyFlameBonus, applyFortifyBonus, applyCarryBonus, registerBloodthirst, registerHotBlood, registerWindAssault, registerMeteorShower, registerMindControl } from './04buff-system.js';
import { spawnHorse, destroyHorse } from './05battle-horse.js';
import { Unit } from './02unit.js';
import { clearEliteDodgeRules, getDodgeRules } from './12battle-attack-steps.js';

import { getEliteFactories } from './08-elite-registry.js';
import { processUnitAttack } from './10battle-attack.js';
import { eventBus, EXECUTION_LAYER as L } from '../infra/50-event-bus.js';
import { getNextAvailableUnit, finalizeDeaths, emitFullUnitState, checkZhangSwitch, emitEvent, applyStatChange, setBattleRng } from './13battle-shared.js';
import { flushBattleEvents, setBattleState } from '../infra/53-battle-event-store.js';
import { SeededRNG } from '../infra/52-rng.js';
import { resolveDeaths } from './12battle-attack-steps.js';
import {
    renderHorseSummonFact,
    renderKuLianFact,
    renderDoubleStrikeFact,
    renderPassFact,
    renderRoundStartFact,
    renderRoundEndFact,
    renderDoubleStrikeSummaryFact
} from '../render/30-fact-renderer.js';

const C = CONFIG;

async function prepareRoundStart(A, B, log, state, round, rng) {
    A._activeBuffs = state.activeBuffs.filter(b => b.target === 'ally' || !b.target);
    B._activeBuffs = state.activeBuffs.filter(b => b.target === 'enemy');

    const xiaoZhao = A.find(u => (u.isXiaoZhaoSister || u.isXiaoZhaoBrother) && u.alive);

    setBattleState('currentBattleState', null);
    flushBattleEvents();

    log.push(renderRoundStartFact({ round }));

    const teamHorseA = spawnHorse(A, log, B);
    if (teamHorseA) {
        log.push(renderHorseSummonFact({ pos: teamHorseA.pos, horseUid: teamHorseA.uid, horseTaunt: '嘶——！' }));
    }
    const teamHorseB = spawnHorse(B, log, A);
    if (teamHorseB) {
        log.push(renderHorseSummonFact({ pos: teamHorseB.pos, horseUid: teamHorseB.uid, horseTaunt: '嘶——！' }));
    }

    let doubleStrikeUnitUid = null;
    if (hasBuff(A._activeBuffs, 'doubleStrike')) {
        let candidates = A.filter(u => u.alive && !u.isHorse);
        if (candidates.length > 0) {
            let chosen = candidates[rng.nextInt(0, candidates.length - 1)];
            doubleStrikeUnitUid = chosen.uid;
        }
    }

    setBattleState('currentBattleState', { ally: state.allAllies, enemy: state.enemy });

    if (doubleStrikeUnitUid) {
        const dsUnit = A.find(u => u.uid === doubleStrikeUnitUid);
        if (dsUnit) log.push(renderDoubleStrikeSummaryFact({ unitName: dsUnit.name }));
    }

    log.filter(l => l.type === 'buff-summon').forEach(hl => {
        const team = hl.buffType === 'summon' ? A : B;
        const horse = team.find(u => u.uid === hl.horseUid);
        if (horse) {
            emitFullUnitState(horse, 'unit-add');
        }
    });

    A._activeBuffs.forEach(b => {
        if (b.key === 'holyFlame') {
            const cols = [];
            while (cols.length < 1) { const c = rng.nextInt(1, 3); if (!cols.includes(c)) cols.push(c); }
            cols.sort((a, b) => a - b);
            const rows = [];
            while (rows.length < 2) { const r = rng.nextInt(1, 3); if (!rows.includes(r)) rows.push(r); }
            rows.sort((a, b) => a - b);
            b.cols = cols;
            b.rows = rows;
        }
    });
    A.forEach(u => {
        if (u.alive && u.camp === 'ally') {
            applyHolyFlameBonus(u, A._activeBuffs || []);
        }
    });

    eventBus.clearAll();

    clearEliteDodgeRules();

    registerWarriorBreakDefense(eventBus);
    registerRangedGrowth(eventBus);
    registerFortifyShield(eventBus);
    registerWarriorExecute(eventBus);
    registerBloodthirst(eventBus);
    registerHotBlood(eventBus);
    registerWindAssault(eventBus);
    registerMeteorShower(eventBus);
    registerMindControl(eventBus);
    eventBus.on('beforeActionSelect', L.BEFORE_ACTION.KULIAN_PRIORITY, (data) => {
        if (data.unit.name !== '宋青书' || !data.unit.alive || !data.unit._kuLianActive) return;
        data.declaration.priority = 1;
    });
    eventBus.on('beforeSelectTarget', L.BEFORE_SELECT_TARGET.FLY_TARGET, (data) => {
        if (data.unit.role !== '飞行' || data.unit.isWei) return;
        const flyTarget = selectFlyTarget(data.unit, data.enemySide);
        if (flyTarget) data.targetResult = flyTarget;
    });
    registerDoubleStrike(eventBus, doubleStrikeUnitUid, A, A._activeBuffs);
    registerEmptyColBonus(eventBus);

    const factories = getEliteFactories();
    let sisterComp = null;
    let brotherComp = null;
    const allUnits = [...A, ...B];
    for (const u of allUnits) {
        if (!u.alive) continue;
        if (u.name === '成昆' && u.camp === 'enemy') {
            u._fortifyIncrement = CONFIG.FORTIFY_INCREMENT * 2;
            u._fortifyCap = CONFIG.FORTIFY_CAP * 2;
        }
        if (u.isXiaoZhaoSister && u.camp === 'ally') {
            const Factory = factories.get('小昭·姊');
            if (Factory && !sisterComp) sisterComp = Factory();
            if (sisterComp) sisterComp.register(eventBus, A, B, log);
        } else if (u.isXiaoZhaoBrother && u.camp === 'ally') {
            const Factory = factories.get('小昭·妹');
            if (Factory && !brotherComp) brotherComp = Factory();
            if (brotherComp) brotherComp.register(eventBus, A, B, log);
        } else {
            const Factory = factories.get(u.name);
            if (Factory) Factory().register(eventBus, A, B, log);
        }
    }
    const xuanmingFactory = factories.get('玄冥联动');
    if (xuanmingFactory) xuanmingFactory(eventBus);

    const song = B.find(u => u.name === '宋青书' && u.alive);
    const zhou = B.find(u => u.name === '周芷若' && u.alive);
    if (song && zhou) { song._linkedPartnerUid = zhou.uid; zhou._linkedPartnerUid = song.uid; }
    const lu = B.find(u => u.name === '鹿杖客' && u.alive);
    const he = B.find(u => u.name === '鹤笔翁' && u.alive);
    if (lu && he) { lu._linkedPartnerUid = he.uid; he._linkedPartnerUid = lu.uid; }

    eventBus.emit('onRoundStart', { A, B, log });

    A._butterflyTriggered = false;
            A._mindControlTriggered = false;
    A.forEach(u => {
        if (!u.alive) return;
        emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, _stunned: false });
        let allyTeamWithDead = A.slice();
        let hasCarryActive = hasBuff(A._activeBuffs, 'carry');
        if (hasCarryActive) {
            allyTeamWithDead = allyTeamWithDead.concat((state.allAllies || state.ally).filter(c => !c.alive));
            allyTeamWithDead = allyTeamWithDead.filter((u, i, arr) => arr.findIndex(v => v.uid === u.uid) === i);
        }
        let stats = computeBuffStats(u, A._activeBuffs || [], allyTeamWithDead);

        applyHolyFlameBonus(u, A._activeBuffs || []);
        applyFortifyBonus(u, A._activeBuffs || []);

        emitEvent(u, 'stat-bonus-change', {
            buffAtkBonus: stats.atkBonus,
            buffDefBonus: stats.defBonus,
            buffDodgeBonus: stats.dodgeBonus,
            buffHpBonus: stats.hpBonus
        });
        emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, buffAtkBonus: u.buffAtkBonus, buffDefBonus: u.buffDefBonus, _holyAtkBonus: u._holyAtkBonus, _holyDefBonus: u._holyDefBonus, _fortifyDefBonus: u._fortifyDefBonus, _emptyColBonus: u._emptyColBonus, _bloodAuraBonus: u._bloodAuraBonus, _carryAtkBonus: u._carryAtkBonus, _carryDefBonus: u._carryDefBonus });
        emitEvent(u, 'stat-bonus-change', {
            buffAtkBonus: stats.atkBonus,
            buffDefBonus: stats.defBonus,
            buffDodgeBonus: stats.dodgeBonus,
            buffHpBonus: stats.hpBonus
        });

        applyCarryBonus(u, A, state, log, stats);

        const auraBonuses = getAuraBonuses(u, A, B);
        const targetAtk = (u._baseAtk || u.atk) + (u._carryAtkBonus || 0) + (u._butterflyAtkBonus || 0) + (u._holyAtkBonus || 0) + auraBonuses.emptyCol + auraBonuses.bloodAura;
        const targetDef = (u._baseDef || u.def) + (u._carryDefBonus || 0) + (u._butterflyDefBonus || 0) + (u._holyDefBonus || 0) + (u._fortifyDefBonus || 0);
        applyStatChange(u, 'atk', targetAtk - u.atk, null, '光环加成');
        applyStatChange(u, 'def', targetDef - u.def, null, '光环加成');

        emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def });

        u.state._acted = false;
        u.state._resting = false;
        if (u.state._restingTimer) { clearTimeout(u.state._restingTimer); u.state._restingTimer = null; }
        u._doubleStriked = false;
        u.state._stunned = false;
        u._nineYinFirstDone = false;
        u._xingFenActive = false;
        u._xingFenExtraAttacking = false;
        u._xiaoZhaoDoubleStriked = false;
        u._bloodthirstStriked = false;
        u._linkTriggered = false;
        u._fortifyThisRound = 0;
        u._butterflyHpBonus = 0;
        u._butterflyAtkBonus = 0;
        u._butterflyDefBonus = 0;
    });

    B.forEach(u => {
        if (!u.alive) return;
        emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, _stunned: false });
        u.state._acted = false;
        u.state._resting = false;
        u._doubleStriked = false;
        u.state._stunned = false;
        u._nineYinFirstDone = false;
        u._xingFenActive = false;
        u._xingFenExtraAttacking = false;
        u._xiaoZhaoDoubleStriked = false;
        u._bloodthirstStriked = false;
        u._linkTriggered = false;
        const auraBonuses = getAuraBonuses(u, B, A);
        const targetAtk = (u._baseAtk || u.atk) + auraBonuses.emptyCol + auraBonuses.bloodAura;
        applyStatChange(u, 'atk', targetAtk - u.atk, null, '光环加成');
        emitEvent(u, 'hp-change', { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def });
        u._fortifyThisRound = 0;
    });

    const dodgeUnits = [...A, ...B];
    for (const u of dodgeUnits) {
        if (!u.alive) continue;
        const rates = [];
        const dodgeRules = getDodgeRules();
        for (const ruleFn of dodgeRules) {
            const r = ruleFn(u, null) || 0;
            if (r > 0) rates.push(r);
        }
        const allyTeam = u.camp === 'ally' ? A : B;
        const activeBuffs = u.camp === 'ally' ? A._activeBuffs : B._activeBuffs;
        const buffStats = computeBuffStats(u, activeBuffs, allyTeam);
        if (buffStats.dodgeBonus > 0) rates.push(buffStats.dodgeBonus);
        let product = 1;
        for (const r of rates) { product *= (1 - r); }
        u._dodgeChance = Math.round((1 - product) * 100);
    }

    logBuffSummary(A, log, doubleStrikeUnitUid);

    if (round === 1 && A.some(u => u.isXiaoZhaoSister && u.alive)) {
        const requestDirection = typeof state.requestFlyDirection === 'function' ? state.requestFlyDirection : null;
        const direction = requestDirection ? await requestDirection() : (A._flyDirection || 'right');
        A._flyDirection = direction || 'right';
    }

    const roundStartEvents = flushBattleEvents();
    return { doubleStrikeUnitUid, roundStartEvents, sisterComp, brotherComp };
}

export async function* createRoundStepper(state) {
    const rng = state._rng || new SeededRNG(Date.now());
    state._rng = rng;
    setBattleRng(rng);
    if (!state.allAllies) {
        state.allAllies = state.ally.map(u => u.clone());
    } else {
        const allyById = new Map(state.ally.map(u => [u.uid, u]));
        state.allAllies.forEach(full => {
            const cur = allyById.get(full.uid);
            if (cur) {
                full.hp = cur.hp; full.maxHp = cur.maxHp; full.alive = cur.alive;
                full.atk = cur.atk; full.def = cur.def;
                if (cur.state._isDead !== undefined) full.state._isDead = cur.state._isDead;
            } else {
                full.alive = false; full.state._isDead = true;
            }
        });
    }
    let A = state.ally.map(u => u.clone());
    let B = state.enemy.map(u => u.clone());
    if (state.ally._flyDirection) A._flyDirection = state.ally._flyDirection;
    let log = [];
    let round = state.round;

    const { doubleStrikeUnitUid, roundStartEvents, sisterComp, brotherComp } = await prepareRoundStart(A, B, log, state, round, rng);

    yield { log: [...log], events: roundStartEvents, ally: A, enemy: B, winner: null, done: false, doubleStrikeUid: doubleStrikeUnitUid };
    log = [];

    function resolveStateTransitions() {
        const stateTransitions = [];
        if (A._pendingStateTransitions) {
            stateTransitions.push(...A._pendingStateTransitions);
            A._pendingStateTransitions = [];
        }
        if (B._pendingStateTransitions) {
            stateTransitions.push(...B._pendingStateTransitions);
            B._pendingStateTransitions = [];
        }
        eventBus.emit('beforeStateTransition', { A, B, log, declarations: stateTransitions });
        const delayedDecls = [];
        for (const decl of stateTransitions) {
            if (decl.type === 'butterflyAttach') {
                sisterComp.executeAttach(A, log);
            } else if (decl.type === 'butterflyReturn') {
                delayedDecls.push(decl);
                continue;
            } else if (decl.type === 'spiderFly') {
                brotherComp.executeFly(decl.unit, decl.incomingDmg, A, log);
            } else if (decl.type === 'spiderDescend') {
                delayedDecls.push(decl);
                continue;
            }
        }
        if (delayedDecls.length > 0) {
            if (!A._pendingStateTransitions) A._pendingStateTransitions = [];
            A._pendingStateTransitions.push(...delayedDecls);
        }
    }

    function resolveActionOrder(candidates, log) {
        resolveStateTransitions();
        const sortedByPos = [...candidates].filter(u => u.alive && !u.state._isDead).sort((a, b) => a.pos - b.pos);
        const passUnits = [];
        const priorityDeclarations = [];

        for (const u of sortedByPos) {
            if (u.state._stunned) {
                passUnits.push({ unit: u, reason: '眩晕' });
                continue;
            }
            if (u.isHorse) {
                passUnits.push({ unit: u, reason: '拒马休息' });
                continue;
            }
            if (u.state._flyMode === 'butterfly' || u.state._flyMode === 'spider' || u.state._spiderFlying || (u._fsm && u._fsm.is('flying'))) {
                passUnits.push({ unit: u, reason: '飞天/附身' });
                continue;
            }
            const fullAllySide = u.camp === 'ally' ? A : B;
            if (isBlocked(u, fullAllySide) && isMelee(u.role)) {
                passUnits.push({ unit: u, reason: '被遮挡' });
                continue;
            }
            const decl = { priority: 0, skip: false, pass: false };
            eventBus.emit('beforeActionSelect', { unit: u, declaration: decl });
            if (decl.skip) continue;
            if (decl.pass) {
                passUnits.push({ unit: u, reason: '组件声明pass' });
                continue;
            }
            priorityDeclarations.push({ unit: u, priority: decl.priority });
        }

        const queue = [];
        for (const d of priorityDeclarations) {
            queue.push({ unit: d.unit, isPass: false, priority: d.priority, reason: null });
        }
        for (const p of passUnits) {
            queue.push({ unit: p.unit, isPass: true, priority: 0, reason: p.reason });
        }
        queue.sort((a, b) => {
            if (a.priority !== b.priority) return b.priority - a.priority;
            return a.unit.pos - b.unit.pos;
        });

        if (queue.length === 0) return { actingUnit: null, passEntry: null, isPriorityAction: false };
        const head = queue[0];
        if (head.isPass) {
            if (head.unit._kuLianActive) {
                log.push(renderKuLianFact({ unitName: head.unit.name, atkBonus: 0, defBonus: 0, hpBonus: 0, priority: true }));
            }
            return { actingUnit: null, passEntry: { unit: head.unit, reason: head.reason }, isPriorityAction: false };
        }
        if (head.priority > 0 && head.unit._kuLianActive) {
            log.push(renderKuLianFact({ unitName: head.unit.name, atkBonus: 0, defBonus: 0, hpBonus: 0, priority: true }));
        }
        return { actingUnit: head.unit, passEntry: null, isPriorityAction: head.priority > 0 };
    }

    let currentSide = state._firstSide || 'enemy';

    while (A.some(u => u.alive && !u.state._acted) || B.some(u => u.alive && !u.state._acted)) {
        const currentTeam = currentSide === 'ally' ? A : B;
        if (currentSide === 'ally' && !A._butterflyTriggered) {
            A._butterflyTriggered = true;
            const sisterForAttach = A.find(u => u.isXiaoZhaoSister && u.alive && !u.state._stunned && !u.state._butterflyHost);
            if (sisterForAttach) {
                sisterComp.executeAttach(A, log);
                const attachEvents = flushBattleEvents();
                yield { log: [...log], events: attachEvents, ally: A, enemy: B, winner: null, done: false, doubleStrikeUid: doubleStrikeUnitUid };
                log = [];
            }
        }
        const candidates = currentTeam.filter(u => u.alive && !u.state._acted).sort((a, b) => a.pos - b.pos);
        if (candidates.length === 0) {
            currentSide = currentSide === 'ally' ? 'enemy' : 'ally';
            continue;
        }
        const orderResult = resolveActionOrder(candidates, log);

        if (orderResult.passEntry) {
            const { unit, reason } = orderResult.passEntry;
            unit.state._acted = true;
            unit.state._blocked = isBlocked(unit, currentTeam);
            if (unit.alive && (reason === '被遮挡' || reason === '拒马休息')) {
                applyStatChange(unit, 'hp', 15, null, '休息回复');
            }
            const passFact = { unit, reason, events: [] };
            passFact.events = flushBattleEvents();
            log.push(renderPassFact(passFact));
            continue;
        }

        if (!orderResult.actingUnit) {
            currentSide = currentSide === 'ally' ? 'enemy' : 'ally';
            continue;
        }

        let actingUnit = orderResult.actingUnit;
        let isPriorityAction = orderResult.isPriorityAction;

        let unit = actingUnit;
        let allySide = unit.camp === 'ally' ? A : B;
        let enemySide = unit.camp === 'ally' ? B : A;

        unit.state._blocked = isBlocked(unit, allySide);
        unit.survivedRounds++;

        if (unit.camp === 'ally' && unit.isXiaoZhaoSister && !(unit._fsm && unit._fsm.is('attached')) && !A._butterflyTriggered) {
            isPriorityAction = true;
        }

        await processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);

        resolveDeaths(A, B, log);

        if (!isPriorityAction) {
            currentSide = currentSide === 'ally' ? 'enemy' : 'ally';
        }

        finalizeDeaths(A);
        finalizeDeaths(B);
        const endStateTransitions = [];
        eventBus.emit('onRoundEnd', { A, B, log, forced: false, declarations: endStateTransitions });
        for (const decl of endStateTransitions) {
            if (decl.type === 'butterflyReturn') {
                if (!A._pendingStateTransitions) A._pendingStateTransitions = [];
                A._pendingStateTransitions.push(decl);
            } else if (decl.type === 'spiderDescend') {
                if (!A._pendingStateTransitions) A._pendingStateTransitions = [];
                A._pendingStateTransitions.push(decl);
            }
        }
        resolveDeaths(A, B, log);
        const stepEvents = flushBattleEvents();
        const allyAlive = A.some(u => u.alive);
        const enemyAlive = B.some(u => u.alive);
        let winner = null;
        let done = false;
        if (!allyAlive) { winner = '六大派'; done = true; }
        else if (!enemyAlive) { winner = '明教'; done = true; }

        if (winner) {
            eventBus.emit('onRoundEnd', { A, B, log, forced: true });
            const winPendingDecls = [];
            if (A._pendingStateTransitions) { winPendingDecls.push(...A._pendingStateTransitions); A._pendingStateTransitions = []; }
            if (B._pendingStateTransitions) { winPendingDecls.push(...B._pendingStateTransitions); B._pendingStateTransitions = []; }
            for (const decl of winPendingDecls) {
                if (decl.type === 'butterflyReturn') {
                    sisterComp.executeReturn(decl.sister, A, log);
                } else if (decl.type === 'spiderDescend') {
                    brotherComp.executeDescend(decl.unit, A, B, log);
                }
            }
        }

        yield { log: [...log], events: stepEvents, ally: A, enemy: B, winner, done };
        log = [];

        if (done) return;
    }

    const allPendingDecls = [];
    if (A._pendingStateTransitions) { allPendingDecls.push(...A._pendingStateTransitions); A._pendingStateTransitions = []; }
    if (B._pendingStateTransitions) { allPendingDecls.push(...B._pendingStateTransitions); B._pendingStateTransitions = []; }
    for (const decl of allPendingDecls) {
        if (decl.type === 'butterflyReturn') {
            sisterComp.executeReturn(decl.sister, A, log);
        } else if (decl.type === 'spiderDescend') {
            brotherComp.executeDescend(decl.unit, A, B, log);
        }
    }

    const { winner, done, endEvents } = finalizeRoundEnd(A, B, log, round);
    yield { log: [...log], events: endEvents, ally: A, enemy: B, winner, done };
}

function finalizeRoundEnd(A, B, log, round) {
    [A, B].forEach(team => {
        for (let i = team.length - 1; i >= 0; i--) {
            const u = team[i];
            u.state._resting = false;
            if (u.state._restingTimer) { clearTimeout(u.state._restingTimer); u.state._restingTimer = null; }
        }
    });

    destroyHorse(A, log); destroyHorse(B, log);
    A._activeBuffs = (A._activeBuffs || []).map(b => ({...b, remaining: b.remaining - 1})).filter(b => b.remaining > 0);
    B._activeBuffs = (B._activeBuffs || []).map(b => ({...b, remaining: b.remaining - 1})).filter(b => b.remaining > 0);

    let winner = null;
    let done = false;
    if (B.every(c => !c.alive)) { winner = '明教'; done = true; }
    else if (A.every(c => !c.alive)) { winner = '六大派'; done = true; }
    if (round >= C.MAX_ROUND && !done) { winner = '平局'; done = true; }

    eventBus.emit('onRoundEnd', { A, B, log, forced: true });

    if (winner) {
        let losers = winner === '明教' ? B : A;
        losers.forEach(u => {
            applyStatChange(u, 'hp', -u.hp, null, '战斗结束');
            u.alive = false;
            u.state._isDead = true;
            emitEvent(u, 'hp-change', { hp: 0, maxHp: u.maxHp, alive: false, atk: u.atk, def: u.def, _isDead: true });
        });
    }

    log.push(renderRoundEndFact({ round }));

    const endEvents = flushBattleEvents();

    finalizeDeaths(A);
    finalizeDeaths(B);
    return { winner, done, endEvents };
}

export function runBattleRound(state) {
    const stepper = createRoundStepper(state);
    let finalResult = null;
    for (const step of stepper) {
        finalResult = step;
    }
    return {
        ally: finalResult.ally,
        enemy: finalResult.enemy,
        round: state.round,
        log: [],
        winner: finalResult.winner,
        activeBuffs: finalResult.ally._activeBuffs || [],
        doubleStrikeUid: null
    };
}