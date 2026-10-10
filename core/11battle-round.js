// V6.3.6 | ~27300 bytes | 2026-10-10 双方循环各补一条 applySoulDrain（海克斯「摄魂」：明教持 → 削六大派；六大派持 → 削明教），与严阵以待同款每回合重挂
// V7.5.13 | 2026-10-08 英雄特判收口（老板批）：小昭姊妹工厂分支/圣火令增强/蝶附身触发/搭档连线/不争判定全部下沉注册面（core/08 五件套），引擎不再认识任何具体英雄；姊妹组件调度改 roundComps+状态迁移路由表；删玄冥联动死码与死变量 xiaoZhao。140 基线 18 场全一致
// V6.3.5 | ~27200 bytes | 2026-10-02 光环补发 AURA_APPLY 数值声明 fact（双方循环每存活单位每回合 1 条，emptyCol/bloodAura 为 0 也发）；applyHolyFlameBonus 两处调用透传 log
export const VER = 'core/11battle-round.js V6.3.6';

import { CONFIG, getGameData } from './01config-5v5-test.js';
import { resetStateFields } from './17-state-keys.js';
import { isMelee, isBlocked, hasBuff, getAuraBonuses, registerWarriorBreakDefense, registerRangedGrowth, registerFortifyShield, registerWarriorExecute, registerDoubleStrike } from './03battle-utils.js';   // 2026-10-08 清死import×8（特判收口后失业：makeFXSnapshot/getUnitCol/getUnitRow/hasAnyEnemyEmptyCol/countEnemyEmptyCols/getBloodAuraBonus/registerEmptyColBonus）
import { computeBuffStats, logBuffSummary, applyHolyFlameBonus, applyFortifyBonus, applyCarryBonus, applySoulDrain, installBuffMechanics, onUnitDeathFlyerRegen } from './04buff-system.js';
import { spawnHorse, destroyHorse } from './05battle-horse.js';
import { Unit } from './02unit.js';
import { clearEliteDodgeRules, getDodgeRules } from './12battle-attack-steps.js';
import { installDeclaredSkills, installFromGameData } from './15-skill-mechanisms.js';
import { resolveRoundStatGrants } from './16effect-handlers.js';
import { clearAllWatchers } from './19unit-watch.js';

import { getEliteFactories, getRoundComponentNames, getBuffRoundTransformers, getLinkPartnerPairs, getStateTransitionSpec, isHolyFlameEnhanced } from './08-elite-registry.js';
import { processUnitAttack } from './10battle-attack.js';
import { eventBus, EXECUTION_LAYER as L, registerSettlementHook } from '../infra/50-event-bus.js';
import { getNextAvailableUnit, finalizeDeaths, emitFullUnitState, emitEvent, applyStatChange, setBattleRng, setPresentationRng, addMod, removeModsByTTL, getStat, refreshMaxHp } from './13battle-shared.js';
import { FACT_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, SIGNAL_TYPES } from '../infra/56-battle-enums.js';
import { flushBattleEvents, setBattleState } from '../infra/51-core-utils.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import { resolveDeaths } from './12battle-attack-steps.js';

const C = CONFIG;

function prepareRoundStart(A, B, log, state, round, rng) {
    A._activeBuffs = state.activeBuffs.filter(b => b.target === CAMP_TYPES.ALLY || !b.target);
    B._activeBuffs = state.activeBuffs.filter(b => b.target === CAMP_TYPES.ENEMY);

    // 词条化：回合开始时清理上回合的 round 词条（永久/附身词条保留）
    // 清理后必须 refreshMaxHp，否则上回合 carry 的 maxHp 加成会残留
    for (const u of [...A, ...B]) {
        if (u.alive) {
            removeModsByTTL(u, 'round');
            refreshMaxHp(u, null, '回合清理');
        }
    }

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
    let doubleStrikeUnitUidEnemy = null;
    if (hasBuff(A._activeBuffs, BUFF_TYPES.DOUBLE_STRIKE)) {
        let candidates = A.filter(u => u.alive && !u.isHorse);
        if (candidates.length > 0) {
            let chosen = candidates[rng.nextInt(0, candidates.length - 1)];
            doubleStrikeUnitUid = chosen.uid;
        }
    }
    if (hasBuff(B._activeBuffs, BUFF_TYPES.DOUBLE_STRIKE)) {
        let candidates = B.filter(u => u.alive && !u.isHorse);
        if (candidates.length > 0) {
            let chosen = candidates[rng.nextInt(0, candidates.length - 1)];
            doubleStrikeUnitUidEnemy = chosen.uid;
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

    // 2026-10-08 V7.5.13 圣火令增强迁 modules/27：回合开始 buff 变换器注册面，
    //   同位置同条件画 rng（序不变，基线二分保障）；无增强者在变换器内部走默认行列重画
    for (const [buffKey, transformBuff] of getBuffRoundTransformers()) {
        state.activeBuffs = state.activeBuffs.map(b => (b.key === buffKey ? transformBuff(b, rng, A, B) : b));
    }
    A._activeBuffs = state.activeBuffs.filter(b => b.target === CAMP_TYPES.ALLY || !b.target);
    B._activeBuffs = state.activeBuffs.filter(b => b.target === CAMP_TYPES.ENEMY);
    // 圣火令统一在下面的回合开始循环里施加，此处不再重复登记词条

    eventBus.clearAll();
    // 每回合 A/B 都是新克隆，上一回合的裁判登记（闭包引用旧对象）作废，必须清空重登
    clearAllWatchers();

    const declaredSkills = [];

    clearEliteDodgeRules();

    registerWarriorBreakDefense(eventBus);
    registerRangedGrowth(eventBus);
    registerFortifyShield(eventBus);
    registerWarriorExecute(eventBus);
    installBuffMechanics(eventBus);
    registerDoubleStrike(eventBus, doubleStrikeUnitUid, A, A._activeBuffs);
    registerDoubleStrike(eventBus, doubleStrikeUnitUidEnemy, B, B._activeBuffs);
    // 飞行再生：每死一个非拒马角色，全场飞行立即回 baseRegen 生命（数值读 roles.飞行.baseRegen）
    // 2026-10-05 修静默 bug：不能闭包本函数参数 log——它在回合开始步 yield 后就被主循环换成新数组，
    //   此后 fact 全推进无人读的死数组（数值加血正常、日志/弹幕全无）。改用广播随包的 data.log（当步真 log）。
    eventBus.on(SIGNAL_TYPES.ON_UNIT_DEATH, 30, (data) => { onUnitDeathFlyerRegen(data, A, B, data.log); });

    // 2026-10-08 V7.5.13 工厂循环泛化（原双组件特判分支）：回合组件标记在 modules 侧注册（core/08 注册面），
    //   引擎按「工厂名+camp」识别——每轮首个存活同名单位实例化一次、每个同名单位都 register、
    //   实例保留供主循环相位调度（不收 declarations，与原特判分支一致）。
    //   原联动工厂查询为死代码（全库无此注册、恒 undefined），已删——真联动在 core/10 跟随攻击链。
    const factories = getEliteFactories();
    const roundCompSpecs = getRoundComponentNames();
    const roundComps = [];
    const roundCompByName = new Map();
    const allUnits = [...A, ...B];
    for (const u of allUnits) {
        if (!u.alive) continue;
        const rcCamp = roundCompSpecs.get(u.name);
        if (rcCamp !== undefined && u.camp === rcCamp) {
            const Factory = factories.get(u.name);
            if (Factory) {
                let comp = roundCompByName.get(u.name);
                if (!comp) { comp = Factory(); roundCompByName.set(u.name, comp); roundComps.push(comp); }
                comp.register(eventBus, A, B, log);
            }
            continue;
        }
        const Factory = factories.get(u.name);
        if (Factory) {
            const comp = Factory();
            if (comp.declarations) declaredSkills.push(...comp.declarations);
            comp.register(eventBus, A, B, log);
        }
    }
    installDeclaredSkills(eventBus, A, B, log, declaredSkills);
    installFromGameData(eventBus, A, B, log, getGameData());

    // 2026-10-08 V7.5.13 搭档连线泛化：配对知识在英雄模块侧注册（原两对搭档内联连线）；
    //   原版仅扫敌方 B，保持
    for (const [partnerA, partnerB] of getLinkPartnerPairs()) {
        const ua = B.find(u => u.name === partnerA && u.alive);
        const ub = B.find(u => u.name === partnerB && u.alive);
        if (ua && ub) { Object.assign(ua.state, { _linkedPartnerUid: ub.uid }); Object.assign(ub.state, { _linkedPartnerUid: ua.uid }); }
    }

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

        applyHolyFlameBonus(u, A._activeBuffs || [], isHolyFlameEnhanced(A), log);   // 2026-10-08 增强判定迁注册面（modules/27）
        applyFortifyBonus(u, A._activeBuffs || []);
        applySoulDrain(u, B._activeBuffs || []);   // 六大派持摄魂 → 削弱明教
        applyCarryBonus(u, A, state, log);

        const auraBonuses = getAuraBonuses(u, A, B);
        // 数值声明 fact：每存活单位每回合 1 条（两值为 0 也发，供体检对照 aura group 续期）
        log.push({ factType: FACT_TYPES.AURA_APPLY, data: { unitName: u.name, unitUid: u.uid, camp: u.camp, emptyCol: auraBonuses.emptyCol, bloodAura: auraBonuses.bloodAura } });
        if (auraBonuses.emptyCol > 0) addMod(u, 'atk', { source: '空列光环', value: auraBonuses.emptyCol, ttl: 'round', group: 'aura', op: 'add' });
        if (auraBonuses.bloodAura > 0) addMod(u, 'atk', { source: '残血光环', value: auraBonuses.bloodAura, ttl: 'round', group: 'aura', op: 'add' });

        emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: getStat(u, 'atk'), def: getStat(u, 'def') });

        u.state._xingFenExtraAttacking = false;
        u.state._bloodthirstStriked = false;
        Object.assign(u.state, { _doubleStriked: false });
    });

    B.forEach(u => {
        if (!u.alive) return;
        emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: getStat(u, 'atk'), def: getStat(u, 'def'), _stunned: false });
        let bStats = computeBuffStats(u, B._activeBuffs || [], B);
        applyHolyFlameBonus(u, B._activeBuffs || [], false, log);
        applyFortifyBonus(u, B._activeBuffs || []);
        applySoulDrain(u, A._activeBuffs || []);   // 明教持摄魂 → 削弱六大派
        applyCarryBonus(u, B, state, log);
        Object.assign(u.state, { _doubleStriked: false });
        u.state._xingFenExtraAttacking = false;
        u.state._bloodthirstStriked = false;
        const auraBonuses = getAuraBonuses(u, B, A);
        // 数值声明 fact：每存活单位每回合 1 条（两值为 0 也发，供体检对照 aura group 续期）
        log.push({ factType: FACT_TYPES.AURA_APPLY, data: { unitName: u.name, unitUid: u.uid, camp: u.camp, emptyCol: auraBonuses.emptyCol, bloodAura: auraBonuses.bloodAura } });
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

    // 2026-10-08 默认飞行方向迁回合组件 register（幂等 ||=，无人中途清空 → 每轮设与首轮设等价）

    const roundStartEvents = flushBattleEvents();
    return { doubleStrikeUnitUid, roundStartEvents, roundComps };
}

export function* createRoundStepper(state, { ui = true, translateFacts = null } = {}) {
    const rng = state._rng || new SeededRNG(Date.now());
    state._rng = rng;
    setBattleRng(rng);
    setPresentationRng(new SeededRNG(rng.getState()));
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

    const { doubleStrikeUnitUid, roundStartEvents, roundComps } = prepareRoundStart(A, B, log, state, round, rng);

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
        // 2026-10-08 V7.5.13 状态迁移通用分发（原 sisterComp/brotherComp if-else 链）：
        //   路由表在 modules/27 注册，deferred 的攒下回合、即时的当场执行
        const delayedDecls = [];
        for (const decl of stateTransitions) {
            const spec = getStateTransitionSpec(decl.type);
            if (!spec) continue;
            if (spec.deferred) { delayedDecls.push(decl); continue; }
            spec.dispatch(roundComps, decl, A, B, log);
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
            // 2026-09-23 拒马 / 幼狮：「不会攻击」不是身份硬编码，而是攻=0 的自然结果。
            //   一旦被振奋之类的加攻词条抬到 >0，就放行进正常攻击流程（职业是防战 → core/12 走防战公式）。
            if (u.isHorse && getStat(u, 'atk') <= 0) { passUnits.push({ unit: u, reason: '拒马休息' }); continue; }
            if (u.isLionCub && getStat(u, 'atk') <= 0) { passUnits.push({ unit: u, reason: '幼狮休息' }); continue; }
            // 2026-09-17 「不争」者不攻击：轮到他走"生生不息"休息，走 pass 通道而不是攻击流程
            //   2026-10-08 改数据旗：endlessBreath 由 content 技能声明驱动（applyHeroFlags 自动设）
            if (u.endlessBreath) { passUnits.push({ unit: u, reason: '生生不息' }); continue; }
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
        // 2026-10-08 V7.5.13 首个友方回合相位（原蝶附身触发内联版）：回合组件实现 onFirstAllyTurn
        //   钩子（组件自找目标触发附身），返回 true = 插播一段演出，主循环 yield 一步
        if (currentSide === CAMP_TYPES.ALLY && !A._butterflyTriggered) {
            A._butterflyTriggered = true;
            for (const comp of roundComps) {
                if (typeof comp.onFirstAllyTurn !== 'function') continue;
                if (comp.onFirstAllyTurn(A, B, log)) {
                    const attachEvents = flushBattleEvents();
                    yield makeStep(log, attachEvents);
                    log = [];
                }
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
            // 2026-09-17 生生不息移到组件层（监听 ON_UNIT_ACTED），core 不再写角色名
            if (unit.alive && (reason === '被遮挡' || reason === '拒马休息' || reason === '幼狮休息')) {
                applyStatChange(unit, 'hp', 15, null, '休息回复');
                hpAfter = Math.floor(unit.hp);
                actualHeal = hpAfter - hpBefore;
            }
            const passFact = { unit: { uid: unit.uid, name: unit.name, camp: unit.camp, pos: unit.pos, hp: unit.hp }, reason, hpBefore, hpAfter, actualHeal, events: [] };
            passFact.events = flushBattleEvents();
            log.push({ factType: FACT_TYPES.PASS, data: passFact });
            // 2026-09-17 行动完成广播（休息/遮挡/生生不息都算一次行动）
            eventBus.emit(SIGNAL_TYPES.ON_UNIT_ACTED, { unit, allySide: currentTeam, enemySide: unit.camp === CAMP_TYPES.ALLY ? B : A, log });
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
        // 2026-09-17 行动完成广播（攻击成功/未命中/被闪避都算走完一次）
        eventBus.emit(SIGNAL_TYPES.ON_UNIT_ACTED, { unit, allySide, enemySide, log });

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
        // 2026-09-17 不争（防拖平局）：敌方仅剩「不争」单位 → 明教直接获胜
        //   2026-10-08 V7.5.13 改数据旗：noContend 由 content 技能声明驱动（applyHeroFlags 自动设），引擎不认英雄
        else {
            const bAlive = B.filter(u => u.alive);
            if (bAlive.length === 1 && bAlive[0].noContend) {
                winner = '明教'; done = true;
                log.push({ factType: FACT_TYPES.NO_CONTEND, data: { unitName: bAlive[0].name } });
            }
        }

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
                const wSpec = getStateTransitionSpec(decl.type);
                if (wSpec && wSpec.deferred) wSpec.dispatch(roundComps, decl, A, B, log);
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
        const eSpec = getStateTransitionSpec(decl.type);
        if (eSpec && eSpec.deferred) eSpec.dispatch(roundComps, decl, A, B, log);
    }

    const { winner, done, endEvents } = finalizeRoundEnd(A, B, log, round);
    yield makeStep(log, endEvents, winner, done);
}

function finalizeRoundEnd(A, B, log, round) {
    [A, B].forEach(team => {
        for (let i = team.length - 1; i >= 0; i--) {
            const u = team[i];
            u.state._resting = false;
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