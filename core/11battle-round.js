// V6.0.0 | ~23700 bytes | 2026-08-26 回合重置走 resetStateFields；蝶变方向弹窗移至播放器层
// V6.0.0 | 2026-09-07 属性词条化：删除归位重算，光环改 round 词条，回合开始清理上回合词条
export const VER = 'core/11battle-round.js V6.0.0';

import { CONFIG, getGameData, getSkillParams } from './01config-5v5-test.js';
import { resetStateFields } from './17-state-keys.js';
import { isMelee, isBlocked, makeFXSnapshot, hasBuff, getUnitCol, getUnitRow, hasAnyEnemyEmptyCol, countEnemyEmptyCols, getBloodAuraBonus, getAuraBonuses, registerWarriorBreakDefense, registerRangedGrowth, registerFortifyShield, registerWarriorExecute, selectFlyTarget, registerEmptyColBonus, registerDoubleStrike } from './03battle-utils.js';
import { computeBuffStats, logBuffSummary, applyHolyFlameBonus, applyFortifyBonus, applyCarryBonus, installBuffMechanics } from './04buff-system.js';
import { spawnHorse, destroyHorse } from './05battle-horse.js';
import { Unit } from './02unit.js';
import { clearEliteDodgeRules, getDodgeRules } from './12battle-attack-steps.js';
import { installDeclaredSkills, installFromGameData } from './15-skill-mechanisms.js';
import { resolveRoundStatGrants } from './16effect-handlers.js';

import { getEliteFactories } from './08-elite-registry.js';
import { processUnitAttack } from './10battle-attack.js';
import { eventBus, EXECUTION_LAYER as L, registerSettlementHook } from '../infra/50-event-bus.js';
import { getNextAvailableUnit, finalizeDeaths, emitFullUnitState, checkZhangSwitch, emitEvent, applyStatChange, setBattleRng, addMod, removeModsByTTL, getStat } from './13battle-shared.js';
import { FACT_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, ROLE_TYPES, SIGNAL_TYPES } from '../infra/56-battle-enums.js';
import { flushBattleEvents, setBattleState } from '../infra/51-core-utils.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import { resolveDeaths } from './12battle-attack-steps.js';

const C = CONFIG;

function prepareRoundStart(A, B, log, state, round, rng) {
    A._activeBuffs = state.activeBuffs.filter(b => b.target === CAMP_TYPES.ALLY || !b.target);
    B._activeBuffs = state.activeBuffs.filter(b => b.target === CAMP_TYPES.ENEMY);

    // 词条化：回合开始时清理上回合的 round 词条（永久/附身词条保留）
    for (const u of [...A, ...B]) {
        if (u.alive) removeModsByTTL(u, 'round');
    }

    const xiaoZhao = A.find(u => (u.isXiaoZhaoSister || u.isXiaoZhaoBrother) && u.alive);

    setBattleState('currentBattleState', null);
    flushBattleEvents();

    log.push({ factType: FACT_TYPES.ROUND_START, data: { round } });

    const teamHorseA = spawnHorse(A, log, B);
    if (teamHorseA) {
        log.push({ factType: FACT_TYPES.HORSE_SUMMON, data: { pos: teamHorseA.pos, horseUid: teamHorseA.uid, horseTaunt: '嘶——！' } });
    }
    const teamHorseB = spawnHorse(B, log, A);
    if (teamHorseB) {
        log.push({ factType: FACT_TYPES.HORSE_SUMMON, data: { pos: teamHorseB.pos, horseUid: teamHorseB.uid, horseTaunt: '嘶——！' } });
    }

    let doubleStrikeUnitUid = null;
    if (hasBuff(A._activeBuffs, BUFF_TYPES.DOUBLE_STRIKE)) {
        let candidates = A.filter(u => u.alive && !u.isHorse);
        if (candidates.length > 0) {
            let chosen = candidates[rng.nextInt(0, candidates.length - 1)];
            doubleStrikeUnitUid = chosen.uid;
        }
    }

    setBattleState('currentBattleState', { ally: state.allAllies, enemy: state.enemy });

    if (doubleStrikeUnitUid) {
        const dsUnit = A.find(u => u.uid === doubleStrikeUnitUid);
        if (dsUnit) log.push({ factType: FACT_TYPES.DOUBLE_STRIKE_SUMMARY, data: { unitName: dsUnit.name } });
    }

    log.filter(l => l.factType === 'horseSummon').forEach(hl => {
        const horse = A.find(u => u.uid === hl.data.horseUid);
        if (horse) {
            emitFullUnitState(horse, UNIT_EVENT_TYPES.UNIT_ADD);
        }
    });

    const hasSisterForHolyFlame = A.some(u => u.isXiaoZhaoSister && u.alive);
    const hexEnhanceParams = getSkillParams('小昭', 'hexEnhance');
    if (!hexEnhanceParams) throw new Error('缺技能参数: 小昭.hexEnhance');
    const holyFlameEnhance = hasSisterForHolyFlame ? hexEnhanceParams.holyFlame : null;
    const holyColCount = holyFlameEnhance ? holyFlameEnhance.atkCols : 1;
    const holyRowCount = holyFlameEnhance ? holyFlameEnhance.defRows : 2;
    state.activeBuffs = state.activeBuffs.map(b => {
        if (b.key === BUFF_TYPES.HOLY_FLAME && (b.target === CAMP_TYPES.ALLY || !b.target)) {
            const cols = [];
            while (cols.length < holyColCount) { const c = rng.nextInt(1, 3); if (!cols.includes(c)) cols.push(c); }
            cols.sort((a, b) => a - b);
            const rows = [];
            while (rows.length < holyRowCount) { const r = rng.nextInt(1, 3); if (!rows.includes(r)) rows.push(r); }
            rows.sort((a, b) => a - b);
            return { ...b, cols, rows };
        }
        return b;
    });
    A._activeBuffs = state.activeBuffs.filter(b => b.target === CAMP_TYPES.ALLY || !b.target);
    B._activeBuffs = state.activeBuffs.filter(b => b.target === CAMP_TYPES.ENEMY);
    A.forEach(u => {
        if (u.alive && u.camp === CAMP_TYPES.ALLY) {
            applyHolyFlameBonus(u, A._activeBuffs || [], hasSisterForHolyFlame);
        }
    });

    eventBus.clearAll();

    const declaredSkills = [];

    clearEliteDodgeRules();

    registerWarriorBreakDefense(eventBus);
    registerRangedGrowth(eventBus);
    registerFortifyShield(eventBus);
    registerWarriorExecute(eventBus);
    installBuffMechanics(eventBus);
    registerSettlementHook({
        when: SIGNAL_TYPES.BEFORE_SELECT_TARGET,
        priority: L.BEFORE_SELECT_TARGET.FLY_TARGET,
        handler: (data) => {
            if (data.unit.role !== ROLE_TYPES.FLYER || data.unit.isWei) return;
            const flyTarget = selectFlyTarget(data.unit, data.enemySide);
            if (flyTarget) data.targetResult = flyTarget;
        }
    });
    registerDoubleStrike(eventBus, doubleStrikeUnitUid, A, A._activeBuffs);
    registerEmptyColBonus(eventBus);

    const factories = getEliteFactories();
    let sisterComp = null;
    let brotherComp = null;
    const allUnits = [...A, ...B];
    for (const u of allUnits) {
        if (!u.alive) continue;
        if (u.isXiaoZhaoSister && u.camp === CAMP_TYPES.ALLY) {
            const Factory = factories.get('小昭·姊');
            if (Factory && !sisterComp) sisterComp = Factory();
            if (sisterComp) sisterComp.register(eventBus, A, B, log);
        } else if (u.isXiaoZhaoBrother && u.camp === CAMP_TYPES.ALLY) {
            const Factory = factories.get('小昭·妹');
            if (Factory && !brotherComp) brotherComp = Factory();
            if (brotherComp) brotherComp.register(eventBus, A, B, log);
        } else {
            const Factory = factories.get(u.name);
            if (Factory) {
                const comp = Factory();
                if (comp.declarations) declaredSkills.push(...comp.declarations);
                comp.register(eventBus, A, B, log);
            }
        }
    }
    installDeclaredSkills(eventBus, A, B, log, declaredSkills);
    installFromGameData(eventBus, A, B, log, getGameData());
    const xuanmingFactory = factories.get('玄冥联动');
    if (xuanmingFactory) xuanmingFactory(eventBus);

    const song = B.find(u => u.name === '宋青书' && u.alive);
    const zhou = B.find(u => u.name === '周芷若' && u.alive);
    if (song && zhou) { Object.assign(song.state, { _linkedPartnerUid: zhou.uid }); Object.assign(zhou.state, { _linkedPartnerUid: song.uid }); }
    const lu = B.find(u => u.name === '鹿杖客' && u.alive);
    const he = B.find(u => u.name === '鹤笔翁' && u.alive);
    if (lu && he) { Object.assign(lu.state, { _linkedPartnerUid: he.uid }); Object.assign(he.state, { _linkedPartnerUid: lu.uid }); }

    A.forEach(u => { if (u.alive) resetStateFields(u.state); });
    B.forEach(u => { if (u.alive) resetStateFields(u.state); });

    const roundStatDeclarations = [];
    eventBus.emit(SIGNAL_TYPES.ON_ROUND_START, { A, B, log, declarations: roundStatDeclarations });
    resolveRoundStatGrants(roundStatDeclarations);

    A._butterflyTriggered = false;
    A._mindControlTriggered = false;
    A.forEach(u => {
        if (!u.alive) return;
        emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: getStat(u, 'atk'), def: getStat(u, 'def'), _stunned: false });
        let allyTeamWithDead = A.slice();
        let hasCarryActive = hasBuff(A._activeBuffs, BUFF_TYPES.CARRY);
        if (hasCarryActive) {
            allyTeamWithDead = allyTeamWithDead.concat((state.allAllies || state.ally).filter(c => !c.alive));
            allyTeamWithDead = allyTeamWithDead.filter((u, i, arr) => arr.findIndex(v => v.uid === u.uid) === i);
        }
        let stats = computeBuffStats(u, A._activeBuffs || [], allyTeamWithDead);
        u.buffAtkBonus = stats.atkBonus;
        u.buffDefBonus = stats.defBonus;
        u.buffDodgeBonus = stats.dodgeBonus;
        u.buffHpBonus = stats.hpBonus;

        applyHolyFlameBonus(u, A._activeBuffs || [], hasSisterForHolyFlame);
        applyFortifyBonus(u, A._activeBuffs || []);
        applyCarryBonus(u, A, state, log);

        const auraBonuses = getAuraBonuses(u, A, B);
        if (auraBonuses.emptyCol > 0) addMod(u, 'atk', { source: '空列光环', value: auraBonuses.emptyCol, ttl: 'round', group: 'aura', op: 'add' });
        if (auraBonuses.bloodAura > 0) addMod(u, 'atk', { source: '残血光环', value: auraBonuses.bloodAura, ttl: 'round', group: 'aura', op: 'add' });

        emitEvent(u, UNIT_EVENT_TYPES.STAT_BONUS_CHANGE, {
            buffAtkBonus: stats.atkBonus,
            buffDefBonus: stats.defBonus,
            buffDodgeBonus: stats.dodgeBonus,
            buffHpBonus: stats.hpBonus
        });
        emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: getStat(u, 'atk'), def: getStat(u, 'def') });

        u._restingTimer && clearTimeout(u._restingTimer), u._restingTimer = null;
        u.state._xingFenExtraAttacking = false;
        u.state._bloodthirstStriked = false;
        u.state._butterflyHpBonus = 0;
        Object.assign(u.state, { _doubleStriked: false, _butterflyAtkBonus: 0, _butterflyDefBonus: 0 });
    });

    B.forEach(u => {
        if (!u.alive) return;
        emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: getStat(u, 'atk'), def: getStat(u, 'def'), _stunned: false });
        Object.assign(u.state, { _doubleStriked: false });
        u.state._xingFenExtraAttacking = false;
        u.state._bloodthirstStriked = false;
        const auraBonuses = getAuraBonuses(u, B, A);
        if (auraBonuses.emptyCol > 0) addMod(u, 'atk', { source: '空列光环', value: auraBonuses.emptyCol, ttl: 'round', group: 'aura', op: 'add' });
        if (auraBonuses.bloodAura > 0) addMod(u, 'atk', { source: '残血光环', value: auraBonuses.bloodAura, ttl: 'round', group: 'aura', op: 'add' });
        emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: getStat(u, 'atk'), def: getStat(u, 'def') });
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
        const allyTeam = u.camp === CAMP_TYPES.ALLY ? A : B;
        const activeBuffs = u.camp === CAMP_TYPES.ALLY ? A._activeBuffs : B._activeBuffs;
        const buffStats = computeBuffStats(u, activeBuffs, allyTeam);
        if (buffStats.dodgeBonus > 0) rates.push(buffStats.dodgeBonus);
        let product = 1;
        for (const r of rates) { product *= (1 - r); }
        u.state._dodgeChance = Math.round((1 - product) * 100);
    }

    logBuffSummary(A, log, doubleStrikeUnitUid);

    if (round === 1 && A.some(u => u.isXiaoZhaoSister && u.alive)) {
        A._flyDirection = A._flyDirection || 'right';
    }

    const roundStartEvents = flushBattleEvents();
    return { doubleStrikeUnitUid, roundStartEvents, sisterComp, brotherComp };
}

export function* createRoundStepper(state, { ui = true, translateFacts = null } = {}) {
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

    const makeStep = (logs, evs, winner = null, done = false) => ({
        log: [...logs],
        events: evs,
        ally: A,
        enemy: B,
        winner,
        done,
        doubleStrikeUid: doubleStrikeUnitUid,
        stageActions: ui && translateFacts ? translateFacts(logs) : []
    });

    const { doubleStrikeUnitUid, roundStartEvents, sisterComp, brotherComp } = prepareRoundStart(A, B, log, state, round, rng);

    yield makeStep(log, roundStartEvents);
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
        eventBus.emit(SIGNAL_TYPES.BEFORE_STATE_TRANSITION, { A, B, log, declarations: stateTransitions });
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
            if (u.state._stunned) { passUnits.push({ unit: u, reason: '眩晕' }); continue; }
            if (u.isHorse) { passUnits.push({ unit: u, reason: '拒马休息' }); continue; }
            if (u.state._flyMode === 'butterfly' || u.state._flyMode === 'spider' || u.state._spiderFlying || (u._fsm && u._fsm.is('flying'))) { passUnits.push({ unit: u, reason: '飞天/附身' }); continue; }
            const fullAllySide = u.camp === CAMP_TYPES.ALLY ? A : B;
            const fullEnemySide = u.camp === CAMP_TYPES.ALLY ? B : A;
            if (isBlocked(u, fullAllySide) && isMelee(u.role)) { passUnits.push({ unit: u, reason: '被遮挡' }); continue; }
            const decl = { priority: 0, skip: false, pass: false };
            eventBus.emit(SIGNAL_TYPES.BEFORE_ACTION_SELECT, { unit: u, declaration: decl, allySide: fullAllySide, enemySide: fullEnemySide });
            if (decl.skip) continue;
            if (decl.pass) { passUnits.push({ unit: u, reason: '组件声明pass' }); continue; }
            priorityDeclarations.push({ unit: u, priority: decl.priority });
        }

        const queue = [];
        for (const d of priorityDeclarations) queue.push({ unit: d.unit, isPass: false, priority: d.priority, reason: null });
        for (const p of passUnits) queue.push({ unit: p.unit, isPass: true, priority: 0, reason: p.reason });
        queue.sort((a, b) => {
            if (a.priority !== b.priority) return b.priority - a.priority;
            return a.unit.pos - b.unit.pos;
        });

        if (queue.length === 0) return { actingUnit: null, passEntry: null, isPriorityAction: false };
        const head = queue[0];
        if (head.isPass) return { actingUnit: null, passEntry: { unit: head.unit, reason: head.reason }, isPriorityAction: false };
        return { actingUnit: head.unit, passEntry: null, isPriorityAction: head.priority > 0 };
    }

    let currentSide = state._firstSide || CAMP_TYPES.ENEMY;

    while (A.some(u => u.alive && !u.state._acted) || B.some(u => u.alive && !u.state._acted)) {
        const currentTeam = currentSide === CAMP_TYPES.ALLY ? A : B;
        if (currentSide === CAMP_TYPES.ALLY && !A._butterflyTriggered) {
            A._butterflyTriggered = true;
            const sisterForAttach = A.find(u => u.isXiaoZhaoSister && u.alive && !u.state._stunned && !u.state._butterflyHost);
            if (sisterForAttach) {
                sisterComp.executeAttach(A, log);
                const attachEvents = flushBattleEvents();
                yield makeStep(log, attachEvents);
                log = [];
            }
        }
        const candidates = currentTeam.filter(u => u.alive && !u.state._acted).sort((a, b) => a.pos - b.pos);
        if (candidates.length === 0) {
            currentSide = currentSide === CAMP_TYPES.ALLY ? CAMP_TYPES.ENEMY : CAMP_TYPES.ALLY;
            continue;
        }
        const orderResult = resolveActionOrder(candidates, log);

        if (orderResult.passEntry) {
            const { unit, reason } = orderResult.passEntry;
            unit.state._acted = true;
            unit.state._blocked = isBlocked(unit, currentTeam);
            const hpBefore = Math.floor(unit.hp);
            let hpAfter = hpBefore;
            let actualHeal = 0;
            if (unit.alive && (reason === '被遮挡' || reason === '拒马休息')) {
                applyStatChange(unit, 'hp', 15, null, '休息回复');
                hpAfter = Math.floor(unit.hp);
                actualHeal = hpAfter - hpBefore;
            }
            const passFact = { unit: { uid: unit.uid, name: unit.name, camp: unit.camp, pos: unit.pos, hp: unit.hp }, reason, hpBefore, hpAfter, actualHeal, events: [] };
            passFact.events = flushBattleEvents();
            log.push({ factType: FACT_TYPES.PASS, data: passFact });
            continue;
        }

        if (!orderResult.actingUnit) {
            currentSide = currentSide === CAMP_TYPES.ALLY ? CAMP_TYPES.ENEMY : CAMP_TYPES.ALLY;
            continue;
        }

        let actingUnit = orderResult.actingUnit;
        let isPriorityAction = orderResult.isPriorityAction;
        let unit = actingUnit;
        let allySide = unit.camp === CAMP_TYPES.ALLY ? A : B;
        let enemySide = unit.camp === CAMP_TYPES.ALLY ? B : A;

        unit.state._blocked = isBlocked(unit, allySide);
        unit.survivedRounds++;
        emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: getStat(unit, 'atk'), def: getStat(unit, 'def'), survivedRounds: unit.survivedRounds });

        processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);
        resolveDeaths(A, B, log);

        if (!isPriorityAction) {
            currentSide = currentSide === CAMP_TYPES.ALLY ? CAMP_TYPES.ENEMY : CAMP_TYPES.ALLY;
        }

        finalizeDeaths(A);
        finalizeDeaths(B);
        const endStateTransitions = [];
        eventBus.emit(SIGNAL_TYPES.ON_ROUND_END, { A, B, log, forced: false, declarations: endStateTransitions });
        for (const decl of endStateTransitions) {
            if (!A._pendingStateTransitions) A._pendingStateTransitions = [];
            const dedupeKey = decl.type + ':' + (decl.unit?.uid || decl.sister?.uid || '');
            const exists = A._pendingStateTransitions.some(d => (d.type + ':' + (d.unit?.uid || d.sister?.uid || '')) === dedupeKey);
            if (!exists) A._pendingStateTransitions.push(decl);
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
            eventBus.emit(SIGNAL_TYPES.ON_ROUND_END, { A, B, log, forced: true });
            const winPendingDecls = [];
            if (A._pendingStateTransitions) { winPendingDecls.push(...A._pendingStateTransitions); A._pendingStateTransitions = []; }
            if (B._pendingStateTransitions) { winPendingDecls.push(...B._pendingStateTransitions); B._pendingStateTransitions = []; }
            const seenKeys = new Set();
            for (const decl of winPendingDecls) {
                const key = decl.type + ':' + (decl.unit?.uid || decl.sister?.uid || '');
                if (seenKeys.has(key)) continue;
                seenKeys.add(key);
                if (decl.type === 'butterflyReturn') sisterComp.executeReturn(decl.sister, A, log);
                else if (decl.type === 'spiderDescend') brotherComp.executeDescend(decl.unit, A, B, log);
            }
        }

        yield makeStep(log, stepEvents, winner, done);
        log = [];
        if (done) return;
    }

    const allPendingDecls = [];
    if (A._pendingStateTransitions) { allPendingDecls.push(...A._pendingStateTransitions); A._pendingStateTransitions = []; }
    if (B._pendingStateTransitions) { allPendingDecls.push(...B._pendingStateTransitions); B._pendingStateTransitions = []; }
    const seenKeys2 = new Set();
    for (const decl of allPendingDecls) {
        const key = decl.type + ':' + (decl.unit?.uid || decl.sister?.uid || '');
        if (seenKeys2.has(key)) continue;
        seenKeys2.add(key);
        if (decl.type === 'butterflyReturn') sisterComp.executeReturn(decl.sister, A, log);
        else if (decl.type === 'spiderDescend') brotherComp.executeDescend(decl.unit, A, B, log);
    }

    const { winner, done, endEvents } = finalizeRoundEnd(A, B, log, round);
    yield makeStep(log, endEvents, winner, done);
}

function finalizeRoundEnd(A, B, log, round) {
    [A, B].forEach(team => {
        for (let i = team.length - 1; i >= 0; i--) {
            const u = team[i];
            u.state._resting = false;
            if (u._restingTimer) { clearTimeout(u._restingTimer); u._restingTimer = null; }
        }
    });

    destroyHorse(A, log); destroyHorse(B, log);

    let winner = null;
    let done = false;
    if (B.every(c => !c.alive)) { winner = '明教'; done = true; }
    else if (A.every(c => !c.alive)) { winner = '六大派'; done = true; }
    if (round >= C.MAX_ROUND && !done) { winner = '平局'; done = true; }

    eventBus.emit(SIGNAL_TYPES.ON_ROUND_END, { A, B, log, forced: true });

    if (winner) {
        let losers = winner === '明教' ? B : A;
        losers.forEach(u => {
            applyStatChange(u, 'hp', -u.hp, null, '战斗结束', false);
            u.alive = false;
            u.state._isDead = true;
            emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: 0, maxHp: u.maxHp, alive: false, atk: getStat(u, 'atk'), def: getStat(u, 'def'), _isDead: true });
        });
    }

    log.push({ factType: FACT_TYPES.ROUND_END, data: { round } });

    const endEvents = flushBattleEvents();

    finalizeDeaths(A);
    finalizeDeaths(B);
    return { winner, done, endEvents };
}