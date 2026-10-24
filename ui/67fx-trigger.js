// ui/67fx-trigger.js — 特效开关弹窗（V7.0.0）
//   2026-10-24 老板口径：单个「华丽/简单」按钮 → 弹窗内 3 项独立开关 + 全开/全关。
//   ① 闪避反击·子弹时间（含反击伤害数字、闪避气泡、眩晕时机） ② 寒离飒·蓄意轰拳瞄准弹窗
//   ③ 唐文亮·冲刺子弹时间。
//   dodgeEffectEnabled 降级为派生值（= 任一项开着），只供按钮文案与体检读；
//   运行时各特效一律读自己的细分 key，不再共用一个大开关。
// V7.0.0 | 2026-10-24 | ~3200 bytes
export const VER = 'ui/67fx-trigger.js V7.0.0';

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
}

function buildPanel() {
    let p = document.getElementById('fxEffectPanel');
    if (p) return p;
    p = document.createElement('div');
    p.id = 'fxEffectPanel';
    p.style.cssText = 'position:fixed;right:16px;top:96px;z-index:100000;background:rgba(24,24,28,0.96);' +
        'border:1px solid rgba(255,255,255,0.16);border-radius:10px;padding:14px 16px;color:#eee;' +
        'font-size:14px;box-shadow:0 8px 28px rgba(0,0,0,0.55);display:none;min-width:210px;';

    const title = document.createElement('div');
    title.textContent = '特效开关';
    title.style.cssText = 'font-weight:bold;margin-bottom:10px;letter-spacing:1px;';
    p.appendChild(title);

    for (const it of FX_ITEMS) {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:6px 0;cursor:pointer;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.setAttribute('data-fx-key', it.key);
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
    btns.style.cssText = 'display:flex;gap:8px;margin-top:12px;';
    const mkBtn = (text, val) => {
        const b = document.createElement('button');
        b.textContent = text;
        b.style.cssText = 'flex:1;padding:6px 0;border-radius:6px;border:1px solid rgba(255,255,255,0.2);' +
            'background:rgba(255,255,255,0.08);color:#eee;cursor:pointer;font-size:13px;';
        b.onclick = () => setAll(val);
        return b;
    };
    btns.append(mkBtn('全开（华丽）', true), mkBtn('全关（普通）', false));
    p.appendChild(btns);

    document.body.appendChild(p);
    return p;
}

// 「华丽」按钮本体：点开/收起特效面板
export function toggleFxPanel() {
    const p = buildPanel();
    const willShow = p.style.display === 'none';
    p.style.display = willShow ? 'block' : 'none';
    if (willShow) syncPanel();
    syncFxButton();
}
