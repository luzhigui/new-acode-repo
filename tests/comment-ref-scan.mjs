// V1.1.0 | 2026-11-17 第34轮：加「基线只许收缩」棘轮（--update 不许把存量洗大）。
//   由头：#32 建 `comment-ref-scan.mjs` 时，基线只钉住「当前存量」，常规跑只拦「基线外新增」，
//   存量被修掉只提示 `--update` 收缩、不判红 ⇒ **基线可以被悄悄写大**：有人跑一次 `--update`
//   就把自己新造的陈旧引用洗成「合法存量」，棘轮形同虚设（与 entry-path-guard / transfer-block-guard
//   同款「只降不抬」口径，全仓库已有先例）。
//   本轮口径（不改任何既有判定，只加一道闸）：
//     · 基线文件新增 `maxCount` 字段 = 允许的最大存量键数（冻结上限，只许降不许升）；
//     · 常规跑：基线 `count` > `maxCount` ⇒ 退码 1（基线被洗大）；
//     · `--update`：新键数 > `maxCount` ⇒ **拒绝写入并退码 1**（不许洗大）；
//       新键数 ≤ `maxCount` ⇒ 允许写入，并把 `maxCount` 同步改成新键数（收缩）；
//     · `--raise-cap N`：显式抬上限的唯一入口，必须 N > 当前 maxCount 且写明理由（进基线 ratchetNote 字段）。
//   ★ 零判定变化：原「基线外新增 ⇒ 红」「存量已修 ⇒ 提示收缩」两条判据一字未改。
//   ★ 不重录基线：本轮只给现有基线补 `maxCount` 字段（值 = 当前 count 368），不改 refs 列表。
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
//   ★ 第34轮加「只许收缩」棘轮：`maxCount` 冻结上限，基线被写大 ⇒ 退码 1（见 V1.1.0 头注）。
// 用法：
//   node tests/comment-ref-scan.mjs            # 常规（基线缺失时自动播种存量后退 0）
//   node tests/comment-ref-scan.mjs --update   # 修完一批后重录基线（收缩存量；不许洗大）
//   node tests/comment-ref-scan.mjs --selftest # 棘轮自证正负路径（洗长→红 / 收缩→绿）
export const VER = 'tests/comment-ref-scan.mjs V1.1.0';

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const BASELINE = path.join(here, 'comment-ref-baseline.json');
const DIRS = ['core', 'infra', 'modules', 'player', 'render', 'ui', 'fx'];
const RE = /(?<![A-Za-z0-9_])(core|infra|modules|player|render|ui|fx)\/(\d{1,3})(?!\d)/g;

// ── 棘轮上限（只许降不许升）────────────────────────────────────────────────
// 冻结上限写在基线文件的 maxCount 字段里（不写死在本文件，避免两处真值分叉）。
// 基线文件缺该字段（老基线）⇒ 取当前 count 作为上限（等价于「不设闸」，不误伤存量基线）。
export const DEFAULT_CAP_FALLBACK = 'count';

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

// ── 棘轮判据（纯函数，供 --selftest 复用）────────────────────────────────
/**
 * 判定基线棘轮。
 * @param {number} baseCount   基线里登记的存量键数
 * @param {number} cap         冻结上限（maxCount）
 * @returns {{ok:boolean, reason:string}}
 */
export function assessRatchet(baseCount, cap) {
    if (baseCount > cap) {
        return { ok: false, reason: `基线存量 ${baseCount} 键 > 冻结上限 ${cap} 键（基线被写大了，只许收缩不许洗大）` };
    }
    return { ok: true, reason: '' };
}

/**
 * 判定「能不能用 --update 写这份新基线」。
 * @param {number} newCount   新基线键数
 * @param {number} cap        当前冻结上限
 * @returns {{ok:boolean, reason:string}}
 */
export function assessUpdate(newCount, cap) {
    if (newCount > cap) {
        return { ok: false, reason: `--update 想把基线写大到 ${newCount} 键 > 冻结上限 ${cap} 键 ⇒ 拒绝写入（只许收缩；要抬上限须显式 --raise-cap 并写明理由）` };
    }
    return { ok: true, reason: '' };
}

/** 从基线对象里取冻结上限（缺 maxCount 时回落 count ⇒ 不误伤老基线） */
export function capOf(base) {
    if (!base) return null;
    if (Number.isFinite(base.maxCount)) return base.maxCount;
    if (Number.isFinite(base.count)) return base.count;
    return null;
}

const seedBaseline = (gen, cap, note) => {
    const keys = [...new Set(hits.map(keyOf))].sort();
    const payload = { ver: 2, gen, count: keys.length, maxCount: cap == null ? keys.length : cap, refs: keys };
    if (note) payload.ratchetNote = note;
    writeFileSync(BASELINE, JSON.stringify(payload, null, 1) + '\n');
    return keys.length;
};

// ── 棘轮自证（纯逻辑，不碰磁盘基线）─────────────────────────────────────
export function runRatchetSelfTest() {
    const fails = [];
    const ok = (cond, desc) => { if (!cond) fails.push(desc); };

    // ① 基线被洗大（count > cap）⇒ 必须红
    ok(!assessRatchet(369, 368).ok, '① 基线 369 > 上限 368 必须判红（洗大被拦）');
    // ② 基线没变大（count == cap）⇒ 必须绿
    ok(assessRatchet(368, 368).ok, '② 基线 368 == 上限 368 必须判绿');
    // ③ 基线收缩（count < cap）⇒ 必须绿
    ok(assessRatchet(366, 368).ok, '③ 基线 366 < 上限 368 必须判绿（收缩放行）');
    // ④ --update 想写大 ⇒ 必须拒绝
    ok(!assessUpdate(369, 368).ok, '④ --update 写大到 369 > 368 必须被拒');
    // ⑤ --update 写平（键数不变）⇒ 允许
    ok(assessUpdate(368, 368).ok, '⑤ --update 写平 368 必须允许');
    // ⑥ --update 收缩 ⇒ 允许
    ok(assessUpdate(366, 368).ok, '⑥ --update 收缩到 366 必须允许');
    // ⑦ 上限读取：老基线无 maxCount ⇒ 回落 count（不误伤）
    ok(capOf({ count: 368 }) === 368, '⑦ 老基线无 maxCount 须回落 count=368');
    // ⑧ 上限读取：新基线有 maxCount ⇒ 取 maxCount
    ok(capOf({ count: 366, maxCount: 368 }) === 368, '⑧ 新基线须取 maxCount=368');
    // ⑨ 空基线对象 ⇒ 上限取不到（调用方须当「无上限」处理，不得当成 0）
    ok(capOf({}) === null, '⑨ 空基线须返回 null（不得当成 0）');
    // ⑩ count 与 maxCount 不一致（被手改成更大）⇒ 必须红（这正是「洗大」的形态）
    ok(!assessRatchet(400, 368).ok, '⑩ count=400 > maxCount=368 必须判红');
    // ⑪ 上限为 0（基线被清空 + 上限也清零）⇒ 常规跑必须红（否则「清零洗债」是条后门）
    ok(!assessRatchet(1, 0).ok, '⑪ 上限 0 时基线 1 键必须判红');
    // ⑫ --update 在上限 0 下想写 0 键（清空基线）⇒ 允许（清债方向）
    ok(assessUpdate(0, 0).ok, '⑫ --update 清空基线（0 键 <= 上限 0）必须允许');
    // ⑬ --update 在上限 0 下想写 1 键 ⇒ 必须拒绝
    ok(!assessUpdate(1, 0).ok, '⑬ --update 在上限 0 下写 1 键必须被拒');
    // ⑭ 双闸一致：同一对 (count, cap) 在 assessRatchet 与 assessUpdate 上必须同向
    for (const [c, cp] of [[368, 368], [366, 368], [369, 368], [0, 0], [1, 0]]) {
        ok(assessRatchet(c, cp).ok === assessUpdate(c, cp).ok,
            `⑭ 双闸同向：count=${c} cap=${cp} 两处判定须一致`);
    }

    if (fails.length) {
        console.error('❌ 基线棘轮自证失败：\n  ' + fails.join('\n  '));
        return { total: 14, fails };
    }
    console.log('✅ 基线棘轮自证 14/14（洗大→红 / 收缩→绿 / --update 拒写大 / 上限回落 / 双闸同向）');
    return { total: 14, fails };
}

// ── 主流程 ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);

if (argv.includes('--selftest')) {
    const r = runRatchetSelfTest();
    process.exit(r.fails.length === 0 ? 0 : 1);
}

// 显式抬上限（唯一合法入口）：--raise-cap N [--raise-reason "..."]
let raiseCap = null;
let raiseReason = '';
{
    const i = argv.indexOf('--raise-cap');
    if (i >= 0) {
        raiseCap = Number(argv[i + 1]);
        if (!Number.isFinite(raiseCap) || raiseCap <= 0) {
            console.error('❌ --raise-cap 必须跟一个正整数');
            process.exit(1);
        }
        const j = argv.indexOf('--raise-reason');
        if (j >= 0) raiseReason = argv[j + 1] || '';
        // ★ --raise-cap 只在 --update 通道有意义；单独跑（没带 --update）⇒ 静默忽略 =
        //   「参数被吞掉」的假绿（用户以为抬了上限，其实什么都没发生）⇒ 必须当场报错。
        if (!argv.includes('--update')) {
            console.error('❌ --raise-cap 必须与 --update 同时使用（--raise-cap 只在重录基线时生效）');
            console.error('   正确用法：node tests/comment-ref-scan.mjs --update --raise-cap N --raise-reason "…"');
            process.exit(1);
        }
    }
}

// 读现基线（可能不存在）
let base = null;
try { base = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch { /* 首跑播种 */ }
const cap = capOf(base);

if (argv.includes('--update')) {
    const newCount = new Set(hits.map(keyOf)).size;
    // 抬上限：显式入口，须写理由
    if (raiseCap != null) {
        const cur = cap == null ? 0 : cap;
        if (raiseCap <= cur) {
            console.error(`❌ --raise-cap ${raiseCap} 不大于当前上限 ${cur} ⇒ 拒绝（抬上限只许向上，且须写明理由）`);
            process.exit(1);
        }
        if (!raiseReason.trim()) {
            console.error('❌ --raise-cap 必须同时给 --raise-reason "…"（写明为什么要抬这道闸）');
            process.exit(1);
        }
        seedBaseline('tests/comment-ref-scan.mjs --update --raise-cap', raiseCap, raiseReason);
        console.log(`✅ 冻结上限已显式抬到 ${raiseCap} 键（理由：${raiseReason}）`);
        console.log(`   新基线：${newCount} 键 → tests/comment-ref-baseline.json`);
        process.exit(0);
    }
    // 未显式抬上限 ⇒ 只许收缩
    if (cap == null) {
        // 首跑：无基线 ⇒ 播种（等价于登记上限 = 当前存量，不设闸）
        const n = seedBaseline('tests/comment-ref-scan.mjs 首次播种', null, null);
        console.log(`ℹ 首次运行：存量 ${hits.length} 处 / ${n} 键陈旧引用已自动入基线（不拦路）。修掉后跑 --update 收缩。`);
        process.exit(0);
    }
    const gate = assessUpdate(newCount, cap);
    if (!gate.ok) {
        console.error('❌ ' + gate.reason);
        console.error(`   当前存量 ${newCount} 键（基线 ${base.count} 键 / 冻结上限 ${cap} 键）。基线文件未被改动。`);
        process.exit(1);
    }
    // 收缩（或持平）：写新基线，并把上限同步成新键数（只许降）
    const n = seedBaseline('tests/comment-ref-scan.mjs --update', newCount, base && base.ratchetNote ? base.ratchetNote : null);
    console.log(`✅ 基线已重录：${hits.length} 处 / ${n} 键存量陈旧引用 → tests/comment-ref-baseline.json（冻结上限同步收缩到 ${n}）`);
    process.exit(0);
}

if (!base || !Array.isArray(base.refs)) {
    const n = seedBaseline('tests/comment-ref-scan.mjs 自动播种', null, null);
    console.log(`ℹ 首次运行：存量 ${hits.length} 处 / ${n} 键陈旧引用已自动入基线（不拦路）。修掉后跑 --update 收缩。`);
    process.exit(0);
}

// 棘轮判定：基线被洗大 ⇒ 红（先于其它判定，基线被洗大时其它结论都不可信）
const ratchet = assessRatchet(base.count, cap == null ? base.count : cap);
if (!ratchet.ok) {
    console.log(`文件编号引用存活：七层 ${scanned} 文件，陈旧引用现存量 ${new Set(hits.map(keyOf)).size} 键（基线 ${base.count}）`);
    console.log(`\n❌ ${ratchet.reason}`);
    console.log(`   基线文件里 maxCount 是冻结上限（只许收缩）；当前基线登记 ${base.count} 键 > 上限 ${cap} 键。`);
    console.log('   ⇒ 说明有人用 --update 把新债洗成了「合法存量」。修法：把那些引用改成真实路径或删掉，');
    console.log('      再跑 --update 收缩基线；若确需抬上限，须 --raise-cap N --raise-reason "…" 显式抬并写明理由。');
    process.exit(1);
}

// 常规判定：基线外新增 ⇒ 红；基线内已消失 ⇒ 提示收缩（不红）
const baseKeys = new Set(base.refs);
const seenKeys = new Set(hits.map(keyOf));
const fresh = hits.filter(h => !baseKeys.has(keyOf(h)));
const gone = [...baseKeys].filter(k => !seenKeys.has(k));

console.log(`文件编号引用存活：七层 ${scanned} 文件，陈旧引用现存量 ${seenKeys.size} 键（基线 ${baseKeys.size} / 冻结上限 ${cap}）`);
if (gone.length) console.log(`  · 存量已修 ${gone.length} 键（提示：跑 --update 收缩基线，不判红）`);
if (fresh.length) {
    const byFile = new Map();
    for (const h of fresh) { if (!byFile.has(h.file)) byFile.set(h.file, []); byFile.get(h.file).push(h); }
    console.log(`\n❌ 新增陈旧引用 ${fresh.length} 处 / ${byFile.size} 文件（目标层目录不存在该编号文件）：`);
    for (const [f, list] of byFile) {
        console.log(`  ${f}:`);
        for (const h of list.slice(0, 8)) console.log(`    L${h.line}  ${h.ref}  …  ${h.ctx}`);
        if (list.length > 8) console.log(`    … 另 ${list.length - 8} 处`);
    }
    process.exit(1);
}
console.log('✅ 无新增陈旧引用（存量均在基线内，不拦路）');
