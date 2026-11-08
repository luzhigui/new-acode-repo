// 干什么：规则号重号守门（纯静态、零执行、只读 tests/health-rules/）。
//   A. 文件名号前缀重复（两个文件都叫 <N>-*.js）—— 硬红，无白名单。
//   B. 导出 id 重复（两个文件都 export const ruleN）—— 硬红；唯一例外是冻结区两组已知对
//      （177/179 共享 rule179、178/181 共享 rule181），它们按 4.7 保留原号、由 121 用纯数字别名隔离。
//   C. 文件名号 ≠ 导出号 —— 只点名不判红：123–166 历史段导出 rule70 起、175/176/177/178 历史错位，
//      全在冻结区，按 4.7 不许挪号。
// 为什么要有它：回放按导出名装载、不去重 ⇒ 同号两个文件都能跑，重号可以长期不暴露；
//   而新会话按文件名取号建文件时最容易撞上一批冻结区旧号（179/180/181 就真实撞过一次）。
// 用法：node tests/duplicate-number-guard.mjs   （exit 0 = 无冲突；exit 1 = 有冲突）
export const VER = 'tests/duplicate-number-guard.mjs V1.0.0';

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'health-rules');

// 冻结区已知同号对（4.7：不动原文件，121 用纯数字别名隔离）。键 = 导出 id，值 = 涉及文件的精确集合。
// 任何集合变化（多一个文件 / 少一个文件 / 换文件）都不再匹配 ⇒ 照常判红，防止白名单悄悄扩大。
const KNOWN_ALIAS_PAIRS = {
    rule179: ['177-enemy-mix-integrity.js', '179-hex-enhance-contract.js'],
    rule181: ['178-stage3-variant.js', '181-round-sequence.js']
};

const files = readdirSync(DIR).filter(f => f.endsWith('.js')).sort();
const rows = files.map(f => {
    const src = readFileSync(path.join(DIR, f), 'utf8');
    const prefix = (f.match(/^(\d+)-/) || [])[1];
    const id = (src.match(/export\s+const\s+(rule\d+)/) || [])[1];
    return { f, prefix: prefix ? Number(prefix) : null, id: id || null };
});

// 零触发守卫：解析面为 0 = 目录/正则失配，硬红（防空跑假绿）
if (rows.length === 0) {
    console.log('❌ 零触发守卫：health-rules 下未解析出任何规则文件');
    process.exit(1);
}

const byPrefix = new Map();
const byId = new Map();
const noId = [];
const mismatch = [];
for (const r of rows) {
    if (!r.id) { noId.push(r.f); continue; }
    if (r.prefix === null) continue;
    if (!byPrefix.has(r.prefix)) byPrefix.set(r.prefix, []);
    byPrefix.get(r.prefix).push(r.f);
    if (!byId.has(r.id)) byId.set(r.id, []);
    byId.get(r.id).push(r.f);
    if (Number(r.id.replace('rule', '')) !== r.prefix) mismatch.push(r);
}

const errors = [];
const notes = [];

for (const [n, list] of byPrefix) {
    if (list.length > 1) errors.push(`文件名号重复 ${n}: ${list.join(' | ')}`);
}

for (const [id, list] of byId) {
    if (list.length < 2) continue;
    const known = KNOWN_ALIAS_PAIRS[id];
    const isKnown = known && known.length === list.length && known.every(f => list.includes(f)) && list.every(f => known.includes(f));
    if (isKnown) notes.push(`已知同号（冻结区·121 别名隔离）${id}: ${list.join(' | ')}`);
    else errors.push(`导出 id 重复 ${id}: ${list.join(' | ')}（未在冻结区已知白名单内）`);
}

console.log(`规则文件 ${rows.length} 个 · 文件名号唯一 ${byPrefix.size} 组 · 导出 id 唯一 ${byId.size} 组`);
if (notes.length) {
    for (const n of notes) console.log('  · ' + n);
}
if (mismatch.length) {
    // 只点名不判红：冻结区历史错位，按 4.7 不许挪号
    console.log(`  · 文件名号≠导出号 ${mismatch.length} 个（冻结区历史错位，不判红）：` +
        mismatch.slice(0, 6).map(r => `${r.f}[${r.id}]`).join('、') + (mismatch.length > 6 ? ' 等' : ''));
}
if (noId.length) {
    console.log('❌ 取不到导出 id（无法判重）：' + noId.join('、'));
    process.exit(1);
}
if (errors.length) {
    console.log(`\n❌ 重号冲突 ${errors.length} 条：`);
    for (const e of errors) console.log('  - ' + e);
    process.exit(1);
}
console.log('✅ 无重号冲突（文件名号唯一 · 导出 id 仅冻结区两组已知同号）');
