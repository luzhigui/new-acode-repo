// fx/94-tangwenliang-dash.js — 唐文亮「冲刺·七伤齐发」位移演出
// V1.0.0 | 2026-10-22 新建：原 doDash 是瞬移 + 一条飘字，玩家反馈「看不清」。
//   本文件只做装饰——位置已由引擎 doDash 改好，这里不碰数据、不 dispatch POS_CHANGE，
//   用 fromPos/toPos 数值查格子 DOM 画克隆体，收尾即删，绝不与 store 抢位置。
import { clock } from '../infra/52-clock.js';
import { getCellByPos } from './90fx-ref-manager.js';

export const VER = 'fx/94-tangwenliang-dash.js V1.0.0';

function rectOf(camp, pos) {
    const el = getCellByPos(camp, pos);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

function makeGhost(camp, pos, label) {
    const el = getCellByPos(camp, pos);
    const r = rectOf(camp, pos);
    if (!r) return null;
    const g = document.createElement('div');
    g.setAttribute('data-fx', 'temporary');
    g.textContent = label || '';
    g.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.w}px;height:${r.h}px;
        display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#fff;
        background:rgba(30,107,184,0.92);border:3px solid #0d47a1;border-radius:5px;
        z-index:99999;pointer-events:none;box-sizing:border-box;
        box-shadow:0 0 18px rgba(30,107,184,0.85);`;
    const icon = el && el.querySelector('.cell-icon');
    if (icon && icon.textContent) g.textContent = icon.textContent;
    document.body.appendChild(g);
    return { el: g, rect: r };
}

// dash: { fromUid, fromPos, toPos, fromCamp, targetUid, targetFromPos, targetToPos, targetCamp }
export async function showTangWenLiangDash(dash) {
    if (!dash) return;
    if (dash.fromPos == null || dash.toPos == null || dash.fromCamp == null) return;
    const self = makeGhost(dash.fromCamp, dash.fromPos, '⚡');
    const tgt = dash.targetUid != null && dash.targetCamp != null
        ? makeGhost(dash.targetCamp, dash.targetFromPos, '')
        : null;
    const selfTo = rectOf(dash.fromCamp, dash.toPos);
    const tgtTo = tgt ? rectOf(dash.targetCamp, dash.targetToPos) : null;
    if (!self || !selfTo) {
        if (self) self.el.remove();
        if (tgt) tgt.el.remove();
        return;
    }

    // 保底 1.4s 真实时间：4x 下也看得清（clock.animate 第三参 opts.minRealMs，见 infra/52）
    await clock.animate(520, (p) => {
        const e = 1 - Math.pow(1 - p, 3);
        self.el.style.left = (self.rect.left + (selfTo.left - self.rect.left) * e) + 'px';
        self.el.style.top = (self.rect.top + (selfTo.top - self.rect.top) * e) + 'px';
        if (tgt && tgtTo) {
            tgt.el.style.left = (tgt.rect.left + (tgtTo.left - tgt.rect.left) * e) + 'px';
            tgt.el.style.top = (tgt.rect.top + (tgtTo.top - tgt.rect.top) * e) + 'px';
        }
    }, { minRealMs: 1400 });

    // 落地闪白
    await clock.animate(180, (p) => {
        self.el.style.boxShadow = `0 0 ${28 * (1 - p)}px rgba(255,255,255,${0.9 * (1 - p)})`;
    }, { minRealMs: 320 });

    if (self.el.parentNode) self.el.remove();
    if (tgt && tgt.el.parentNode) tgt.el.remove();
}
