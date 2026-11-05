export const VER = 'modules/303-error-capture.js V6.1.0';
// V6.1.0 | 2026-11-05 | Bug 报告改两档（复制精简 ≤2万字符 / 下载全量）；🐞 改为「仅暂停时出现」

import { GlobalStore } from '../infra/104-global-store.js';

(function initErrorCapture() {
    // ---------- 创建面板（index.html <head> 内联段可能已因早期加载错误建过同名 panel：
    //            有则复用，避免双 id / 两条线写进两个面板）----------
    const errorPanel = document.getElementById('errorCapturePanel') || (() => {
        const p = document.createElement('div');
        p.id = 'errorCapturePanel';
        p.style.cssText = 
            'position:fixed;bottom:0;left:0;right:0;max-height:25vh;overflow-y:auto;' +
            'background:rgba(20,0,0,0.92);color:#f88;font-size:10px;z-index:99999;' +
            'padding:4px 8px;font-family:monospace;display:none;';
        document.body.appendChild(p);
        return p;
    })();

    // ---------- Bug 报告：内存记录 + 当前后台上下文截取 ----------
    const bugRecords = [];
    // 复制用精简档 / 下载用全量档：2026-11-05 实测全量约 20 万字符，剪贴板根本吃不下
    const REPORT_MAX_CHARS = 20000;                 // 复制版硬上限
    function nowIso() { return new Date().toISOString(); }
    function safeJson(v, maxLen) {
        try {
            let s = JSON.stringify(v);
            if (maxLen && s && s.length > maxLen) s = s.slice(0, maxLen) + '…(截断)';
            return s;
        } catch (e) { return String(v); }
    }
    function collectBugContext(full) {
        const ctx = { capturedAt: nowIso(), location: location.href, userAgent: navigator.userAgent };
        try {
            if (typeof window.__BUG_CONTEXT__ === 'function') {
                const extra = window.__BUG_CONTEXT__(full ? { full: true } : undefined);
                if (extra && typeof extra === 'object') Object.assign(ctx, extra);
            }
        } catch (e) { ctx._contextError = String((e && e.stack) || e); }
        return ctx;
    }
    function buildBugReport(kind, full) {
        const lines = [];
        lines.push('# 游戏 Bug 记录');
        lines.push('');
        lines.push('- 记录时间：' + nowIso());
        lines.push('- 触发方式：' + (kind || '手动记录'));
        lines.push('');
        lines.push('## 错误/告警记录');
        if (!bugRecords.length) lines.push('（无）');
        else bugRecords.slice(-20).forEach((r, i) => {          // 最多 20 条，再多的老记录价值低
            lines.push('');
            lines.push(`### #${i + 1} [${r.type}] ${r.time}`);
            lines.push('```');
            lines.push(String(r.text).slice(0, 2000));          // 单条也封顶，防止一条巨长日志撑爆
            lines.push('```');
        });
        lines.push('');
        lines.push('## 记录时后台上下文');
        lines.push('```json');
        // 复制版整体封顶两万字符；下载版不封顶（用户可以看完整文件）
        lines.push(safeJson(collectBugContext(full), full ? 0 : REPORT_MAX_CHARS));
        lines.push('```');
        let text = lines.join('\n');
        if (!full && text.length > REPORT_MAX_CHARS) {
            text = text.slice(0, REPORT_MAX_CHARS) + '\n\n…(已截断，完整版请点「下载Bug报告」)';
        }
        return text;
    }
    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
        }
        fallbackCopy(text);
        return Promise.resolve();
    }
    function fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
    }
    function downloadText(text, name) {
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 10000);
    }
    function recordCurrentBug(kind) {
        // ⚠️ 不要把上下文 push 进 bugRecords：
        //    buildBugReport 里已经会现采一份「记录时后台上下文」，
        //    再存一份的话，每点一次 🐞 报告就多叠一层全量日志，越点越大。
        //    bugRecords 只装真正的错误/告警行。
        // 复制走精简档（≤2 万字符）；完整版用面板里的「下载Bug报告」。
        const text = buildBugReport(kind || '手动记录', false);
        copyText(text).then(() => {
            addLine(`🐞 已记录并复制（${Math.round(text.length / 1024)}KB，可直接粘贴给 AI）`, 'warn');
        }).catch(() => {
            downloadText(text, 'bug-report-' + Date.now() + '.md');
            addLine('🐞 已记录当前 Bug，剪贴板不可用，已下载 .md 文件', 'warn');
        });
    }

    // 按钮栏
    const btnBar = document.createElement('div');
    btnBar.style.cssText = 'position:fixed;bottom:25vh;right:4px;z-index:99999;display:none;';
    const copyAllBtn = document.createElement('button');
    copyAllBtn.textContent = '复制全部';
    copyAllBtn.style.cssText = 'font-size:10px;padding:2px 6px;margin-right:4px;';
    copyAllBtn.onclick = () => {
        const text = errorPanel.innerText;
        navigator.clipboard.writeText(text).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        });
    };
    const copyReportBtn = document.createElement('button');
    copyReportBtn.textContent = '复制Bug报告';
    copyReportBtn.title = '精简版（约 2 万字符以内），可直接粘给 AI';
    copyReportBtn.style.cssText = 'font-size:10px;padding:2px 6px;margin-right:4px;';
    copyReportBtn.onclick = () => copyText(buildBugReport('手动导出', false));
    const downloadReportBtn = document.createElement('button');
    downloadReportBtn.textContent = '下载Bug报告';
    downloadReportBtn.title = '完整版（不截断，适合存档后自己挑重点）';
    downloadReportBtn.style.cssText = 'font-size:10px;padding:2px 6px;margin-right:4px;';
    downloadReportBtn.onclick = () => downloadText(buildBugReport('手动导出', true), 'bug-report-' + Date.now() + '.md');
    const clearBtn = document.createElement('button');
    clearBtn.textContent = '清空';
    clearBtn.style.cssText = 'font-size:10px;padding:2px 6px;';
    clearBtn.onclick = () => {
        errorPanel.innerHTML = '';
        errorPanel.style.display = 'none';
        btnBar.style.display = 'none';
        bugRecords.length = 0;
    };
    btnBar.appendChild(copyAllBtn);
    btnBar.appendChild(copyReportBtn);
    btnBar.appendChild(downloadReportBtn);
    btnBar.appendChild(clearBtn);
    document.body.appendChild(btnBar);

    // ---------- 🐞 快捷记录按钮：只在「暂停」时出现 ----------
    // 2026-11-05 用户反馈：常驻在右下角一直挂着不好看，而且平时也不该误点。
    // 改成跟 isPaused 联动：暂停（含面板暂停）时才显形，继续游戏就自动隐藏。
    // 位置也避开右下角操作区，挪到右侧中部偏下。
    const bugQuickBtn = document.createElement('button');
    bugQuickBtn.id = 'dshBugQuickBtn';                    // 固定 id：重复执行 init 时先清旧的，免得多颗
    bugQuickBtn.textContent = '🐞 记录Bug';
    bugQuickBtn.title = '把当前错误 + 后台战斗日志复制到剪贴板，直接粘给 AI';
    bugQuickBtn.style.cssText =
        'position:fixed;right:8px;bottom:32vh;z-index:99999;' +
        'display:none;padding:6px 12px;border-radius:18px;' +
        'border:1px solid #ffd700;background:rgba(30,20,10,.9);color:#ffd700;' +
        'font-size:12px;line-height:1;cursor:pointer;' +
        'box-shadow:0 2px 8px rgba(0,0,0,.4);';
    bugQuickBtn.onclick = () => recordCurrentBug('暂停时记录');

    function syncBugBtn() {
        // 直接读 store：比 window.GlobalStore 可靠（ES module 里 window 上不一定挂）
        try {
            bugQuickBtn.style.display = GlobalStore.get('isPaused') ? 'block' : 'none';
        } catch (e) { bugQuickBtn.style.display = 'none'; }
    }

    // 重复执行 init 时先清掉上一颗（开发热重载 / SPA 重进都会再跑一遍）
    try {
        const old = document.getElementById('dshBugQuickBtn');
        if (old && old !== bugQuickBtn) old.remove();
    } catch (e) { /* 忽略 */ }
    document.body.appendChild(bugQuickBtn);

    // 跟 GlobalStore.isPaused 联动（含面板暂停：719 的 syncPauseState 会把它一起置位）
    try { GlobalStore.on('isPaused', syncBugBtn); } catch (e) { /* 轮询兜底 */ }
    syncBugBtn();
    // 兜底轮询：SPA 重绘 / 事件漏触发时也能跟上。只读一个布尔，代价可忽略。
    // 存到 window 上，同页面重跑 init 时先把旧的清掉，避免越积越多。
    try {
        if (window.__dshBugBtnTimer) clearInterval(window.__dshBugBtnTimer);
        window.__dshBugBtnTimer = setInterval(syncBugBtn, 1000);
    } catch (e) { setInterval(syncBugBtn, 1000); }

    // ---------- 格式化对象为可读字符串 ----------
    function formatArgs(args) {
        return args.map(arg => {
            if (arg instanceof Error) {
                return arg.stack || arg.message;
            }
            if (typeof arg === 'object' && arg !== null) {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');
    }

    // ---------- 添加一行错误到面板 ----------
    function addLine(text, type) {
        const line = document.createElement('div');
        line.style.marginBottom = '4px';
        line.style.padding = '4px';
        line.style.borderRadius = '4px';
        line.style.position = 'relative';

        // 颜色和背景
        if (type === 'error') {
            line.style.color = '#f55';
            line.style.background = 'rgba(255,50,50,0.15)';
            line.style.borderLeft = '3px solid #f55';
        } else if (type === 'warn') {
            line.style.color = '#fa0';
            line.style.background = 'rgba(255,170,0,0.1)';
            line.style.borderLeft = '3px solid #fa0';
        } else {
            line.style.color = '#ccc';
            line.style.background = 'rgba(255,255,255,0.05)';
            line.style.borderLeft = '3px solid #888';
        }

        const pre = document.createElement('pre');
        pre.textContent = text;
        pre.style.margin = '0';
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.wordBreak = 'break-all';
        pre.style.fontSize = '10px';
        line.appendChild(pre);

        // 单条复制按钮
        const copyBtn = document.createElement('button');
        copyBtn.textContent = '复制';
        copyBtn.style.cssText = 
            'position:absolute;top:4px;right:4px;font-size:9px;padding:0 4px;' +
            'background:#333;color:#ccc;border:1px solid #555;border-radius:2px;cursor:pointer;';
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(text).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            });
        };
        line.appendChild(copyBtn);

        bugRecords.push({ time: nowIso(), type: type || 'info', text });
        if (bugRecords.length > 200) bugRecords.shift();
        errorPanel.appendChild(line);
        errorPanel.style.display = 'block';
        btnBar.style.display = 'block';
        errorPanel.scrollTop = errorPanel.scrollHeight;
    }

    // ---------- 全局错误 ----------
window.addEventListener('error', function(e) {
    const loc = e.filename ? `${e.filename}:${e.lineno}` : '';
    const msg = e.error && e.error.stack 
        ? loc + '\n' + e.error.stack 
        : (e.message ? loc + ' ' + e.message : loc);
    addLine(msg, 'error');
});
    // ---------- Promise 拒绝 ----------
    window.addEventListener('unhandledrejection', function(e) {
        const reason = e.reason;
        const msg = reason && reason.stack 
            ? reason.stack 
            : (reason ? (reason.message || JSON.stringify(reason)) : '未处理的 Promise 拒绝');
        addLine(msg, 'error');
    });

    // ---------- 增强 console.error ----------
    const origError = console.error;
    console.error = function(...args) {
        const msg = formatArgs(args);
        addLine(msg, 'error');
        origError.apply(console, args);
    };

    // ---------- 增强 console.warn ----------
    const origWarn = console.warn;
    console.warn = function(...args) {
        const msg = formatArgs(args);
        addLine(msg, 'warn');
        origWarn.apply(console, args);
    };

    // 注意：不拦截 console.log，保持原生性能
})();