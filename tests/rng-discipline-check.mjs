// V1.3.1 | 2026-11-09：真收口手写剥注释——删本地 stripComments，改 import 公共件 stripComments。
//   实测：60 个 core/modules 文件里公共件与旧正则版 8 个输出不同（公共件不误删字符串里的 //），
//   但抽签点 .nextInt(/.next( 计数 0 变化 ⇒ 本脚本静态统计与结论不变；改前/改后输出逐字一致已取证。
// tests/rng-discipline-check.mjs
// 体检守卫：抽签（随机数）纪律 —— 种子可复现 + 战斗代码禁用 Math.random + 抽签点次数快照
//
// 为什么要有这条（2026-11-08 第 186 轮建）：
//   战斗是种子 RNG 驱动的确定性系统。历史真事故：圣火令基础版把「抽 2 列 2 行」改成「抽 1 列 2 行」，
//   少抽一个随机数 ⇒ 整场随机序列位移 ⇒ 基线大面积漂移（体检迭代日志有记载）。
//   这类改动在代码评审里完全看不出来，只能靠「抽签点清单快照」发现。
//
// 四条判据（V1.3.0 起口径）：
//   ① 同种子双跑：同 seed + 同关卡跑两遍，fact 摘要必须逐字节一致（不一致 = 复现性坏了）—— 主判据。
//   ② 战斗代码禁用 Math.random：core/ 与 modules/（排除纯展示的 303 错误采集 / 304 音频）里出现即报红。
//   ③ 抽签点文本次数（仅提示、不判红）：统计每个文件里 `.nextInt(` / `.next(` 的文本出现次数。
//      **静态文本数不可信**——把多处抽签抽成公共函数后，文本数会下降但运行期序列不变（330 即此例）。
//      这里只帮人快速认出「哪几个文件的抽签点结构变了」，结构性的新增/删除仍建议人工确认。
//   ④ 运行期抽签次数（主判据）：给 SeededRNG.next() 挂计数器，记录每个 seed:stage 一场战斗
//      **实际抽了多少个数**，与 tests/rng-draw-runtime-baseline.json 逐项比对。
//      重抽（抽到不合规再抽）、换签（一次拆两次）、循环次数变化、配置门槛改变抽签次数，全在这里暴露；
//      次数不等 = 该场随机序列位移 ⇒ 必须解释清楚是哪个机制多抽/少抽。
//
// 用法：node tests/rng-discipline-check.mjs           # 校验，退 0 = 全过
//       REGEN=1 node tests/rng-discipline-check.mjs   # 重录基线（以运行期数为准；静态文本仅作提示）
//       REGEN_DRAW=1 node tests/rng-discipline-check.mjs  # 同上，仅重录运行期基线
//       SEEDS=1,2 STAGES=1,3 node tests/rng-discipline-check.mjs
//
// V1.3.0 | 2026-11-08 口径订正：静态文本计数降级为提示（不判红），运行期抽签次数升为主判据；
//   默认样本扩到 1~7 关 × 5 种子，覆盖更多阵容。
// V1.2.0 | 2026-11-08 第 195 轮（回合时序与抽签域）：新增 ④ 运行期抽签次数基线。
//
// V1.1.0 | 2026-11-08 第 191 轮：③ 不再是「一行报红让人猜」。差异会按『新增文件/删除文件/次数增加/次数减少』
//   分类逐文件列出（含差值、该文件最近改动时刻），并按影响面给出下一步该跑什么：
//     次数减少 ⇒ 最危险（少抽一个数，之后所有随机序列整体位移），先查是不是删了抽签语句；
//     core/ 公共文件变化 ⇒ 影响所有战斗；modules/26x 单角色文件 ⇒ 只影响该角色出手。
//   REGEN 重录时会打印「本次重录的增删清单」，避免有人悄悄把基线刷绿。
export const VER = 'tests/rng-discipline-check.mjs V1.3.1';

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { stripComments } from './_lib/static-truth-slice.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const BASELINE_FILE = join(HERE, 'rng-draw-baseline.json');
const RUNTIME_BASELINE_FILE = join(HERE, 'rng-draw-runtime-baseline.json');

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

/** 带抽签计数器的 RNG：只包 next()（nextInt 内部就是调 next()，包两层会重复计数） */
function countingRng(seed) {
    const rng = new SeededRNG(seed);
    const orig = rng.next.bind(rng);
    let n = 0;
    rng.next = (...args) => { n++; return orig(...args); };
    Object.defineProperty(rng, 'drawCount', { get: () => n });
    return rng;
}

/** 跑一场，返回 fact 摘要（同种子必须完全一致）+ 本场实际抽签次数 */
function runOnce(seed, stage) {
    // 跨场隔离：圣火令数量是全局战斗状态，不清零会让第二遍的「当前总数」比第一遍多 —— 那是环境残留，不是随机数问题
    try { setBattleState('holyToken', 0); } catch (e) { /* 垫片环境允许失败 */ }
    const rng = countingRng(seed);
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
    return { digest, winner, facts: parts.length, rounds: bs.round, parts, drawCount: rng.drawCount };
}

// ---- 静态扫描：Math.random + 抽签点次数 ---------------------------------------------------------------
const BATTLE_DIRS = ['core', 'modules'];
const DISPLAY_FILE_EXEMPT = /^303-error-capture\.js$|^304-audio-manager\.js$/;   // 错误采集/音频：非战斗逻辑

// 剥注释已收口到 tests/_lib/static-truth-slice.mjs（见文件头 import），此处不再留第二份实现。

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
const stages = (process.env.STAGES || '1,2,3,4,5,6,7').split(',').map(Number).filter(n => Number.isFinite(n));
let replayChecked = 0;
const drawCases = {};      // "seed:stage" → 本场实际抽签次数（④ 运行期基线用）
for (const seed of seeds) for (const stage of stages) {
    const a = runOnce(seed, stage);
    const b = runOnce(seed, stage);
    replayChecked++;
    drawCases[seed + ':' + stage] = a.drawCount;
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
// 文件最近改动时刻提示：帮人一眼认出「这次改的就是它」，不用对着几十个文件猜
function mtimeHint(rel) {
    try {
        const st = statSync(join(REPO, rel));
        const mins = Math.round((Date.now() - st.mtimeMs) / 60000);
        if (mins < 1) return '（刚刚改过）';
        if (mins < 60) return `（${mins} 分钟前改过）`;
        const hours = Math.round(mins / 60);
        if (hours < 24) return `（${hours} 小时前改过）`;
        return `（${Math.round(hours / 24)} 天前改过）`;
    } catch (e) { return '（文件已不存在 ⇒ 抽签点被整段删除，重点看这里）'; }
}
// 影响面：core/ 是公共流程（所有战斗都会位移）；modules/ 一般只影响该角色/该机制的出手链
function impactOf(rel) {
    return rel.indexOf('core/') === 0 ? '影响全部战斗' : '影响该机制/角色的出手链';
}
if (regen) {
    let changed = [];
    if (existsSync(BASELINE_FILE)) {
        try {
            const old = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
            const oldFiles = old.files || {};
            for (const n of new Set([...Object.keys(oldFiles), ...Object.keys(counts)])) {
                const was = oldFiles[n] || 0, now = counts[n] || 0;
                if (was !== now) changed.push(`${n}：${was} → ${now}`);
            }
            if (old.total != null && old.total !== totalDraws) changed.push(`总数：${old.total} → ${totalDraws}`);
        } catch (e) { changed = ['（旧基线读不出来，无法对比）']; }
    }
    writeFileSync(BASELINE_FILE, JSON.stringify({ VER, total: totalDraws, files: counts }, null, 2) + '\n', 'utf8');
    console.log(`③ 已重录抽签点文本提示基线：${totalDraws} 处（${Object.keys(counts).length} 个文件）→ tests/rng-draw-baseline.json`);
    console.log(changed.length
        ? `   本次重录的文本差异（仅提示，不判红；请写进提交说明）：${changed.join('；')}`
        : '   本次重录与旧提示基线完全一致（属于空重录）。');
} else if (!existsSync(BASELINE_FILE)) {
    console.log('ℹ️ 没有抽签点文本提示基线 tests/rng-draw-baseline.json（静态计数只作提示、不判红；需要时 REGEN=1 建立）');
} else {
    const base = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
    const baseFiles = base.files || {};
    const rows = [];
    for (const n of new Set([...Object.keys(baseFiles), ...Object.keys(counts)])) {
        const was = baseFiles[n] || 0, now = counts[n] || 0;
        if (was !== now) rows.push({ name: n, was, now, delta: now - was });
    }
    const totalDelta = (base.total != null) ? totalDraws - base.total : 0;
    if (rows.length === 0 && totalDelta === 0) {
        console.log(`③ 抽签点文本次数与提示基线一致（不判红）：${totalDraws} 处（${Object.keys(counts).length} 个文件）`);
    } else {
        // 分类仅用于展示（不判红）：删/增文本抽签点都可能只是抽成公共函数，真实位移由 ④ 判定
        const added = rows.filter(r => r.was === 0 && r.now > 0);
        const removed = rows.filter(r => r.now === 0 && r.was > 0);
        const down = rows.filter(r => r.was > 0 && r.now > 0 && r.delta < 0);
        const up = rows.filter(r => r.was > 0 && r.now > 0 && r.delta > 0);
        // 分类仅用于展示（不判红）：删/增文本抽签点都可能只是抽成公共函数，真实位移由 ④ 判定
        // 静态文本计数已降级为「提示」：公共函数抽离会把多处调用合并成一处定义，文本数下降但运行期序列不变。
        console.log(rows.length === 0
            ? `ℹ️ 抽签点文本总数变了（分文件数无差异，疑似手改过基线）：${base.total} → ${totalDraws}`
            : `ℹ️ 抽签点文本次数变了（共 ${rows.length} 个文件${base.total != null ? `，总数 ${base.total} → ${totalDraws}` : ''}）—— 仅提示、不判红；以 ④ 运行期次数为准`);
        const dump = (title, list) => {
            if (!list.length) return;
            console.log(`   ${title}：`);
            for (const r of list) {
                console.log(`     • ${r.name}：${r.was} → ${r.now}（${r.delta > 0 ? '+' : ''}${r.delta}）${mtimeHint(r.name)} ⇒ ${impactOf(r.name)}`);
            }
        };
        dump('抽签点文本减少（可能是删签，也可能是抽成公共函数；以 ④ 为准）', down);
        dump('整文件抽签点文本消失（可能整文件删除/改名；以 ④ 为准）', removed);
        dump('抽签点文本增加（以 ④ 为准）', up);
        dump('新增文件带抽签点', added);
        console.log('   下一步（按顺序，不要跳过）：');
        console.log('     1) 对照上面标「刚刚/几分钟前改过」的文件，先确认这次改动是不是只改文案/重命名/挪位置/抽成公共函数 —— 是的话运行期数不会变，④ 会替你作证；');
        console.log('     2) 若 ④ 也报位移，再逐个查是哪个机制重抽/换签/多抽（含配置门槛改变抽签次数）；');
        console.log('     3) 确认漂移可接受后：REGEN=1 node tests/rng-discipline-check.mjs 重录（以运行期数为准），把基线文件和代码改动一起提交；');
        console.log('     4) 再跑一遍本命令，应转 PASS；同一次提交里没带运行期基线 = 别人拉下来必红。');
    }
}

// ④ 运行期抽签次数快照
//   静态 ③ 只能看到「源码里有几个 .next(」，看不到运行时「同一处代码抽了几次」。
//   重抽（抽到不合规再抽一次）/ 换签（一次抽签拆成两次）/ 循环次数变化，都属于源码不变、序列位移的改动。
const regenDraw = String(process.env.REGEN_DRAW || '') === '1' || String(process.env.REGEN || '') === '1';
const caseKeys = Object.keys(drawCases);
const totalRuntimeDraws = caseKeys.reduce((s, k) => s + drawCases[k], 0);
if (regenDraw) {
    let changed = [];
    if (existsSync(RUNTIME_BASELINE_FILE)) {
        try {
            const old = JSON.parse(readFileSync(RUNTIME_BASELINE_FILE, 'utf8'));
            const oldCases = old.cases || {};
            for (const k of new Set([...Object.keys(oldCases), ...caseKeys])) {
                const was = oldCases[k], now = drawCases[k];
                if (was !== now) changed.push(`${k}：${was == null ? '（新样本）' : was} → ${now == null ? '（已移除）' : now}`);
            }
        } catch (e) { changed = ['（旧基线读不出来，无法对比）']; }
    }
    writeFileSync(RUNTIME_BASELINE_FILE, JSON.stringify({ VER, total: totalRuntimeDraws, cases: drawCases }, null, 2) + '\n', 'utf8');
    console.log(`④ 已重录运行期抽签次数基线（主判据）：${caseKeys.length} 场 / 共 ${totalRuntimeDraws} 次 → tests/rng-draw-runtime-baseline.json`);
    console.log(changed.length ? `   本次重录的差异（请写进提交说明）：${changed.join('；')}` : '   本次重录与旧基线完全一致（空重录）。');
} else if (!existsSync(RUNTIME_BASELINE_FILE)) {
    fail('没有运行期抽签次数基线 tests/rng-draw-runtime-baseline.json（主判据）；首次建立请跑：REGEN=1 node tests/rng-discipline-check.mjs');
} else {
    const base = JSON.parse(readFileSync(RUNTIME_BASELINE_FILE, 'utf8'));
    const baseCases = base.cases || {};
    const rows = [];
    const missingBase = Object.keys(baseCases).filter(k => !(k in drawCases));
    for (const k of Object.keys(drawCases)) {
        const was = baseCases[k], now = drawCases[k];
        if (was !== now) rows.push({ k, was, now, delta: (now || 0) - (was || 0) });
    }
    if (missingBase.length) console.log(`   （本次矩阵未覆盖 ${missingBase.length} 个基线样本，不判红：${missingBase.join('、')}）`);
    if (rows.length === 0) {
        console.log(`④ 运行期抽签次数与基线一致：${caseKeys.length} 场 / 共 ${totalRuntimeDraws} 次`);
    } else {
        fail(`运行期抽签次数变了（${rows.length} 场，主判据）—— 随机序列位移，必须解释是哪个机制重抽/换签/多抽/配置门槛改次数`);
        for (const r of rows) {
            const flag = r.delta > 0 ? '多抽（重抽/换签/新增分支）' : '少抽（删签/分支变窄）';
            console.log(`     • ${r.k}：${r.was == null ? '（不在基线）' : r.was} → ${r.now == null ? '（本场已不产出）' : r.now}（${r.delta > 0 ? '+' : ''}${r.delta}）⇒ ${flag}`);
        }
        console.log('   处理：① 先定位是哪处机制改了抽签次数（叠加上面 ③ 的静态差异一起看）；');
        console.log('         ② 跑 node tests/rules-replay.mjs 看随机序列位移影响到哪些规则；');
        console.log('         ③ 确认可接受后 REGEN_DRAW=1 node tests/rng-discipline-check.mjs 重录运行期基线，与代码改动同一次提交。');
    }
}

console.log(fails ? `\nRESULT: FAIL（${fails} 项）` : '\nRESULT: PASS');
process.exit(fails ? 1 : 0);
