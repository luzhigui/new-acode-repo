// V6.0.1 | ~6900 bytes | 2026-09-11 删 startApp 死函数；updateCoverVersion 改读 window.ALL_VERS 动态生成版本列表
// V6.0.0 | ~7400 bytes | 2026-07-05
export const VER = 'ui/60main-utils.js V6.0.1';

import { GlobalStore } from '../infra/54-global-store.js';

export function showModal(text, buttons, onChoice, canMinimize, showCloseBtn) {
    let overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.id = 'voteModalOverlay';
    let box = document.createElement('div'); box.className = 'modal-box';
    box.style.position = 'relative';

    // 右上角关闭按钮，showCloseBtn=false 时隐藏
    if (showCloseBtn !== false) {
        let closeBtn = document.createElement('span');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = 'position:absolute;top:8px;right:12px;cursor:pointer;font-size:18px;color:#8b7355;font-weight:bold;z-index:10;';
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            if (overlay.parentNode) overlay.remove();
            document.getElementById('voteFloat').style.display = 'none';
        };
        box.appendChild(closeBtn);
    }

    let contentDiv = document.createElement('div');
    let inner = `<div class="modal-text" style="margin-right:24px;">${text}</div>` + (canMinimize ? '<span class="modal-minimize" id="modalMinimize">∧</span>' : '') + '<div class="modal-buttons"></div>';
    contentDiv.innerHTML = inner;
    box.appendChild(contentDiv);

    let btnsDiv = box.querySelector('.modal-buttons');
    buttons.forEach(b => {
        let btn = document.createElement('button');
        btn.className = 'modal-btn ' + (b.cls || '');
        btn.textContent = b.text;
        btn.addEventListener('click', () => {
            if (overlay.parentNode) overlay.remove();
            document.getElementById('voteFloat').style.display = 'none';
            if (onChoice) onChoice(b.value);
        });
        btnsDiv.appendChild(btn);
    });
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            overlay.style.display = 'none';
            document.getElementById('voteFloat').style.display = 'flex';
        }
    });
    if (canMinimize) {
        document.getElementById('modalMinimize').addEventListener('click', () => {
            overlay.style.display = 'none';
            document.getElementById('voteFloat').style.display = 'flex';
        });
    }
}

export function showAlert(text, onOk) { let overlay = document.createElement('div'); overlay.className = 'modal-overlay'; let box = document.createElement('div'); box.className = 'modal-box'; box.innerHTML = `<div class="modal-text">${text}</div><div class="modal-buttons"><button class="modal-btn confirm">确定</button></div>`; overlay.appendChild(box); document.body.appendChild(overlay); box.querySelector('.confirm').addEventListener('click', () => { if (overlay.parentNode) overlay.remove(); if (onOk) onOk(); }); }

/**
 * 封面页传入的特殊模式初始化
 */
export function initBugAndXiaoZhaoModes() {
    const xzMode = localStorage.getItem('_forceXiaoZhao');
    if (xzMode === 'sister' || xzMode === 'brother') {
        GlobalStore.set('forceXiaoZhao', xzMode);
        localStorage.removeItem('_forceXiaoZhao');
    }
    if (localStorage.getItem('_bugMode') === '1') {
        GlobalStore.set('bugMode', true);
        localStorage.removeItem('_bugMode');
    }
    if (localStorage.getItem('_forceZhang') === '1') {
        GlobalStore.set('forceZhang', true);
        localStorage.removeItem('_forceZhang');
    }
    if (localStorage.getItem('_forceWei') === '1') {
        GlobalStore.set('forceWei', true);
        localStorage.removeItem('_forceWei');
    }
}

export function copyLogToClipboard(choice) {
    let logDiv = document.getElementById('log');
    let lines = [];
    let seen = new Set();
    if (choice === 'detailed') choice = 'all';
    if (choice === 'brief') choice = 'normal';
    if (choice === 'debug') choice = 'all';
    if (choice === 'recent15') {
        const allDivs = Array.from(logDiv.children);
        const recent = allDivs.slice(-15);
        let text = recent.map(div => (div.textContent || '').trim()).filter(t => t).join('\n');
        if (!text.trim()) { showAlert('没有匹配的日志'); return; }
        navigator.clipboard.writeText(text).then(() => showAlert('最新15行日志已复制'));
        return;
    }
    const allChildren = Array.from(logDiv.children);
    allChildren.forEach(child => {
        if (child.classList.contains('detail-hidden')) return;
        let t = child.textContent || '';
        t = t.trim();
        if (!t) return;
        if (t.includes('获得Buff') || t.includes('🗯️') || t.includes('🗣️')) {
            if (choice === 'normal' || choice === 'all') lines.push(t);
            return;
        }
        if (t.includes('回合开始') || t.includes('回合结束')) {
            let key = t.substring(0, 20);
            if (seen.has(key)) return;
            seen.add(key);
        }
        if (t.includes('初始阵容') || t.includes('阵容详情')) {
            let key = t.substring(0, 15);
            if (seen.has(key)) return;
            seen.add(key);
        }
        if (choice === 'health') {
            if (t.includes('[体检]')) lines.push(t);
        } else if (choice === 'normal') {
            if (!t.includes('[体检]') && !t.includes('[版本信息]') && !t.includes('[子模块]')) lines.push(t);
        } else {
            lines.push(t);
        }
    });
    let text = lines.join('\n');
    if (!text.trim()) { showAlert('没有匹配的日志'); return; }
    navigator.clipboard.writeText(text).then(() => showAlert('日志已复制'));
}

// 版本列表从 window.ALL_VERS 动态生成（61 启动时写入），避免各处版本号与硬编码列表脱节
export function updateCoverVersion() {
    const el = document.getElementById('coverVersion');
    if (!el) return;
    const vers = (typeof window !== 'undefined' && window.ALL_VERS) || {};
    const keys = Object.keys(vers);
    if (keys.length === 0) return;
    el.innerHTML = keys.map(k => '✅ ' + vers[k]).join('<br>');
}