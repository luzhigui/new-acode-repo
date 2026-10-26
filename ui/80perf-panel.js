// ui/80perf-panel.js — 自定义档（8x）参数面板（滑块版）
// 8x 按钮点开：只调「自定义档」这一列（SPEED_TIER 的 '50'），其他四档（0.5x/1x/2x/4x）
//   由 core/23perf-params.js 的 DEFAULTS 决定，出厂永不变，本面板不碰。
// 滑块拖动即时生效（当前局）；「保存」写本地（只存自定义档），刷新后仍在。
// V2.0.1 | 2026-10-26 | 补 closeHitDur（贴身图标）滑块——此前漏项，8x 档该参数锁死 400ms 且不落存档
// V2.0.0 | 2026-10-26 | ~6300 bytes | 表格改滑块；只读写 '50' 列；本地存档独立 key，不再整份覆盖
export const VER = 'ui/80perf-panel.js V2.0.1';

import { GlobalStore } from '../infra/54-global-store.js';
import { getPerfParams, setPerfParams, resetPerfParams } from '../core/23perf-params.js';

// 自定义档 = 8x 按钮对应的 speed 值
const TIER = '50';
// 独立存档 key：与旧的整份存档（ming_perf_params_v1）隔离，避免旧脏数据污染其他档
const LS_KEY = 'ming_perf_custom_8x_v1';

// 每项滑块的取值范围 / 步长 / 单位。速度类「越大越快」，时长类「越大越慢」。
const RANGES = {
    charMs:        { min: 1,   max: 60,   step: 1,    unit: 'ms' },
    charMsAnchor:  { min: 1,   max: 30,   step: 1,    unit: 'ms' },
    lineGap:       { min: 0,   max: 200,  step: 2,    unit: 'ms' },
    floatLife:     { min: 100, max: 3000, step: 50,   unit: 'ms' },
    bubbleLife:    { min: 100, max: 3000, step: 50,   unit: 'ms' },
    moveDur:       { min: 50,  max: 2000, step: 10,   unit: 'ms' },
    moveStart:     { min: 0,   max: 600,  step: 10,   unit: 'ms' },
    crashSpeed:    { min: 0.1, max: 3,    step: 0.05, unit: 'px/ms' },
    arrowSpeed:    { min: 0.1, max: 6,    step: 0.1,  unit: 'px/ms' },
    meteorSpeed:   { min: 0.1, max: 6,    step: 0.1,  unit: 'px/ms' },
    clawSpeed:     { min: 0.1, max: 6,    step: 0.1,  unit: 'px/ms' },
    clawStart:     { min: 20,  max: 600,  step: 10,   unit: 'ms' },
    closeHitDur:   { min: 200, max: 2000, step: 50,   unit: 'ms' },
    dashDur:       { min: 200, max: 4000, step: 50,   unit: 'ms' },
    burstDur:      { min: 200, max: 4000, step: 50,   unit: 'ms' },
    bulletDur:     { min: 500, max: 8000, step: 100,  unit: 'ms' },
    countdownTick: { min: 50,  max: 1200, step: 10,   unit: 'ms' },
    corpseDelay:   { min: 200, max: 5000, step: 50,   unit: 'ms' },
};

const LABELS = {
    charMs: '每字时长', charMsAnchor: '锚点行每字', lineGap: '行间隔',
    floatLife: '飘字存活', bubbleLife: '气泡存活',
    moveDur: '位移总时长', moveStart: '位移起手',
    crashSpeed: '飞撞速度', arrowSpeed: '飞箭速度', meteorSpeed: '流星速度',
    clawSpeed: '白骨爪速度', clawStart: '白骨爪起手',
    closeHitDur: '贴身图标',
    dashDur: '冲刺演出', burstDur: '轰拳爆发', bulletDur: '子弹时间',
    countdownTick: '倒计时每跳', corpseDelay: '清尸延迟',
};

function fmtVal(v, rg) {
    if (rg.unit === 'px/ms') return v.toFixed(2);
    return String(Math.round(v));
}

// 本地存档格式：{ charMs: 7, lineGap: 12, ... } —— 只含自定义档的数值
function loadFromStorage() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return;
        const patch = {};
        for (const k of Object.keys(data)) {
            if (RANGES[k] && typeof data[k] === 'number') {
                patch[k] = {};
                patch[k][TIER] = data[k];
            }
        }
        setPerfParams(patch);
    } catch (e) { /* 坏档忽略 */ }
}

function saveToStorage() {
    try {
        const params = getPerfParams();
        const out = {};
        for (const k of Object.keys(RANGES)) out[k] = params[k][TIER];
        localStorage.setItem(LS_KEY, JSON.stringify(out));
        return true;
    } catch (e) { return false; }
}

function buildSliders(box) {
    const params = getPerfParams();
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:11px;';

    for (const key of Object.keys(RANGES)) {
        const rg = RANGES[key];
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;';

        const label = document.createElement('span');
        label.textContent = LABELS[key] || key;
        label.style.cssText = 'font-size:11px;color:#5c4033;width:86px;flex-shrink:0;';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = String(rg.min);
        slider.max = String(rg.max);
        slider.step = String(rg.step);
        slider.value = String(params[key][TIER]);
        slider.style.cssText = 'flex:1;accent-color:#b8860b;min-width:0;';

        const val = document.createElement('span');
        val.style.cssText = 'font-size:11px;color:#8b7355;width:56px;text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums;';
        val.textContent = fmtVal(params[key][TIER], rg);

        slider.oninput = () => {
            const v = parseFloat(slider.value);
            if (isNaN(v)) return;
            val.textContent = fmtVal(v, rg);
            const patch = {};
            patch[key] = {};
            patch[key][TIER] = v;
            setPerfParams(patch);
        };

        row.append(label, slider, val);
        wrap.appendChild(row);
    }
    box.appendChild(wrap);
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
    box.style.cssText = 'max-width:420px;width:94vw;max-height:88vh;overflow-y:auto;padding:14px;text-align:left;';

    const title = document.createElement('div');
    title.textContent = '⚙ 自定义档（8x）';
    title.style.cssText = 'font-size:15px;font-weight:bold;color:#5c4033;text-align:center;margin-bottom:6px;';
    box.appendChild(title);

    const tip = document.createElement('div');
    tip.textContent = '只影响 8x 这一档。0.5x / 1x / 2x / 4x 由出厂设置决定，不受此处影响。拖动即时生效，关掉面板才能看到画面。';
    tip.style.cssText = 'font-size:10px;color:#8b7355;line-height:1.6;margin-bottom:12px;text-align:center;';
    box.appendChild(tip);

    buildSliders(box);

    const row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;gap:6px;margin-top:14px;';
    row1.appendChild(makeBtn('💾 保存', '#4caf50', () => {
        if (saveToStorage()) alert('✅ 已保存（只存自定义档）');
        else alert('保存失败');
    }));
    row1.appendChild(makeBtn('📤 导出', '#1e6bb8', exportJson));
    row1.appendChild(makeBtn('📥 导入', '#8e44ad', importJson));
    box.appendChild(row1);

    const row2 = document.createElement('div');
    row2.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
    row2.appendChild(makeBtn('↺ 恢复默认', '#95a5a6', () => {
        if (!confirm('恢复自定义档为出厂值？（同时清掉本地存档）')) return;
        try { localStorage.removeItem(LS_KEY); } catch (e) {}
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
    // 关窗恢复运行：8x 按钮打开面板时置了 isPaused
    if (GlobalStore.get('isPaused')) {
        GlobalStore.set('isPaused', false);
        GlobalStore.set('bulletTimeActive', false);
        document.body.classList.remove('paused-animations');
    }
}

function exportJson() {
    const params = getPerfParams();
    const out = {};
    for (const k of Object.keys(RANGES)) out[k] = params[k][TIER];
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'custom-8x-' + new Date().toISOString().slice(0, 10) + '.json';
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
            const patch = {};
            for (const k of Object.keys(data)) {
                if (RANGES[k] && typeof data[k] === 'number') {
                    patch[k] = {};
                    patch[k][TIER] = data[k];
                }
            }
            setPerfParams(patch);
            const overlay = document.getElementById('perfPanelOverlay');
            if (overlay) overlay.remove();
            openPanel();
            alert('✅ 已导入（只改自定义档）');
        } catch (e) { alert('导入失败: ' + e.message); }
    };
    inp.click();
}

// 顶层注册：ui/77 的 8x 按钮经 UIHandler 打开
GlobalStore.setUIHandler('openPerfPanel', openPanel);

// 加载时读本地存档（只覆盖自定义档）
loadFromStorage();
