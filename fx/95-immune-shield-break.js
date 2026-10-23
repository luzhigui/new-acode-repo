// fx/95-immune-shield-break.js — 金刚不坏护罩碎裂（空见）
// V1.0.0 | 2026-10-23 | ~2600 bytes
// 撞上瞬间：格子罩子放大淡出（CSS class），同时中心白光闪 + 8 片金色碎片向外炸开。
// 罩子本体由 render/32 按 _immuneShield 渲染（.has-immune-shield 伪元素），
// 本函数只管碎裂表现，不碰状态——步末 syncStoreFromStep 重绘时罩子自然消失。
import { clock } from '../infra/52-clock.js';
import { getUnitCell } from './90fx-ref-manager.js';

export const VER = 'fx/95-immune-shield-break.js V1.0.0';

function coreFlash(cx, cy, w, h) {
    const f = document.createElement('div');
    f.setAttribute('data-fx', 'temporary');
    f.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${w * 1.2}px;height:${h * 1.2}px;`
        + `transform:translate(-50%,-50%);border-radius:10px;pointer-events:none;z-index:10011;`
        + `background:radial-gradient(circle at 50% 48%,rgba(255,255,255,0.95) 0%,`
        + `rgba(255,240,180,0.55) 38%,rgba(255,205,90,0.12) 72%,rgba(255,205,90,0) 100%);`;
    document.body.appendChild(f);
    clock.animate(260, (p) => {
        f.style.opacity = String(1 - p);
        f.style.transform = `translate(-50%,-50%) scale(${(0.86 + p * 0.42).toFixed(3)})`;
    }).then(() => f.remove());
}

function shardBurst(cx, cy) {
    const N = 8;
    for (let i = 0; i < N; i++) {
        const a = (Math.PI * 2 * i) / N + (Math.random() - 0.5) * 0.5;
        const dist = 26 + Math.random() * 26;
        const sx = 3 + Math.random() * 4;
        const sy = 2 + Math.random() * 3;
        const d = document.createElement('div');
        d.setAttribute('data-fx', 'temporary');
        d.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${sx}px;height:${sy}px;`
            + `margin:${-sy / 2}px 0 0 ${-sx / 2}px;`
            + `background:linear-gradient(135deg,#fff6cf,#ffd166 55%,#e8a020);`
            + `border-radius:1px;opacity:0.95;pointer-events:none;z-index:10012;`
            + `box-shadow:0 0 6px rgba(255,205,90,0.9);`;
        document.body.appendChild(d);
        const dur = 340 + Math.random() * 160;
        clock.animate(dur, (p) => {
            const e = 1 - Math.pow(1 - p, 2.2);
            d.style.transform = `translate(${(Math.cos(a) * dist * e).toFixed(1)}px,${(Math.sin(a) * dist * e + 30 * p * p).toFixed(1)}px) `
                + `rotate(${(a * 180 / Math.PI + p * 180).toFixed(0)}deg) scale(${(1 - p * 0.55).toFixed(3)})`;
            d.style.opacity = String(1 - p * p);
        }).then(() => d.remove());
    }
}

export function showImmuneShieldBreak(unit) {
    const cell = getUnitCell(unit);
    if (!cell) return;
    const r = cell.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    // 罩子本体交给 CSS：换到碎裂 keyframes，320ms 放大淡出；步末重绘时 class 整体消失
    cell.classList.remove('has-immune-shield');
    cell.classList.add('immune-shield-breaking');
    clock.wait(360).then(() => cell.classList.remove('immune-shield-breaking'));

    coreFlash(cx, cy, r.width, r.height);
    shardBurst(cx, cy);
}
