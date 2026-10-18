// ui/79hanlisa-aim.js — 蓄意轰拳瞄准黑幕（按住蓄力 → 拖到敌格瞄准 → 松手轰出）
//   · 2026-10-19 老板六点口径：华丽模式且玩家操控寒离飒时，蓄力到期（回合结束处）强停全场弹本层；
//     黑幕蒙太奇参照闪避子弹时间的暗场语言，敌阵透过暗场可见，按住时拳心聚能（光点倒吸）
//   · 瞄准规则照 131 demo 老板定稿：拖到有人的敌格=锁定该格（最近格欧氏吸附）；离施术者太近 / 指到己方半场 /
//     拖出敌阵包围盒 → 未瞄准=全屏兜底（松手轰全场）
//   · 预览伤害=真实数值（基数 N=最近三回合承伤，分档 N÷2 / N÷4 / N÷6；瞄 8 特例 2/5=N÷3；
//     全屏 123 各 N÷3、456 各 N÷4、789 各 N÷5）——结算口径以 modules/27 为准，此处只做展示
//   · 按住时长 holdMs 原样上报但不生效（口子留给未来「按蓄力时长定 N1」）
//   · fx 层规矩：不缓存 cell DOM 引用，每次开场现查 rect；所有临时节点 data-fx=temporary 交统一清扫
// V1.0.0 | 2026-10-19 首版（随蓄意轰拳 V2 落地）
export const VER = 'ui/79hanlisa-aim.js V1.0.0';

import { GlobalStore } from '../infra/54-global-store.js';
import { getSkillParams } from '../core/01config-5v5-test.js';

// 敌阵 9 格坐标快照（开场拍一次；overlay 期间页面冻结，无重排风险）
function snapshotEnemyCells() {
    const grid = document.getElementById('enemyGrid');
    const map = {};
    if (!grid) return map;
    for (const el of grid.children) {
        const p = Number(el.dataset.pos);
        if (p >= 1 && p <= 9) {
            const r = el.getBoundingClientRect();
            map[p] = { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
        }
    }
    return map;
}

function apexOfHls(hls) {
    const el = document.querySelector(`[data-uid="${hls.uid}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// 与 modules/27 同一套距离分档（展示口径；曼哈顿距离 0/1/≥2）
function manhattan(a, b) {
    const r1 = Math.ceil(a / 3), c1 = a - (r1 - 1) * 3;
    const r2 = Math.ceil(b / 3), c2 = b - (r2 - 1) * 3;
    return Math.abs(r1 - r2) + Math.abs(c1 - c2);
}

function previewCells(aim, N, xl) {
    // 返回 [{pos, den, tier, dmg, mark}]；口径与 modules/27 结算一致
    const shapes = (xl && xl.hitShapes) || {};
    const tierDen = (xl && xl.tierDen) || { direct: 2, near: 4, far: 6 };
    const eightDen = (xl && xl.eightDen) != null ? xl.eightDen : 3;
    const fd = (xl && xl.fullDen) || { row123: 3, row456: 4, row789: 5 };
    if (aim >= 1 && aim <= 9 && Array.isArray(shapes[String(aim)])) {
        return shapes[String(aim)].map(p => {
            const isEight = aim === 8 && p !== 8;
            const t = manhattan(aim, p);
            const tier = isEight ? 'eight' : (t <= 0 ? 'direct' : (t === 1 ? 'near' : 'far'));
            const den = isEight ? eightDen : (tier === 'direct' ? tierDen.direct : tier === 'near' ? tierDen.near : tierDen.far);
            return { pos: p, den, tier, dmg: Math.floor(N / den), mark: p === aim ? '主目标' : (aim === 8 ? '撞边眩晕' : null) };
        });
    }
    return [[1, 2, 3, fd.row123], [4, 5, 6, fd.row456], [7, 8, 9, fd.row789]]
        .flatMap(([a, b, c3, den]) => [a, b, c3].map(p => ({ pos: p, den, tier: 'full', dmg: Math.floor(N / den), mark: null })));
}

const TIER_STYLE = {
    direct: { border: 'rgba(255,207,94,0.95)', bg: 'rgba(255,190,60,0.20)', badge: '#ffe9a8' },
    eight:  { border: 'rgba(127,199,255,0.9)',  bg: 'rgba(90,170,255,0.18)', badge: '#bfe3ff' },
    near:   { border: 'rgba(255,140,80,0.75)',  bg: 'rgba(255,120,60,0.12)', badge: '#ffc9a0' },
    far:    { border: 'rgba(180,160,150,0.6)',  bg: 'rgba(160,140,130,0.10)', badge: '#d9c6b8' },
    full:   { border: 'rgba(255,170,90,0.55)',  bg: 'rgba(255,150,80,0.08)',  badge: '#ffd7b0' }
};

export function showHanlisaAim(c, hls, occupied, resolve) {
    let done = false;
    let holding = false;
    let holdStart = 0;
    let aim = 0;
    let holdTimer = null;
    let onWinUp = null, onKeyDown = null, onKeyUp = null;

    const cells = snapshotEnemyCells();
    const apex = apexOfHls(hls) || { x: innerWidth / 2, y: innerHeight * 0.82 };
    const xl = getSkillParams('寒离飒', 'xuLi') || {};
    const buckets = (hls.state && Array.isArray(hls.state._hlsTaken)) ? hls.state._hlsTaken.slice(-3) : [];
    const N = Math.floor(buckets.reduce((s, v) => s + (v || 0), 0));
    const occSet = new Set(Array.isArray(occupied) ? occupied.filter(p => p >= 1 && p <= 9) : []);

    const overlay = document.createElement('div');
    overlay.setAttribute('data-fx', 'temporary');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10018;background:radial-gradient(ellipse at 50% 42%,rgba(8,12,26,0.72) 0%,rgba(3,4,10,0.9) 78%);touch-action:none;user-select:none;-webkit-user-select:none;cursor:crosshair;';

    // 顶部提示条
    const hint = document.createElement('div');
    hint.style.cssText = 'position:absolute;top:14px;left:50%;transform:translateX(-50%);text-align:center;color:#ffe9c8;font-size:15px;font-weight:bold;text-shadow:0 0 10px rgba(255,190,80,0.55);pointer-events:none;';
    hint.innerHTML = `🥊 <b>蓄意轰拳</b> — 按住蓄力 · 拖到敌格瞄准 · 松手轰出<br><span style="font-size:12px;color:#cfc4b4;font-weight:normal;">轰拳能量 N=${N}（真伤基数）· 按住时长暂不影响伤害 · 原地松手=全屏</span>`;
    overlay.appendChild(hint);

    // 底部状态行（随瞄准变化）
    const status = document.createElement('div');
    status.style.cssText = 'position:absolute;bottom:18px;left:50%;transform:translateX(-50%);color:#fff;font-size:14px;font-weight:bold;text-shadow:0 1px 6px rgba(0,0,0,0.9);pointer-events:none;';
    status.textContent = '按住任意处开始蓄力…';
    overlay.appendChild(status);

    // 拳心聚能（施术者头顶）：双环脉冲 + 光点倒吸
    const charge = document.createElement('div');
    charge.style.cssText = `position:absolute;left:${apex.x}px;top:${apex.y}px;width:0;height:0;pointer-events:none;`;
    const ringCss = 'position:absolute;border-radius:50%;left:50%;top:50%;transform:translate(-50%,-50%);';
    const r1 = document.createElement('div');
    r1.style.cssText = ringCss + 'width:26px;height:26px;border:2px solid rgba(255,207,94,0.9);opacity:0;';
    const r2 = document.createElement('div');
    r2.style.cssText = ringCss + 'width:26px;height:26px;border:2px solid rgba(127,199,255,0.85);opacity:0;';
    charge.appendChild(r1); charge.appendChild(r2);
    for (let i = 0; i < 8; i++) {
        const dot = document.createElement('div');
        const ang = (Math.PI * 2 * i) / 8 + 0.4;
        const dist = 74 + (i % 3) * 16;
        dot.style.cssText = `position:absolute;left:${Math.cos(ang) * dist}px;top:${Math.sin(ang) * dist}px;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;border-radius:50%;background:${i % 2 ? '#7fc7ff' : '#ffcf5e'};box-shadow:0 0 8px currentColor;opacity:0;`;
        dot.animate([{ transform: 'translate(0,0) scale(1.25)', opacity: 0 }, { opacity: 0.95, offset: 0.22 }, { transform: `translate(${-Math.cos(ang) * dist}px,${-Math.sin(ang) * dist}px) scale(0.3)`, opacity: 0 }], { duration: 950, delay: i * 90, iterations: Infinity, easing: 'ease-in' });
        charge.appendChild(dot);
    }
    overlay.appendChild(charge);

    // 格子高亮层（随 aim 重画）
    const markLayer = document.createElement('div');
    markLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    overlay.appendChild(markLayer);

    const drawMark = (m, dim) => {
        const cell = cells[m.pos];
        if (!cell) return;
        const st = TIER_STYLE[m.tier] || TIER_STYLE.far;
        const box = document.createElement('div');
        box.style.cssText = `position:absolute;left:${cell.x + 2}px;top:${cell.y + 2}px;width:${cell.w - 4}px;height:${cell.h - 4}px;border:2px solid ${st.border};background:${st.bg};border-radius:6px;box-shadow:0 0 12px ${st.border};opacity:${dim ? 0.55 : 1};`;
        markLayer.appendChild(box);
        const badge = document.createElement('div');
        badge.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:${st.badge};font-size:${m.tier === 'direct' ? 17 : 13}px;font-weight:900;text-shadow:0 1px 4px rgba(0,0,0,0.95);white-space:nowrap;`;
        badge.textContent = m.dmg > 0 ? `−${m.dmg}` : '空';
        box.appendChild(badge);
        if (m.mark) {
            const tag = document.createElement('div');
            tag.style.cssText = 'position:absolute;left:50%;top:-11px;transform:translateX(-50%);font-size:10px;font-weight:bold;color:#fff;background:rgba(20,24,40,0.9);border-radius:4px;padding:1px 5px;white-space:nowrap;';
            tag.textContent = m.mark;
            box.appendChild(tag);
        }
    };

    const renderMarks = () => {
        markLayer.innerHTML = '';
        if (!aim) {
            const ps = previewCells(0, N, xl);
            status.textContent = `未瞄准 → 全屏 9 格（近排 1/2/3 各 ${Math.floor(N / 3)}、中排 4/5/6 各 ${Math.floor(N / 4)}、远排 7/8/9 各 ${Math.floor(N / 5)}）`;
            ps.forEach(m => drawMark(m, true));
            return;
        }
        const ps = previewCells(aim, N, xl);
        const hitCount = ps.filter(m => occSet.has(m.pos)).length;
        status.textContent = `瞄准 ${aim} 号位 → 形状 ${ps.length} 格（有目标 ${hitCount} 格）${aim === 8 ? ' · 8 号将被轰穿中列撞边眩晕' : ''}`;
        ps.forEach(m => drawMark(m, false));
    };

    // —— 瞄准判定（照 131 demo v29：最近有人的敌格吸附；三条全屏兜底）——
    const computeAim = (px, py) => {
        const dx = px - apex.x, dy = py - apex.y;
        if (Math.hypot(dx, dy) < 26) return 0;           // 离施术者太近（原地按着不拖）
        if (dy > -8) return 0;                            // 指到己方半场
        const poses = Object.keys(cells).map(Number);
        if (!poses.length) return 0;
        const xs = poses.map(p => cells[p].x), ys = poses.map(p => cells[p].y);
        const minX = Math.min(...xs) - 30, maxX = Math.max(...poses.map(p => cells[p].x + cells[p].w)) + 30;
        const minY = Math.min(...ys) - 30, maxY = Math.max(...poses.map(p => cells[p].y + cells[p].h)) + 44;
        if (px < minX || px > maxX || py < minY || py > maxY) return 0; // 拖出敌阵包围盒
        let best = 0, bestD = Infinity;
        for (const p of poses) {
            if (!occSet.has(p)) continue; // 只锁有人的格
            const d = Math.hypot(cells[p].cx - px, cells[p].cy - py);
            if (d < bestD) { bestD = d; best = p; }
        }
        return best; // 敌格悬在空当里 → 0（全屏）
    };

    const startHold = () => {
        if (done || holding) return;
        holding = true;
        holdStart = performance.now();
        status.textContent = '蓄力中…（拖到敌格选形状，原地或拖出=全屏）';
        const pulse = (el, delay, color) => el.animate([
            { width: '22px', height: '22px', opacity: 0.95, borderColor: color },
            { width: '64px', height: '64px', opacity: 0, borderColor: color }
        ], { duration: 820, delay, iterations: Infinity, easing: 'ease-out' });
        pulse(r1, 0, 'rgba(255,207,94,0.95)');
        pulse(r2, 320, 'rgba(127,199,255,0.9)');
    };

    const finish = (finalAim, holdMs) => {
        if (done) return;
        done = true;
        try { GlobalStore.set('bulletTimeActive', false); } catch (e) { /* noop */ }
        // 摘掉 window 级监听（防多局累积泄漏）
        if (onWinUp) window.removeEventListener('pointerup', onWinUp);
        if (onKeyDown) window.removeEventListener('keydown', onKeyDown);
        if (onKeyUp) window.removeEventListener('keyup', onKeyUp);
        // 轰出白闪（短促，真正的爆发演出在下一步回合的 fx/93）
        const flash = document.createElement('div');
        flash.style.cssText = `position:absolute;left:${apex.x}px;top:${apex.y}px;width:80px;height:80px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,0.95) 0%,rgba(255,220,140,0.6) 45%,rgba(255,255,255,0) 72%);pointer-events:none;`;
        overlay.appendChild(flash);
        flash.animate([{ transform: 'translate(-50%,-50%) scale(0.4)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(3.2)', opacity: 0 }], { duration: 300, easing: 'ease-out' });
        if (holdTimer) clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
            if (overlay.parentNode) overlay.remove();
            resolve({ aim: finalAim | 0, holdMs: holdMs | 0 });
        }, 260);
    };

    overlay.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        startHold();
        aim = computeAim(ev.clientX, ev.clientY);
        renderMarks();
    });
    overlay.addEventListener('pointermove', (ev) => {
        if (!holding || done) return;
        ev.preventDefault();
        const next = computeAim(ev.clientX, ev.clientY);
        if (next !== aim) { aim = next; renderMarks(); }
    });
    const onUp = (ev) => {
        if (!holding || done) return;
        const holdMs = Math.max(0, (performance.now() - holdStart) | 0);
        holding = false;
        if (ev && ev.clientX != null) aim = computeAim(ev.clientX, ev.clientY);
        finish(aim, holdMs);
    };
    overlay.addEventListener('pointerup', onUp);
    overlay.addEventListener('pointercancel', onUp);
    onWinUp = onUp;
    window.addEventListener('pointerup', onWinUp);
    // 桌面空格键同款：按住=蓄力，松开=轰出
    onKeyDown = (ev) => { if (ev.code === 'Space' && !done) { ev.preventDefault(); startHold(); } };
    onKeyUp = (ev) => {
        if (ev.code === 'Space' && holding && !done) {
            ev.preventDefault();
            const holdMs = Math.max(0, (performance.now() - holdStart) | 0);
            holding = false;
            finish(aim, holdMs);
        }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    document.body.appendChild(overlay);
    try { GlobalStore.set('bulletTimeActive', true); } catch (e) { /* noop */ }
    renderMarks(); // 初始展示全屏兜底预览
}

GlobalStore.setUIHandler('showHanlisaAim', showHanlisaAim);
