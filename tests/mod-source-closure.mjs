// tests/mod-source-closure.mjs
// 体检静态器：加成词条「来源闭环」——每个 addMod 调用点都必须当场交代
// 「谁给的(source)、归哪组(group)、怎么算(op)、何时过期(ttl)」。
//
// 为什么要有它（与运行时规则 237 互补）：
//   237 只能在回放/浏览器里扫**已经落到账本**的词条；某个调用点在样本里没被触发，
//   它就永远绿。本器不看样本，直接扫源码里的全部调用点 ⇒ 补上「从未触发」盲区。
//   2026-11-08 237 首轮抓到的 modules/328 两处 addMod 少传 ttl，正是这类缺陷。
//
// 判据（只认「能静态确定」的部分，动态参数不判）：
//   ① 第三个参数是对象字面量 ⇒ 必须有 ttl / group / source / op 四个键；
//   ② 第二个参数是字面量 ⇒ 必须是 atk / def / maxHp；
//   ③ 第三个参数不是对象字面量（变量/展开/传参）⇒ 记「动态」，不算违规也不假装通过。
//
// 用法：node tests/mod-source-closure.mjs [--verbose]
//   退出码 0 = 全部静态调用点齐备；1 = 有缺失；2 = 扫描失败。

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCAN_DIRS = ['core', 'modules', 'infra', 'render', 'player', 'fx'];
const STATS = ['atk', 'def', 'maxHp'];
const NEED_KEYS = ['ttl', 'group', 'source', 'op'];
const VERBOSE = process.argv.includes('--verbose');

function walk(dir, out) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { walk(p, out); continue; }
        if (name.endsWith('.js')) out.push(p);
    }
    return out;
}

// 从 addMod( 的 '(' 开始，按括号深度取到配对的 ')'
function callText(src, openIdx) {
    let depth = 0, inS = null, inT = null, inC = null;
    for (let i = openIdx; i < src.length; i++) {
        const ch = src[i];
        if (inC) { if (ch === '\n') inC = null; continue; }
        if (inS) { if (ch === '\\') { i++; continue; } if (ch === inS) inS = null; continue; }
        if (inT) { if (ch === '\\') { i++; continue; } if (ch === inT) inT = null; continue; }
        if (ch === '/' && src[i + 1] === '/') { inC = 1; continue; }
        if (ch === "'" || ch === '"') { inS = ch; continue; }
        if (ch === '`') { inT = ch; continue; }
        if (ch === '(') depth++;
        if (ch === ')') { depth--; if (depth === 0) return src.slice(openIdx + 1, i); }
    }
    return null;
}

// 只按顶层逗号切参数
function splitArgs(text) {
    const out = [], parts = [];
    let depth = 0, inS = null, inT = null;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inS) { if (ch === '\\') { i++; continue; } if (ch === inS) inS = null; parts.push(ch); continue; }
        if (inT) { if (ch === '\\') { i++; continue; } if (ch === inT) inT = null; parts.push(ch); continue; }
        if (ch === "'" || ch === '"') { inS = ch; parts.push(ch); continue; }
        if (ch === '`') { inT = ch; parts.push(ch); continue; }
        if ('([{'.includes(ch)) depth++;
        if (')]}'.includes(ch)) depth--;
        if (ch === ',' && depth === 0) { out.push(parts.join('').trim()); parts.length = 0; continue; }
        parts.push(ch);
    }
    out.push(parts.join('').trim());
    return out;
}

function lineOf(src, idx) { return src.slice(0, idx).split('\n').length; }

const files = [];
for (const d of SCAN_DIRS) files.push(...walk(join(ROOT, d), []));

const bad = [];
let calls = 0, dynamic = 0, literal = 0;
for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const re = /(?<!\.)addMod\s*\(/g; // 排除 obj.addMod(...) 定义/导出写法
    let m;
    while ((m = re.exec(src))) {
        const body = callText(src, m.index + m[0].length - 1);
        if (!body) continue;
        calls++;
        const args = splitArgs(body);
        if (args.length < 3) continue;
        const statArg = args[1];
        const modArg = args[2];
        const at = relative(ROOT, f) + ':' + lineOf(src, m.index);
        if (!/^(atk|def|maxHp)$/.test(statArg.replace(/['"]/g, ''))) {
            if (/^['"`]/.test(statArg)) bad.push(at + ' 属性不在 atk/def/maxHp：' + statArg);
            else dynamic++;
            if (!/^['"`]/.test(statArg)) continue;
        }
        if (!modArg.startsWith('{')) { dynamic++; continue; }
        literal++;
        for (const key of NEED_KEYS) {
            // 认两种写法：显式 `group: xxx` 与 ES6 简写 `group,`（简写也是齐备）
            const has = new RegExp('(^|[{,\\s])' + key + '\\s*[:,}]').test(modArg);
            if (!has) bad.push(at + ' 词条缺 ' + key + '（' + modArg.replace(/\s+/g, ' ') + '）');
        }
    }
}

console.log('=== 加成词条来源闭环（静态） V1.0.0 ===');
console.log('扫描 ' + files.length + ' 个文件，addMod 调用点 ' + calls + ' 处：字面量 ' + literal + ' / 动态 ' + dynamic);
if (VERBOSE) for (const b of bad) console.log('  ✗ ' + b);
if (bad.length) {
    console.log('✗ 违规 ' + bad.length + ' 处：');
    for (const b of bad.slice(0, 20)) console.log('  ✗ ' + b);
    if (bad.length > 20) console.log('  … 其余 ' + (bad.length - 20) + ' 处省略（--verbose 看全部）');
    process.exit(1);
}
console.log('✅ 全部静态 addMod 调用点都交代了 ttl / group / source / op');
process.exit(0);
