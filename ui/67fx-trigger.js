// ui/67fx-trigger.js — 特效开关弹窗（V7.1.0）
//   2026-10-24 老板口径：单个「华丽/简单」按钮 → 弹窗内 3 项独立开关 + 全开/全关。
//   ① 闪避反击·子弹时间（含反击伤害数字、闪避气泡、眩晕时机） ② 寒离飒·蓄意轰拳瞄准弹窗
//   ③ 唐文亮·冲刺子弹时间。
//   dodgeEffectEnabled 降级为派生值（= 任一项开着），只供按钮文案与体检读；
//   运行时各特效一律读自己的细分 key，不再共用一个大开关。
// V7.1.0 | 2026-10-24 | ~4200 bytes
//   V7.1.0：改居中弹窗（复用 .modal-overlay/.modal-box 羊皮纸皮肤）+ 半透明遮罩；
//           标题栏加 ✕；点遮罩可关；全开/全关生效后自动关闭（单项勾选不关，方便继续调）。
export const VER = 'ui/67fx-trigger.js V7.1.0';

import { GlobalStore } from '../infra/54-global-store.js';

export const FX_ITEMS = [
    { key: 'fxDodgeBullet', label: '闪避反击·子弹时间' },
    { key: 'fxHanlisaAim', label: '寒离飒·蓄意轰拳瞄准' },
    { key: 'fxDashSlow', label: '唐文亮·冲刺子弹时间' }
];

function anyOn() {
    return FX_ITEMS.some(it => !!GlobalStore.get(it.key));
}

// 按钮文案跟着「是否有任意一项开着」走（体检 tests/122 按 active + 华丽/简单 校验）
export function syncFxButton() {
    const btn = document.getElementById('btnDodgeToggle');
    if (!btn) return;
    const on = anyOn();
    btn.classList.toggle('active', on);
    btn.textContent = on ? '华丽' : '简单';
}

function overlayEl() { return document.getElementById('fxEffectOverlay'); }

function closePanel() {
    const o = overlayEl();
    if (o) o.style.display = 'none';
}

function syncPanel() {
    const p = document.getElementById('fxEffectPanel');
    if (!p) return;
    for (const it of FX_ITEMS) {
        const cb = p.querySelector(`input[data-fx-key="${it.key}"]`);
        if (cb) cb.checked = !!GlobalStore.get(it.key);
    }
}

function setAll(v) {
    for (const it of FX_ITEMS) GlobalStore.set(it.key, v);
    GlobalStore.set('dodgeEffectEnabled', v);
    syncPanel();
    syncFxButton();
    closePanel();
}

function buildPanel() {
    let o = overlayEl();
    if (o) return o;
    // 复用全局弹窗皮肤（index.html 的 .modal-overlay / .modal-box），保证与 buff 弹窗同款
    o = document.createElement('div');
    o.id = 'fxEffectOverlay';
    o.className = 'modal-overlay';
    o.style.display = 'none';
    o.style.zIndex = '100030';

    const p = document.createElement('div');
    p.id = 'fxEffectPanel';
    p.className = 'modal-box';
    p.style.cssText = 'max-width:300px;width:86vw;text-align:left;';
    p.addEventListener('click', (e) => e.stopPropagation());
    o.addEventListener('click', closePanel);

    const title = document.createElement('div');
    title.textContent = '特效开关';
    title.style.cssText = 'font-size:15px;font-weight:bold;color:var(--c-brown);text-align:center;margin-bottom:12px;';
    const close = document.createElement('span');
    close.textContent = '✕';
    close.className = 'modal-minimize';
    close.style.cssText = 'position:absolute;top:8px;right:14px;cursor:pointer;font-size:20px;color:var(--c-brown-border);font-weight:bold;';
    close.addEventListener('click', closePanel);
    p.append(title, close);

    for (const it of FX_ITEMS) {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:10px 0;cursor:pointer;color:var(--c-brown);font-size:13px;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.setAttribute('data-fx-key', it.key);
        cb.style.cssText = 'width:16px;height:16px;accent-color:var(--c-gold);flex-shrink:0;';
        cb.checked = !!GlobalStore.get(it.key);
        cb.onchange = () => {
            GlobalStore.set(it.key, cb.checked);
            GlobalStore.set('dodgeEffectEnabled', anyOn());
            syncFxButton();
        };
        const sp = document.createElement('span');
        sp.textContent = it.label;
        row.append(cb, sp);
        p.appendChild(row);
    }

    const btns = document.createElement('div');
    btns.className = 'modal-buttons';
    btns.style.cssText = 'display:flex;gap:10px;margin-top:16px;';
    const mkBtn = (text, val, cls) => {
        const b = document.createElement('button');
        b.textContent = text;
        b.className = 'modal-btn' + (cls ? ' ' + cls : '');
        b.style.cssText = 'flex:1;padding:8px 0;font-size:12px;';
        b.onclick = () => setAll(val);
        return b;
    };
    btns.append(mkBtn('全开（华丽）', true, 'ming'), mkBtn('全关（普通）', false, 'skip'));
    p.appendChild(btns);

    o.appendChild(p);
    document.body.appendChild(o);
    return o;
}

// 「华丽」按钮本体：点开/收起特效面板（点遮罩、✕、全开/全关后都会自动收起）
export function toggleFxPanel() {
    const o = buildPanel();
    const willShow = o.style.display === 'none';
    o.style.display = willShow ? 'flex' : 'none';
    if (willShow) syncPanel();
    syncFxButton();
}
