// tests/layer-direction-scan.mjs | V0.1.0-draft | 2026-10-29
// 职责：分层依赖方向扫描。把仓库所有 JS 的 static import / re-export 解析成「层 → 层」的边，
//   输出 ① 实测量矩阵 ② 越界边明细（文件 + 行号 + 原文）。
//
// 为什么要有它（2026-10-28 评估轮的实证）：
//   `core/` 不依赖上层只是**自觉**，仓库里真实存在 render↔fx 双向环、player↔tools 双向环、
//   render→modules(表现设施) 等越界边。靠 review 守不住（上一轮凭感觉就漏扫了 tools→player）。
//
// 设计约束（按用户 2026-10-29 裁定）：
//   ① **默认报告模式**（--report，且为默认）：只打印清单，退出码恒 0。
//      切 --enforce 才按策略报错退出 1。理由：一上来就红，团队第一反应是把规则关掉。
//   ② 规则不是「core 不得 import 上层」一条，而是**分层矩阵**：每层声明 allowed 目标层，逐格判定。
//      矩阵是 DRAFT（草稿），改 POLICY 即可，不动解析器。
//   ③ 解析器复用 tests/123static-scan.js 的既有口径（静态 import 四种形态 + 剥注释），但那边是
//      浏览器侧 fetch 实现、且 SCAN_FILES 不含 tools/，故本文件自带 node 侧 fs 版解析，
//      保证「全仓」而非「白名单」。两边若口径漂移，以本文件的行号级输出为准（它是普查，不是抽检）。
//
// 退出码：--enforce 且有越界 → 1；否则 0。--json 输出机器可读结果（供后续接 CI / 体检中心）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VER = 'tests/layer-direction-scan.mjs V0.1.0-draft';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

// ---- 层定义 ----
// 目录 → 层。modules/ 必须按「引擎机制」与「表现设施」拆开：
//   同一个目录里混着两类东西，正是「render → modules」看起来像越界的原因（实为放错层）。
const DIR_LAYER = {
    infra: 'infra',
    core: 'core',
    render: 'render',
    player: 'player',
    fx: 'fx',
    ui: 'ui',
    tools: 'tools',
    tests: 'tests',
    scripts: 'scripts'
};

// modules/ 内部二分：设施（被表现层依赖）vs 机制（被引擎依赖）。
// 判定来源：实测 import 关系 + 职责（见 --explain-modules 输出）。
const MODULE_FACILITY = new Set([
    '22audio-manager.js',   // 音频播放：纯表现设施，被 render/fx/ui 依赖
    '21error-capture.js'    // 错误捕获：诊断设施，非战斗机制（待用户确认归类）
]);

// ---- 分层矩阵（DRAFT，待用户定稿） ----
// 语义：allowed = 本层允许 import 的目标层。不在其中 = 越界（报告模式仅告警）。
// 原则：依赖只能指向「比自己更底层/更基础」的层；表现设施（modules-facility）位置等同于 infra 之上的
//   服务层，允许被所有表现层依赖，但它自己不得反向依赖表现层。
const POLICY = {
    infra: { allowed: [], note: '地基：不依赖任何层' },
    'modules-facility': { allowed: ['infra'], note: '表现设施：只依赖 infra' },
    core: { allowed: ['infra'], note: '引擎：只依赖 infra（不认任何具体英雄/表现）' },
    'modules-mechanic': { allowed: ['infra', 'core', 'modules-mechanic'], note: '机制：可依赖 infra/core' },
    render: { allowed: ['infra', 'core', 'modules-mechanic', 'modules-facility'], note: '渲染：可读引擎纯函数 + 机制常量' },
    fx: { allowed: ['infra', 'core', 'modules-facility'], note: '特效：不应依赖 render（当前 render→fx 与 fx→render 成环，待拆）' },
    player: { allowed: ['infra', 'core', 'modules-mechanic', 'modules-facility', 'render', 'fx'], note: '播放器：编排渲染/特效，不依赖 ui/tools' },
    ui: { allowed: ['infra', 'core', 'modules-mechanic', 'modules-facility', 'render', 'fx', 'player'], note: 'UI：薄外壳，可编排各层' },
    tools: { allowed: ['infra', 'core', 'modules-mechanic', 'modules-facility', 'render', 'fx', 'player', 'ui'], note: '离线工具：最上层，可读任何层；**任何层不得反向依赖它**' },
    tests: { allowed: ['*'], note: '体检：可读全仓（观察者）' },
    scripts: { allowed: ['*'], note: '脚本：可读全仓（观察者）' }
};

function layerOf(absFile) {
    const rel = path.relative(ROOT, absFile).split(path.sep).join('/');
    const seg = rel.split('/');
    if (seg.length < 2) return null;
    const dir = seg[0];
    if (dir === 'modules') {
        return MODULE_FACILITY.has(seg[1]) ? 'modules-facility' : 'modules-mechanic';
    }
    const l = DIR_LAYER[dir];
    return l || null;
}

function relOf(abs) {
    return path.relative(ROOT, abs).split(path.sep).join('/');
}

// ---- 解析：剥注释（保留行号）----
// 逐字符走，注释内容替换为空格但保留 \n，这样 match.index → 行号可直接换算。
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
                out += code[i] === '\n' ? '\n' : ' ';
                i++;
            }
            out += '  '; i += 2; continue;
        }
        out += c; i++;
    }
    return out;
}

// 提取静态依赖：import ... from 'x' / import 'x' / export ... from 'x'
// 返回 [{ spec, line, kind }]；kind ∈ static-spec | named | default | side-effect | re-export
function extractStaticDeps(code) {
    const clean = stripCommentsKeepLines(code);
    const lines = clean.split('\n');
    const deps = [];
    const patterns = [
        { re: /^\s*import\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/g, kind: 'named' },
        { re: /^\s*import\s+\*\s+as\s+[\w$]+\s+from\s*['"]([^'"]+)['"]/g, kind: 'namespace' },
        { re: /^\s*import\s+[\w$]+\s*(?:,\s*\{[^}]*\})?\s*from\s*['"]([^'"]+)['"]/g, kind: 'default' },
        { re: /^\s*import\s*['"]([^'"]+)['"]/g, kind: 'side-effect' },
        { re: /^\s*export\s*(?:\*|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g, kind: 're-export' }
    ];
    lines.forEach((ln, idx) => {
        for (const { re, kind } of patterns) {
            re.lastIndex = 0;
            const m = re.exec(ln);
            if (m) { deps.push({ spec: m[1], line: idx + 1, kind }); break; }
        }
    });
    return deps;
}

// ---- 采集 ----
const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', '展示与CG', '文件汇总20260730', '.workbuddy', 'assets']);

function walk(dir, acc) {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
    for (const e of ents) {
        if (e.isDirectory()) {
            if (SKIP_DIRS.has(e.name)) continue;
            // 跳过所有点目录：tests/.mut/ 是变异体检的沙箱副本（每轮几十份整仓拷贝），
            // 扫进去会把 4 万条边灌进来淹没真实边，且那些副本的 import 是刻意制造断裂的。
            if (e.name.startsWith('.')) continue;
            walk(path.join(dir, e.name), acc);
        } else if (/\.(js|mjs)$/.test(e.name)) {
            acc.push(path.join(dir, e.name));
        }
    }
    return acc;
}

export function collect() {
    const files = walk(ROOT, []).filter(f => {
        const l = layerOf(f);
        return !!l; // 只要已知层的文件（根目录 index.html 等自然排除）
    });
    const edges = [];
    const unresolved = [];
    for (const f of files) {
        const srcLayer = layerOf(f);
        let code;
        try { code = fs.readFileSync(f, 'utf8'); } catch { continue; }
        for (const d of extractStaticDeps(code)) {
            if (!d.spec.startsWith('.')) continue; // 裸包名（罕见）跳过
            const targetAbs = path.resolve(path.dirname(f), d.spec);
            if (!fs.existsSync(targetAbs)) {
                unresolved.push({ from: relOf(f), line: d.line, spec: d.spec });
                continue;
            }
            const dstLayer = layerOf(targetAbs);
            if (!dstLayer) continue; // content/ 或根目录资源
            edges.push({
                from: relOf(f), fromLayer: srcLayer,
                to: relOf(targetAbs), toLayer: dstLayer,
                line: d.line, kind: d.kind, spec: d.spec
            });
        }
    }
    return { files, edges, unresolved };
}

export function judge(edges) {
    const violations = [];
    for (const e of edges) {
        if (e.fromLayer === e.toLayer) continue; // 同层自由
        const pol = POLICY[e.fromLayer];
        if (!pol) continue;
        if (pol.allowed.includes('*') || pol.allowed.includes(e.toLayer)) continue;
        violations.push(e);
    }
    return violations;
}

function matrix(edges) {
    const layers = Object.keys(POLICY);
    const cell = {};
    for (const e of edges) {
        const k = e.fromLayer + ' → ' + e.toLayer;
        cell[k] = (cell[k] || 0) + 1;
    }
    return { layers, cell };
}

// ---- CLI ----
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
    const enforce = process.argv.includes('--enforce');
    const asJson = process.argv.includes('--json');
    const explainModules = process.argv.includes('--explain-modules');
    const { files, edges, unresolved } = collect();
    const violations = judge(edges);
    const { cell } = matrix(edges);

    if (asJson) {
        console.log(JSON.stringify({ ver: VER, files: files.length, edges, violations, unresolved }, null, 2));
    } else {
        console.log('=== ' + VER + ' ===');
        console.log(`扫描 ${files.length} 个文件，解析静态依赖边 ${edges.length} 条，未解析路径 ${unresolved.length} 条`);

        console.log('\n=== 层间依赖矩阵（行 import 列）===');
        const order = Object.keys(POLICY);
        const ABBR = {
            infra: 'inf', 'modules-facility': 'fac', core: 'cor', 'modules-mechanic': 'mec',
            render: 'ren', fx: 'fx', player: 'ply', ui: 'ui', tools: 'tol', tests: 'tst', scripts: 'scr'
        };
        const W = 5;
        for (const a of order) {
            const row = order.map(b => {
                const n = cell[a + ' → ' + b];
                return (n ? String(n) : '·').padStart(W);
            });
            const total = order.reduce((s, b) => s + (cell[a + ' → ' + b] || 0), 0);
            if (total) console.log(a.padEnd(18) + row.join('') + '  | ' + total);
        }
        console.log(''.padEnd(18) + order.map(b => ABBR[b].padStart(W)).join(''));

        console.log(`\n=== 越界边（按 DRAFT 矩阵判定）共 ${violations.length} 条 ===`);
        const byPair = {};
        for (const v of violations) {
            const k = v.fromLayer + ' → ' + v.toLayer;
            (byPair[k] = byPair[k] || []).push(v);
        }
        for (const k of Object.keys(byPair).sort((a, b) => byPair[b].length - byPair[a].length)) {
            console.log(`\n[${k}] ${byPair[k].length} 条`);
            for (const v of byPair[k]) {
                console.log(`  ${v.from}:${v.line}  →  ${v.to}   (${v.kind})`);
            }
        }

        if (unresolved.length) {
            console.log(`\n=== 未解析路径 ${unresolved.length} 条（可能是动态拼接或已断链，另见 123static-scan 第2类）===`);
            for (const u of unresolved) console.log(`  ${u.from}:${u.line}  →  ${u.spec}`);
        }

        if (explainModules) {
            console.log('\n=== modules 层内二分实测 ===');
            const fac = new Set(), mec = new Set();
            for (const e of edges) {
                if (e.fromLayer === 'modules-facility' || e.toLayer === 'modules-facility') fac.add(e.from + ' | ' + e.to);
                if (e.fromLayer === 'modules-mechanic' || e.toLayer === 'modules-mechanic') mec.add(e.from + ' | ' + e.to);
            }
            console.log('facility 相关边 ' + fac.size + ' 条 / mechanic 相关边 ' + mec.size + ' 条');
        }
        console.log(enforce
            ? '\n模式：ENFORCE（有越界即退出码 1）'
            : '\n模式：REPORT（只报不拦，退出码 0）—— 清单清零后再切 --enforce');
    }
    if (enforce && violations.length) process.exit(1);
}
