﻿﻿﻿﻿﻿﻿﻿﻿﻿// ui/12main-utils.js - 光明顶5v5 主控工具函数
// V5.2.1 | ~5632 bytes | 2026-07-05
export const VER = 'ui/12main-utils.js V5.2.1';

import { GlobalStore } from '../modules/46global-store.js';

export function showModal(text, buttons, onChoice, canMinimize, showCloseBtn) {
    let overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.id = 'voteModalOverlay';
    let box = document.createElement('div'); box.className = 'modal-box';
    box.style.position = 'relative';

    // 右上角关闭按钮（仅当 showCloseBtn 不为 false 时显示）
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
}

/**
 * 复制日志
 */
export function copyLogToClipboard(choice) {
    let logDiv = document.getElementById('log');
    let lines = [];
    let seen = new Set();
    if (choice === 'detailed') choice = 'all';
    if (choice === 'brief') choice = 'normal';
    if (choice === 'debug') choice = 'all';
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
    const allVers = window.ALL_VERS || {};
    // 挑 10 个最重要的模块，按顺序排
    const keys = [
        'config', 'engine', 'core', 'unit', 'utils', 'buff', 'horse',
        'ui', 'fx_common', 'player_core',
        'fx_arrows', 'fx_crash', 'fx_dodge', 'elite_skills', 'audio',
        'fx_swap', 'fx_push', 'fx_blood', 'fx_fortify', 'error_capture',
        'auto_battle', 'health_rules', 'runtime_sampler',
        'health_core', 'health_ui', 'toolkit', 'toolkit_more', 'build',
        'index', 'test_runner'
    ];
    const labels = {
        config: '01config', engine: '07engine', core: '06core', unit: '02unit',
        utils: '03utils', buff: '04buff', horse: '05horse',
        ui: '14ui-render', fx_common: '15fx-common', player_core: '10player-core',
        fx_arrows: '16fx-arrows', fx_crash: '17fx-crash', fx_dodge: '20fx-dodge',
        elite_skills: '23elite', audio: '28audio',
        fx_swap: '18fx-swap', fx_push: '19fx-push', fx_blood: '21fx-blood',
        fx_fortify: '22fx-fortify', error_capture: '24error',
        auto_battle: '27auto', health_rules: '29health-rules',
        runtime_sampler: '36runtime',
        health_core: '37health-core', health_ui: '38health-ui',
        toolkit: '32toolkit', toolkit_more: '33toolkit-more', build: '00build',
        index: '00index', test_runner: '30test-runner'
    };
    let html = '';
    for (let key of keys) {
        let ver = allVers[key] || '';
        if (ver) {
            let shortVer = ver.replace(/.*?(V[\d.]+).*/i, '$1');
            html += `✅ ${labels[key] || key} ${shortVer}<br>`;
        }
    }
    el.innerHTML = html || '模块加载中...';
}

export async function startApp(updateCoverVersion) {
    const loaded = {};
    const failed = {};
    const modules = {
        '01config-5v5-test.js': './01config-5v5-test.js',
        '07battle-engine-5v5-test.js': './07battle-engine-5v5-test.js',
        '14ui-render-5v5-test.js': './14ui-render-5v5-test.js',
        '15fx-common-5v5-test.js': './15fx-common-5v5-test.js',
        '16fx-arrows-5v5-test.js': './16fx-arrows-5v5-test.js',
        '17fx-crash-5v5-test.js': './17fx-crash-5v5-test.js',
        '11battle-player-5v5-test.js': './11battle-player-5v5-test.js'
    };
    for (const [name, path] of Object.entries(modules)) {
        try { loaded[name] = await import(path + '?t=' + Date.now()); } catch (e) { failed[name] = true; }
    }
    updateCoverVersion(loaded, failed);
}