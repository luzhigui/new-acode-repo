// V1.0.0 | 2026-11-17 新建：主代码七层文件编号唯一性守门（撞号/无编号/白名单洗长）。
// tests/main-number-guard.mjs | 预估 ~4600 bytes
// 干什么：主代码七层（core/infra/modules/player/render/ui/fx）文件编号唯一性守门（纯静态、零执行、只读）。
//   A. 层内编号前缀重复（同层两个文件都叫 <N>-*.js）—— 硬红，无白名单。
//   B. 层内出现无编号 .js 文件（不符合 <N>-*.js 命名规范）—— 硬红。
//   C. 层内编号重复但已登记在白名单（历史遗留、暂不许挪号）—— 只点名不判红，白名单只许收缩。
// 为什么要有它：duplicate-number-guard.mjs 只守 tests/health-rules/ 的号，主代码七层的撞号没人管。
//   实测事故：infra/107-fact-contract.js 与 infra/107-store-schema.js 长期撞号（同号两名），
//   全靠人肉发现；已由并行会话把后者改名 112 才消。同类缺陷会随「新增文件随手取号」复发。
// 怎么做到不拦路：存量已核对为 0 冲突（2026-11-17 实测七层编号全唯一、无未编号文件），
//   判据只在「新增撞号/新增未编号」时退码 1，日常跑零输出开销、零噪声。
// 用法：node tests/main-number-guard.mjs   （exit 0 = 无冲突；exit 1 = 有冲突）
export const VER = 'tests/main-number-guard.mjs V1.0.0';

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const DIRS = ['core', 'infra', 'modules', 'player', 'render', 'ui', 'fx'];

// C 档白名单（历史撞号、按「不挪号」保留的已知对）。键 = "层/编号"，值 = 涉及文件的精确集合。
// 集合任何变化（多一个/少一个/换文件）都不再匹配 ⇒ 照常判红，防止白名单悄悄扩大。
// 当前为空：2026-11-17 实测主代码七层无撞号（infra/107 撞号已由 107-store-schema→112 消除）。
const KNOWN_DUP_WHITELIST = {};

const rows = [];
for (const d of DIRS) {
    const dir = path.join(root, d);
    let names;
    try { names = readdirSync(dir).filter(f => f.endsWith('.js')); } catch { names = null; }
    if (names === null) {
        console.log(`❌ 层目录不存在，无法判重：${d}/`);
        process.exit(1);
    }
    for (const f of names) {
        const m = f.match(/^(\d+)-/);
        rows.push({ dir: d, f, num: m ? Number(m[1]) : null });
    }
}

// 零触发守卫：解析面为 0 = 目录/正则失配，硬红（防空跑假绿）
if (rows.length === 0) {
    console.log('❌ 零触发守卫：七层未解析出任何 .js 文件');
    process.exit(1);
}

const byNum = new Map();     // "dir/N" -> [file]
const unnumbered = [];
for (const r of rows) {
    if (r.num === null) { unnumbered.push(`${r.dir}/${r.f}`); continue; }
    const k = `${r.dir}/${r.num}`;
    if (!byNum.has(k)) byNum.set(k, []);
    byNum.get(k).push(r.f);
}

const errors = [];
const notes = [];

for (const [k, list] of byNum) {
    if (list.length < 2) continue;
    const known = KNOWN_DUP_WHITELIST[k];
    const isKnown = !!known && known.length === list.length && known.every(f => list.includes(f)) && list.every(f => known.includes(f));
    if (isKnown) notes.push(`已知同号（白名单·不挪号）${k}: ${list.join(' | ')}`);
    else errors.push(`主代码编号重复 ${k}: ${list.join(' | ')}`);
}

if (unnumbered.length) {
    errors.push(`主代码存在无编号 .js（须 <N>-<名>.js）${unnumbered.length} 个: ${unnumbered.join(' | ')}`);
}

console.log(`主代码文件编号守门：七层 ${rows.length} 个 .js · 编号组 ${byNum.size} 个`);
for (const n of notes) console.log('  · ' + n);
if (errors.length) {
    console.log(`\n❌ 冲突 ${errors.length} 条：`);
    for (const e of errors) console.log('  - ' + e);
    process.exit(1);
}
console.log('✅ 无编号冲突（层内编号唯一 · 全部文件已编号）');
