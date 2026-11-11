// core/210-battle-round.js — 回合主循环（prepareRoundStart 八阶段 / 行动队列 / 收尾结算）
// V6.3.34 | 2026-11-07 第 184 轮：finalizeRoundEnd 败方归零改调 killUnit（死亡收口统一出口，
//          补记 V6.3.33 未升版的实质改动——此前直调 applyStatChange 带 ignoreCap，绕开了单一出口）
// V6.3.37 | 2026-11-08 删 _bloodthirstStriked 每回合重置：嗜血必出双击逻辑已移除，无任何代码再写 true，
//           该字段恒 false（218 声明保留以稳定 unit 快照形状 / golden 基线）；重置遂成死代码。
// V6.3.38 | 2026-11-08 体检实测（seed=10 stage=7）：双宣告取第二人时只保证「索引不同」，候选数组里
//   同一 uid 重复出现时仍会选中同一单位 → 文案「张无忌、张无忌」，该单位同回合连击触发两次。
//   改为按 uid 排除首个；排除后不足 1 人则退化为单宣告。
// V6.3.39 | 2026-11-08 双宣告排重回退到「两次抽签 + 顺延」：V6.3.38 的 filter 后重抽会多消耗一次随机流，
//   且候选不足时少抽一次；改回原版两次抽签，第二签同 uid 时从该签位起按候选顺序顺延取下一个不同 uid（不重抽）。
// V6.3.41 | 2026-11-11 妹背水后不吃团队海克斯：连击候选池排除（她有自己的背水掷骰连击，不双掷）、
//           云身跳过强制置真（姊强化 noSkip 也不豁免她）、per-unit 施法循环五 apply 跳过（摄魂保留=敌方减益照挨）
export const VER = 'core/210-battle-round.js V6.3.41';

import { CONFIG, getGameData } from './201-config-5v5-test.js';
import { resetStateFields } from './218-state-keys.js';
import { isMelee, isBlocked, hasBuff, getAuraBonuses, registerWarriorBreakDefense, registerRangedGrowth, registerFortifyShield, registerWarriorExecute, registerDoubleStrike } from './203-battle-utils.js';
import { computeBuffStats, logBuffSummary, applyHolyFlameBonus, applyFortifyBonus, applyCarryBonus, applySoulDrain, preparePermanentSoulDrain, spawnCarryEagle, applyLastStandBonus, applyUnityBonus, spawnUnityRecruits, spawnBrotherPermanentUnityRecruit, installBuffMechanics, onUnitDeathFlyerRegen, isTeamHexExcluded } from './204-buff-system.js';
import { spawnHorse, destroyHorse } from './205-battle-horse.js';
import { Unit } from './202-unit.js';
import { clearEliteDodgeRules, getDodgeRules } from './221-registry-dodge.js';
import { clearTargetFilters } from './207-target-strategies.js';
import { installDeclaredSkills, installFromGameData } from './216-skill-mechanisms.js';
import { resolveRoundStatGrants } from './217-effect-handlers.js';
import { clearAllWatchers } from './220-unit-watch.js';

import { getEliteFactories, getRoundComponentNames, getBuffRoundTransformers, getLinkPartnerPairs, getStateTransitionSpec, isHolyFlameEnhanced, getRoundHooks } from './208-registry-elite.js';
import { processUnitAttack } from './209-battle-attack.js';
import { eventBus, EXECUTION_LAYER as L, registerSettlementHook } from '../infra/101-event-bus.js';
import { getNextAvailableUnit, finalizeDeaths, emitFullUnitState, emitEvent, applyStatChange, killUnit, setBattleRng, setPresentationRng, addMod, removeModsByTTL, getStat, refreshMaxHp, getBattleRng, query } from './214-battle-shared.js';
import { FACT_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, SIGNAL_TYPES, ROLE_TYPES } from '../infra/106-battle-enums.js';
import { flushBattleEvents, setBattleState, pushFact } from '../infra/102-core-utils.js';
import { SeededRNG } from '../infra/102-core-utils.js';
import { resolveDeaths } from './211-battle-attack-steps.js';

const C = CONFIG;

// 圣火不熄与判负时序（方案 A·新语义）：阵亡当帧只记 state._holyFire='pending'，
//   真正复活落位要等「下一个行动步开头」的 BEFORE_STATE_TRANSITION（core/04 flushHolyFire）；
//   而团灭判定在当步末就执行 —— 最后一名单位阵亡时战斗当场结束，排队的复活永远等不到那一步。
//   新语义：有排队复活的单位视作「未死透」，不参与团灭判定，让流程走到复活落位再定胜负。
//   不会无限延长：落位失败（9 格全被活人占）时 reviveHolyFireUnit 首行已把标记改成 'used'。
function isRevivePending(u) {
    return !!(u.state && (u.state._holyFire === 'pending' || u.state._holyFireSelf === 'pending'));
}
function teamAliveOrPending(team) {
    return team.some(u => u.alive || isRevivePending(u));
}

// ───────────────────────── prepareRoundStart 阶段子函数 ─────────────────────────

// 阶段1：切当回合 activeBuffs、清理上回合 round 词条（永久/附身保留）、清战场态、推 ROUND_START。
function clearRoundEntries(A, B, state, ctx) {
    A._activeBuffs = state.activeBuffs.filter(b => b.target === CAMP_TYPES.ALLY || !b.target);
    B._activeBuffs = state.activeBuffs.filter(b => b.target === CAMP_TYPES.ENEMY);

    // 词条化：回合开始时清理上回合的 round 词条（永久/附身词条保留）
    // 清理后必须 refreshMaxHp，否则上回合 carry 的 maxHp 加成会残留
    // 按 uid 去重：复活后单位可能同时出现在 A/B 两侧数组里，重复清理会让 ttl=round 的词条被
    //   叠加计入（removeModsByTTL 幂等，但 refreshMaxHp 会按重复条目重算面板）。
    // 不论生死都清：阵亡单位若被「圣火不熄」复活，上回合 round 词条会与新挂词条叠加（规则 241）。
    //   refreshMaxHp 对已阵亡单位首行直接 return，清尸体词条不会改面板。
    const cleanedUids = new Set();
    for (const u of [...A, ...B]) {
        if (!u || cleanedUids.has(u.uid)) continue;
        cleanedUids.add(u.uid);
        removeModsByTTL(u, 'round');
        refreshMaxHp(u, null, '回合清理');
    }

    setBattleState('currentBattleState', null);
    flushBattleEvents();

    ctx.log.push({ factType: FACT_TYPES.ROUND_START, data: { round: ctx.round } });
}

// 阶段2：双方刷马 + 选双击单位（rng），返回 { unitUid:A队, enemyUid:B队 }。
function spawnHorsesAndPickDoubleStrike(A, B, state, ctx) {
    const teamHorseA = spawnHorse(A, ctx.log, B);
    if (teamHorseA) {
        ctx.log.push({ factType: FACT_TYPES.HORSE_SUMMON, data: { pos: teamHorseA.pos, horseUid: teamHorseA.uid, horseTaunt: '嘶——！' } });
    }
    const teamHorseB = spawnHorse(B, ctx.log, A);
    if (teamHorseB) {
        ctx.log.push({ factType: FACT_TYPES.HORSE_SUMMON, data: { pos: teamHorseB.pos, horseUid: teamHorseB.uid, horseTaunt: '嘶——！' } });
    }

    let unitUids = [];
    let enemyUids = [];
    if (hasBuff(A._activeBuffs, BUFF_TYPES.DOUBLE_STRIKE)) {
        // 妹背水后不吃团队海克斯：排除出候选池（她有自己的背水掷骰连击，避免双掷）
        let candidates = A.filter(u => u.alive && !u.isHorse && !isTeamHexExcluded(u));
        if (candidates.length > 0) {
            // 两次抽签（与原版一致，随机流不变）；第二签与被选中者同 uid 时不重抽（重抽会多消耗一次随机流），
            //   从第二签位起按候选顺序顺延取下一个不同 uid；全队只有同一 uid 时退化为单宣告。
            const i1 = ctx.rng.nextInt(0, candidates.length - 1);
            const i2 = ctx.rng.nextInt(0, candidates.length - 1);
            const first = candidates[i1];
            unitUids.push(first.uid);
            for (let k = 0; k < candidates.length; k++) {
                const cand = candidates[(i2 + k) % candidates.length];
                if (cand.uid !== first.uid) { unitUids.push(cand.uid); break; }
            }
        }
    }
    if (hasBuff(B._activeBuffs, BUFF_TYPES.DOUBLE_STRIKE)) {
        let candidates = B.filter(u => u.alive && !u.isHorse);
        if (candidates.length > 0) {
            // 两次抽签（与原版一致，随机流不变）；第二签与被选中者同 uid 时不重抽（重抽会多消耗一次随机流），
            //   从第二签位起按候选顺序顺延取下一个不同 uid；全队只有同一 uid 时退化为单宣告。
            const i1 = ctx.rng.nextInt(0, candidates.length - 1);
            const i2 = ctx.rng.nextInt(0, candidates.length - 1);
            const first = candidates[i1];
            enemyUids.push(first.uid);
            for (let k = 0; k < candidates.length; k++) {
                const cand = candidates[(i2 + k) % candidates.length];
                if (cand.uid !== first.uid) { enemyUids.push(cand.uid); break; }
            }
        }
    }

    setBattleState('currentBattleState', { ally: state.allAllies, enemy: state.enemy });



    ctx.log.filter(l => l.factType === 'horseSummon').forEach(hl => {
        const horse = A.find(u => u.uid === hl.data.horseUid);
        if (horse) {
            emitFullUnitState(horse, UNIT_EVENT_TYPES.UNIT_ADD);
        }
    });

    return { unitUids, enemyUids };
}

// 阶段3：圣火令 buff 变换器重算（之后重切 activeBuffs）→ 召雄鹰 → 众志成城补员。
function prepareRoundSpawns(A, B, state, ctx) {
    // 圣火令增强迁 modules/27：回合开始 buff 变换器注册面，同位置同条件画 rng（序不变，基线二分保障）；
    //   无增强者在变换器内部走默认行列重画
    for (const [buffKey, transformBuff] of getBuffRoundTransformers()) {
        state.activeBuffs = state.activeBuffs.map(b => (b.key === buffKey ? transformBuff(b, ctx.rng, A, B) : b));
    }
    A._activeBuffs = state.activeBuffs.filter(b => b.target === CAMP_TYPES.ALLY || !b.target);
    B._activeBuffs = state.activeBuffs.filter(b => b.target === CAMP_TYPES.ENEMY);
    // 圣火令统一在下面的回合开始循环里施加，此处不再重复登记词条

    // carry 放开 5 号位门槛：5 号位无人则召唤雄鹰顶位（每队整局 1 只）。
    //   必须早于下方组件工厂循环 —— 雄鹰当回合就在 A/B 里，才能被注册面挂上技能。
    spawnCarryEagle(A, ctx.log);
    spawnCarryEagle(B, ctx.log);

    // 众志成城（unity）改版：获得当回合把人数补满到 4（姐姐强化补满到 5）、此后每回合再补 1 个（M15/技能全开，
    //   持续由 content unity.duration:3 管，上限只剩 9 格站位），
    //   同样必须早于下方组件工厂循环——召唤出的精英当回合才能被注册面挂上技能。
    spawnUnityRecruits(A, ctx.log);
    spawnUnityRecruits(B, ctx.log);
    // 妹永久众志：团队众志不在场时也在本阶段补召（与团队版同时机，早于工厂循环，
    //   召出来的单位当回合就能被注册面挂上精英技能；原挂在 ON_ROUND_START 会当回合白板）。
    spawnBrotherPermanentUnityRecruit(A, ctx.log);
    spawnBrotherPermanentUnityRecruit(B, ctx.log);
}

// 阶段4：清裁判登记 → 注册本回合战斗机制 → 工厂循环实例化回合组件 → 装声明技能/数据表。
function installRoundMechanics(A, B, state, ctx, ds) {
    eventBus.clearAll();
    // 每回合 A/B 都是新克隆，上一回合的裁判登记（闭包引用旧对象）作废，必须清空重登
    clearAllWatchers();

    const declaredSkills = [];

    clearEliteDodgeRules();
    // 选目标过滤器同上：挂在旧回合闭包上的 filter 本回合作废，必须清空后由模块在各自 register() 里重挂
    clearTargetFilters();
    // 模块级全局钩子（clearAll 会清掉顶层注册）：模块在 208 注册、这里每回合统一重挂
    for (const fn of getRoundHooks()) fn();

    registerWarriorBreakDefense(eventBus);
    registerRangedGrowth(eventBus);
    registerFortifyShield(eventBus);
    registerWarriorExecute(eventBus);
    installBuffMechanics(eventBus);
    registerDoubleStrike(eventBus, ds.unitUids, A, A._activeBuffs);
    registerDoubleStrike(eventBus, ds.enemyUids, B, B._activeBuffs);
    // 飞行再生：每死一个非拒马角色，全场飞行立即回 baseRegen 生命（数值读 roles.飞行.baseRegen）
    // 不能闭包本函数 ctx.log——它在回合开始步 yield 后就被主循环换成新数组，此后 fact 全推进无人读的死数组
    //   （数值加血正常、日志/弹幕全无）。改用广播随包的 data.log（当步真 log）。
    eventBus.on(SIGNAL_TYPES.ON_UNIT_DEATH, 30, (data) => { onUnitDeathFlyerRegen(data, A, B, data.log); });

    // 工厂循环：回合组件标记在 modules 侧注册（core/08 注册面），引擎按「工厂名+camp」识别——
    //   每轮首个存活同名单位实例化一次、每个同名单位都 register，实例保留供主循环相位调度（不收 declarations）。
    const factories = getEliteFactories();
    const roundCompSpecs = getRoundComponentNames();
    const roundComps = [];
    const roundCompByName = new Map();
    const allUnits = [...A, ...B];
    // 每个单位注册独立组件实例并传第 5 参 self（register(eventBus,A,B,log,self)）：组件内部以此认「自己」
    //   （个体 hook 按 uid 守卫、全局 hook 仅首个实例挂）。同名共存 = 多实例各管各的，不降级白板。
    //   回合组件（小昭·姊/妹）保持单例调度、不传 self。
    for (const u of allUnits) {
        if (!u.alive) continue;
        const rcCamp = roundCompSpecs.get(u.name);
        if (rcCamp !== undefined && u.camp === rcCamp) {
            const Factory = factories.get(u.name);
            if (Factory) {
                let comp = roundCompByName.get(u.name);
                if (!comp) { comp = Factory(); roundCompByName.set(u.name, comp); roundComps.push(comp); }
                comp.register(eventBus, A, B, ctx.log);
            }
            continue;
        }
        const Factory = factories.get(u.name);
        if (Factory) {
            const comp = Factory();
            if (comp.declarations) declaredSkills.push(...comp.declarations);
            comp.register(eventBus, A, B, ctx.log, u);
        }
    }
    installDeclaredSkills(eventBus, A, B, ctx.log, declaredSkills);
    installFromGameData(eventBus, A, B, ctx.log, getGameData());

    return { roundComps };
}

// 阶段5：搭档连线（仅扫敌方 B，配对双方互挂 _linkedPartnerUid）。
function linkPartners(A, B) {
    // 搭档连线：配对知识在英雄模块侧注册；仅扫敌方 B
    for (const [partnerA, partnerB] of getLinkPartnerPairs()) {
        const ua = B.find(u => u.name === partnerA && u.alive && !u.isUnityRecruit);
        const ub = B.find(u => u.name === partnerB && u.alive && !u.isUnityRecruit);
        if (ua && ub) { Object.assign(ua.state, { _linkedPartnerUid: ub.uid }); Object.assign(ub.state, { _linkedPartnerUid: ua.uid }); }
    }
}

// 阶段6：重置每单位状态字段 → 摄魂点名（存量 -1 + 各方向随机点名）→ 发 ON_ROUND_START 结算属性授予。
function prepareSoulDrain(A, B, ctx) {
    A.forEach(u => { if (u.alive) resetStateFields(u.state); });
    B.forEach(u => { if (u.alive) resetStateFields(u.state); });

    // 妹永久摄魂「点名 2 回合」：先递减存量（挂标当回合算 1，共 2 回合），再各方向随机点名 1 名敌方
    A.forEach(u => { if (u.state._soulDrainRounds > 0) u.state._soulDrainRounds -= 1; });
    B.forEach(u => { if (u.state._soulDrainRounds > 0) u.state._soulDrainRounds -= 1; });
    preparePermanentSoulDrain(A, B, { rng: ctx.rng });
    preparePermanentSoulDrain(B, A, { rng: ctx.rng });

    const roundStatDeclarations = [];
    eventBus.emit(SIGNAL_TYPES.ON_ROUND_START, { A, B, log: ctx.log, declarations: roundStatDeclarations });
    resolveRoundStatGrants(roundStatDeclarations);
}

// 阶段7：按闪避规则 + 云身词条计算每单位本回合闪避率（乘性合并）。
function computeDodgeChance(A, B) {
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
}

// 阶段8：对单队施加回合 per-unit 加成（A/B 两个同构循环合并）。
//   team=本队、enemy=对方队；isAlly=true 为明教(A)。差异全部参数化：
//   · 圣火令 hasSister：A 队读 isHolyFlameEnhanced，B 队恒 false
//   · 摄魂方向：casterAlive/targetAlive 互换、casterSide 恒为对方队 enemy
//   · 光环：getAuraBonuses(u, team, enemy)
function applyTeamRoundBuffs(team, enemy, state, ctx, alive, isAlly) {
    const buffs = team._activeBuffs || [];
    const enemyBuffs = enemy._activeBuffs || [];
    const casterAlive = isAlly ? alive.B : alive.A;
    const targetAlive = isAlly ? alive.A : alive.B;
    
    // 摄魂：普通版上限 4 人（2026-11-10 拍板：敌方不足 4 人则全员生效；原"随机 N-1"废止）；姊强化版影响敌方所有人
    const hasTeamSoulDrain = hasBuff(enemyBuffs, BUFF_TYPES.SOUL_DRAIN);
    const hasSisterSoulDrain = hasTeamSoulDrain && enemy.some(u => u.isXiaoZhaoSister && u.alive);
    let soulDrainTargets = null;
    if (hasTeamSoulDrain) {
        const aliveTeam = team.filter(u => u.alive && !u.isHorse);
        if (hasSisterSoulDrain) {
            // 姊强化：全体
            soulDrainTargets = new Set(aliveTeam.map(u => u.uid));
        } else {
            const count = Math.min(4, aliveTeam.length);   // 上限 4 人，不足 4 人全员生效
            const shuffled = [...aliveTeam];
            const rng = getBattleRng();
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = rng.nextInt(0, i);
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            soulDrainTargets = new Set(shuffled.slice(0, count).map(u => u.uid));
        }
    }

    // 流云身法：团队版每回合随机少一人享受加成；姊强化 noSkip 时全员都不跳过
    if (hasBuff(buffs, BUFF_TYPES.CLOUD_BODY)) {
        const cloudEnh = query('xiaoHexEnhance', team, buffs, BUFF_TYPES.CLOUD_BODY);
        const aliveCloudTeam = team.filter(u => u.alive);
        if (cloudEnh && cloudEnh.noSkip) {
            aliveCloudTeam.forEach(u => { u.state._cloudBodySkip = false; });
        } else if (aliveCloudTeam.length > 1) {
            const rng = getBattleRng();
            const skipIdx = rng.nextInt(0, aliveCloudTeam.length - 1);
            aliveCloudTeam.forEach((u, idx) => { u.state._cloudBodySkip = (idx === skipIdx); });
        } else if (aliveCloudTeam.length === 1) {
            aliveCloudTeam[0].state._cloudBodySkip = false;
        }
    } else {
        team.forEach(u => { u.state._cloudBodySkip = false; });
    }
    // 妹背水后不吃团队海克斯：云身跳过强制置真（姊强化 noSkip 也不豁免）
    team.forEach(u => { if (isTeamHexExcluded(u)) u.state._cloudBodySkip = true; });

    team.forEach(u => {
        if (!u.alive) return;
        emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: getStat(u, 'atk'), def: getStat(u, 'def'), _stunned: false });

        // 妹背水后不吃团队海克斯：五 apply 跳过（204 内也有闸，双保险）；摄魂保留=敌方减益照挨
        if (!isTeamHexExcluded(u)) {
            applyHolyFlameBonus(u, buffs, { hasSister: isAlly ? isHolyFlameEnhanced(team) : false, log: ctx.log });
            applyFortifyBonus(u, buffs, team);
            applyCarryBonus(u, team, state, ctx.log);
            applyLastStandBonus(u, team, buffs, ctx.log);
            applyUnityBonus(u, team, buffs, ctx.log);
        }
        if (!hasTeamSoulDrain || soulDrainTargets.has(u.uid)) {
            applySoulDrain(u, enemyBuffs, { log: ctx.log, casterAlive, targetAlive, round: ctx.round, casterSide: enemy });
        }

        const auraBonuses = getAuraBonuses(u, team, enemy);
        // 数值声明 fact：每存活单位每回合 1 条（两值为 0 也发，供体检对照 aura group 续期）
        ctx.log.push({ factType: FACT_TYPES.AURA_APPLY, data: { unitName: u.name, unitUid: u.uid, camp: u.camp, emptyCol: auraBonuses.emptyCol, bloodAura: auraBonuses.bloodAura } });
        if (auraBonuses.emptyCol > 0) addMod(u, 'atk', { source: '空列光环', value: auraBonuses.emptyCol, ttl: 'round', group: 'aura', op: 'add' });
        if (auraBonuses.bloodAura > 0) addMod(u, 'atk', { source: '残血光环', value: auraBonuses.bloodAura, ttl: 'round', group: 'aura', op: 'add' });

        emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: getStat(u, 'atk'), def: getStat(u, 'def') });

        u.state._xingFenExtraAttacking = false;
        Object.assign(u.state, { _doubleStriked: false });
    });
}

function prepareRoundStart(A, B, state, ctx) {
    clearRoundEntries(A, B, state, ctx);
    // 召唤物优先级：雄鹰(carry) > 众志成城补员 > 巨马(拒马)。必须保证雄鹰先占 5 号位，防被其他召唤物挤占。
    prepareRoundSpawns(A, B, state, ctx);
    const ds = spawnHorsesAndPickDoubleStrike(A, B, state, ctx);
    const { roundComps } = installRoundMechanics(A, B, state, ctx, ds);
    linkPartners(A, B);
    prepareSoulDrain(A, B, ctx);

    A._butterflyTriggered = false;
    A._mindControlTriggered = false;
    // 摄魂逆风补偿用：本回合双方存活单位数快照（非马，与 L60/67 挑人、苦练「全队非马存活单位」同口径）
    const aliveCountA = A.filter(x => x.alive && !x.isHorse).length;
    const aliveCountB = B.filter(x => x.alive && !x.isHorse).length;

    const alive = { A: aliveCountA, B: aliveCountB };
    applyTeamRoundBuffs(A, B, state, ctx, alive, true);
    applyTeamRoundBuffs(B, A, state, ctx, alive, false);

    computeDodgeChance(A, B);

    logBuffSummary(A, { log: ctx.log, doubleStrikeUids: ds.unitUids || [] });
    logBuffSummary(B, { log: ctx.log, doubleStrikeUids: ds.enemyUids || [] });

    // 默认飞行方向由回合组件 register 设置（幂等）

    const roundStartEvents = flushBattleEvents();
    // enemyDoubleStrikeUids 一并传出：原先只传 ds.unitUids（明教），六大派连击者 uid 被丢弃，
    //   一路断到 render/403，六大派格子永不显示 ⚡。
    return { doubleStrikeUnitUids: ds.unitUids, enemyDoubleStrikeUids: ds.enemyUids, roundStartEvents, roundComps };
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

    // 状态源唯一：本步为每个单位冻结一份真值（getStat 现算），随 step 下发。
    //   下游（player/42 → render/32）只读它，不再从 _mods 词条原料现算，也不再从日志 snap 单点捞
    //   （那些路径都受引擎活体共享影响，回放/联机读到终态 → 「格子防37/日志防56」的根因）。
    //   冻结时刻 = 本步末（引擎此刻状态）。含全单位：死掉的 hp=0、新召唤的也在 A/B 里。
    const makeStep = (logs, evs, winner = null, done = false) => {
        const frozenValues = {};
        for (const u of [...A, ...B]) {
            frozenValues[u.uid] = {
                atk: getStat(u, 'atk'),
                def: getStat(u, 'def'),
                maxHp: getStat(u, 'maxHp'),
                hp: u.hp
            };
        }
        return {
            log: [...logs],
            events: evs,
            ally: A,
            enemy: B,
            winner,
            done,
            doubleStrikeUid: doubleStrikeUnitUids,
            enemyDoubleStrikeUid: enemyDoubleStrikeUids,
            frozenValues,
            stageActions: ui && translateFacts ? translateFacts(logs) : []
        };
    };

    const { doubleStrikeUnitUids, enemyDoubleStrikeUids, roundStartEvents, roundComps } = prepareRoundStart(A, B, state, { log, round, rng });

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
        // 状态迁移通用分发：路由表在 modules/27 注册，deferred 的攒下回合、即时的当场执行
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
            // 攻=0 一律不发起攻击，走休息通道（含众志成城 0 攻补员）；被加攻词条抬到 >0 即恢复出战。
            //   文案保留身份：拒马「拒马休息」、幼狮「幼狮休息」，其余「无力攻击」。
            if (getStat(u, 'atk') <= 0) {
                passUnits.push({ unit: u, reason: u.isHorse ? '拒马休息' : (u.isLionCub ? '幼狮休息' : '无力攻击') });
                continue;
            }
            // 「不争」者不攻击：走"生生不息"休息通道；endlessBreath 由 content 技能声明驱动（applyHeroFlags 自动设）
            if (u.endlessBreath) { passUnits.push({ unit: u, reason: '生生不息' }); continue; }
            if (u.state._flyMode === 'butterfly' || u.state._flyMode === 'spider' || u.state._spiderFlying || (u._fsm && u._fsm.is('flying'))) { passUnits.push({ unit: u, reason: '飞天/附身' }); continue; }
            const fullAllySide = u.camp === CAMP_TYPES.ALLY ? A : B;
            const fullEnemySide = u.camp === CAMP_TYPES.ALLY ? B : A;
            // 连击宿主（明教被选中者 / 拥有永久连击的妹妹）无视遮挡，强行参战
            const isDoubleStrikeHost = (Array.isArray(doubleStrikeUnitUids) && doubleStrikeUnitUids.includes(u.uid)) || (u.state && u.state._permanentBuffs && u.state._permanentBuffs.some(b => b.key === BUFF_TYPES.DOUBLE_STRIKE));
            
            // 嗜血狂刀宿主：只要有团队版，或者妹妹永久版，且自身是战士，同样无视遮挡
            const teamBuffs = fullAllySide._activeBuffs || [];
            const hasTeamBloodthirst = hasBuff(teamBuffs, BUFF_TYPES.BLOODTHIRST);
            const hasBrotherBloodthirst = fullAllySide.some(m => m.isXiaoZhaoBrother && m.alive && m.state?._permanentBuffs?.some(b => b.key === BUFF_TYPES.BLOODTHIRST));
            const isBloodthirstHost = (hasTeamBloodthirst || hasBrotherBloodthirst) && u.role === ROLE_TYPES.WARRIOR;
            
            // 带「癫」的角色无视遮挡，强行参战
            const isCrazyHost = !!(u.state && u.state._isCrazy);

            if (isBlocked(u, fullAllySide) && isMelee(u.role) && !isDoubleStrikeHost && !isBloodthirstHost && !isCrazyHost) { passUnits.push({ unit: u, reason: '被遮挡' }); continue; }
            const decl = { priority: 0, skip: false, pass: false, jumpConsume: false };
            // log 随载荷下发：先机插队公告由组件（modules/27）推 SKILL_ANNOUNCE，core 不认识杨逍
            eventBus.emit(SIGNAL_TYPES.BEFORE_ACTION_SELECT, { unit: u, declaration: decl, allySide: fullAllySide, enemySide: fullEnemySide, log });
            // 组件声明 skip = 本回合不行动：必须就地消费掉行动权，否则该单位一直 alive && !_acted，
            //   外层 while 永不退出（小昭·妹蜘蛛卵卡死即此因）。
            //   同时补一条与下方 passEntry 同结构的 PASS fact（回合末不变量要求行动权有账）。
            if (decl.skip) {
                u.state._acted = true;
                log.push({ factType: FACT_TYPES.PASS, data: { unit: { uid: u.uid, name: u.name, camp: u.camp, pos: u.pos, hp: u.hp }, reason: u.state._spiderEgg ? '蜘蛛卵结茧' : '组件声明skip', hpBefore: u.hp, hpAfter: u.hp, actualHeal: 0, events: [] } });
                continue;
            }
            if (decl.pass) { passUnits.push({ unit: u, reason: '组件声明pass' }); continue; }
            priorityDeclarations.push({ unit: u, priority: decl.priority, jumpConsume: decl.jumpConsume });
        }

        const queue = [];
    for (const d of priorityDeclarations) queue.push({ unit: d.unit, isPass: false, priority: d.priority, jump: d.jumpConsume ? 1 : 0, reason: null });
    for (const p of passUnits) queue.push({ unit: p.unit, isPass: true, priority: 0, jump: 0, reason: p.reason });
    queue.sort((a, b) => {
        // 杨逍「先机」插队式抢先（纠口径：抢的是顺序不是行动权）：jump 者排最前，但 priority 仍 0 ⇒
        //   isPriorityAction=false，本步仍算本队这一步（出手后照常切换阵营）；本该先手的队友不消费行动权
        //   ——保持未出手状态，下轮本队再轮到时照常出手
        if (a.jump !== b.jump) return b.jump - a.jump;
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.unit.pos - b.unit.pos;
    });

    if (queue.length === 0) return { actingUnit: null, passEntry: null, isPriorityAction: false, consumed: [] };
    const head = queue[0];
    if (head.isPass) return { actingUnit: null, passEntry: { unit: head.unit, reason: head.reason }, isPriorityAction: false, consumed: [] };
    // 插队只改顺序、不消费任何人
    return { actingUnit: head.unit, passEntry: null, isPriorityAction: head.priority > 0, consumed: [] };
    }

    let currentSide = state._firstSide || CAMP_TYPES.ENEMY;

    // 待死单位（hp 已归零、_pendingDeath=true，等 resolveDeaths 清）不算「还有未行动的人」：
    //   只判 alive 会让循环永远为真（这类单位 alive 仍是 true、_acted 也不会被置），
    //   而它们又选不出可行动目标 → 阵营来回切换、死循环或拖到回合上限。
    //   真正死亡由本轮末尾的 finalizeRoundEnd → resolveDeaths 统一落地。
    while (
        A.some(u => u.alive && u.hp > 0 && !u.state._pendingDeath && !u.state._acted) ||
        B.some(u => u.alive && u.hp > 0 && !u.state._pendingDeath && !u.state._acted)
    ) {
        const currentTeam = currentSide === CAMP_TYPES.ALLY ? A : B;
        // 首个友方回合相位：回合组件实现 onFirstAllyTurn 钩子（组件自找目标触发附身），
        //   返回 true = 插播一段演出，主循环 yield 一步
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
        // hp>0 且非待死才算候选：一击致死会先挂 _pendingDeath、死亡结算在更后面，
        //   中间若还把他当候选，就会出现「0 血单位出手、反击伤害 0」这类战报（实机已见）。
        const candidates = currentTeam.filter(u => u.alive && u.hp > 0 && !u.state._pendingDeath && !u.state._acted).sort((a, b) => a.pos - b.pos);
        if (candidates.length === 0) {
            currentSide = currentSide === CAMP_TYPES.ALLY ? CAMP_TYPES.ENEMY : CAMP_TYPES.ALLY;
            continue;
        }
        const orderResult = resolveActionOrder(candidates, log);


        if (orderResult.passEntry) {
            const { unit, reason } = orderResult.passEntry;
            unit.state._acted = true;
            unit.state._blocked = isBlocked(unit, currentTeam);
            // 引擎一律实数（显示取整只在 infra/102 的 fmtHpText/fmtNum 出口）：
            //   原 floor 会把残血 0.4 拍成 0、把「休息回复 15」记成整数差值，战报与真实血量对不上。
            const hpBefore = unit.hp;
            let hpAfter = hpBefore;
            let actualHeal = 0;
            if (unit.alive && (reason === '被遮挡' || reason === '拒马休息' || reason === '幼狮休息' || reason === '无力攻击')) {
                applyStatChange(unit, 'hp', 15, null, '休息回复');
                hpAfter = unit.hp;
                actualHeal = hpAfter - hpBefore;
            }
            const passFact = { unit: { uid: unit.uid, name: unit.name, camp: unit.camp, pos: unit.pos, hp: unit.hp }, reason, hpBefore, hpAfter, actualHeal, events: [] };
            passFact.events = flushBattleEvents();
            log.push({ factType: FACT_TYPES.PASS, data: passFact });
            // 行动完成广播（休息/遮挡/生生不息都算一次行动）
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

        processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUids?.[0] ?? null);
        resolveDeaths(A, B, log);
        // 行动完成广播（攻击成功/未命中/被闪避都算走完一次）
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
        // 圣火不熄修复：排队复活的单位算存活，团灭判定推迟到复活落位之后
        const allyAlive = teamAliveOrPending(A);
        const enemyAlive = teamAliveOrPending(B);
        let winner = null;
        let done = false;
        if (!allyAlive) { winner = '六大派'; done = true; }
        else if (!enemyAlive) { winner = '明教'; done = true; }
        // 不争（防拖平局）：敌方活着的人全都有「不争」属性（如召唤了多个张三丰）→ 明教直接获胜；
        //   noContend 由 content 技能声明驱动（applyHeroFlags 自动设），引擎不认英雄
        else {
            const bAlive = B.filter(u => u.alive);
            if (bAlive.length > 0 && bAlive.every(u => u.noContend)) {
                winner = '明教'; done = true;
                // 名字去重，防止日志里出现「张三丰、张三丰」的滑稽画面
                const names = [...new Set(bAlive.map(u => u.name))].join('、');
                log.push({ factType: FACT_TYPES.NO_CONTEND, data: { unitName: names } });
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

    // 蓄意轰拳瞄准窗口：行动循环结束后、收尾结算前，若寒离飒蓄力到期且 ui 模式，先 yield 一个空标记步。
    //   播放层此时弹瞄准黑幕，把 _hlsAim* 写进 step 单位（与本 generator 的 A/B 同引用），收尾结算即读到。
    //   ui:false（headless）不 yield，结算走随机前排兜底。
    if (ui && [...A, ...B].some(u => u && u.isHanLiSa && u.alive && u.state && (u.state._hlsCharging || 0) === 2)) {
        const aimStep = makeStep([], []);
        aimStep.hanlisaAimWindow = true;
        yield aimStep;
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

    const { winner, done, endEvents } = finalizeRoundEnd(A, B, { log, round });
    yield makeStep(log, endEvents, winner, done);
}

function finalizeRoundEnd(A, B, ctx) {
    [A, B].forEach(team => {
        for (let i = team.length - 1; i >= 0; i--) {
            const u = team[i];
            u.state._resting = false;
        }
    });

    destroyHorse(A, ctx.log); destroyHorse(B, ctx.log);

    let winner = null;
    let done = false;
    // 回合最后一手阵亡时 pending 复活者不算团灭，让流程进入下一回合由 flushHolyFireRoundStart 兜底复活后再定胜负
    if (!teamAliveOrPending(B)) { winner = '明教'; done = true; }
    else if (!teamAliveOrPending(A)) { winner = '六大派'; done = true; }
    if (ctx.round >= C.MAX_ROUND && !done) { winner = '平局'; done = true; }

    eventBus.emit(SIGNAL_TYPES.ON_ROUND_END, { A, B, log: ctx.log, forced: true });

    if (winner) {
        let losers = winner === '明教' ? B : A;
        losers.forEach(u => {
            // 终局清场也要留死亡事实（字段与 resolveDeaths 完全一致：uid/name/camp/reason/hpBefore/hpAfter）。
            //   只对清场时仍活着的单位记账：已阵亡者早在 resolveDeaths 落过 UNIT_DEATH，重复记会多出死亡。
            const wasAlive = u.alive;
            const hpBefore = u.hp;
            // 死亡收口统一走 killUnit（内部 ignoreCap=true：这是状态收口而非受伤，不能被 _dmgCap 截断，否则死者 hp>0）
            killUnit(u, null, '战斗结束');
            u.alive = false;
            u.state._isDead = true;
            emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: 0, maxHp: u.maxHp, alive: false, atk: getStat(u, 'atk'), def: getStat(u, 'def'), _isDead: true });
            if (wasAlive) {
                ctx.log.push({ factType: FACT_TYPES.UNIT_DEATH, data: {
                    uid: u.uid, name: u.name, camp: u.camp,
                    reason: '终局清场', hpBefore, hpAfter: u.hp
                } });
            }
        });
    }

    pushFact(ctx.log, FACT_TYPES.ROUND_END, { round: ctx.round });

    const endEvents = flushBattleEvents();

    finalizeDeaths(A);
    finalizeDeaths(B);
    return { winner, done, endEvents };
}
