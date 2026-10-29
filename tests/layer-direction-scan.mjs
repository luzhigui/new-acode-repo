// tests/layer-direction-scan.mjs | V0.2.0-draft | 2026-10-29
// 职责：分层依赖方向扫描。把仓库所有 JS 的 static import / re-export 解析成「层 → 层」的边，
//   按**既有架构铁律**判定，输出 ① 实测量矩阵 ② 反向依赖 ③ 层级循环依赖 ④ 合法但值得记录的隔层直连。
//
// 【真源声明】本文件的层序不另立门户，全部来自现有两份 SSOT：
//   · `文件汇总20260730/12 协议与准则/09 架构铁律12条.md` 第 6 条：
//       ui/fx → player → render/modules → core → infra；禁止反向 import，禁止 window 桥。
//   · `03 架构终态蓝图.md` 原则 6：同一条链，「无环、无反向」。
//   本文件只是把那条铁律**机器可执行化**（rank 表 + 环检测）。若哪天铁律改了，改 RANK 一处即可。
//
// 为什么不能写成「core 不得 import 上层」一条（用户 2026-10-29 裁定）：
//   那样只能抓一条边，抓不到 render↔fx、player↔tools 这类**双向环**——环里每一条单看都可能朝下。
//
// 两类判据（分开报，别混成一句「越界」）：
//   A 反向依赖：下层 import 上层（rank(from) > rank(to)）⇒ 明确违规。
//   B 循环依赖：层图上的强连通分量（SCC）含 ≥2 层 ⇒ 成环。ESM 成环会踩「求值顺序 → 拿到 undefined」，
//     即使每条边单看都朝下，也必须拆（这也是 03 原则 6「无环」的落地判据）。
//
// 设计约束（用户 2026-10-29 裁定）：
//   ① **默认报告模式**（不带参数即 --report）：只打印清单，退出码恒 0。
//      切 --enforce 才按判据退出 1。理由：一上来就红，团队第一反应是把规则关掉。
//   ② 先出全量清单当基线，清零再切拦截。
//   ③ 解析器自带 node 侧 fs 实现（tests/123static-scan.js 是浏览器 fetch + 白名单 SCAN_FILES，
//      不含 tools/，扫不出 player↔tools 那条）。本文件是**普查**，不是抽检。
//
// 退出码：--enforce 且有 A/B 类问题 → 1；否则 0。--json 输出机器可读结果。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VER = 'tests/layer-direction-scan.mjs V0.2.0-draft';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

// ---- 层序（rank 越小越底层；依赖只允许指向更小 rank）----
// 与铁律第 6 条逐段对应：
//   infra(0) ← core(1) ← modules(2) ← render(3) ← player(4) ← ui/fx(5)
//   ui 与 fx 在铁律里并列最高层，故同 rank：互相依赖不成环风险由 B 类单独判。
//   tools(6) 不在依赖链上（离线工具/打包器），是「链外旁支」：它可以读全仓，但链内任何层不得读它。
//   tests/scripts(9) 是观察者：可读全仓，不参与判定。
const RANK = {
    infra: 0,
    core: 1,
    'modules-mechanic': 2,
    'modules-facility': 2,
    render: 3,
    player: 4,
    ui: 5,
    fx: 5,
    tools: 6,
    tests: 9,
    scripts: 9
};

const OBSERVER = 9;
const CHAIN_OUT = 6; // tools

const RANK_NOTE = {
    infra: '地基：不依赖任何层',
    core: '引擎：只依赖 infra（不认具体英雄/表现）',
    'modules-mechanic': '机制：可依赖 core',
    'modules-facility': '表现设施（如音频）：与机制同 rank，被表现层依赖是合法的向下',
    render: '渲染：可读 core/modules 的纯函数与枚举；不得依赖 fx/player/ui',
    player: '播放器：可编排 render/fx；不得依赖 ui/tools',
    ui: 'UI：薄外壳，最高层之一',
    fx: '特效：最高层之一（与 ui 并列），可读 render 等下层',
    tools: '离线工具/打包器：链外旁支，可读全仓；链内不得依赖它',
    tests: '体检：观察者，豁免',
    scripts: '脚本：观察者，豁免'
};

const DIR_LAYER = {
    infra: 'infra', core: 'core', render: 'render', player: 'player',
    fx: 'fx', ui: 'ui', tools: 'tools', tests: 'tests', scripts: 'scripts'
};

// modules/ 内部二分。**不影响 rank**（两者都是 2），只用于语义清点与「表现层依赖设施」的可读性：
//   混居同一目录会让「render → modules」看起来像越界，实际只是设施住在机制目录里。
const MODULE_FACILITY = new Set([
    '22audio-manager.js', // 音频播放：纯表现设施
    '21error-capture.js'  // 错误面板：诊断设施，零 import（归此仅为语义清晰）
]);

function layerOf(absFile) {
    const seg = path.relative(ROOT, absFile).split(path.sep).join('/').split('/');
    if (seg.length < 2) return null;
    if (seg[0] === 'modules') return MODULE_FACILITY.has(seg[1]) ? 'modules-facility' : 'modules-mechanic';
    return DIR_LAYER[seg[0]] || null;
}
const relOf = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');

// ---- 解析 ----
// 剥注释但保留 \n，使 match 行号可直接换算（不用 index→line 反查）。
function stripCommentsKeepLines(code) {
    let out = '', i = 0, quote = null;
    while (i < code.length) {
        const c = code[i], next = code[i + 1];
        if (quote) {
            out += c;
            if (c === '\\') { out += code[i + 1] || ''; i += 2; continue; }
            if (c === quote) quote = null;
            i++; continue;
        }
        if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i++; continue; }
        if (c === '/' && next === '/') {
            while (i < code.length && code[i] !== '\n') { out += ' '; i++; }
            continue;
        }
        if (c === '/' && next === '*') {
            while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
                out += code[i] === '\n' ? '\n' : ' '; i++;
            }
            out += '  '; i += 2; continue;
        }
        out += c; i++;
    }
    return out;
}

// 静态依赖四形态：import{} / import x / import * as / import 'x' / export ... from
function extractStaticDeps(code) {
    const clean = stripCommentsKeepLines(code);
    const patterns = [
        { re: /^\s*import\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/, kind: 'named' },
        { re: /^\s*import\s+\*\s+as\s+[\w$]+\s+from\s*['"]([^'"]+)['"]/, kind: 'namespace' },
        { re: /^\s*import\s+[\w$]+\s*(?:,\s*\{[^}]*\})?\s*from\s*['"]([^'"]+)['"]/, kind: 'default' },
        { re: /^\s*import\s*['"]([^'"]+)['"]/, kind: 'side-effect' },
        { re: /^\s*export\s*(?:\*|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/, kind: 're-export' }
    ];
    const deps = [];
    clean.split('\n').forEach((ln, idx) => {
        for (const { re, kind } of patterns) {
            const m = re.exec(ln);
            if (m) { deps.push({ spec: m[1], line: idx + 1, kind }); break; }
        }
    });
    return deps;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', '展示与CG', '文件汇总20260730', '.workbuddy', 'assets', 'docs']);

function walk(dir, acc) {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
    for (const e of ents) {
        if (e.isDirectory()) {
            if (SKIP_DIRS.has(e.name)) continue;
            // 点目录一律跳过：tests/.mut/ 是变异体检的沙箱副本（每轮几十份整仓拷贝，
            //   且其 import 是刻意制造断裂的），扫进去会灌进 4 万条假边淹没真实边。
            if (e.name.startsWith('.')) continue;
            walk(path.join(dir, e.name), acc);
        } else if (/\.(js|mjs)$/.test(e.name)) {
            acc.push(path.join(dir, e.name));
        }
    }
    return acc;
}

export function collect() {
    const files = walk(ROOT, []).filter(f => !!layerOf(f));
    const edges = [];
    const unresolved = [];
    for (const f of files) {
        const fromLayer = layerOf(f);
        let code;
        try { code = fs.readFileSync(f, 'utf8'); } catch { continue; }
        for (const d of extractStaticDeps(code)) {
            if (!d.spec.startsWith('.')) continue;
            const targetAbs = path.resolve(path.dirname(f), d.spec);
            if (!fs.existsSync(targetAbs)) {
                unresolved.push({ from: relOf(f), line: d.line, spec: d.spec });
                continue;
            }
            const toLayer = layerOf(targetAbs);
            if (!toLayer) continue;
            edges.push({
                from: relOf(f), fromLayer, to: relOf(targetAbs), toLayer,
                line: d.line, kind: d.kind, spec: d.spec
            });
        }
    }
    return { files, edges, unresolved };
}

// A 类：反向依赖
export function judgeReverse(edges) {
    const out = [];
    for (const e of edges) {
        if (e.fromLayer === e.toLayer) continue;
        const rf = RANK[e.fromLayer], rt = RANK[e.toLayer];
        if (rf === OBSERVER) continue;                 // 观察者豁免
        if (rt === CHAIN_OUT && rf !== CHAIN_OUT) {    // 链内依赖链外工具
            out.push({ ...e, why: '链内层依赖链外工具 tools（工具可读全仓，反向不可）' });
            continue;
        }
        if (rf > rt && rt !== CHAIN_OUT) continue;     // 合法：上层读下层（rank 大 → rank 小）
        if (rf < rt) {                                  // 下层指向更高层 = 反向
            out.push({ ...e, why: `反向：${e.fromLayer}(rank ${rf}) → ${e.toLayer}(rank ${rt})` });
        }
    }
    return out;
}

// B 类：层级强连通分量（Tarjan），只报含 ≥2 层的 SCC
export function findLayerCycles(edges) {
    const adj = {};
    for (const e of edges) {
        if (e.fromLayer === e.toLayer) continue;
        if (RANK[e.fromLayer] === OBSERVER || RANK[e.toLayer] === OBSERVER) continue;
        (adj[e.fromLayer] = adj[e.fromLayer] || new Set()).add(e.toLayer);
    }
    const nodes = Object.keys(RANK).filter(l => RANK[l] !== OBSERVER);
    for (const e of edges) {
        if (!(e.fromLayer in adj)) adj[e.fromLayer] = adj[e.fromLayer] || new Set();
    }
    let index = 0;
    const idx = {}, low = {}, onStack = {}, stack = [], sccs = [];
    const strong = (v) => {
        idx[v] = low[v] = index++;
        stack.push(v); onStack[v] = true;
        for (const w of (adj[v] || [])) {
            if (idx[w] === undefined) { strong(w); low[v] = Math.min(low[v], low[w]); }
            else if (onStack[w]) { low[v] = Math.min(low[v], idx[w]); }
        }
        if (low[v] === idx[v]) {
            const comp = [];
            let w;
            do { w = stack.pop(); onStack[w] = false; comp.push(w); } while (w !== v);
            if (comp.length > 1) sccs.push(comp.sort());
        }
    };
    for (const n of nodes) if (idx[n] === undefined) strong(n);
    // 每组的实际边（说明环怎么走）
    return sccs.map(comp => {
        const set = new Set(comp);
        const inner = edges.filter(e => set.has(e.fromLayer) && set.has(e.toLayer) && e.fromLayer !== e.toLayer);
        return { layers: comp, edges: inner };
    });
}

function matrix(edges) {
    const cell = {};
    for (const e of edges) {
        const k = e.fromLayer + '→' + e.toLayer;
        cell[k] = (cell[k] || 0) + 1;
    }
    return cell;
}

// ---- 反向引用查询（搬家依据）----
// 与方向检查共用同一解析器，但输出「谁引用了我」，覆盖三类引用点：
//   ① JS static import / re-export（相对路径解析后比对绝对路径）
//   ② HTML 的 <script src> / <link href>（条带 query string，如 80perf-panel.js?v=3.5.1）
//   ③ tools/106-ai-pack-config.js 的 ALL_PROJECT_FILES 清单条目（字符串形式，非 import）
// 为什么必须三类齐全：2026-10-29 实测 ui/79 只有 ①类引用，ui/80 只有 ②③类引用——
//   只做 import 反查会漏掉入口脚本，搬家时正是这类漏项导致线上白屏。
export function findRefs(targetRel) {
    const targetAbs = path.resolve(ROOT, targetRel);
    const hits = { imports: [], html: [], manifest: [] };

    const jsFiles = walk(ROOT, []).filter(f => !!layerOf(f));
    for (const f of jsFiles) {
        let code;
        try { code = fs.readFileSync(f, 'utf8'); } catch { continue; }
        for (const d of extractStaticDeps(code)) {
            if (!d.spec.startsWith('.')) continue;
            if (path.resolve(path.dirname(f), d.spec) === targetAbs) {
                hits.imports.push({ file: relOf(f), line: d.line, kind: d.kind });
            }
        }
    }

    const htmlFiles = [];
    const walkHtml = (dir) => {
        let ents;
        try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (e.isDirectory()) {
                if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
                walkHtml(path.join(dir, e.name));
            } else if (/\.html?$/.test(e.name)) htmlFiles.push(path.join(dir, e.name));
        }
    };
    walkHtml(ROOT);
    const stem = targetRel.split('/').pop();
    for (const f of htmlFiles) {
        let text;
        try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
        text.split('\n').forEach((ln, i) => {
            const clean = ln.replace(/\?[^"']*/g, ''); // 剥 ?v= 缓存串
            if (clean.includes(stem)) hits.html.push({ file: relOf(f), line: i + 1, text: ln.trim().slice(0, 120) });
        });
    }

    const manifest = path.join(ROOT, 'tools/106-ai-pack-config.js');
    if (fs.existsSync(manifest)) {
        fs.readFileSync(manifest, 'utf8').split('\n').forEach((ln, i) => {
            if (ln.includes(stem)) hits.manifest.push({ file: 'tools/106-ai-pack-config.js', line: i + 1, text: ln.trim() });
        });
    }
    return hits;
}

// 自证断言：防扫描器自身腐烂后「恒 0 条」被当成干净（项目里 123static-scan 同样有这道）。// 三条下限依据 2026-10-29 实测（257 文件 / 901 边 / 10 个层有名），留足一半余量，
// 避免正常增删文件就误报；但解析器正则写坏、路径拼错、目录被跳过时必然击穿。
export function selfCheck(files, edges, cell) {
    const issues = [];
    if (files.length < 150) issues.push(`只扫到 ${files.length} 个文件（下限 150）—— 目录遍历或层映射已腐烂`);
    if (edges.length < 450) issues.push(`只解析到 ${edges.length} 条边（下限 450）—— import 解析器已腐烂，A/B 类恒 0 条与不跑同形`);
    const pairCount = Object.keys(cell).filter(k => !k.endsWith(k.split('→')[0])).length;
    if (pairCount < 6) issues.push(`跨层边对只识别到 ${pairCount} 组（下限 6）—— 层映射失效`);
    return issues;
}

// ---- CLI ----
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
    const enforce = process.argv.includes('--enforce');
    const asJson = process.argv.includes('--json');

    // --refs <相对路径>：反向引用查询（搬家前必跑）。与方向判定互斥，查完即退出。
    const refsIdx = process.argv.indexOf('--refs');
    if (refsIdx > 0 && process.argv[refsIdx + 1]) {
        const target = process.argv[refsIdx + 1].replace(/^\.\//, '');
        const h = findRefs(target);
        if (asJson) {
            console.log(JSON.stringify({ target, ...h }, null, 2));
        } else {
            console.log(`=== 反向引用：${target} ===`);
            console.log(`  JS import / re-export：${h.imports.length} 处`);
            for (const x of h.imports) console.log(`    ${x.file}:${x.line}  (${x.kind})`);
            console.log(`  HTML <script>/<link>：${h.html.length} 处`);
            for (const x of h.html) console.log(`    ${x.file}:${x.line}  ${x.text}`);
            console.log(`  tools/106 打包清单：${h.manifest.length} 处`);
            for (const x of h.manifest) console.log(`    ${x.file}:${x.line}  ${x.text}`);
            console.log(`  ── 合计 ${h.imports.length + h.html.length + h.manifest.length} 处引用点`);
            console.log('  注：三类都要改，漏 HTML 入口 = 线上白屏，漏 106 = AI 包缺文件。');
        }
        process.exit(0);
    }

    const { files, edges, unresolved } = collect();
    const rev = judgeReverse(edges);
    const cycles = findLayerCycles(edges);
    const cell = matrix(edges);
    const selfIssues = selfCheck(files, edges, cell);
    // 自证失败时把结论污染成「有问题」，避免腐烂后静默变绿
    const hasProblem = rev.length || cycles.length || selfIssues.length;

    if (asJson) {
        console.log(JSON.stringify({ ver: VER, files: files.length, edges, reverse: rev, cycles, selfIssues, unresolved }, null, 2));
    } else {
        const order = ['infra', 'core', 'modules-mechanic', 'modules-facility', 'render', 'player', 'ui', 'fx', 'tools', 'tests', 'scripts'];
        const ABBR = { infra: 'inf', core: 'cor', 'modules-mechanic': 'mec', 'modules-facility': 'fac', render: 'ren', player: 'ply', ui: 'ui', fx: 'fx', tools: 'tol', tests: 'tst', scripts: 'scr' };
        const W = 6;

        console.log('=== ' + VER + ' ===');
        console.log(`扫描 ${files.length} 文件 / 静态依赖边 ${edges.length} 条 / 未解析路径 ${unresolved.length} 条`);
        console.log('判据真源：09 架构铁律 第6条 + 03 架构终态蓝图 原则6（ui/fx → player → render/modules → core → infra，无环无反向）');

        console.log('\n=== 层间依赖矩阵（行 import 列）===');
        for (const a of order) {
            const total = order.reduce((s, b) => s + (cell[a + '→' + b] || 0), 0);
            if (!total) continue;
            const row = order.map(b => (cell[a + '→' + b] ? String(cell[a + '→' + b]) : '·').padStart(W));
            console.log(a.padEnd(18) + row.join('') + '  | ' + total);
        }
        console.log(''.padEnd(18) + order.map(b => ABBR[b].padStart(W)).join(''));

        console.log(`\n=== A 类：反向依赖（下层 import 上层 / 链内读工具）共 ${rev.length} 条 ===`);
        if (!rev.length) console.log('  （无）');
        for (const v of rev) console.log(`  ${v.from}:${v.line}  →  ${v.to}   [${v.why}]`);

        console.log(`\n=== B 类：层级循环依赖 共 ${cycles.length} 组 ===`);
        if (!cycles.length) console.log('  （无）');
        for (const c of cycles) {
            console.log(`  [${c.layers.join(' ↔ ')}] 环上共 ${c.edges.length} 条边`);
            for (const e of c.edges) console.log(`    ${e.from}:${e.line}  →  ${e.to}`);
        }

        if (unresolved.length) {
            console.log(`\n=== 未解析路径 ${unresolved.length} 条（断链或动态拼接；断链另见 123static-scan 第2类）===`);
            for (const u of unresolved) console.log(`  ${u.from}:${u.line}  →  ${u.spec}`);
        }

        console.log(`\n=== 自证断言 共 ${selfIssues.length} 条 ===`);
        if (!selfIssues.length) console.log('  （通过：文件数/边数/跨层边对均在下限之上）');
        for (const s of selfIssues) console.log('  ✗ ' + s);

        console.log(enforce
            ? '\n模式：ENFORCE（A/B 类或自证失败即退出码 1）'
            : '\n模式：REPORT（只报不拦，退出码 0）—— 清单清零后再切 --enforce');
    }
    if (enforce && hasProblem) process.exit(1);
}
