// fx/94-tangwenliang-dash.js — 唐文亮「冲刺·七伤齐发」位移演出
// V1.1.0 | 2026-10-22 按老板口径重排：先连线 → 两人相向冲到各自前排 → 唐文亮撞一下回弹落位 → 收线。
//   纯装饰：位置已由引擎 doDash 改好，本文件只用 from/to 数值画克隆体，不 dispatch POS_CHANGE。
import { clock } from '../infra/52-clock.js';
import { getCellByPos } from './90fx-ref-manager.js';

export const VER = 'fx/94-tangwenliang-dash.js V1.1.0';

function rectOf(camp, pos) {
    if (camp == null || pos == null) return null;
    const el = getCellByPos(camp, pos);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

function makeGhost(camp, pos) {
    const r = rectOf(camp, pos);
    if (!r) return null;
    const src = getCellByPos(camp, pos);
    const g = document.createElement('div');
    g.setAttribute('data-fx', 'temporary');
    const icon = src && src.querySelector('.cell-icon');
    g.textContent = (icon && icon.textContent.trim()) || '';
    g.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.w}px;height:${r.h}px;
        display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#fff;
        background:rgba(30,107,184,0.92);border:3px solid #0d47a1;border-radius:5px;
        z-index:99999;pointer-events:none;box-sizing:border-box;box-shadow:0 0 18px rgba(30,107,184,0.85);`;
    document.body.appendChild(g);
    return { el: g, rect: r };
}

export async function showTangWenLiangDash(dash) {
    if (!dash || dash.fromCamp == null || dash.targetCamp == null) return;
    const self = makeGhost(dash.fromCamp, dash.fromPos);
    const tgt = makeGhost(dash.targetCamp, dash.targetFromPos);
    const selfTo = rectOf(dash.fromCamp, dash.toPos);
    const tgtTo = tgt ? rectOf(dash.targetCamp, dash.targetToPos) : null;
    if (!self || !selfTo || (tgt && !tgtTo)) {
        if (self) self.el.remove();
        if (tgt) tgt.el.remove();
        return;
    }

    // ① 先拉一条连线（唐文亮 ↔ 目标）
    const line = document.createElement('div');
    line.setAttribute('data-fx', 'temporary');
    const dx = (tgt ? tgt.rect.cx : selfTo.cx) - self.rect.cx;
    const dy = (tgt ? tgt.rect.cy : selfTo.cy) - self.rect.cy;
    line.style.cssText = `position:fixed;left:${self.rect.cx}px;top:${self.rect.cy}px;width:0;height:3px;
        transform-origin:0 50%;transform:translateY(-50%) rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg);
        background:linear-gradient(90deg,rgba(255,214,96,0.9),rgba(255,150,60,0.9));
        box-shadow:0 0 12px rgba(255,180,60,0.9);border-radius:2px;z-index:99998;pointer-events:none;`;
    document.body.appendChild(line);
    await clock.animate(260, (p) => { line.style.width = (Math.hypot(dx, dy) * p).toFixed(1) + 'px'; }, { minRealMs: 400 });

    // ② 两人相向冲到各自前排；唐文亮 72% 处撞上，随后回弹落位
    const sL = self.rect.left, sT = self.rect.top;
    const tL = tgt ? tgt.rect.left : 0, tT = tgt ? tgt.rect.top : 0;
    const dist = Math.hypot(dx, dy) || 1;
    const overshoot = 26;
    const nX = dx === 0 ? 0 : dx / dist;
    const nY = dx === 0 ? -1 : dy / dist;
    await clock.animate(760, (p) => {
        const travel = Math.min(1, p / 0.72);
        const e = 1 - Math.pow(1 - travel, 3);
        // 冲：0→0.72 走到终点并越过一点点
        let sx = sL + (selfTo.left - sL) * e + nX * overshoot * travel;
        let sy = sT + (selfTo.top - sT) * e + nY * overshoot * travel;
        // 回弹：0.72→1 退回 overshoot
        if (p > 0.72) {
            const b = (p - 0.72) / 0.28;
            sx -= nX * overshoot * b;
            sy -= nY * overshoot * b;
        }
        self.el.style.left = sx.toFixed(1) + 'px';
        self.el.style.top = sy.toFixed(1) + 'px';
        if (tgt) {
            tgt.el.style.left = (tL + (tgtTo.left - tL) * e).toFixed(1) + 'px';
            tgt.el.style.top = (tT + (tgtTo.top - tT) * e).toFixed(1) + 'px';
            if (p > 0.72) tgt.el.style.transform = `translateX(${(Math.random() - 0.5) * 6}px)`;
        }
        line.style.opacity = Math.max(0, 1 - p * 1.1).toFixed(2);
    }, { minRealMs: 1500 });

    // ③ 落地定格
    await clock.animate(160, (p) => {
        self.el.style.boxShadow = `0 0 ${28 * (1 - p)}px rgba(255,255,255,${0.9 * (1 - p)})`;
    }, { minRealMs: 300 });

    if (self.el.parentNode) self.el.remove();
    if (tgt && tgt.el.parentNode) tgt.el.remove();
    if (line.parentNode) line.remove();
}
