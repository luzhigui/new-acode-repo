// V1.0.0 | 2026-11-17 新建：主代码文本「<层>/<数字>」引用存活扫描（基线棘轮，只拦新增）。
// tests/comment-ref-scan.mjs | 预估 ~5800 bytes
// 干什么：主代码文本里「<层>/<数字>」文件引用存活扫描（基线棘轮：存量放行、只拦新增）。
//   扫描面：core/ infra/ modules/ player/ render/ ui/ fx/ 七层全部 .js；
//   引用形如 core/214、infra/58、player/46（import 与注释一视同仁；活引用目标文件存在，全部放行），
//   目标层目录里不存在 <数字>-*.js ⇒ 陈旧引用（多为旧编号体系残留），点名报告。
// 为什么要有它：2026-11-17 盘点主代码 152 文件中 118 个含旧短编号注释（core/10、player/46、
//   render/30、infra/58…），指路全失效；123static-scan 只查 import/枚举，注释文字此前无人拦。
// 怎么做到不拦着路：基线 tests/comment-ref-baseline.json 钉住当前存量（键=文件::引用，不含行号，
//   行号漂移不产生噪声），常规跑只对「基线外新增」退码 1；存量被修掉只提示 --update 收缩，不判红。
// 用法：
//   node tests/comment-ref-scan.mjs            # 常规（基线缺失时自动播种存量后退 0）
//   node tests/comment-ref-scan.mjs --update   # 修完一批后重录基线（收缩存量）
export const VER = 'tests/comment-ref-scan.mjs V1.0.0';

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const BASELINE = path.join(here, 'comment-ref-baseline.json');
const DIRS = ['core', 'infra', 'modules', 'player', 'render', 'ui', 'fx'];
const RE = /(?<![A-Za-z0-9_])(core|infra|modules|player|render|ui|fx)\/(\d{1,3})(?!\d)/g;

// 每层现有编号集合（存在性唯一判据：<dir>/<N>-*.js 是否在磁盘上）
const existing = new Map();
let scanned = 0;
for (const d of DIRS) {
    const set = new Set();
    for (const f of readdirSync(path.join(root, d))) {
        if (!f.endsWith('.js')) continue;
        scanned++;
        const m = f.match(/^(\d+)-/);
        if (m) set.add(Number(m[1]));
    }
    existing.set(d, set);
}

// 零触发守卫：解析面为 0 = 目录/正则失配，硬红（防空跑假绿）
if (scanned === 0) {
    console.log('❌ 零触发守卫：七层目录未解析出任何 .js 文件');
    process.exit(1);
}

// 扫描（文本级：import/注释统一处理；活引用本就存在不会被误报）
const hits = [];   // { file, line, ref, ctx }
for (const d of DIRS) {
    for (const f of readdirSync(path.join(root, d))) {
        if (!f.endsWith('.js')) continue;
        const rel = `${d}/${f}`;
        const src = readFileSync(path.join(root, d, f), 'utf8');
        const lineStarts = [0];
        for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStarts.push(i + 1);
        const lineOf = (off) => {
            let lo = 0, hi = lineStarts.length - 1;
            while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= off) lo = mid; else hi = mid - 1; }
            return lo + 1;
        };
        RE.lastIndex = 0;
        let m;
        while ((m = RE.exec(src)) !== null) {
            const dir = m[1], num = Number(m[2]);
            if (existing.get(dir).has(num)) continue;   // 活引用放行
            const off = m.index;
            hits.push({ file: rel, line: lineOf(off), ref: `${dir}/${num}`, ctx: src.slice(off, off + 48).replace(/\s+/g, ' ') });
        }
    }
}

const keyOf = (h) => `${h.file}::${h.ref}`;
const seedBaseline = (gen) => {
    const keys = [...new Set(hits.map(keyOf))].sort();
    writeFileSync(BASELINE, JSON.stringify({ ver: 1, gen, count: keys.length, refs: keys }, null, 1) + '\n');
    return keys.length;
};

if (process.argv.includes('--update')) {
    const n = seedBaseline('tests/comment-ref-scan.mjs --update');
    console.log(`✅ 基线已重录：${hits.length} 处 / ${n} 键存量陈旧引用 → tests/comment-ref-baseline.json`);
    process.exit(0);
}

let base = null;
try { base = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch { /* 首跑播种 */ }
if (!base || !Array.isArray(base.refs)) {
    const n = seedBaseline('tests/comment-ref-scan.mjs 自动播种');
    console.log(`ℹ 首次运行：存量 ${hits.length} 处 / ${n} 键陈旧引用已自动入基线（不拦路）。修掉后跑 --update 收缩。`);
    process.exit(0);
}

// 棘轮判定：基线外新增 ⇒ 红；基线内已消失 ⇒ 提示收缩（不红）
const baseKeys = new Set(base.refs);
const seenKeys = new Set(hits.map(keyOf));
const fresh = hits.filter(h => !baseKeys.has(keyOf(h)));
const gone = [...baseKeys].filter(k => !seenKeys.has(k));

console.log(`文件编号引用存活：七层 ${scanned} 文件，陈旧引用现存量 ${seenKeys.size} 键（基线 ${baseKeys.size}）`);
if (gone.length) console.log(`  · 存量已修 ${gone.length} 键（提示：跑 --update 收缩基线，不判红）`);
if (fresh.length) {
    const byFile = new Map();
    for (const h of fresh) { if (!byFile.has(h.file)) byFile.set(h.file, []); byFile.get(h.file).push(h); }
    console.log(`\n❌ 新增陈旧引用 ${fresh.length} 处 / ${byFile.size} 文件（目标层目录不存在该编号文件）：`);
    for (const [f, list] of byFile) {
        console.log(`  ${f}:`);
        for (const h of list.slice(0, 8)) console.log(`    L${h.line}  ${h.ref}  … ${h.ctx}`);
        if (list.length > 8) console.log(`    … 另 ${list.length - 8} 处`);
    }
    process.exit(1);
}
console.log('✅ 无新增陈旧引用（存量均在基线内，不拦路）');
