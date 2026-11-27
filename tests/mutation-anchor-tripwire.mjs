// V1.1.0 | 2026-11-27 第59轮（#96）：「探针没活」与「真红」分家。
//   judge() 一行未改 —— 探针活着之后才轮到它，判据口径与 V1.0.0 完全一致。
//   新增 probeState()/probeVerdict()：生产者脏树拒答/零输出/无汇总行 ⇒ 退码 2「不可判」，
//   不再拿探针没跑起来的红当「锚点全失效」，避免误导人去改本来没坏的锚点。
//   探针没活时原样重跑一次（吸收瞬断），重跑仍没活才退 2。
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
//    ★ V1.1.0 澄清：上面这条针对「探针活着却空输出」；若生产者按脏树守卫拒答（退3/警告行），
//      那是探针根本没开口，归「不可判」退 2，不归真红。
//
// 用法：node tests/mutation-anchor-tripwire.mjs            每轮随体检跑（只读 + 一次 0.1s 子进程）
//       node tests/mutation-anchor-tripwire.mjs --selftest  纯函数正负路径自证，不调子进程

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const VER = 'tests/mutation-anchor-tripwire.mjs V1.1.0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const SCRIPT = path.join(HERE, 'mutation-teeth.mjs');
const RE_SUMMARY = /(\d+)\s*条变异锚点全部有效/;
const RE_DIRTY = /脏树警告|worktree-guard|环境不洁|取证不完整/;

/**
 * 纯函数：判探针四态（适配 main —— mutation-teeth 尚未打 STATS 头/尾两行，故按现有信号判）。
 *   DIRTY       生产者退码 3 或输出含脏树警告 ⇒ 按设计拒答，没下锚点结论
 *   EMPTY       stdout 零字节 ⇒ 生产者根本没开口
 *   NO_SUMMARY  有输出但没有「N 条变异锚点全部有效」汇总行 ⇒ 没跑到结论处
 *   LIVE        有汇总行 ⇒ 探针存活，才轮到 judge() 说话
 * 判据只认「有没有拿到可信结论」，不重算锚点、不改 judge()。
 */
export function probeState(code, out) {
    const s = String(out || '');
    if (code === 3 || RE_DIRTY.test(s)) {
        return { state: 'DIRTY', note: '生产者按脏树守卫拒答（退码 3 或警告行），非锚点结论' };
    }
    if (!s.trim()) {
        return { state: 'EMPTY', note: 'stdout 零字节（未装载 / 被杀 / 起不来）' };
    }
    if (!RE_SUMMARY.test(s)) {
        return { state: 'NO_SUMMARY', note: '有输出但无汇总行，未跑到结论处' };
    }
    return { state: 'LIVE', note: '探针存活：已取得汇总行' };
}

/**
 * 纯函数：探针态 + 生产者结论 ⇒ 最终裁决。
 * 探针没活一律退码 2「不可判」，绝不拿 judge() 的红绿顶上去；
 * 只有 LIVE 才用 judge() 的 ok 决定 0/1。真红判据一分未放宽。
 */
export function probeVerdict(probe, judged) {
    if (probe.state !== 'LIVE') {
        return { code: 2, kind: 'UNDECIDABLE', probe, judged: null };
    }
    return { code: judged.ok ? 0 : 1, kind: judged.ok ? 'PASS' : 'FAIL', probe, judged };
}

/**
 * 纯判定：不碰文件系统、不碰子进程，只把生产者的 (退出码, stdout, stderr) 判成红/绿。
 * 判据只有四条，全部是「生产者有没有给出可信结论」，绝不自己重算锚点。
 * ★ V1.1.0 未改本函数一行 —— 探针活着之后才轮到它，口径与 V1.0.0 完全一致。
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
    // 探针态自证（4 条）：四态各归其位，退码 3/警告行不许混进真红。
    const probeCases = [
        ['脏树警告 ⇒ DIRTY', 1, '⚠️ 脏树警告（mutation-teeth）—— 结论作废', 'DIRTY'],
        ['退码 3 ⇒ DIRTY', 3, '某输出', 'DIRTY'],
        ['零输出 ⇒ EMPTY', 0, '', 'EMPTY'],
        ['无汇总行 ⇒ NO_SUMMARY', 0, '✅ A1 core/x.js 1 处', 'NO_SUMMARY'],
        ['有汇总行 ⇒ LIVE', 0, '✅ 47 条变异锚点全部有效', 'LIVE']
    ];
    for (const [name, code, out, want] of probeCases) {
        const got = probeState(code, out).state;
        const pass = got === want;
        if (!pass) bad++;
        console.log(`  ${pass ? '✅' : '❌'} ${name} → ${got}（期望 ${want}）`);
    }
    // 裁决自证（3 条）：探针没活必退 2；真红/真绿只在 LIVE 下由 judge 决定。
    const verdictCases = [
        ['探针没活 + 正文全绿 ⇒ 仍不可判', { state: 'DIRTY' }, { ok: true }, 2, 'UNDECIDABLE'],
        ['探针活 + judge 真红 ⇒ 真红', { state: 'LIVE' }, { ok: false }, 1, 'FAIL'],
        ['探针活 + judge 绿 ⇒ 绿', { state: 'LIVE' }, { ok: true }, 0, 'PASS']
    ];
    for (const [name, probe, judged, wantCode, wantKind] of verdictCases) {
        const got = probeVerdict(probe, judged);
        const pass = got.code === wantCode && got.kind === wantKind;
        if (!pass) bad++;
        console.log(`  ${pass ? '✅' : '❌'} ${name} → 退 ${got.code}/${got.kind}（期望 ${wantCode}/${wantKind}）`);
    }
    const totalN = cases.length + probeCases.length + verdictCases.length;
    console.log(bad ? `RESULT: FAIL（${bad} 条自证不符）` : `RESULT: PASS（${totalN} 条自证全过）`);
    process.exit(bad ? 1 : 0);
}

if (process.argv.includes('--selftest')) selftest();

if (!fs.existsSync(SCRIPT)) {
    console.log('❌ 变异锚点有效性绊线：找不到 ' + SCRIPT + ' ⇒ 生产者缺失，不可判（不是锚点坏了）');
    console.log('RESULT: 不可判 —— 生产者缺失，未取得任何锚点结论');
    process.exit(2);
}

function runVerify() {
    return spawnSync(process.execPath, [SCRIPT, '--verify'], {
        cwd: REPO,
        encoding: 'utf8',
        timeout: 30000,
        windowsHide: true
    });
}

let r = runVerify();
if (r.error) {
    console.log('❌ 变异锚点有效性绊线：--verify 起不来（' + r.error.message + '）');
    console.log('RESULT: 不可判 —— 生产者没起来，非锚点结论');
    process.exit(2);
}

let probe = probeState(r.status, r.stdout);
// 探针没活：原样重跑一次，吸收瞬断（夜间 279 实证：491ms 那种是没跑起来，不是红）。
let retried = false;
if (probe.state !== 'LIVE') {
    retried = true;
    const r2 = runVerify();
    if (!r2.error) {
        const p2 = probeState(r2.status, r2.stdout);
        if (p2.state === 'LIVE') { r = r2; probe = p2; }
    }
}

const v = judge(r.status, r.stdout, r.stderr);
const verdict = probeVerdict(probe, v);
console.log('=== 变异锚点有效性绊线（每轮随体检自动跑 --verify）===');
if (retried) console.log('  · 探针首跑未活，已原样重跑一次');

if (verdict.kind === 'UNDECIDABLE') {
    console.log('  ❌ 探针状态 ' + probe.state + '：' + probe.note);
    console.log('  ⇒ 这是「不可判」，不是「锚点全失效」：--verify 没跑起来时锚点一个都没被验过，'
        + '别去改锚点；先清脏树 / 查超时 / 确认生产者能跑。');
    console.log(`RESULT: 不可判（探针 ${probe.state}，退码 2）—— 本件没有取得任何锚点结论`);
    process.exit(2);
}

for (const l of v.badLines) console.log('  ' + l);
if (v.total) console.log(`  已验 ${v.total} 条锚点 · 报红 ${v.badLines.length} 行`);
if (verdict.kind === 'FAIL') {
    for (const why of v.reasons) console.log('  ❌ ' + why);
    console.log('  ⇒ 锚点失效时变异树=干净树，规则「有牙」结论全是假的；修 mutation-teeth.mjs 的 from/to，'
        + '不要改本绊线的判据。');
    console.log('RESULT: FAIL');
    process.exit(1);
}
console.log('  ✅ 锚点全部有效（判定口径由 --verify 唯一裁定，本件不重算）');
console.log('RESULT: PASS');
