//           改 initBattleTeams 建完后 applyForcedWeakAlly 确定性替身换名（非锚点/非弱精英/非唯一前排，取 pos 最小）
// 由 109 职业平衡 Worker 扩展为多 kind 分发：'balance' | 'elite' | 'stats' | 'baseline' | 'hex' | 'random'
// hex 任务现为 101/108 共用：支持 preferredBuffs 偏好 + 小昭·妹永久继承，并回报胜负计数
// 每个 job 在 worker 内完成 N 场战斗并回报聚合；独立模块实例，天然隔离 _eliteStates/_eventBuffer
// Worker 环境兼容 shim：
//  - 战斗链 15-skill-mechanisms 白骨爪结算读 window.GlobalStore（运行时访问），globalThis 即 window 等价物
//  - 24（内容18流程）无 localStorage，圣火令/宝箱记账为运行时访问，补内存实现（模拟战斗不需要真持久化）
//
// ⚠️ 整局循环已全部收口到 core/06battle-runner（runBattle）。
//    本文件不再自写 while 回合循环——历史上这里有 3 份（runWholeBattle / runBalanceJob / runHexStageJob），
//    任何一处改错都不会被别人发现。新增需要"跑一局"的场景，一律调 runBattle，不要再抄循环。
if (typeof window === 'undefined') globalThis.window = globalThis;
if (typeof localStorage === 'undefined') {
    const _ls = new Map();
    globalThis.localStorage = {
        getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
        setItem: (k, v) => { _ls.set(k, String(v)); },
        removeItem: (k) => { _ls.delete(k); },
        clear: () => { _ls.clear(); }
    };
}
import { CONFIG, loadGameData, getGameData } from '../core/01config-5v5-test.js';
import { Unit } from '../core/02unit.js';
import { NATURAL_ELITES, SOLO_FORCE_KEY, WEAK_UNIT_FLAG, ELITE_UNIT_META } from './127-tool-registry.js';
import { SeededRNG, flushBattleEvents, onBattleEvents } from '../infra/51-core-utils.js';
import { runBattle } from '../core/06battle-runner.js';
import { setBattleRng } from '../core/13battle-shared.js';
import { createBuffObject, filterAvailableBuffs } from '../modules/28buff-tools.js';
import { addPermanentBuff } from '../modules/20elite-skills.js';
import { initBattleTeams } from '../modules/29battle-init.js';
import '../infra/54-global-store.js';
import '../modules/00reg-mechanics.js';   // 机制装配统一入口（25/26/27/30），V1.3.1 的 dotTick 漏装教训收口于此
import { CAMP_TYPES, ROLE_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES, FACT_TYPES } from '../infra/56-battle-enums.js';
import { eventBus } from '../infra/50-event-bus.js';
import { GlobalStore } from '../infra/54-global-store.js';

// 共用：清场
// 每个 job 开始与每场之间调用（与各工具主线程原逻辑一致）
function clearBattleGlobals() {
    eventBus.clearAll();
    GlobalStore.set('forceZhang', null);
    GlobalStore.set('forceWei', null);
    GlobalStore.set('forceXiaoZhao', null);
    // 2026-10-09 V1.7.1 补漏：forceXieXun / forcePang 原先没清——跑完谢逊单英雄后 forceXieXun 常驻 worker，
    // 之后任何 job 都会变成「本 job 精英 + 谢逊」双精英（elite/noElite 两个 job 根本不设 force，同样被污染）。
    // 对照 122-param-lab-core.js 的完整清单（五项）补齐。
    GlobalStore.set('forceXieXun', null);
    GlobalStore.set('forcePang', null);
    // 2026-10-22 V1.12.2：寒离飒强精英 force（29 V7.6.1 新增）——漏清会让后续 job 全部带寒离飒
    GlobalStore.set('forceHanLiSa', null);
    // 2026-10-16 V1.9.1 补漏：forceWeakElite（弱精英锁定，modules/29 V7.5.22 新增）——漏清会跨场污染弱精英出场率
    GlobalStore.set('forceWeakElite', null);
    // 2026-10-21 V1.12.0：寒离飒强精英单挑的轮盘抑制标志，漏清会让后续 job 全部少一个随机精英
    GlobalStore.set('forceSoloWeakElite', null);
    GlobalStore.set('currentBattleState', null);
    flushBattleEvents();
    // 状态已并入 unit.state，随对局对象 GC，无需清理（18-elite-state 已废弃）
}

// 共用：跑完整战斗（薄封装，保持调用点签名不变）。
// 循环本体在 core/06battle-runner；原实现里的 allAllies 手工同步与 buff 双递减一并删除
// （createRoundStepper 内部已自行处理，删掉后 18 场基线的 winner/rounds/factCount 逐条不变）。
function runWholeBattle(initAlly, initEnemy, seed, hexEnabled = false, opts = null) {
    const user = opts || {};
    const userOnStep = user.onStep || null;
    // V1.16.0：捕获引擎每步的实时敌方（step.enemy），供海克斯候选过滤的惑人心智门槛（敌方存活 >2）读取；
    //   core/06 的 hexPicker 签名只回传明教侧，不改主代码只能走 onStep 读引用。
    let liveEnemy = null;
    const onStep = (step) => {
        if (step && Array.isArray(step.enemy)) liveEnemy = step.enemy;
        if (userOnStep) userOnStep(step);
    };
    return runBattle({
        ally: initAlly,
        enemy: initEnemy,
        seed,
        // V1.15.0：weakContrib 观测通道（onStep 只读日志，不参与结算）；旧调用 opts=null 行为不变
        ...user,
        hexPicker: hexEnabled ? ((ab, al, rng) => pickHexBuff(ab, al, rng, false, liveEnemy || initEnemy)) : null,
        // 无海克斯、无观测调用时不上 onStep（保持旧路径零开销）
        onStep: (hexEnabled || userOnStep) ? onStep : undefined
    });
}

// 109 职业平衡：模板阵容 + 自动海克斯
const BASE_TEMPLATE = { 1: ROLE_TYPES.DEFENDER, 2: ROLE_TYPES.WARRIOR, 5: ROLE_TYPES.FLYER, 7: ROLE_TYPES.RANGED, 9: ROLE_TYPES.RANGED };

function createUnit(role, camp, rng) {
    const campLabel = camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
    const u = new Unit(`${campLabel}·${role}`, 100, role, camp);
    u.init(rng);
    u.applyBonus();
    return u;
}

function buildTeam(extraRole, camp, positions, rng) {
    const team = [];
    for (const [posStr, role] of Object.entries(BASE_TEMPLATE)) {
        const u = createUnit(role, camp, rng);
        u.pos = parseInt(posStr, 10);
        u._originalPos = u.pos;
        team.push(u);
    }
    const pool = positions[extraRole] || [3, 4, 6, 8];
    const extraPos = pool[rng.nextInt(0, pool.length - 1)];
    const extra = createUnit(extraRole, camp, rng);
    extra.pos = extraPos;
    extra._originalPos = extraPos;
    team.push(extra);
    return team;
}

function pickHexBuff(activeBuffs, allyTeam, rng, withFortifyRule, enemyTeam = []) {
    // 2026-10-22 V1.12.4：候选池过滤统一由 modules/28 filterAvailableBuffs 提供（与主代码同口径）；
    //   withFortifyRule 原样透传给 opts（职业平衡 job 专用：无剩余 buff 时禁选严阵以待）。
    // V1.16.0：enemyTeam 透传（惑人心智门槛要读敌方存活数）；按 ui/70 同口径先滤 alive
    const enemyAlive = (enemyTeam || []).filter(u => u && u.alive);
    const available = filterAvailableBuffs(activeBuffs, allyTeam, { withFortifyRule: !!withFortifyRule, enemyTeam: enemyAlive });
    if (available.length === 0) return null;
    const pick = available[rng.nextInt(0, available.length - 1)];
    const duration = CONFIG.BUFFS[pick].duration || CONFIG.BUFF_DURATION || 4;
    const nb = createBuffObject(pick, duration);
    // 2026-10-21 口径统一（老板「我不信胜率那么高」案）：正式服四个入口（ui/61/65/70、player/49）选完海克斯
    //   都调 addPermanentBuff 给妹永久继承——此前只有 108 hex job 的内联 picker 有、本共享 picker 漏了，
    //   112 精英评测跑的是「妹无永久海克斯」的平行世界，系统性低估妹（22:28 那张表妹总评 30.1% 即此口径）。
    //   补上后与正式服同规则；无妹阵容天然 no-op（职业平衡/无精英基线不受影响）。
    const brother = allyTeam.find(u => u.alive && u.isXiaoZhaoBrother);
    if (brother) {
        const extra = pick === BUFF_TYPES.HOLY_FLAME ? { cols: nb.cols, rows: nb.rows } : {};
        addPermanentBuff(brother, pick, nb.name, extra);
    }
    return nb;
}

function runBalanceJob(buildAlly, buildEnemy, seed, hexEnabled) {
    const rng = new SeededRNG(seed);
    setBattleRng(rng);
    // 开局 buff：原实现是"第 0 回合先补一个"（hexEnabled 时）。runner 用 initialBuffs 承接，
    // 保证同 seed 同序列——开局补一个 + 每 3 回合补一个，与原来节奏一致。
    let initialBuffs = [];
    if (hexEnabled) {
        const first = pickHexBuff(initialBuffs, buildAlly, rng, true, buildEnemy);
        if (first) initialBuffs.push(first);
    }
    // V1.16.0：同 runWholeBattle——捕获实时敌方，供惑人心智门槛
    let liveEnemy = null;
    const res = runBattle({
        ally: buildAlly,
        enemy: buildEnemy,
        seed,
        initialBuffs,
        hexPicker: hexEnabled ? ((ab, al, r) => pickHexBuff(ab, al, r, false, liveEnemy || buildEnemy)) : null,
        onStep: hexEnabled ? ((step) => { if (step && Array.isArray(step.enemy)) liveEnemy = step.enemy; }) : undefined,
        firstSide: CAMP_TYPES.ENEMY
    });
    return { winner: res.winner };
}

// 112 精英评测：跑普通局，按"谁在场"归因
// 不再 force 上场 —— force 会抑制随机抽取（29battle-init 的 `if (eliteCount > 0 && !forceZhang && !forceWei)`），
// 导致被 force 的精英按"单精英"评、未 force 的按"多精英"评，四列不同尺子不可比。
// 现改为：每关跑 runs 局普通对局（出率/站位/海克斯全走引擎原逻辑），
// 一局结束看谁在场，就把这局的结果记给谁（同场共现是真实环境，不是污染）。
// 2026-10-08 单英雄胜率（112「⚔ 单英雄胜率」按钮）：force 单精英 + 轮盘互锁（29 V7.5.16 起
// 张/韦/谢逊/小昭四路 force 全部抑制随机轮盘）= 每局明教侧只有这一个精英。
// 口径与普通评测一致：海克斯开、种子公式同款；胜 = 明教获胜。小昭姊/妹走 forceXiaoZhao 形态值。
function runSoloEliteJob(stage, seed, runs, elite, startIndex = 0) {
    // 2026-10-22 V1.12.3：force 键映射统一由 127 的 SOLO_FORCE_KEY 提供（含寒离飒的 forceHanLiSa）
    const keyMap = SOLO_FORCE_KEY;
    const isXz = elite === '小昭·姊' || elite === '小昭·妹';
    // 变体桶（V1.6.1）：与 runEliteStageJob 同款判定——按"本局敌方是谁"整局分桶，
    // 第3关轮换阵容拆成胖远桥/宋青书两行；其余关落进「标准」桶
    const newAgg = () => ({ runs: 0, wins: 0, sumSurv: 0, sumDmg: 0, sumTaken: 0 });
    const variants = { '胖远桥': newAgg(), '宋青书': newAgg(), '标准': newAgg() };
    for (let i = 0; i < runs; i++) {
        clearBattleGlobals();   // 注意：clear 会清 force，每场都要在 clear 之后重设
        if (isXz) GlobalStore.set('forceXiaoZhao', elite === '小昭·姊' ? 'sister' : 'brother');
        else GlobalStore.set(keyMap[elite], true);
        const battleSeed = seed + (startIndex + i) * 7919;
        const teams = initBattleTeams(stage, new SeededRNG(battleSeed));
        const ally = teams.allyTeam.map(u => u.clone());
        if (!ally.length) continue;
        GlobalStore.set('battleHasZhang', ally.some(u => u.isZhang));
        const res = runWholeBattle(ally, teams.enemyTeam, battleSeed, true);
        if (!res.winner) continue;
        const enemyHasPang = (res.enemy || []).some(u => u.isPangYuanQiao);
        const enemyHasSong = (res.enemy || []).some(u => u.isSongQingshu);
        const a = enemyHasPang ? variants['胖远桥'] : (enemyHasSong ? variants['宋青书'] : variants['标准']);
        a.runs++;
        if (res.winner === '明教') a.wins++;
        const me = (res.ally || []).find(u => u.isZhang || u.isWei || u.isXiaoZhaoSister || u.isXiaoZhaoBrother || u.isXieXun || u.isHanLiSa);
        if (me) { if (me.alive) a.sumSurv++; a.sumDmg += me.dmgDealt || 0; a.sumTaken += me.dmgTaken || 0; }
    }
    // 只回传有数据的桶，空桶不占消息体积
    const out = {};
    for (const [v, a] of Object.entries(variants)) {
        if (a.runs > 0) out[v] = a;
    }
    return { elite, variants: out };
}

// 112「🛡 无精英基线」：明教侧一个精英都不出的胜率（精英价值的对照组）。
// 2026-10-22 V1.12.1：modules/29 V7.6.0 起「无 Boss 也必出 1 个强精英」，自然局已不存在无精英阵容，
//   旧的纯拒绝采样会 200 次全空、整表静默 0 场。改用 forceSoloWeakElite 抑制随机精英块（该标志下不补任何精英），
//   再拒绝采样排除 30% 的弱精英混入 → 得到真正「一个精英都没有」的 5 普通兵局。按敌方变体分桶，口径与上两表一致。
function runNoEliteJob(stage, seed, runs, startIndex = 0) {
    const isElite = u => u.isZhang || u.isWei || u.isXiaoZhaoSister || u.isXiaoZhaoBrother || u.isXieXun
        || u.isHanLiSa || u.isYangXiao || u.isYinTianZheng;
    const newAgg = () => ({ runs: 0, wins: 0, sumSurv: 0 });
    const variants = { '胖远桥': newAgg(), '宋青书': newAgg(), '标准': newAgg() };
    for (let i = 0; i < runs; i++) {
        clearBattleGlobals();   // 先清场（含上一场可能残留的 force 标志），保证本场是纯自然局
        GlobalStore.set('forceSoloWeakElite', true);   // clear 会清掉，每场都要在 clear 之后重设
        let teams = null, ally = null, s = 0;
        for (let k = 0; k < 200; k++) {          // 重掷上限 200 防死循环（弱混入 30% 未命中，期望约 1.4 次）
            s = seed + (startIndex + i) * 7919 + k * 104729;    // 重掷步长与主种子错开
            const t = initBattleTeams(stage, new SeededRNG(s));
            const a = t.allyTeam.map(u => u.clone());
            if (!a.some(isElite)) { teams = t; ally = a; break; }
        }
        if (!ally || !ally.length) continue;
        GlobalStore.set('battleHasZhang', false);
        const res = runWholeBattle(ally, teams.enemyTeam, s, true);
        if (!res.winner) continue;
        const enemyHasPang = (res.enemy || []).some(u => u.isPangYuanQiao);
        const enemyHasSong = (res.enemy || []).some(u => u.isSongQingshu);
        const a = enemyHasPang ? variants['胖远桥'] : (enemyHasSong ? variants['宋青书'] : variants['标准']);
        a.runs++;
        if (res.winner === '明教') a.wins++;
        a.sumSurv += (res.ally || []).filter(u => u.alive).length;   // 无精英局没有"主英雄"，改记全队存活人数
    }
    const out = {};
    for (const [v, a] of Object.entries(variants)) {
        if (a.runs > 0) out[v] = a;
    }
    return { variants: out };
}

// 112「🐦 弱精英评测」：单弱精英强制上场 vs 自然配对对照。
//   明教侧弱精英（杨逍/殷天正）：V1.14.0 起改 applyForcedWeakAlly「建队后确定性替身换名」（见下方路C注释）。
//   六大派侧弱精英（何太冲/唐文亮/空见）：forceWeakElite 命中 ENEMY_M 且 M 值对上本关数字空位 → 该空位锁定具名（第3关是固定变体阵容、无 M104 空位，故不生效）。
//   arm:'natural'：不设任何 force，只统计整关明教胜率（自然对照）。
//   配对纪律：同一 (stage,chunk) 下 elite 臂与 natural 臂共用同一 seed 序列（seed+i*7919），战斗 RNG 同源。
//     两侧强制方式都是「只换名、不碰建队流」（六大派 M104 空位锁 / 明教建队后替身换名）= 真配对：
//     除精英本人外阵容逐位全同，Δ 不含站位噪音。
//   归因纪律：只统计"该弱精英真的上场了"的局（明教侧在 res.ally、六大派侧在 res.enemy 找到该单位），未上场不计。
// 2026-10-28 V1.14.0 明教侧弱精英强制臂改「路C：建队后换名」（老板拍板「按 C 先做」）：
//   旧路径（29 forceWeakElite 混入）的病根不在「选替身的抽签」——29 V7.6 的 RNG 纪律本就无条件消耗、
//   两臂对齐——而在换入发生在建队流中段：新单位 init 多耗随机数、前排守卫条件分支只在一臂触发，
//   自然臂 30% 掷失后两臂建队流错位 → 全队站位洗牌全乱，Δ 里混站位噪音（旧 112 注释拿「多场平均掉」
//   当遮羞布，实为可避免的系统噪声）。改法：initBattleTeams 完整跑完（站位/锚点/前排定型）后，把
//   「确定性替身」换成目标精英、站位直接继承——两臂建队消耗逐数一致，唯一差异=精英本人；六大派侧
//   M104 空位锁本就是「只换名」形态，两侧行为从此统一。
//   替身规则：非锚点、非任何弱精英（换成他=Δ 变「精英A vs 精英B」）、非唯一前排（阵容语义不塌），
//   取 pos 最小者——站位每场随机洗，被换身份场间自然轮换、不偏向固定角色。
//   计数配套：目标精英「自然混入已在场」的局强制臂跳过（自然臂 clean[name] 同剔这些局）——同种子
//   同掷点，两臂样本逐场对应，Δ = 精英 vs 被换的普通成员，纯配对。
function applyForcedWeakAlly(ally, elite, rng) {
    if (ally.some(u => u.name === elite)) return false;   // 自然混入已带他：不换人，外层跳过该局
    const isAnchor = u => u.isZhang || u.isWei || u.isXiaoZhaoSister || u.isXiaoZhaoBrother || u.isXieXun || u.isHanLiSa;
    const isWeak = u => Object.values(WEAK_UNIT_FLAG).some(f => u[f]);
    const isFront = u => u.role === ROLE_TYPES.DEFENDER || u.role === ROLE_TYPES.WARRIOR;
    const cands = ally.filter(u => !isAnchor(u) && !isWeak(u)
        && !(isFront(u) && !ally.some(v => v !== u && isFront(v))));
    const victim = cands.slice().sort((a, b) => a.pos - b.pos)[0];
    if (!victim) return false;
    const m = CONFIG.MING_M[elite];
    if (m == null) return false;
    // 职业解析与 29 明教混入块同口径：content role 字段 > tags 命中 CONFIG.ROLES
    const ch = getGameData()?.characters?.[elite];
    const role = ch?.role || (ch?.tags || []).find(t => CONFIG.ROLES.includes(t));
    if (!role) return false;                              // 缺职业解析：当作精英未上场（与 !me continue 同口径）
    const unit = new Unit(elite, m, role, CAMP_TYPES.ALLY);
    unit.pos = victim.pos;                                // 继承替身站位：换人发生在洗牌之后，两臂站位全同
    unit.init(rng); unit.applyBonus();                    // initRng 此后无人再用（战斗用独立种子），多耗无影响
    ally[ally.indexOf(victim)] = unit;
    return true;
}

function runWeakEliteJob(stage, seed, runs, elite, side, arm, startIndex = 0) {
    // 2026-10-22 V1.12.3：单位标记统一由 127 的 WEAK_UNIT_FLAG 提供（名字本身唯一，不分 side）
    const flag = WEAK_UNIT_FLAG[elite];
    const newAgg = () => ({ runs: 0, wins: 0, sumSurv: 0, sumDmg: 0, sumTaken: 0, clean: {} });
    const variants = { '胖远桥': newAgg(), '宋青书': newAgg(), '标准': newAgg() };
    for (let i = 0; i < runs; i++) {
        clearBattleGlobals();   // 先清场（含上一场残留的 forceWeakElite），再按 arm 重设
        // V1.14.0 路C：明教侧不再设 forceWeakElite（换人挪到建队后，见 applyForcedWeakAlly）；
        //   六大派侧照旧走 29 的 M104 空位具名锁定（本就是「只换名」形态，流不动）
        if (arm !== 'natural' && side !== 'ally') GlobalStore.set('forceWeakElite', elite);
        const initRng = new SeededRNG(seed + (startIndex + i) * 7919);
        const teams = initBattleTeams(stage, initRng);
        const ally = teams.allyTeam.map(u => u.clone());
        if (!ally.length) continue;
        let swappedIn = false;
        if (arm !== 'natural' && side === 'ally') swappedIn = applyForcedWeakAlly(ally, elite, initRng);
        GlobalStore.set('battleHasZhang', ally.some(u => u.isZhang));
        const res = runWholeBattle(ally, teams.enemyTeam, seed + (startIndex + i) * 7919, true);
        if (!res.winner) continue;
        const enemyHasPang = (res.enemy || []).some(u => u.isPangYuanQiao);
        const enemyHasSong = (res.enemy || []).some(u => u.isSongQingshu);
        const a = enemyHasPang ? variants['胖远桥'] : (enemyHasSong ? variants['宋青书'] : variants['标准']);
        if (arm === 'natural') {              // 自然对照臂：整关明教胜率，不认具体精英
            // V1.13.1 干净对照：只剔除「本局自然出现了某个弱精英」的局，按名字各留一套计数（clean[name]）——
            //   该精英在对照臂自然登场时，两臂都带同一机制、Δ 被稀释（第4关空见自然出现 18%，曾把 Δ 从 -5 拉成 +0.5）。
            //   其他弱精英（何太冲/唐文亮等）必须保持自然分布：一起剔会把对照变成「敌方零弱精英」，
            //   比空见臂（恰一个弱精英）凭空强 15pp，Δ 被放大到 -19pp 的假值。
            a.runs++;
            if (res.winner === '明教') a.wins++;
            const allyU = res.ally || [], enemyU = res.enemy || [];
            for (const [name, f] of Object.entries(WEAK_UNIT_FLAG)) {
                if (allyU.some(u => u[f]) || enemyU.some(u => u[f])) continue;
                const c = a.clean[name] || (a.clean[name] = { runs: 0, wins: 0 });
                c.runs++;
                if (res.winner === '明教') c.wins++;
            }
            continue;
        }
        const me = (side === 'ally' ? (res.ally || []) : (res.enemy || []))
            .find(u => flag ? u[flag] : u.name === elite);
        if (!me) continue;                    // 该弱精英本局没上场（第3关无 M104 空位等）→ 不计入
        // V1.14.0 路C配套：明教侧只计「换人成功」的局——目标精英自然混入已在场的局（swappedIn=false 且 me 命中）
        // 自然臂 clean[name] 同样剔掉，两臂样本逐场对应；换人未成（无合格替身/缺职业）也走这里（me 不命中已拦）
        if (side === 'ally' && !swappedIn) continue;
        a.runs++;
        if (res.winner === '明教') a.wins++;
        if (me.alive) a.sumSurv++;
        a.sumDmg += me.dmgDealt || 0;
        a.sumTaken += me.dmgTaken || 0;
    }
    const out = {};
    for (const [v, a] of Object.entries(variants)) {
        if (a.runs > 0) out[v] = a;
    }
    return { elite: arm === 'natural' ? null : elite, side, arm, variants: out };
}

// 138 弱精英机制贡献：与 runWeakEliteJob 同款配对臂/归因纪律（同种子、同剔「自然已在场」），
//   差异只在观测：精英臂用 onStep 逐条扫日志，聚合——
//     skills      该精英作为施法者发出的 SKILL_ANNOUNCE，按 skillName 计数（技能真触发次数）
//     factsSelf   fact 里 unitName === 该精英的条目，按 factType 计数（如 TW_DASH_APPLY / HEAL）
//     factsTarget fact 里 target.name === 该精英的条目（被打/被免疫/被治疗……）
//     probes      在 note/reason/skillName/label 文本中命中 job 传入关键字的次数
//   只读观测、不参与结算；自然臂不扫日志（保持对照臂开销与 weakElite 一致）。
function runWeakContribJob(stage, seed, runs, elite, side, arm, probes, startIndex = 0) {
    const flag = WEAK_UNIT_FLAG[elite];
    const newAgg = () => ({
        runs: 0, wins: 0, sumSurv: 0, sumDmg: 0, sumTaken: 0, sumHeal: 0,
        skills: {}, factsSelf: {}, factsTarget: {}, probes: {}
    });
    const variants = { '胖远桥': newAgg(), '宋青书': newAgg(), '标准': newAgg() };
    const bump = (obj, key) => { if (key) obj[key] = (obj[key] || 0) + 1; };
    const merge = (dst, src) => { for (const [k, v] of Object.entries(src)) dst[k] = (dst[k] || 0) + v; };
    const probeList = Array.isArray(probes) ? probes.filter(Boolean) : [];
    for (let i = 0; i < runs; i++) {
        clearBattleGlobals();
        if (arm !== 'natural' && side !== 'ally') GlobalStore.set('forceWeakElite', elite);
        const battleSeed = seed + (startIndex + i) * 7919;
        const initRng = new SeededRNG(battleSeed);
        const teams = initBattleTeams(stage, initRng);
        const ally = teams.allyTeam.map(u => u.clone());
        if (!ally.length) continue;
        let swappedIn = false;
        if (arm !== 'natural' && side === 'ally') swappedIn = applyForcedWeakAlly(ally, elite, initRng);
        GlobalStore.set('battleHasZhang', ally.some(u => u.isZhang));
        const tally = { skills: {}, factsSelf: {}, factsTarget: {}, probes: {} };
        const onStep = arm === 'natural' ? null : (step) => {
            const log = step && step.log;
            if (!Array.isArray(log)) return;
            for (const e of log) {
                if (!e || !e.factType) continue;
                const d = e.data || {};
                const isSelf = d.unitName === elite || (d.unit && d.unit.name === elite) || (d.attacker && d.attacker.name === elite);
                const isTarget = (d.target && d.target.name === elite) || (d.targetName === elite);
                if (isSelf) bump(tally.factsSelf, e.factType);
                if (isTarget) bump(tally.factsTarget, e.factType);
                if (e.factType === FACT_TYPES.SKILL_ANNOUNCE && d.unitName === elite) bump(tally.skills, d.skillName);
                if (probeList.length) {
                    const text = `${d.note || ''}|${d.reason || ''}|${d.skillName || ''}|${d.label || ''}`;
                    for (const p of probeList) if (text.includes(p)) bump(tally.probes, p);
                }
            }
        };
        const res = runWholeBattle(ally, teams.enemyTeam, battleSeed, true, onStep ? { onStep } : null);
        if (!res.winner) continue;
        const enemyHasPang = (res.enemy || []).some(u => u.isPangYuanQiao);
        const enemyHasSong = (res.enemy || []).some(u => u.isSongQingshu);
        const a = enemyHasPang ? variants['胖远桥'] : (enemyHasSong ? variants['宋青书'] : variants['标准']);
        if (arm === 'natural') {
            // 干净对照（与 runWeakEliteJob / 112 V3.0.3 同口径）：只剔「目标精英本人自然登场」的局，
            //   其他弱精英保持自然分布（一起剔 = 对照凭空变强，Δ 被放大成假值）
            const allyU = res.ally || [], enemyU = res.enemy || [];
            const seen = flag
                ? (allyU.some(u => u[flag]) || enemyU.some(u => u[flag]))
                : (allyU.some(u => u.name === elite) || enemyU.some(u => u.name === elite));
            if (seen) continue;
            a.runs++;
            if (res.winner === '明教') a.wins++;
            continue;
        }
        const me = (side === 'ally' ? (res.ally || []) : (res.enemy || []))
            .find(u => flag ? u[flag] : u.name === elite);
        if (!me) continue;
        if (side === 'ally' && !swappedIn) continue;
        a.runs++;
        if (res.winner === '明教') a.wins++;
        if (me.alive) a.sumSurv++;
        a.sumDmg += me.dmgDealt || 0;
        a.sumTaken += me.dmgTaken || 0;
        a.sumHeal += me.healDone || 0;
        merge(a.skills, tally.skills);
        merge(a.factsSelf, tally.factsSelf);
        merge(a.factsTarget, tally.factsTarget);
        merge(a.probes, tally.probes);
    }
    const out = {};
    for (const [v, a] of Object.entries(variants)) {
        if (a.runs > 0) out[v] = a;
    }
    return { elite: arm === 'natural' ? null : elite, side, arm, variants: out };
}

function runEliteStageJob(stage, seed, runs, startIndex = 0) {
    // 2026-09-24 定稿：胖远桥/宋青书是"行"不是"列"——第3关阵容在两人间轮换，
    // 按"本局敌方是谁"把整局分进对应变体桶（胖远桥/宋青书/标准），112 端每个桶渲染一行。
    // 列仍是明教六名精英：谁在场记给谁，胜 = 明教获胜（同场共现是真实环境，不是污染）。
    const newAgg = () => {
        const a = {};
        for (const n of NATURAL_ELITES) {
            a[n] = { runs: 0, wins: 0, sumDmg: 0, sumTaken: 0, sumSurv: 0 };
        }
        return a;
    };
    const variants = { '胖远桥': newAgg(), '宋青书': newAgg(), '标准': newAgg() };
    for (let i = 0; i < runs; i++) {
        clearBattleGlobals(); // 每场清理防 OOM（同时清掉 force 标志，保证本场是纯普通局）
        const initRng = new SeededRNG(seed + (startIndex + i) * 7919);
        const teams = initBattleTeams(stage, initRng);
        const ally = teams.allyTeam.map(u => u.clone());
        if (!ally.length) continue;
        GlobalStore.set('battleHasZhang', ally.some(u => u.isZhang));
        const res = runWholeBattle(ally, teams.enemyTeam, seed + (startIndex + i) * 7919, true); // 带海克斯，对齐正式游戏节奏
        if (!res.winner) continue;
        const enemyHasPang = (res.enemy || []).some(u => u.isPangYuanQiao);
        const enemyHasSong = (res.enemy || []).some(u => u.isSongQingshu);
        const agg = enemyHasPang ? variants['胖远桥'] : (enemyHasSong ? variants['宋青书'] : variants['标准']);
        for (const u of (res.ally || [])) {
            let name = null;
            if (u.isZhang) name = '张无忌';
            else if (u.isWei) name = '韦一笑';
            else if (u.isXiaoZhaoSister) name = '小昭·姊';
            else if (u.isXiaoZhaoBrother) name = '小昭·妹';
            else if (u.isXieXun) name = '金毛狮王谢逊';
            else if (u.isHanLiSa) name = '寒离飒';
            if (!name) continue;
            const a = agg[name];
            a.runs++;
            if (res.winner === '明教') a.wins++;
            a.sumDmg += u.dmgDealt || 0;
            a.sumTaken += u.dmgTaken || 0;
            if (u.alive) a.sumSurv++;
        }
    }
    // 只回传有数据的桶，空桶不占消息体积
    const out = {};
    for (const [v, a] of Object.entries(variants)) {
        if (Object.values(a).some(d => d.runs > 0)) out[v] = a;
    }
    return out;
}

// 108 海克斯仪表盘 / 101 自动批量战斗：整局自动战斗（含第3/6/9回合自动补海克斯）。
// 口径对齐正式游戏：支持海克斯偏好 preferredBuffs；所选 Buff 由小昭·妹永久继承（addPermanentBuff）。
// 搬进 worker 是因为主线程一口气跑几百场会把页面占死（移动端弹「网页暂无响应」）。
// seed 公式与 101 主线程版一致（Date.now() + i*7919），差异只在于是否并行，统计口径不受影响。
function runHexStageJob(stage, baseSeed, runs, preferredBuffs = [], startIndex = 0, lineupMode = 'normal') {
    const hexLog = []; // [{ stage, buffs: [key], winner }]
    const wins = { ally: 0, enemy: 0, draw: 0 };
    const C = CONFIG;
    for (let i = 0; i < runs; i++) {
        clearBattleGlobals();
        // 2026-10-14 V1.9.0 阵容模式（108 仪表盘选择器透传）统一走「拒绝采样重掷自然阵容」，一律不设 forceXiaoZhao：
        //   force 会触发 modules/29 V7.5.16 的轮盘互锁——队里只剩小昭这一个精英（张/韦/谢逊/杨逍全不出现），
        //   且 20% 本该无精英的局也会被强塞一个小昭；得到的是「单小昭局」，与「其他精英照常轮盘」的自然局不可横向比。
        //   四个模式要能放在同一张表里比，必须同一把尺子，所以这里只筛选、不强制：
        //   none = 阵容里无小昭；sister = 阵容里含小昭·姊；brother = 阵容里含小昭·妹；normal = 自然（不筛选）。
        const seed = baseSeed + (startIndex + i) * 7919;
        // startIndex = 该片在整关序列里的起点，保证「细粒度分片」与「整关一片」产生完全相同的 seed 序列
        let teams;
        if (lineupMode === 'normal') {
            teams = initBattleTeams(stage, new SeededRNG(seed));
        } else {
            teams = null;
            for (let k = 0; k < 200; k++) {              // 重掷上限 200 防死循环（小昭在场约 31%、形态对半，期望 3～8 次即中）
                const t = initBattleTeams(stage, new SeededRNG(seed + k * 104729));   // 重掷步长与主种子错开
                const xz = t.allyTeam.find(u => u.isXiaoZhaoSister || u.isXiaoZhaoBrother);
                const hit = lineupMode === 'none' ? !xz
                    : lineupMode === 'sister' ? !!(xz && xz.isXiaoZhaoSister)
                    : !!(xz && xz.isXiaoZhaoBrother);
                if (hit) { teams = t; break; }
            }
            if (!teams) continue;
        }
        const buffsPicked = [];
        let liveEnemy = null;   // V1.16.0：本场实时敌方快照（onStep 维护），供惑人心智门槛
        // 海克斯抽取回调：与 runBalanceJob 同口径（角色需求过滤 + 圣火令抽行列），
        // 这里额外支持偏好优先与「小昭·妹永久继承」，并把本局所选取进 buffsPicked。
        const hexPicker = (activeBuffs, allySide, rng) => {
            // 2026-10-22 V1.12.4：候选池过滤统一由 modules/28 filterAvailableBuffs 提供；
            //   hex job 不开 withFortifyRule（与原行为一致）。
            // V1.16.0：实时敌方透传（惑人心智门槛）
            const available = filterAvailableBuffs(activeBuffs, allySide,
                { enemyTeam: (liveEnemy || teams.enemyTeam).filter(u => u && u.alive) });
            if (available.length === 0) return null;
            // 偏好海克斯出现时优先选（与 101 主线程版一致；无偏好则全池随机）
            const preferred = available.filter(k => preferredBuffs.includes(k));
            const pool = preferred.length > 0 ? preferred : available;
            const pick = pool[rng.nextInt(0, pool.length - 1)];
            const duration = C.BUFFS[pick].duration || C.BUFF_DURATION || 4;
            // 2026-10-14 口径收口：原在此手工造 buff——圣火令只抽 1列1行（正式 modules/28 抽 2列2行）、
            //   permanent 整局映射不生效（圣火不熄被当 4 回合 buff 测），两者胜率系统性低估。
            //   现直接调 createBuffObject，抽签数值与时长口径永远跟随正式服（pickHexBuff 同先例）。
            const nb = createBuffObject(pick, duration);
            // 对齐正式游戏：选完即由小昭·妹永久继承。
            // 必须从 allySide（战斗内的活体单位）取，不能取 teams.allyTeam——
            // runBattle 内部会 clone 一份上场，写到克隆体外等于没生效。
            const brother = allySide.find(u => u.isXiaoZhaoBrother);
            if (brother) {
                const extra = pick === BUFF_TYPES.HOLY_FLAME ? { cols: nb.cols, rows: nb.rows } : {};
                addPermanentBuff(brother, pick, nb.name, extra);
            }
            buffsPicked.push(nb);
            return nb;
        };
        const res = runBattle({
            ally: teams.allyTeam,
            enemy: teams.enemyTeam,
            seed,
            hexPicker,
            // V1.16.0：捕获实时敌方（每场独立重置），供惑人心智门槛
            onStep: (step) => { if (step && Array.isArray(step.enemy)) liveEnemy = step.enemy; }
        });
        const w = res.winner || '平局';
        hexLog.push({ stage, buffs: buffsPicked.map(b => b.key), winner: w });
        if (w === '明教') wins.ally++;
        else if (w === '六大派') wins.enemy++;
        else wins.draw++;
    }
    return { hexLog, ally: wins.ally, enemy: wins.enemy, draw: wins.draw };
}

// 110 职业平衡（全随机站位）：随机组队 + 整局战斗全在 worker 内（原先唯一的主线程串行工具）。
// 口径逐场不变：seed = baseSeed + (startIndex + i)*7919，敌队用 seed+1 组队；无海克斯、固定六大派先手、maxRounds 35。
// 分片只影响「哪台机器跑哪几场」，不改变任何一场的 seed，与整段串行跑出的统计同值。
const RANDOM_ROLES = [ROLE_TYPES.DEFENDER, ROLE_TYPES.WARRIOR, ROLE_TYPES.FLYER, ROLE_TYPES.RANGED];

function buildRandomTeam(size, camp, rng, force) {
    const team = [];
    const positions = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (let i = positions.length - 1; i > 0; i--) {
        const j = rng.nextInt(0, i);
        [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    for (let i = 0; i < size; i++) {
        // force（成对置换对照用）：第 force.slot 个单位强制为 force.role。
        // 骰子照掷不省——rng 消耗流与基线完全一致，保证对照队与基线队除该槽职业外逐位同构。
        const rolled = RANDOM_ROLES[rng.nextInt(0, 3)];
        const role = (force && i === force.slot) ? force.role : rolled;
        const u = createUnit(role, camp, rng);
        u.pos = positions[i];
        u._originalPos = positions[i];
        team.push(u);
    }
    return team;
}

function runRandomJob(size, baseSeed, startIndex, runs) {
    const stats = { allyCounts: {}, enemyCounts: {} };
    for (const role of RANDOM_ROLES) { stats.allyCounts[role] = {}; stats.enemyCounts[role] = {}; }
    const countRoles = (team) => { const c = {}; for (const u of team) c[u.role] = (c[u.role] || 0) + 1; return c; };
    const record = (bucket, count, isAllyWin) => {
        const b = bucket[count] || (bucket[count] = { total: 0, wins: 0 });
        b.total++;
        if (isAllyWin) b.wins++;
    };
    for (let i = 0; i < runs; i++) {
        clearBattleGlobals(); // 每场清理防 OOM（对胜负无影响）
        const seed = baseSeed + (startIndex + i) * 7919;
        const allyTeam = buildRandomTeam(size, CAMP_TYPES.ALLY, new SeededRNG(seed));
        const enemyTeam = buildRandomTeam(size, CAMP_TYPES.ENEMY, new SeededRNG(seed + 1));
        const res = runBattle({
            ally: allyTeam,
            enemy: enemyTeam,
            seed,
            maxRounds: 35,
            firstSide: CAMP_TYPES.ENEMY
        });
        const isAllyWin = (res.winner || '平局') === '明教';
        const ac = countRoles(allyTeam);
        const ec = countRoles(enemyTeam);
        for (const role of RANDOM_ROLES) {
            record(stats.allyCounts[role], ac[role] || 0, isAllyWin);
            record(stats.enemyCounts[role], ec[role] || 0, isAllyWin);
        }
    }
    return stats;
}

// 110 成对置换对照（V1.4.0）：每对 = 基线局 + 对照局，同一随机构成仅把 ally 第 slot 槽职业强制为 role，
//   role/slot 按 i 轮转。配对差 diff = 对照胜(0/1) − 基线胜(0/1)，按 role 累积 n/Σ/Σ²，
//   主线程据 Δ=Σ/n、SE=√((Σ²−n·Δ²)/(n−1))/√n 出 95% CI——单职业因果净效应，噪声远小于独立采样。
//   对照局敌队按同 seed+1 重建（不复用对象），站位/其余职业随机流与基线逐位一致。
function runPairedJob(size, baseSeed, startIndex, runs) {
    const buckets = {};
    for (const role of RANDOM_ROLES) buckets[role] = { n: 0, sum: 0, sumSq: 0, baseWins: 0, pairWins: 0 };
    for (let i = 0; i < runs; i++) {
        const seed = baseSeed + (startIndex + i) * 7919;
        const role = RANDOM_ROLES[i % RANDOM_ROLES.length];
        const slot = i % size;
        clearBattleGlobals();
        const allyBase = buildRandomTeam(size, CAMP_TYPES.ALLY, new SeededRNG(seed));
        const enemyBase = buildRandomTeam(size, CAMP_TYPES.ENEMY, new SeededRNG(seed + 1));
        const resBase = runBattle({ ally: allyBase, enemy: enemyBase, seed, maxRounds: 35, firstSide: CAMP_TYPES.ENEMY });
        const baseWin = (resBase.winner || '平局') === '明教' ? 1 : 0;
        clearBattleGlobals();
        const allyPair = buildRandomTeam(size, CAMP_TYPES.ALLY, new SeededRNG(seed), { slot, role });
        const enemyPair = buildRandomTeam(size, CAMP_TYPES.ENEMY, new SeededRNG(seed + 1));
        const resPair = runBattle({ ally: allyPair, enemy: enemyPair, seed, maxRounds: 35, firstSide: CAMP_TYPES.ENEMY });
        const pairWin = (resPair.winner || '平局') === '明教' ? 1 : 0;
        const b = buckets[role];
        const diff = pairWin - baseWin;
        b.n++; b.sum += diff; b.sumSq += diff * diff; b.baseWins += baseWin; b.pairWins += pairWin;
    }
    return buckets;
}

// 113 统计体检
// 原主线程逻辑：initBattleTeams → hp-tracker 订阅 → runWholeBattle → record 进 agg（主线程聚合）
function runStatsStageJob(stage, seed, runs) {
    const agg = {}; // worker 内自聚合，返回给主线程直接并入全局 agg
    for (let i = 0; i < runs; i++) {
        clearBattleGlobals();
        // 订阅 hp-change 事件流：以 maxHp 是否变化区分「战斗扣血」与「重分配扣血」
        const tracker = {};
        const off = onBattleEvents(events => {
            for (const ev of events) {
                if (ev.eventType !== UNIT_EVENT_TYPES.HP_CHANGE) continue;
                const uid = ev.unitUid;
                const p = ev.payload || {};
                if (p.hp === undefined || p.maxHp === undefined) continue;
                const st = tracker[uid] || (tracker[uid] = { hp: p.hp, maxHp: p.maxHp, battleDmg: 0, battleHeal: 0, reallocDmg: 0, reallocHeal: 0 });
                const dHp = p.hp - st.hp;
                if (dHp !== 0) {
                    const maxHpChanged = p.maxHp !== st.maxHp;
                    if (dHp < 0) {
                        if (maxHpChanged) st.reallocDmg += -dHp; else st.battleDmg += -dHp;
                    } else {
                        if (maxHpChanged) st.reallocHeal += dHp; else st.battleHeal += dHp;
                    }
                }
                st.hp = p.hp;
                st.maxHp = p.maxHp;
            }
        });

        const initRng = new SeededRNG(seed + i * 7919);
        const { allyTeam, enemyTeam } = initBattleTeams(stage, initRng);
        const ally = allyTeam.map(u => u.clone());
        GlobalStore.set('battleHasZhang', ally.some(u => u.isZhang));

        const res = runWholeBattle(ally, enemyTeam, seed + i * 7919);
        off();
        if (res.winner) {
            for (const u of (res.ally || [])) record(agg, u, tracker[u.uid]);
            for (const u of (res.enemy || [])) record(agg, u, tracker[u.uid]);
        }
    }
    return agg;
}

function record(agg, u, t) {
    if (!u) return;
    const camp = u.camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
    const key = `${camp}·${u.name}`;
    const d = agg[key] || (agg[key] = { battles: 0, dmgTaken: 0, battleDmg: 0, reallocDmg: 0, healDone: 0, battleHeal: 0, reallocHeal: 0, dmgDealt: 0 });
    d.battles++;
    d.dmgTaken += u.dmgTaken || 0;
    d.healDone += u.healDone || 0;
    d.dmgDealt += u.dmgDealt || 0;
    if (t) {
        d.battleDmg += t.battleDmg || 0;
        d.reallocDmg += t.reallocDmg || 0;
        d.battleHeal += t.battleHeal || 0;
        d.reallocHeal += t.reallocHeal || 0;
    }
}

// 114 基线对比
// 原主线程逻辑：同一阵容克隆两份套 A/B 配置（applyConfig），各跑一场对比
const ALL_ELITE_FLAGS = Object.values(ELITE_UNIT_META).map(m => m.flag);
const ALL_WEAK_FLAGS = Object.values(WEAK_UNIT_FLAG);

function applyConfig(team, cfg, seed) {
    let eu = team.find(u => u[cfg.flag]);
    if (!eu) {
        const candidates = team.filter(u =>
            !ALL_ELITE_FLAGS.some(f => u[f]) && !ALL_WEAK_FLAGS.some(f => u[f])
        );
        if (!candidates.length) return null;
        eu = candidates.find(u => u.pos === cfg.stdPos) || candidates[0];
    }
    eu.name = cfg.name;
    eu.role = cfg.role;
    eu.m = cfg.m;
    for (const f of ALL_ELITE_FLAGS) eu[f] = false;
    eu[cfg.flag] = true;
    if (cfg.flag === 'isXiaoZhaoSister' || cfg.flag === 'isXiaoZhaoBrother') {
        eu.initXiaoZhao();
    } else {
        eu.init(new SeededRNG(seed));
    }
    eu.applyBonus();
    eu._baseMaxHp = eu.maxHp;
    eu._baseAtk = eu.atk;
    eu._baseDef = eu.def;
    eu.pos = cfg.stdPos;
    return eu;
}

function runBaselineStageJob(stage, seed, runs, cfgA, cfgB) {
    let vA = 0, wA = 0, dA = 0, tkA = 0, sA = 0;
    let vB = 0, wB = 0, dB = 0, tkB = 0, sB = 0;
    for (let i = 0; i < runs; i++) {
        clearBattleGlobals(); // 与原主线程一致，每场清理防 OOM
        const seedBase = seed + i * 7919;
        const initRng = new SeededRNG(seedBase);
        const { allyTeam, enemyTeam } = initBattleTeams(stage, initRng);
        // 2026-10-22 V1.13.0：A/B 两支都先从同一底阵容里剔掉两个目标精英再各自套配置——
        // 否则守方若已随机出目标，会出现「目标精英 + 另一个自己」，A/B 差也混进阵容随机差
        const baseTeam = allyTeam.filter(u => !u[cfgA.flag] && !u[cfgB.flag]);
        const teamA = baseTeam.map(u => u.clone());
        const teamB = baseTeam.map(u => u.clone());
        const euA = applyConfig(teamA, cfgA, seedBase + 31);
        const euB = applyConfig(teamB, cfgB, seedBase + 31);
        if (!euA || !euB) continue;
        GlobalStore.set('battleHasZhang', teamA.some(u => u.isZhang));
        const resA = runWholeBattle(teamA, enemyTeam, seedBase);
        GlobalStore.set('battleHasZhang', teamB.some(u => u.isZhang));
        const resB = runWholeBattle(teamB, enemyTeam, seedBase);
        if (resA.winner) {
            vA++; if (resA.winner === '明教') wA++;
            const e = (resA.ally || []).find(u => u[cfgA.flag]);
            if (e) { dA += e.dmgDealt || 0; tkA += e.dmgTaken || 0; if (e.alive) sA++; }
        }
        if (resB.winner) {
            vB++; if (resB.winner === '明教') wB++;
            const e = (resB.ally || []).find(u => u[cfgB.flag]);
            if (e) { dB += e.dmgDealt || 0; tkB += e.dmgTaken || 0; if (e.alive) sB++; }
        }
    }
    return { vA, wA, dA, tkA, sA, vB, wB, dB, tkB, sB };
}

// 入口
// 模块顶层一次性加载游戏数据（幂等，worker 独立全局需自备）
try {
    await loadGameData();
    self.postMessage({ kind: 'worker-ready', ok: true });
} catch (err) {
    self.postMessage({ kind: 'worker-ready', ok: false, error: String(err && err.message || err) });
}

self.onmessage = (e) => {
    const { jobId, kind } = e.data;
    eventBus.resetErrorTracker(); // 每 job 独立统计 hook 运行时错误（无 DOM 环境唯一可见通道）
    try {
        let result;
        if (kind === 'balance') {
            const { ai, ei, allyRole, enemyRole, rounds, positions, hexEnabled, masterSeed } = e.data;
            let wins = 0;
            for (let i = 0; i < rounds; i++) {
                const seed = masterSeed + ai * 100000 + ei * 10000 + i * 7919;
                const rng = new SeededRNG(seed);
                const allyTeam = buildTeam(allyRole, CAMP_TYPES.ALLY, positions, rng);
                const enemyTeam = buildTeam(enemyRole, CAMP_TYPES.ENEMY, positions, rng);
                const r = runBalanceJob(allyTeam, enemyTeam, seed, hexEnabled);
                flushBattleEvents();
                // 状态已并入 unit.state，随对局对象 GC，无需清理（18-elite-state 已废弃）
                if (r.winner === '明教') wins++;
            }
            result = { wins };
        } else if (kind === 'elite') {
            const { stage, seed, runs, startIndex } = e.data;
            result = runEliteStageJob(stage, seed, runs, startIndex || 0);
        } else if (kind === 'soloElite') {
            const { stage, seed, runs, elite, startIndex } = e.data;
            result = runSoloEliteJob(stage, seed, runs, elite, startIndex || 0);
        } else if (kind === 'noElite') {
            const { stage, seed, runs, startIndex } = e.data;
            result = runNoEliteJob(stage, seed, runs, startIndex || 0);
        } else if (kind === 'weakElite') {
            const { stage, seed, runs, elite, side, arm, startIndex } = e.data;
            result = runWeakEliteJob(stage, seed, runs, elite, side, arm, startIndex || 0);
        } else if (kind === 'weakContrib') {
            const { stage, seed, runs, elite, side, arm, probes, startIndex } = e.data;
            result = runWeakContribJob(stage, seed, runs, elite, side, arm, probes, startIndex || 0);
        } else if (kind === 'stats') {
            const { stage, seed, runs } = e.data;
            result = runStatsStageJob(stage, seed, runs);
        } else if (kind === 'hex') {
            const { stage, seed, runs, preferredBuffs, startIndex, lineupMode } = e.data;
            result = runHexStageJob(stage, seed, runs, preferredBuffs, startIndex || 0, lineupMode || 'normal');
        } else if (kind === 'random') {
            const { size, seed, startIndex, runs } = e.data;
            result = runRandomJob(size, seed, startIndex || 0, runs);
        } else if (kind === 'paired') {
            const { size, seed, startIndex, runs } = e.data;
            result = runPairedJob(size, seed, startIndex || 0, runs);
        } else if (kind === 'baseline') {
            const { stage, seed, runs, cfgA, cfgB } = e.data;
            result = runBaselineStageJob(stage, seed, runs, cfgA, cfgB);
        } else {
            throw new Error(`未知 worker kind: ${kind}`);
        }
        const hookErrors = eventBus.getErrorCount();
        self.postMessage({
            jobId, ok: true, result,
            hookErrors,
            hookErrorSamples: hookErrors ? eventBus.getRecentErrors().slice(-5) : []
        });
    } catch (err) {
        self.postMessage({ jobId, ok: false, error: String(err && err.stack || err) });
    }
};