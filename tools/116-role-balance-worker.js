// V1.7.1 | ~33300 bytes | 2026-10-09 clearBattleGlobals 补清 forceXieXun / forcePang（原先漏清，对照 122 的完整五项）：
//        跑完谢逊单英雄后 forceXieXun 常驻 worker，之后任何 job 都变「本 job 精英 + 谢逊」双精英（复刻取证 修复前 40/40 → 修复后 0/40）
// V1.7.0 | ~32900 bytes | 2026-10-09 新增 kind:'noElite'（runNoEliteJob）：明教侧一个精英都不出的胜率（拒绝采样凑无精英局，
//        自然局约 20% 无精英）——112「🛡 无精英基线」按钮的消费端，不动主代码 modules/29
// V1.6.1 | ~30300 bytes | 2026-10-08 soloElite 回报按敌方变体分桶（胖远桥/宋青书/标准，判定同 runEliteStageJob）：
//        回传 { elite, variants:{...} }——112 单英雄表第3关拆「·胖远桥」「·宋青书」两行
// V1.6.0 | 2026-10-08 新增 kind:'soloElite'（runSoloEliteJob）：force 单精英跑批（依赖 modules/29 V7.5.16 四路 force 轮盘互锁），胜率/存活/输出/承伤，口径与普通评测同款——112「⚔ 单英雄胜率」按钮的消费端
// V1.5.0 | ~27100 bytes | 2026-10-06 carry 候选过滤（pickHexBuff / hexPicker）：import modules/28buff-tools.hasCarryTarget，
//        无 carry 位（5 号；小昭·姊在场放宽 4/5/6）则不进候选，与 101 主线程版逐字同口径
// V1.4.0 | 2026-10-02 新增 kind:'paired'（110 成对置换对照）：buildRandomTeam 加 force 参数（骰子照掷保持 rng 消耗流逐位一致），
//        runPairedJob 每对跑基线局+对照局（仅 ally 单槽职业强制替换），按 role 累积配对差供主线程算 95% CI
// V1.3.3 | 2026-10-02 机制装配收口：25/26/27/30 散装 import 收敛为 modules/00reg-mechanics.js 单入口
// V1.3.2 | 2026-10-02 每个 job 起止读 infra/50 的 DOM 无关 hook 错误计数：worker 无 DOM，
//        modules/21 错误面板链路在跑批里整段断掉；job 回报新增 hookErrors/hookErrorSamples，
//        监听器运行时抛错不再只进 console.error 被静默吞掉。
// V1.3.1 | 2026-10-02 补 import modules/30custom-effects：dotTick/damageReflect 靠模块顶层副作用注册进 core/18，
//        worker 链此前只装 25/26/27，core/15 安装期校验新增后第5关（鹿杖客 dotTick）开局即抛错
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
import { CONFIG, loadGameData } from '../core/01config-5v5-test.js';
import { Unit } from '../core/02unit.js';
import { SeededRNG, flushBattleEvents, onBattleEvents } from '../infra/51-core-utils.js';
import { runBattle } from '../core/06battle-runner.js';
import { setBattleRng } from '../core/13battle-shared.js';
import { createBuffObject, hasCarryTarget } from '../modules/28buff-tools.js';
import { addPermanentBuff } from '../modules/20elite-skills.js';
import { initBattleTeams } from '../modules/29battle-init.js';
import '../infra/54-global-store.js';
import '../modules/00reg-mechanics.js';   // 机制装配统一入口（25/26/27/30），V1.3.1 的 dotTick 漏装教训收口于此
import { CAMP_TYPES, ROLE_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES } from '../infra/56-battle-enums.js';
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
    GlobalStore.set('currentBattleState', null);
    flushBattleEvents();
    // 状态已并入 unit.state，随对局对象 GC，无需清理（18-elite-state 已废弃）
}

// 共用：跑完整战斗（薄封装，保持调用点签名不变）。
// 循环本体在 core/06battle-runner；原实现里的 allAllies 手工同步与 buff 双递减一并删除
// （createRoundStepper 内部已自行处理，删掉后 18 场基线的 winner/rounds/factCount 逐条不变）。
function runWholeBattle(initAlly, initEnemy, seed, hexEnabled = false) {
    return runBattle({
        ally: initAlly,
        enemy: initEnemy,
        seed,
        hexPicker: hexEnabled ? pickHexBuff : null
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

function pickHexBuff(activeBuffs, allyTeam, rng, withFortifyRule) {
    const existing = activeBuffs.map(b => b.key);
    const allKeys = Object.keys(CONFIG.BUFFS);
    const available = allKeys.filter(k => {
        if (existing.includes(k)) return false;
        if (withFortifyRule && k === BUFF_TYPES.FORTIFY && !activeBuffs.some(b => b.remaining > 0)) return false;
        if (k === BUFF_TYPES.CARRY && !hasCarryTarget(allyTeam)) return false;   // 无 carry 位则无效，不进候选（与 modules/28 同口径）
        const requiredRole = CONFIG.BUFF_ROLE_REQUIREMENTS[k];
        if (requiredRole && !allyTeam.some(u => u.alive && u.role === requiredRole)) return false;
        return true;
    });
    if (available.length === 0) return null;
    const pick = available[rng.nextInt(0, available.length - 1)];
    const duration = CONFIG.BUFFS[pick].duration || CONFIG.BUFF_DURATION || 4;
    return createBuffObject(pick, duration);
}

function runBalanceJob(buildAlly, buildEnemy, seed, hexEnabled) {
    const rng = new SeededRNG(seed);
    setBattleRng(rng);
    // 开局 buff：原实现是"第 0 回合先补一个"（hexEnabled 时）。runner 用 initialBuffs 承接，
    // 保证同 seed 同序列——开局补一个 + 每 3 回合补一个，与原来节奏一致。
    let initialBuffs = [];
    if (hexEnabled) {
        const first = pickHexBuff(initialBuffs, buildAlly, rng, true);
        if (first) initialBuffs.push(first);
    }
    const res = runBattle({
        ally: buildAlly,
        enemy: buildEnemy,
        seed,
        initialBuffs,
        hexPicker: hexEnabled ? pickHexBuff : null,
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
function runSoloEliteJob(stage, seed, runs, elite) {
    const keyMap = { '张无忌': 'forceZhang', '韦一笑': 'forceWei', '金毛狮王谢逊': 'forceXieXun' };
    const isXz = elite === '小昭·姊' || elite === '小昭·妹';
    // 变体桶（V1.6.1）：与 runEliteStageJob 同款判定——按"本局敌方是谁"整局分桶，
    // 第3关轮换阵容拆成胖远桥/宋青书两行；其余关落进「标准」桶
    const newAgg = () => ({ runs: 0, wins: 0, sumSurv: 0, sumDmg: 0, sumTaken: 0 });
    const variants = { '胖远桥': newAgg(), '宋青书': newAgg(), '标准': newAgg() };
    for (let i = 0; i < runs; i++) {
        clearBattleGlobals();   // 注意：clear 会清 force，每场都要在 clear 之后重设
        if (isXz) GlobalStore.set('forceXiaoZhao', elite === '小昭·姊' ? 'sister' : 'brother');
        else GlobalStore.set(keyMap[elite], true);
        const initRng = new SeededRNG(seed + i * 7919);
        const teams = initBattleTeams(stage, initRng);
        const ally = teams.allyTeam.map(u => u.clone());
        if (!ally.length) continue;
        GlobalStore.set('battleHasZhang', ally.some(u => u.isZhang));
        const res = runWholeBattle(ally, teams.enemyTeam, seed + i * 7919, true);
        if (!res.winner) continue;
        const enemyHasPang = (res.enemy || []).some(u => u.isPangYuanQiao);
        const enemyHasSong = (res.enemy || []).some(u => u.isSongQingshu);
        const a = enemyHasPang ? variants['胖远桥'] : (enemyHasSong ? variants['宋青书'] : variants['标准']);
        a.runs++;
        if (res.winner === '明教') a.wins++;
        const me = (res.ally || []).find(u => u.isZhang || u.isWei || u.isXiaoZhaoSister || u.isXiaoZhaoBrother || u.isXieXun);
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
// 自然局约 20% 无精英（ELITE_COUNT_THRESHOLDS [0.05,0.20,0.80] 的末档），
// 故用「拒绝采样」：换种子重掷初始阵容，直到明教侧无精英；平均约 5 次即中（initBattleTeams 只占单场 4% 耗时，代价可忽略）。
// 不动主代码 modules/29（无需新增开关）。按敌方变体分桶，口径与上两表一致。
function runNoEliteJob(stage, seed, runs) {
    const isElite = u => u.isZhang || u.isWei || u.isXiaoZhaoSister || u.isXiaoZhaoBrother || u.isXieXun;
    const newAgg = () => ({ runs: 0, wins: 0, sumSurv: 0 });
    const variants = { '胖远桥': newAgg(), '宋青书': newAgg(), '标准': newAgg() };
    for (let i = 0; i < runs; i++) {
        clearBattleGlobals();   // 先清场（含上一场可能残留的 force 标志），保证本场是纯自然局
        let teams = null, ally = null, s = 0;
        for (let k = 0; k < 200; k++) {          // 重掷上限 200 防死循环（1/0.2 期望 5 次）
            s = seed + i * 7919 + k * 104729;    // 重掷步长与主种子错开
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

function runEliteStageJob(stage, seed, runs) {
    // 2026-09-24 定稿：胖远桥/宋青书是"行"不是"列"——第3关阵容在两人间轮换，
    // 按"本局敌方是谁"把整局分进对应变体桶（胖远桥/宋青书/标准），112 端每个桶渲染一行。
    // 列仍是明教五精英：谁在场记给谁，胜 = 明教获胜（同场共现是真实环境，不是污染）。
    const newAgg = () => {
        const a = {};
        for (const n of ['张无忌', '韦一笑', '小昭·姊', '小昭·妹', '金毛狮王谢逊']) {
            a[n] = { runs: 0, wins: 0, sumDmg: 0, sumTaken: 0, sumSurv: 0 };
        }
        return a;
    };
    const variants = { '胖远桥': newAgg(), '宋青书': newAgg(), '标准': newAgg() };
    for (let i = 0; i < runs; i++) {
        clearBattleGlobals(); // 每场清理防 OOM（同时清掉 force 标志，保证本场是纯普通局）
        const initRng = new SeededRNG(seed + i * 7919);
        const teams = initBattleTeams(stage, initRng);
        const ally = teams.allyTeam.map(u => u.clone());
        if (!ally.length) continue;
        GlobalStore.set('battleHasZhang', ally.some(u => u.isZhang));
        const res = runWholeBattle(ally, teams.enemyTeam, seed + i * 7919, true); // 带海克斯，对齐正式游戏节奏
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
function runHexStageJob(stage, baseSeed, runs, preferredBuffs = [], startIndex = 0) {
    const hexLog = []; // [{ stage, buffs: [key], winner }]
    const wins = { ally: 0, enemy: 0, draw: 0 };
    const C = CONFIG;
    for (let i = 0; i < runs; i++) {
        clearBattleGlobals();
        // startIndex = 该片在整关序列里的起点，保证「细粒度分片」与「整关一片」产生完全相同的 seed 序列
        const seed = baseSeed + (startIndex + i) * 7919;
        const initRng = new SeededRNG(seed);
        const teams = initBattleTeams(stage, initRng);
        const buffsPicked = [];
        // 海克斯抽取回调：与 runBalanceJob 同口径（角色需求过滤 + 圣火令抽行列），
        // 这里额外支持偏好优先与「小昭·妹永久继承」，并把本局所选取进 buffsPicked。
        const hexPicker = (activeBuffs, allySide, rng) => {
            const existing = activeBuffs.map(b => b.key);
            const allyAlive = allySide.filter(u => u.alive);
            const available = Object.keys(C.BUFFS).filter(k => {
                if (existing.includes(k)) return false;
                if (k === BUFF_TYPES.CARRY && !hasCarryTarget(allyAlive)) return false;   // 无 carry 位则无效，不进候选（与 modules/28 同口径）
                const req = C.BUFF_ROLE_REQUIREMENTS?.[k];
                if (req && !allyAlive.some(u => u.role === req)) return false;
                return true;
            });
            if (available.length === 0) return null;
            // 偏好海克斯出现时优先选（与 101 主线程版一致；无偏好则全池随机）
            const preferred = available.filter(k => preferredBuffs.includes(k));
            const pool = preferred.length > 0 ? preferred : available;
            const pick = pool[rng.nextInt(0, pool.length - 1)];
            const duration = C.BUFFS[pick].duration || C.BUFF_DURATION || 4;
            const nb = { key: pick, target: CAMP_TYPES.ALLY, remaining: duration, name: C.BUFFS[pick].name };
            if (pick === BUFF_TYPES.HOLY_FLAME) {
                nb.col = rng.nextInt(1, 3);
                nb.row = rng.nextInt(1, 3);
            }
            // 对齐正式游戏：选完即由小昭·妹永久继承。
            // 必须从 allySide（战斗内的活体单位）取，不能取 teams.allyTeam——
            // runBattle 内部会 clone 一份上场，写到克隆体外等于没生效。
            const brother = allySide.find(u => u.isXiaoZhaoBrother);
            if (brother) {
                const extra = pick === BUFF_TYPES.HOLY_FLAME ? { col: nb.col, row: nb.row } : {};
                addPermanentBuff(brother, pick, nb.name, extra);
            }
            buffsPicked.push(nb);
            return nb;
        };
        const res = runBattle({
            ally: teams.allyTeam,
            enemy: teams.enemyTeam,
            seed,
            hexPicker
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
function applyConfig(team, cfg, seed) {
    let eu = team.find(u => u[cfg.flag]);
    if (!eu) {
        const candidates = team.filter(u =>
            !u.isZhang && !u.isWei && !u.isXiaoZhaoSister && !u.isXiaoZhaoBrother
        );
        if (!candidates.length) return null;
        eu = candidates.find(u => u.pos === cfg.stdPos) || candidates[0];
    }
    eu.name = cfg.name;
    eu.role = cfg.role;
    eu.m = cfg.m;
    eu.isZhang = eu.isWei = eu.isXiaoZhaoSister = eu.isXiaoZhaoBrother = false;
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
        const teamA = allyTeam.map(u => u.clone());
        const teamB = allyTeam.map(u => u.clone());
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
            const { stage, seed, runs } = e.data;
            result = runEliteStageJob(stage, seed, runs);
        } else if (kind === 'soloElite') {
            const { stage, seed, runs, elite } = e.data;
            result = runSoloEliteJob(stage, seed, runs, elite);
        } else if (kind === 'noElite') {
            const { stage, seed, runs } = e.data;
            result = runNoEliteJob(stage, seed, runs);
        } else if (kind === 'stats') {
            const { stage, seed, runs } = e.data;
            result = runStatsStageJob(stage, seed, runs);
        } else if (kind === 'hex') {
            const { stage, seed, runs, preferredBuffs, startIndex } = e.data;
            result = runHexStageJob(stage, seed, runs, preferredBuffs, startIndex || 0);
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