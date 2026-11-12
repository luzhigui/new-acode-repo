#!/usr/bin/env node
// tests/static-entry-guard.mjs | V1.0.0 | 2026-11-12
//
// 守什么：浏览器端「⚡ 快速静态体检」必须与运行时规则装载解耦，报告必须显形覆盖缺口。
//
// 背景（用户 2026-11-12 手机端实测）：
//   ① 点快速静态体检一直卡住 —— 按钮事件绑在 initMonitor() 里，而 121 模块顶层
//      await Promise.allSettled(160 个规则 import)，120 又 await initMonitor() ⇒ 按钮在
//      160 个请求回来前根本没绑。静态扫描自己还要 fetch 175 个文件。
//   ② 动态跑 2-7 关只报 1 个问题，但日志里能看出十几处不对 —— 报告只把 issues 当「问题数」，
//      规则大面积 skip 不显形，看起来像「代码没问题」。
//
// 本守门把这两条修法固化成机器约束（防止后人把静态按钮挪回 initMonitor、或删掉覆盖口径）：
//   A. 120 html 里静态按钮的绑定必须出现在 await initMonitor() 之前；
//   B. 120 不得静态 import 121（必须动态 import，否则顶层 await 仍会阻塞整个 script）；
//   C. 静态入口 123static-entry.js 的 import 链不得包含 121health-monitor.js；
//   D. 121 不得再绑定静态按钮、不得再 import 123static-scan.js（防双绑定 / 第二份实现）；
//   E. 121 报告必须含 coverage 字段与 COVERAGE_GAP 结论、报告头必须显形「覆盖不足」。
//
// 只读、不改任何文件；--self-test 用纯内存字符串跑正负路径，不依赖磁盘。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './_lib/static-truth-slice.mjs';

export const VER = 'tests/static-entry-guard.mjs V1.0.0';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 纯逻辑审计，注入三份源码文本即可自证（不碰磁盘）。
 * @returns {string[]} 失败项，空数组 = 通过
 */
export function auditStaticEntry({ html, entry, monitor }) {
    const fails = [];
    // ★ 行注释也要剥：120 的说明注释里写了「…并 await initMonitor()」，不剥会把注释里的
    //   await 当成真实位置，误判「静态按钮绑在 await 之后」（本轮实测踩过一次）。
    const htmlCode = String(html || '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    const entryCode = stripComments(String(entry || ''));
    const monitorCode = stripComments(String(monitor || ''));

    // A. 绑定顺序
    const bindAt = htmlCode.indexOf("getElementById('btnModeStatic')");
    const awaitAt = htmlCode.indexOf('await initMonitor()');
    if (bindAt < 0) fails.push('A：120 里找不到静态按钮绑定 ⇒ 入口丢了');
    if (awaitAt < 0) fails.push('A：120 里找不到 await initMonitor() ⇒ 取样面变了，先修守门');
    if (bindAt >= 0 && awaitAt >= 0 && bindAt > awaitAt) {
        fails.push('A：静态按钮绑在 await initMonitor() 之后 ⇒ 回潮：又要等 160 个规则模块才能点');
    }

    // B. 静态 import 121（顶层 await 会阻塞整个 script）
    if (/^\s*import\s*\{[^}]*initMonitor[^}]*\}\s*from\s*'\.\/121health-monitor\.js'/m.test(htmlCode)) {
        fails.push('B：120 又改回静态 import 121health-monitor.js ⇒ 顶层 await 会阻塞按钮绑定');
    }
    if (!/import\s*\(\s*'\.\/121health-monitor\.js'\s*\)/.test(htmlCode)) {
        fails.push('B：120 没有动态 import 121health-monitor.js ⇒ 运行时规则装载路径断了');
    }

    // C. 静态入口依赖链
    if (!/from\s*'\.\/123static-scan\.js'/.test(entryCode)) {
        fails.push('C：静态入口没有 import 123static-scan.js ⇒ 扫描能力断了');
    }
    if (/from\s*['"]\.\/121health-monitor\.js['"]/.test(entryCode)) {
        fails.push('C：静态入口 import 了 121health-monitor.js ⇒ 解耦失效，又会等 160 个模块');
    }
    if (!/setInterval|心跳/.test(entryCode)) {
        fails.push('C：静态入口没有等待心跳 ⇒ 手机端「慢」与「卡死」又分不清了');
    }

    // D. 121 不得再管静态体检
    if (/btnModeStatic/.test(monitorCode)) {
        fails.push('D：121 里仍有 btnModeStatic 引用 ⇒ 双绑定或残留变量');
    }
    if (/from\s*'\.\/123static-scan\.js'/.test(monitorCode)) {
        fails.push('D：121 仍 import 123static-scan.js ⇒ 静态实现又抄回第二份');
    }

    // E. 覆盖口径
    if (!/coverage\s*:/.test(monitorCode)) fails.push('E：报告缺 coverage 字段 ⇒ 自动化读不到覆盖口径');
    if (!/COVERAGE_GAP/.test(monitorCode)) fails.push('E：报告缺 COVERAGE_GAP 结论 ⇒ 覆盖不足无法判定');
    if (!/覆盖不足/.test(monitorCode)) fails.push('E：报告头不显形「覆盖不足」⇒ 又会把没覆盖写成没问题');
    return fails;
}

/** 纯内存正负路径：每条判据都必须能被咬住。 */
export function selfTest() {
    const fails = [];
    const good = {
        html: [
            "<script type=\"module\">",
            "document.getElementById('btnModeStatic').addEventListener('click', async () => {",
            "  const { runQuickStatic } = await import('./123static-entry.js');",
            "  await runQuickStatic();",
            "});",
            "const { initMonitor } = await import('./121health-monitor.js');",
            "await initMonitor();",
            "</script>"
        ].join('\n'),
        entry: [
            "import { runStaticScan, SCAN_FILES } from './123static-scan.js';",
            "const timer = setInterval(() => {}, 2000);"
        ].join('\n'),
        monitor: [
            "coverage: { registered: 160, skip: 0 },",
            "verdict: x ? 'COVERAGE_GAP' : 'OK'",
            "metaDiv.textContent = '⚠ 覆盖不足：本次结论不代表没有问题';"
        ].join('\n')
    };
    if (auditStaticEntry(good).length) {
        fails.push('正路径：合规样本本应全绿，实得 ' + JSON.stringify(auditStaticEntry(good)));
    }
    const mutate = (patch, why) => {
        const r = auditStaticEntry({ ...good, ...patch });
        if (!r.length) fails.push('负路径「' + why + '」竟没报 ⇒ 假绿');
    };
    // A：把绑定挪到 await 之后
    mutate({ html: good.html.replace(
        /document\.getElementById\('btnModeStatic'\)[\s\S]*?\}\);\n/, '')
        .replace('await initMonitor();',
            "await initMonitor();\ndocument.getElementById('btnModeStatic').addEventListener('click', () => {});") },
        '静态按钮绑在 await 之后');
    // B：改回静态 import
    mutate({ html: good.html.replace("const { initMonitor } = await import('./121health-monitor.js');",
        "import { initMonitor } from './121health-monitor.js';") },
        '120 静态 import 121');
    // C：静态入口依赖 121 / 丢心跳
    mutate({ entry: good.entry + "\nimport { x } from './121health-monitor.js';" }, '静态入口 import 121');
    mutate({ entry: good.entry.replace(/const timer = setInterval[^\n]*/, '') }, '静态入口丢心跳');
    // D：121 双绑定 / 第二份实现
    mutate({ monitor: good.monitor + "\nif (btnModeStatic) btnModeStatic.addEventListener('click', () => {});" }, '121 双绑定');
    mutate({ monitor: good.monitor + "\nimport { runStaticScan } from './123static-scan.js';" }, '121 抄回静态实现');
    // E：删覆盖口径
    mutate({ monitor: good.monitor.replace(/coverage[^\n]*\n/, '').replace(/verdict[^\n]*\n/, '') }, '报告缺 coverage');
    mutate({ monitor: good.monitor.replace('覆盖不足', '覆盖良好') }, '报告头不显形覆盖不足');
    return fails;
}

function main() {
    if (process.argv.includes('--self-test')) {
        const fails = selfTest();
        if (fails.length) {
            console.log('❌ 静态入口守门自证失败 ' + fails.length + ' 处：');
            for (const f of fails) console.log('  · ' + f);
            return 1;
        }
        console.log('✅ 静态入口守门自证 9 条全过（A 顺序 / B 动态 import / C 依赖链与心跳 / D 无双绑定 / E 覆盖口径）');
        return 0;
    }
    const read = (rel) => {
        try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
        catch (e) { return null; }
    };
    const src = {
        html: read('tests/120test-runner.html'),
        entry: read('tests/123static-entry.js'),
        monitor: read('tests/121health-monitor.js')
    };
    for (const [k, v] of Object.entries(src)) {
        if (v == null) { console.log('⚠ 守卫前提失效：读不到 ' + k); return 2; }
    }
    const fails = auditStaticEntry(src);
    if (fails.length) {
        console.log('❌ 静态入口约束失守 ' + fails.length + ' 处：');
        for (const f of fails) console.log('  · ' + f);
        return 1;
    }
    console.log('✅ 静态入口约束 PASS（静态体检不等规则装载 / 无双绑定 / 报告显形覆盖缺口）');
    return 0;
}

if (process.argv[1] && /static-entry-guard\.mjs$/.test(process.argv[1])) process.exit(main());
