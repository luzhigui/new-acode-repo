// V1.0.0 | 2026-11-06 新建：pickKeyLine 行为守门（failed 参数仍在 + 红不许被说成绿）
// tests/pick-key-line-selftest.mjs | V1.0.0 | 2026-11-06 体检迭代：结论行挑选口径行为守门
//   V1.0.0 | 2026-11-06 新建。守住 run-all.mjs V1.40.0 / orphan-selftest-sweep.mjs V1.3.0 的修复：
//     pickKeyLine 新增可选 failed 参数，调用方已知子进程 exit≠0 时优先挑负向结论行。
//   ★ 为什么必须常驻：修复本身只是「调用点多传一个参数」。哪天有人重构时把这个参数删了，
//     函数会静默退回「取最后一条命中词行」——而关键词表含 通过/全过/exit，红脚本末尾若打统计
//     尾巴，体检报告就把「红」显示成「通过」。夜间产物取不回、只剩摘要行时，等于红被说成绿，
//     且没有任何报错。output-label-coupling-guard 线二只比三要素（正则/取行/截断），
//     比不出「这个参数还在不在、行为还对不对」——本件补的正是这一层。
//   ★ 与 output-label-coupling-guard 线二的分工：线二盯「两份实现三要素是否同步」（防止配对靠人记），
//     本件盯「行为是否真能防住红说成绿」+「调用点有没有把 known-red 传下来」。两者不重复。
//   纯 node 只读、零子进程、零网络；真身源码抽函数 + 合成输出喂行为断言 + 负路径自证。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VER = 'tests/pick-key-line-selftest.mjs V1.0.0';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = [
    'tests/run-all.mjs',
    'tests/orphan-selftest-sweep.mjs'
];

/** 从真身源码里抽出 pickKeyLine 函数体并编译成可调用函数（纯函数、无 import，安全）。 */
function extractPick(src, label) {
    const i = src.indexOf('function pickKeyLine');
    if (i < 0) throw new Error(label + ' 里找不到 function pickKeyLine');
    const j = src.indexOf('\n}', i);
    if (j < 0) throw new Error(label + ' 里 pickKeyLine 收尾大括号找不到');
    const body = src.slice(i, j + 2);
    try {
        return new Function(body + '; return pickKeyLine;')();
    } catch (e) {
        throw new Error(label + ' 的 pickKeyLine 无法编译：' + (e && e.message));
    }
}

/** 括号配对取出一次调用的全部实参文本（不硬编码参数名，抗重构）。 */
function callArgs(src, openIdx) {
    let depth = 0, quote = null;
    for (let k = openIdx; k < src.length; k++) {
        const ch = src[k];
        if (quote) {
            if (ch === '\\') { k++; continue; }
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
        if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (depth === 0) return src.slice(openIdx + 1, k); }
    }
    return null;
}

/** 顶层逗号切分（忽略括号/引号内层），用于判断实参个数。 */
function argCount(argText) {
    if (argText.trim() === '') return 0;
    let depth = 0, quote = null, n = 1;
    for (let k = 0; k < argText.length; k++) {
        const ch = argText[k];
        if (quote) {
            if (ch === '\\') { k++; continue; }
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') depth--;
        else if (ch === ',' && depth === 0) n++;
    }
    return n;
}

// 合成样本：真实红脚本常「先打 ❌ 明细、末尾再打统计尾巴」；绿脚本末尾就是结论行。
//   ★ 绿样本同时兼作「旧口径回归」：绿路径必须与修复前逐字一致（误伤面为零的证明）。
const CASES = [
    { id: 'redTailPass', out: '检查开始\n❌ 规则123：fact 缺失 amount 字段（致命）\n✅ 规则124 子项通过\nexit=0', failed: true, must: '规则123' },
    { id: 'redTailStat', out: '❌ 契约偏差 3 处：attackGroup/uidA/roundStart\n统计: 100 项全过', failed: true, must: '契约偏差' },
    { id: 'redNoNeg', out: '检查开始\nRESULT: FAIL', failed: true, must: 'FAIL' },
    { id: 'greenNormal', out: '检查开始\n✅ 全部声明版本一致\nRESULT: PASS', failed: false, must: 'RESULT: PASS' },
    { id: 'greenNoArg', out: '检查开始\n✅ 全部通过\nexit=0', failed: undefined, must: 'exit=0' }
];

/** 行为审计：返回 fails 数组。传入两份实现，逐样本断言 + 两处一致性。 */
function auditBehavior(A, B) {
    const fails = [];
    for (const c of CASES) {
        let a, b;
        try { a = A(c.out, c.failed); b = B(c.out, c.failed); }
        catch (e) { fails.push(c.id + ' 调用抛错：' + (e && e.message)); continue; }
        if (typeof a !== 'string' || !a.length) fails.push(c.id + ' 返回空 ⇒ 摘要行无从显示');
        else if (c.failed === true && !a.includes(c.must)) {
            fails.push(c.id + ' 红路径未挑负向结论行：得「' + a + '」，应含「' + c.must + '」⇒ 红被说成绿');
        } else if (c.failed !== true && a !== c.must) {
            fails.push(c.id + ' 绿路径与旧口径不一致：得「' + a + '」，应为「' + c.must + '」⇒ 误伤');
        }
        if (a !== b) fails.push(c.id + ' 两处实现行为分叉：run-all「' + a + '」/ orphan「' + b + '」');
    }
    return fails;
}

function main() {
    console.log('=== 结论行挑选口径行为守门 ' + VER + ' ===');
    const fails = [];
    const srcs = {};
    for (const rel of TARGETS) {
        const p = path.join(root, rel);
        if (!fs.existsSync(p)) { fails.push(rel + ' 不在盘 ⇒ 守门空转'); continue; }
        srcs[rel] = fs.readFileSync(p, 'utf8');
    }
    if (fails.length) { for (const f of fails) console.log('  ❌ ' + f); return 1; }

    let A, B;
    try {
        A = extractPick(srcs[TARGETS[0]], TARGETS[0]);
        B = extractPick(srcs[TARGETS[1]], TARGETS[1]);
    } catch (e) { console.log('  ❌ ' + (e && e.message)); return 1; }

    // ① 真身行为：红路径挑负向 / 绿路径零误伤 / 两处一致
    for (const f of auditBehavior(A, B)) { console.log('  ❌ ' + f); fails.push(f); }

    // ② 调用点必须把 known-red 传下来：扫所有非定义处的 pickKeyLine( 调用，实参须 ≥2。
    //    不硬编码参数名，重构换写法也能查；删了第二参立刻报红（本件存在的全部理由）。
    for (const rel of TARGETS) {
        const src = srcs[rel];
        const re = /pickKeyLine\s*\(/g;
        let m, calls = 0, callBad = 0;
        while ((m = re.exec(src))) {
            const before = src.slice(Math.max(0, m.index - 12), m.index);
            if (/function\s*$/.test(before)) continue;   // 定义处
            if (/\bfunction\s+pickKeyLine\s*$/.test(src.slice(0, m.index).slice(-40))) continue;
            calls++;
            const args = callArgs(src, m.index + m[0].length - 1);
            const n = args === null ? -1 : argCount(args);
            if (n < 2) {
                callBad++;
                const msg = rel + ' 第 ' + (src.slice(0, m.index).split('\n').length) + ' 行 pickKeyLine 调用只传 ' + n + ' 个实参 ⇒ known-red 没传下来，红路径会退回「红说成绿」';
                fails.push(msg);
                console.log('  ❌ ' + msg);
            }
        }
        if (calls === 0) { fails.push(rel + ' 找不到任何 pickKeyLine 调用点 ⇒ 调用点检查空转（假绿）'); console.log('  ❌ ' + rel + ' 找不到任何 pickKeyLine 调用点 ⇒ 检查空转'); }
        else if (!callBad) console.log('  ✅ ' + rel + ' 调用点 ' + calls + ' 处，均传 known-red');
    }

    // ③ 负路径自证：把负向优先分支关掉，audit 必须报红 —— 否则本守门是纸面文章
    const degraded = function (out) {
        const lines = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const hit = lines.filter(l =>
            /RESULT|MATCH|✅|❌|通过|无失败|issue|偏差|未覆盖|未触发|全过|失败|Error|exit/i.test(l));
        return (hit[hit.length - 1] || lines[lines.length - 1] || '').slice(0, 100);
    };
    const negFails = auditBehavior(degraded, degraded);
    if (!negFails.length) fails.push('负路径自证失败：退化版（无负向优先）竟没被咬住 ⇒ 本守门假绿');
    else console.log('  ✅ 负路径自证：退化版被咬住 ' + negFails.length + ' 条（红说成绿不会漏网）');

    if (fails.length) {
        console.log('RESULT: FAIL —— ' + fails.length + ' 条（明细见上方 ❌ 行）');
        return 1;
    }
    console.log('RESULT: PASS —— 红路径 ' + CASES.filter(c => c.failed === true).length
        + ' 样本全挑负向 / 绿路径 ' + CASES.filter(c => c.failed !== true).length
        + ' 样本零误伤 / 两处实现一致 / 调用点全传 known-red / 负路径自证咬住');
    return 0;
}

process.exit(main());
