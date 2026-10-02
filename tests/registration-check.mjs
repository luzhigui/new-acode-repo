// V1.0.0 | ~5200 bytes | 2026-09-26 第 25 轮：把每轮靠「临时探针现写现删」做的四方登记核对，做成常驻检查。
// 干什么：一条命令核对规则文件的四处登记是否齐全 ——
//   tests/health-rules/*.js  ↔  121health-monitor.js（import 装载）
//   ↔ 124rule-recipes.js（RULE_META 登记）↔ 123static-scan.js（SCAN_FILES）
//   ↔ tools/106-ai-pack-config.js（打包清单，**只读核对**）
// 为什么要有它：历次复盘都靠 `tests/_tmp-check.mjs` 现写、跑完即删 —— 结论随探针一起消失，
//   下一次重新踩同样的坑（147~152 就曾整批漏登打包清单）。常驻化之后，漏登是**机器报的**不是人想起来的。
// 退出码二分（与基线同思路，别让"我无权修的事"把红线永远染红）：
//   ① tests/ 侧缺失（121/123/124）—— 体检侧自己能修，**硬失败 exit 1**；
//   ② tools/106 侧缺失/重复 —— 官方协议明写"不修改 tools/ 下任何文件"，我无权改，
//      单列为「工具侧待办」提示，**不计入硬失败**（否则红线恒红、失去意义）。
// 运行：node tests/registration-check.mjs
// V1.1.0 | 2026-10-02 第 50 轮：补第五项检查 —— **121 内 import 了却没进 allRules 数组**。
//   旧版只核「import 语句在不在」，而 import 只负责装载、真正执行靠 `allRules` 数组；
//   153/154/155 三条就是只补了 import、数组长期停在 rule99，浏览器侧体检**从未跑过它们**
//   （node 侧 rules-replay 是自动扫目录，所以一直没暴露）。只查 import = 检查器自己在放假绿。
export const VER = 'tests/registration-check.mjs V1.1.0';

import { readdir, readFile } from 'node:fs/promises';

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');

// 规则文件导出的中文名（124 的 RULE_META 以它为 key）
function ruleName(code) {
    const m = code.match(/name:\s*['"]([^'"]+)['"]/);
    return m ? m[1] : null;
}

async function main() {
    const all = await readdir(new URL('./health-rules/', import.meta.url));
    const ruleFiles = all.filter(f => f.endsWith('.js')).sort();

    // ⚠ 必须先剥行注释再匹配：负向测试实测 —— 把 import 整行注释掉后，旧版依旧认为"已登记"
    //   （注释里的 './health-rules/xxx.js' 与 import 正则都能被匹配到），等于检查器对注释视而不见。
    //   与第 24 轮修 123static-scan「不剥注释致误报」同源，只是这里方向相反：它是误报，这里是假绿。
    const stripLineComments = (s) => s.replace(/^\s*\/\/.*$/gm, m => ' '.repeat(m.length));
    const t121 = stripLineComments(await read('./121health-monitor.js'));
    const t123 = stripLineComments(await read('./123static-scan.js'));
    const t124 = stripLineComments(await read('./124rule-recipes.js'));
    // 只读：tools/ 按官方协议不改，这里仅核对
    const t106 = await read('../tools/106-ai-pack-config.js');

    const miss121 = [], miss123 = [], miss124 = [], miss106 = [], noName = [];
    for (const f of ruleFiles) {
        if (!t121.includes('./health-rules/' + f)) miss121.push(f);
        if (!t123.includes("'./health-rules/" + f + "'")) miss123.push(f);
        const nm = ruleName(await read('./health-rules/' + f));
        if (!nm) noName.push(f);
        else if (!t124.includes(nm)) miss124.push(f + '（规则名「' + nm + '」未在 124 登记）');
        if (!t106.includes('health-rules/' + f)) miss106.push(f);
    }

    // 打包清单里的重复项（tools/106 现确有 121/122 各登记两次）
    const entries = [...t106.matchAll(/'([^']*tests\/[^']+)'/g)].map(m => m[1]);
    const seen = new Set(), dup106 = [];
    for (const e of entries) {
        if (seen.has(e)) dup106.push(e);
        seen.add(e);
    }
    // runner / 基线类文件是否被打包清单收进去（同样只报不改）
    const runners = [
        'tests/120test-runner.html', 'tests/140-baseline.js', 'tests/baselines/baseline-v1.json',
        'tests/rules-replay.mjs', 'tests/smoke-headless.mjs', 'tests/registration-check.mjs',
        'tests/coverage-report.mjs'
    ];
    const missRunner = runners.filter(r => !t106.includes(r));

    // ============ 第 50 轮新增：121 内部「import ↔ allRules 数组」一致性 ============
    // 只 import 不进数组 = 浏览器侧该规则从不执行；只进数组不 import = 直接 ReferenceError。
    // 两者都不会被旧版检查发现，故各自单列为一类硬失败。
    const imported = [...t121.matchAll(/import\s*\{\s*(rule\d+)\s*\}\s*from\s*'\.\/health-rules\//g)].map(m => m[1]);
    const arrBlock = t121.match(/const\s+allRules\s*=\s*\[([\s\S]*?)\]/);
    const inArray = arrBlock ? [...arrBlock[1].matchAll(/rule\d+/g)].map(m => m[0]) : [];
    const dangling = imported.filter(r => !inArray.includes(r));   // import 了但不执行
    const orphan = inArray.filter(r => !imported.includes(r));     // 执行了但没 import（会崩）
    const dupArray = inArray.filter((r, i) => inArray.indexOf(r) !== i);

    const hard = [];
    if (miss121.length) hard.push(['121health-monitor.js 未 import', miss121]);
    if (dangling.length) hard.push(['121 内 import 了但未进 allRules 数组（浏览器侧从不执行）', dangling]);
    if (orphan.length) hard.push(['allRules 数组引用了未 import 的规则（运行时必报未定义）', orphan]);
    if (dupArray.length) hard.push(['allRules 数组内同一规则被登记多次', [...new Set(dupArray)]]);
    if (miss123.length) hard.push(['123static-scan.js SCAN_FILES 未登记', miss123]);
    if (miss124.length) hard.push(['124rule-recipes.js RULE_META 未登记', miss124]);
    if (noName.length) hard.push(['规则文件取不到 name（无法核 124）', noName]);

    console.log(`登记一致性：health-rules ${ruleFiles.length} 个文件 · 打包清单含 tests 条目 ${entries.length} 条`);
    if (hard.length) {
        console.log(`\n[硬失败] tests/ 侧登记缺失（体检侧自修，共 ${hard.length} 类）：`);
        for (const [why, list] of hard) {
            console.log('  ✗ ' + why + '（' + list.length + '）');
            for (const x of list) console.log('      - ' + x);
        }
    } else {
        console.log(`✅ 121 / 123 / 124 三处登记齐全（含 121 内 import↔allRules 数组一致：${inArray.length} 条规则进执行数组）`);
    }

    const todo = [];
    if (miss106.length) todo.push(['tools/106 打包清单未登记规则', miss106]);
    if (missRunner.length) todo.push(['tools/106 打包清单未登记 runner/基线', missRunner]);
    if (dup106.length) todo.push(['tools/106 打包清单重复登记', [...new Set(dup106)]]);
    if (todo.length) {
        console.log('\n[工具侧待办 · 本检查不改] 仅提示，不计硬失败（官方协议：不修改 tools/ 下文件）：');
        for (const [why, list] of todo) {
            console.log('  ! ' + why + '（' + list.length + '）');
            for (const x of list) console.log('      - ' + x);
        }
    }
    if (hard.length) process.exit(1);
}

main().catch(e => { console.error('[registration-check] 失败：', e); process.exit(1); });
