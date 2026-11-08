// V0.4.0 | 2026-11-07 第 188 棒：修「多行 import 全漏」（判据收紧，非放宽）。
//   由头：第 187 棒交接点名 111-128 行逐行套单行正则，跨行 `import {\n ... \n} from 'x'`
//   整条解析不到（本工作树只读普查：25 条跨行 named import，现行边集一条都没有）。
//   历史影响：modules/390-rewind-core.js 曾跨行 import player/505，在 modules 层形成反向边却未被抓，
//   当时 A 类只报 4 条；该文件现已搬到 ui/727（ui→player 属合法向下），故那段旧账不在当前代码上。
//   ★ 为什么先修判据而不是「先把翻出来的清干净再修」：漏报期间任何人新写一条跨行反向 import
//     都不会响；先清存量再修 = 把闸门继续关着修门。红是既有事实显形，不是修出来的。
//   改法：extractStaticDeps 由「逐行 split('\n') + ^ 单行正则」改成「全文 + gm 语句级正则」，
//   五种形态不变、RANK / A 类 / B 类 / 基线口径一字未改；按语句起点去重，行号仍取首行。
//   加两道自证：① extractSelfCheck 纯函数合成源码正负路径（--enforce 每轮必跑）；
//   ② selfCheck 增「跨行语句解析数」下限，防多行能力被悄悄删掉又退回「恒绿」。
//   ③ 负路径实证（第 188 棒）：向解析器注入 `crossLine:false` 与「named 正则退回单行」两种退化，
//      --enforce 分别报 2 条 / 4 条自证失败且 EXIT=1；恢复后 EXIT=0。
// tests/layer-direction-scan.mjs | V0.4.0 | 2026-11-07
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
// 设计约束（用户 2026-10-29 裁定，2026-10-31 升级为增量闸门）：
//   ① **默认报告模式**（不带参数即 --report）：只打印清单，退出码恒 0。
//      切 --enforce 才按「新增」判据退出 1。理由：一上来就红，团队第一反应是把规则关掉。
//   ② 不要求清零才拦截：当前已知问题登记进 tests/layer-direction-baseline.json，
//      --enforce 只拦**新增反向边 / 新增环 / 自证失败**，旧账可以逐条还。
//   ③ 基线 ID 不含行号：A 类用「from 文件 -> to 文件」，B 类用「整组环边集合」。
//      环只登记层对不够——往已有环里塞一条新边会被当成旧账放过去。
//   ④ 解析器自带 node 侧 fs 实现（tests/123static-scan.js 是浏览器 fetch + 白名单 SCAN_FILES，
//      不含 tools/，扫不出 player↔tools 那条）。本文件是**普查**，不是抽检。
//
// 退出码：--enforce 且存在新增 A/B 类问题或自证失败 → 1；否则 0。--json 输出机器可读结果。
// 维护：还清旧账后跑 --update-baseline 收缩基线；--no-baseline 可临时按全量判定。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripCommentsMapped } from './_lib/static-truth-slice.mjs';

export const VER = 'tests/layer-direction-scan.mjs V0.4.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const BASELINE_FILE = path.join(here, 'layer-direction-baseline.json');

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
    '304-audio-manager.js', // 音频播放：纯表现设施
    '303-error-capture.js', // 错误面板：诊断设施，零 import（归此仅为语义清晰）
    '332-career-log.js'    // 生涯记录运行时：本地存储读写设施，不属于英雄机制
]);

function layerOf(absFile) {
    const seg = path.relative(ROOT, absFile).split(path.sep).join('/').split('/');
    if (seg.length < 2) return null;
    if (seg[0] === 'modules') return MODULE_FACILITY.has(seg[1]) ? 'modules-facility' : 'modules-mechanic';
    return DIR_LAYER[seg[0]] || null;
}
const relOf = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');

// ---- 解析 ----
// 剥注释：**改用公共件唯一来源** stripCommentsMapped（第 157 轮收口）。
//   此处原先手写了一份 stripCommentsKeepLines（剥注释但保留 \n 以对齐行号），被
//   tests/_lib/static-truth-slice.mjs 的 auditStripCopies 判为「未登记的第二份」。
//   ★ 第二份的存在本身就是风险：公共件修了「正则字面量感知」，这份不会跟着修，
//     两边对同一份源码会剥出不同结果、结论静默分叉 —— 与本件正在查的依赖分叉是同一款病。
//   公共件同样**保行结构**（行注释与块注释里的换行逐个保留，见公共件 ⑥-a 注释），
//   故行号语义与旧手写版一致；额外多识别正则字面量，只会更准（不会把正则里的 // 当注释起点）。
//   收口后 auditStripCopies 会把它计入「已收口」（判据：剥注释后确有 import 公共件语句）。

// 静态依赖五形态：import{} / import x（可带 {}）/ import * as / import 'x' / export ... from
// V0.4.0：全文 gm 语句级解析。旧版逐行 split('\n') 后套 ^ 单行正则，
//   `import {\n  A,\n  B\n} from 'x'` 的四行没有一行能单独匹配任一形态 ⇒ 整条依赖凭空消失。
//   ★ 用 [ \t] 与 [ \t\r\n] 显式写空白，不用 \s：m 标志下 \s* 会吞掉前一行换行，
//     导致语句起点/行号漂移，还会把两条相邻语句粘成一条。
//   ★ [^}]* 本身匹配换行，故 named / default / re-export 三种花括号形态天然支持跨行。
//   ★ 同一语句可能被多个形态命中（如 `import Def, {C} from`），按起点排序后去重，
//     保留 patterns 里靠前的形态，等价旧版「一行只取第一个匹配」的语义。
function extractStaticDeps(code) {
    const clean = stripCommentsMapped(code).code;
    const patterns = [
        { re: /^[ \t]*import[ \t]*\{[^}]*\}[ \t\r\n]*from[ \t\r\n]*['"]([^'"]+)['"]/gm, kind: 'named' },
        { re: /^[ \t]*import[ \t\r\n]+\*[ \t\r\n]+as[ \t\r\n]+[\w$]+[ \t\r\n]*from[ \t\r\n]*['"]([^'"]+)['"]/gm, kind: 'namespace' },
        { re: /^[ \t]*import[ \t\r\n]+[\w$]+[ \t\r\n]*(?:,[ \t\r\n]*\{[^}]*\})?[ \t\r\n]*from[ \t\r\n]*['"]([^'"]+)['"]/gm, kind: 'default' },
        { re: /^[ \t]*import[ \t\r\n]*['"]([^'"]+)['"]/gm, kind: 'side-effect' },
        { re: /^[ \t]*export[ \t\r\n]*(?:\*|\{[^}]*\})[ \t\r\n]*from[ \t\r\n]*['"]([^'"]+)['"]/gm, kind: 're-export' }
    ];
    const found = [];
    patterns.forEach(({ re, kind }, prio) => {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(clean))) {
            found.push({
                spec: m[1], index: m.index, end: m.index + m[0].length,
                line: clean.slice(0, m.index).split('\n').length,
                crossLine: m[0].includes('\n'), kind, prio
            });
        }
    });
    found.sort((a, b) => a.index - b.index || a.prio - b.prio);
    const deps = [];
    let lastEnd = -1;
    for (const f of found) {
        if (f.index < lastEnd) continue;
        deps.push({ spec: f.spec, line: f.line, kind: f.kind, crossLine: f.crossLine });
        lastEnd = f.end;
    }
    return deps;
}

// 解析器自证（纯函数、与仓库内容无关，--enforce 每轮必跑）：
//   正路径 = 五种形态各解析一条、其中三条是跨行语句；负路径 = 注释里的 import 不被误判、
//   主牙 = 五形态归属 / 数量与顺序 / 跨行 3 条 / 行号取首行；注释误判是附加防线（防 ^ 锚被去掉）。
export function extractSelfCheck() {
    const issues = [];
    const sample = [
        "// import { bogus } from '../evil.js';",
        "import { A,",
        "         B } from '../infra/102-core-utils.js';",
        "import Def, { C,",
        "              D } from '../core/201-config-5v5-test.js';",
        "export { E,",
        "         F } from '../render/401-fact-renderer.js';",
        "import * as NS from '../fx/608-fx-manager.js';",
        "import '../ui/702-main-5v5-test.js';",
        ''
    ].join('\n');
    let deps;
    try { deps = extractStaticDeps(sample); }
    catch (e) { return [`解析器自证抛错：${e.message}`]; }
    const specs = deps.map(d => d.spec);
    const want = [
        '../infra/102-core-utils.js', '../core/201-config-5v5-test.js',
        '../render/401-fact-renderer.js', '../fx/608-fx-manager.js',
        '../ui/702-main-5v5-test.js'
    ];
    if (specs.length !== want.length || want.some((s, i) => specs[i] !== s)) {
        issues.push(`解析器自证失败：应解析 ${want.length} 条依赖且顺序一致，实得 ${JSON.stringify(specs)}`);
    }
    const cross = deps.filter(d => d.crossLine).length;
    if (cross !== 3) issues.push(`解析器自证失败：跨行语句应有 3 条，实得 ${cross}`);
    const kinds = deps.map(d => d.kind).join(','); if (kinds !== 'named,default,re-export,namespace,side-effect') issues.push(`解析器自证失败：五形态归属应为 named,default,re-export,namespace,side-effect，实得 ${kinds}`); if (specs.includes('../evil.js')) issues.push('解析器自证失败：注释里的 import 被误判为真实依赖');
    if (deps[0] && deps[0].line !== 2) issues.push(`解析器自证失败：首条跨行 import 行号应为 2，实得 ${deps[0].line}`);
    return issues;
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
                line: d.line, kind: d.kind, spec: d.spec, crossLine: !!d.crossLine
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

// ---- 存量基线 ----
// ID 必须与行号无关：同一文件里同一对 from→to 只算一条边。
// 环按「整组边集合」比对，避免往已有环里加一条新边被当成旧账。
function edgeId(e) { return `${e.from} -> ${e.to}`; }
function cycleKey(c) { return c.edges.map(edgeId).sort().join(' | '); }
function emptyBaseline() { return { version: 1, knownReverse: [], knownCycles: [] }; }

function loadBaseline(file) {
    if (!fs.existsSync(file)) return { data: emptyBaseline(), error: null, exists: false };
    try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        return {
            data: {
                version: raw.version || 1,
                knownReverse: Array.isArray(raw.knownReverse) ? raw.knownReverse.filter(x => typeof x === 'string') : [],
                knownCycles: Array.isArray(raw.knownCycles)
                    ? raw.knownCycles.filter(x => Array.isArray(x) && x.every(y => typeof y === 'string')).map(x => [...x].sort())
                    : []
            },
            error: null,
            exists: true
        };
    } catch (e) {
        return { data: emptyBaseline(), error: e.message, exists: true };
    }
}

function saveBaseline(file, rev, cycles) {
    const knownReverse = [...new Set(rev.map(edgeId))].sort();
    const knownCycles = [...new Set(cycles.map(cycleKey))]
        .map(k => k.split(' | ').sort())
        .sort((a, b) => a.join('|').localeCompare(b.join('|')));
    const out = {
        version: 1,
        note: '分层依赖扫描的存量基线：只登记本文件生成时已知的 A 类反向边与 B 类环。新增问题由 tests/layer-direction-scan.mjs --enforce 拦截；还清旧账后用 --update-baseline 收缩本文件。边 ID 不含行号，避免改代码行数就失效。',
        knownReverse,
        knownCycles
    };
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n', 'utf8');
    return out;
}

function diffAgainstBaseline(rev, cycles, baseline) {
    const knownRev = new Set(baseline.knownReverse || []);
    const currentRev = new Set(rev.map(edgeId));
    const knownCycleKeys = new Set((baseline.knownCycles || []).map(ids => [...ids].sort().join(' | ')));
    const currentCycleKeys = new Set(cycles.map(cycleKey));
    return {
        newReverse: rev.filter(e => !knownRev.has(edgeId(e))),
        newCycles: cycles.filter(c => !knownCycleKeys.has(cycleKey(c))),
        staleReverse: [...knownRev].filter(id => !currentRev.has(id)),
        staleCycles: [...knownCycleKeys].filter(k => !currentCycleKeys.has(k))
    };
}

// ---- 反向引用查询（搬家依据）----
// 与方向检查共用同一解析器，但输出「谁引用了我」，覆盖三类引用点：
//   ① JS static import / re-export（相对路径解析后比对绝对路径）
//   ② HTML 的 <script src> / <link href>（条带 query string，如 721-perf-panel.js?v=3.5.1）
//   ③ tools/806-ai-pack-config.js 的 ALL_PROJECT_FILES 清单条目（字符串形式，非 import）
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

    const manifest = path.join(ROOT, 'tools/806-ai-pack-config.js');
    if (fs.existsSync(manifest)) {
        fs.readFileSync(manifest, 'utf8').split('\n').forEach((ln, i) => {
            if (ln.includes(stem)) hits.manifest.push({ file: 'tools/806-ai-pack-config.js', line: i + 1, text: ln.trim() });
        });
    }
    return hits;
}

// 自证断言：防扫描器自身腐烂后「恒 0 条」被当成干净（项目里 123static-scan 同样有这道）。// 三条下限依据 2026-10-29 实测（257 文件 / 901 边 / 10 个层有名），留足一半余量，
// 避免正常增删文件就误报；但解析器正则写坏、路径拼错、目录被跳过时必然击穿。
export function selfCheck(files, edges, cell, crossLineCount) {
    // V0.4.0：解析器纯函数自证必须每轮跑，否则「多行解析被删掉」会安静退回恒绿。
    const issues = extractSelfCheck();
    if (files.length < 150) issues.push(`只扫到 ${files.length} 个文件（下限 150）—— 目录遍历或层映射已腐烂`);
    if (edges.length < 450) issues.push(`只解析到 ${edges.length} 条边（下限 450）—— import 解析器已腐烂，A/B 类恒 0 条与不跑同形`);
    const pairCount = Object.keys(cell).filter(k => !k.endsWith(k.split('→')[0])).length;
    if (pairCount < 6) issues.push(`跨层边对只识别到 ${pairCount} 组（下限 6）—— 层映射失效`);
    // 三条下限都只防「恒 0」，防不住「只漏多行」：本次漏洞正是 1056 条边全绿却漏 25 条语句。
    if (!(crossLineCount > 0)) issues.push('跨行 import 语句解析到 0 条 —— 多行解析能力已腐烂（V0.3.0 漏报时的形态）');
    return issues;
}

// ---- CLI ----
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
    const enforce = process.argv.includes('--enforce');
    const asJson = process.argv.includes('--json');
    const updateBaseline = process.argv.includes('--update-baseline');
    const noBaseline = process.argv.includes('--no-baseline');

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
    const crossLineCount = edges.filter(e => e.crossLine).length;
    const selfIssues = selfCheck(files, edges, cell, crossLineCount);

    const baselineLoad = noBaseline
        ? { data: emptyBaseline(), error: null, exists: false }
        : loadBaseline(BASELINE_FILE);
    const baseline = baselineLoad.data;
    const diff = diffAgainstBaseline(rev, cycles, baseline);
    const baselineIssues = baselineLoad.error
        ? [`基线文件无法解析（${path.basename(BASELINE_FILE)}）：${baselineLoad.error}`]
        : [];

    if (updateBaseline) {
        if (selfIssues.length) {
            console.log('拒绝写基线：自证断言未通过，当前扫描结果不可信');
            for (const s of selfIssues) console.log('  ✗ ' + s);
            process.exit(1);
        }
        const saved = saveBaseline(BASELINE_FILE, rev, cycles);
        console.log(`已写入基线 ${path.relative(ROOT, BASELINE_FILE)}：反向 ${saved.knownReverse.length} 条 / 环 ${saved.knownCycles.length} 组`);
        process.exit(0);
    }

    // 自证失败、基线损坏都算「闸门 itself 不可信」；--enforce 下必须红。
    const hasProblem = diff.newReverse.length || diff.newCycles.length || selfIssues.length || baselineIssues.length;

    if (asJson) {
        console.log(JSON.stringify({
            ver: VER,
            files: files.length,
            crossLineImports: crossLineCount,
            edges,
            reverse: rev,
            cycles,
            selfIssues,
            unresolved,
            baseline: {
                file: noBaseline ? null : path.relative(ROOT, BASELINE_FILE),
                loaded: !noBaseline && baselineLoad.exists && !baselineLoad.error,
                knownReverse: baseline.knownReverse.length,
                knownCycles: baseline.knownCycles.length,
                newReverse: diff.newReverse.length,
                newCycles: diff.newCycles.length,
                staleReverse: diff.staleReverse,
                staleCycles: diff.staleCycles,
                error: baselineLoad.error
            }
        }, null, 2));
    } else {
        const order = ['infra', 'core', 'modules-mechanic', 'modules-facility', 'render', 'player', 'ui', 'fx', 'tools', 'tests', 'scripts'];
        const ABBR = { infra: 'inf', core: 'cor', 'modules-mechanic': 'mec', 'modules-facility': 'fac', render: 'ren', player: 'ply', ui: 'ui', fx: 'fx', tools: 'tol', tests: 'tst', scripts: 'scr' };
        const W = 6;

        console.log('=== ' + VER + ' ===');
        console.log(`扫描 ${files.length} 文件 / 静态依赖边 ${edges.length} 条（其中跨行 import ${crossLineCount} 条）/ 未解析路径 ${unresolved.length} 条`);
        console.log('判据真源：09 架构铁律 第6条 + 03 架构终态蓝图 原则6（ui/fx → player → render/modules → core → infra，无环无反向）');
        console.log(noBaseline
            ? '基线：已禁用（--no-baseline，按全量判定）'
            : `基线：${path.relative(ROOT, BASELINE_FILE)}（${baselineLoad.exists ? (baselineLoad.error ? '解析失败' : `存量反向 ${baseline.knownReverse.length} / 环 ${baseline.knownCycles.length}`) : '不存在，按全量判定'}）`);

        console.log('\n=== 层间依赖矩阵（行 import 列）===');
        for (const a of order) {
            const total = order.reduce((s, b) => s + (cell[a + '→' + b] || 0), 0);
            if (!total) continue;
            const row = order.map(b => (cell[a + '→' + b] ? String(cell[a + '→' + b]) : '·').padStart(W));
            console.log(a.padEnd(18) + row.join('') + '  | ' + total);
        }
        console.log(''.padEnd(18) + order.map(b => ABBR[b].padStart(W)).join(''));

        console.log(`\n=== A 类：反向依赖（下层 import 上层 / 链内读工具）共 ${rev.length} 条（存量 ${rev.length - diff.newReverse.length} / 新增 ${diff.newReverse.length}）===`);
        if (!rev.length) console.log('  （无）');
        const newRevIds = new Set(diff.newReverse.map(edgeId));
        for (const v of rev) {
            const mark = newRevIds.has(edgeId(v)) ? '[新增]' : '[存量]';
            console.log(`  ${mark} ${v.from}:${v.line}  →  ${v.to}   [${v.why}]`);
        }

        console.log(`\n=== B 类：层级循环依赖 共 ${cycles.length} 组（存量 ${cycles.length - diff.newCycles.length} / 新增 ${diff.newCycles.length}）===`);
        if (!cycles.length) console.log('  （无）');
        const newCycleKeys = new Set(diff.newCycles.map(cycleKey));
        for (const c of cycles) {
            const mark = newCycleKeys.has(cycleKey(c)) ? '[新增]' : '[存量]';
            console.log(`  ${mark} [${c.layers.join(' ↔ ')}] 环上共 ${c.edges.length} 条边`);
            for (const e of c.edges) console.log(`    ${e.from}:${e.line}  →  ${e.to}`);
        }

        if (unresolved.length) {
            console.log(`\n=== 未解析路径 ${unresolved.length} 条（断链或动态拼接；断链另见 123static-scan 第2类）===`);
            for (const u of unresolved) console.log(`  ${u.from}:${u.line}  →  ${u.spec}`);
        }

        if (diff.staleReverse.length || diff.staleCycles.length) {
            console.log('\n=== 基线陈旧（代码里已不存在，建议 --update-baseline 收缩）===');
            for (const id of diff.staleReverse) console.log(`  - 反向：${id}`);
            for (const k of diff.staleCycles) console.log(`  - 环：${k}`);
        }

        console.log(`\n=== 自证断言 共 ${selfIssues.length + baselineIssues.length} 条 ===`);
        if (!selfIssues.length && !baselineIssues.length) console.log('  （通过：解析器五形态/跨行能力、文件数/边数/跨层边对均在下限之上，基线可解析）');
        for (const s of selfIssues) console.log('  ✗ ' + s);
        for (const s of baselineIssues) console.log('  ✗ ' + s);

        console.log(enforce
            ? `\n模式：ENFORCE（只拦新增：反向 ${diff.newReverse.length} 条 / 环 ${diff.newCycles.length} 组；自证或基线损坏也红）`
            : '\n模式：REPORT（只报不拦，退出码 0）—— 新增问题为 0 后切 --enforce');
    }
    if (enforce && hasProblem) process.exit(1);
}
