// V6.3.27 | ~40300 bytes | 2026-10-17 prepareRoundStart 第3步删死代码：applyTeamRoundBuffs 内 computeBuffStats
//           死调用及只服务它的 carry 拼阵亡队友拼接一并删除（computeDodgeChance 内的 computeBuffStats 保留）。
// V6.3.26 | ~38000 bytes | 2026-10-17 prepareRoundStart 拆阶段（第1步·纯搬，零行为变化）：
//           clearRoundEntries / spawnHorsesAndPickDoubleStrike / prepareRoundSpawns / installRoundMechanics /
//           linkPartners / prepareSoulDrain / computeDodgeChance 七个阶段子函数；主函数仅编排，A/B 循环原样保留。
// V6.3.25 | 2026-10-16 深夜先机纠口径（老板）：占位式→插队式——抢的是出手顺序不是行动权，删 V6.3.24 的
//           _jumpConsumed 与「被先机占用」PASS fact 通道；被顺延队友保持未出手、下轮照常行动；
//           BEFORE_ACTION_SELECT 载荷加 log（插队公告由 modules/27 推 SKILL_ANNOUNCE，core 不认识杨逍）
// V6.3.24 | 2026-10-16 先机占用者补 _jumpConsumed 标记（当晚被 V6.3.25 插队式推翻，方案留档）
// V6.3.23 | ~36100 bytes | 2026-10-16 杨逍「先机」占位式抢先（老板口径）：resolveActionOrder 支持 decl.jumpConsume——
//           jump 者排队首但 priority 仍 0（isPriorityAction=false，本步仍算本队这一步、出手后照常切换阵营），
//           同时把「本步本该出手者」（队列里除他外首个非 pass 条目）置 _acted 并补 PASS fact
//           （reason='被先机占用'，render/35 已同步）——队伍本次出手次数真的 −1
// V6.3.28 | ~40300 bytes | 2026-10-17 众志成城持续回合 5→3（content unity.duration 同步，本文件注释一并改 3）
// V6.3.22 | ~35800 bytes | 2026-10-16 「0 攻不发起攻击」通则化（老板拍板）：resolveActionOrder 删 isHorse/isLionCub
//           两个身份特判，改为「getStat(u,'atk') <= 0 一律走休息通道」——对全体单位生效（含众志成城 0 攻补员）；
//           休息回复 +15 名单同步加「无力攻击」（拒马/幼狮保留原 reason 文案，render/35 同款名单已同步）
// V6.3.21 | ~35700 bytes | 2026-10-16 圣火不熄与判负时序修复（老板拍板方案 A·新语义）：团灭判定把「排队复活」的单位
//           （state._holyFire/_holyFireSelf === 'pending'）算作未死透——阵亡当帧只记 pending、真正落位在下一个行动步
//           开头（BEFORE_STATE_TRANSITION），此前最后一名单位阵亡会当步末直接判负并结束战斗，复活永远等不到那一步
//           （回合兜底也到不了）。新口径只作用于团灭判定（步末 + 回合末两处）；落位失败时 revive 首行已把标记改 'used'，
//           故不会无限延长战斗。同批：注释里众志成城 M 值 30→20（content 同步）
// V6.3.20 | ~35570 bytes | 2026-10-16 众志成城补员改版（老板拍板「一直召唤」）：spawnUnityRecruits 调用点去掉
//           已弃用的 state 形参（新逻辑不再读 _unityChecked/_unityNoRecruit 锁，改「补满 5 + 每回合 +1」）
// V6.3.19 | ~35570 bytes | 2026-10-16 skip 通道补 PASS fact（体检第 96 轮转交）：组件声明 skip（小昭·妹蜘蛛卵结茧 /
//           蝶变附身中）此前只置 _acted、不产任何 fact ⇒ 回合末不变量报「行动权被吞」；现就地推一条与 passEntry
//           同结构的 PASS fact（reason 按 _spiderEgg 区分「蜘蛛卵结茧 / 组件声明skip」），检查器与渲染器同款消费
// V6.3.18 | ~31200 bytes | 2026-10-16 众志成城召唤物重名保护（老板拍板「重名可保留、不得引出别的 bug」）：
//           prepareRoundStart 组件工厂循环前算 dupRecruitNames（与场上其他单位同名的 isUnityRecruit），
//           循环内跳过这些白板召唤物的组件注册（同名原版已注册，重复注册会让 declarations/hook 翻倍）；
//           搭档连线扫描排除 isUnityRecruit（防召唤物顶替阵亡原版被配对）
// V6.3.17 | ~31000 bytes | 2026-10-15 第二批内容接线：import 补 applyLastStandBonus/applyUnityBonus/spawnUnityRecruits；
//           prepareRoundStart 在 spawnCarryEagle 之后、组件工厂循环之前调 spawnUnityRecruits(A/B)（众志成城补员，
//           当回合即挂技能），A/B 两侧 applyCarryBonus 之后各调 applyLastStandBonus/applyUnityBonus（背水一战残血增伤、众志成城人数阶梯）
// V6.3.16 | ~30400 bytes | 2026-10-14 carry 放开 5 号位门槛（老板拍板）：prepareRoundStart 在 buff 变换器重算
//           activeBuffs 之后、组件工厂循环之前调 spawnCarryEagle(A/B)——5 号位无人则召唤雄鹰顶位（当回合即注册技能）
// V6.3.15 | ~30300 bytes | 2026-10-15 妹永久摄魂「点名 2 回合」调度（老板拍板削弱）：重置后、ON_ROUND_START 前，
//           先对双方 _soulDrainRounds 存量 -1，再由 preparePermanentSoulDrain 各方向随机点名 1 名敌方（非马/非召唤物）
// V6.3.14 | ~29900 bytes | 2026-10-14 applySoulDrain 两处调用点补传 casterSide（施法方队伍）——
//           core/04 靠它判「小昭·妹永久续上」「小昭·姊增强」，只加字段不改签名
// V6.3.13 | 2026-10-13 修死循环：组件声明 skip 时必须把该单位 state._acted 置 true
//           （原先只 continue 不消费行动权，跳过选招的单位会一直 alive && !_acted，回合内 while 永不退出）。
//           实际踩雷：小昭·妹蜘蛛卵（modules/27 submitSpiderSkipDeclaration）——单英雄跑批约 1/4 概率整局卡死
// V6.3.12 | 2026-10-13 ctx 收口（攻击链签名稳定）：prepareRoundStart / finalizeRoundEnd 的上下文型尾参
//           （log、round、rng）合并为单 ctx 对象；core/04 三函数（applySoulDrain/applyHolyFlameBonus/logBuffSummary）
//           调用点同步改传 ctx。业务参数保持原位，行为零变化（20 seeds × 7 关逐步日志逐字节一致）。
export const VER = 'core/11battle-round.js V6.3.28';

import { CONFIG, getGameData } from './01config-5v5-test.js';
import { resetStateFields } from './17-state-keys.js';
import { isMelee, isBlocked, hasBuff, getAuraBonuses, registerWarriorBreakDefense, registerRangedGrowth, registerFortifyShield, registerWarriorExecute, registerDoubleStrike } from './03battle-utils.js';   // 2026-10-08 清死import×8（特判收口后失业：makeFXSnapshot/getUnitCol/getUnitRow/hasAnyEnemyEmptyCol/countEnemyEmptyCols/getBloodAuraBonus/registerEmptyColBonus）
import { computeBuffStats, logBuffSummary, applyHolyFlameBonus, applyFortifyBonus, applyCarryBonus, applySoulDrain, preparePermanentSoulDrain, spawnCarryEagle, applyLastStandBonus, applyUnityBonus, spawnUnityRecruits, installBuffMechanics, onUnitDeathFlyerRegen } from './04buff-system.js';
import { spawnHorse, destroyHorse } from './05battle-horse.js';
import { Unit } from './02unit.js';
import { clearEliteDodgeRules, getDodgeRules } from './20-registry-dodge.js';
import { installDeclaredSkills, installFromGameData } from './15-skill-mechanisms.js';
import { resolveRoundStatGrants } from './16effect-handlers.js';
import { clearAllWatchers } from './19unit-watch.js';

import { getEliteFactories, getRoundComponentNames, getBuffRoundTransformers, getLinkPartnerPairs, getStateTransitionSpec, isHolyFlameEnhanced } from './08-registry-elite.js';
import { processUnitAttack } from './10battle-attack.js';
import { eventBus, EXECUTION_LAYER as L, registerSettlementHook } from '../infra/50-event-bus.js';
import { getNextAvailableUnit, finalizeDeaths, emitFullUnitState, emitEvent, applyStatChange, setBattleRng, setPresentationRng, addMod, removeModsByTTL, getStat, refreshMaxHp } from './13battle-shared.js';
import { FACT_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, SIGNAL_TYPES } from '../infra/56-battle-enums.js';
import { flushBattleEvents, setBattleState } from '../infra/51-core-utils.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import { resolveDeaths } from './12battle-attack-steps.js';

const C = CONFIG;

// 2026-10-16 圣火不熄与判负时序（老板拍板方案 A·新语义）：阵亡当帧只记 state._holyFire='pending'，
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

// ───────────────────────── prepareRoundStart 阶段子函数（V6.3.26 纯搬） ─────────────────────────

// 阶段1：切当回合 activeBuffs、清理上回合 round 词条（永久/附身保留）、清战场态、推 ROUND_START。
function clearRoundEntries(A, B, state, ctx) {
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

    let unitUid = null;
    let enemyUid = null;
    if (hasBuff(A._activeBuffs, BUFF_TYPES.DOUBLE_STRIKE)) {
        let candidates = A.filter(u => u.alive && !u.isHorse);
        if (candidates.length > 0) {
            let chosen = candidates[ctx.rng.nextInt(0, candidates.length - 1)];
            unitUid = chosen.uid;
        }
    }
    if (hasBuff(B._activeBuffs, BUFF_TYPES.DOUBLE_STRIKE)) {
        let candidates = B.filter(u => u.alive && !u.isHorse);
        if (candidates.length > 0) {
            let chosen = candidates[ctx.rng.nextInt(0, candidates.length - 1)];
            enemyUid = chosen.uid;
        }
    }

    setBattleState('currentBattleState', { ally: state.allAllies, enemy: state.enemy });

    if (unitUid) {
        const dsUnit = A.find(u => u.uid === unitUid);
        if (dsUnit) ctx.log.push({ factType: FACT_TYPES.DOUBLE_STRIKE_SUMMARY, data: { unitName: dsUnit.name } });
    }

    ctx.log.filter(l => l.factType === 'horseSummon').forEach(hl => {
        const horse = A.find(u => u.uid === hl.data.horseUid);
        if (horse) {
            emitFullUnitState(horse, UNIT_EVENT_TYPES.UNIT_ADD);
        }
    });

    return { unitUid, enemyUid };
}

// 阶段3：圣火令 buff 变换器重算（之后重切 activeBuffs）→ 召雄鹰 → 众志成城补员。
function prepareRoundSpawns(A, B, state, ctx) {
    // 2026-10-08 V7.5.13 圣火令增强迁 modules/27：回合开始 buff 变换器注册面，
    //   同位置同条件画 rng（序不变，基线二分保障）；无增强者在变换器内部走默认行列重画
    for (const [buffKey, transformBuff] of getBuffRoundTransformers()) {
        state.activeBuffs = state.activeBuffs.map(b => (b.key === buffKey ? transformBuff(b, ctx.rng, A, B) : b));
    }
    A._activeBuffs = state.activeBuffs.filter(b => b.target === CAMP_TYPES.ALLY || !b.target);
    B._activeBuffs = state.activeBuffs.filter(b => b.target === CAMP_TYPES.ENEMY);
    // 圣火令统一在下面的回合开始循环里施加，此处不再重复登记词条

    // 2026-10-14 carry 放开 5 号位门槛：5 号位无人则召唤雄鹰顶位（每队整局 1 只）。
    //   必须早于下方组件工厂循环 —— 雄鹰当回合就在 A/B 里，才能被注册面挂上技能。
    spawnCarryEagle(A, ctx.log);
    spawnCarryEagle(B, ctx.log);

    // 2026-10-16 众志成城（unity）改版：获得当回合把人数补满到 5、此后每回合再补 1 个（M20/技能全开，
    //   持续由 content unity.duration:3 管，上限只剩 9 格站位），
    //   同样必须早于下方组件工厂循环——召唤出的精英当回合才能被注册面挂上技能。
    spawnUnityRecruits(A, ctx.log);
    spawnUnityRecruits(B, ctx.log);
}

// 阶段4：清裁判登记 → 注册本回合战斗机制 → 工厂循环实例化回合组件 → 装声明技能/数据表。
function installRoundMechanics(A, B, state, ctx, ds) {
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
    registerDoubleStrike(eventBus, ds.unitUid, A, A._activeBuffs);
    registerDoubleStrike(eventBus, ds.enemyUid, B, B._activeBuffs);
    // 飞行再生：每死一个非拒马角色，全场飞行立即回 baseRegen 生命（数值读 roles.飞行.baseRegen）
    // 2026-10-05 修静默 bug：不能闭包本函数 ctx.log——它在回合开始步 yield 后就被主循环换成新数组，
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
    // 2026-10-16 重名保护（配套 core/04）：与场上其他单位同名的 unity 召唤物已在 core/04 降级为白板，
    //   此处再按名字跳过它的组件注册——同名原版已注册，重复注册会让 declarations/hook 翻倍
    //   （installDeclaredSkills 按 name 命中，同一份声明装两次 = 每次触发算两遍）
    const dupRecruitNames = new Set();
    for (const u of allUnits) {
        if (u.isUnityRecruit && allUnits.some(o => o !== u && o.name === u.name)) dupRecruitNames.add(u.name);
    }
    for (const u of allUnits) {
        if (!u.alive) continue;
        if (u.isUnityRecruit && dupRecruitNames.has(u.name)) continue;
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
            comp.register(eventBus, A, B, ctx.log);
        }
    }
    installDeclaredSkills(eventBus, A, B, ctx.log, declaredSkills);
    installFromGameData(eventBus, A, B, ctx.log, getGameData());

    return { roundComps };
}

// 阶段5：搭档连线（仅扫敌方 B，配对双方互挂 _linkedPartnerUid）。
function linkPartners(A, B) {
    // 2026-10-08 V7.5.13 搭档连线泛化：配对知识在英雄模块侧注册（原两对搭档内联连线）；
    //   原版仅扫敌方 B，保持
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

    // 2026-10-14 妹永久摄魂「点名 2 回合」：先递减存量（挂标当回合算 1，共 2 回合），再各方向随机点名 1 名敌方
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
    team.forEach(u => {
        if (!u.alive) return;
        emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: getStat(u, 'atk'), def: getStat(u, 'def'), _stunned: false });

        applyHolyFlameBonus(u, buffs, { hasSister: isAlly ? isHolyFlameEnhanced(team) : false, log: ctx.log });
        applyFortifyBonus(u, buffs);
        applySoulDrain(u, enemyBuffs, { log: ctx.log, casterAlive, targetAlive, round: ctx.round, casterSide: enemy });
        applyCarryBonus(u, team, state, ctx.log);
        applyLastStandBonus(u, buffs, ctx.log);
        applyUnityBonus(u, team, buffs, ctx.log);

        const auraBonuses = getAuraBonuses(u, team, enemy);
        // 数值声明 fact：每存活单位每回合 1 条（两值为 0 也发，供体检对照 aura group 续期）
        ctx.log.push({ factType: FACT_TYPES.AURA_APPLY, data: { unitName: u.name, unitUid: u.uid, camp: u.camp, emptyCol: auraBonuses.emptyCol, bloodAura: auraBonuses.bloodAura } });
        if (auraBonuses.emptyCol > 0) addMod(u, 'atk', { source: '空列光环', value: auraBonuses.emptyCol, ttl: 'round', group: 'aura', op: 'add' });
        if (auraBonuses.bloodAura > 0) addMod(u, 'atk', { source: '残血光环', value: auraBonuses.bloodAura, ttl: 'round', group: 'aura', op: 'add' });

        emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: getStat(u, 'atk'), def: getStat(u, 'def') });

        u.state._xingFenExtraAttacking = false;
        u.state._bloodthirstStriked = false;
        Object.assign(u.state, { _doubleStriked: false });
    });
}

function prepareRoundStart(A, B, state, ctx) {
    clearRoundEntries(A, B, state, ctx);
    const ds = spawnHorsesAndPickDoubleStrike(A, B, state, ctx);
    prepareRoundSpawns(A, B, state, ctx);
    const { roundComps } = installRoundMechanics(A, B, state, ctx, ds);
    linkPartners(A, B);
    prepareSoulDrain(A, B, ctx);

    A._butterflyTriggered = false;
    A._mindControlTriggered = false;
    // 2026-10-12 摄魂逆风补偿用：本回合双方存活单位数快照（非马，与 L60/67 挑人、苦练「全队非马存活单位」同口径）
    const aliveCountA = A.filter(x => x.alive && !x.isHorse).length;
    const aliveCountB = B.filter(x => x.alive && !x.isHorse).length;

    const alive = { A: aliveCountA, B: aliveCountB };
    applyTeamRoundBuffs(A, B, state, ctx, alive, true);
    applyTeamRoundBuffs(B, A, state, ctx, alive, false);

    computeDodgeChance(A, B);

    logBuffSummary(A, { log: ctx.log, doubleStrikeUid: ds.unitUid });

    // 2026-10-08 默认飞行方向迁回合组件 register（幂等 ||=，无人中途清空 → 每轮设与首轮设等价）

    const roundStartEvents = flushBattleEvents();
    return { doubleStrikeUnitUid: ds.unitUid, roundStartEvents, roundComps };
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

    // 2026-10-11 状态源唯一：本步为每个单位冻结一份真值（getStat 现算），随 step 下发。
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
            doubleStrikeUid: doubleStrikeUnitUid,
            frozenValues,
            stageActions: ui && translateFacts ? translateFacts(logs) : []
        };
    };

    const { doubleStrikeUnitUid, roundStartEvents, roundComps } = prepareRoundStart(A, B, state, { log, round, rng });

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
            // 2026-10-16 通则化（老板拍板）：攻=0 的单位一律不发起攻击，走休息通道——
            //   原「拒马 / 幼狮 0 攻不攻击」是身份特判，现上升为对所有单位生效的通则（含众志成城 0 攻补员）；
            //   被振奋之类加攻词条抬到 >0 即恢复出战（职业是防战 → core/12 走防战公式）。
            //   文案保留身份：拒马用「拒马休息」、幼狮用「幼狮休息」（render/35 有专属文案），其余统一「无力攻击」。
            if (getStat(u, 'atk') <= 0) {
                passUnits.push({ unit: u, reason: u.isHorse ? '拒马休息' : (u.isLionCub ? '幼狮休息' : '无力攻击') });
                continue;
            }
            // 2026-09-17 「不争」者不攻击：轮到他走"生生不息"休息，走 pass 通道而不是攻击流程
            //   2026-10-08 改数据旗：endlessBreath 由 content 技能声明驱动（applyHeroFlags 自动设）
            if (u.endlessBreath) { passUnits.push({ unit: u, reason: '生生不息' }); continue; }
            if (u.state._flyMode === 'butterfly' || u.state._flyMode === 'spider' || u.state._spiderFlying || (u._fsm && u._fsm.is('flying'))) { passUnits.push({ unit: u, reason: '飞天/附身' }); continue; }
            const fullAllySide = u.camp === CAMP_TYPES.ALLY ? A : B;
            const fullEnemySide = u.camp === CAMP_TYPES.ALLY ? B : A;
            if (isBlocked(u, fullAllySide) && isMelee(u.role)) { passUnits.push({ unit: u, reason: '被遮挡' }); continue; }
            const decl = { priority: 0, skip: false, pass: false, jumpConsume: false };
            // 2026-10-16 log 随载荷下发：先机插队公告由组件（modules/27）推 SKILL_ANNOUNCE，core 不认识杨逍
            eventBus.emit(SIGNAL_TYPES.BEFORE_ACTION_SELECT, { unit: u, declaration: decl, allySide: fullAllySide, enemySide: fullEnemySide, log });
            // 2026-10-13 组件声明 skip = 本回合不行动：必须就地消费掉行动权，否则该单位
            //   一直 alive && !_acted，外层 while（L367）永不退出 —— 小昭·妹蜘蛛卵卡死即此因
            // 2026-10-16 V6.3.19 补 PASS fact（体检第 96 轮转交）：skip 通道此前只置 _acted、不产任何 fact，
            //   回合末不变量据此报「行动权被吞」（小昭·妹蜘蛛卵结茧每回合走此路，855d52c 上 4 类违规）。
            //   补一条与下方 passEntry 同结构的 PASS fact（检查器/渲染器同款消费），条数随结茧回合落入战报。
            if (decl.skip) {
                u.state._acted = true;
                log.push({ factType: FACT_TYPES.PASS, data: { unit: { uid: u.uid, name: u.name, camp: u.camp, pos: u.pos, hp: u.hp }, reason: u.state._spiderEgg ? '蜘蛛卵结茧' : '组件声明skip', hpBefore: Math.floor(u.hp), hpAfter: Math.floor(u.hp), actualHeal: 0, events: [] } });
                continue;
            }
            if (decl.pass) { passUnits.push({ unit: u, reason: '组件声明pass' }); continue; }
            priorityDeclarations.push({ unit: u, priority: decl.priority, jumpConsume: decl.jumpConsume });
        }

        const queue = [];
    for (const d of priorityDeclarations) queue.push({ unit: d.unit, isPass: false, priority: d.priority, jump: d.jumpConsume ? 1 : 0, reason: null });
    for (const p of passUnits) queue.push({ unit: p.unit, isPass: true, priority: 0, jump: 0, reason: p.reason });
    queue.sort((a, b) => {
        // 2026-10-16 杨逍「先机」插队式抢先（深夜老板纠口径：抢的是顺序不是行动权）：
        //   jump 者排最前，但 priority 仍 0 ⇒ isPriorityAction=false，本步仍算本队这一步（出手后照常切换阵营）；
        //   本该先手的队友不消费行动权——保持未出手状态，下轮本队再轮到时照常出手
        if (a.jump !== b.jump) return b.jump - a.jump;
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.unit.pos - b.unit.pos;
    });

    if (queue.length === 0) return { actingUnit: null, passEntry: null, isPriorityAction: false, consumed: [] };
    const head = queue[0];
    if (head.isPass) return { actingUnit: null, passEntry: { unit: head.unit, reason: head.reason }, isPriorityAction: false, consumed: [] };
    // 插队只改顺序、不消费任何人：原先「占用」逻辑（victim._acted=true + PASS fact）随 V6.3.25 删除
    return { actingUnit: head.unit, passEntry: null, isPriorityAction: head.priority > 0, consumed: [] };
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

        // 2026-10-16 V6.3.25 先机改插队式（老板纠口径）：不再消费队友行动权、不再产「被先机占用」PASS fact——
        //   插队公告由 modules/27 在掷骰命中时推 SKILL_ANNOUNCE（走 BEFORE_ACTION_SELECT 载荷里的 log）

        if (orderResult.passEntry) {
            const { unit, reason } = orderResult.passEntry;
            unit.state._acted = true;
            unit.state._blocked = isBlocked(unit, currentTeam);
            const hpBefore = Math.floor(unit.hp);
            let hpAfter = hpBefore;
            let actualHeal = 0;
            // 2026-09-17 生生不息移到组件层（监听 ON_UNIT_ACTED），core 不再写角色名
            if (unit.alive && (reason === '被遮挡' || reason === '拒马休息' || reason === '幼狮休息' || reason === '无力攻击')) {
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
        // 2026-10-16 圣火不熄修复：排队复活的单位算存活，团灭判定推迟到复活落位之后
        const allyAlive = teamAliveOrPending(A);
        const enemyAlive = teamAliveOrPending(B);
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
    // 2026-10-16 圣火不熄修复（同步末口径）：回合最后一手阵亡时 pending 复活者不算团灭，
    //   让流程进入下一回合由 flushHolyFireRoundStart 兜底复活后再定胜负
    if (!teamAliveOrPending(B)) { winner = '明教'; done = true; }
    else if (!teamAliveOrPending(A)) { winner = '六大派'; done = true; }
    if (ctx.round >= C.MAX_ROUND && !done) { winner = '平局'; done = true; }

    eventBus.emit(SIGNAL_TYPES.ON_ROUND_END, { A, B, log: ctx.log, forced: true });

    if (winner) {
        let losers = winner === '明教' ? B : A;
        losers.forEach(u => {
            applyStatChange(u, 'hp', -u.hp, null, '战斗结束', false);
            u.alive = false;
            u.state._isDead = true;
            emitEvent(u, UNIT_EVENT_TYPES.HP_CHANGE, { hp: 0, maxHp: u.maxHp, alive: false, atk: getStat(u, 'atk'), def: getStat(u, 'def'), _isDead: true });
        });
    }

    ctx.log.push({ factType: FACT_TYPES.ROUND_END, data: { round: ctx.round } });

    const endEvents = flushBattleEvents();

    finalizeDeaths(A);
    finalizeDeaths(B);
    return { winner, done, endEvents };
}
