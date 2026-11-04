// tools/819-auto-tuner.mjs — 平衡参数敏感度分析（A 步：单参数扰动排行榜）
export const VER = 'tools/819-auto-tuner.mjs V1.1.0';
// V1.1.0 | 2026-11-03 修复「整个工具静默失效」：机制装配改为唯一的 modules/301-reg-mechanics 入口
//   （原手装 307/308/317 漏 331-custom-effects，鹿杖客 dotTick 让每局安装期抛错，被 catch 吞成
//   「异常局=280」，表现为全关基线 0.0% / 参数项 0 / 无显著参数——即假绿）。
//   同时补异常留档：首个异常的类型/消息/栈 + 全崩时退出码 1、部分崩退出码 2，杜绝再次静默。
//
// 用法：
//   node tools/819-auto-tuner.mjs                                  # 全关卡 / 40 seed / ±20%
//   node tools/819-auto-tuner.mjs --stages 2,3 --seeds 60 --delta 0.25
//   node tools/819-auto-tuner.mjs --json                           # 表后追加机器可读 JSON
//
// 口径：
//   · 基线 = 无团队海克斯（裸机），每关用同一批固定 seed（默认 1000..1039）各跑一局，统计明教胜率。
//   · 被测参数 = 该关双方出战单位（基线各局并集，按 characters 名映射）对应的
//     characters.<名>.skills.<技能>.params.<键> 里 typeof === 'number' 的项。
//   · 一次只动一个参数，× (1+delta) 与 × (1-delta) 各跑同一批 seed；Δ = 两方向 |新胜率-基线| 的最大值。
//   · 参数注入走内存改写（loadGameData 返回的就是缓存本体，getSkillParams 读它），跑完立即还原。
//   · ⚠ 已知口径缺陷（V1.1.0 记录，未改，等拍板）：seed 直接用 1000+i 连续小整数，没有走
//     822-param-lab-core 的 mixSeed 散列。xorshift32 首个随机数与 seed 强相关，而
//     modules/330-battle-init 第一抽就是精英人数骰 —— 实测第3关 500 局：
//     本工具 raw 种子 单精英 69.8% / 双精英 30.2%；822 散列 单 83.6% / 双 16.4%。
//     即本工具的阵容分布系统性偏「双精英」，胜率绝对值与 108/112/120 等工具不可直接横比。
//     因参数扰动是对同一批 seed 做的配对比较（Δ/方向仍可用），故暂不改；若要横比绝对值，
//     改成 mixSeed(seed) 即可，但历史报表会断代。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- 环境垫片：引擎零 DOM，但 import 链上会碰浏览器 API（照抄 tests/smoke-headless.mjs L15-35）---
globalThis.window = globalThis;
globalThis.localStorage = {
    _d: new Map(),
    getItem(k) { return this._d.has(k) ? this._d.get(k) : null; },
    setItem(k, v) { this._d.set(k, String(v)); },
    removeItem(k) { this._d.delete(k); }
};
// 把模块里的 new URL('../content/x.json', import.meta.url) 映射到真实文件
globalThis.fetch = async (url) => {
    let p = typeof url === 'string' ? url : (url.pathname || String(url));
    p = decodeURIComponent(p);
    if (/^[A-Za-z]:[\\/]/.test(p)) { /* 已是绝对路径 */ }
    else {
        const m = p.replace(/\\/g, '/').match(/(?:^|\/)(content\/.+)$/);
        p = m ? join(ROOT, m[1]) : join(ROOT, p.replace(/^\/+/, ''));
    }
    const text = readFileSync(p, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
};

// --- 命令行参数 ---
function parseArgs(argv) {
    const o = { stages: null, seeds: 40, delta: 0.20, base: 1000, json: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--json') o.json = true;
        else if (a === '--stages') o.stages = String(argv[++i]).split(',').map(s => Number(s.trim())).filter(n => !Number.isNaN(n));
        else if (a === '--seeds') o.seeds = Math.max(1, Number(argv[++i]) || o.seeds);
        else if (a === '--delta') o.delta = Math.abs(Number(argv[++i]) || o.delta);
        else if (a === '--base') o.base = Number(argv[++i]) || o.base;
        else if (a === '--help' || a === '-h') { console.log('用法: node tools/819-auto-tuner.mjs [--stages 2,3] [--seeds 40] [--delta 0.20] [--base 1000] [--json]'); process.exit(0); }
    }
    return o;
}
const ARGS = parseArgs(process.argv.slice(2));

// --- 引擎加载（顺序同 tests/rules-replay.mjs）---
const [{ CONFIG, loadGameData, loadHexEnhanceData }, { initBattleTeams }, { SeededRNG }, { createRoundStepper }] =
    await Promise.all([
        import('../core/201-config-5v5-test.js'),
        import('../modules/330-battle-init.js'),
        import('../infra/102-core-utils.js'),
        import('../core/210-battle-round.js')
    ]);
await import('../modules/302-elite-skills.js');   // 副作用：注册 damageModifiers / xiaoHexEnhance 等 query
// 机制装配统一入口（V1.0.1 收口，与 816/822/815/probe-* 同口径）：
//   原散装三行 307/308/317 漏了 331-custom-effects（dotTick / damageReflect），
//   鹿杖客一旦出场，core/15 安装期校验抛「未知顶层机制 type "dotTick"」，
//   runOne 的 catch 把异常吞成 err++，于是每关胜率恒 0.0%、参数项恒 0、报表全空——整个工具静默失效。
await import('../modules/301-reg-mechanics.js');
const game = await loadGameData();              // 返回的就是 01 的缓存本体，getSkillParams 读它
await loadHexEnhanceData();                     // // 第 162 轮：小昭.hexEnhance 已迁到 content/002-hex-enhance.json，启动链一并 loadHexEnhanceData（缺口由 tests/hex-boot-chain-guard.mjs 点名）
const MAX_ROUND = CONFIG.MAX_ROUND || 35;

// --- 关卡列表：读 content 的 encounters.enemySquads 键，自动跟随数据（默认 1..7）---
function allStages() {
    const sq = (game.encounters && game.encounters.enemySquads) || {};
    return Object.keys(sq).map(Number).sort((a, b) => a - b);
}
const STAGES = (ARGS.stages && ARGS.stages.length) ? ARGS.stages : allStages();
const SEEDS = Array.from({ length: ARGS.seeds }, (_, i) => ARGS.base + i);
const DELTA = ARGS.delta;

// --- 单位名 → characters 键（小昭会被改名为 小昭·姊/妹，需按身份标记回映射）---
function charKeyOf(u) {
    if (u.isXiaoZhaoSister || u.isXiaoZhaoBrother) return '小昭';
    return u.name;
}

// --- 跑一局（建队 → 逐回合推进 → 取 winner），照 tests/rules-replay.mjs runCase 的口径 ---
function runOne(seed, stage) {
    const rng = new SeededRNG(seed);
    const { allyTeam, enemyTeam } = initBattleTeams(stage, rng);
    const names = new Set();
    for (const u of [...allyTeam, ...enemyTeam]) {
        const k = charKeyOf(u);
        if (k && game.characters && game.characters[k]) names.add(k);
    }
    let state = {
        ally: allyTeam.map(u => u.clone()),
        enemy: enemyTeam.map(u => u.clone()),
        round: 1,
        activeBuffs: [],                       // 裸机基线：不注入团队海克斯
        allAllies: allyTeam.map(u => u.clone()),
        _rng: rng                              // 与建队同一 RNG 流（同 seed 可复现）
    };
    let winner = null, lastStep = null;
    while (state.round <= MAX_ROUND) {
        lastStep = null;
        for (const step of createRoundStepper(state, { ui: false })) {
            lastStep = step;
            if (step.winner) { winner = step.winner; break; }
        }
        if (winner || !lastStep) break;
        state = {
            ally: lastStep.ally.map(u => u.clone()),
            enemy: lastStep.enemy.map(u => u.clone()),
            round: state.round + 1,
            activeBuffs: [],
            allAllies: state.allAllies,
            _rng: rng
        };
    }
    return { winner, names };
}

// 首个异常留档：本工具历史上曾被「异常局=280 但一个字原因都不打」坑过——
// 漏装 modules/301 导致每局安装期抛错，被 catch 吞掉后报表全 0，看起来只是「参数没影响」。
const firstErr = { msg: null, stack: null, where: null };
function recordErr(e, where) {
    if (firstErr.msg) return;
    firstErr.msg = e && e.message ? e.message : String(e);
    firstErr.stack = (e && e.stack) || '';
    firstErr.where = where;
}

// 跑一批 seed，返回明教胜率
function winRate(stage) {
    let w = 0, err = 0;
    for (const seed of SEEDS) {
        try { if (runOne(seed, stage).winner === '明教') w++; }
        catch (e) { err++; recordErr(e, `扰动 seed=${seed} 关=${stage}`); }
    }
    return { rate: w / SEEDS.length, err };
}

// --- 1) 基线（每关只跑一次）---
console.error(`[119] 基线计算中：关卡 ${STAGES.join(',')} / ${SEEDS.length} seed / seed ${SEEDS[0]}..${SEEDS[SEEDS.length - 1]}`);
const baseline = {};
for (const stage of STAGES) {
    let mingWins = 0, err = 0;
    const nameSet = new Set();
    for (const seed of SEEDS) {
        try {
            const r = runOne(seed, stage);
            if (r.winner === '明教') mingWins++;
            r.names.forEach(n => nameSet.add(n));
        } catch (e) { err++; recordErr(e, `基线 seed=${seed} 关=${stage}`); }
    }
    baseline[stage] = { rate: mingWins / SEEDS.length, wins: mingWins, names: [...nameSet], err };
}

// --- 2) 该关被测参数清单 ---
function paramsOfStage(stage) {
    const list = [];
    for (const c of baseline[stage].names) {
        const ch = game.characters[c];
        if (!ch || !ch.skills) continue;
        for (const [skill, sv] of Object.entries(ch.skills)) {
            const p = sv && sv.params;
            if (!p) continue;
            for (const [key, val] of Object.entries(p)) {
                if (typeof val === 'number') list.push({ stage, char: c, skill, key, value: val });
            }
        }
    }
    return list;
}
const paramList = [];
for (const stage of STAGES) paramList.push(...paramsOfStage(stage));

// --- 3) 逐个扰动 ---
function setParam(e, v) { game.characters[e.char].skills[e.skill].params[e.key] = v; }
function restoreAll() { for (const e of paramList) setParam(e, e.value); }

const rows = [];
const tStart = Date.now();
try {
    let done = 0;
    for (const e of paramList) {
        const base = baseline[e.stage].rate;
        setParam(e, e.value * (1 + DELTA));
        const up = winRate(e.stage);
        setParam(e, e.value * (1 - DELTA));
        const down = winRate(e.stage);
        setParam(e, e.value);                     // 每项跑完立即还原
        const dUp = up.rate - base, dDown = down.rate - base;
        rows.push({
            stage: e.stage, char: e.char, skill: e.skill, key: e.key, value: e.value,
            upRate: up.rate, downRate: down.rate, baseRate: base,
            delta: Math.max(Math.abs(dUp), Math.abs(dDown)),
            dir: dUp > 0 ? '↑' : (dUp < 0 ? '↓' : '—'),
            dUp, dDown, err: up.err + down.err
        });
        done++;
        if (done % 10 === 0) console.error(`[119] 扰动进度 ${done}/${paramList.length}`);
    }
} finally {
    restoreAll();                                 // 硬要求：异常也必须还原
}
const elapsed = (Date.now() - tStart) / 1000;

// --- 4) 输出 ---
const pct = (x) => (x * 100).toFixed(1) + '%';
const num = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6));

console.log('# 平衡参数敏感度排行榜（单参数扰动）\n');
console.log(`基线胜率（明教）：${STAGES.map(s => `关卡${s}=${pct(baseline[s].rate)}`).join('，')}\n`);

rows.sort((a, b) => b.delta - a.delta);
console.log('| 关卡 | 角色 | 技能 | 参数 | 原值 | 调大后胜率 | 调小后胜率 | Δ | 方向 |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
    console.log(`| ${r.stage} | ${r.char} | ${r.skill} | ${r.key} | ${num(r.value)} | ${pct(r.upRate)} | ${pct(r.downRate)} | ${pct(r.delta)} | ${r.dir} |`);
}

const flat = rows.filter(r => r.delta < 0.05);
console.log('\n## 本轮无显著影响的参数（|Δ| < 5%）');
if (flat.length === 0) console.log('- （无）');
else for (const r of flat) console.log(`- 关卡${r.stage} / ${r.char} / ${r.skill} / ${r.key}（原值 ${num(r.value)}，|Δ|=${pct(r.delta)}）`);

const totalErr = rows.reduce((s, r) => s + r.err, 0) + STAGES.reduce((s, st) => s + baseline[st].err, 0);
const totalRuns = rows.length * SEEDS.length * 2 + STAGES.length * SEEDS.length;
console.log(`\n运行参数：stages=${STAGES.join(',')}，seeds=${SEEDS.length}（${SEEDS[0]}..${SEEDS[SEEDS.length - 1]}），delta=±${(DELTA * 100).toFixed(0)}%，参数项=${rows.length}，异常局=${totalErr}，总耗时=${elapsed.toFixed(1)}s`);

// 异常局必须显式暴雷：全崩时上面的「基线 0.0% / 参数项 0 / 无显著参数」看起来像是
// 「这个关没有敏感参数」，而不是「工具根本没跑起来」——这两种结论天差地别，不能靠人猜。
if (totalErr > 0) {
    console.error(`\n⚠️ 异常局 ${totalErr}/${totalRuns} 局（首个异常：${firstErr.where || '?'}）`);
    if (firstErr.msg) {
        console.error(`   ${firstErr.msg}`);
        if (firstErr.stack) console.error(firstErr.stack.split('\n').slice(0, 6).map(l => '   ' + l.trim()).join('\n'));
    }
    if (totalErr === totalRuns) {
        console.error('   ❌ 全部对局均抛错，本表数据无效（请不要据此判断「无敏感参数」）。');
        process.exitCode = 1;
    } else {
        console.error('   部分对局抛错，胜率与 Δ 可能失真，判读前先修异常。');
        process.exitCode = 2;
    }
}

if (ARGS.json) {
    console.log('\n```json');
    console.log(JSON.stringify({
        ver: VER,
        config: { stages: STAGES, seeds: SEEDS, delta: DELTA, maxRound: MAX_ROUND },
        baseline: STAGES.map(s => ({ stage: s, winRate: baseline[s].rate, characters: baseline[s].names })),
        results: rows.map(r => ({
            stage: r.stage, char: r.char, skill: r.skill, param: r.key, value: r.value,
            winRateBase: r.baseRate, winRateUp: r.upRate, winRateDown: r.downRate,
            delta: r.delta, deltaUp: r.dUp, deltaDown: r.dDown, direction: r.dir
        })),
        insignificant: flat.map(r => ({ stage: r.stage, char: r.char, skill: r.skill, param: r.key, value: r.value, delta: r.delta })),
        elapsedSec: Number(elapsed.toFixed(2))
    }, null, 2));
    console.log('```');
}
