// ui/80perf-panel.js — 自定义档（8x）参数面板
// 每项一个四档滑块：慢(0.5x) / 正常(2x) / 快(4x) / 极快(8x)，默认全停「正常」。
//   滑块位置 → 直接取参数表对应列的出厂值，不改出厂表本身。
// 第一行「未进表倍率」：控制所有未进参数表的演出（蝶变/换位/击退等），四档 0.5/1/2/4。
// 头/中/底三段：标题+倍率固定顶部，滑块区滚动，按钮固定底部。
// V3.0.0 | 2026-10-26 | 四档滑块 + 未进表倍率 + 三段布局 + 清单按钮
// V2.0.2 | 2026-10-26 | 滑块行加高（40px 行高 / 24px 滑块）+ 弹窗高度 88vh→72vh
export const VER = 'ui/80perf-panel.js V3.0.0';

import { GlobalStore } from '../infra/54-global-store.js';
import { clock } from '../infra/52-clock.js';
import { getPerfParams, setPerfParams, resetPerfParams, getNoTableScale, setNoTableScale, resetNoTableScale } from '../core/23perf-params.js';

const TIER = '50';           // 自定义档 = 8x
const LS_KEY = 'ming_perf_custom_8x_v1';

// 四档刻度：滑块停 0/1/2/3，分别取参数表这四列的出厂值
const STOPS = [
    { idx: 0, label: '慢',   key: '800' },
    { idx: 1, label: '正常', key: '300' },   // 正常 = 2x（用户日常档）
    { idx: 2, label: '快',   key: '150' },
    { idx: 3, label: '极快', key: '50'  },
];

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

// 第 B 类清单（未进表、跟随倍速的演出）。由扫描结果填入，供「ⓘ」按钮展示。
//   列在这里只是给人看，不参与计算——速度由「未进表倍率」统一控制。
const NO_TABLE_LIST = [
    '蝶变飞出 / 飞回（fx/86）', '蛛变升天 / 降落（fx/86）',
    '蛛袭扑击（fx/86）', '惑心换位（fx/83）',
    '击退 / 推挤（fx/84）', '狮吼冲击波（fx/91）',
    '胖远桥金锥 / 打歪（fx/92）', '护罩碎裂（fx/95）',
    '死亡画笔 / 各类横幅气泡（fx/88 · fx/80）',
    '寒离飒蓄力起手（fx/90）', '动作层连击 / 起跳收尾（render/39）',
    'Buff 面板提示 / 事件提示（player/41 · player/45）',
];

// 当前每项的刻度索引（0~3），默认 1 = 正常
let _stops = {};

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return;
        // 旧版存档存的是原始数值（毫秒 / px per ms），不是 0~3 刻度 —— 整份作废，按默认「正常」走
        let valid = true;
        for (const k of Object.keys(data)) {
            if (k === '_noTableScale') continue;
            if (!LABELS[k] || typeof data[k] !== 'number') continue;
            const n = data[k];
            if (!(n >= 0 && n <= 3) || n !== Math.floor(n)) { valid = false; break; }
        }
        if (!valid) return;
        if (typeof data._noTableScale === 'number') setNoTableScale(data._noTableScale);
        for (const k of Object.keys(data)) {
            if (k === '_noTableScale') continue;
            if (LABELS[k] && typeof data[k] === 'number') _stops[k] = data[k];
        }
    } catch (e) { /* 坏档忽略 */ }
}

function saveToStorage() {
    try {
        const out = { _noTableScale: getNoTableScale() };
        for (const k of Object.keys(LABELS)) out[k] = _stops[k] ?? 1;
        localStorage.setItem(LS_KEY, JSON.stringify(out));
        return true;
    } catch (e) { return false; }
}

// 把某一项的刻度索引换算成参数表对应列的值，写进 '50' 列
function applyStop(key, idx) {
    const stop = STOPS[idx];
    if (!stop) return;
    const params = getPerfParams();
    const row = params[key];
    if (!row) return;
    const v = row[stop.key];
    if (typeof v !== 'number') return;
    const patch = {};
    patch[key] = {};
    patch[key][TIER] = v;
    setPerfParams(patch);
}

function applyAllStops() {
    for (const k of Object.keys(LABELS)) {
        if (_stops[k] == null) _stops[k] = 1;
        applyStop(k, _stops[k]);
    }
}

function makeBtn(text, bg, onClick) {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `flex:1;padding:9px 2px;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:bold;background:${bg};color:#fff;`;
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
    // 三段布局：flex 竖排，中间区 flex:1 + overflow
    box.style.cssText = 'max-width:420px;width:94vw;height:72vh;padding:0;text-align:left;display:flex;flex-direction:column;overflow:hidden;';

    // ── 头（固定） ──
    const head = document.createElement('div');
    head.style.cssText = 'flex-shrink:0;padding:14px 14px 10px;border-bottom:2px solid #e8d5b0;';
    const title = document.createElement('div');
    title.textContent = '⚙ 自定义档（8x）';
    title.style.cssText = 'font-size:15px;font-weight:bold;color:#5c4033;text-align:center;margin-bottom:10px;';
    head.appendChild(title);

    // 第一行：未进表倍率
    const nr = document.createElement('div');
    nr.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;';
    const nrLabel = document.createElement('span');
    nrLabel.textContent = '未进表倍率';
    nrLabel.style.cssText = 'font-size:11px;color:#5c4033;width:86px;flex-shrink:0;';
    const nrSel = document.createElement('select');
    nrSel.style.cssText = 'flex:1;padding:5px;border:1px solid #ccc;border-radius:5px;font-size:12px;background:#fff;';
    [[0.5,'0.5 慢'],[1,'1 原速'],[2,'2 快'],[4,'4 极快']].forEach(([v, t]) => {
        const o = document.createElement('option');
        o.value = String(v); o.textContent = t;
        if (Math.abs(getNoTableScale() - v) < 0.001) o.selected = true;
        nrSel.appendChild(o);
    });
    nrSel.onchange = () => {
        const v = parseFloat(nrSel.value);
        setNoTableScale(v);
        // 立即生效：当前就在自定义档，直接改时钟倍率，不必重开面板/重切档位
        if (GlobalStore.get('speed') === 50) clock.setTimescale(getNoTableScale());
    };
    nr.appendChild(nrLabel); nr.appendChild(nrSel);
    head.appendChild(nr);

    const info = document.createElement('div');
    info.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 0 0;';
    const infoBtn = makeBtn('ⓘ 哪些不进表', '#8b7355', () => {
        alert('以下演出不进参数表，速度由上面的「未进表倍率」统一控制：\n\n' + NO_TABLE_LIST.map(s => '· ' + s).join('\n'));
    });
    infoBtn.style.cssText += 'font-size:10px;padding:5px 2px;';
    info.appendChild(infoBtn);
    head.appendChild(info);
    box.appendChild(head);

    // ── 中（滚动） ──
    const mid = document.createElement('div');
    mid.style.cssText = 'flex:1;overflow-y:auto;padding:4px 14px;';

    for (const key of Object.keys(LABELS)) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:9px 2px;min-height:44px;border-bottom:1px solid #eee;';

        const label = document.createElement('span');
        label.textContent = LABELS[key];
        label.style.cssText = 'font-size:11px;color:#5c4033;width:78px;flex-shrink:0;';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0'; slider.max = '3'; slider.step = '1';
        slider.value = String(_stops[key] ?? 1);
        slider.style.cssText = 'flex:1;accent-color:#b8860b;min-width:0;height:26px;';

        const val = document.createElement('span');
        val.style.cssText = 'font-size:11px;color:#8b7355;width:34px;text-align:right;flex-shrink:0;';
        val.textContent = STOPS[_stops[key] ?? 1].label;

        slider.oninput = () => {
            const idx = Math.max(0, Math.min(3, parseInt(slider.value, 10) || 0));
            _stops[key] = idx;
            val.textContent = STOPS[idx].label;
            applyStop(key, idx);
        };

        row.append(label, slider, val);
        mid.appendChild(row);
    }
    box.appendChild(mid);

    // ── 底（固定） ──
    const foot = document.createElement('div');
    foot.style.cssText = 'flex-shrink:0;padding:10px 14px 14px;border-top:2px solid #e8d5b0;background:var(--c-panel,#fdf5e6);';

    const row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;gap:6px;';
    row1.appendChild(makeBtn('💾 保存', '#4caf50', () => {
        alert(saveToStorage() ? '✅ 已保存' : '保存失败');
    }));
    row1.appendChild(makeBtn('📤 导出', '#1e6bb8', exportJson));
    row1.appendChild(makeBtn('📥 导入', '#8e44ad', importJson));
    foot.appendChild(row1);

    const row2 = document.createElement('div');
    row2.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
    row2.appendChild(makeBtn('↺ 恢复默认', '#95a5a6', () => {
        if (!confirm('恢复所有项为「正常」并清掉本地存档？')) return;
        try { localStorage.removeItem(LS_KEY); } catch (e) {}
        _stops = {};
        resetNoTableScale();
        resetPerfParams();
        applyAllStops();            // 刻度落地：让面板显示的「正常」与实际值一致
        clock.setTimescale(getNoTableScale());
        overlay.remove();
        openPanel();
    }));
    row2.appendChild(makeBtn('关闭', '#666', closePanel));
    foot.appendChild(row2);

    box.appendChild(foot);

    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePanel(); });
    document.body.appendChild(overlay);
}

function closePanel() {
    const overlay = document.getElementById('perfPanelOverlay');
    if (overlay) overlay.remove();
    if (GlobalStore.get('isPaused')) {
        GlobalStore.set('isPaused', false);
        GlobalStore.set('bulletTimeActive', false);
        document.body.classList.remove('paused-animations');
    }
}

function exportJson() {
    const out = { _noTableScale: getNoTableScale() };
    for (const k of Object.keys(LABELS)) out[k] = _stops[k] ?? 1;
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'custom-8x-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function importJson() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        try {
            const data = JSON.parse(await f.text());
            if (typeof data._noTableScale === 'number') setNoTableScale(data._noTableScale);
            for (const k of Object.keys(data)) {
                if (k === '_noTableScale') continue;
                if (LABELS[k] && typeof data[k] === 'number') _stops[k] = Math.max(0, Math.min(3, data[k] | 0));
            }
            applyAllStops();
            if (GlobalStore.get('speed') === 50) clock.setTimescale(getNoTableScale());
            const overlay = document.getElementById('perfPanelOverlay');
            if (overlay) overlay.remove();
            openPanel();
            alert('✅ 已导入');
        } catch (e) { alert('导入失败: ' + e.message); }
    };
    inp.click();
}

GlobalStore.setUIHandler('openPerfPanel', openPanel);

loadFromStorage();
applyAllStops();   // 把刻度落地成 '50' 列的实际值（出厂时全停「正常」，等价于 2x 档的值）
