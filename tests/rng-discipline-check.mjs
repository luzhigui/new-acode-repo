// tests/rng-discipline-check.mjs
// 体检守卫：抽签（随机数）纪律 —— 种子可复现 + 战斗代码禁用 Math.random + 抽签点次数快照
//
// 为什么要有这条（2026-11-08 第 186 轮建）：
//   战斗是种子 RNG 驱动的确定性系统。历史真事故：圣火令基础版把「抽 2 列 2 行」改成「抽 1 列 2 行」，
//   少抽一个随机数 ⇒ 整场随机序列位移 ⇒ 基线大面积漂移（体检迭代日志有记载）。
//   这类改动在代码评审里完全看不出来，只能靠「抽签点清单快照」发现。
//
// 三条判据：
//   ① 同种子双跑：同 seed + 同关卡跑两遍，fact 摘要必须逐字节一致（不一致 = 复现性坏了）。
//   ② 战斗代码禁用 Math.random：core/ 与 modules/（排除纯展示的 303 错误采集 / 304 音频）里出现即报红。
//   ③ 抽签点次数快照：统计 core/ 与 modules/ 每个文件里 `.nextInt(` / `.next(` 的文本出现次数，
//      与 tests/rng-draw-baseline.json 比对。次数变了 ≠ 一定错，但**一定意味着随机序列整体位移**，
//      必须人工确认后重录基线（REGEN=1 node tests/rng-discipline-check.mjs）。
//
// 用法：node tests/rng-discipline-check.mjs           # 校验，退 0 = 全过
//       REGEN=1 node tests/rng-discipline-check.mjs   # 确认是有意改动后，重录抽签点基线
//       SEEDS=1,2 STAGES=1,3 node tests/rng-discipline-check.mjs
export const VER = 'tests/rng-discipline-check.mjs V1.0.0';

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const BASELINE_FILE = join(HERE, 'rng-draw-baseline.json');

// ---- 与回放器同口径：同一套环境垫片 ------------------------------------------------------------------
globalThis.fetch = async (url) => {
    const fs = await import('node:fs');
    const { fileURLToPath: f2u } = await import('node:url');
    const p = f2u(new URL(url));
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

const [{ CONFIG, loadGameData, loadHexEnhanceData }, { SeededRNG, setBattleState }, { createRoundStepper }, { initBattleTeams },
    { renderLog }, { createStore, battleReducer }, { createInitialState }, { GlobalStore }, { STORE_ACTION_TYPES }, { tickAndPickBuffs }] = await Promise.all([
        import('../core/201-config-5v5-test.js'),
        import('../infra/102-core-utils.js'),
        import('../core/210-battle-round.js'),
        import('../modules/330-battle-init.js'),
        import('../render/401-fact-renderer.js'),
        import('../modules/306-battle-store.js'),
        import('../core/218-state-keys.js'),
        import('../infra/104-global-store.js'),
        import('../infra/106-battle-enums.js'),
        import('./_lib/buff-picker.mjs')
    ]);
await import('./_lib/install-mechanics.mjs');
await loadGameData();
await loadHexEnhanceData();

const MAX_ROUND = CONFIG.MAX_ROUND || 35;

function collectText(node, out, depth) {
    if (!node || depth > 8) return;
    if (typeof node === 'string') { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach(n => collectText(n, out, depth + 1)); return; }
    if (typeof node !== 'object') return;
    if (typeof node.text === 'string') out.push(node.text);
    if (typeof node.type === 'string') out.push('<' + node.type + '>');
    if (Array.isArray(node.entries)) node.entries.forEach(n => collectText(n, out, depth + 1));
}

/** 跑一场，返回 fact 摘要（同种子必须完全一致） */
function runOnce(seed, stage) {
    // 跨场隔离：圣火令数量是全局战斗状态，不清零会让第二遍的「当前总数」比第一遍多 —— 那是环境残留，不是随机数问题
    try { setBattleState('holyToken', 0); } catch (e) { /* 垫片环境允许失败 */ }
    const rng = new SeededRNG(seed);
    const store = createStore({ ...createInitialState(), units: [] }, battleReducer);
    GlobalStore.set('battleStore', store);
    const { allyTeam, enemyTeam } = initBattleTeams(stage, rng);
    let bs = {
        ally: allyTeam.map(u => u.clone()),
        enemy: enemyTeam.map(u => u.clone()),
        round: 1, activeBuffs: [], allAllies: allyTeam.map(u => u.clone()), _rng: rng
    };
    bs.activeBuffs = tickAndPickBuffs([], bs.ally, bs.enemy, 1, seed, true);

    const parts = [];
    let winner = null;
    let lastStep = null;

    while (bs.round <= MAX_ROUND) {
        try {
            store.dispatch({ type: STORE_ACTION_TYPES.SET_UNITS, units: [...bs.ally, ...bs.enemy].map(u => ({ ...u })) });
            store.dispatch({ type: STORE_ACTION_TYPES.SET_ROUND, round: bs.round });
        } catch (e) { /* store 垫片失败不影响对账 */ }

        for (const step of createRoundStepper(bs)) {
            lastStep = step;
            for (const f of step.log || []) {
                if (!f || !f.factType) continue;
                let entry = null;
                try { entry = renderLog(f.factType, f.data); } catch (e) { entry = null; }
                const txt = [];
                collectText(entry, txt, 0);
                parts.push(f.factType + '|' + (txt.join(' / ') || '…'));
            }
            if (step.winner) winner = step.winner;
        }
        if (winner || !lastStep) break;
        const nr = bs.round + 1;
        const nb = tickAndPickBuffs(bs.activeBuffs, lastStep.ally, lastStep.enemy, bs.round, seed, bs.round % 3 === 0);
        bs = {
            ally: lastStep.ally.map(u => u.clone()),
            enemy: lastStep.enemy.map(u => u.clone()),
            round: nr, activeBuffs: nb, allAllies: bs.allAllies, _rng: rng
        };
    }
    const digest = createHash('sha256').update(parts.join('\n')).digest('hex');
    return { digest, winner, facts: parts.length, rounds: bs.round, parts };
}

// ---- 静态扫描：Math.random + 抽签点次数 ---------------------------------------------------------------
const BATTLE_DIRS = ['core', 'modules'];
const DISPLAY_FILE_EXEMPT = /^303-error-capture\.js$|^304-audio-manager\.js$/;   // 错误采集/音频：非战斗逻辑

function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function walkJs(dir, out) {
    for (const st of readdirSync(dir, { withFileTypes: true })) {
        if (st.name.startsWith('.')) continue;
        const p = join(dir, st.name);
        if (st.isDirectory()) { walkJs(p, out); continue; }
        if (!/\.js$/.test(st.name)) continue;
        if (DISPLAY_FILE_EXEMPT.test(st.name)) continue;
        out.push(p);
    }
    return out;
}

const DRAW_RE = /\.nextInt\s*\(|\.next\s*\(/g;
const files = [];
for (const d of BATTLE_DIRS) {
    const abs = join(REPO, d);
    if (existsSync(abs)) walkJs(abs, files);
}

const counts = {};
const mathRandomHits = [];
for (const abs of files) {
    const rel = abs.slice(REPO.length + 1).replace(/\\/g, '/');
    const src = stripComments(readFileSync(abs, 'utf8'));
    const n = (src.match(DRAW_RE) || []).length;
    if (n > 0) counts[rel] = n;
    const mr = src.match(/Math\.random\s*\(/g);
    if (mr) mathRandomHits.push(rel + '（' + mr.length + ' 处）');
}

const totalDraws = Object.values(counts).reduce((a, b) => a + b, 0);

// ---- 主流程 ------------------------------------------------------------------------------------
let fails = 0;
function fail(msg) { fails++; console.log('❌ ' + msg); }

console.log('=== 抽签纪律体检 ===');
console.log('VER ' + VER);

// ① 同种子双跑
const seeds = (process.env.SEEDS || '1,2,3,4,5').split(',').map(Number).filter(n => Number.isFinite(n));
const stages = (process.env.STAGES || '1,3').split(',').map(Number).filter(n => Number.isFinite(n));
let replayChecked = 0;
for (const seed of seeds) for (const stage of stages) {
    const a = runOnce(seed, stage);
    const b = runOnce(seed, stage);
    replayChecked++;
    if (a.facts === 0) { fail(`seed=${seed} stage=${stage} 一场都没产出 fact（样本没跑起来）`); continue; }
    if (a.digest !== b.digest) {
        fail(`seed=${seed} stage=${stage} 同种子双跑结果不一致（${a.facts} 条 vs ${b.facts} 条，胜负 ${a.winner}/${b.winner}）—— 种子可复现性被破坏`);
        if (String(process.env.DEBUG_FIRST || '') === '1') {
            const n = Math.min(a.parts.length, b.parts.length);
            for (let i = 0; i < n; i++) {
                if (a.parts[i] !== b.parts[i]) {
                    console.log(`  首个差异 #${i}`);
                    console.log(`    第一遍: ${a.parts[i]}`);
                    console.log(`    第二遍: ${b.parts[i]}`);
                    break;
                }
            }
        }
    }
}
console.log(`① 同种子双跑：核对 ${replayChecked} 场（${seeds.length} 种子 × ${stages.length} 关卡）` + (fails ? '' : '，全部一致'));

// ② 战斗代码禁用 Math.random
if (mathRandomHits.length) fail('战斗代码里出现 Math.random（同种子将不可复现）：' + mathRandomHits.join('、'));
else console.log('② 战斗代码禁用 Math.random：core/ 与 modules/（排除错误采集/音频）0 处');

// ③ 抽签点次数快照
const regen = String(process.env.REGEN || '') === '1';
if (regen) {
    writeFileSync(BASELINE_FILE, JSON.stringify({ VER, total: totalDraws, files: counts }, null, 2) + '\n', 'utf8');
    console.log(`③ 已重录抽签点基线：${totalDraws} 处（${Object.keys(counts).length} 个文件）→ tests/rng-draw-baseline.json`);
} else if (!existsSync(BASELINE_FILE)) {
    fail('没有抽签点基线文件 tests/rng-draw-baseline.json；首次建立请跑：REGEN=1 node tests/rng-discipline-check.mjs');
} else {
    const base = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
    const baseFiles = base.files || {};
    const diffs = [];
    const names = new Set([...Object.keys(baseFiles), ...Object.keys(counts)]);
    for (const n of names) {
        const was = baseFiles[n] || 0, now = counts[n] || 0;
        if (was !== now) diffs.push(`${n}：${was} → ${now}`);
    }
    if (base.total != null && base.total !== totalDraws) diffs.push(`总数：${base.total} → ${totalDraws}`);
    if (diffs.length) {
        fail('抽签点次数变了 —— 随机序列会整体位移，基线/胜负会漂移；确认是有意改动后跑 REGEN=1 重录。变化：' + diffs.slice(0, 6).join('；') + (diffs.length > 6 ? `（共 ${diffs.length} 处）` : ''));
    } else {
        console.log(`③ 抽签点次数与基线一致：${totalDraws} 处（${Object.keys(counts).length} 个文件）`);
    }
}

console.log(fails ? `\nRESULT: FAIL（${fails} 项）` : '\nRESULT: PASS');
process.exit(fails ? 1 : 0);
