// V6.1.0 | ~7500 bytes | 2026-09-22 新增角色实战 demo 开关：_forceXieXun / _forcePang / _startStage 一并一次性消费
export const VER = 'ui/60main-utils.js V6.1.0';

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
    // 2026-09-22 新角色实战 demo（dev-index 三按钮）：
    // _forceXieXun 之前只有 29battle-init 直读 localStorage 的路径，不清除会一直生效，这里补上一次性消费
    if (localStorage.getItem('_forceXieXun') === '1') {
        GlobalStore.set('forceXieXun', true);
        localStorage.removeItem('_forceXieXun');
    }
    if (localStorage.getItem('_forcePang') === '1') {
        GlobalStore.set('forcePang', true);
        localStorage.removeItem('_forcePang');
    }
    // _startStage：指定开局关卡（1~7）。本函数在 DOMContentLoaded 时执行，
    // 晚于 ui/63 模块顶层的 currentStage=1，且早于用户点封面触发的首次 doInitBattle，覆盖有效。
    const startStage = parseInt(localStorage.getItem('_startStage'), 10);
    if (startStage >= 1) {
        GlobalStore.set('currentStage', startStage);
        localStorage.removeItem('_startStage');
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
// 2026-09-19 追加页面文件时间：GitHub Pages 上是最后部署时间，刷新一眼即可判断线上是否最新版
export function updateCoverVersion() {
    const el = document.getElementById('coverVersion');
    if (!el) return;
    const vers = (typeof window !== 'undefined' && window.ALL_VERS) || {};
    const keys = Object.keys(vers);
    if (keys.length === 0) return;
    const d = document.lastModified ? new Date(document.lastModified) : null;
    const stamp = (d && !isNaN(d.getTime()) && d.getFullYear() > 2000)
        ? '🕒 ' + d.toLocaleString('zh-CN', { hour12: false }) + '<br>'
        : '';
    el.innerHTML = stamp + keys.map(k => '✅ ' + vers[k]).join('<br>');
}