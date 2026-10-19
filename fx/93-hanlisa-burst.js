// fx/93-hanlisa-burst.js — 寒离飒「蓄意轰拳」爆发瞬间视觉（变体A：柔光弧扇 + 涟漪 + 粒子 + 震屏）
//   · 顶点=寒离飒，从顶点位置慢慢向外铺开一道柔光扇形（金→冰蓝渐变 + feGaussianBlur 柔光，弧边非实心三角）
//   · 两道涟漪环沿扇形弧线由内向外扩散、渐隐（示意 AOE 范围，不画死边）
//   · 金/冰双色粒子从顶点飞向各命中格
//   · V2 分档格效（2026-10-19 蓄意轰拳九位九形）：direct/eight/full123=冰蓝碎裂最重档；near/full456=红棕凹痕；
//     far/full789=轻凹痕。每格升大号真伤数字（老板口径：弹幕做大、用真实数值）
//   · 瞄 8 特例：中列速度线 + 撞边白闪（位移动画本体走 PUSH 舞台动作的 fx 收尾写入，此处只做点缀）
//   · 吸血：顶点 ❤+N 上浮
//   · 整块战场轻微震屏（8px / 420ms）+ 顶点升「轰」字 + 金/冰双环拳心脉冲
// V2.1.0 | 2026-10-19 补轻量模式：ui/79 黑幕（V2 重造）刚完整演出过（hlsAimPlayedAt 3.5s 内）→ 只播震屏+格子效果，
//          防黑幕/战场双演出；跳过/回放/简单/自动挡无标记照常完整
// V2.0.0 | 2026-10-19 蓄意轰拳 V2：载荷改 {seq, apexUid, aim, taken, hits:[{uid,pos,dmg,tier}], flight, bounces, vamp}
//          （全 uid+数值可序列化，回放/从机经 SKILL_ANNOUNCE 桥补触发；seq 去重防引擎直发+桥双放）
// V1.2.0 | 2026-10-17 应用 demo tools/126「变体A」（老板选定）：补金/冰双色粒子飞向命中格 + 整场震屏，
//          「轰」字提亮为 #ffcf5e 双层辉光，扇形加 feGaussianBlur 柔光
// V1.1.0 | 2026-10-17 修订：弃硬三角，改柔光扇形+涟漪，整体放慢（用户指正"太丑/太快/一下打满"）
export const VER = 'fx/93-hanlisa-burst.js V2.1.0';

import { clock } from '../infra/52-clock.js';
import { markGridShake } from '../render/32-grid-render.js';
import { GlobalStore } from '../infra/54-global-store.js';

function centerOf(uid) {
    const el = document.querySelector(`[data-uid="${uid}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}

// 同格按 pos 找邻格中心（8 号撞边飞行用；从 victim 的 cell 反查同 grid，不缓存引用）
function cellCenterOfPos(uid, pos) {
    const el = document.querySelector(`[data-uid="${uid}"]`);
    if (!el || !el.parentElement) return null;
    for (const c of el.parentElement.children) {
        if (String(c.dataset.pos) === String(pos)) {
            const r = c.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
        }
    }
    return null;
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
            <filter id="hlsSoft" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="6"/>
            </filter>
        </defs>
        <path id="hlsBody" fill="url(#hlsGrad)" filter="url(#hlsSoft)" stroke="none"/>
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

// 整块战场轻微震屏（变体A，8px / 420ms）
function shakeScreen() {
    const bf = document.getElementById('battlefield');
    if (!bf) return;
    clock.animate(420, (p) => {
        const m = 8 * (1 - p);
        bf.style.transform = `translate(${((Math.random() - 0.5) * 2 * m).toFixed(2)}px,${((Math.random() - 0.5) * 2 * m).toFixed(2)}px)`;
    }).then(() => { bf.style.transform = ''; });
}

// 金/冰双色粒子：从顶点飞向各命中格（变体A）
function particles(apex, hits) {
    if (!hits.length) return;
    const COLORS = ['#ffd36e', '#bfe4ff'];
    const PER = Math.ceil(30 / hits.length);
    let i = 0;
    hits.forEach((t, hi) => {
        for (let n = 0; n < PER; n++, i++) {
            const c = COLORS[i % COLORS.length];
            const d = document.createElement('div');
            d.setAttribute('data-fx', 'temporary');
            d.style.cssText = `position:fixed;left:${apex.x}px;top:${apex.y}px;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:${c};box-shadow:0 0 8px ${c};z-index:10010;pointer-events:none;`;
            document.body.appendChild(d);
            const dx = t.x + (Math.random() - 0.5) * t.w * 0.7 - apex.x;
            const dy = t.y + (Math.random() - 0.5) * t.h * 0.7 - apex.y;
            clock.wait(hi * 40 + n * 12).then(() => clock.animate(420 + Math.random() * 160, (p) => {
                const e = 1 - Math.pow(1 - p, 2.4);
                d.style.transform = `translate(${(dx * e).toFixed(1)}px,${(dy * e).toFixed(1)}px) scale(${(1.15 - 0.6 * p).toFixed(2)})`;
                d.style.opacity = (1 - p).toFixed(3);
            })).then(() => { if (d.parentNode) d.remove(); });
        }
    });
}

// 顶点升「轰」字 + 金/冰双环拳心脉冲（放慢）
function wordAndCore(apex) {
    const word = document.createElement('div');
    word.setAttribute('data-fx', 'temporary');
    word.textContent = '轰';
    word.style.cssText = `position:fixed;left:${apex.x}px;top:${apex.y - 30}px;transform:translate(-50%,-50%);font-size:36px;font-weight:900;color:#ffcf5e;text-shadow:0 0 14px rgba(255,180,60,0.95),0 0 26px rgba(127,199,255,0.85),0 3px 6px rgba(0,0,0,0.9);z-index:10012;pointer-events:none;opacity:0;`;
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

// 轻档格：淡凹痕一闪（far / full789）
function impactFar(uid) {
    const el = document.querySelector(`[data-uid="${uid}"]`);
    if (!el) return;
    const base = el.style.boxShadow;
    el.style.boxShadow = 'inset 0 0 9px 2px rgba(139,58,30,0.45)';
    clock.wait(220).then(() => { el.style.boxShadow = base || ''; });
}

// 大号真伤数字：每命中格升一枚（老板口径：弹幕做大、数值用真实值；按档位定字号/配色）
function bigDamageFloat(uid, dmg, tier) {
    if (!(dmg > 0)) return;
    const el = document.querySelector(`[data-uid="${uid}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const heavy = tier === 'direct' || tier === 'eight' || tier === 'full123';
    const mid = tier === 'near' || tier === 'full456';
    const size = heavy ? 34 : (mid ? 27 : 22);
    const color = heavy ? '#ffe9a8' : (mid ? '#ffc9a0' : '#d9c6b8');
    const glow = heavy
        ? 'text-shadow:0 0 12px rgba(255,200,80,0.95),0 0 24px rgba(127,199,255,0.85),0 3px 6px rgba(0,0,0,0.95)'
        : 'text-shadow:0 0 8px rgba(255,160,60,0.7),0 2px 4px rgba(0,0,0,0.9)';
    const d = document.createElement('div');
    d.setAttribute('data-fx', 'temporary');
    d.textContent = `−${dmg}`;
    d.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top + r.height * 0.18}px;transform:translate(-50%,0);font-size:${size}px;font-weight:900;font-family:inherit;color:${color};${glow};z-index:10013;pointer-events:none;opacity:0;`;
    document.body.appendChild(d);
    clock.wait(heavy ? 120 : 200).then(() => clock.animate(1350, (p) => {
        const e = 1 - Math.pow(1 - p, 2.2);
        d.style.opacity = p < 0.12 ? (p / 0.12).toFixed(2) : (1 - (p - 0.12) / 0.88).toFixed(2);
        d.style.transform = `translate(-50%,${(-46 * e).toFixed(1)}px) scale(${(1 + 0.22 * (1 - Math.abs(2 * p - 1))).toFixed(2)})`;
    })).then(() => { if (d.parentNode) d.remove(); });
}

// 8 号撞边点缀：中列速度线 + 落点白闪（位移本体走 PUSH 舞台动作，这里只加强观感）
function flightAccents(flight) {
    const from = centerOf(flight.uid);
    const to = cellCenterOfPos(flight.uid, flight.to) || cellCenterOfPos(flight.uid, 2);
    if (!from || !to) return;
    // 速度线：中列三段白色拖尾
    const steps = 5;
    for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i + 1) / steps;
        const x1 = from.x + (to.x - from.x) * t0, y1 = from.y + (to.y - from.y) * t0;
        const x2 = from.x + (to.x - from.x) * t1, y2 = from.y + (to.y - from.y) * t1;
        const line = document.createElement('div');
        line.setAttribute('data-fx', 'temporary');
        const len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        line.style.cssText = `position:fixed;left:${x1}px;top:${y1}px;width:${Math.max(len, 6)}px;height:3px;margin:-1.5px 0 0 0;transform:rotate(${ang.toFixed(1)}deg);background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.9));border-radius:2px;z-index:10012;pointer-events:none;opacity:0;`;
        document.body.appendChild(line);
        clock.wait(120 + i * 110).then(() => clock.animate(260, (p) => {
            line.style.opacity = (1 - p).toFixed(2);
        })).then(() => { if (line.parentNode) line.remove(); });
    }
    // 撞边白闪 + 二次震屏
    clock.wait(620).then(() => {
        const flash = document.createElement('div');
        flash.setAttribute('data-fx', 'temporary');
        flash.style.cssText = `position:fixed;left:${to.x}px;top:${to.y}px;width:${Math.max(to.w, 40)}px;height:${Math.max(to.h, 40)}px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,0.95) 0%,rgba(255,230,160,0.55) 45%,rgba(255,255,255,0) 72%);z-index:10012;pointer-events:none;`;
        document.body.appendChild(flash);
        clock.animate(430, (p) => {
            const s = 0.5 + p * 1.1;
            flash.style.transform = `translate(-50%,-50%) scale(${s.toFixed(2)})`;
            flash.style.opacity = (1 - p).toFixed(2);
        }).then(() => { if (flash.parentNode) flash.remove(); });
        shakeScreen();
    });
}

// 吸血飘字：顶点 ❤+N 上浮
function vampFloat(apex, vamp) {
    if (!(vamp > 0) || !apex) return;
    const d = document.createElement('div');
    d.setAttribute('data-fx', 'temporary');
    d.textContent = `🩸 +${vamp}`;
    d.style.cssText = `position:fixed;left:${apex.x}px;top:${apex.y - 14}px;transform:translate(-50%,0);font-size:24px;font-weight:900;color:#9ff0b0;text-shadow:0 0 10px rgba(80,220,130,0.8),0 2px 4px rgba(0,0,0,0.9);z-index:10013;pointer-events:none;opacity:0;`;
    document.body.appendChild(d);
    clock.wait(650).then(() => clock.animate(1250, (p) => {
        const e = 1 - Math.pow(1 - p, 2.2);
        d.style.opacity = p < 0.15 ? (p / 0.15).toFixed(2) : (1 - (p - 0.15) / 0.85).toFixed(2);
        d.style.transform = `translate(-50%,${(-52 * e).toFixed(1)}px)`;
    })).then(() => { if (d.parentNode) d.remove(); });
}

// 引擎直发与回放桥共用入口；seq 去重（先到者赢，后到的同 seq 静默丢弃）
// 2026-10-19 轻量模式：ui/79 黑幕刚完整演过（hlsAimPlayedAt 3.5s 内）→ 只播轻点缀（震屏+格子效果），
//   跳过扇形冲击波/大号数字/撞边/吸血（黑幕里都演过了，战场再全套一遍=双演出）；回放/简单/自动挡无标记照常完整
let _lastSeq = null;
export function showHanLiSaBurst(d) {
    if (!d || d.apexUid == null) return;
    if (d.seq != null) {
        if (d.seq === _lastSeq) return;
        _lastSeq = d.seq;
    }
    let lite = false;
    try {
        const playedAt = GlobalStore.get('hlsAimPlayedAt') || 0;
        lite = (Date.now() - playedAt) < 3500;
    } catch (e) { /* noop */ }
    const apex = centerOf(d.apexUid);
    if (!apex) return;
    const hits = (d.hits || []).map(h => {
        const c = centerOf(h.uid);
        return c ? { x: c.x, y: c.y, w: c.w, h: c.h, tier: h.tier, dmg: h.dmg, uid: h.uid } : null;
    }).filter(Boolean);
    if (lite) {
        // 轻量版：震屏 + 分档格子效果一笔带过（重头戏已在黑幕演完）
        shakeScreen();
        hits.forEach(h => {
            if (h.tier === 'direct' || h.tier === 'eight' || h.tier === 'full123') shatterTrue(h.uid);
            else if (h.tier === 'near' || h.tier === 'full456') impactHalf(h.uid);
            else impactFar(h.uid);
        });
        return;
    }
    shakeScreen();
    if (hits.length) {
        shockwave(apex, hits);
        particles(apex, hits);
    }
    wordAndCore(apex);
    // 分档格效 + 大号真伤数字
    hits.forEach(h => {
        if (h.tier === 'direct' || h.tier === 'eight' || h.tier === 'full123') shatterTrue(h.uid);
        else if (h.tier === 'near' || h.tier === 'full456') impactHalf(h.uid);
        else impactFar(h.uid);
        bigDamageFloat(h.uid, h.dmg, h.tier);
    });
    // 瞄 8 特例：撞边点缀（崩飞的两侧小跳走 PUSH 舞台动作本体，不另画）
    if (d.flight && d.flight.uid != null) flightAccents(d.flight);
    // 吸血
    if (d.vamp > 0) vampFloat(apex, d.vamp);
}
