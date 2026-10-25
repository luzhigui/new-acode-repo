// ui/80perf-panel.js — 表现参数面板（8x 按钮点开）
// 从 ui/77speed-controls 的 8x 按钮经 UIHandler('openPerfPanel') 打开。
// 面板读取 core/23perf-params 的全部参数，改完即时生效；支持保存/导出/导入/恢复默认。
// 关窗即恢复运行态（打开时由 8x 按钮置 isPaused，clock 的 waitWhilePaused 会冻结全部演出）。
// V1.0.0 | 2026-10-25 | ~5500 bytes
export const VER = 'ui/80perf-panel.js V1.0.0';

import { GlobalStore } from '../infra/54-global-store.js';
import { getPerfParams, setPerfParams, resetPerfParams, SPEED_TIER_KEYS } from '../core/23perf-params.js';

const LS_KEY = 'ming_perf_params_v1';

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') setPerfParams(data);
    } catch (e) { /* 坏档忽略 */ }
}

function saveToStorage() {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(getPerfParams()));
        return true;
    } catch (e) { return false; }
}

const TIER_LABELS = { '800': '0.5x', '300': '2x', '150': '4x', '50': '8x' };

function buildTable(box) {
    const params = getPerfParams();
    const table = document.createElement('table');
    table.className = 'perf-table';
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:10px;';
    let html = '<tr><th style="background:#e8d5b0;padding:4px;font-size:9px;color:#5c4033;text-align:left;">项目</th>';
    for (const tier of SPEED_TIER_KEYS) html += `<th style="background:#e8d5b0;padding:4px;font-size:9px;color:#5c4033;">${TIER_LABELS[tier]}</th>`;
    html += '</tr>';
    const LABELS = {
        charMs: '每字时长', lineGap: '行间隔', floatLife: '飘字存活', bubbleLife: '气泡存活',
        moveDur: '位移总时长', moveStart: '位移起手',
        crashSpeed: '飞撞速度', arrowSpeed: '飞箭速度', meteorSpeed: '流星速度',
        clawSpeed: '白骨爪速度', clawStart: '白骨爪起手',
        dashDur: '冲刺演出', burstDur: '轰拳爆发', bulletDur: '子弹时间',
        countdownTick: '倒计时每跳', corpseDelay: '清尸延迟',
    };
    for (const key of Object.keys(params)) {
        html += `<tr><td style="padding:2px;border-bottom:1px solid #ddd;font-size:9px;color:#555;">${LABELS[key] || key}</td>`;
        for (const tier of SPEED_TIER_KEYS) {
            const v = params[key][tier];
            html += `<td style="padding:1px;border-bottom:1px solid #ddd;"><input type="number" data-k="${key}" data-t="${tier}" value="${v}" min="0" style="width:100%;padding:2px 3px;border:1px solid #ccc;border-radius:3px;font-size:10px;text-align:center;"></td>`;
        }
        html += '</tr>';
    }
    table.innerHTML = html;
    table.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('input', () => {
            const k = inp.dataset.k, t = inp.dataset.t;
            const v = parseFloat(inp.value);
            if (!isNaN(v) && v >= 0) {
                const patch = {}; patch[k] = {}; patch[k][t] = v;
                setPerfParams(patch);
            }
        });
    });
    box.appendChild(table);
}

function makeBtn(text, bg, onClick) {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `flex:1;padding:7px 2px;border:none;border-radius:5px;font-size:11px;cursor:pointer;font-weight:bold;background:${bg};color:#fff;`;
    b.onclick = onClick;
    return b;
}

function openPanel() {
    const old = document.getElementById('perfPanelOverlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'perfPanelOverlay';
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '100040';

    const box = document.createElement('div');
    box.className = 'modal-box';
    box.style.cssText = 'max-width:520px;width:94vw;max-height:88vh;overflow-y:auto;padding:14px;';

    const title = document.createElement('div');
    title.textContent = '⚙ 表现参数（毫秒）';
    title.style.cssText = 'font-size:15px;font-weight:bold;color:#5c4033;text-align:center;margin-bottom:8px;';
    box.appendChild(title);

    buildTable(box);

    const row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;gap:6px;margin-top:12px;';
    row1.appendChild(makeBtn('💾 保存', '#4caf50', () => { saveToStorage(); alert('✅ 已保存到本地'); }));
    row1.appendChild(makeBtn('📤 导出', '#1e6bb8', exportJson));
    row1.appendChild(makeBtn('📥 导入', '#8e44ad', importJson));
    box.appendChild(row1);

    const row2 = document.createElement('div');
    row2.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
    row2.appendChild(makeBtn('↺ 恢复默认', '#95a5a6', () => {
        if (!confirm('恢复所有参数为默认值？')) return;
        resetPerfParams();
        overlay.remove();
        openPanel();
    }));
    row2.appendChild(makeBtn('关闭', '#666', closePanel));
    box.appendChild(row2);

    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePanel(); });
    document.body.appendChild(overlay);
}

function closePanel() {
    const overlay = document.getElementById('perfPanelOverlay');
    if (overlay) overlay.remove();
    // 关窗后恢复：8x 按钮点开时暂停了，这里继续
    if (GlobalStore.get('isPaused')) {
        GlobalStore.set('isPaused', false);
        GlobalStore.set('bulletTimeActive', false);
        document.body.classList.remove('paused-animations');
    }
}

function exportJson() {
    const text = JSON.stringify(getPerfParams(), null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'perf-params-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function importJson() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = async () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        try {
            const data = JSON.parse(await f.text());
            setPerfParams(data);
            const overlay = document.getElementById('perfPanelOverlay');
            if (overlay) overlay.remove();
            openPanel();
            alert('✅ 已导入');
        } catch (e) { alert('导入失败: ' + e.message); }
    };
    inp.click();
}

// 顶层注册：ui/77 的 8x 按钮经 UIHandler 打开
GlobalStore.setUIHandler('openPerfPanel', openPanel);

// 加载时读本地存档（有就覆盖默认）
loadFromStorage();
