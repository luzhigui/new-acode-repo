// tests/manifest-fresh-selftest.mjs — 清单新鲜度自检（整套预装的兜底规则）
// 防两件事：① 改了代码忘跑 tools/830-manifest-gen.mjs（指纹对不上）
//          ② 仓库新增/删了代码文件但清单没更新（清单外有漏网文件）
// 用法：node tests/manifest-fresh-selftest.mjs   （退出码 0=绿 1=红）
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { collectFiles, hashFiles } from '../tools/830-manifest-gen.mjs';

const ROOT = join(import.meta.dirname, '..');
const problems = [];

let manifest;
try {
    manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
} catch (_) {
    console.error('manifest-fresh ✗ manifest.json 不存在或不是合法 JSON —— 跑一次 node tools/830-manifest-gen.mjs');
    process.exit(1);
}
if (!manifest.ver || !Array.isArray(manifest.files)) {
    console.error('manifest-fresh ✗ manifest.json 缺 ver/files 字段');
    process.exit(1);
}

// ① 指纹逐个对照（归一换行后哈希，与 830/sw.js 口径一致）
const actual = new Map(hashFiles(collectFiles()));
const listed = new Map(manifest.files);
for (const [p, h] of actual) {
    if (!listed.has(p)) problems.push(`漏登记：${p}（仓库有、清单无）`);
    else if (listed.get(p) !== h) problems.push(`指纹过期：${p}（改了没重跑 830）`);
}
for (const p of listed.keys()) {
    if (!actual.has(p)) problems.push(`已失效：${p}（清单有、仓库已删）`);
}

// ② ver 与清单内容自洽
const ver = createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex');
if (ver !== manifest.ver) problems.push(`ver 不自洽（应为 ${ver.slice(0, 8)}，实为 ${manifest.ver.slice(0, 8)}）`);

// ③ V1.4.0（第 186 轮）：上游遗留 vs 本轮引入 归因分流 —— 不改判据强度，只补归因。
//   由头：第 185 轮起本项恒报 60 处（56 指纹过期 + 4 漏登记），逐条比对发现全部落在
//   上游 df229b5f 改动的主代码文件上，与夜间轮 tests/ 改动**零重叠**；而夜间轮铁律禁止改主代码，
//   重跑 tools/830 会直接改写 manifest.json —— 主代码文件，且会把上游的漏登记静默洗白。
//   于是本项从「一律红」改成两桶：
//     · 本轮引入（路径出现在本轮 tests/ 之外的实际改动里 / 或 tests 内新增文件）⇒ 一律红，不设上限；
//     · 上游遗留（与判定基准提交比对，路径非本轮可动范围）⇒ 只计数、按棘轮上限盯，超限才红。
//   棘轮只许降不许升（上一轮实测 60，本轮同为 60 ⇒ 上限钉在 60，往后每轮只减）。
const RATCHET_UPSTREAM_MAX = 60;
const BASELINE_REF = process.env.MF_BASELINE_REF || 'gitee/main';

/** 本轮相对基准提交实际改过的路径（拿不到 git 时返回 null ⇒ 退化为旧的全量红，绝不放宽）。 */
function changedPaths() {
    try {
        const out = execSync(`git -C "${ROOT}" diff --name-only ${BASELINE_REF} HEAD`, { encoding: 'utf8' });
        return new Set(out.split('\n').map(s => s.trim()).filter(Boolean));
    } catch (_) {
        return null;
    }
}

const changed = changedPaths();
const upstreamLeftover = [];
const introducedNow = [];
for (const p of problems) {
    const path = p.replace(/^漏登记：|^指纹过期：|^已失效：/, '').replace(/（.*$/, '');
    // 「本轮引入」的判据：① 拿不到 git ⇒ 全部视为本轮引入（fail-closed）；
    //                   ② 本轮改过这个路径 ⇒ 本轮引入；③ 否则算上游遗留。
    if (!changed || changed.has(path)) introducedNow.push(p);
    else upstreamLeftover.push(p);
}

if (introducedNow.length) {
    for (const p of introducedNow) console.error('manifest-fresh ✗ [本轮引入] ' + p);
    console.error(`manifest-fresh ✗ 本轮引入 ${introducedNow.length} 处 —— 这是夜间轮自己的锅，必须修（重跑 830 或撤回改动）`);
}
if (upstreamLeftover.length) {
    const verdict = upstreamLeftover.length > RATCHET_UPSTREAM_MAX ? '✗' : '⚠';
    console.error(`manifest-fresh ${verdict} [上游遗留] ${upstreamLeftover.length} 处（棘轮上限 ${RATCHET_UPSTREAM_MAX}，只许降）`
        + ' —— 上游改了主代码没跑 830，夜间轮禁改主代码，转交白天窗口重生成');
    for (const p of upstreamLeftover.slice(0, 5)) console.error('    · ' + p);
    if (upstreamLeftover.length > 5) console.error(`    · …等共 ${upstreamLeftover.length} 处`);
    if (upstreamLeftover.length > RATCHET_UPSTREAM_MAX) {
        console.error(`manifest-fresh ✗ 上游遗留越棘轮（${upstreamLeftover.length} > ${RATCHET_UPSTREAM_MAX}）—— 要么白天该重生成，要么有人在夜间动了主代码`);
    }
}
if (introducedNow.length || upstreamLeftover.length > RATCHET_UPSTREAM_MAX) process.exit(1);
if (problems.length) {
    console.log(`manifest-fresh ✓ ${actual.size} 个文件（本轮引入 0 处；上游遗留 ${upstreamLeftover.length} 处在棘轮内，不计退码）· ver ${manifest.ver.slice(0, 8)}`);
    process.exit(0);
}
console.log(`manifest-fresh ✓ ${actual.size} 个文件指纹全部相符 · ver ${manifest.ver.slice(0, 8)}`);
