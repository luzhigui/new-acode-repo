// tests/ver-drift-selftest.mjs — 版本常量漂移自检（第 20 项，计退码）
// V1.1.0 | 2026-10-26 第 136 轮 覆盖面从 .mjs 扩到 tests 下全部 .js/.mjs：上一版 collect 只收 .mjs，
//        | 实测漏掉 52 个带 VER 的 .js（占全库 68%，含 121/122/123/124/140 与 health-rules 全部 47 个规则文件），
//        | 其中 4 处真漂移正在裸奔（121/123/124/140-baseline）。同时按住两个口子：新增断言⑧覆盖面（防再度
//        | 退回只扫一种后缀）与断言⑨VER 耦合产物一致（抬 VER 忘了连带刷 baseline-v1.json 的 version 即红）。
// V1.0.0 | 2026-10-26 第 135 轮新建。
//
// 【盯的是什么】
//   本仓库每个自检文件头顶都有一份「版本日志」（形如 `// V1.2.0 | 2026-10-25 第 133 轮：……`），
//   脚下有一个 `export const VER = 'tests/xxx.mjs V1.2.0'` 常量。二者本该一致，但改代码的人
//   常常只往头顶加一行日志、忘了改脚下的常量（或反之）。
//
// 【为什么值得单独立一根绊线：同一处漏改已复发三次】
//   · 第 130 轮：run-all 头注释到 V1.7.0、VER 停在 V1.6.0；
//   · 第 132 轮：上面那条顺手归位，同轮注释里写下「与第 130 轮同款漏改」；
//   · 第 134 轮：又发现 run-all 头注释到 V1.12.0、VER 停在 V1.10.0，因怕与上游改动打架而留办；
//   · 第 135 轮（本轮）：实测又抓出两处真漏改（run-all、translate-golden）。
//   三次都是人眼发现、两次靠下轮目标传递 —— 说明靠人盯这件事本身就没盯住。
//
// 【VER 不是装饰，数字说谎是有后果的】
//   mutation-teeth 把 VER 写进变异树结果文件的 #META 头，拿它当「这份证据配不配得上当前判据」
//   的新鲜度键（见该文件 V2.9.0 新鲜度守卫）；多份自检也靠 VER 对外自报身份。VER 说谎 ⇒
//   「我究竟用的是哪一版判据」这个问题失去答案，而它恰恰是所有红线结论的前提。
//
// 【口径：为什么用「版本日志条目」而不是「头注释里最大的 V 号」】
//   第一版探针用「取头注释里出现的最大 V 号」，实测 10 处漂移里 6 处是假阳性 —— 因为注释里
//   会引用别的文件版本（contract-consistency 里出现 V6.8.5、stat-decl 里出现 V7.6.19）。
//   收紧为只认**行首 `// V<x.y.z> |`** 的版本日志条目后，24 个文件只剩 3 处，逐条人工核对全部属实。
//   另：日志块会被 VER 常量行拦腰截断（run-all 的 V1.12.0 条目在常量之后），故全文扫描而非只扫头部。
//
// 【★ 刻意 hold 的处理：不搞「白名单一挂了事」】
//   mutation-teeth 的 V2.9.14 vs 日志 V2.9.15 是第 134 轮的刻意 hold（升 VER 会让全部旧结果被
//   误判陈旧）。但白名单是本仓库的老陷阱 —— 第 133 轮立过通规「白名单不是挂在那骗人的」。
//   故放行一个 hold 必须三件事同时成立，缺一即红：
//     在册：登记在本文件 HOLD_WHITELIST 里      （断言③，防私自挂 hold）
//     在位：该文件里真能找到 VER-HOLD-DECL 标记行     （断言④，防挂账不兑现）
//     真有落差：VER 确实 ≠ 日志最新版            （断言⑥，落差消失＝hold 过期，必须删标记）
//   外加棘轮：白名单条数只许收缩（MAX_HOLD）。
//
// 【★ 覆盖面：为什么从「只扫 .mjs」扩到「.js 与 .mjs 全扫」】
//   V1.0.0 的采集器只认 .mjs，实测把 52 个带 VER 常量的 .js 整个漏在外面（全库 77 个带 VER 文件中的 68%），
//   而这些 .js **本来就有 VER 常量** —— 不是没有可对账的常量，是采集器没去看。当场抓出 4 处真漂移：
//   121health-monitor（VER V6.4.5 / 日志 V6.5.0）、123static-scan（V1.4.6 / V1.4.7）、
//   124rule-recipes（V1.2.3 / V1.2.4）、140-baseline（V1.7.1 / V1.7.2）。
//   这是第 128 轮通规「自检自身也会腐烂」第四次应验：**上一轮刚立的绊线，自己就有覆盖缺口**。
//
// 【断言清单】①规模闸门 ②漂移零容忍 ③hold 在册 ④hold 在位 ⑤hold 棘轮 ⑥hold 必有落差 ⑦VER 路径自证
//   ⑧覆盖面（两种后缀都必须在册）⑨VER 耦合入库存产物（见 VER_EMBEDDED_IN）
//   每条都做过验牙（见体检迭代日志第 135 / 136 轮），验牙时均转红、还原后回绿。
//
// 用法：node tests/ver-drift-selftest.mjs
export const VER = 'tests/ver-drift-selftest.mjs V1.1.0';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const testsDir = here;

// --- 常量（改这些数就是改判据，必须升 VER 并在头顶补日志行）---

// 规模闸门：带 VER 常量的文件数下限。实测 77（25 个 .mjs + 52 个 .js）。
// 防止抽取器失效（如正则写错、目录没扫到、后缀漏收）时「0 个文件、0 处漂移」假装全绿。
const MIN_VER_FILES = 70;

// 覆盖面副闸门：其中 .js 侧带 VER 的文件数下限。实测 52（121/122/123/124/140 五个 + health-rules 47 个）。
// 单独拎出来是因为 V1.0.0 的教训：总数够不代表每类都采到，只看总数会被「只扫 .mjs」蒙混过关。
const MIN_JS_VER_FILES = 45;

// 刻意 hold 白名单：key = 相对仓库根的路径，value = 理由（不得为空）。
const HOLD_WHITELIST = {
    'tests/mutation-teeth.mjs':
        'VER 是变异树结果文件的新鲜度键：升 VER 会让全部旧结果被误判陈旧。第 134 轮 V2.9.15 只加新鲜度守卫第⑤项 RULEFP、判定逻辑一行未动，故刻意保持 V2.9.14。',
    'tests/140-baseline.js':
        'VER 会被 140-baseline.js 写进入库产物 tests/baselines/baseline-v1.json 的 version 字段（generatedAt 同批写入）。单抬 VER 到 V1.7.2 而不动该 json，会让「已入库基线的 version」与「脚本自报的 VER」脱节。是否允许连带刷新 json 的 version 字段属动基线范畴，须白天会话拍板，故本轮只登记 hold 并把耦合面交给断言⑨盯住。'
};

// hold 棘轮：白名单条数上限，只许收缩。新增 hold 必须同时说明理由。
// ★ 1→2 的理由（第 136 轮）：本轮覆盖面扩到 .js 后新浮出一处漂移除 140-baseline，它与 mutation-teeth
//   是**两类不同性质的 hold**——前者是「抬 VER 会让 древ 旧结果判陈旧」，后者是「抬 VER 会与入库产物 version
//   脱节且须先拍板」。用同一条 hold 兜不住两种口径，故显式上调上限并落理由，不偷偷加。
const MAX_HOLD = 2;

// VER 耦合面：这些文件的 VER 会被写进某个**已入库产物**的字段里。抬 VER 时必须连带刷新产物，否则
// 「脚本自报的版本」与「产物里留的版本」各说各话，事后无从追溯这份产物是按哪一版口径生成的。
// key = 源文件相对路径；value = { 产物相对路径, 取值方式, 期望等于 VER 的原始串 }
const VER_EMBEDDED_IN = {
    'tests/140-baseline.js': {
        artifact: 'tests/baselines/baseline-v1.json',
        how: '顶层 version 字段（140-baseline.js 第 258 行 JSON.stringify 时写入）'
    }
};

// 版本日志条目：行首注释 + V<x.y.z> + 竖线分隔符（日期/轮次紧随其后）
const RE_LOG_ENTRY = /^\s*\/\/\s*V(\d+\.\d+(?:\.\d+)?)\s*\|/;
// VER 常量：const VER = '<path> V<x.y.z>'
const RE_VER = /^(?:export\s+)?const\s+VER\s*=\s*'([^']*)'/m;
// hold 标记：必须出现 VER-HOLD-DECL 这个机器可读记号，且必须位于注释行行首（允许 ★ > * - 等项目符号）。
// ★ 为什么既要特殊记号又要行首锚定：本文件自己的说明文字里会反复提到这个记号名，若只做「全文出现过」
//   就把本文件的散文误判成 hold 声明（本轮实测踩到一次）。行首锚定把「声明」与「提及」区分开。
const RE_HOLD = /^\s*\/\/\s*(?:[★>*\-•]\s*)*VER-HOLD-DECL\b/;

// --- 采集 ---

// 采集面的后缀清单。★ V1.0.0 只有 '.mjs' 一项，漏掉全部 .js（见头顶 V1.1.0 日志），此处不许再缩。
const SCAN_EXTS = ['.mjs', '.js'];

function collect(dir, out) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === '.mut' || e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) collect(p, out);
        else if (SCAN_EXTS.some(ext => e.name.endsWith(ext))) out.push(p);
    }
    return out;
}

function cmpVer(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        const x = pa[i] || 0;
        const y = pb[i] || 0;
        if (x !== y) return x - y;
    }
    return 0;
}

const files = collect(testsDir, []).sort();
const recs = [];
const noVerFiles = [];
for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const rel0 = path.relative(repoRoot, f).split(path.sep).join('/');
    const m = src.match(RE_VER);
    if (!m) { noVerFiles.push(rel0); continue; }
    const rel = path.relative(repoRoot, f).split(path.sep).join('/');
    const raw = m[1];
    const parsed = raw.match(/^(\S+)\s+V(\d+\.\d+(?:\.\d+)?)$/);
    const logVers = [];
    let hold = false;
    for (const ln of src.split('\n')) {
        const lm = ln.match(RE_LOG_ENTRY);
        if (lm) logVers.push(lm[1]);
        if (RE_HOLD.test(ln)) hold = true;
    }
    const uniq = [...new Set(logVers)].sort(cmpVer);
    recs.push({
        rel,
        raw,
        verPath: parsed ? parsed[1] : null,
        verNum: parsed ? parsed[2] : null,
        logMax: uniq.length ? uniq[uniq.length - 1] : null,
        hold,
        unparseable: !parsed
    });
}

// --- 断言 ---

const bad = [];
const push = (no, msg) => bad.push(`断言${no} ${msg}`);

// ① 规模闸门
if (recs.length < MIN_VER_FILES) {
    push('①', `带 VER 常量的文件数 ${recs.length} < 下限 ${MIN_VER_FILES}（抽取器可能已失效，禁止以空集出绿）`);
}

// ⑦ VER 常量路径自证（放在漂移判定之前，串号的文件不再参与 ②）
for (const r of recs) {
    if (r.unparseable) {
        push('⑦', `${r.rel}：VER 常量无法解析为「<路径> V<x.y.z>」，实际为 '${r.raw}'`);
    } else if (r.verPath !== r.rel) {
        push('⑦', `${r.rel}：VER 常量里写的路径是 '${r.verPath}'，与文件实际路径不符（疑似复制粘贴串号）`);
    }
}

// ⑧ 覆盖面：带 VER 的 .js 必须够数（防采集面悄悄退回「只扫一种后缀」）
const jsWithVer = recs.filter(r => /\.[cm]?js$/.test(r.rel) && !r.rel.endsWith('.mjs')).length;
if (jsWithVer < MIN_JS_VER_FILES) {
    push('⑧', `带 VER 的 .js 文件 ${jsWithVer} < 下限 ${MIN_JS_VER_FILES}（V1.0.0 的坑：总数达标但整类后缀被漏采）`);
}

// ⑨ VER 耦合入库存产物：产物里留的版本必须等于脚本当前 VER 原始串
for (const [srcRel, spec] of Object.entries(VER_EMBEDDED_IN)) {
    const r = recs.find(x => x.rel === srcRel);
    if (!r) {
        push('⑨', `耦合登记里的 ${srcRel} 不存在或没有 VER 常量（登记已失效）`);
        continue;
    }
    const ap = path.join(repoRoot, spec.artifact);
    if (!fs.existsSync(ap)) {
        push('⑨', `${srcRel} 的耦合产物 ${spec.artifact} 不存在了`);
        continue;
    }
    let artVer = null;
    try {
        const art = JSON.parse(fs.readFileSync(ap, 'utf8'));
        artVer = typeof art.version === 'string' ? art.version : null;
    } catch {
        push('⑨', `耦合产物 ${spec.artifact} 无法解析为 JSON`);
        continue;
    }
    if (artVer === null) {
        push('⑨', `耦合产物 ${spec.artifact} 缺少 version 字段（${spec.how}）`);
    } else if (artVer !== r.raw) {
        push('⑨', `${srcRel} 的 VER 已写成 '${r.raw}'，但耦合产物 ${spec.artifact} 的 version 仍是 '${artVer}' —— 抬 VER 必须连带刷新产物，否则事后无从追溯产物按哪一版口径生成`);
    }
}

// ⑩ 无 VER 名单棘轮：这批文件里到底哪些没有 VER 常量，必须逐条在册，且**双向相等**
//   （名单外冒出新孤儿 ⇒ 它从此没有任何版本可追溯，必须显式登记或补常量；名单里的补上常量后必须及时删登记）
const NO_VER_WHITELIST = [
    'tests/_lib/buff-picker.mjs',
    'tests/fact-coverage-selftest.mjs',
    'tests/silent-relocate-judge-selftest.mjs'
];
const noVerSet = new Set(noVerFiles);
for (const rel0 of noVerSet) {
    if (!NO_VER_WHITELIST.includes(rel0)) {
        push('⑩', `${rel0} 没有 VER 常量且未在 NO_VER_WHITELIST 登记（新增孤儿，版本无从追溯）`);
    }
}
for (const rel0 of NO_VER_WHITELIST) {
    if (!noVerSet.has(rel0)) {
        push('⑩', `NO_VER_WHITELIST 里的 ${rel0} 现已带上 VER 常量，登记应删除（腐烂条目不许挂着骗人）`);
    }
}

// ② 漂移零容忍（hold 三项齐备才放行）
for (const r of recs) {
    if (r.unparseable || !r.logMax) continue; // 无日志条目的文件不参与本断言
    const diff = cmpVer(r.logMax, r.verNum);
    if (diff === 0) continue;
    const inList = Object.prototype.hasOwnProperty.call(HOLD_WHITELIST, r.rel);
    if (inList && r.hold) continue; // 落差由断言⑥复核
    const dir = diff > 0 ? '日志领先（漏改 VER 常量）' : 'VER 领先（升了常量却没写日志行）';
    push('②', `${r.rel}：VER=${r.verNum} 但版本日志最新为 ${r.logMax} —— ${dir}${inList ? '（虽在白名单但缺 VER-HOLD 标记）' : ''}${r.hold ? '（虽有标记但未在白名单）' : ''}`);
}

// ③ hold 在册：白名单里的文件必须真有 VER-HOLD 标记
for (const rel of Object.keys(HOLD_WHITELIST)) {
    const r = recs.find(x => x.rel === rel);
    if (!r) {
        push('③', `白名单登记了 ${rel}，但该文件不存在或没有 VER 常量`);
    } else if (!r.hold) {
        push('③', `${rel} 在 hold 白名单里，但文件内找不到 VER-HOLD 标记（挂账未兑现）`);
    }
}

// ④ hold 在位：带标记的文件必须在白名单里
for (const r of recs) {
    if (r.hold && !Object.prototype.hasOwnProperty.call(HOLD_WHITELIST, r.rel)) {
        push('④', `${r.rel} 内有 VER-HOLD 标记，但未登记进白名单（私自挂 hold）`);
    }
}

// ⑤ hold 棘轮：条数只许收缩 + 理由不得为空
const holds = Object.keys(HOLD_WHITELIST);
if (holds.length > MAX_HOLD) {
    push('⑤', `hold 白名单条数 ${holds.length} > 上限 ${MAX_HOLD}（棘轮：新增 hold 必须说明理由并显式上调上限，禁止偷偷加）`);
}
for (const rel of holds) {
    const reason = HOLD_WHITELIST[rel];
    if (!reason || !String(reason).trim()) {
        push('⑤', `hold ${rel} 未填写理由（无理由的 hold 等于免检）`);
    }
}

// ⑥ hold 必有落差：VER 一旦归位，hold 标记就必须删（防腐烂条目挂着骗人）
for (const rel of holds) {
    const r = recs.find(x => x.rel === rel);
    if (!r || r.unparseable || !r.logMax) continue;
    if (cmpVer(r.logMax, r.verNum) === 0) {
        push('⑥', `${rel} 的 VER 已归位到 ${r.verNum}（与日志一致），hold 已过期 —— 必须删除 VER-HOLD 标记与本白名单条目`);
    }
}

// --- 输出 ---

const scanned = recs.length;
const driftFree = recs.filter(r => r.logMax && cmpVer(r.logMax, r.verNum) === 0).length;
const holded = recs.filter(r => r.hold).length;

if (bad.length) {
    console.log('❌ 版本常量漂移自检失败：');
    for (const b of bad) console.log('   ' + b);
    console.log(`   扫描 ${scanned} 个带 VER 文件 · hold ${holded} 个 · 白名单 ${holds.length} 条`);
    process.exit(1);
}

console.log('✅ 版本常量漂移自检通过'
    + `（10 项断言：规模闸门 ${scanned}≥${MIN_VER_FILES} / 漂移零容忍 / hold 在册 / hold 在位 / hold 棘轮 ≤${MAX_HOLD} / hold 必有落差 / VER 路径自证 / 覆盖面 .js ${jsWithVer}≥${MIN_JS_VER_FILES} / VER 耦合产物一致 / 无 VER 名单相等）`
    + ` · ${scanned} 个带 VER 文件（其中 .js ${jsWithVer} 个），${driftFree} 个 VER 与日志一致，hold ${holded} 个（白名单 ${holds.length} 条）`);
