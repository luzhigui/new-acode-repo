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
//   ④ 运行期抽签次数快照（V1.2.0 新增）：静态次数抓不到「同一处代码运行时多抽了几次」——
//      重抽（抽到不合规再抽一次）、换签（把一次抽签拆成两次）、循环次数变化都属于这类：
//      源码里的 .next( 个数一个没变，随机序列却整体位移。这里给 SeededRNG.next() 挂计数器，
//      记录每个 seed:stage 一场战斗**实际抽了多少个数**，与 tests/rng-draw-runtime-baseline.json 比对。
//      次数不等 = 该场随机序列位移 ⇒ 必须解释清楚是哪个机制多抽/少抽（REGEN_DRAW=1 重录）。
//
// 用法：node tests/rng-discipline-check.mjs           # 校验，退 0 = 全过
//       REGEN=1 node tests/rng-discipline-check.mjs   # 确认是有意改动后，重录抽签点基线
//       REGEN_DRAW=1 node tests/rng-discipline-check.mjs  # 确认运行期抽签次数变化可接受后，重录运行期基线
//       SEEDS=1,2 STAGES=1,3 node tests/rng-discipline-check.mjs
//
// V1.2.0 | 2026-11-08 第 195 轮（回合时序与抽签域）：新增 ④ 运行期抽签次数基线。
//
// V1.1.0 | 2026-11-08 第 191 轮：③ 不再是「一行报红让人猜」。差异会按『新增文件/删除文件/次数增加/次数减少』
//   分类逐文件列出（含差值、该文件最近改动时刻），并按影响面给出下一步该跑什么：
//     次数减少 ⇒ 最危险（少抽一个数，之后所有随机序列整体位移），先查是不是删了抽签语句；
//     core/ 公共文件变化 ⇒ 影响所有战斗；modules/26x 单角色文件 ⇒ 只影响该角色出手。
//   REGEN 重录时会打印「本次重录的增删清单」，避免有人悄悄把基线刷绿。
export const VER = 'tests/rng-discipline-check.mjs V1.2.0';

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

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
    console.log(`③ 已重录抽签点基线：${totalDraws} 处（${Object.keys(counts).length} 个文件）→ tests/rng-draw-baseline.json`);
    console.log(changed.length
        ? `   本次重录的差异（请写进提交说明/迭代日志，别人才能看出随机序列动过）：${changed.join('；')}`
        : '   本次重录与旧基线完全一致（属于空重录）。');
} else if (!existsSync(BASELINE_FILE)) {
    fail('没有抽签点基线文件 tests/rng-draw-baseline.json；首次建立请跑：REGEN=1 node tests/rng-discipline-check.mjs');
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
        console.log(`③ 抽签点次数与基线一致：${totalDraws} 处（${Object.keys(counts).length} 个文件）`);
    } else {
        // 分类：删抽签最危险（少抽一个数 = 之后所有随机序列整体位移）；新增次之；整文件增删单独标
        const added = rows.filter(r => r.was === 0 && r.now > 0);
        const removed = rows.filter(r => r.now === 0 && r.was > 0);
        const down = rows.filter(r => r.was > 0 && r.now > 0 && r.delta < 0);
        const up = rows.filter(r => r.was > 0 && r.now > 0 && r.delta > 0);
        fail(rows.length === 0
            ? `抽签点总数变了（基线里的分文件数无差异，疑似手改过基线）：${base.total} → ${totalDraws}`
            : `抽签点次数变了（共 ${rows.length} 个文件${base.total != null ? `，总数 ${base.total} → ${totalDraws}` : ''}）—— 随机序列会整体位移，基线/胜负会漂移`);
        const dump = (title, list) => {
            if (!list.length) return;
            console.log(`   ${title}：`);
            for (const r of list) {
                console.log(`     • ${r.name}：${r.was} → ${r.now}（${r.delta > 0 ? '+' : ''}${r.delta}）${mtimeHint(r.name)} ⇒ ${impactOf(r.name)}`);
            }
        };
        dump('【危险】抽签点减少（少抽数 ⇒ 之后每一步抽签序号都前移）', down);
        dump('【危险】整文件抽签点消失', removed);
        dump('抽签点增加（多抽数 ⇒ 之后每一步抽签序号都后移）', up);
        dump('新增文件带抽签点', added);
        console.log('   下一步（按顺序，不要跳过）：');
        console.log('     1) 对照上面标「刚刚/几分钟前改过」的文件，先确认这次改动是不是只改文案/重命名/挪位置 —— 是的话数不该变，回头找误删/误加的抽签语句；');
        console.log('     2) 若确实有意改了抽签次数，跑 node tests/rules-replay.mjs，看哪些规则开始漂红（漂的就是被随机序列影响的面）；');
        console.log('     3) 确认漂移可接受后：REGEN=1 node tests/rng-discipline-check.mjs 重录基线，把 tests/rng-draw-baseline.json 和代码改动一起提交；');
        console.log('     4) 再跑一遍本命令，应转 PASS；同一次提交里没带基线文件 = 别人拉下来必红。');
    }
}

// ④ 运行期抽签次数快照
//   静态 ③ 只能看到「源码里有几个 .next(」，看不到运行时「同一处代码抽了几次」。
//   重抽（抽到不合规再抽一次）/ 换签（一次抽签拆成两次）/ 循环次数变化，都属于源码不变、序列位移的改动。
const regenDraw = String(process.env.REGEN_DRAW || '') === '1';
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
    console.log(`④ 已重录运行期抽签次数基线：${caseKeys.length} 场 / 共 ${totalRuntimeDraws} 次 → tests/rng-draw-runtime-baseline.json`);
    console.log(changed.length ? `   本次重录的差异（请写进提交说明）：${changed.join('；')}` : '   本次重录与旧基线完全一致（空重录）。');
} else if (!existsSync(RUNTIME_BASELINE_FILE)) {
    fail('没有运行期抽签次数基线 tests/rng-draw-runtime-baseline.json；首次建立请跑：REGEN_DRAW=1 node tests/rng-discipline-check.mjs');
} else {
    const base = JSON.parse(readFileSync(RUNTIME_BASELINE_FILE, 'utf8'));
    const baseCases = base.cases || {};
    const rows = [];
    for (const k of new Set([...Object.keys(baseCases), ...caseKeys])) {
        const was = baseCases[k], now = drawCases[k];
        if (was !== now) rows.push({ k, was, now, delta: (now || 0) - (was || 0) });
    }
    if (rows.length === 0) {
        console.log(`④ 运行期抽签次数与基线一致：${caseKeys.length} 场 / 共 ${totalRuntimeDraws} 次`);
    } else {
        fail(`运行期抽签次数变了（${rows.length} 场）—— 随机序列位移，必须解释是哪个机制重抽/换签/多抽`);
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
