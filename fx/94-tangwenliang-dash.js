// fx/94-tangwenliang-dash.js — 唐文亮「冲刺·七伤齐发」多人推挤演出
// V2.0.0 | 2026-10-23 强推挤压版（老板拍板）：单目标双克隆 → moves 多人克隆 + 金线对拉 + 冲击环/火花/屏震。
//   纯装饰：位置由引擎 doDash 经 moveUnitPosition 落定（POS_CHANGE/STATE_CHANGE 事件走 core/13 既有链）。
//   step 回放起点 store 位置已是终值——单位渲染在「终点格」、DASH store 步用 fly 模式藏住等交棒，
//   所以克隆体内容取终点格 DOM、从起点格 rect 起跑（必须带 .cell 类，否则布局丢——fx/82 cloneCellEl 同口径）。
//   交接顺序（别搞反，否则旧格闪回一帧）：克隆体落定 → storeAfter 清 fly 显真格 → 克隆体才淡出。
//   快进：入口直接 return。
import { clock } from '../infra/52-clock.js';
import { getCellByPos } from './90fx-ref-manager.js';
import { GlobalStore } from '../infra/54-global-store.js';

export const VER = 'fx/94-tangwenliang-dash.js V2.0.0';

function rectOf(camp, pos) {
    if (camp == null || pos == null) return null;
    const el = getCellByPos(camp, pos);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

// 克隆体：内容取「终点格」（store 已是终值、fly 模式隐藏中），摆到「起点格」rect 起跑
function makeGhost(camp, fromPos, toPos, z) {
    const r = rectOf(camp, fromPos);
    if (!r) return null;
    const src = getCellByPos(camp, toPos) || getCellByPos(camp, fromPos);
    if (!src) return null;
    // 终点格是空壳（单位中途阵亡被清格等）：宁可少克隆一个，不飞空壳
    if (!src.querySelector('.cell-icon') && !src.textContent.trim()) return null;
    const g = src.cloneNode(true);
    g.setAttribute('data-fx', 'temporary');
    g.classList.remove('ready', 'acted');
    g.removeAttribute('data-flash');
    // 只覆盖定位/显隐，保留 .cell 类自带的外观样式（背景/边框/圆角）
    g.style.cssText += `;position:fixed;left:${r.left}px;top:${r.top}px;width:${r.w}px;height:${r.h}px;
        margin:0;z-index:${z};pointer-events:none;box-sizing:border-box;opacity:1;visibility:visible;transition:none;`;
    // fly 模式的隐藏可能落在任一层内联样式上，克隆体全部还原成可见
    g.querySelectorAll('*').forEach(el => {
        if (el.style && (el.style.opacity === '0' || el.style.visibility === 'hidden')) { el.style.opacity = ''; el.style.visibility = ''; }
    });
    document.body.appendChild(g);
    return { el: g, from: r };
}

// ---- 金线：glow(9px 模糊) + core(3px 实线) + head(11px 光点)，从两端向中间收拢（clock 版，别用 rAF） ----
function createBeam(container) {
    const glow = document.createElement('div');
    glow.setAttribute('data-fx', 'temporary');
    glow.style.cssText = 'position:fixed;height:9px;border-radius:6px;pointer-events:none;opacity:0;z-index:10;background:linear-gradient(90deg,rgba(255,214,96,.15),rgba(255,150,60,.62));filter:blur(3px);transform-origin:0 50%;';
    const core = document.createElement('div');
    core.setAttribute('data-fx', 'temporary');
    core.style.cssText = 'position:fixed;height:3px;border-radius:2px;pointer-events:none;opacity:0;z-index:11;background:linear-gradient(90deg,#fff3c4,#ffd166 42%,#ff9f43);box-shadow:0 0 10px rgba(255,200,90,.95);transform-origin:0 50%;';
    const head = document.createElement('div');
    head.setAttribute('data-fx', 'temporary');
    head.style.cssText = 'position:fixed;width:11px;height:11px;border-radius:50%;pointer-events:none;opacity:0;z-index:12;background:radial-gradient(circle,#fff 0%,#ffe9a8 35%,rgba(255,170,60,0) 72%);';
    container.append(glow, core, head);
    return { glow, core, head };
}

function setBeam(b, x1, y1, x2, y2, p) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 0.001;
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    [[b.glow, 9], [b.core, 3]].forEach(([el, h]) => {
        el.style.left = x1 + 'px';
        el.style.top = (y1 - h / 2) + 'px';
        el.style.width = len + 'px';
        el.style.transform = `rotate(${ang}deg) scaleX(${Math.max(0.0001, p)})`;
    });
    const hx = x1 + Math.cos(Math.atan2(dy, dx)) * len * p;
    const hy = y1 + Math.sin(Math.atan2(dy, dx)) * len * p;
    b.head.style.left = (hx - 5.5) + 'px';
    b.head.style.top = (hy - 5.5) + 'px';
}

async function removeBeam(b) {
    if (!b) return;
    await clock.animate(180, (p) => {
        b.glow.style.opacity = String(0.85 * (1 - p));
        b.core.style.opacity = String(1 - p);
        b.head.style.opacity = String(1 - p);
    });
    b.glow.remove(); b.core.remove(); b.head.remove();
}

// ---- 冲击环：从格子中心向外扩 + 淡出 ----
function impactRing(rect, color) {
    const d = document.createElement('div');
    d.setAttribute('data-fx', 'temporary');
    d.style.cssText = `position:fixed;left:${rect.cx}px;top:${rect.cy}px;width:${rect.w}px;height:${rect.h}px;border:2px solid ${color};border-radius:9px;pointer-events:none;z-index:20;box-shadow:0 0 16px ${color};`;
    document.body.appendChild(d);
    clock.animate(430, (p) => {
        const e = 1 - Math.pow(1 - p, 2);
        d.style.transform = `translate(-50%,-50%) scale(${0.55 + e * 0.95})`;
        d.style.opacity = String(1 - p);
    }).then(() => d.remove());
}

// ---- 火花：n 个粒子径向炸开，带重力下坠（26*p*p 那项） ----
function sparkBurstAt(cx, cy, color, n) {
    for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.6;
        const sp = 20 + Math.random() * 32;
        const sz = 2 + Math.random() * 3;
        const d = document.createElement('div');
        d.setAttribute('data-fx', 'temporary');
        d.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${sz}px;height:${sz}px;margin:${-sz / 2}px 0 0 ${-sz / 2}px;border-radius:50%;background:${color};box-shadow:0 0 7px ${color};pointer-events:none;z-index:35;`;
        document.body.appendChild(d);
        const dur = 280 + Math.random() * 200;
        clock.animate(dur, (p) => {
            const e = 1 - Math.pow(1 - p, 2.4);
            d.style.transform = `translate(${Math.cos(a) * sp * e}px,${Math.sin(a) * sp * e + 26 * p * p}px) scale(${1 - p * 0.7})`;
            d.style.opacity = String(1 - p * p);
        }).then(() => d.remove());
    }
}

// ---- 屏震：battlefield ±2px，220ms 衰减 ----
function screenShake() {
    const bf = document.getElementById('battlefield');
    if (!bf) return;
    clock.animate(220, (p) => {
        const s = 2 * (1 - p);
        bf.style.transform = `translate(${(Math.random() - 0.5) * 2 * s}px,${(Math.random() - 0.5) * 2 * s}px)`;
    }).then(() => { bf.style.transform = ''; });
}

// 主演出：克隆多人 → 金线对拉 → 位移动画（dash 本体超冲回弹）→ 落定特效。
// 返回克隆体数组交给 39 的 storeAfter（交棒：清 fly 显格后才淡出）。
export async function showTangWenLiangDash(dash) {
    if (!dash || GlobalStore.get('fastForwardActive')) return [];

    // moves 载荷（新）优先；旧档无 moves 按旧双单位字段拼两条（兼容老战报回放）
    let moves = Array.isArray(dash.moves) ? dash.moves.filter(m => m && m.uid != null) : [];
    if (moves.length === 0 && dash.fromUid != null && dash.fromPos != null && dash.toPos != null) {
        moves = [{ uid: dash.fromUid, camp: dash.fromCamp, from: dash.fromPos, to: dash.toPos, isDash: true }];
        if (dash.targetUid != null && dash.targetFromPos != null && dash.targetToPos != null && dash.targetFromPos !== dash.targetToPos) {
            moves.push({ uid: dash.targetUid, camp: dash.targetCamp, from: dash.targetFromPos, to: dash.targetToPos, isDash: false });
        }
    }
    moves = moves.filter(m => m.from !== m.to && m.to != null);   // 原地未动（被挡侧 from=to）不克隆
    if (moves.length === 0) return [];

    // ① 克隆体（内容取终点格、起点 rect 起跑；dash 本体 z=70，其余 50）
    const ghosts = [];
    for (const m of moves) {
        const g = makeGhost(m.camp, m.from, m.to, m.isDash ? 70 : 50);
        if (g) ghosts.push({ ...m, g, toRect: rectOf(m.camp, m.to) });
    }
    if (ghosts.length === 0) return [];

    // ② 金线对拉：连「唐文亮落点」与「目标落点」，从两端向中间收拢
    const twG = ghosts.find(x => x.isDash) || ghosts[0];
    const tgG = ghosts.find(x => !x.isDash);
    const beam = (twG.toRect && tgG && tgG.toRect) ? createBeam(document.body) : null;
    if (beam) {
        const a = twG.toRect, b = tgG.toRect;
        await clock.animate(240, (p) => {
            setBeam(beam, a.cx, a.cy, b.cx, b.cy, p);
            beam.glow.style.opacity = String(0.85 * p);
            beam.core.style.opacity = String(p);
            beam.head.style.opacity = String(p);
        });
    }

    // ③ 位移动画 560ms easeOutCubic；dash 本体直线 + 轻微超冲回弹（0.68 处最远、末端收回）
    await clock.animate(560, (p) => {
        const e = 1 - Math.pow(1 - p, 3);
        for (const gh of ghosts) {
            const t = gh.toRect; if (!t) continue;
            const f = gh.g.from;
            const dx = t.left - f.left, dy = t.top - f.top;
            let x = f.left + dx * e, y = f.top + dy * e;
            if (gh.isDash && (dx || dy)) {
                const d = Math.hypot(dx, dy) || 1;
                const ov = Math.min(14, d * 0.2);
                const off = p < 0.68 ? ov * (1 - Math.pow(1 - p / 0.68, 3)) : ov * (1 - (1 - Math.pow(1 - (p - 0.68) / 0.32, 3)));
                x += (dx / d) * off; y += (dy / d) * off;
            }
            gh.g.el.style.left = x.toFixed(1) + 'px';
            gh.g.el.style.top = y.toFixed(1) + 'px';
        }
        if (beam) {
            const a = twG.toRect, b = tgG ? tgG.toRect : null;
            if (b) setBeam(beam, a.cx, a.cy, b.cx, b.cy, 1 - p * 0.35);
        }
    });

    // ④ 落定：冲击环 + 火花 + 屏震（dash 本体最隆重；目标落点次之）
    const land = twG.toRect;
    if (land) {
        impactRing(land, '#ffd166');
        sparkBurstAt(land.cx, land.cy, '#ffd166', 12);
        sparkBurstAt(land.cx, land.cy, '#ff9f43', 6);
        screenShake();
    }
    if (tgG && tgG.toRect) impactRing(tgG.toRect, '#ff6b6b');
    if (beam) removeBeam(beam);   // 不 await，光束淡出与落定特效并行

    return ghosts;
}

// 交棒淡出：由 39 的 storeAfter 在「清 fly 显真格之后」调用——顺序反了会旧格闪回一帧
export function fadeOutDashGhosts(ghosts) {
    if (!Array.isArray(ghosts) || ghosts.length === 0) return;
    clock.animate(160, (p) => {
        for (const gh of ghosts) if (gh && gh.g && gh.g.el) gh.g.el.style.opacity = String(1 - p);
    }).then(() => {
        for (const gh of ghosts) if (gh && gh.g && gh.g.el && gh.g.el.parentNode) gh.g.el.remove();
    });
}
