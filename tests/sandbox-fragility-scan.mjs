// tests/sandbox-fragility-scan.mjs | V1.1.0 | 2026-10-28 夜间第 149 轮：地基判据收口为唯一来源。
//
//   整段搬到 tests/_lib/foundation-scan.mjs（唯一来源），本件改为 import —— 第 149 轮新增
//
// 本件做四件事，且不改任何既有判据：
//   ①【非版本化地基枚举】唯一真值是 git 自己 —— 对每个候选路径跑 `git check-ignore`，
//      已存在的整块用 `git ls-files --ignored --directory` 折叠枚举。
//      ★ 不手写 .gitignore 正则：那等于又抄了一份规则快照，会腐烂（本仓库这类"第二份
//        快照"病已发作四次，最近一次是第 146 轮 hit-shapes-consistency 的手写兜底名单）。
//   ②【体检项 × 地基依赖绑定】对每个 CHECKS/OBSERVES 项的脚本，抽源码里的路径字面量，
//      逐个过 git 判据；落在非版本化地基上的即建立依赖，并写出**命中理由**（哪个项引的）。
//   ③【缺失即报】地基不在本沙箱 ⇒ 报「该项若今天红，红的是地基不是代码」。
//   ④【与体检报告交叉归因】传入 --from-report <run-all 输出> 时，把报告里的红项与地基
//      缺失清单按**项名精确对号**，直接给出「红项 N 条中有 M 条可归因地基缺失」。
//      不传则只报清单 —— 本件不代跑体检，那是改体检口径。
//
// 取样面自证：清单（name+script 配对）是从 run-all.mjs 里正则抠出来的，正是第 146 轮那款
//   病（抠的东西可能只活在注释里）⇒ 走 _lib/static-truth-slice 的 auditAnchorSites 三视图，
//   成为该公共件的**第六个受体**；并留旧野路口径（只认行注释）作对照，分叉即点名。
//
// 退码口径：本件 exit 1 表示「存在缺失的非版本化地基」。挂 run-all 的 OBSERVES（观察项），
//   与第 147 轮孤儿普查同一取舍 —— 挂 CHECKS 会让分母 24 变 25，属改既有结论须拍板。
//
// 本件与主代码的关系：只读 tests/、run-all.mjs、.gitignore（经 git 判定），不改任何文件。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditAnchorSites, stripComments, selfCheck as truthSelfCheck } from './_lib/static-truth-slice.mjs';
// ★ 非版本化地基的判定只有一处：tests/_lib/foundation-scan.mjs（第 149 轮抽出的唯一来源）。
//   本件初版把这些判据写在自己体内，第 149 轮新增 foundation-portability 需要同一套判据，
//   故按第 122 轮通规收口 —— 本件不再持有第二份。
import {
    enumerateFoundations, gitIgnored, extractPathLits, collectItems,
    selfCheck as foundationSelfCheck,
} from './_lib/foundation-scan.mjs';

export const VER = 'tests/sandbox-fragility-scan.mjs V1.1.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const RUN_ALL = 'tests/run-all.mjs';
const SELF = 'tests/sandbox-fragility-scan.mjs';
const TESTS_DIR = 'tests';

// 抠清单的锚点：CHECKS / OBSERVES 里每一项都是 { name: '...', script: '...' }。
// ★ 一次抠「配对」而非只抠 script —— 交叉归因要靠项名对号，只抠脚本就得靠文件名猜中文项名。
const RE_ITEM_ANCHOR = /name:\s*'[^']+'\s*,\s*script:\s*'[^']+'/g;

// 非版本化地基规模下限：今天实测若为 0，多半是枚举面塌了（那会让本件恒绿），不是好消息。
const MIN_UNVERSIONED = 1;

// 清单取样面审计（公共件第六受体）：真值 = 剔注释后再抠；旧野路口径 = 只剔行注释后再抠。
function auditRegistry() {
    const src = fs.readFileSync(path.join(root, RUN_ALL), 'utf8');
    const audit = auditAnchorSites({ src, anchors: [{ id: 'name+script配对锚点', re: RE_ITEM_ANCHOR }] });
    const row = audit.rows && audit.rows[0]
        ? audit.rows[0]
        : { raw: 0, line: 0, strip: 0, phantomLine: 0, phantomTail: 0 };

    const truth = collectItems(stripComments(src));
    const legacySrc = src.replace(/\/\/.*$/gm, '');
    const legacy = collectItems(legacySrc);
    return { audit, row, truth, legacy };
}

function parseReportRed(file) {
    let txt = '';
    try {
        txt = fs.readFileSync(file, 'utf8');
    } catch (e) {
        return { red: [], err: String(e && e.message || e) };
    }
    const red = [];
    for (const line of txt.split(/\r?\n/)) {
        const m = /^\s*❌\s+(.+?)\s+\d+ms/.exec(line);
        if (m) red.push(m[1].trim());
    }
    return { red, err: null };
}

function main() {
    const fromReport = (() => {
        const i = process.argv.indexOf('--from-report');
        return i >= 0 ? process.argv[i + 1] : '';
    })();

    console.log('=========================================================');
    console.log('  沙箱易碎地基普查（第 148 轮新增 · 公共件第六受体）');
    console.log('=========================================================');

    const reg = auditRegistry();
    const a = reg.audit;
    console.log('· 清单取样面审计（防"注释里的假登记"）：');
    console.log('    run-all.mjs 共 ' + a.lines + ' 行，其中注释行 ' + a.commentLines + ' 行');
    console.log('    三视图：raw=' + reg.row.raw + ' / line=' + reg.row.line + ' / strip(真值)=' + reg.row.strip);
    console.log('    只活在整行注释里的伪登记 ' + reg.row.phantomLine + ' 处 / 只活在行尾注释里的 ' + reg.row.phantomTail + ' 处');
    const onlyLegacy = reg.legacy.filter(x => !reg.truth.some(t => t.script === x.script));
    if (onlyLegacy.length === 0 && reg.legacy.length === reg.truth.length) {
        console.log('    旧野路口径（只认行注释）同为 ' + reg.legacy.length + ' 项 —— 两套口径今日同数');
    } else {
        console.log('    ⚠ 两套口径分叉：旧野路口径 ' + reg.legacy.length + ' 项 / 真值口径 ' + reg.truth.length + ' 项');
        for (const x of onlyLegacy) console.log('      仅旧口径算作已登记：' + x.name + ' → ' + x.script);
        console.log('    ⇒ 登记名单不可信，下列结论以真值口径为准');
    }

    // ② 体检项 × 地基依赖绑定（判据唯一来源：tests/_lib/foundation-scan.mjs，第 149 轮收口）
    const items = reg.truth.filter(it => it.script !== SELF);
    const unversioned = enumerateFoundations(items, TESTS_DIR);

    const missing = unversioned.filter(u => !u.present);

    console.log('· 体检清单（真值口径）' + items.length + ' 项；非版本化地基合计 ' + unversioned.length + ' 项：');
    for (const u of unversioned) {
        console.log('    ' + (u.present ? '✓ 存在' : '✗ 缺失') + ' ' + u.rel + '   〔判定依据：' + u.why + '〕');
        for (const s of u.users) console.log('          依赖方：' + s);
    }
    if (unversioned.length === 0) {
        console.log('    （无 —— 今日体检清单不依赖任何被 git 忽略的产物）');
    }

    // ③ 缺失即报
    if (missing.length) {
        console.log('· ⚠ 地基缺失 ' + missing.length + ' 项 —— 相关体检项若今天红，红的是地基不是代码：');
        for (const u of missing) {
            console.log('    ' + u.rel + ' ⇒ ' + u.users.join('、'));
        }
    } else {
        console.log('· 地基缺失 0 项 —— 今日体检清单的非版本化地基齐全');
    }

    // ④ 与体检报告交叉归因（按项名精确对号，不靠文件名猜）
    if (fromReport) {
        const r = parseReportRed(fromReport);
        if (r.err) {
            console.log('· 报告交叉：读不到 ' + fromReport + '（' + r.err + '）');
        } else {
            const byName = [];
            for (const name of r.red) {
                for (const u of missing) {
                    if (u.users.includes(name) && !byName.includes(name + ' ⇒ ' + u.rel)) {
                        byName.push(name + ' ⇒ ' + u.rel);
                    }
                }
            }
            console.log('· 与体检报告交叉（--from-report）：报告红项 ' + r.red.length + ' 条');
            if (byName.length) {
                console.log('    其中 ' + byName.length + ' 条可归因地基缺失（★ 不是代码退步）：');
                for (const t of byName) console.log('      ' + t);
            } else if (missing.length) {
                console.log('    未对上号：地基缺失 ' + missing.length + ' 项，报告红项里没有直接对应项');
                console.log('    ★ 这不代表缺失无害 —— 缺失项今天可能恰好绿，或被别处真红掩盖');
            } else {
                console.log('    地基齐全 ⇒ 报告红项全部需要在代码侧找原因');
            }
        }
    }

    // 自证：本件四条 + 公共件自证。★ 两者必须**并入同一份 fails** —— 只打印不计退码的话，
    //   公共件坏了本件照样打 RESULT: MATCH 并退 0，正是本件要防的那种「自证响了、结论照旧」。
    const ownFails = runSelfChecks(unversioned.length);
    const truthBad = truthSelfCheck();
    const foundBad = foundationSelfCheck();
    const fails = ownFails
        .concat(truthBad.map(b => '静态真值口径公共件自证：' + b))
        .concat(foundBad.map(b => '地基枚举公共件自证：' + b));
    for (const bad of fails) console.log('  ✗ ' + bad);

    if (fails.length) {
        console.log('  ⇒ 自证未过 —— 上述全部结论不可信');
        console.log('=========================================================');
        process.exit(1);
    }

    console.log('=========================================================');
    console.log('RESULT: ' + (missing.length ? 'DRIFT' : 'MATCH') + ' —— 地基缺失 ' + missing.length + ' 项 / 非版本化地基合计 ' + unversioned.length + ' 项');
    console.log('=========================================================');
    process.exit(missing.length ? 1 : 0);
}

function runSelfChecks(unversionedCount) {
    const fails = [];
    // ① git 判据锚点自证：一个已知被忽略、一个已知已跟踪，两端都钉住
    if (!gitIgnored('tests/.mut/teeth-results.txt')) {
        fails.push('① git 忽略判据失位：tests/.mut/teeth-results.txt 应判为被忽略（.gitignore 有 /tests/.mut/），实判未忽略 —— 依赖表会静默变空');
    }
    if (gitIgnored('tests/run-all.mjs')) {
        fails.push('① git 忽略判据失位：tests/run-all.mjs 是已跟踪文件，不应判为被忽略 —— 判据反了会把全库都当成地基');
    }
    // ② 非版本化地基规模下限：枚举面塌了会让本件恒绿
    if (unversionedCount < MIN_UNVERSIONED) {
        fails.push('② 非版本化地基规模下限 ' + MIN_UNVERSIONED + ' 未达（实为 ' + unversionedCount + '）—— 枚举面塌了本件就恒绿，属静默失守');
    }
    // ③ 路径字面量抽取器自证：整条字面量与分段拼装两种写法都必须抽得出来，且不得把 URL 当路径
    const probe = "const p = path.join(root, 'tests/.mut/teeth-results.txt');\nconst q = 'http://x.example/a/b';";
    const got = extractPathLits(probe).map(x => x.rel);
    if (!got.includes('tests/.mut/teeth-results.txt')) {
        fails.push('③ 路径字面量抽取器失位：合成样本里的 tests/.mut/teeth-results.txt 没抽出来（实得 ' + JSON.stringify(got) + '）');
    }
    if (got.some(x => x.includes('http'))) {
        fails.push('③ 路径字面量抽取器失位：把 URL 也当成仓库路径了（实得 ' + JSON.stringify(got) + '）');
    }
    // ③b 分段拼装自证：本轮实测正是这种写法让初版漏掉最关键那处地基，必须钉住
    const probeJoin = "const EVIDENCE = path.join(here, '.mut', 'teeth-results.txt');";
    const gotJoin = extractPathLits(probeJoin).map(x => x.rel);
    if (!gotJoin.includes('tests/.mut/teeth-results.txt')) {
        fails.push('③b 分段拼装抽取失位：path.join(here, .mut, teeth-results.txt) 没还原成 tests/.mut/teeth-results.txt（实得 ' + JSON.stringify(gotJoin) + '）—— 这类写法是地基引用的主流，漏了本件就形同虚设');
    }
    // ④ 清单配对抽取器自证：合成一段 name+script，必须抠出配对
    const probe2 = "{ name: '合成项', script: 'tests/synthetic-probe.mjs' }";
    const items2 = collectItems(probe2);
    if (!items2.some(x => x.name === '合成项' && x.script === 'tests/synthetic-probe.mjs')) {
        fails.push('④ 清单配对抽取器失位：合成样本里的 name+script 没抠成配对 —— 交叉归因会全线对不上号');
    }
    return fails;
}

main();
