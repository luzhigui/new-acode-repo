// 由 109 职业平衡 Worker 扩展为多 kind 分发：'balance' | 'elite' | 'stats' | 'baseline' | 'hex'
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
import { createBuffObject } from '../modules/28buff-tools.js';
import { initBattleTeams } from '../modules/29battle-init.js';
import '../infra/54-global-store.js';
import '../modules/25elite-imperial.js';
import '../modules/26elite-sixsects.js';
import '../modules/27elite-mingjiao.js';
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
function runEliteStageJob(stage, seed, runs) {
    const agg = {
        '张无忌':  { runs: 0, wins: 0, sumDmg: 0, sumTaken: 0, sumSurv: 0 },
        '韦一笑':  { runs: 0, wins: 0, sumDmg: 0, sumTaken: 0, sumSurv: 0 },
        '小昭·姊': { runs: 0, wins: 0, sumDmg: 0, sumTaken: 0, sumSurv: 0 },
        '小昭·妹': { runs: 0, wins: 0, sumDmg: 0, sumTaken: 0, sumSurv: 0 },
        '金毛狮王谢逊': { runs: 0, wins: 0, sumDmg: 0, sumTaken: 0, sumSurv: 0 }
    };
    for (let i = 0; i < runs; i++) {
        clearBattleGlobals(); // 每场清理防 OOM（同时清掉 force 标志，保证本场是纯普通局）
        const initRng = new SeededRNG(seed + i * 7919);
        const teams = initBattleTeams(stage, initRng);
        const ally = teams.allyTeam.map(u => u.clone());
        if (!ally.length) continue;
        GlobalStore.set('battleHasZhang', ally.some(u => u.isZhang));
        const res = runWholeBattle(ally, teams.enemyTeam, seed + i * 7919, true); // 带海克斯，对齐正式游戏节奏
        if (!res.winner) continue;
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
    return agg;
}

// 108 海克斯仪表盘：整局自动战斗（含第3/6/9回合自动补海克斯），逻辑与 101 runBattle 等价。
// 搬进 worker 是因为主线程一口气跑几百场会把页面占死（移动端弹「网页暂无响应」）。
// seed 公式与 101 主线程版一致（Date.now() + i*7919），差异只在于是否并行，统计口径不受影响。
function runHexStageJob(stage, baseSeed, runs) {
    const hexLog = []; // [{ stage, buffs: [key], winner }]
    const C = CONFIG;
    for (let i = 0; i < runs; i++) {
        clearBattleGlobals();
        const seed = baseSeed + i * 7919;
        const initRng = new SeededRNG(seed);
        const teams = initBattleTeams(stage, initRng);
        const buffsPicked = [];
        // 海克斯抽取回调：与 runBalanceJob 同口径（角色需求过滤 + 圣火令抽行列），
        // 但这里要记录"本局选了哪些"，故用闭包把结果收进 buffsPicked。
        const hexPicker = (activeBuffs, allySide, rng) => {
            const existing = activeBuffs.map(b => b.key);
            const allyAlive = allySide.filter(u => u.alive);
            const available = Object.keys(C.BUFFS).filter(k => {
                if (existing.includes(k)) return false;
                const req = C.BUFF_ROLE_REQUIREMENTS?.[k];
                if (req && !allyAlive.some(u => u.role === req)) return false;
                return true;
            });
            if (available.length === 0) return null;
            const pick = available[rng.nextInt(0, available.length - 1)];
            const duration = C.BUFFS[pick].duration || C.BUFF_DURATION || 4;
            const nb = { key: pick, target: CAMP_TYPES.ALLY, remaining: duration, name: C.BUFFS[pick].name };
            if (pick === BUFF_TYPES.HOLY_FLAME) {
                nb.col = rng.nextInt(1, 3);
                nb.row = rng.nextInt(1, 3);
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
        hexLog.push({ stage, buffs: buffsPicked.map(b => b.key), winner: res.winner || '平局' });
    }
    return { hexLog };
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
        } else if (kind === 'stats') {
            const { stage, seed, runs } = e.data;
            result = runStatsStageJob(stage, seed, runs);
        } else if (kind === 'hex') {
            const { stage, seed, runs } = e.data;
            result = runHexStageJob(stage, seed, runs);
        } else if (kind === 'baseline') {
            const { stage, seed, runs, cfgA, cfgB } = e.data;
            result = runBaselineStageJob(stage, seed, runs, cfgA, cfgB);
        } else {
            throw new Error(`未知 worker kind: ${kind}`);
        }
        self.postMessage({ jobId, ok: true, result });
    } catch (err) {
        self.postMessage({ jobId, ok: false, error: String(err && err.stack || err) });
    }
};