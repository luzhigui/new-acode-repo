// 由 109 职业平衡 Worker 扩展为多 kind 分发：'balance' | 'elite' | 'stats' | 'baseline'
// 每个 job 在 worker 内完成 N 场战斗并回报聚合；独立模块实例，天然隔离 _eliteStates/_eventBuffer
// Worker 环境兼容 shim：
//  - 战斗链 15-skill-mechanisms 白骨爪结算读 window.GlobalStore（运行时访问），globalThis 即 window 等价物
//  - 24（内容18流程）无 localStorage，圣火令/宝箱记账为运行时访问，补内存实现（模拟战斗不需要真持久化）
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
import { createRoundStepper } from '../core/11battle-round.js';
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

// 共用：跑 ≤35 回合完整战斗（与各工具原战斗中继逻辑一致）
// 返回 { winner, ally, enemy }；winner 为空 = 超回合未分胜负
// hexEnabled=true 时对齐正式游戏节奏：第 3/6/9 回合末各自动补一个海克斯（明教侧）。
//   精英评测路（runEliteStageJob）启用；stats / baseline 保持裸机基线不动。
function runWholeBattle(initAlly, initEnemy, seed, hexEnabled = false) {
    let state = {
        ally: initAlly.map(u => u.clone()),
        enemy: initEnemy.map(u => u.clone()),
        round: 1,
        activeBuffs: [],
        allAllies: initAlly.map(u => u.clone()),
        _rng: new SeededRNG(seed)
    };
    let finalWinner = null, finalAlly = null, finalEnemy = null;
    for (let r = 1; r <= 35; r++) {
        const stepper = createRoundStepper(state, { ui: false }); // 工具场景跳过 stageActions 翻译
        let lastStep = null;
        for (const step of stepper) { // 引擎已同步化（function*），for...of 直取
            lastStep = step;
            if (step.winner) break;
        }
        if (!lastStep) break;
        if (lastStep.winner) {
            finalWinner = lastStep.winner;
            finalAlly = lastStep.ally;
            finalEnemy = lastStep.enemy;
            break;
        }
        state.ally = lastStep.ally;
        state.enemy = lastStep.enemy;
        if (lastStep.ally._allAllies || state.allAllies) {
            const baseAllies = lastStep.ally._allAllies || state.allAllies;
            state.allAllies = baseAllies.map(full => {
                const cur = lastStep.ally.find(a => a.uid === full.uid);
                if (cur) {
                    full.hp = cur.hp; full.maxHp = cur.maxHp; full.alive = cur.alive;
                    full.atk = cur.atk; full.def = cur.def;
                    if (cur.state._isDead !== undefined) full.state._isDead = cur.state._isDead;
                }
                return full;
            });
        }
        state.activeBuffs = (lastStep.ally._activeBuffs || state.activeBuffs || [])
            .filter(b => b && b.remaining > 0)
            .map(b => ({ ...b, remaining: b.remaining - 1 }))
            .filter(b => b.remaining > 0);
        // 加海克斯（对齐正式游戏节奏）：第 3/6/9 回合末各补一个。
        //   用 state._rng 抽取，保证同 seed 时四精英的海克斯序列一致（初始队伍不同→可用性过滤不同，符合正式游戏）。
        if (hexEnabled && state.round % 3 === 0) {
            const nb = pickHexBuff(state.activeBuffs, lastStep.ally, state._rng, false);
            if (nb) state.activeBuffs.push(nb);
        }
        state.round = r + 1;
    }
    return { winner: finalWinner, ally: finalAlly, enemy: finalEnemy };
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
    let masterBuffs = [];
    if (hexEnabled) {
        const first = pickHexBuff(masterBuffs, buildAlly, rng, true);
        if (first) masterBuffs.push(first);
    }
    let battleState = {
        ally: buildAlly.map(u => u.clone()),
        enemy: buildEnemy.map(u => u.clone()),
        round: 1,
        activeBuffs: masterBuffs,
        allAllies: buildAlly.map(u => u.clone()),
        _rng: rng,
        _firstSide: CAMP_TYPES.ENEMY
    };
    let lastStep = null;
    const maxRound = CONFIG.MAX_ROUND || 35;
    while (battleState.round <= maxRound) {
        const stepper = createRoundStepper(battleState, { ui: false });
        for (const step of stepper) {
            lastStep = step;
            if (step.winner) return { winner: step.winner };
        }
        masterBuffs = masterBuffs.map(b => ({ ...b, remaining: b.remaining - 1 })).filter(b => b.remaining > 0);
        if (hexEnabled && battleState.round % 3 === 0 && battleState.round > 0) {
            const aliveCheckTeam = (lastStep && lastStep.ally) ? lastStep.ally : buildAlly;
            const nb = pickHexBuff(masterBuffs, aliveCheckTeam, rng, false);
            if (nb) masterBuffs.push(nb);
        }
        battleState = {
            ally: (lastStep ? lastStep.ally : battleState.ally).map(u => u.clone()),
            enemy: (lastStep ? lastStep.enemy : battleState.enemy).map(u => u.clone()),
            round: battleState.round + 1,
            activeBuffs: masterBuffs,
            allAllies: battleState.allAllies,
            _rng: rng,
            _firstSide: CAMP_TYPES.ENEMY
        };
    }
    return { winner: null };
}

// 112 精英评测
// 强制精英上场（借引擎 forceZhang/forceWei/forceXiaoZhao hook）：
//   原实现是"initBattleTeams 之后手动替换 victim.pos = stdPos"，绕过引擎站位逻辑——
//   尤其张无忌的 2 号位保护（29battle-init L204 `if (others.length>0 && zhang && !takenPos.has(2))`）会失效：
//   原阵容没抽中张无忌时 2 号位约 44% 概率空着，checkZhangSwitch 判定同列前排无人 → 开局切近战，
//   远程优势全废、顶上前排被打（评测数据表现为"输出不差、存活崩"）。
//   改为 force 标志让精英从一开始就在 initBattleTeams 内部生成，站位 / 2 号位保护 / 5 号位硬编码全部生效。
function runEliteStageJob(cfg, stage, seed, runs) {
    let wins = 0, sumDmg = 0, sumTaken = 0, sumSurv = 0, validRuns = 0;
    let forceKey = null, forceVal = null;
    if (cfg.flag === 'isZhang') { forceKey = 'forceZhang'; forceVal = true; }
    else if (cfg.flag === 'isWei') { forceKey = 'forceWei'; forceVal = true; }
    else if (cfg.flag === 'isXiaoZhaoSister') { forceKey = 'forceXiaoZhao'; forceVal = 'sister'; }
    else if (cfg.flag === 'isXiaoZhaoBrother') { forceKey = 'forceXiaoZhao'; forceVal = 'brother'; }

    for (let i = 0; i < runs; i++) {
        clearBattleGlobals(); // 与原主线程一致，每场清理防 OOM（会清掉 force 标志）
        if (forceKey) GlobalStore.set(forceKey, forceVal); // clear 之后重设，保证本场强制生效
        const initRng = new SeededRNG(seed + i * 7919); // jobSeed 已含 masterSeed+stage*131，公式与原主线程等价
        const teams2 = initBattleTeams(stage, initRng);
        const ally = teams2.allyTeam.map(u => u.clone());
        const eu = ally.find(u => u[cfg.flag]);
        // force 路径下精英必然在场；若因数据缺失未生成（如内容表无该角色），跳过本场不计入
        if (!eu) continue;
        GlobalStore.set('battleHasZhang', ally.some(u => u.isZhang));
        const res = runWholeBattle(ally, teams2.enemyTeam, seed + i * 7919, true);  // 加海克斯（对齐正式游戏）
        if (!res.winner) continue;
        validRuns++;
        if (res.winner === '明教') wins++;
        const euFinal = (res.ally || []).find(u => u[cfg.flag]);
        if (euFinal) {
            sumDmg += euFinal.dmgDealt || 0;
            sumTaken += euFinal.dmgTaken || 0;
            if (euFinal.alive) sumSurv++;
        }
    }
    return { wins, validRuns, sumDmg, sumTaken, sumSurv };
}

// 108 海克斯仪表盘：整局自动战斗（含第3/6/9回合自动补海克斯），逻辑与 101 runBattle 等价。
// 搬进 worker 是因为主线程一口气跑几百场会把页面占死（移动端弹「网页暂无响应」）。
// seed 公式与 101 主线程版一致（Date.now() + i*7919），差异只在于是否并行，统计口径不受影响。
function runHexStageJob(stage, baseSeed, runs) {
    const hexLog = []; // [{ stage, buffs: [key], winner }]
    const C = CONFIG;
    const maxRound = C.MAX_ROUND || 35;
    for (let i = 0; i < runs; i++) {
        clearBattleGlobals();
        const seed = baseSeed + i * 7919;
        const initRng = new SeededRNG(seed);
        const teams = initBattleTeams(stage, initRng);
        const rng = new SeededRNG(seed);
        let battleState = {
            ally: teams.allyTeam.map(u => u.clone()),
            enemy: teams.enemyTeam.map(u => u.clone()),
            round: 1,
            activeBuffs: [],
            allAllies: teams.allyTeam.map(u => u.clone()),
            _rng: rng
        };
        let lastStep = null;
        const buffsPicked = [];
        let winner = '平局';
        while (battleState.round <= maxRound) {
            const stepper = createRoundStepper(battleState, { ui: false });
            for (const step of stepper) {
                lastStep = step;
                if (step.winner) { winner = step.winner; break; }
            }
            if (winner !== '平局') break;
            let nextBuffs = (battleState.activeBuffs || []).map(b => ({ ...b, remaining: b.remaining - 1 })).filter(b => b.remaining > 0);
            if (battleState.round % 3 === 0) {
                const existing = nextBuffs.map(b => b.key);
                const allyAlive = battleState.ally.filter(u => u.alive);
                const available = Object.keys(C.BUFFS).filter(k => {
                    if (existing.includes(k)) return false;
                    const req = C.BUFF_ROLE_REQUIREMENTS?.[k];
                    if (req && !allyAlive.some(u => u.role === req)) return false;
                    return true;
                });
                if (available.length > 0) {
                    const pick = available[rng.nextInt(0, available.length - 1)];
                    const duration = C.BUFFS[pick].duration || C.BUFF_DURATION || 4;
                    const nb = { key: pick, target: CAMP_TYPES.ALLY, remaining: duration, name: C.BUFFS[pick].name };
                    if (pick === BUFF_TYPES.HOLY_FLAME) {
                        nb.col = rng.nextInt(1, 3);
                        nb.row = rng.nextInt(1, 3);
                    }
                    nextBuffs.push(nb);
                    buffsPicked.push(nb);
                }
            }
            battleState = {
                ally: (lastStep ? lastStep.ally : battleState.ally).map(u => u.clone()),
                enemy: (lastStep ? lastStep.enemy : battleState.enemy).map(u => u.clone()),
                round: battleState.round + 1,
                activeBuffs: nextBuffs,
                allAllies: battleState.allAllies,
                _rng: battleState._rng
            };
        }
        hexLog.push({ stage, buffs: buffsPicked.map(b => b.key), winner });
    }
    return { hexLog };
}

// 113 统计体检
// 原主线程逻辑：initBattleTeams → hp-tracker 订阅 → runWholeBattle → record 进 agg（主线程聚合）
function runStatsStageJob(stage, seed, runs) {    const agg = {}; // worker 内自聚合，返回给主线程直接并入全局 agg
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
            const { cfg, stage, seed, runs } = e.data;
            result = runEliteStageJob(cfg, stage, seed, runs);
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