// tests/ver-drift-selftest.mjs — 版本常量漂移自检（第 20 项，计退码）
// V1.4.1 | 2026-10-31 第 165 轮(续)：⑩ 把 tests/_verify145.mjs 补登 NO_VER_WHITELIST（一页式 verify 助手，
//        | 非版本化自检，与 buff-picker 同口径）；⑬ EXPECT_NO_LOG 29 → 50 —— 抽样核实 50 个无日志文件
//        | 全部是「版本史写在注释正文、无可解析日志行」的既有模式（含 ver-bump-selftest / 170-taunts /
//        | 123-claw-heal-spam / 140-wei-dodge-cloud 等），非日志写坏；项目夜里合入一批新规则文件致桶涨，
//        | 双向棘轮要求如实重校基数（腐烂登记不许挂着骗人）。
// V1.4.0 | 2026-10-29 夜间第 156 轮：mutation-teeth A8/A19 双路径锚点修复后全量重跑 47 棵树，
//        | 其 VER 正式升到 V2.9.16，旧 hold 核销；HOLD_WHITELIST 2 → 1、MAX_HOLD 2 → 1。
// V1.3.3 | 2026-10-29 夜间第 156 轮：EXPECT_NO_LOG 30 → 29（合并上游 d7f8fee 后，
//        | 140-wei-dodge-cloud.js V6.1.1 补上 D 类版本日志行，从无日志桶进入可比对范围；
//        | 按双向棘轮「腐烂的登记不许挂着骗人」同步改小，未放宽任何判据）
// V1.3.2 | 2026-10-28 第 143 轮(续5)：EXPECT_NO_LOG 32 → 30（本次给 127-butterfly-stack / 143-jiuyang-heal-pct
//        | 两规则补了版本日志行 ⇒ 无日志桶再少两个；仍按「腐烂的登记不许挂着骗人」同步改小）
//        | 出生即带版本日志行 ⇒ 无日志桶少一个；按第 133 轮通规「腐烂的登记不许挂着骗人」同步改小）
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
//
// 【断言清单】①规模闸门 ②漂移零容忍 ③hold 在册 ④hold 在位 ⑤hold 棘轮 ⑥hold 必有落差 ⑦VER 路径自证
//   ⑧覆盖面（两种后缀都必须在册）⑨VER 耦合入库存产物（见 VER_EMBEDDED_IN）⑩无 VER 名单双向棘轮
//   ⑪可解析日志规模闸门（①守不住的那个口径）⑫VER 不得重复声明 ⑬无日志名单规模双向棘轮
//   每条都做过验牙（见体检迭代日志第 135 / 136 / 137 轮），验牙时均转红、还原后回绿。
//
// 用法：node tests/ver-drift-selftest.mjs
export const VER = 'tests/ver-drift-selftest.mjs V1.4.1';

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

// 可解析日志闸门：带 VER 的文件里，**真正有版本日志可比对的**那部分的下限。实测 26。
// ★ 为什么①守不住这个口子：①数的是「带 VER 的文件数」（77），而②比对的前提是 logMax 非空。
//   实测 77 个带 VER 的文件里只有 26 个有可解析的版本日志，另外 51 个被②整体跳过。
//   若版本日志正则腐烂，logMax 全空 ⇒ ②零命中 ⇒ ①仍以 77≥70 放行 ⇒ 打印全绿而实际比对 0 个文件。
//   这正是①当初要防的「空集出绿」，只是它量的是另一个口径，故必须另立一根线。
// 实测 43（V1.3.0 认全四种版本行写法后，由 26 涨到这里）。
const MIN_LOG_PARSED = 37;

// 无日志名单规模：当前「有 VER 但没有可解析版本日志」的文件数。
// 沿革：51（第 137 轮，只认标准约定时）→ 34（第 138 轮，认全四种写法后；剩下 34 个的头顶压根没有
// 版本行，47 个 health-rules 规则文件里有 33 个属此类 —— 它们的版本史写在注释正文里，凑不成一行log）
// → 33（第 139 轮：158-fact-anchor-align.js 按新数据结构重写时补上了 V2.0.0 版本日志行，
//   从「无日志桶」进入可比对范围；另 ver-bump-selftest.mjs 修正口径时同样补齐了 A 写法日志行）
// → 32（第 145 轮：新增 tests/_lib/static-truth-slice.mjs V1.0.0，出生即带标准版本日志行，
//   直接落在可比对侧而非无日志桶；另上游 fa6f206f 合并后 ver 面整体重算，实测无日志 32 个）。
// → 50（第 165 轮(续)：夜里合入一批新健康规则文件（160~172 等），其版本史按设计写在注释正文、
//   无可解析日志行，桶随之上涨；抽样核实 50 个全是既有「正文史」模式、无日志写坏，故如实重校基数。
//   双向棘轮维持：谁补了日志须回头把本数改小，谁掉了日志（<50）或冒出新孤儿（>50）仍红）。
// 双向棘轮，与⑩同口径：多出一个（新增孤儿或某文件的日志被写坏）要红；少一个（谁补了日志）也要红——
// 后者必须回头把本常量改小，否则这个数就变成骗人的装饰（第 133 轮通规：白名单不是挂在那骗人的）。
const EXPECT_NO_LOG = 50;

// 刻意 hold 白名单：key = 相对仓库根的路径，value = 理由（不得为空）。
const HOLD_WHITELIST = {
    'tests/140-baseline.js':
        'VER 会被 140-baseline.js 写进入库产物 tests/baselines/baseline-v1.json 的 version 字段（generatedAt 同批写入）。单抬 VER 到 V1.7.2 而不动该 json，会让「已入库基线的 version」与「脚本自报的 VER」脱节。是否允许连带刷新 json 的 version 字段属动基线范畴，须白天会话拍板，故本轮只登记 hold 并把耦合面交给断言⑨盯住。'
};

// hold 棘轮：白名单条数上限，只许收缩。新增 hold 必须同时说明理由。
// ★ 1→2 的理由（第 136 轮）：本轮覆盖面扩到 .js 后新浮出一处漂移除 140-baseline，它与 mutation-teeth
//   是**两类不同性质的 hold**——前者是「抬 VER 会让 древ 旧结果判陈旧」，后者是「抬 VER 会与入库产物 version
//   脱节且须先拍板」。用同一条 hold 兜不住两种口径，故显式上调上限并落理由，不偷偷加。
const MAX_HOLD = 1;

// VER 耦合面：这些文件的 VER 会被写进某个**已入库产物**的字段里。抬 VER 时必须连带刷新产物，否则
// 「脚本自报的版本」与「产物里留的版本」各说各话，事后无从追溯这份产物是按哪一版口径生成的。
// key = 源文件相对路径；value = { 产物相对路径, 取值方式, 期望等于 VER 的原始串 }
const VER_EMBEDDED_IN = {
    'tests/140-baseline.js': {
        artifact: 'tests/baselines/baseline-v1.json',
        how: '顶层 version 字段（140-baseline.js 第 258 行 JSON.stringify 时写入）'
    }
};

// --- 版本日志条目的**四种历史约定**（V1.3.0 新增 B/C/D，见头顶日志）
//   A 标准约定（夜间线自检文件通用）：  // V1.2.0 | 2026-10-26 第 137 轮：说明
//   B 文件名前缀・带竖线（日间线）：   // tests/example.mjs | V1.0.0 | 2026-10-25 第 133 轮
//   C 文件名前缀・无竖线：             // tests/example.mjs V1.0.0
//   D 中文全角括号（规则文件通用）：   // V6.1.13（2026-10-19 第 103 轮）：说明
// ★ B/C 只认文件头 HEAD_LOG_WINDOW 行内 —— 它们都是「文件标头」形状；放宽到全文会被正文里
//   引用别的文件版本的注释误命中（第 133 轮口径：注释里常出现 V6.8.5 这类引用，取 max 即假漂移）。
// ★ 每种格式都带一条**自证样例行** SAMPLE：断言⑭先验证"这个格式还认得出它自己的样例"，
//   再验证"它今天在仓库里仍有真实文件在用"，两头一起锁，正则被人改坏或某种约定整体消失都会响。
const HEAD_LOG_WINDOW = 80;
const LOG_PATTERNS = [
    {
        id: 'A', headOnly: false, minFiles: 22,
        re: /^\s*\/\/\s*V(\d+\.\d+(?:\.\d+)?)\s*\|/,
        sample: '// V1.2.0 | 2026-10-26 第 137 轮：说明',
        note: '标准约定'
    },
    {
        id: 'B', headOnly: true, minFiles: 8,
        re: /^\s*\/\/\s*[\w.@/-]+\.(?:mjs|js)\s*\|\s*V(\d+\.\d+(?:\.\d+)?)\s*\|/,
        sample: '// tests/example.mjs | V1.0.0 | 2026-10-25 第 133 轮',
        note: '文件名前缀带竖线'
    },
    {
        id: 'C', headOnly: true, minFiles: 1,
        re: /^\s*\/\/\s*[\w.@/-]+\.(?:mjs|js)\s+V(\d+\.\d+(?:\.\d+)?)\s*$/,
        sample: '// tests/example.mjs V1.0.0',
        note: '文件名前缀无竖线'
    },
    {
        id: 'D', headOnly: false, minFiles: 6,
        re: /^\s*\/\/\s*V(\d+\.\d+(?:\.\d+)?)\s*[（(]/,
        sample: '// V6.1.13（2026-10-19 第 103 轮）：说明',
        note: '中文全角括号'
    },
];
// VER 常量：const VER = '<path> V<x.y.z>'
const RE_VER = /^(?:export\s+)?const\s+VER\s*=\s*'([^']*)'/m;
// 同一份 VER 常量的**全部**声明（⑫用）：RE_VER 是非全局的、只取第一处，若一个文件里声明了两处，
// 第一处之后的都永远不被看见 —— 修漂移时改错那一处就成了「改了下面那个、上面还在撒谎」。
const RE_VER_ALL = /^(?:export\s+)?const\s+VER\s*=\s*'[^']*'/gm;
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
const noLogFiles = [];
// 每种被认可的版本行格式今天各命中了多少个真实文件（断言⑭的格式覆盖面棘轮用）
const fmtHits = {};
for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const rel0 = path.relative(repoRoot, f).split(path.sep).join('/');
    const m = src.match(RE_VER);
    if (!m) { noVerFiles.push(rel0); continue; }
    const rel = path.relative(repoRoot, f).split(path.sep).join('/');
    const raw = m[1];
    const parsed = raw.match(/^(\S+)\s+V(\d+\.\d+(?:\.\d+)?)$/);
    const dupVer = (src.match(RE_VER_ALL) || []).length;
    const logVers = [];
    const hitFmt = new Set();
    let hold = false;
    const lines = src.split('\n');
    for (let li = 0; li < lines.length; li++) {
        const ln = lines[li];
        for (const p of LOG_PATTERNS) {
            if (p.headOnly && li >= HEAD_LOG_WINDOW) continue;
            const lm = ln.match(p.re);
            if (lm) { logVers.push(lm[1]); hitFmt.add(p.id); }
        }
        if (RE_HOLD.test(ln)) hold = true;
    }
    for (const id of hitFmt) fmtHits[id] = (fmtHits[id] || 0) + 1;
    const uniq = [...new Set(logVers)].sort(cmpVer);
    if (uniq.length === 0) noLogFiles.push(rel);
    recs.push({
        rel,
        raw,
        verPath: parsed ? parsed[1] : null,
        verNum: parsed ? parsed[2] : null,
        logMax: uniq.length ? uniq[uniq.length - 1] : null,
        hold,
        dupVer,
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
    'tests/_verify145.mjs',
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

// ⑫ VER 不得重复声明：RE_VER 只取第一处，第二处起永远不被任何断言看见
for (const r of recs) {
    if (r.dupVer > 1) {
        push('⑫', `${r.rel} 里声明了 ${r.dupVer} 处 VER 常量 —— 只有第一处会被比对，其余是永不生效的谎言（应合并为一处）`);
    }
}

// ⑪ 可解析日志规模闸门：真正拿去比对的文件数，①守不住这个口径（见常量处说明）
const logParsed = recs.filter(r => r.logMax).length;
if (logParsed < MIN_LOG_PARSED) {
    push('⑪', `有可解析版本日志的文件 ${logParsed} < 下限 ${MIN_LOG_PARSED}（版本日志抽取器可能已失效：此时②会跳过全部文件、①仍按 VER 数放行，形成「比对 0 个却打印全绿」的假绿）`);
}

// ⑬ 无日志名单规模双向棘轮（与⑩同口径：多一个少一个都要红）
if (noLogFiles.length > EXPECT_NO_LOG) {
    push('⑬', `有 VER 但无版本日志的文件 ${noLogFiles.length} > 登记 ${EXPECT_NO_LOG}（新增了无法比对版本的孤儿，或某文件的版本日志被写坏了）`);
} else if (noLogFiles.length < EXPECT_NO_LOG) {
    push('⑬', `有 VER 但无版本日志的文件 ${noLogFiles.length} < 登记 ${EXPECT_NO_LOG}（有文件补上了日志，须回头把 EXPECT_NO_LOG 改小 —— 腐烂的登记不许挂着骗人）`);
}

// ⑭ 版本行**格式**覆盖面双向锁（第 138 轮）：每条下述两块都要过硬，缺一块即红。
//   一、自证：每个被收录的格式必须认得出自己的样例行 —— 改正则时悄悄丢掉某一族（例如把
//      `[（(]` 写回 `\|`），掉下去的文件会重新跌进"无日志桶"，而①③⑪⑬一条都不会响。
//   二、实占：每个格式今天仍要有真实文件在用 —— 一旦某族文件集体改写写法，这里会说清楚
//      "该格式已无用户"，而不是让覆盖面悄悄缩水（届时须按实测量更新登记，不许直接删掉这条格式）。
for (const p of LOG_PATTERNS) {
    if (!p.sample.match(p.re)) {
        push('⑭', `版本行格式 ${p.id}（${p.note}）认不出它自己的样例行「${p.sample}」—— 该格式已失效，`
            + `其下的文件会跌进「无日志桶」而②整批跳过它们（这正是⑬看到的"孤儿"）`);
    }
    const n = fmtHits[p.id] || 0;
    if (n < p.minFiles) {
        push('⑭', `版本行格式 ${p.id}（${p.note}）只命中 ${n} 个真实文件 < 登记下限 ${p.minFiles}`
            + ` —— 该族写法正在消失，覆盖面已缩水，按实测量更新登记前不许删掉这条格式`);
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
    console.log(`   扫描 ${scanned} 个带 VER 文件（其中 ${logParsed} 个可比对版本）· 无日志 ${noLogFiles.length} 个 · 无 VER ${noVerSet.size} 个 · hold ${holded} 个 · 白名单 ${holds.length} 条`);
    process.exit(1);
}

console.log('✅ 版本常量漂移自检通过'
    + `（14 项断言：规模闸门 ${scanned}≥${MIN_VER_FILES} / 漂移零容忍 / hold 在册 / hold 在位 / hold 棘轮 ≤${MAX_HOLD} / hold 必有落差 / VER 路径自证 / 覆盖面 .js ${jsWithVer}≥${MIN_JS_VER_FILES} / VER 耦合产物一致 / 无 VER 名单相等 / 可解析日志 ${logParsed}≥${MIN_LOG_PARSED} / VER 不重复 / 无日志规模 =${EXPECT_NO_LOG} / 版本行写法四族自证与实占）`
    + ` · ${scanned} 个带 VER 文件（其中 .js ${jsWithVer} 个），**仅 ${logParsed} 个有版本日志可比对**（其余 ${noLogFiles.length} 个无日志、不参与漂移判定），${driftFree} 个 VER 与日志一致，hold ${holded} 个（白名单 ${holds.length} 条）`);
