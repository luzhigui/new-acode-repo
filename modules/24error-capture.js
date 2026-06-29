// modules/24error-capture.js - 光明顶5v5 全局错误捕获
// V4.0.0 | ~120 lines | 2026-06-29 09:29
export const VER = 'modules/24error-capture.js V4.0.0';

(function initErrorCapture() {
    // ---------- 创建面板 ----------
    const errorPanel = document.createElement('div');
    errorPanel.id = 'errorCapturePanel';
    errorPanel.style.cssText = 
        'position:fixed;bottom:0;left:0;right:0;max-height:25vh;overflow-y:auto;' +
        'background:rgba(20,0,0,0.92);color:#f88;font-size:10px;z-index:99999;' +
        'padding:4px 8px;font-family:monospace;display:none;';
    document.body.appendChild(errorPanel);

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
    const clearBtn = document.createElement('button');
    clearBtn.textContent = '清空';
    clearBtn.style.cssText = 'font-size:10px;padding:2px 6px;';
    clearBtn.onclick = () => {
        errorPanel.innerHTML = '';
        errorPanel.style.display = 'none';
        btnBar.style.display = 'none';
    };
    btnBar.appendChild(copyAllBtn);
    btnBar.appendChild(clearBtn);
    document.body.appendChild(btnBar);

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

        errorPanel.appendChild(line);
        errorPanel.style.display = 'block';
        btnBar.style.display = 'block';
        errorPanel.scrollTop = errorPanel.scrollHeight;
    }

    // ---------- 全局错误 ----------
    window.addEventListener('error', function(e) {
        const msg = e.error && e.error.stack 
            ? e.error.stack 
            : (e.message + ' @ ' + e.filename + ':' + e.lineno);
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