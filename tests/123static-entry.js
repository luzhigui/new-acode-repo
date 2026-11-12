// tests/123static-entry.js | V1.0.0 | 2026-11-12
//
// 独立静态体检入口（模块化：与运行时规则装载彻底解耦）。
//
// 背景（2026-11-12 用户手机端实测）：点「⚡ 快速静态体检」一直卡住、没有反应。
//   根因：按钮的点击事件绑在 121health-monitor.js 的 initMonitor() 里，而 121 模块顶层有
//     await Promise.allSettled(RULE_MODULES.map(m => import(m.from)))   // 160 个规则模块
//   120test-runner.html 又 `await initMonitor()` 之后才绑 UI ⇒ 160 个动态 import 全部回来之前，
//   按钮是「没绑事件」的。静态扫描本身还要 fetch SCAN_FILES 的 175 个文件。
//   手机 / 远程网络下这两串请求慢或被并发限制，表现就是点了没反应。
//
// ★ 本模块只 import 123static-scan.js，绝不 import 121health-monitor.js（防回潮由
//   tests/static-entry-guard.mjs 机器检查）。120 在 await initMonitor() **之前**用动态
//   import('./123static-entry.js') 绑定静态按钮，因此静态体检不需要等任何运行时规则。
//
// 另加两处手机端可见性：
//   ① 等待心跳：每 2 秒把已等待秒数与待扫文件数写进状态行，避免「卡住」无法分辨是慢还是死；
//   ② 协议提示：file:// 下 fetch 会被浏览器禁用，明确报出来而不是留一个空报告。

import { runStaticScan, SCAN_FILES } from './123static-scan.js';

export const VER = 'tests/123static-entry.js V1.0.0';

const STATIC_TITLE = '⚡ 快速静态体检（不跑游戏）';

/** 纯 DOM 渲染，逻辑与旧 121.renderStaticReport 一致，reportArea 由调用方传入（不再依赖模块级变量）。 */
export function renderStaticReport(result, title, reportArea) {
    if (!reportArea) return;
    reportArea.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'report-group';
    head.style.color = '#2196f3';
    head.textContent = title + ' — ' + result.files + '个文件 ' + result.elapsedMs + 'ms';
    reportArea.appendChild(head);

    const slots = result.slots ? Object.values(result.slots) : [];
    let total = 0;
    for (const slot of slots) {
        const issues = (slot && slot.issues) || [];
        total += issues.length;
        const g = document.createElement('div');
        g.className = 'report-group';
        g.textContent = '▪ ' + (slot.name || '未命名槽位') + '（' + issues.length + '）';
        reportArea.appendChild(g);
        if (!issues.length) {
            const pass = document.createElement('div');
            pass.className = 'report-line report-pass';
            pass.textContent = '✅ 通过';
            reportArea.appendChild(pass);
        } else {
            for (const msg of issues) {
                const line = document.createElement('div');
                line.className = 'report-line report-fail';
                line.textContent = '❌ ' + msg;
                reportArea.appendChild(line);
            }
        }
    }
    const back = document.getElementById('btnBackToGame');
    if (back) back.style.display = 'inline-block';
    reportArea.scrollTop = 0;
    return total;
}

/**
 * 页面入口：切换面板 → 扫描 → 渲染。返回扫描结果（便于无头测试断言）。
 * @param {{reportArea?:HTMLElement,statusLine?:HTMLElement,gameArea?:HTMLElement,backBtn?:HTMLElement,tickMs?:number}} [opts]
 */
export async function runQuickStatic(opts = {}) {
    const doc = globalThis.document;
    const reportArea = opts.reportArea || (doc && doc.getElementById('reportArea'));
    const statusLine = opts.statusLine || (doc && doc.getElementById('statusLine'));
    const gameArea = opts.gameArea || (doc && doc.getElementById('gameArea'));
    const backBtn = opts.backBtn || (doc && doc.getElementById('btnBackToGame'));
    const totalFiles = Array.isArray(SCAN_FILES) ? SCAN_FILES.length : 0;

    // 关掉体检模式菜单（若已打开）
    const overlay = doc && doc.getElementById('healthModeOverlay');
    if (overlay) overlay.style.display = 'none';
    if (reportArea) {
        reportArea.classList.add('active');
        reportArea.innerHTML = '<div class="report-group" style="color:#2196f3;">'
            + STATIC_TITLE + ' 扫描中…（待扫 ' + totalFiles + ' 个文件）</div>';
        reportArea.scrollTop = 0;
    }
    if (gameArea) gameArea.classList.remove('active');
    if (backBtn) backBtn.style.display = 'inline-block';

    const say = (text) => { if (statusLine) statusLine.textContent = text; };
    say('静态体检扫描中…（0s / 共 ' + totalFiles + ' 个文件）');
    let waited = 0;
    const tickMs = opts.tickMs || 2000;
    // 心跳：让「网络慢」与「真卡死」在界面上可分，不会被误读成整页卡住。
    const timer = setInterval(() => {
        waited += tickMs / 1000;
        say('静态体检扫描中…（已等 ' + Math.round(waited) + 's / 共 ' + totalFiles + ' 个文件）');
    }, tickMs);

    try {
        const result = await runStaticScan();
        renderStaticReport(result, STATIC_TITLE, reportArea);
        say('静态体检完成 ✅ ' + result.files + '个文件 ' + result.elapsedMs + 'ms');
        return result;
    } catch (e) {
        const msg = String((e && e.message) || e);
        const hint = /Failed to fetch|NetworkError|TypeError/i.test(msg)
            ? '（若用 file:// 直接打开页面，浏览器会禁用 fetch；请改成本地服务器或在线链接）'
            : '';
        if (reportArea) {
            reportArea.innerHTML = '<div class="report-group report-fail">静态体检异常：' + msg + hint + '</div>';
        }
        say('静态体检失败：' + msg);
        return { error: msg };
    } finally {
        clearInterval(timer);
    }
}
