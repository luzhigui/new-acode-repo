// fx/93-hanlisa-burst.js — 寒离飒「蓄力轰拳」爆发瞬间视觉（方案 A，修订：柔光扇形 + 向外涟漪，慢节奏）
//   · 顶点=寒离飒(2号位)，从顶点位置慢慢向外铺开一道柔光扇形（金→冰蓝径向渐变，非实心三角）
//   · 两道涟漪环沿扇形弧线由内向外扩散、渐隐（示意 AOE 范围，不画死边）
//   · 真伤格(2/5/8)：冰蓝高光 + 白色碎裂 + 脉冲（语义：把所受之伤奉还）
//   · 半伤格(4/6/7/9)：红棕凹痕 + 格子慢震一下
//   · 顶点升「轰」字 + 金/冰双环拳心脉冲
// V1.1.0 | ~3600 bytes | 2026-10-17 修订：弃硬三角，改柔光扇形+涟漪，整体放慢（用户指正"太丑/太快/一下打满"）
export const VER = 'fx/93-hanlisa-burst.js V1.1.0';

import { clock } from '../infra/52-clock.js';
import { markGridShake } from '../render/32-grid-render.js';

function centerOf(uid) {
    const el = document.querySelector(`[data-uid="${uid}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}

const SVGNS = 'http://www.w3.org/2000/svg';

// 柔光扇形 + 向外涟漪：从顶点慢慢铺开，不画死三角
function shockwave(apex, hits) {
    if (!apex || !hits.length) return;
    const left = hits.reduce((a, b) => (b.x < a.x ? b : a));
    const right = hits.reduce((a, b) => (b.x > a.x ? b : a));
    const c1 = left, c2 = right;
    const R0 = Math.max(Math.hypot(c1.x - apex.x, c1.y - apex.y), Math.hypot(c2.x - apex.x, c2.y - apex.y), 1);

    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('data-fx', 'temporary');
    svg.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;overflow:visible;pointer-events:none;z-index:10009;';
    svg.innerHTML = `
        <defs>
            <radialGradient id="hlsGrad" gradientUnits="userSpaceOnUse" cx="${apex.x}" cy="${apex.y}" r="${R0}">
                <stop offset="0%" stop-color="rgba(255,215,0,0.55)"/>
                <stop offset="50%" stop-color="rgba(255,170,60,0.28)"/>
                <stop offset="100%" stop-color="rgba(127,199,255,0.04)"/>
            </radialGradient>
        </defs>
        <path id="hlsBody" fill="url(#hlsGrad)" stroke="none"/>
        <path id="hlsRing1" fill="none" stroke="rgba(255,200,80,0.85)" stroke-width="3" stroke-linecap="round"/>
        <path id="hlsRing2" fill="none" stroke="rgba(127,199,255,0.7)" stroke-width="2.5" stroke-linecap="round"/>`;
    document.body.appendChild(svg);
    const body = svg.querySelector('#hlsBody');
    const ring1 = svg.querySelector('#hlsRing1');
    const ring2 = svg.querySelector('#hlsRing2');
    const grad = svg.querySelector('#hlsGrad');

    // 扇形（外缘为弧，非直线）——随 scale 从顶点向外铺开
    const sector = (s) => {
        const a = { x: apex.x + (c1.x - apex.x) * s, y: apex.y + (c1.y - apex.y) * s };
        const b = { x: apex.x + (c2.x - apex.x) * s, y: apex.y + (c2.y - apex.y) * s };
        const R = R0 * s;
        return `M ${apex.x} ${apex.y} L ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${R.toFixed(1)} ${R.toFixed(1)} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)} Z`;
    };
    // 仅弧线（涟漪）
    const arc = (s) => {
        const a = { x: apex.x + (c1.x - apex.x) * s, y: apex.y + (c1.y - apex.y) * s };
        const b = { x: apex.x + (c2.x - apex.x) * s, y: apex.y + (c2.y - apex.y) * s };
        const R = R0 * s;
        return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${R.toFixed(1)} ${R.toFixed(1)} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    };

    // 主体柔光：从顶点慢慢向外铺开（~1200ms）
    body.setAttribute('d', sector(0.12));
    grad.setAttribute('r', R0 * 0.12);
    clock.animate(1200, (p) => {
        const s = 0.12 + 1.15 * p;
        body.setAttribute('d', sector(s));
        grad.setAttribute('r', (R0 * s).toFixed(1));
        body.style.opacity = (0.8 * (1 - p)).toFixed(3);
    });

    // 两道涟漪：由内向外扩散、渐隐
    const ripple = (ring, delay, from, to) => {
        ring.setAttribute('d', arc(from));
        ring.style.opacity = '0';
        clock.wait(delay).then(() => clock.animate(950, (p) => {
            const s = from + (to - from) * p;
            ring.setAttribute('d', arc(s));
            ring.style.opacity = (1 - p).toFixed(3);
        }));
    };
    ripple(ring1, 0, 0.2, 1.18);
    ripple(ring2, 240, 0.38, 1.28);

    clock.wait(1500).then(() => { if (svg.parentNode) svg.remove(); });
}

// 真伤格：冰蓝高光 + 白色碎裂裂纹（奉还语义），慢一点
function shatterTrue(uid) {
    const el = document.querySelector(`[data-uid="${uid}"]`);
    if (el) {
        const base = el.style.boxShadow;
        el.style.boxShadow = 'inset 0 0 16px 5px rgba(127,199,255,0.9)';
        clock.wait(200).then(() => {
            el.style.boxShadow = 'inset 0 0 7px 1px rgba(127,199,255,0.4)';
            clock.wait(500).then(() => { el.style.boxShadow = base || ''; });
        });
    }
    const r = el ? el.getBoundingClientRect() : null;
    if (!r) return;
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('data-fx', 'temporary');
    svg.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;pointer-events:none;z-index:10011;`;
    const cx = r.width / 2, cy = r.height / 2;
    svg.innerHTML = `
        <polyline points="${cx - 18},${cy - 14} ${cx},${cy} ${cx - 6},${cy + 16}" fill="none" stroke="#ffffff" stroke-width="2" stroke-opacity="0.95"/>
        <polyline points="${cx + 16},${cy - 12} ${cx},${cy} ${cx + 8},${cy + 14}" fill="none" stroke="#ffffff" stroke-width="2" stroke-opacity="0.95"/>
        <polyline points="${cx - 4},${cy - 18} ${cx},${cy} ${cx + 2},${cy + 18}" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-opacity="0.8"/>`;
    document.body.appendChild(svg);
    clock.animate(1100, (p) => { svg.style.opacity = (1 - p).toFixed(2); }).then(() => { if (svg.parentNode) svg.remove(); });
}

// 半伤格：红棕凹痕 + 慢震一下
function impactHalf(uid) {
    const el = document.querySelector(`[data-uid="${uid}"]`);
    if (el) {
        const base = el.style.boxShadow;
        el.style.boxShadow = 'inset 0 0 14px 4px rgba(139,58,30,0.85)';
        clock.wait(260).then(() => {
            el.style.boxShadow = 'inset 0 0 6px 1px rgba(139,58,30,0.35)';
            clock.wait(420).then(() => { el.style.boxShadow = base || ''; });
        });
    }
    markGridShake(uid, 500);
}

// 顶点升「轰」字 + 金/冰双环拳心脉冲（放慢）
function wordAndCore(apex) {
    const word = document.createElement('div');
    word.setAttribute('data-fx', 'temporary');
    word.textContent = '轰';
    word.style.cssText = `position:fixed;left:${apex.x}px;top:${apex.y - 30}px;transform:translate(-50%,-50%);font-size:30px;font-weight:900;color:#b8860b;text-shadow:0 0 12px rgba(255,160,0,0.9),0 2px 4px rgba(0,0,0,0.8);z-index:10012;pointer-events:none;opacity:0;`;
    document.body.appendChild(word);
    clock.animate(1400, (p) => {
        let op, sc, ty;
        if (p <= 0.22) { const t = p / 0.22; op = t; sc = 0.5 + 0.7 * t; ty = -10 * t; }
        else if (p <= 0.65) { const t = (p - 0.22) / 0.43; op = 1; sc = 1.2; ty = -10 - 18 * t; }
        else { const t = (p - 0.65) / 0.35; op = 1 - t; sc = 1.2 - 0.2 * t; ty = -28; }
        word.style.opacity = op;
        word.style.transform = `translate(-50%, calc(-50% + ${ty}px)) scale(${sc})`;
    }).then(() => { if (word.parentNode) word.remove(); });

    [['rgba(255,215,0,', 0], ['rgba(127,199,255,', 180]].forEach(([col, delay]) => {
        clock.wait(delay).then(() => {
            const ring = document.createElement('div');
            ring.setAttribute('data-fx', 'temporary');
            ring.style.cssText = `position:fixed;left:${apex.x}px;top:${apex.y}px;width:14px;height:14px;margin:-7px 0 0 -7px;border:2px solid ${col}0.9);border-radius:50%;z-index:10011;pointer-events:none;opacity:0;`;
            document.body.appendChild(ring);
            clock.animate(1000, (p) => {
                const s = 14 + p * 78;
                ring.style.width = s + 'px'; ring.style.height = s + 'px';
                ring.style.margin = `${-s / 2}px 0 0 ${-s / 2}px`;
                ring.style.opacity = (1 - p).toFixed(2);
            }).then(() => { if (ring.parentNode) ring.remove(); });
        });
    });
}

export function showHanLiSaBurst({ unit, trueUids = [], halfUids = [], taken = 0 }) {
    if (!unit) return;
    const apex = centerOf(unit.uid);
    if (!apex) return;
    const hits = [...trueUids, ...halfUids].map(centerOf).filter(Boolean);
    shockwave(apex, hits);
    wordAndCore(apex);
    trueUids.forEach(shatterTrue);
    halfUids.forEach(impactHalf);
}
