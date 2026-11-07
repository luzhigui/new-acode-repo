// V1.3.0 | 2026-11-06 迭代：pickKeyLine 与 run-all.mjs V1.40.0 同步——新增可选 failed 参数，
//   调用方已知子进程 exit≠0 时优先挑负向结论行，避免「红脚本末尾打统计尾巴」把孤儿红项
//   摘要显示成通过。绿路径（含不传参）行为一字不变。三要素（关键词正则 / hit[hit.length-1] /
//   .slice(0,100)）与 run-all 保持同步，供 output-label-coupling-guard 线二继续对账。
// V1.2.0 | 2026-11-06 迭代：临时探针（_tmp-*）归 tempProbe 免跑面并点名，与 ver-bump/ver-drift
//   已统一的「排除 _tmp-*/_verify*」口径对齐。由头：11-04 起并行会话「全量入库」把一次性探针
//   tests/_tmp-probe-meteor.mjs 收进了仓库，本件把它当真孤儿 spawn 后 exit≠0，整轮普查报「1 个孤儿红
//   且不在清单」——红的是一次性探针输出，不是缺陷，却把真信号淹了。★ 免跑但不静默跳过：
//   归入免跑面逐条点名 + 单独汇总「临时探针残留 N 个（建议清理出 tests/）」，与 health-rules/
//   48 个 runtimeRule 同一套显形纪律。
// tests/orphan-selftest-sweep.mjs | V1.1.0 | 2026-11-04 迭代：collectScripts 改递归扫描（跳过
//     .mut 变异冻结树与 node_modules），把 tests/health-rules/（48 个运行时规则）与 tests/_lib/
//     （10 个辅助库）纳入普查视野。旧版只 readdirSync(tests) 顶层，使这两个子目录完全不在「孤儿
//     普查」里 —— 专抓盲区的脚本自己有盲区，与第 147 轮后 ver-bump 只扫顶层同族。health-rules/
//     归 runtimeRule 免跑但点名计入免跑面（浏览器宿主运行时规则，由 120test-runner 体检层盯守）。
// tests/orphan-selftest-sweep.mjs | V1.0.0 | 2026-10-28 夜间第 147 轮：新增「孤儿自检普查」。
//
//
// 本件做三件事，且三件都不改任何既有判据：
//   ①【清单取样面审计 · 公共件第五个受体】run-all 的清单是本件唯一的"已登记"真值，
//      而它是用正则从源文件里抠出来的 ⇒ 正是第 146 轮那款病（抠的东西可能只活在注释里）。
//      故走 _lib/static-truth-slice 的 auditAnchorSites 三视图审计：raw / line / strip，
//      只有 strip 认作真值，phantom 常驻报告；并留一份旧野路口径（只认行注释）作对照。
//      ★ 若哪天有人在注释里写一行 `script: 'tests/xxx.mjs'`，旧口径会把它当成已登记 ⇒
//        那个脚本从此永远不被普查、且报告上写着"无孤儿"。这就是本件要防的静默。
//   ②【孤儿枚举与分类】tests/ 下磁盘有、清单无的脚本，逐个给出分类与**命中理由**：
//      entry（总入口）/ self（本件自身）/ library（被别处 import）/ browserHost（需浏览器宿主，
//      node 直跑必崩，属环境不匹配而非缺陷）/ heavy（run-all 头注释明说不含的耗时件）。
//      ★ 免跑的每一类都必须在报告里点名并写出理由，不许静默跳过 —— 免跑面本身就是
//        一类可以静默扩大的东西：今天它是 4 条，明天多一条没人拦得住。
//   ③【跑孤儿并报红绿】其余逐个 spawnSync 跑一遍，记录退出码与结论行。
//      任一 exit≠0 ⇒ 报「红了但没人盯」。
//
// 退码口径（重要，别误会）：本件自己 exit 1 表示"存在红孤儿"，但它**挂在 run-all 的
//   OBSERVES（观察项）里、不计退码** —— 因为把它挂进 CHECKS 会让体检分母由 24 变 25，
//   属改既有结论，须拍板（第 146 轮原话）。挂在观察项则既不改分母、又天天在跑、结果可见。
//   哪天拍板要开红，把它从 OBSERVES 挪到 CHECKS 即可，本件逻辑一个字不用改。
//
// 本件与主代码的关系：只读 tests/ 与 run-all.mjs，不改任何文件（含 run-all 自身）。
//   ★ 它不自动把孤儿纳入清单 —— 那是改既有结论，须拍板。它只负责让这件事被看见。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditAnchorSites, stripComments, selfCheck as truthSelfCheck } from './_lib/static-truth-slice.mjs';

export const VER = 'tests/orphan-selftest-sweep.mjs V1.3.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const node = process.execPath;

const RUN_ALL = 'tests/run-all.mjs';
const SELF = 'tests/orphan-selftest-sweep.mjs';

// 抠清单的锚点：run-all 里两种清单（CHECKS / OBSERVES）都是 { name: ..., script: '...' } 形式。
// 用同一条锚点一次抠全 —— 只抠 CHECKS 会让所有观察项被误判成孤儿。
const RE_SCRIPT_ANCHOR = /script:\s*'[^']+'/g;
const RE_SCRIPT_VAL = /script:\s*'([^']+)'/g;

// 免跑白名单（重型件）。★ 带理由，且理由来自 run-all 自己的头注释，不是本件拍脑袋。
const HEAVY_SKIP = {
    'tests/mutation-teeth.mjs': 'run-all 头注释明写「不含变异牙齿（全量约 8 分钟）」，有意不挂清单',
};

// 子进程超时保护：孤儿是新面孔，没人知道它会不会挂住。卡住比红更糟（红至少报得出）。
const CHILD_TIMEOUT_MS = 180000;

function readIfExists(rel) {
    const abs = path.join(root, rel);
    try {
        return fs.readFileSync(abs, 'utf8');
    } catch (e) {
        return '';
    }
}

function matchAll(text, re) {
    const out = [];
    let m;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(text)) !== null) {
        out.push(m);
        if (m[0] === '') r.lastIndex++;
    }
    return out;
}

// 从一行输出里挑最能代表结论的那条（口径照抄 run-all 的 pickKeyLine，两处保持一致）
function pickKeyLine(out, failed) {
    const lines = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const hit = lines.filter((l) =>
        /RESULT|MATCH|✅|❌|通过|无失败|issue|偏差|未覆盖|未触发|全过|失败|Error|exit/i.test(l));
    let chosen = hit[hit.length - 1] || lines[lines.length - 1] || '';
    if (failed === true) {
        const neg = hit.filter((l) =>
            /❌|\bFAIL\b|Error|异常|致命|偏差|未覆盖|未触发|未通过|不一致|漂移|断链|红项|失败/i.test(l)
            && !/无失败|零失败/.test(l));
        if (neg.length) chosen = neg[neg.length - 1];
    }
    return chosen.slice(0, 100);
}

// ---------------------------------------------------------------------------
// ① 清单取样面审计（公共件第五个受体）
// ---------------------------------------------------------------------------
function auditRegistry() {
    const src = readIfExists(RUN_ALL);
    const audit = auditAnchorSites({ src, anchors: [{ id: 'script清单锚点', re: RE_SCRIPT_ANCHOR }] });
    const row = audit.rows[0] || { raw: 0, line: 0, strip: 0, phantomLine: 0, phantomTail: 0 };

    // 真值口径：只在剔干净注释的文本上抠（stripComments 与公共件三视图同源，不是另起一份口径）
    const truth = matchAll(stripComments(src), RE_SCRIPT_VAL).map((m) => m[1]);
    // 旧野路口径（第 146 轮 param-read-guard 同款：只认行注释、不认块注释、会被字符串里的 // 截断）
    const legacySrc = src.replace(/\/\/.*$/gm, '');
    const legacy = matchAll(legacySrc, RE_SCRIPT_VAL).map((m) => m[1]);

    const onlyTruth = truth.filter((x) => !legacy.includes(x));
    const onlyLegacy = legacy.filter((x) => !truth.includes(x));

    return { audit, row, truth, legacy, onlyTruth, onlyLegacy };
}

// ---------------------------------------------------------------------------
// ② 孤儿枚举与分类
// ---------------------------------------------------------------------------
// 递归收集 tests/ 下所有 .mjs/.js（相对路径形如 tests/health-rules/157-...js）。
// ★ 跳过 .mut（变异冻结树：含陈旧版本号与主代码副本，会炮制假孤儿/假漂移）与 node_modules。
// ★ 旧版只 readdirSync(tests) 顶层 → 漏掉 health-rules/ 与 _lib/ 整个子目录，使专抓盲区的
//   本件自己有盲区（与 ver-bump 只扫顶层同族）。递归后子目录文件经 classify 按前缀分发。
function collectScripts() {
    const out = [];
    const seen = new Set();
    function walk(rel) {
        let ents;
        try {
            ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
        } catch (e) {
            return;
        }
        for (const e of ents) {
            if (e.name === '.mut' || e.name === 'node_modules' || e.name === '.git') continue;
            const full = rel + '/' + e.name;
            if (e.isDirectory()) { walk(full); continue; }
            if (e.isFile() && (e.name.endsWith('.mjs') || e.name.endsWith('.js'))) {
                if (!seen.has(full)) { seen.add(full); out.push(full); }
            }
        }
    }
    walk('tests');
    return out.sort();
}

// 库文件判据：tests/ 下有没有别的文件 import 它（按 basename 匹配 import 路径尾段）
function collectImportedBases() {
    const bases = new Set();
    for (const rel of collectScripts()) {
        const src = readIfExists(rel);
        for (const m of matchAll(src, /from\s+'([^']+)'/g)) bases.add(path.basename(m[1]));
        for (const m of matchAll(src, /import\s+'([^']+)'/g)) bases.add(path.basename(m[1]));
        for (const m of matchAll(src, /require\(\s*'([^']+)'\s*\)/g)) bases.add(path.basename(m[1]));
    }
    return bases;
}

function classify(rel, importedBases, registry) {
    // ★ 临时验证脚本（_verify 前缀）豁免：它们是一次性验证工具，需完整引擎 + 网络
    //   （loadGameData / loadHexEnhanceData 走 fetch 本地资源，在无网或旧 Node 环境必崩），
    //   不是守门 / 自检，不应被本件当孤儿 spawnSync 直跑 ⇒ 否则污染整轮普查（exit≠0 误报红）。
    if (/^tests\/_verify.*\.mjs$/.test(rel)) return { kind: 'verify', why: '临时验证脚本，需完整引擎+网络（loadGameData 走 fetch 本地资源），node 直跑在无网/旧 Node 环境必崩，属环境不匹配非缺陷；手动在有网环境运行' };
    // ★ 2026-11-06 迭代：一次性取证/打桩探针（_tmp- 前缀）。ver-bump / ver-drift 早已统一排除
    //   此前缀（无版本可追溯的转瞬文件），本件旧版只特判 _verify*，于是把并行会话误入库的
    //   _tmp-probe-meteor.mjs 当真孤儿跑出红。免跑但点名（见 main 的临时探针汇总），不静默跳过。
    if (/^tests\/_tmp.*\.mjs$/.test(rel)) return { kind: 'tempProbe', why: '一次性取证/打桩探针，非守门非自检；node 直跑的 exit≠0 是探针输出而非缺陷（与 ver-bump/ver-drift 已排除 _tmp-* 同口径）。★ 若已被 git 追踪，属并行会话全量入库误收，应清理出 tests/' };
    if (rel === RUN_ALL) return { kind: 'entry', why: '总入口本身，跑它会无限递归' };
    if (rel === SELF) return { kind: 'self', why: '本件自身，跑它会无限递归' };
    // ★ 在册优先于 library：一个脚本可以同时是"被别处 import 的库"和"清单里的自检"
    //   （rule-branch-idle-selftest 就是两兼），先判在册才不会把在册自检误当孤儿。
    if (registry.has(rel)) return { kind: 'registered', why: '已在 run-all 清单（CHECKS 或 OBSERVES）里，有人盯' };
    if (HEAVY_SKIP[rel]) return { kind: 'heavy', why: HEAVY_SKIP[rel] };
    // ★ 2026-11-04 迭代：tests/health-rules/ 是浏览器宿主运行时规则（tests/121health-monitor.js
    //   经 readdir 自动加载进 47 条运行时规则套件），node 直跑无意义，由浏览器体检层
    //   （120test-runner.html?auto=1）盯守，不在 run-all 清单属正常。归 runtimeRule 免跑但点名计入
    //   免跑面（旧版因只扫 tests 顶层，这 48 个文件连"免跑面"都进不去，彻底隐形）。
    if (rel.startsWith('tests/health-rules/')) {
        return { kind: 'runtimeRule', why: '浏览器宿主运行时规则（tests/121health-monitor.js 经 readdir 自动加载进运行时规则套件），node 直跑无意义；由浏览器体检层（120test-runner.html?auto=1）盯守，不在 run-all 清单属正常' };
    }
    const base = path.basename(rel);
    if (importedBases.has(base)) return { kind: 'library', why: '被 tests/ 下别的文件 import，是库不是自检' };
    const src = readIfExists(rel);
    if (/\bwindow\./.test(src) || /\bdocument\./.test(src)) {
        return { kind: 'browserHost', why: '源码引用 window./document.，需浏览器宿主，node 直跑必崩（环境不匹配，非缺陷）' };
    }
    return { kind: 'orphan', why: '磁盘有、清单无，且非库/非宿主/非重型 ⇒ 应被普查' };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
function main() {
    console.log('=== 孤儿自检普查（磁盘有 / 清单无）===');

    // 自证先行：公共件自己烂了，本件的清单结论就全是空的
    const selfBad = truthSelfCheck();
    for (const bad of selfBad) console.log('  ✗ 静态真值口径公共件自证：' + bad);

    const reg = auditRegistry();
    const a = reg.audit;
    console.log('· 清单取样面审计（第 147 轮新增，防"注释里的假登记"）：');
    console.log('    run-all.mjs 共 ' + a.lines + ' 行，其中注释行 ' + a.commentLines + ' 行');
    console.log('    三视图：raw=' + reg.row.raw + ' / line=' + reg.row.line + ' / strip(真值)=' + reg.row.strip);
    console.log('    只活在整行注释里的伪登记 ' + reg.row.phantomLine + ' 处 / 只活在行尾注释里的 ' + reg.row.phantomTail + ' 处');
    // ★ 措辞不许说谎：只有真相等时才许说"同数"（牙A 实测：块注释里的假登记会让旧口径多一个，
    //   此时若照旧打印"同为 N 个 —— 两套口径今日同数"，等于在报告上替假登记盖了个章）
    if (reg.legacy.length === reg.truth.length) {
        console.log('    旧野路口径（只认行注释）同为 ' + reg.legacy.length + ' 个 —— 两套口径今日同数');
    } else {
        console.log('    ⚠ 旧野路口径（只认行注释）算出 ' + reg.legacy.length + ' 个，与真值口径 '
            + reg.truth.length + ' 个不同数 —— 旧口径已被注释骗到');
    }
    if (reg.onlyLegacy.length) console.log('    ⚠ 仅旧口径算作已登记（即注释里的假登记）：' + reg.onlyLegacy.join('、'));
    if (reg.onlyTruth.length) console.log('    ⚠ 仅真值口径算作已登记：' + reg.onlyTruth.join('、'));
    if (reg.row.phantomLine + reg.row.phantomTail > 0) {
        console.log('    ✗ 清单锚点有只活在注释里的写法 —— 已登记名单不可信，下述结论作废');
    }

    const registry = new Set(reg.truth);
    const scripts = collectScripts();
    const importedBases = collectImportedBases();

    // 反向：清单有、磁盘无（陈旧条目）
    const stale = [...registry].filter((x) => !scripts.includes(x));

    const classified = scripts.map((rel) => ({ rel, ...classify(rel, importedBases, registry) }));
    const orphans = classified.filter((c) => c.kind === 'orphan');
    const skipped = classified.filter((c) => c.kind !== 'orphan');

    console.log('· 盘点：tests 下脚本 ' + scripts.length + ' 个 / 清单已登记 ' + registry.size + ' 个 / 待普查孤儿 ' + orphans.length + ' 个');

    // 免跑面必须点名 —— 免跑面是可以静默扩大的东西
    console.log('· 免跑面（每类都给理由，不许静默跳过）：');
    for (const c of skipped) console.log('    [' + c.kind + '] ' + c.rel + ' —— ' + c.why);
    // V1.2.0：临时探针单独汇总显形 —— 免跑不等于可以悄悄留在仓库里
    const tempProbes = classified.filter((c) => c.kind === 'tempProbe');
    if (tempProbes.length) console.log('· ⚠ 临时探针残留 ' + tempProbes.length + ' 个（免跑，但建议清理出 tests/，勿让一次性文件长期挂在仓库里）：' + tempProbes.map((c) => c.rel).join('、'));
    if (stale.length) console.log('· ⚠ 清单有、磁盘无（陈旧条目）：' + stale.join('、'));

    console.log('· 逐个跑孤儿：');
    const reds = [];
    for (const c of orphans) {
        const t0 = Date.now();
        let r;
        try {
            r = spawnSync(node, [path.join(root, c.rel)], {
                cwd: root, encoding: 'utf8', env: process.env,
                timeout: CHILD_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024,
            });
        } catch (e) {
            r = { status: 1, stdout: '', stderr: String((e && e.message) || e) };
        }
        const killed = r.error && r.error.code === 'ETIMEDOUT';
        const code = killed ? 124 : ((typeof r.status === 'number') ? r.status : 1);
        // ★ 结论行只从 stdout 取：node 的 MODULE_TYPELESS_PACKAGE_JSON 等告警走 stderr，
        //   混在一起会让"最后一行"落在告警上 —— 实测 param-read-guard 的红因曾被这句话盖住。
        const key = killed
            ? '超过 ' + (CHILD_TIMEOUT_MS / 1000) + 's 未退出（已杀）'
            : (pickKeyLine(r.stdout || '', code !== 0) || pickKeyLine(r.stderr || '', code !== 0));
        const ok = code === 0;
        if (!ok) reds.push({ rel: c.rel, code, key });
        console.log('    ' + (ok ? '✅' : '❌') + ' ' + c.rel + ' exit=' + code + ' (' + (Date.now() - t0) + 'ms)  ' + key);
    }

    console.log('---------------------------------------------------------');
    if (!reds.length) {
        console.log('RESULT: 无红孤儿（' + orphans.length + ' 个待普查孤儿全绿，' + skipped.length + ' 个免跑已点名）');
    } else {
        console.log('RESULT: ' + reds.length + ' 个孤儿自检正在红，且不在 run-all 的 24 项清单里 ⇒ 红了没人盯');
        for (const r of reds) console.log('    ✗ ' + r.rel + ' exit=' + r.code + '  ' + r.key);
        console.log('  ★ 处置须拍板：纳入 CHECKS 会让体检分母变大（属改既有结论）；本件只负责让它被看见。');
    }
    if (selfBad.length) {
        console.log('  ✗ 公共件自证未过（' + selfBad.length + ' 条）—— 上述全部结论不可信');
        process.exit(1);
    }
    process.exit(reds.length ? 1 : 0);
}

main();
