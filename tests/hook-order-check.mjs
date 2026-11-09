// V1.0.1 | 2026-11-09：真收口手写剥注释——删本地 stripComments，改 import 公共件的
//   stripCommentsPreserving（保长度语义，matchParen 靠字符下标定位，不能用删除式）。
//   实现逐字搬迁、行为不变；改前/改后本脚本输出逐字一致已取证。
// tests/hook-order-check.mjs
// 体检守卫：同一帧多钩子的执行顺序 —— 结算钩子的注册纪律（静态巡检）
//
// 为什么要有这条（2026-11-08 第 195 轮 · 回合时序与抽签域）：
//   同一帧（同一 signal）里的多个钩子按 priority 升序同步串行执行（infra/101 L91-98）。
//   也就是说「谁先改血、谁后结算」全靠 priority 数值决定，战报 fact 的顺序只是结果。
//   一旦有人用裸数字注册（priority: 12）或随手写 `L.X.Y + 5`，执行顺序就脱离了相位表这唯一来源：
//   换个 import 顺序、或者旁边有人新增一个 11/13，顺序就静默变了，而 rules-replay 一条规则都看不出来。
//
// 判据：
//   ① 【硬】priority 引用的 `L.<phase>.<key>` 必须真在 EXECUTION_LAYER 里存在（拼错/删键后仍引用 = 排序拿到 undefined）；
//   ② 【硬】`when` 必须能落到 SIGNAL_TYPES 的某个值上（写错字符串 = 钩子永不触发）；
//   ③ 【报告，不计红】裸数字 priority / 裸字符串信号名 / `L.键 ± n` 偏移 / 同 priority 并列组 ——
//      这四类都让顺序脱离相位表，但是存量主代码既定写法，本轮不动主代码，逐条列进 tests/known-transfers.md 由主代码侧治理。
//   （注意：同文件里同一个相位键注册两次**不算错** —— core/216 的 if/else 分支各注册一次，
//     运行时只有一条生效；真正需要盯的是「同 priority 不同机制」的并列组，已归入报告项。）
//
// 用法：node tests/hook-order-check.mjs        # 退 0 = 硬判据全过
//       VERBOSE=1 node tests/hook-order-check.mjs   # 把报告项的上下文行号也打出来
export const VER = 'tests/hook-order-check.mjs V1.0.1';

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripCommentsPreserving as stripComments } from './_lib/static-truth-slice.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');

const { EXECUTION_LAYER, registerSettlementHook } = await import('../infra/101-event-bus.js');
const { SIGNAL_TYPES } = await import('../infra/106-battle-enums.js');
void registerSettlementHook;

const SCAN_DIRS = ['core', 'modules', 'render', 'player', 'ui'];
const SIGNAL_NAMES = new Set(Object.values(SIGNAL_TYPES));

function walk(dir, out) {
    if (!existsSync(dir)) return out;
    for (const st of readdirSync(dir, { withFileTypes: true })) {
        if (st.name.startsWith('.')) continue;
        const p = join(dir, st.name);
        if (st.isDirectory()) { walk(p, out); continue; }
        if (/\.js$/.test(st.name)) out.push(p);
    }
    return out;
}

// 保长度剥注释已收口到 tests/_lib/static-truth-slice.mjs（见文件头 import），此处不再留第二份实现。

/** 从 openIdx（指向 '('）开始找配对的 ')'，返回 [start,end) 的区间；字符串里的括号跳过 */
function matchParen(src, openIdx) {
    let depth = 0, q = null;
    for (let i = openIdx; i < src.length; i++) {
        const c = src[i];
        if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
        if (c === '"' || c === "'" || c === '`') { q = c; continue; }
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) return [openIdx + 1, i]; }
    }
    return null;
}

/** 在对象字面量参数里取某个 key 的值（逗号按深度切，避免 `{a:1,b:{c:2}}` 切错） */
function pickField(argText, field) {
    const re = new RegExp('\\b' + field + '\\s*:\\s*');
    const m = re.exec(argText);
    if (!m) return null;
    let i = m.index + m[0].length, depth = 0, q = null, start = i;
    for (; i < argText.length; i++) {
        const c = argText[i];
        if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
        if (c === '"' || c === "'" || c === '`') { q = c; continue; }
        if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) { if (depth === 0) break; depth--; }
        else if (c === ',' && depth === 0) break;
    }
    return argText.slice(start, i).trim();
}

const files = [];
for (const d of SCAN_DIRS) walk(join(REPO, d), files);

const sites = [];          // {rel, line, when, priority}
for (const abs of files) {
    const rel = abs.slice(REPO.length + 1).replace(/\\/g, '/');
    const src = stripComments(readFileSync(abs, 'utf8'));
    const re = /registerSettlementHook\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
        const span = matchParen(src, m.index + m[0].length - 1);
        if (!span) continue;
        const argText = src.slice(span[0], span[1]);
        const line = src.slice(0, m.index).split('\n').length;
        sites.push({ rel, line, when: pickField(argText, 'when'), priority: pickField(argText, 'priority') });
    }
}

const KEY_RE = /^(?:L|EXECUTION_LAYER)\.([A-Z_][A-Z_0-9]*)\.[A-Z_][A-Z_0-9]*(\s*[+-]\s*\d+)?$/;
const PHASE_KEY_RE = /^(?:L|EXECUTION_LAYER)\.([A-Z_][A-Z_0-9]*)\.([A-Z_][A-Z_0-9]*)(\s*[+-]\s*\d+)?$/;

let fails = 0, lastFail = 0;
const fail = (msg) => { fails++; lastFail++; console.log('❌ ' + msg); };

console.log('=== 同一帧多钩子执行顺序（相位表纪律） ===');
console.log('VER ' + VER + ' ｜ 注册点 ' + sites.length + ' 个');

// ① 引用的相位键必须存在
const missingKey = [];
for (const s of sites) {
    if (!s.priority) { fail(`${s.rel}:${s.line} 钩子没有 priority（顺序由注册先后决定，脱离相位表）`); continue; }
    const pm = PHASE_KEY_RE.exec(s.priority);
    if (!pm) continue;
    const [, phase, key] = pm;
    const hasPhase = Object.prototype.hasOwnProperty.call(EXECUTION_LAYER, phase);
    if (!hasPhase || !EXECUTION_LAYER[phase] || !Object.prototype.hasOwnProperty.call(EXECUTION_LAYER[phase], key)) {
        missingKey.push(`${s.rel}:${s.line} → ${s.priority}`);
    }
}
if (missingKey.length) fail('引用了 EXECUTION_LAYER 里不存在的相位键（排序会拿到 undefined）：' + missingKey.join('、'));
else console.log('① 相位键引用：' + sites.filter(s => KEY_RE.test(s.priority || '')).length + ' 处全部命中 EXECUTION_LAYER');

// ② when 必须能落到 SIGNAL_TYPES 的某个值上
const badSignal = [];
const bareSignal = [];
for (const s of sites) {
    if (!s.when) continue;
    const wm = /^SIGNAL_TYPES\.([A-Z_][A-Z_0-9]*)$/.exec(s.when);
    if (wm) {
        if (!Object.prototype.hasOwnProperty.call(SIGNAL_TYPES, wm[1])) badSignal.push(`${s.rel}:${s.line} SIGNAL_TYPES.${wm[1]} 未登记`);
        continue;
    }
    const lit = /^['"`]([^'"`]+)['"`]$/.exec(s.when);
    if (lit && SIGNAL_NAMES.has(lit[1])) { bareSignal.push(`${s.rel}:${s.line} → '${lit[1]}'`); continue; }
    badSignal.push(`${s.rel}:${s.line} when=${s.when}（既不是 SIGNAL_TYPES 常量，也不是已登记的信号值）`);
}
if (badSignal.length) fail('when 无法落到已登记信号（钩子永不触发或挂错帧）：' + badSignal.join('、'));
else console.log('② 信号名：' + sites.filter(s => s.when).length + ' 处全部落在 SIGNAL_TYPES 的取值域内' + (bareSignal.length ? `（其中 ${bareSignal.length} 处写裸字符串，见报告项）` : ''));

// ④ 报告项（不计红）
const bareNum = sites.filter(s => s.priority && /^\d+$/.test(s.priority));
const offsets = sites.filter(s => /\s*[+-]\s*\d+$/.test(s.priority || ''));
const dynExpr = sites.filter(s => s.priority && !KEY_RE.test(s.priority) && !/^\d+$/.test(s.priority));
const ties = new Map();
for (const s of sites) {
    const pm = PHASE_KEY_RE.exec(s.priority || '');
    if (!pm || !s.when) continue;
    const base = String(EXECUTION_LAYER[pm[1]][pm[2]]);
    const k = s.when + '|' + base;
    if (!ties.has(k)) ties.set(k, []);
    ties.get(k).push(`${pm[2]}@${s.rel.replace('modules/', 'm/').replace('core/', 'c/')}`);
}
const tieGroups = [...ties.entries()].filter(([, v]) => v.length > 1);

console.log('\n--- 报告项（不计红，本轮写进 tests/known-transfers.md 待主代码治理）---');
console.log(`裸数字 priority：${bareNum.length} 处 —— 顺序不来自相位表，旁边新增同值/邻近值就会静默改序`);
for (const s of bareNum) console.log(`  • ${s.rel}:${s.line} → ${s.priority}（${s.when || 'when?'}）`);
if (bareSignal.length) {
    console.log(`裸字符串信号名：${bareSignal.length} 处 —— 值能对上所以行为正确，但改枚举值时不会报错`);
    for (const s of bareSignal) console.log(`  • ${s}`);
}
console.log(`相位键 ± n 偏移：${offsets.length} 处 —— 偏移量不在表里登记，等于私有相位`);
for (const s of offsets) console.log(`  • ${s.rel}:${s.line} → ${s.priority}`);
if (dynExpr.length) {
    console.log(`动态表达式 priority：${dynExpr.length} 处`);
    for (const s of dynExpr) console.log(`  • ${s.rel}:${s.line} → ${s.priority}`);
}
console.log(`同 priority 并列组：${tieGroups.length} 组 —— 组内先后由注册顺序决定（import 顺序变则顺序变）`);
for (const [k, v] of tieGroups) console.log(`  • ${k.split('|')[0]} priority=${k.split('|')[1]}：${v.join(' / ')}`);

if (process.env.VERBOSE === '1') {
    console.log('\n--- 全部注册点 ---');
    for (const s of sites) console.log(`${s.rel}:${s.line}\t${s.when || '?'}\t${s.priority || '?'}`);
}

console.log(fails ? `\nRESULT: FAIL（${fails} 项硬判据）` : '\nRESULT: PASS（硬判据 3 条全过；报告项见上）');
process.exit(fails ? 1 : 0);
