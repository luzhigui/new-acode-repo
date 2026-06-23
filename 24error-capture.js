// 24error-capture.js - 全局错误捕获与控制台转存（增加复制功能）
// 预估行数: 65, 发送时间: 20260622 09:30, 版本: V1.0.1
export const VER = '24error-capture.js V1.0.1';

(function initErrorCapture() {
    let errorPanel = document.createElement('div');
    errorPanel.id = 'errorCapturePanel';
    errorPanel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;max-height:20vh;overflow-y:auto;background:rgba(30,0,0,0.9);color:#f88;font-size:10px;z-index:99999;padding:4px 8px;font-family:monospace;display:none;';
    document.body.appendChild(errorPanel);

    // 按钮栏
    let btnBar = document.createElement('div');
    btnBar.style.cssText = 'position:fixed;bottom:20vh;right:4px;z-index:99999;display:none;';
    let copyBtn = document.createElement('button');
    copyBtn.textContent = '复制';
    copyBtn.style.cssText = 'font-size:10px;padding:2px 6px;margin-right:4px;';
    copyBtn.onclick = function() {
        let text = errorPanel.innerText;
        navigator.clipboard.writeText(text).catch(() => {
            let ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        });
    };
    let clearBtn = document.createElement('button');
    clearBtn.textContent = '清空';
    clearBtn.style.cssText = 'font-size:10px;padding:2px 6px;';
    clearBtn.onclick = function() {
        errorPanel.innerHTML = '';
        errorPanel.style.display = 'none';
        btnBar.style.display = 'none';
    };
    btnBar.appendChild(copyBtn);
    btnBar.appendChild(clearBtn);
    document.body.appendChild(btnBar);

    function showError(text, type) {
        let line = document.createElement('div');
        let color = type === 'error' ? '#f55' : '#fa0';
        line.style.color = color;
        line.textContent = '[' + type.toUpperCase() + '] ' + text;
        errorPanel.appendChild(line);
        errorPanel.style.display = 'block';
        btnBar.style.display = 'block';
        errorPanel.scrollTop = errorPanel.scrollHeight;
    }

    window.addEventListener('error', function(e) {
        showError(e.message + ' @ ' + e.filename + ':' + e.lineno, 'error');
    });

    window.addEventListener('unhandledrejection', function(e) {
        showError('Promise 拒绝: ' + (e.reason ? e.reason.message || e.reason : '未知'), 'error');
    });

    const origError = console.error;
    console.error = function(...args) {
        showError(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '), 'error');
        origError.apply(console, args);
    };

    const origWarn = console.warn;
    console.warn = function(...args) {
        showError(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '), 'warn');
        origWarn.apply(console, args);
    };
})();