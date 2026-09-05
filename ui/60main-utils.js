// V5.5.0 | 2026-07-05
export const VER = 'ui/60main-utils.js V5.5.0';

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
            document.body.removeChild(overlay);
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
            document.body.removeChild(overlay);
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

export function showAlert(text, onOk) { let overlay = document.createElement('div'); overlay.className = 'modal-overlay'; let box = document.createElement('div'); box.className = 'modal-box'; box.innerHTML = `<div class="modal-text">${text}</div><div class="modal-buttons"><button class="modal-btn confirm">确定</button></div>`; overlay.appendChild(box); document.body.appendChild(overlay); box.querySelector('.confirm').addEventListener('click', () => { document.body.removeChild(overlay); if (onOk) onOk(); }); }

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
    const allDivs = logDiv.querySelectorAll('div');
    allDivs.forEach(div => {
        let t = div.textContent || '';
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

export function updateCoverVersion() {
    let el = document.getElementById('coverVersion');
    if (!el) return;
    el.innerHTML = [
        '✅ core/11battle-round.js V5.5.0',
        '✅ core/10battle-attack.js V5.5.0',
        '✅ core/04buff-system.js V5.5.0',
        '✅ player/42player-core.js V5.5.0',
        '✅ ui/62ui-render-5v5-test.js V5.5.0',
        '✅ fx/80fx-common-5v5-test.js V5.5.0',
        '✅ modules/20elite-skills.js V5.5.0',
        '✅ infra/54-global-store.js V5.5.0'
    ].join('<br>');
}

export async function startApp(updateCoverVersion) {
    const loaded = {};
    const failed = {};
    const modules = {
        '01config-5v5-test.js': './01config-5v5-test.js',
        '02unit.js': './02unit.js',
        '03battle-utils.js': './03battle-utils.js',
        '04buff-system.js': './04buff-system.js',
        '62ui-render-5v5-test.js': './62ui-render-5v5-test.js',
        '80fx-common-5v5-test.js': './80fx-common-5v5-test.js',
        '81fx-arrows-5v5-test.js': './81fx-arrows-5v5-test.js',
        '82fx-crash-5v5-test.js': './82fx-crash-5v5-test.js',
        '44battle-player-5v5-test.js': './44battle-player-5v5-test.js'
    };
    for (const [name, path] of Object.entries(modules)) {
        try { loaded[name] = await import(path + '?t=' + Date.now()); } catch (e) { failed[name] = true; }
    }
    updateCoverVersion(loaded, failed);
}