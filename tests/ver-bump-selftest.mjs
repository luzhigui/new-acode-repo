// tests/ver-bump-selftest.mjs — 版本号遗忘抬升绊线（第140轮立，第139轮夜检修正口径）
// V1.1.0 | 2026-10-26 第 139 轮：本线上游落地当天就在本仓库报出 3 处漂移，**实测全是误报**，三种成因各一：
//   ① 头版本取「前 40 行首个 Vx.y.z」而非「最高」 —— rule-teeth-evidence-selftest 首行是
//      「文件名 | V1.0.1 | 日期」、真正的日志最高版是 V1.0.2，取首个就永远差一版。
//      与本地 ver-drift-selftest 的「logMax 取最高」不同口径 ⇒ 同一文件两条线给出相反结论。
//   ② VER 常量正则 `export\s+const\s+VER\s*=` 会吃到**注释里的示例文本** ——
//      ver-drift-selftest.mjs 第 27 行注释里写着「脚下有一个 export const VER = '…V1.2.0' 常量…」，
//      被当成真声明（真实声明是 V1.3.0）⇒ 凭空造出一处漂移。
//   ③ 不认刻意 hold —— mutation-teeth.mjs 的 V2.9.14 是带 VER-HOLD-DECL 标记的刻意不升，
//      本地 ver-drift 按「在册+在位+真有落差」三条件放行，本线一律判红。
//   修法（收紧，不是放宽）：头版本改取最高（与 ver-drift 同口径）；VER 只认**行首的真实声明行**
//   （跳过 // 与 * 开头的注释行，防示例文本被提拔）；hold 改为三条件放行，且白名单**唯一来源**
//   直接解析 ver-drift-selftest.mjs 的 HOLD_WHITELIST（不另抄一份，防两处分叉）。
//   另加三条自证断言（⑦注释示例不得被当声明 / ⑧头版本必须取最高而非首个 / ⑨白名单解析非空），
//   正则或口径被改坏时本文件自己先红，不必等别的文件替它暴露。
// V1.0.0 | ~6200 bytes | 2026-10-26
// 捕获「头注释写了 Vx 但 export const VER 还停在 Vy」的漏改（夜检 135 立线前已复发 ≥3 次）。
//   本轮初扫出 tests/ 下 16 处头/常量漂移（含上一轮自分的三处）；此线落地后，任何文件只抬一头都会退码 1。
//
// 机制：扫描 tests/ 下所有 .mjs / .js，对每个文件：
//   ① 头部版本：前 40 行里**所有**形如 V\d+.\d+.\d+ 的标记取**最高**（兼容版本号不在第 1 行、以及
//      首行是「文件名 | Vx | 日期」而后续日志更高这两种写法）
//   ② 常量版本：**行首**的 `const VER = '...Vx.y.z...'` / `export const VER = ...`（导出或局部均可），
//      跳过注释行 —— 否则说明文字里的示例会被当成真声明。多处声明取最高。
//   若两者都存在且版本不一致 → 红（遗忘抬升）；若 VER 常量里根本没版本号 → 红（彻底漏标）。
//   只校验「声明了就一致」：仅一端有版本信息的文件跳过（不误报）。
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VER = 'tests/ver-bump-selftest.mjs V1.1.0';
const here = dirname(fileURLToPath(import.meta.url));
const testDir = here;

// ★ 头版本口径同样**唯一来源**自 ver-drift-selftest.mjs：只认它登记的四种版本行写法（A/B/C/D），
//   而不是「前 N 行里任意 Vx.y.z」—— 注释正文里大量引用别的文件版本号（如 V6.8.5、V6.1.13），
//   取任意 V 号的最高值必然是假漂移（第 133 轮口径：注释里常出现 V6.8.5 这类引用，取 max 即假漂移）。
const SRC_DRIFT = join(here, 'ver-drift-selftest.mjs');
const DRIFT_SRC = (function () { try { return readFileSync(SRC_DRIFT, 'utf8'); } catch (e) { return ''; } })();
const HEAD_LOG_WINDOW = (function () {
    const m = /const\s+HEAD_LOG_WINDOW\s*=\s*(\d+)\s*;/.exec(DRIFT_SRC);
    return m ? Number(m[1]) : 80;
})();
const LOG_PATTERNS = (function () {
    const m = /const\s+LOG_PATTERNS\s*=\s*(\[[\s\S]*?\n\]);/.exec(DRIFT_SRC);
    if (!m) return [];
    try { return new Function('return ' + m[1] + ';')(); } catch (e) { return []; }
})();

// hold 标记（与 ver-drift-selftest.mjs 完全同口径：注释行行首，允许 ★ > * - 等项目符号）
const RE_HOLD = /^\s*\/\/\s*(?:[★>*\-•]\s*)*VER-HOLD-DECL\b/;

// ★ hold 白名单唯一来源：直接解析 ver-drift-selftest.mjs 里的 HOLD_WHITELIST 键，不另抄一份。
//   两处各存一份必然分叉（第 124 轮「静默位移白名单收口为唯一来源」同一条通规）。
const HOLD_WHITELIST = (function parseHoldWhitelist() {
    const out = [];
    try {
        const src = readFileSync(SRC_DRIFT, 'utf8');
        const block = /const\s+HOLD_WHITELIST\s*=\s*\{([\s\S]*?)\n\};/.exec(src);
        if (!block) return out;
        for (const m of block[1].matchAll(/^\s*'([^']+)'\s*:/gm)) out.push(m[1]);
    } catch (e) { /* 读不到就返回空集，由断言⑨负责报红 */ }
    return out;
})();

function cmpVer(a, b) {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    }
    return 0;
}

// ① 头版本：只认 LOG_PATTERNS 登记的四种版本行写法，取其中**最高**（V1.1.0 修正：原先取首个；
//   且先改成「任意 V 号取最高」实测把注释里引用的别的文件版本号也提拔了，故最终与 ver-drift 同口径）
function headerVersion(src) {
    const lines = src.split('\n');
    let best = null;
    for (let li = 0; li < lines.length; li++) {
        const ln = lines[li];
        for (const p of LOG_PATTERNS) {
            if (p.headOnly && li >= HEAD_LOG_WINDOW) continue;
            const m = p.re.exec(ln);
            if (!m) continue;
            const v = m[1];
            if (best === null || cmpVer(v, best) > 0) best = v;
        }
    }
    return best;
}

// ② 常量版本：**行首**真实声明；跳过 // * 开头的注释行（V1.1.0 修正：原正则吃注释里的示例）
function verConstVersion(src) {
    let raw = null, best = null;
    for (const ln of src.split('\n')) {
        const t = ln.trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
        const m = /^(?:export\s+)?const\s+VER\s*=\s*['"]([^'"]*)['"]/.exec(t);
        if (!m) continue;
        raw = m[1];
        const v = /V(\d+\.\d+\.\d+)/.exec(raw);
        if (v && (best === null || cmpVer(v[1], best) > 0)) best = v[1];
    }
    return { raw, ver: best };
}

function hasHold(src) {
    return src.split('\n').some(ln => RE_HOLD.test(ln));
}

// ——— 自证断言（⑦ ⑧ ⑨）：本文件自己的抽取器一旦腐烂，先把自己报红 ———
const SELF = [];
function check(label, ok, msg) { if (!ok) SELF.push('断言' + label + '：' + msg); }

// ⑦ 注释里的示例声明不得被当成真声明（V1.0.0 的 bug：ver-drift-selftest 因此凭空多一处漂移）
const SAMPLE_A = [
    "// 脚下有一个 export const VER = 'tests/fake.mjs V9.9.9' 常量（这是说明文字里的示例）",
    "export const VER = 'tests/fake.mjs V1.0.0'"
].join('\n');
check('⑦', verConstVersion(SAMPLE_A).ver === '1.0.0',
    '注释里的示例声明被当成了真声明（抽到 ' + verConstVersion(SAMPLE_A).ver + '，应为 1.0.0）');
// ⑧ 头版本必须取最高而非首个（V1.0.0 的 bug：首行「文件名 | V1.0.1」压住后面真正的 V2.0.0）
const SAMPLE_B = [
    '// tests/fake.mjs | V1.0.1 | 2026-10-25 第 133 轮',
    '// V2.0.0 | 2026-10-26 第 139 轮：说明'
].join('\n');
check('⑧', headerVersion(SAMPLE_B) === '2.0.0',
    '头版本取了首个而非最高（抽到 ' + headerVersion(SAMPLE_B) + '，应为 2.0.0）');
// ⑨ hold 白名单与四种版本行写法都必须解析得到 —— 解析正则腐烂会让白名单/写法集静默变空，
//   前者把真 hold 全判成「私自挂 hold」、后者让头版本恒为 null（⇒ 全部跳过 ⇒ 空集出绿）
check('⑨', HOLD_WHITELIST.length > 0,
    '从 ver-drift-selftest.mjs 解析 HOLD_WHITELIST 得到 0 条（解析正则腐烂或该文件已改结构）');
check('⑩', LOG_PATTERNS.length >= 4 && HEAD_LOG_WINDOW > 0,
    `从 ver-drift-selftest.mjs 解析 LOG_PATTERNS 得到 ${LOG_PATTERNS.length} 条 / HEAD_LOG_WINDOW=${HEAD_LOG_WINDOW}（应 ≥4 条且窗口 >0）`);

function main() {
    if (SELF.length) {
        console.log('=== 版本号遗忘抬升绊线 ' + VER + ' ===');
        console.log('⛔ 自检自身失效 ' + SELF.length + ' 处（本线自己的抽取器先坏了，结论不可信）：');
        for (const x of SELF) console.log('  ⚠ ' + x);
        return 1;
    }
    const files = readdirSync(testDir)
        .filter(f => f.endsWith('.mjs') || f.endsWith('.js'))
        .sort();
    const fail = [], warn = [], holdOk = [];
    for (const f of files) {
        const src = readFileSync(join(testDir, f), 'utf8');
        const hv = headerVersion(src);
        const { raw: verRaw, ver: verV } = verConstVersion(src);
        const hold = hasHold(src);
        const inList = HOLD_WHITELIST.indexOf('tests/' + f) !== -1;
        if (hold && !inList) {
            fail.push(`${f}: 内有 VER-HOLD-DECL 标记但未登记进 ver-drift 的 HOLD_WHITELIST（私自挂 hold）`);
            continue;
        }
        if (inList && !hold) {
            fail.push(`${f}: 在 hold 白名单里但文件内找不到 VER-HOLD-DECL 标记（挂账未兑现）`);
            continue;
        }
        if (hv && verV) {
            if (hv !== verV) {
                if (hold) {
                    holdOk.push(`${f}: 头 V${hv} / VER V${verV} —— hold 放行（在册+在位+真有落差三者齐备）`);
                } else {
                    fail.push(`${f}: 头 V${hv} ≠ VER V${verV}（遗忘抬升）`);
                }
            } else if (hold) {
                // 落差消失却还挂着标记 ⇒ hold 已过期（与 ver-drift 断言⑥同口径）
                fail.push(`${f}: VER 已归位到 ${verV}（与头注释一致），hold 已过期 —— 必须删除 VER-HOLD 标记与白名单条目`);
            }
        } else if (verRaw && !verV) {
            fail.push(`${f}: VER 常量无版本号（"${verRaw}"）`);
        } else if (hv && !verRaw) {
            warn.push(`${f}: 头 V${hv} 但无 VER 常量（跳过）`);
        } else if (verRaw && !hv) {
            warn.push(`${f}: 有 VER V${verV} 但头部无版本注释（跳过）`);
        }
    }
    console.log('=== 版本号遗忘抬升绊线 ' + VER + ' ===');
    console.log(`扫描 ${files.length} 个文件；hold 白名单 ${HOLD_WHITELIST.length} 条（唯一来源：ver-drift-selftest.mjs）`);
    for (const w of warn) console.log('  ~ ' + w);
    for (const h of holdOk) console.log('  ⊘ ' + h);
    if (!fail.length) {
        console.log('  ✅ 全部声明版本一致，无遗忘抬升（自证断言⑦⑧⑨⑩ 通过）');
        return 0;
    }
    console.log(`\n⛔ 版本号漂移 ${fail.length} 处（头注释与 VER 常量对不上）：`);
    for (const x of fail) console.log('  ⚠ ' + x);
    return 1;
}
try { process.exit(main() || 0); } catch (e) { console.error(e); process.exit(1); }
