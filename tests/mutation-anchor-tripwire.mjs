// V1.0.0 | 2026-11-07 新建：变异锚点有效性绊线（每轮随体检自动跑 --verify）
// tests/mutation-anchor-tripwire.mjs | V1.0.0 | 2026-11-07 体检迭代：变异锚点有效性绊线
//
// ★ 立它的由头（2026-11-07 白天实跑取证）：
//    本地 mutation-teeth.mjs 的 T17 锚还写着 CAMP_TYPES.ENEMY，而主代码 core/215 早已改成
//    side: oppSide + allPositions: pick3 ⇒ `node tests/mutation-teeth.mjs --verify` 0.13 秒即报
//    「❌ T17 ... 0 处 —— 该行已被删除/改写 → 变异静默失效，树木=干净树」、EXIT=1。
//    但 run-all 的 25 项 CHECKS 与全部 OBSERVES 没有任何一项会跑 --verify：
//    夜间第 183 轮也是靠「新鲜度绊线 TRIP → 全量重跑 48 棵树」才偶然撞见，锚点已潜伏失效三轮。
//    ⇒ 洞不在「检查器不会查」，而在「没人每轮把它推开门」。本件只补这一下。
//
// ★ 定位（刻意不重复造判据）：
//    锚串在不在源码、命中几处、multi 对不对，全部由 mutation-teeth.mjs 的 --verify 唯一裁定；
//    本件不抄一份锚点匹配逻辑（第 173 轮「第二份快照」教训：两处判据早晚分叉）。
//    与 mutation-freshness-tripwire 互补：那个管「结果多久没产出」，本件管「锚串还认不认得代码」。
//    本件只做三件事：每轮把它跑起来、把 ❌ 行摊出来、守住「生产者没输出不许当绿」。
//
// ★ 为什么把「零输出」单独判红（2026-11-06 用户当面纠正过的坑）：
//    上游新增机制模块曾让 stat-decl 生产者 stdout 全 0 字节、真正的错在 stderr，
//    下游「解析出 0 行」被误读成列名失配、以为对齐正则就会复绿。故 stdout 空 / 无汇总行 /
//    汇总条数为 0 一律判红并点名生产者，绝不拿空输出当全绿；也不因 exit=0 就免检正文。
//
// 用法：node tests/mutation-anchor-tripwire.mjs            每轮随体检跑（只读 + 一次 0.1s 子进程）
//       node tests/mutation-anchor-tripwire.mjs --selftest  纯函数正负路径自证，不调子进程

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const VER = 'tests/mutation-anchor-tripwire.mjs V1.0.0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const SCRIPT = path.join(HERE, 'mutation-teeth.mjs');
const RE_SUMMARY = /(\d+)\s*条变异锚点全部有效/;

/**
 * 纯判定：不碰文件系统、不碰子进程，只把生产者的 (退出码, stdout, stderr) 判成红/绿。
 * 判据只有四条，全部是「生产者有没有给出可信结论」，绝不自己重算锚点。
 */
export function judge(code, out, err) {
    const reasons = [];
    const lines = String(out || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const badLines = lines.filter(l => /^❌/.test(l));
    const summary = lines.find(l => RE_SUMMARY.test(l)) || '';
    const m = RE_SUMMARY.exec(summary);
    const total = m ? Number(m[1]) : 0;

    if (code !== 0) reasons.push(`--verify 退出码 ${code === null ? 'null(超时/被杀)' : code}（生产者自己判红）`);
    if (!lines.length) reasons.push('生产者 stdout 零输出 ⇒ 不解析、不推断，按崩处理（不得当绿）');
    if (badLines.length) reasons.push(`--verify 报红 ${badLines.length} 行`);
    if (!summary) reasons.push('缺「N 条变异锚点全部有效」汇总行 ⇒ 生产者可能中途崩/被跳过');
    if (summary && total === 0) reasons.push('汇总条数为 0 ⇒ 一条锚点都没验（空集出绿）');
    if (!lines.length && String(err || '').trim()) {
        reasons.push('stderr 首行：' + String(err).trim().split(/\r?\n/)[0].slice(0, 160));
    }
    return { ok: reasons.length === 0, reasons, badLines, total };
}

function selftest() {
    const cases = [
        ['真绿', 0,
            '✅ A1   core/217-effect-handlers.js 1 处\n✅ 47 条变异锚点全部有效', '', true],
        ['零输出但退出码 0（最阴的假绿）', 0, '', '', false],
        ['零输出 + stderr 真报错', 1, '', 'Error: [core/216] 未知顶层机制 type "statAbsorb"', false],
        ['报红行却退出 0', 0,
            '❌ T17 core/215-buff-effects.js 0 处 —— 变异静默失效\n✅ 46 条变异锚点全部有效', '', false],
        ['红明细 + 无汇总行', 0, '❌ T17 ... 0 处', '', false],
        ['汇总 0 条', 0, '✅ 0 条变异锚点全部有效', '', false],
        ['只有明细没有汇总', 0, '✅ A1 core/x.js 1 处', '', false]
    ];
    let bad = 0;
    console.log('=== 变异锚点有效性绊线 · 自证（judge 纯函数正负路径）===');
    for (const [name, code, out, err, wantOk] of cases) {
        const got = judge(code, out, err);
        const pass = got.ok === wantOk;
        if (!pass) bad++;
        console.log(`  ${pass ? '✅' : '❌'} ${name} → ${got.ok ? 'PASS' : 'FAIL'}（期望 ${wantOk ? 'PASS' : 'FAIL'}）`
            + (got.reasons.length ? ' · ' + got.reasons[0] : ''));
    }
    console.log(bad ? `RESULT: FAIL（${bad} 条自证不符）` : 'RESULT: PASS（7 条自证全过）');
    process.exit(bad ? 1 : 0);
}

if (process.argv.includes('--selftest')) selftest();

if (!fs.existsSync(SCRIPT)) {
    console.log('❌ 变异锚点有效性绊线：找不到 ' + SCRIPT + ' ⇒ 生产者缺失，按崩处理');
    console.log('RESULT: FAIL');
    process.exit(1);
}

const r = spawnSync(process.execPath, [SCRIPT, '--verify'], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true
});
if (r.error) {
    console.log('❌ 变异锚点有效性绊线：--verify 起不来（' + r.error.message + '）');
    console.log('RESULT: FAIL');
    process.exit(1);
}

const v = judge(r.status, r.stdout, r.stderr);
console.log('=== 变异锚点有效性绊线（每轮随体检自动跑 --verify）===');
for (const l of v.badLines) console.log('  ' + l);
if (v.total) console.log(`  已验 ${v.total} 条锚点 · 报红 ${v.badLines.length} 行`);
if (!v.ok) {
    for (const why of v.reasons) console.log('  ❌ ' + why);
    console.log('  ⇒ 锚点失效时变异树=干净树，规则「有牙」结论全是假的；修 mutation-teeth.mjs 的 from/to，'
        + '不要改本绊线的判据。');
    console.log('RESULT: FAIL');
    process.exit(1);
}
console.log('  ✅ 锚点全部有效（判定口径由 --verify 唯一裁定，本件不重算）');
console.log('RESULT: PASS');
