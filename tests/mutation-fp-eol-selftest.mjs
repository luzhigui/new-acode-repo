// tests/mutation-fp-eol-selftest.mjs — 变异指纹换行等价自证（第 190 棒，挂 OBSERVES）
// V1.0.0 | 2026-11-08 迭代：给 mutation-teeth.mjs V2.9.32 的「生成侧归一化 + 比较侧三态等价」上 23 条牙。
//   由头：独立 worktree 全量重跑 49 树灌回主仓后，规则面 42 文件字节相同、6 文件纯 CRLF↔LF、
//   0 文件真实内容差异，却因指纹按原始字节算被判陈旧。修法只扩大「等价」定义到换行形态，
//   真实字节改动 / 文件增删改名必须仍判红 —— 本脚本就是这两面的负路径自证。
//   ★ 不 import mutation-teeth.mjs：该文件顶层直接跑 main()，import 会触发整轮报告；
//     沿用 tests/.mut/drive.mjs 的 sliceBetween 手法抽函数源码文本到沙箱执行，零副作用。
export const VER = 'tests/mutation-fp-eol-selftest.mjs V1.0.0';

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const SRC = path.join(HERE, 'mutation-teeth.mjs');

function sliceBetween(src, from, to) {
    const a = src.indexOf(from);
    if (a < 0) throw new Error(`抽取起点缺失：${from}（判据被改名/重构？）`);
    const b = src.indexOf(to, a + from.length);
    if (b < 0) throw new Error(`抽取终点缺失：${to}（判据被改名/重构？）`);
    return src.slice(a, b);
}

// 抽出真身函数（不是复制实现）：判据源码一改，这里立刻跟着变/立刻报抽取失败。
function loadFP(here, repo) {
    const src = fs.readFileSync(SRC, 'utf8');
    const parts = [
        sliceBetween(src, 'function ruleFingerprint() {', '\n// 引擎源码指纹'),
        sliceBetween(src, 'function engineFingerprint() {', '\n// BRE 转义'),
        sliceBetween(src, '// ── FP-EOL-BEGIN ─', '// ── FP-EOL-END ─'),
    ];
    const fnText = parts.join('\n') +
        '\nreturn { ruleFingerprint, engineFingerprint, ruleFingerprintVariants, engineFingerprintVariants, eolVariants };';
    return new Function('crypto', 'fs', 'path', 'HERE', 'REPO', 'execSync', fnText)(
        crypto, fs, path, here, repo, () => { throw new Error('沙箱内不应调用 git'); });
}

const BASE = {
    'tests/health-rules/r1.js': 'const a = 1;\nfunction f() {\n  return a;\n}\n',
    'tests/health-rules/r2.js': 'const b = 2;\n',
    'tests/122health-utils.js': 'export const u = 3;\n',
    'core/c1.js': 'export const c = 4;\n',
    'modules/m1.js': 'export const m = 5;\n',
};

const results = [];
function check(id, desc, fn) {
    try {
        const ok = fn();
        results.push({ id, desc, ok: !!ok });
    } catch (e) {
        results.push({ id, desc, ok: false, err: e && e.message });
    }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-fp-eol-'));
const sandbox = path.join(tmp, 'repo');
const SHERE = path.join(sandbox, 'tests');
fs.mkdirSync(path.join(SHERE, 'health-rules'), { recursive: true });
for (const d of ['core', 'modules']) fs.mkdirSync(path.join(sandbox, d), { recursive: true });

const toCRLF = s => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
function reset(mode = 'lf', extra = null) {
    for (const d of ['health-rules']) {
        for (const f of fs.readdirSync(path.join(SHERE, d))) {
            const p = path.join(SHERE, d, f);
            if (fs.statSync(p).isFile()) fs.unlinkSync(p);
        }
    }
    const entries = { ...BASE, ...(extra || {}) };
    for (const [rel, txt] of Object.entries(entries)) {
        let body = txt;
        if (mode === 'crlf') body = toCRLF(txt);
        else if (mode === 'mixed') body = rel.endsWith('r1.js') || rel.endsWith('c1.js') ? toCRLF(txt) : txt;
        const abs = path.join(sandbox, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, body, 'utf8');
    }
}
const FP = loadFP(SHERE, sandbox);

// Z1 生成侧默认 = 归一化：无参值必须等于 lf 变换值，且与旧字节口径不同。
reset('lf');
const rawOf = FP.eolVariants()[0];   // 历史证据的旧口径（按原始字节）
const lfOf = FP.eolVariants()[1];    // 新生成侧口径（逐文件统一 LF）
const ruleBase = FP.ruleFingerprint(), engBase = FP.engineFingerprint();
check('Z1a', '规则：无参值 = 归一化变换值（生成侧口径）', () => FP.ruleFingerprint(lfOf) === ruleBase);
check('Z1b', '引擎：无参值 = 归一化变换值（生成侧口径）', () => FP.engineFingerprint(lfOf) === engBase);
// 纯 LF 沙箱里 raw 与归一化本就相等，必须在 CRLF 态才能证明默认变换真的生效。
reset('crlf');
check('Z1c', 'CRLF 态：规则无参值 ≠ 旧字节口径（默认归一化生效）', () => FP.ruleFingerprint(rawOf) !== FP.ruleFingerprint());
check('Z1d', 'CRLF 态：引擎无参值 ≠ 旧字节口径', () => FP.engineFingerprint(rawOf) !== FP.engineFingerprint());
check('Z1e', 'CRLF 态：无参值仍等于 LF 态基准（归一化稳定）', () => FP.ruleFingerprint() === ruleBase && FP.engineFingerprint() === engBase);
reset('lf');

// Z2/Z3 双向换行互认：旧口径确实会因换行而变（假红成因实证），但等价集合仍认历史证据。
const legacyRuleLF = FP.ruleFingerprint(rawOf), legacyEngLF = FP.engineFingerprint(rawOf);
reset('crlf');
check('Z2a', 'LF→CRLF：旧字节口径确实变了（假红成因实证）', () => FP.ruleFingerprint(rawOf) !== legacyRuleLF);
check('Z2b', 'LF→CRLF：规则等价集合仍认 LF 侧历史证据', () => FP.ruleFingerprintVariants().has(legacyRuleLF));
check('Z2c', 'LF→CRLF：引擎等价集合仍认 LF 侧历史证据', () => FP.engineFingerprintVariants().has(legacyEngLF));
const legacyRuleCRLF = FP.ruleFingerprint(rawOf), legacyEngCRLF = FP.engineFingerprint(rawOf);
reset('lf');
check('Z3a', 'CRLF→LF：规则等价集合仍认 CRLF 侧历史证据', () => FP.ruleFingerprintVariants().has(legacyRuleCRLF));
check('Z3b', 'CRLF→LF：引擎等价集合仍认 CRLF 侧历史证据', () => FP.engineFingerprintVariants().has(legacyEngCRLF));

// Z4 混合换行（部分 CRLF / 部分 LF）：两侧历史证据都要能认。
reset('mixed');
check('Z4a', '混合换行：仍认纯 LF 侧规则历史证据', () => FP.ruleFingerprintVariants().has(legacyRuleLF));
check('Z4b', '混合换行：仍认纯 CRLF 侧规则历史证据', () => FP.ruleFingerprintVariants().has(legacyRuleCRLF));

// Z11（本轮结构修复的核心）：生成侧归一化后，任意换行分布都算同一个值。
const dist = [];
for (const mode of ['lf', 'crlf', 'mixed']) { reset(mode); dist.push([FP.ruleFingerprint(), FP.engineFingerprint()]); }
check('Z11a', '生成侧：全LF/全CRLF/混合换行 规则指纹全等', () => new Set(dist.map(x => x[0])).size === 1);
check('Z11b', '生成侧：全LF/全CRLF/混合换行 引擎指纹全等', () => new Set(dist.map(x => x[1])).size === 1);

// Z5 真实改一个字节 ⇒ 三态全变，绝不能被「等价」放过（本轮最关键的负路径）。
reset('lf');
fs.appendFileSync(path.join(SHERE, 'health-rules/r1.js'), '// real change\n', 'utf8');
fs.appendFileSync(path.join(sandbox, 'core/c1.js'), '// real change\n', 'utf8');
check('Z5a', '规则真实改字节：三态集合不含旧指纹 ⇒ 必红', () => !FP.ruleFingerprintVariants().has(ruleBase));
check('Z5b', '引擎真实改字节：三态集合不含旧指纹 ⇒ 必红', () => !FP.engineFingerprintVariants().has(engBase));

// Z6~Z8 文件清单变化（新增 / 删除 / 改名）同样必须判红。
reset('lf', { 'tests/health-rules/r3.js': 'const c = 9;\n' });
check('Z6', '新增规则文件：必红', () => !FP.ruleFingerprintVariants().has(ruleBase));
const keep = BASE['tests/health-rules/r2.js'];
reset('lf');
fs.unlinkSync(path.join(SHERE, 'health-rules/r2.js'));
check('Z7', '删除规则文件：必红', () => !FP.ruleFingerprintVariants().has(ruleBase));
reset('lf');
fs.renameSync(path.join(SHERE, 'health-rules/r2.js'), path.join(SHERE, 'health-rules/r9.js'));
check('Z8', '规则文件改名（内容不变）：必红', () => !FP.ruleFingerprintVariants().has(ruleBase));
void keep;

// Z9 变换本身不能退化成同一个函数（否则「三态等价」形同虚设）+ 裸 \r 归一。
check('Z9a', '三种换行变换互不恒等（含换行的输入）', () => {
    const [raw, lf, crlf] = FP.eolVariants();
    const x = Buffer.from('a\r\nb\rc\n', 'utf8');
    const s = b => (Buffer.isBuffer(b) ? b.toString('utf8') : String(b));
    return s(raw(x)) !== s(lf(x)) && s(lf(x)) !== s(crlf(x));
});
check('Z9b', '裸 CR 也被归一成 LF', () => {
    const [, lf] = FP.eolVariants();
    return lf('a\rb').toString('utf8') === 'a\nb';
});

// Z10 真身源码自洽：当前仓库里 raw 项必须仍等于无参调用（防日后改动把生成侧/比较侧写歪）。
const REAL = loadFP(HERE, REPO);
check('Z10a', '真实仓库：规则无参值 ∈ 等价集合', () => REAL.ruleFingerprintVariants().has(REAL.ruleFingerprint()));
check('Z10b', '真实仓库：引擎无参值 ∈ 等价集合', () => REAL.engineFingerprintVariants().has(REAL.engineFingerprint()));

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* 临时目录清理失败不影响判定 */ }

const bad = results.filter(r => !r.ok);
console.log(`=== 变异指纹换行等价自证 ${VER} ===`);
for (const r of results) console.log(`  ${r.ok ? '✅' : '❌'} ${r.id} ${r.desc}${r.err ? ' — ' + r.err : ''}`);
console.log(`结果：${results.length - bad.length}/${results.length} 通过`);
if (bad.length) { console.error('自证失败：等价集合被放宽或生成侧口径漂移'); process.exit(1); }
console.log('全部通过：换行差异自动兼容，真实内容/清单变化一律仍判陈旧。');
process.exit(0);
