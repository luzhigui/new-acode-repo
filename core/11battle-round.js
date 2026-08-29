// core/11battle-round.js - 光明顶5v5 回合循环与生成器
// V5.6.2 | ~23700 bytes| 2026-08-26 回合重置走 resetEliteRoundState；蝶变方向弹窗移至播放器层
export const VER = 'core/11battle-round.js V5.6.2';

import { CONFIG, getGameData, getSkillParams } from './01config-5v5-test.js';
import { ROUND_STATE_KEYS, ROUND_FIELD_KEYS } from './17-state-keys.js';
import { isMelee, isBlocked, makeFXSnapshot, hasBuff, getUnitCol, getUnitRow, hasAnyEnemyEmptyCol, countEnemyEmptyCols, getBloodAuraBonus, getAuraBonuses, registerWarriorBreakDefense, registerRangedGrowth, registerFortifyShield, registerWarriorExecute, selectFlyTarget, registerEmptyColBonus, registerDoubleStrike } from './03battle-utils.js';
import { computeBuffStats, logBuffSummary, applyHolyFlameBonus, applyFortifyBonus, applyCarryBonus, installBuffMechanics } from './04buff-system.js';
import { spawnHorse, destroyHorse } from './05battle-horse.js';
import { Unit } from './02unit.js';
import { clearEliteDodgeRules, getDodgeRules } from './12battle-attack-steps.js';
import { installDeclaredSkills, installFromGameData } from './15-skill-mechanisms.js';

import { getEliteFactories } from './08-elite-registry.js';
import { processUnitAttack } from './10battle-attack.js';
import { eventBus, EXECUTION_LAYER as L, registerSettlementHook } from '../infra/50-event-bus.js';
import { getNextAvailableUnit, finalizeDeaths, emitFullUnitState, checkZhangSwitch, emitEvent, applyStatChange, setBattleRng } from './13battle-shared.js';
import { getEliteState, setEliteState, cloneEliteState, resetEliteRoundState } from './18-elite-state.js';
import { FACT_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, ROLE_TYPES, SIGNAL_TYPES } from '../infra/56-battle-enums.js';
import { flushBattleEvents, setBattleState } from '../infra/51-core-utils.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import { resolveDeaths } from './12battle-attack-steps.js';
import { translateFactsToStageActions } from '../render/31-stage-actions.js';

const C = CONFIG;

async function prepareRoundStart(A, B, log, state, round, rng) {
    A._activeBuffs = state.activeBuffs.filter(b => b.target === CAMP_TYPES.ALLY || !b.target);
    B._activeBuffs = state.activeBuffs.filter(b => b.target === CAMP_TYPES.ENEMY);

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
    A._activeBuffs = A._activeBuffs.map(b => {
        if (b.key === BUFF_TYPES.HOLY_FLAME) {
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
        when: SIGNAL_TYPES.BEFORE_ACTION_SELECT,
        priority: L.BEFORE_ACTION.KULIAN_PRIORITY,
        handler: (data) => {
            if (data.unit.name !== '宋青书' || !data.unit.alive || !getEliteState(data.unit.uid)._kuLianActive) return;
            data.declaration.priority = 1;
        }
    });
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
    if (song && zhou) { setEliteState(song.uid, { _linkedPartnerUid: zhou.uid }); setEliteState(zhou.uid, { _linkedPartnerUid: song.uid }); }
    const lu = B.find(u => u.name === '鹿杖客' && u.alive);
    const he = B.find(u => u.name === '鹤笔翁' && u.alive);
    if (lu && he) { setEliteState(lu.uid, { _linkedPartnerUid: he.uid }); setEliteState(he.uid, { _linkedPartnerUid: lu.uid }); }

    eventBus.emit(SIGNAL_TYPES.ON_ROUND_START, { A, B, log });

    A._butterflyTriggered = false;
            A._mindControlTriggered = false;
    A.forEach(u => {
        if (!u.alive) return;
        emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, _stunned: false });
        let allyTeamWithDead = A.slice();
        let hasCarryActive = hasBuff(A._activeBuffs, BUFF_TYPES.CARRY);
        if (hasCarryActive) {
            allyTeamWithDead = allyTeamWithDead.concat((state.allAllies || state.ally).filter(c => !c.alive));
            allyTeamWithDead = allyTeamWithDead.filter((u, i, arr) => arr.findIndex(v => v.uid === u.uid) === i);
        }
        let stats = computeBuffStats(u, A._activeBuffs || [], allyTeamWithDead);

        applyHolyFlameBonus(u, A._activeBuffs || [], hasSisterForHolyFlame);
        applyFortifyBonus(u, A._activeBuffs || []);

        emitEvent(u, UNIT_EVENT_TYPES.STAT_BONUS_CHANGE, {
            buffAtkBonus: stats.atkBonus,
            buffDefBonus: stats.defBonus,
            buffDodgeBonus: stats.dodgeBonus,
            buffHpBonus: stats.hpBonus
        });
        emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, buffAtkBonus: u.buffAtkBonus, buffDefBonus: u.buffDefBonus, _holyAtkBonus: u.state._holyAtkBonus, _holyDefBonus: u.state._holyDefBonus, _fortifyDefBonus: u.state._fortifyDefBonus, _emptyColBonus: u.state._emptyColBonus, _bloodAuraBonus: u.state._bloodAuraBonus, _carryAtkBonus: getEliteState(u.uid)._carryAtkBonus, _carryDefBonus: getEliteState(u.uid)._carryDefBonus });
        emitEvent(u, UNIT_EVENT_TYPES.STAT_BONUS_CHANGE, {
            buffAtkBonus: stats.atkBonus,
            buffDefBonus: stats.defBonus,
            buffDodgeBonus: stats.dodgeBonus,
            buffHpBonus: stats.hpBonus
        });

        applyCarryBonus(u, A, state, log, stats);

        const auraBonuses = getAuraBonuses(u, A, B);
        const targetAtk = (u._baseAtk || u.atk) + (getEliteState(u.uid)._carryAtkBonus || 0) + (getEliteState(u.uid)._butterflyAtkBonus || 0) + (u.state._holyAtkBonus || 0) + auraBonuses.emptyCol + auraBonuses.bloodAura;
        const targetDef = (u._baseDef || u.def) + (getEliteState(u.uid)._carryDefBonus || 0) + (getEliteState(u.uid)._butterflyDefBonus || 0) + (u.state._holyDefBonus || 0) + (u.state._fortifyDefBonus || 0);
        applyStatChange(u, 'atk', targetAtk - u.atk, null, '光环加成');
        applyStatChange(u, 'def', targetDef - u.def, null, '光环加成');

        emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def });

        // 回合级状态统一重置（查表式，新增回合级字段由 17-state-keys 驱动，无需改这里）
        for (const key of ROUND_STATE_KEYS) {
            if (key === '_spiderTriggeredThisRound' || key === '_phantomTarget') continue; // 归 resetEliteRoundState 管
            if (key === '_stunned') u.state[key] = false;
            else if (key === '_acted' || key === '_resting' || key === '_blocked') u.state[key] = false;
            else if (key === '_spiderFlying') u.state[key] = false;
            else u.state[key] = false;
        }
        resetEliteRoundState(u.uid);
        u.state._restingTimer && clearTimeout(u.state._restingTimer), u.state._restingTimer = null;
        u._xingFenExtraAttacking = false;
        u._bloodthirstStriked = false;
        u._butterflyHpBonus = 0;
        setEliteState(u.uid, { _doubleStriked: false, _butterflyAtkBonus: 0, _butterflyDefBonus: 0 });
    });

    B.forEach(u => {
        if (!u.alive) return;
        emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, _stunned: false });
        // 回合级状态统一重置（查表式，与 A 队一致）
        for (const key of ROUND_STATE_KEYS) {
            if (key === '_spiderTriggeredThisRound' || key === '_phantomTarget') continue; // 归 resetEliteRoundState 管
            if (key === '_stunned') u.state[key] = false;
            else if (key === '_acted' || key === '_resting' || key === '_blocked') u.state[key] = false;
            else if (key === '_spiderFlying') u.state[key] = false;
            else u.state[key] = false;
        }
        resetEliteRoundState(u.uid);
        setEliteState(u.uid, { _doubleStriked: false });
        u._xingFenExtraAttacking = false;
        u._bloodthirstStriked = false;
        const auraBonuses = getAuraBonuses(u, B, A);
        const targetAtk = (u._baseAtk || u.atk) + auraBonuses.emptyCol + auraBonuses.bloodAura;
        applyStatChange(u, 'atk', targetAtk - u.atk, null, '光环加成');
        emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def });
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
        u._dodgeChance = Math.round((1 - product) * 100);
    }

    logBuffSummary(A, log, doubleStrikeUnitUid);

    if (round === 1 && A.some(u => u.isXiaoZhaoSister && u.alive)) {
        // 方向由播放器层在启动前弹窗获取并写入 state.ally._flyDirection，引擎层只消费
        A._flyDirection = A._flyDirection || 'right';
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

    const makeStep = (logs, evs, winner = null, done = false) => ({
        log: [...logs],
        events: evs,
        ally: A,
        enemy: B,
        winner,
        done,
        doubleStrikeUid: doubleStrikeUnitUid,
        stageActions: translateFactsToStageActions(logs)
    });

    const { doubleStrikeUnitUid, roundStartEvents, sisterComp, brotherComp } = await prepareRoundStart(A, B, log, state, round, rng);

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
            if (u.state._stunned) {
                passUnits.push({ unit: u, reason: '眩晕' });
                continue;
            }
            if (u.isHorse) {
                passUnits.push({ unit: u, reason: '拒马休息' });
                continue;
            }
            if (getEliteState(u.uid)._flyMode === 'butterfly' || getEliteState(u.uid)._flyMode === 'spider' || getEliteState(u.uid)._spiderFlying || (u._fsm && u._fsm.is('flying'))) {
                passUnits.push({ unit: u, reason: '飞天/附身' });
                continue;
            }
            const fullAllySide = u.camp === CAMP_TYPES.ALLY ? A : B;
            if (isBlocked(u, fullAllySide) && isMelee(u.role)) {
                passUnits.push({ unit: u, reason: '被遮挡' });
                continue;
            }
            const decl = { priority: 0, skip: false, pass: false };
            eventBus.emit(SIGNAL_TYPES.BEFORE_ACTION_SELECT, { unit: u, declaration: decl });
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
            return { actingUnit: null, passEntry: { unit: head.unit, reason: head.reason }, isPriorityAction: false };
        }
        return { actingUnit: head.unit, passEntry: null, isPriorityAction: head.priority > 0 };
    }

    let currentSide = state._firstSide || CAMP_TYPES.ENEMY;

    while (A.some(u => u.alive && !u.state._acted) || B.some(u => u.alive && !u.state._acted)) {
        const currentTeam = currentSide === CAMP_TYPES.ALLY ? A : B;
        if (currentSide === CAMP_TYPES.ALLY && !A._butterflyTriggered) {
            A._butterflyTriggered = true;
            const sisterForAttach = A.find(u => u.isXiaoZhaoSister && u.alive && !u.state._stunned && !getEliteState(u.uid)._butterflyHost);
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
            if (unit.alive && (reason === '被遮挡' || reason === '拒马休息')) {
                applyStatChange(unit, 'hp', 15, null, '休息回复');
            }
            const passFact = { unit, reason, events: [] };
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
        emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, survivedRounds: unit.survivedRounds });

        if (unit.camp === CAMP_TYPES.ALLY && unit.isXiaoZhaoSister && !(unit._fsm && unit._fsm.is('attached')) && !A._butterflyTriggered) {
            isPriorityAction = true;
        }

        await processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);

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
                if (decl.type === 'butterflyReturn') {
                    sisterComp.executeReturn(decl.sister, A, log);
                } else if (decl.type === 'spiderDescend') {
                    brotherComp.executeDescend(decl.unit, A, B, log);
                }
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
        if (decl.type === 'butterflyReturn') {
            sisterComp.executeReturn(decl.sister, A, log);
        } else if (decl.type === 'spiderDescend') {
            brotherComp.executeDescend(decl.unit, A, B, log);
        }
    }

    const { winner, done, endEvents } = finalizeRoundEnd(A, B, log, round);
    yield makeStep(log, endEvents, winner, done);
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
            emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: 0, maxHp: u.maxHp, alive: false, atk: u.atk, def: u.def, _isDead: true });
        });
    }

    log.push({ factType: FACT_TYPES.ROUND_END, data: { round } });

    const endEvents = flushBattleEvents();

    finalizeDeaths(A);
    finalizeDeaths(B);
    return { winner, done, endEvents };
}