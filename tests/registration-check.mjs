// V1.0.0 | ~8600 bytes | 2026-09-26 第 25 轮：把每轮靠「临时探针现写现删」做的四方登记核对，做成常驻检查。
// 干什么：一条命令核对规则文件的四处登记是否齐全 ——
//   tests/health-rules/*.js  ↔  121health-monitor.js（import 装载）
//   ↔ 124rule-recipes.js（RULE_META 登记）↔ 123static-scan.js（SCAN_FILES）
//   ↔ tools/106-ai-pack-config.js（打包清单，**只读核对**）
// 为什么要有它：历次复盘都靠 `tests/_tmp-check.mjs` 现写、跑完即删 —— 结论随探针一起消失，
//   下一次重新踩同样的坑（147~152 就曾整批漏登打包清单）。常驻化之后，漏登是**机器报的**不是人想起来的。
// 退出码二分（与基线同思路，别让"我无权修的事"把红线永远染红）：
//   ① tests/ 侧缺失（121/123/124）—— 体检侧自己能修，**硬失败 exit 1**；
//   ② tools/106 侧 —— **106 是「复制包清单」：打包给网页端 DeepSeek 看的文件子集，
//      按用户定调（2026-10-02）本就有意不全，新体检规则/runner 不要求往里登记，
//      重复登记也无害**。故 106 差异只输出一行中性说明，不算待办、不计硬失败、不要去补登。
// 运行：node tests/registration-check.mjs
// V1.1.1 | 2026-10-02 按用户定调更正 106 口径：从「工具侧待办提示」改为「复制包有意不全，差异不核对」，
//   避免每出一条新规则（如 157）就刷一条"未登记"误导成漏登。
// V1.1.0 | 2026-10-02 第 50 轮：补第五项检查 —— **121 内 import 了却没进 allRules 数组**。
//   旧版只核「import 语句在不在」，而 import 只负责装载、真正执行靠 `allRules` 数组；
//   153/154/155 三条就是只补了 import、数组长期停在 rule99，浏览器侧体检**从未跑过它们**
//   （node 侧 rules-replay 是自动扫目录，所以一直没暴露）。只查 import = 检查器自己在放假绿。
// V1.2.0 | 2026-10-08 修 import↔allRules 解析的别名盲区：121 用 `import { rule156 as rule103 }`（156 导出名按文件号），
//   旧正则要求 `(rule\d+)\s*}` 紧邻花括号，别名项隔着 ` as ` 整条漏匹配，rule103 被误判「数组引用未 import」硬失败（假红）。
//   改为拆分花括号逐项解析，取**本地绑定名**（as 后的别名优先，与 allRules 引用一致）。
// V1.3.0 | 2026-10-13 体检第 84 轮：新增第六项检查 —— **modules/26 拆分结构对账**（26elite-sixsects.js
//   2026-10-13 拆成「注册入口 + 6 个角色组件文件」后的新静默失效面）：(a) 死文件（组件存在但入口没 import）、
//   (b) import 断裂（入口 import 的组件文件不存在）、(c) 死导出（组件导出了入口没引用 = 组件逻辑没挂上注册链）、
//   (d) 漏 import（入口正文用 register* 却没 import）、(e) 漏导出（入口 import 的远端名组件里没 export）。
//   判据是**源码级静态对账、非运行时**（入口/组件是浏览器代码，node 不加载）；
//   解析出 0 条一律硬红（防零触发假绿），核心逻辑抽成 checkSixsectsStructure 纯函数供牙齿探针注入反例。
export const VER = 'tests/registration-check.mjs V1.3.0';

import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');

// ============ V1.3.0：modules/26 拆分结构对账（纯函数，供牙齿探针注入反例）============
// 入参：entryCode = 26elite-sixsects.js 源码（已剥行注释）；compSources = { '26elite-sixsects-xxx.js': 源码 }
// 返回：问题字符串数组（空 = 一致）。判据 (a)~(e) 见文件头 V1.3.0；判据是静态源码级、非运行时。
export function checkSixsectsStructure(entryCode, compSources) {
    const problems = [];
    const compNames = Object.keys(compSources);
    // 零触发守卫：解析面为 0 = 正则/扫描失配，硬红（防空跑假绿）
    if (!entryCode || !entryCode.trim()) { problems.push('零触发守卫：入口源码为空'); return problems; }
    if (compNames.length === 0) { problems.push('零触发守卫：组件文件数为 0（目录扫描失效？）'); return problems; }

    // 解析入口里对组件文件的 named import：远端名（as 前）+ 本地绑定名
    const imports = new Map(); // 组件文件名 -> [{ remote, local }]
    for (const im of entryCode.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/(26elite-sixsects-[^']+)'/g)) {
        const list = [];
        for (const part of im[1].split(',')) {
            const mm = part.trim().match(/^(\w+)(?:\s+as\s+(\w+))?$/);
            if (mm) list.push({ remote: mm[1], local: mm[2] || mm[1] });
        }
        if (!imports.has(im[2])) imports.set(im[2], []);
        imports.get(im[2]).push(...list);
    }
    if (imports.size === 0) problems.push('零触发守卫：入口未解析出任何组件 import（解析失配？）');

    // (a) 死文件：组件存在但入口没 import = 拆出去了却没挂上（机制静默失效）
    for (const f of compNames) {
        if (!imports.has(f)) problems.push(`(a) 死文件：${f} 存在但入口未 import（组件没挂上注册链）`);
    }
    // (b) 断裂：入口 import 的组件文件必须真实存在
    for (const f of imports.keys()) {
        if (!compSources[f]) problems.push(`(b) import 断裂：入口 import 的 ./${f} 不存在`);
    }

    // (c) 死导出 / (e) 漏导出：逐组件文件对账导出面 ↔ 入口引用面
    for (const [f, code] of Object.entries(compSources)) {
        const exported = new Set();
        for (const m of code.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)) exported.add(m[1]);
        for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) {
            for (const p of m[1].split(',')) { const mm = p.trim().match(/^(\w+)/); if (mm) exported.add(mm[1]); }
        }
        if (exported.size === 0) { problems.push(`零触发守卫：${f} 未解析出任何导出（解析失配？）`); continue; }
        const remoteNames = new Set((imports.get(f) || []).map(x => x.remote));
        for (const name of exported) {
            if (name === 'VER') continue; // 版本元数据不算组件逻辑
            if (!remoteNames.has(name)) problems.push(`(c) 死导出：${f} 的 export ${name} 未被入口引用（导出了没人用 = 逻辑没执行）`);
        }
        for (const { remote } of (imports.get(f) || [])) {
            if (!exported.has(remote)) problems.push(`(e) 漏导出：入口 import 的 ${remote} 在 ${f} 中无 export（浏览器加载即报错）`);
        }
    }

    // (d) 漏 import：入口正文引用注册 API 时必须在 import 绑定里（浏览器加载即 ReferenceError）
    const boundLocals = new Set();
    for (const im of entryCode.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[^']+'/g)) {
        for (const part of im[1].split(',')) {
            const mm = part.trim().match(/^(\w+)(?:\s+as\s+(\w+))?$/);
            if (mm) boundLocals.add(mm[2] || mm[1]);
        }
    }
    const body = entryCode.replace(/import\s*\{[^}]*\}\s*from\s*'[^']+'\s*;?/g, '');
    for (const api of ['registerElite', 'registerMechanicHandler', 'registerLinkPartners']) {
        if (new RegExp('(?<![\\w$.])' + api + '\\s*\\(').test(body) && !boundLocals.has(api)) {
            problems.push(`(d) 漏 import：入口正文使用了 ${api}(...)，但 import 列表里没有它`);
        }
    }
    return problems;
}

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
    // 解析 121 规则 import 的**本地绑定名**（allRules 引用的就是本地名）。
    // 必须支持别名 `import { rule156 as rule103 }`：旧正则要求 `(rule\d+)\s*}` 紧邻花括号，
    // 别名项隔着 ` as ` 整条漏匹配 ⇒ rule103 被误判「数组引用未 import」假红（V1.2.0，2026-10-08）。
    const imported = [];
    for (const im of t121.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/health-rules\//g)) {
        for (const part of im[1].split(',')) {
            const mm = part.match(/(rule\d+)(?:\s+as\s+(rule\d+))?/);
            if (mm) imported.push(mm[2] || mm[1]); // 有别名取本地绑定名，否则取原名
        }
    }
    const arrBlock = t121.match(/const\s+allRules\s*=\s*\[([\s\S]*?)\]/);
    const inArray = arrBlock ? [...arrBlock[1].matchAll(/rule\d+/g)].map(m => m[0]) : [];
    const dangling = imported.filter(r => !inArray.includes(r));   // import 了但不执行
    const orphan = inArray.filter(r => !imported.includes(r));     // 执行了但没 import（会崩）
    const dupArray = inArray.filter((r, i) => inArray.indexOf(r) !== i);

    // ============ V1.3.0：modules/26 拆分结构对账（源码级静态，非运行时）============
    const modDir = new URL('../modules/', import.meta.url);
    const modFiles = (await readdir(modDir)).filter(f => /^26elite-sixsects-.+\.js$/.test(f)).sort();
    const compSources = {};
    for (const f of modFiles) compSources[f] = stripLineComments(await readFile(new URL(f, modDir), 'utf8'));
    const entry26 = stripLineComments(await read('../modules/26elite-sixsects.js'));
    const sixProblems = checkSixsectsStructure(entry26, compSources);

    const hard = [];
    if (miss121.length) hard.push(['121health-monitor.js 未 import', miss121]);
    if (dangling.length) hard.push(['121 内 import 了但未进 allRules 数组（浏览器侧从不执行）', dangling]);
    if (orphan.length) hard.push(['allRules 数组引用了未 import 的规则（运行时必报未定义）', orphan]);
    if (dupArray.length) hard.push(['allRules 数组内同一规则被登记多次', [...new Set(dupArray)]]);
    if (miss123.length) hard.push(['123static-scan.js SCAN_FILES 未登记', miss123]);
    if (miss124.length) hard.push(['124rule-recipes.js RULE_META 未登记', miss124]);
    if (noName.length) hard.push(['规则文件取不到 name（无法核 124）', noName]);
    if (sixProblems.length) hard.push(['modules/26 拆分结构对账失败（死文件/断裂/死导出/漏 import/漏导出）', sixProblems]);

    console.log(`登记一致性：health-rules ${ruleFiles.length} 个文件 · 打包清单含 tests 条目 ${entries.length} 条 · modules/26 入口 + ${modFiles.length} 个组件文件`);
    if (hard.length) {
        console.log(`\n[硬失败] tests/ 侧登记缺失（体检侧自修，共 ${hard.length} 类）：`);
        for (const [why, list] of hard) {
            console.log('  ✗ ' + why + '（' + list.length + '）');
            for (const x of list) console.log('      - ' + x);
        }
    } else {
        console.log(`✅ 121 / 123 / 124 三处登记齐全（含 121 内 import↔allRules 数组一致：${inArray.length} 条规则进执行数组）· modules/26 拆分结构一致（入口 + ${modFiles.length} 组件，死文件/断裂/死导出/漏 import/漏导出 均无）`);
    }

    // 106 是给网页端 DeepSeek 的复制包清单，有意不全（见头部 V1.1.1 说明）：
    // 新规则/runner 未纳入、或个别条目重复，均为预期内，不核对、不报待办、不要补登。
    const diff106 = miss106.length + missRunner.length + new Set(dup106).size;
    if (diff106 > 0) {
        console.log(`ℹ tools/106 复制包清单与 tests/ 现有 ${diff106} 处差异（新规则/runner 未纳入或重复）——复制包有意不全，属预期内，不核对`);
    }
    if (hard.length) process.exit(1);
}

// CLI 入口守卫：被牙齿探针 import 时只取 checkSixsectsStructure 纯函数，不跑 main（V1.3.0，与 contract-consistency 同口径）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(e => { console.error('[registration-check] 失败：', e); process.exit(1); });
}
