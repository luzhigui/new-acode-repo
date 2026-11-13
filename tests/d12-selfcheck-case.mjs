#!/usr/bin/env node
// tests/d12-selfcheck-case.mjs | V1.1.0 | 2026-11-13（D12 规则自检与假绿域）
//
// 定向用例：给 295/296 两条元守卫规则喂**合成源码**，每条硬判据都配一对样本 ——
//   反向样本（人为改坏 → 必须命中）+ 正向样本（干净写法 → 必须不命中，防一刀切假红）。
// 主题「体检自检自身的假绿」能不能被抓到，就看这里：
//   某条自检恒返回通过（295）/ 改了判定口径却没配反向样本（296）——两类都必须咬住。
// 用法：node tests/d12-selfcheck-case.mjs    全对 exit 0；任一条判错 exit 1
export const VER = 'tests/d12-selfcheck-case.mjs V1.1.0';

import { scanRedPath, parseRunAllRegistry, scanExemptDrift } from './health-rules/295-selfcheck-red-path.js';
import { scanReverseSample, collectHardGates, pickStaleKnows } from './health-rules/296-selfcheck-reverse-sample.js';
import { rule295 } from './health-rules/295-selfcheck-red-path.js';
import { rule296 } from './health-rules/296-selfcheck-reverse-sample.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let failures = 0;
function check(label, cond, extra) {
    if (cond) { console.log('  ✓ ' + label); return true; }
    failures++;
    console.log('  ✗ ' + label + (extra ? '  —— ' + extra : ''));
    return false;
}
const hit = (arr, cat) => arr.some(h => h === cat || h.startsWith(cat));
const summary = (r) => (typeof r === 'string' ? r : (r && r.msg) || JSON.stringify(r));
const isFail = (r) => !!(r && typeof r === 'object' && r.fail === true);

// ---------------------------------------------------------------- 合成源码夹具
// 每条都是一份「最小自检脚本」，只用来验判据形状，不落盘、不参与任何真实结论。
const F = {
    // 295 反向：出口写死成绿 —— 全文只有 exit(0)
    alwaysGreen: `
        import fs from 'node:fs';
        const rows = [];
        console.log('· 候选清单 ' + rows.length + ' 类');
        console.log('⚠ 以上为候选清单，须复核');
        process.exit(0);
    `,
    // 295 反向：结构上根本没有红路径
    noExitAtAll: `
        import fs from 'node:fs';
        const n = 1 + 1;
        console.log('跑完了 ' + n);
    `,
    // 295 正向：结论由计数推导（真能变红）
    condExit: `
        let fails = [];
        if (bad) fails.push('x');
        process.exit(fails.length ? 1 : 0);
    `,
    // 295 正向：硬失败直接 exit(1)
    hardExitOne: `
        if (bad.length) { console.error('有违规'); process.exit(1); }
        process.exit(0);
    `,
    // 295 正向：退码委托给函数（由函数返回非零）
    delegated: `
        function main() { return reds.length ? 1 : 0; }
        process.exit(main());
    `,
    // 295 正向：不设退码，但异常即红（未捕获抛错 = 非零退码）
    throwsOnBad: `
        if (!fs.existsSync(p)) throw new Error('读不到 ' + p);
        console.log('ok');
    `,
    // 295 正向：用 exitCode 表红（无 process.exit 调用也算红）
    setsExitCode: `
        if (fails.length) process.exitCode = 1;
    `,
    // 295 反向的干扰项：注释里写 exit(1) 不算红路径（防「注释吹牛判据空转」）
    exitOnlyInComment: `
        // 这里本来要 process.exit(1) 的，先留着
        /* 历史版本: process.exit(1); */
        console.log('全部通过');
        process.exit(0);
    `,
    // 296 反向：hard 闸门，去注释后无任何反例入口
    gateNoProof: `
        function judge(src) { return src.includes('bad') ? ['命中'] : []; }
        let files = [];
        const bad = [];
        for (const f of files) if (judge(f).length) bad.push(f);
        if (bad.length) { console.log(bad); process.exit(1); }
        process.exit(0);
    `,
    // 296 反向：只在注释里声称有反例（注释不算证据）
    gateFakeClaim: `
        // 已配反例：见 selftest()，负路径自证齐全
        const bad = [];
        if (bad.length) process.exit(1);
        process.exit(0);
    `,
    // 296 正向：有可执行反例入口
    gateWithProof: `
        const pos = [{ src: 'a', expect: 2 }];
        function selfCheck() { for (const c of pos) if (count(c.src) !== c.expect) return 1; return 0; }
        process.exit(selfCheck());
    `,
    // 296 正向：合成坏样本 + 应抓到 N
    gateSynthSample: `
        const 合成源码 = 'function f(){ bad(bad) }';
        if (found(合成源码).length !== 2) { console.log('负路径自证失败：应抓到 2 处'); process.exit(1); }
        process.exit(0);
    `,
    // 296 反向：自证入口定义了但从不被调用（写了反例却不跑 = 没写）
    gateDeadProof: `
        function selftest() { if (count('bad') === 0) return 1; return 0; }
        console.log('只跑主判据，忘了调 selftest');
        process.exit(main() ? 1 : 0);
    `,
};

// ---------------------------------------------------------------- run-all 登记表解析
function sectionRegistryParser() {
    console.log('\n【登记簿解析】run-all 条目提取（判据的前置口径，本身也要有牙）');
    const fake = `
        const ITEMS = [
          { name: '甲', script: 'tests/a.mjs', args: [] },
          { name: '乙', script: 'tests/b.mjs', args: [], hard: true },
          { name: '丙', script: 'tests/c.js', args: ['--enforce'], hard: true, tier: 'heavy' },
        ];
    `;
    const hard = collectHardGates(fake).filter(g => g.hard).map(g => g.script).sort();
    check('反向：hard:true 的乙/丙被认出，甲不被误收（' + hard.join(',') + '）',
        hard.length === 2 && hard[0] === 'tests/b.mjs' && hard[1] === 'tests/c.js');
    const plain = parseRunAllRegistry(fake).map(x => x.script).sort();
    check('正向：三条登记全部解析出（' + plain.length + ' 条）', plain.length === 3);
    check('反向：空登记表解析出 0 条（不是崩、也不是凭空造条目）', parseRunAllRegistry('const x = 1;').length === 0);
}

// ---------------------------------------------------------------- 295 判据
function section295() {
    console.log('\n【295】自检恒返回通过 —— 必须有反向样本逼出「恒绿」');
    check('反向 R2：只有 exit(0) 的自检被抓到（恒绿线）', hit(scanRedPath(F.alwaysGreen), 'R2'), JSON.stringify(scanRedPath(F.alwaysGreen)));
    check('反向 R1：全文没有任何退码/抛错的自检被抓到', hit(scanRedPath(F.noExitAtAll), 'R1'), JSON.stringify(scanRedPath(F.noExitAtAll)));
    check('反向：红路径只写在注释里 ⇒ 仍判恒绿（注释吹牛不算证据）', hit(scanRedPath(F.exitOnlyInComment), 'R2'), JSON.stringify(scanRedPath(F.exitOnlyInComment)));

    const good = { condExit: '结论由计数推导', hardExitOne: '硬失败 exit(1)', delegated: '退码委托 main()', throwsOnBad: '异常即红', setsExitCode: 'exitCode = 1' };
    for (const k of Object.keys(good)) {
        const hits = scanRedPath(F[k]);
        check('正向：' + good[k] + ' 不判恒绿（不误伤真能变红的写法）', hits.length === 0, JSON.stringify(hits));
    }
}

// ---------------------------------------------------------------- 296 判据
function section296() {
    console.log('\n【296】硬判据必须配反向样本 —— 改了口径没人踩必须被抓到');
    check('反向 B1：hard 闸门无任何反例入口 ⇒ 命中', hit(scanReverseSample(F.gateNoProof, true), 'B1'), JSON.stringify(scanReverseSample(F.gateNoProof, true)));
    check('反向 B1：只在注释里声称有反例 ⇒ 仍命中（注释不算证据）', hit(scanReverseSample(F.gateFakeClaim, true), 'B1'), JSON.stringify(scanReverseSample(F.gateFakeClaim, true)));
    check('反向 B2：selftest 定义了却从不调用 ⇒ 命中死代码', scanReverseSample(F.gateDeadProof, true).some(h => h.startsWith('B2')), JSON.stringify(scanReverseSample(F.gateDeadProof, true)));

    check('正向：有可执行 selfCheck() 反例 ⇒ 不命中', scanReverseSample(F.gateWithProof, true).length === 0, JSON.stringify(scanReverseSample(F.gateWithProof, true)));
    check('正向：合成坏样本 + 应抓到 N ⇒ 不命中', scanReverseSample(F.gateSynthSample, true).length === 0, JSON.stringify(scanReverseSample(F.gateSynthSample, true)));
    check('正向：非 hard 条目不套 B1（观察项本就不要求反例）', scanReverseSample(F.gateNoProof, false).filter(h => h === 'B1').length === 0);
}

// ---------------------------------------------------------------- 棘轮（豁免表腐烂）
function sectionRatchet() {
    console.log('\n【棘轮】豁免/已知登记簿必须只许收缩 —— 条目失效却不删，也要能抓到');
    check('反向：豁免里的脚本已不在登记表 ⇒ 必须点名（防豁免烂在表里）',
        scanExemptDrift([{ script: 'tests/gone.mjs', cats: ['R1'] }], ['tests/alive.mjs']).length === 1);
    check('正向：豁免脚本仍在登记表 ⇒ 不误报',
        scanExemptDrift([{ script: 'tests/alive.mjs', cats: ['R1'] }], ['tests/alive.mjs']).length === 0);
    check('反向：KNOWN 条目失效 ⇒ 必须点名（296 同款棘轮）',
        pickStaleKnows([{ script: 'tests/old.mjs', cat: 'B1' }], ['tests/new.mjs']).length === 1);
    check('正向：KNOWN 在册 ⇒ 不误报',
        pickStaleKnows([{ script: 'tests/new.mjs', cat: 'B1' }], ['tests/new.mjs']).length === 0);
}

// ---------------------------------------------------------------- 真仓库实跑
function sectionRealRepo() {
    console.log('\n【真仓库实跑】两条规则跑当前工作树（结论行原样打印）');
    const r295 = rule295.test({}, [], [], [], [], [], []);
    const r296 = rule296.test({}, [], [], [], [], [], []);
    console.log('  295 ⇒ ' + (isFail(r295) ? 'FAIL' : 'PASS') + ' :: ' + summary(r295));
    console.log('  296 ⇒ ' + (isFail(r296) ? 'FAIL' : 'PASS') + ' :: ' + summary(r296));

    // 第 149 轮闭环更新：fact-coverage-selftest.mjs 已补真红退码（sampleFails/metaFails 前提塌方 ⇒ exitCode=1），
    //   295 不再把它当恒绿线点名。此前的「295 必须点名它」断言是闭环前钉的问题，已随修复翻红——
    //   改为双向核实：① 文件里确实存在非零退码出口（process.exitCode = 1）；② 295 对它不再报恒绿。
    const fcovSrc = readFileSync(fileURLToPath(new URL('../tests/fact-coverage-selftest.mjs', import.meta.url)), 'utf8');
    const hasRedExit = /process\.exitCode\s*=\s*[1-9]/.test(fcovSrc);
    check('fact-coverage-selftest.mjs 已补真红退码（存在非零 process.exitCode 赋值）', hasRedExit);
    const namedNow = isFail(r295) && /fact-coverage-selftest\.mjs/.test(summary(r295));
    check('295 对已修好的 fact-coverage-selftest 不再点名（恒绿线已闭环）', !namedNow, summary(r295));

    // 已登记真问题不复发红：296 对 health-rules-syntax-sweep 走 KNOWN
    check('296 真仓库不作红（已登记缺口走 KNOWN，表外无新增）', !isFail(r296), summary(r296));
}

function main() {
    console.log('=== D12 定向用例：体检自检自身的假绿（295/296）' + ' ===');
    sectionRegistryParser();
    section295();
    section296();
    sectionRatchet();
    sectionRealRepo();
    console.log(failures === 0
        ? '\nRESULT: PASS —— 每条硬判据（R1/R2/B1/B2）均有反向样本逼出，且干净写法 0 误伤；真仓库实跑结论同上'
        : '\nRESULT: FAIL —— 有 ' + failures + ' 条判据不成立（判据本身可疑，结论一律不作数）');
    process.exit(failures === 0 ? 0 : 1);
}

main();
