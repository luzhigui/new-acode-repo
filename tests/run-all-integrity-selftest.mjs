// V1.0.0 | 2026-11-06 新建：编排器自身完整性守门（清单→磁盘断链 / 观察项显形不腐烂 / 拍板边界不被越）
// tests/run-all-integrity-selftest.mjs | V1.0.0 | 2026-11-06 迭代：编排器自身完整性守门。
//
// 干什么（三件事，全部只读、不执行任何被扫脚本）：
//   ①【清单→磁盘断链】run-all.mjs 的 CHECKS/OBSERVES 里每条 script: 指向的文件必须在盘。
//      由来：11-04/11-05 两晚云端夜间任务挂在「/workspace/repo 整个目录被回收」，
//      任务书 11-06 实测「以 GitHub main 为基底只有 9/25、以 nightly/第179轮 为基底 22/25」——
//      基底不对时，体检会静默跑出一大片红，而红的是地基不是代码。本件把「基底不对」提前说破：
//      脚本都不在了就别谈分数。orphan-selftest-sweep 盯的是「磁盘有、清单无」的反向，本件补正向。
//   ②【观察项显形不腐烂】守护 run-all V1.38.0：OBSERVES 执行段此前把 r.status 整个丢掉，
//      任一项 exit≠0 也统一打印 🔎、整体退码照样 0（不响的警报器）。修完没有任何自检盯它，
//      改回去不会有人知道。本件在**剥注释后的真代码**里逐条验不变量（散文声称一律不算数，
//      沿用 guard-presence-scan 第 155 轮立的范式，剥注释走公共件唯一来源 stripCommentsMapped）。
//   ③【拍板边界不被越】OBSERVES 段不得出现 failed++，process.exit(failed ? 1 : 0) 必须还在。
//      「观察项要不要升红线开拦」是拍板权，本件只守住「没被谁顺手改掉」，不替人拍板。
//
// 退码：exit 1 = 编排器自身不完整/显形退回假绿/边界被越，属体检域确定性缺陷。
//   按既定取舍挂 run-all 的 OBSERVES（不改 CHECKS 分母、不改既有结论），是否升 CHECKS 待拍板。
// ★ 自指边界：本件自己也在 run-all 清单里，理论上能被顺手从清单删掉；反向兜底由
//   orphan-selftest-sweep（磁盘有、清单无即点名孤儿）承担，故删掉会留痕，不是无声消失。
//
// 本件与主代码的关系：只读 tests/run-all.mjs 与 tests/ 下脚本存在性，不改任何文件。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    VER as TRUTH_VER, selfCheck as truthSelfCheck, stripCommentsMapped
} from './_lib/static-truth-slice.mjs';

export const VER = 'tests/run-all-integrity-selftest.mjs V1.0.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const RUN_ALL = 'tests/run-all.mjs';
const NIGHTLY_LOG = 'tests/体检迭代日志.md';

// 不变量：全部只认「剥注释后的真代码」。正则故意写成最小必要片段，
// 允许 run-all 换措辞/换变量名之外的重构；若确需换写法，本件会红并要求同步更新（这正是守门意图）。
// ★ scope='observe' 的五条必须在 OBSERVES 执行段**内部**命中，全文命中不算数：
//   run-all 的 CHECKS 段本来就有 `typeof r.status === 'number'`（它计退码），若在全文里找，
//   观察项那段被改回「丢退出码」也会被 CHECKS 段顶成绿 —— 11-06 真身负路径实测当场抓到这款自产假绿。
const INVARIANTS = [
    { id: 'readStatus', re: /typeof r\.status === 'number'/, scope: 'observe', why: 'OBSERVES 段不再读退出码 ⇒ 退回「失败也统一 🔎」的假绿' },
    { id: 'collectFail', re: /observeFails\.push\(/, scope: 'observe', why: '失败项不再收进汇总 ⇒ 末尾不点名、看不清是哪项红' },
    { id: 'markExit', re: /❌ exit=/, scope: 'observe', why: '失败项不再打 ❌ exit=N ⇒ 单行输出里看不出失败' },
    { id: 'summary', re: /observeFails\.length/, scope: 'observe', why: '末尾汇总分支被删 ⇒ 失败项不集中显形' },
    { id: 'hardMark', re: /建议升 CHECKS/, scope: 'observe', why: '确定型守门不再被额外标注 ⇒ 真 bug 被混进待研判噪声' },
    { id: 'exitByFailed', re: /process\.exit\(failed \? 1 : 0\)/, scope: 'all', why: '整体退码口径被改 ⇒ 越过了「拦不拦」的拍板边界' },
    { id: 'hardDecl', re: /hard:\s*true/, scope: 'all', why: 'hard: true 条目声明消失 ⇒ 确定型守门这一属性没人声明，显形退化' }
];

/** 取出 run-all 真代码里 OBSERVES 执行段（从 if (OBSERVES.length) 到 process.exit 为止）。 */
function observeSegment(code) {
    const i = code.indexOf('if (OBSERVES.length)');
    const j = code.indexOf('process.exit(', i < 0 ? 0 : i);
    if (i < 0 || j < 0) return { text: '', start: 0 };
    return { text: code.slice(i, j), start: i };
}

/**
 * 审计编排器。
 * @param {string} src run-all.mjs 源码
 * @param {(rel:string)=>boolean} exists 注入的存在性判定（自证时喂假实现，不碰磁盘）
 * @returns {{fails:string[], missing:{id:string,why:string}[], hits:{id:string,line:number}[], broken:string[], scripts:string[]}}
 */
export function auditRunAllIntegrity(src, exists) {
    const res = { fails: [], missing: [], hits: [], broken: [], scripts: [] };
    if (typeof src !== 'string' || !src.length) {
        res.fails.push('run-all.mjs 源码为空 ⇒ 本件没有真的取到东西（不许把「取不到」当成「没问题」）');
        return res;
    }
    const m = stripCommentsMapped(src);
    const code = m.code || '';
    if (!code.trim()) {
        res.fails.push('剥注释后真代码为空 ⇒ 抽取器失位，结论不可信');
        return res;
    }
    const lineOf = (idx) => {
        const o = m.owner && m.owner[idx];
        return typeof o === 'number' ? src.slice(0, o).split('\n').length : 0;
    };

    const seg = observeSegment(code);
    for (const inv of INVARIANTS) {
        // 段内命中才算数；行号换算要补上段起点在全文里的偏移，否则指错行。
        const scoped = inv.scope === 'all' ? code : seg.text;
        const base = inv.scope === 'all' ? 0 : seg.start;
        const hit = scoped.match(inv.re);
        if (hit) res.hits.push({ id: inv.id, line: lineOf(base + hit.index) });
        else res.missing.push({ id: inv.id, why: inv.why });
    }

    // ③ 拍板边界：OBSERVES 段内不得自增 failed
    if (!seg.text) res.fails.push('取不到 OBSERVES 执行段（if (OBSERVES.length) … process.exit）⇒ 段内不变量与边界检查一并空转');
    else if (/\bfailed\s*\+\+|\bfailed\s*\+=/.test(seg.text)) {
        res.fails.push('OBSERVES 执行段里出现 failed 自增 ⇒ 观察项被计入退码，越过「拦不拦」的拍板边界');
    }

    // ① 清单→磁盘断链（从真代码抠，注释里的 script: 不算数）
    for (const mm of code.matchAll(/script:\s*'([^']+)'/g)) res.scripts.push(mm[1]);
    if (!res.scripts.length) {
        res.fails.push('一条 script: 都没抠出来 ⇒ 清单抽取器失位（或清单被清空），断链检查空转');
    }
    for (const p of res.scripts) if (!exists(p)) res.broken.push(p);

    return res;
}

// ---------------------------------------------------------------------------
// 自证：负路径必须真咬。样本一律拼接构造（第 153 轮自伤四：完整字面块会被别的扫描器当真形态）。
// ---------------------------------------------------------------------------
export function selfCheck() {
    const fails = [];
    const L = (s) => s;
    const head = [
        L("const CHECKS = [{ name: '合成项', script: 'tests/run-all-integrity-selftest.mjs' }];"),
        L("const OBSERVES = [{ name: '合成守门', script: 'tests/run-all-integrity-selftest.mjs', args: [], hard: true }];")
    ].join('\n');
    const seg = [
        L('if (OBSERVES.length) {'),
        L("  const code = (typeof r.status === 'number') ? r.status : 1;"),
        L("  if (code !== 0) observeFails.push({ name: c.name, code, hard: c.hard });"),
        L("  console.log('  ' + (code === 0 ? '🔎' : '❌ exit=' + code) + c.name);"),
        L('  if (observeFails.length) {'),
        L("    console.log('   · ' + (f.hard ? '[确定型守门·建议升 CHECKS 开红] ' : '') + f.name);"),
        L('  }'),
        L('}'),
        L('process.exit(failed ? 1 : 0);')
    ].join('\n');
    const good = head + '\n' + seg;
    const okExists = () => true;
    const noExists = () => false;

    const r0 = auditRunAllIntegrity(good, okExists);
    if (r0.fails.length || r0.missing.length || r0.broken.length) {
        fails.push('正路径：齐全样本本应全绿，实得 fails=' + r0.fails.length + ' missing=' + r0.missing.length + ' broken=' + r0.broken.length);
    }
    // 负路径 A：删掉「读退出码」
    const noStatus = good.replace(/const code = \(typeof r\.status === 'number'\) \? r\.status : 1;/, 'const code = 0;');
    if (!auditRunAllIntegrity(noStatus, okExists).missing.some(x => x.id === 'readStatus')) {
        fails.push('负路径 A：删掉 r.status 读取，本件竟没报 readStatus ⇒ 假绿');
    }
    // 负路径 B：删掉失败收集
    const noCollect = good.replace(/if \(code !== 0\) observeFails\.push\([^\n]*\);/, '');
    if (!auditRunAllIntegrity(noCollect, okExists).missing.some(x => x.id === 'collectFail')) {
        fails.push('负路径 B：删掉 observeFails.push，本件竟没报 ⇒ 假绿');
    }
    // 负路径 C：脚本不在盘（断链）
    const rBroken = auditRunAllIntegrity(good, noExists);
    if (!rBroken.broken.length) fails.push('负路径 C：脚本全部不存在，本件竟没报断链 ⇒ 假绿');
    // 负路径 D：观察项越权计退码
    const crossed = good.replace('process.exit(failed ? 1 : 0);', "if (code !== 0) failed++;\nprocess.exit(failed ? 1 : 0);");
    if (!auditRunAllIntegrity(crossed, okExists).fails.some(x => x.includes('拍板边界'))) {
        fails.push('负路径 D：OBSERVES 段塞进 failed++，本件竟没报越界 ⇒ 假绿');
    }
    // 负路径 E：空源码不许当「没问题」
    if (!auditRunAllIntegrity('', okExists).fails.length) fails.push('负路径 E：空源码竟没报 ⇒ 假绿');
    // 负路径 F（11-06 真身实测抓到的自产假绿，固化成常驻断言）：
    //   CHECKS 段仍读 status、只有 OBSERVES 段被改回丢退出码 —— 全文匹配会被 CHECKS 顶成绿。
    const segNoStatus = good.replace(/const code = \(typeof r\.status === 'number'\) \? r\.status : 1;/, 'const code = 0;');
    const decoy = "const checksCode = (typeof r.status === 'number') ? r.status : 1;\n" + head + '\n' + segNoStatus;
    if (!auditRunAllIntegrity(L(decoy), okExists).missing.some(x => x.id === 'readStatus')) {
        fails.push('负路径 F：CHECKS 段读码做诱饵、OBSERVES 段丢读码，本件竟没报 readStatus ⇒ 退回全文匹配的假绿');
    }
    return fails;
}

function main() {
    // --src=<路径>：可指定待校验的编排器副本（夜间沙箱重建后校验基底 / 本件负路径实测），
    // 默认读仓库里的 tests/run-all.mjs。相对路径按仓库根解析，绝对路径直接用。
    const srcArg = process.argv.find(a => a.startsWith('--src='));
    console.log('=== 编排器自身完整性守门 ' + VER + ' ===');
    const tFails = truthSelfCheck();
    if (tFails && tFails.length) {
        console.log('⛔ 公共剥注释件 ' + TRUTH_VER + ' 自证失败 ' + tFails.length + ' 处，结论不可信：');
        for (const x of tFails) console.log('  · ' + x);
        return 1;
    }
    const sFails = selfCheck();
    if (sFails.length) {
        console.log('⛔ 本件自证失败 ' + sFails.length + ' 处（自身判据先坏了）：');
        for (const x of sFails) console.log('  · ' + x);
        return 1;
    }
    console.log('· 自证：正路径全绿 + 6 条负路径（读码/收集/断链/越界/空源码/段内诱饵）全部咬住');

    const relOrAbs = srcArg ? srcArg.slice('--src='.length) : RUN_ALL;
    const p = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(root, relOrAbs);
    if (srcArg) console.log('· 指定基底：' + p);
    if (!fs.existsSync(p)) {
        console.log('⛔ ' + RUN_ALL + ' 不在盘 ⇒ 工作区/基底可疑，夜间任务应先走重建，别拿残缺基底谈体检分数');
        return 1;
    }
    const src = fs.readFileSync(p, 'utf8');
    const r = auditRunAllIntegrity(src, (rel) => fs.existsSync(path.join(root, rel)));

    for (const h of r.hits) console.log('  ✅ ' + h.id.padEnd(14) + ' L' + h.line);
    for (const x of r.missing) console.log('  ❌ ' + x.id.padEnd(14) + ' ' + x.why);
    for (const x of r.fails) console.log('  ❌ ' + x);
    for (const b of r.broken) console.log('  ❌ 断链 ' + b + '（run-all 清单登记了，磁盘上没有）');

    console.log('· 清单脚本 ' + r.scripts.length + ' 条，在盘 ' + (r.scripts.length - r.broken.length) + ' 条，断链 ' + r.broken.length + ' 条');
    // 软检查：夜间迭代日志是夜间任务的接力入口，缺失只提示、不判红（白天本地与云端重建前都可能没有）。
    if (!fs.existsSync(path.join(root, NIGHTLY_LOG))) {
        console.log('  ⚠ ' + NIGHTLY_LOG + ' 不在盘 —— 夜间任务靠它接力，若这是夜间沙箱请先走「工作区自愈重建」');
    }

    const bad = r.fails.length + r.missing.length + r.broken.length;
    console.log(bad ? ('⛔ 编排器自身完整性 ' + bad + ' 处失守（见上）') : '✅ 编排器自身完整性 PASS（显形未腐烂 / 边界未越 / 清单无断链）');
    return bad ? 1 : 0;
}

// 允许被别的守门 import 复用（导入时不自跑）。判据认脚本名而非全路径相等，
// 避开 Windows 盘符大小写导致「直接运行却没跑 main」的假绿。
if (process.argv[1] && /run-all-integrity-selftest\.mjs$/.test(process.argv[1])) process.exit(main());
