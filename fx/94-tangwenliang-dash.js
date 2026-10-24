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

// —— 子弹时间档（老板口径 2026-10-23）：遮罩内慢速完整演出 ——
//   与快版共用 makeGhost/rectOf；慢版自己造粗锁链与高 z 环/火花（快版 createBeam 的 z 写死 10/11/12、
//   impactRing/sparkBurstAt 的 z 写死 20/35，都会被遮罩盖住）。
//   返回 ghosts 交 render/39 storeAfter 淡出（交棒顺序与快版一致：先清 fly 显真格，再淡出克隆体）。
//   跳过 / 快进 / 无位移 → 返回 [] 或原 ghosts，不影响 store 步已写好的位置。
async function showTangWenLiangDashSlow(dash) {
    if (!dash || GlobalStore.get('fastForwardActive')) return [];

    let moves = Array.isArray(dash.moves) ? dash.moves.filter(m => m && m.uid != null) : [];
    if (moves.length === 0 && dash.fromUid != null && dash.fromPos != null && dash.toPos != null) {
        moves = [{ uid: dash.fromUid, camp: dash.fromCamp, from: dash.fromPos, to: dash.toPos, isDash: true }];
        if (dash.targetUid != null && dash.targetFromPos != null && dash.targetToPos != null && dash.targetFromPos !== dash.targetToPos) {
            moves.push({ uid: dash.targetUid, camp: dash.targetCamp, from: dash.targetFromPos, to: dash.targetToPos, isDash: false });
        }
    }
    moves = moves.filter(m => m.from !== m.to && m.to != null);
    if (moves.length === 0) return [];

    let skipped = false;
    const created = [];
    const ghosts = [];
    const track = (el) => { if (el) created.push(el); return el; };
    const cleanupUi = () => { for (const el of created) if (el && el.parentNode) el.remove(); };
    const cleanupAll = () => { cleanupUi(); for (const gh of ghosts) if (gh && gh.g && gh.g.el && gh.g.el.parentNode) gh.g.el.remove(); };

    // ① 遮罩 + 跳过按钮
    const mask = track(document.createElement('div'));
    mask.setAttribute('data-fx', 'temporary');
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.86);z-index:9990;pointer-events:none;opacity:0;';
    document.body.appendChild(mask);

    const skipBtn = track(document.createElement('div'));
    skipBtn.setAttribute('data-fx', 'temporary');
    skipBtn.textContent = '跳过';
    skipBtn.style.cssText = 'position:fixed;bottom:12%;right:8%;z-index:10090;color:rgba(255,255,255,0.72);font-size:18px;font-weight:bold;cursor:pointer;line-height:1;letter-spacing:2px;transform:rotate(-30deg);pointer-events:auto;';
    skipBtn.onclick = () => { skipped = true; };
    document.body.appendChild(skipBtn);

    // ② 克隆体（z 高于遮罩；dash 本体 10070、其余 10050）
    for (const m of moves) {
        const g = makeGhost(m.camp, m.from, m.to, m.isDash ? 10070 : 10050);
        if (g) ghosts.push({ ...m, g, toRect: rectOf(m.camp, m.to) });
    }
    if (ghosts.length === 0) { cleanupAll(); return []; }

    const twG = ghosts.find(x => x.isDash) || ghosts[0];
    const tgG = ghosts.find(x => !x.isDash) || null;

    // 主角高亮：唐文亮金边、目标橙红边（被挤队友不加特写）
    const highlight = (gh, color) => {
        if (!gh || !gh.g || !gh.g.el) return;
        gh.g.el.style.boxShadow = `0 0 0 2px ${color}, 0 0 24px ${color}`;
    };
    highlight(twG, 'rgba(255,209,102,0.95)');
    if (tgG) highlight(tgG, 'rgba(255,120,80,0.95)');

    await clock.animate(350, (p) => { mask.style.opacity = String(0.86 * p); });
    if (skipped) { cleanupAll(); return []; }

    // ③ 粗锁链展开（唐文亮 → 目标），双层发光
    const chainGlow = track(document.createElement('div'));
    chainGlow.setAttribute('data-fx', 'temporary');
    chainGlow.style.cssText = 'position:fixed;height:14px;border-radius:8px;pointer-events:none;opacity:0;z-index:10060;background:linear-gradient(90deg,rgba(255,214,96,.2),rgba(255,150,60,.8));filter:blur(4px);transform-origin:0 50%;';
    document.body.appendChild(chainGlow);
    const chainCore = track(document.createElement('div'));
    chainCore.setAttribute('data-fx', 'temporary');
    chainCore.style.cssText = 'position:fixed;height:6px;border-radius:3px;pointer-events:none;opacity:0;z-index:10061;background:linear-gradient(90deg,#fff7d6,#ffd166 42%,#ff9f43);box-shadow:0 0 14px rgba(255,200,90,.95),0 0 30px rgba(255,150,60,.6);transform-origin:0 50%;';
    document.body.appendChild(chainCore);

    const chainSet = (p) => {
        if (!twG || !tgG) return;
        const a = twG.g.el.getBoundingClientRect();
        const b = tgG.g.el.getBoundingClientRect();
        const x1 = a.left + a.width / 2, y1 = a.top + a.height / 2;
        const x2 = b.left + b.width / 2, y2 = b.top + b.height / 2;
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
        const ang = Math.atan2(dy, dx) * 180 / Math.PI;
        const sc = Math.max(0.0001, p);
        [[chainGlow, 14], [chainCore, 6]].forEach(([el, h]) => {
            el.style.left = x1 + 'px';
            el.style.top = (y1 - h / 2) + 'px';
            el.style.width = len + 'px';
            el.style.transform = `rotate(${ang}deg) scaleX(${sc})`;
        });
    };

    if (twG && tgG) {
        await clock.animate(500, (p) => {
            chainSet(p);
            chainGlow.style.opacity = String(0.9 * p);
            chainCore.style.opacity = String(p);
        }, { minRealMs: 500 });
    }
    if (skipped) { cleanupAll(); return []; }

    // ④ 全员克隆体缓慢走位（750ms），锁链实时跟随
    await clock.animate(750, (p) => {
        const e = 1 - Math.pow(1 - p, 3);
        for (const gh of ghosts) {
            const t = gh.toRect; if (!t) continue;
            const f = gh.g.from;
            gh.g.el.style.left = (f.left + (t.left - f.left) * e).toFixed(1) + 'px';
            gh.g.el.style.top = (f.top + (t.top - f.top) * e).toFixed(1) + 'px';
        }
        chainSet(1);
    }, { minRealMs: 750 });
    if (skipped) { cleanupAll(); return []; }

    // ⑤ 碰撞：白闪 + 高 z 冲击环 + 火花 + 屏震
    const ringAt = (rect, color, z) => {
        if (!rect) return;
        const d = track(document.createElement('div'));
        d.setAttribute('data-fx', 'temporary');
        d.style.cssText = `position:fixed;left:${rect.cx}px;top:${rect.cy}px;width:${rect.w}px;height:${rect.h}px;border:3px solid ${color};border-radius:12px;pointer-events:none;z-index:${z};box-shadow:0 0 24px ${color};`;
        document.body.appendChild(d);
        clock.animate(620, (p) => {
            const e = 1 - Math.pow(1 - p, 2);
            d.style.transform = `translate(-50%,-50%) scale(${0.5 + e * 1.1})`;
            d.style.opacity = String(1 - p);
        }).then(() => { if (d.parentNode) d.remove(); });
    };
    const sparksAt = (cx, cy, color, n, z) => {
        for (let i = 0; i < n; i++) {
            const a = (Math.PI * 2 * i) / n + Math.random() * 0.6;
            const sp = 26 + Math.random() * 40;
            const sz = 3 + Math.random() * 3;
            const d = track(document.createElement('div'));
            d.setAttribute('data-fx', 'temporary');
            d.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${sz}px;height:${sz}px;margin:${-sz / 2}px 0 0 ${-sz / 2}px;border-radius:50%;background:${color};box-shadow:0 0 9px ${color};pointer-events:none;z-index:${z};`;
            document.body.appendChild(d);
            const dur = 380 + Math.random() * 240;
            clock.animate(dur, (p) => {
                const e = 1 - Math.pow(1 - p, 2.4);
                d.style.transform = `translate(${Math.cos(a) * sp * e}px,${Math.sin(a) * sp * e + 30 * p * p}px) scale(${1 - p * 0.7})`;
                d.style.opacity = String(1 - p * p);
            }).then(() => { if (d.parentNode) d.remove(); });
        }
    };

    const flash = track(document.createElement('div'));
    flash.setAttribute('data-fx', 'temporary');
    flash.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:10080;pointer-events:none;opacity:0;';
    document.body.appendChild(flash);
    await clock.animate(400, (p) => {
        flash.style.opacity = p < 0.35 ? String(0.75 * (p / 0.35)) : String(Math.max(0, 0.75 * (1 - (p - 0.35) / 0.65)));
    });
    if (twG && twG.toRect) { ringAt(twG.toRect, 'rgba(255,209,102,0.95)', 10062); sparksAt(twG.toRect.cx, twG.toRect.cy, '#ffd166', 12, 10063); }
    if (tgG && tgG.toRect) { ringAt(tgG.toRect, 'rgba(255,120,80,0.95)', 10062); sparksAt(tgG.toRect.cx, tgG.toRect.cy, '#ff6b3d', 10, 10063); }
    screenShake();
    if (skipped) { cleanupAll(); return []; }

    // ⑥ 真伤数字浮出（dash.hits 载荷里带 dmg）
    const hits = Array.isArray(dash.hits) ? dash.hits : [];
    hits.forEach((h, i) => {
        if (!(h.dmg > 0) || h.uid == null) return;
        clock.wait(120 + i * 90).then(() => {
            if (skipped) return;
            const el = document.querySelector(`[data-uid="${h.uid}"]`);
            const r = el ? el.getBoundingClientRect() : null;
            if (!r) return;
            const d = track(document.createElement('div'));
            d.setAttribute('data-fx', 'temporary');
            d.textContent = '−' + h.dmg;
            d.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top + r.height * 0.18}px;transform:translate(-50%,0);font-size:32px;font-weight:900;color:#ffe9a8;text-shadow:0 0 12px rgba(255,200,80,0.95),0 3px 6px rgba(0,0,0,0.95);z-index:10085;pointer-events:none;opacity:0;`;
            document.body.appendChild(d);
            clock.animate(900, (p) => {
                const e2 = 1 - Math.pow(1 - p, 2.2);
                d.style.opacity = p < 0.12 ? String(p / 0.12) : String(1 - (p - 0.12) / 0.88);
                d.style.transform = `translate(-50%,${(-46 * e2).toFixed(1)}px) scale(${(1 + 0.2 * (1 - Math.abs(2 * p - 1))).toFixed(2)})`;
            }).then(() => { if (d.parentNode) d.remove(); });
        });
    });
    await clock.wait(900);
    if (skipped) { cleanupAll(); return []; }

    // ⑦ 遮罩淡出（真格已在终位，克隆体留给 storeAfter 淡出）
    await clock.animate(400, (p) => { mask.style.opacity = String(0.86 * (1 - p)); });
    chainGlow.style.opacity = '0';
    chainCore.style.opacity = '0';
    if (skipBtn.parentNode) skipBtn.remove();
    cleanupUi();

    return ghosts;
}

// 主演出：克隆多人 → 金线对拉 → 位移动画（dash 本体超冲回弹）→ 落定特效。
// 返回克隆体数组交给 39 的 storeAfter（交棒：清 fly 显格后才淡出）。
export async function showTangWenLiangDash(dash, opts) {
    // 华丽模式（dodgeEffectEnabled）走子弹时间慢速档；简单/自动/快进走原快版
    if (opts && opts.slowMotion) return showTangWenLiangDashSlow(dash);
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

    // ② 金线锁定：连「唐文亮克隆体当前位置」与「目标克隆体当前位置」，随动画实时跟随
    //   （demo 口径：线是锁在两人身上的，不是画在两个未来落点之间——老板实机指出的视觉偏差）
    const twG = ghosts.find(x => x.isDash) || ghosts[0];
    const tgG = ghosts.find(x => !x.isDash);
    const beam = (twG && tgG) ? createBeam(document.body) : null;
    if (beam) {
        const a0 = twG.g.el.getBoundingClientRect();
        const b0 = tgG.g.el.getBoundingClientRect();
        await clock.animate(240, (p) => {
            setBeam(beam, a0.left + a0.width/2, a0.top + a0.height/2, b0.left + b0.width/2, b0.top + b0.height/2, p);
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
        if (beam && twG && tgG) {
            const a1 = twG.g.el.getBoundingClientRect();
            const b1 = tgG.g.el.getBoundingClientRect();
            setBeam(beam, a1.left + a1.width/2, a1.top + a1.height/2, b1.left + b1.width/2, b1.top + b1.height/2, 1);
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
