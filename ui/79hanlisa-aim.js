// ui/79hanlisa-aim.js — 蓄意轰拳子弹时间（按住蓄力 → 拖到敌格瞄准 → 松手轰出 → 完整循环演出后退出）
//   V2.0.0 | 2026-10-19 老板实机三连反馈重造（截图对照 fx/85 子弹时间 demo）：
//   · 场景照 fx/85 同款语言：纯黑幕 rgba(0,0,0,0.92) + 克隆体重建——不再叠在原页面上（旧版半透明盖布，
//     日志/按钮/米色战场全透出来，脏）；敌方九宫格整阵克隆到屏幕中央（cell 类+innerHTML 全带：
//     名字/攻防血数字/血条原样，大小≈原格），寒离飒克隆在敌阵下方中轴，日志区不可见
//   · 按住：拳心金冰双色聚能（双环脉冲+光点倒吸，129 demo 蓄力语言）
//   · 拖动：最近有人敌格吸附（131 demo v29 规则：离施术者近/指己方半场/出包围盒=全屏兜底），命中格描边+真伤预览数字
//   · 松手：完整循环（老板口径「打完伤害、轰完之后做一个完整的循环再退出」）——
//     冲击扇形（弧边金→冰渐变，fx/93 同形制）→ 逐格命中（大号−N 数字+克隆格血条扣血+血量数字滚动）→
//     瞄 8 特例（8 号克隆撞向 2 号位+😵，途经格侧崩）→ 吸血 ❤+N → 全场轻震 → 淡出退出
//   · 预演数值与 modules/27 结算同公式同结果（floor(N/den)），真结算照常在 ON_ROUND_END 跑；
//     退出时写 GlobalStore.hlsAimPlayedAt，紧随的 fx/93 舞台动作据此降为轻量版（防双演出；回放/自动挡无标记不受影响）
//   · holdMs 上报不生效（口子留给未来「按蓄力时长定 N1」）；60s 真实时间兜底防挂死；跳过按钮同 fx/85
//   · fx 层规矩：克隆体不缓存原格引用（开场现查现拷）；所有临时节点 data-fx=temporary；克隆内 id 全部摘除防撞
export const VER = 'ui/79hanlisa-aim.js V2.0.0';

import { GlobalStore } from '../infra/54-global-store.js';
import { getSkillParams } from '../core/01config-5v5-test.js';

// —— 与 modules/27 同一套分档口径（展示/预演用）——
function manhattan(a, b) {
    const r1 = Math.ceil(a / 3), c1 = a - (r1 - 1) * 3;
    const r2 = Math.ceil(b / 3), c2 = b - (r2 - 1) * 3;
    return Math.abs(r1 - r2) + Math.abs(c1 - c2);
}

function previewCells(aim, N, xl) {
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
            return { pos: p, den, tier, dmg: Math.floor(N / den), mark: p === aim ? '主目标' : (aim === 8 ? '撞边' : null) };
        });
    }
    return [[1, 2, 3, fd.row123], [4, 5, 6, fd.row456], [7, 8, 9, fd.row789]]
        .flatMap(([a, b, c3, den]) => [a, b, c3].map(p => ({ pos: p, den, tier: 'full', dmg: Math.floor(N / den), mark: null })));
}

const TIER_STYLE = {
    direct: { border: 'rgba(255,207,94,0.95)', bg: 'rgba(255,190,60,0.22)', badge: '#ffe9a8', size: 18 },
    eight:  { border: 'rgba(127,199,255,0.9)',  bg: 'rgba(90,170,255,0.20)', badge: '#bfe3ff', size: 16 },
    near:   { border: 'rgba(255,140,80,0.8)',   bg: 'rgba(255,120,60,0.14)', badge: '#ffc9a0', size: 14 },
    far:    { border: 'rgba(190,170,160,0.65)', bg: 'rgba(160,140,130,0.10)', badge: '#d9c6b8', size: 12 },
    full:   { border: 'rgba(255,170,90,0.6)',   bg: 'rgba(255,150,80,0.10)',  badge: '#ffd7b0', size: 13 }
};

// 原格克隆（fx/85 buildClone 同模式：cell 类 + innerHTML，不继承原格状态）
function cloneCell(srcCell) {
    const clone = document.createElement('div');
    clone.setAttribute('data-fx', 'temporary');
    clone.classList.add('cell');
    clone.innerHTML = srcCell.innerHTML;
    const r = srcCell.getBoundingClientRect();
    clone.style.cssText = `position:relative;width:${r.width}px;height:${r.height}px;margin:0;box-sizing:border-box;`;
    // 摘除克隆内的 id（原格 hpbar-{uid} 会撞）
    clone.querySelectorAll('[id]').forEach(el => { el.removeAttribute('id'); });
    return clone;
}

export function showHanlisaAim(c, hls, enemies, resolve) {
    let done = false;
    let holding = false;
    let holdStart = 0;
    let aim = 0;
    let onWinUp = null, onKeyDown = null, onKeyUp = null;
    const TIMEOUT_MS = 60000;    // 真实时间兜底（瞄准可思考，给足 60s）
    let timeoutId = null;

    // —— 数据快照 ——
    const xl = getSkillParams('寒离飒', 'xuLi') || {};
    const buckets = (hls.state && Array.isArray(hls.state._hlsTaken)) ? hls.state._hlsTaken.slice(-3) : [];
    const N = Math.floor(buckets.reduce((s, v) => s + (v || 0), 0));
    // enemies: [{pos, hp, maxHp, name, alive}]（player/49 传引擎真值）
    const enemyByPos = {};
    (enemies || []).forEach(e => { if (e && e.pos >= 1 && e.pos <= 9 && e.alive !== false) enemyByPos[e.pos] = e; });
    const occSet = new Set(Object.keys(enemyByPos).map(Number));

    // —— 原格引用（开场现查，用完即弃）——
    const srcEnemyGrid = document.getElementById('enemyGrid');
    const srcHlsCell = document.querySelector(`[data-uid="${hls.uid}"]`);
    if (!srcEnemyGrid || !srcHlsCell) { resolve({ aim: 0, holdMs: 0 }); return; }

    // —— 场景骨架（fx/85 语言：纯黑幕 + 克隆体重建）——
    const overlay = document.createElement('div');
    overlay.setAttribute('data-fx', 'temporary');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10018;background:rgba(0,0,0,0.92);touch-action:none;user-select:none;-webkit-user-select:none;cursor:crosshair;opacity:0;transition:opacity 250ms;';

    // 顶部提示
    const hint = document.createElement('div');
    hint.style.cssText = 'position:absolute;top:16px;left:50%;transform:translateX(-50%);text-align:center;color:#ffe9c8;font-size:16px;font-weight:bold;text-shadow:0 0 10px rgba(255,190,80,0.55);pointer-events:none;white-space:nowrap;';
    hint.innerHTML = `🥊 <b>蓄意轰拳</b> — 按住蓄力 · 拖到敌格瞄准 · 松手轰出<br><span style="font-size:12px;color:#cfc4b4;font-weight:normal;">轰拳能量 N=${N}（真伤基数） · 原地松手 = 全屏</span>`;
    overlay.appendChild(hint);

    // 敌阵克隆区（居中偏上）与寒离飒克隆（敌阵下方中轴）
    const srcCells = [];
    for (const el of srcEnemyGrid.children) {
        const p = Number(el.dataset.pos);
        if (p >= 1 && p <= 9) srcCells.push({ pos: p, el });
    }
    const rect0 = srcCells[0] ? srcCells[0].el.getBoundingClientRect() : null;
    const cw = rect0 ? rect0.width : 100, ch = rect0 ? rect0.height : 62;
    const gap = 8;
    const gridW = cw * 3 + gap * 2;
    const st = document.body.getBoundingClientRect(); // 舞台柱（宽屏不飘黑边）
    const left0 = st.left + (st.width - gridW) / 2;
    const top0 = Math.max(innerHeight * 0.16, 84);

    const grid = document.createElement('div');
    grid.style.cssText = `position:absolute;left:${left0}px;top:${top0}px;display:grid;grid-template-columns:repeat(3,${cw}px);grid-auto-rows:${ch}px;gap:${gap}px;`;
    const cellEls = {};   // pos → 克隆格元素
    for (const s of srcCells) {
        const cl = cloneCell(s.el);
        grid.appendChild(cl);
        cellEls[s.pos] = cl;
    }
    overlay.appendChild(grid);

    // 寒离飒克隆（敌阵下方中轴）
    const hlsClone = cloneCell(srcHlsCell);
    const hlsTop = top0 + ch * 3 + gap * 2 + 26;
    hlsClone.style.position = 'absolute';
    hlsClone.style.left = (left0 + (gridW - cw) / 2) + 'px';
    hlsClone.style.top = hlsTop + 'px';
    overlay.appendChild(hlsClone);

    // 克隆格坐标快照（append 之后现拍）
    document.body.appendChild(overlay);
    const cells = {};
    for (const p of Object.keys(cellEls).map(Number)) {
        const r = cellEls[p].getBoundingClientRect();
        cells[p] = { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    }
    const hlsRect = hlsClone.getBoundingClientRect();
    const apex = { x: hlsRect.left + hlsRect.width / 2, y: hlsRect.top + hlsRect.height / 2 };

    // 聚能锚（拳心）
    const charge = document.createElement('div');
    charge.style.cssText = `position:absolute;left:${apex.x}px;top:${apex.y}px;width:0;height:0;pointer-events:none;z-index:3;`;
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

    // 底部状态行
    const status = document.createElement('div');
    status.style.cssText = `position:absolute;top:${hlsTop + ch + 18}px;left:50%;transform:translateX(-50%);color:#fff;font-size:14px;font-weight:bold;text-shadow:0 1px 6px rgba(0,0,0,0.9);pointer-events:none;white-space:nowrap;`;
    status.textContent = '按住任意处开始蓄力…';
    overlay.appendChild(status);

    // 跳过按钮（fx/85 同款）
    const skipBtn = document.createElement('div');
    skipBtn.textContent = '跳过';
    const skipRight = (window.innerWidth - st.right + st.width * 0.08) + 'px';
    skipBtn.style.cssText = 'position:fixed;bottom:12%;right:' + skipRight + ';z-index:99999;color:rgba(255,255,255,0.7);font-size:18px;font-weight:bold;cursor:pointer;pointer-events:auto;transform:rotate(-30deg);text-align:center;line-height:1;letter-spacing:2px;';
    overlay.appendChild(skipBtn);

    // 标记层（随 aim 重画）
    const markLayer = document.createElement('div');
    markLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2;';
    overlay.appendChild(markLayer);

    const drawMark = (m, dim) => {
        const cell = cells[m.pos];
        if (!cell) return;
        const ts = TIER_STYLE[m.tier] || TIER_STYLE.far;
        const box = document.createElement('div');
        box.style.cssText = `position:absolute;left:${cell.x + 2}px;top:${cell.y + 2}px;width:${cell.w - 4}px;height:${cell.h - 4}px;border:2px solid ${ts.border};background:${ts.bg};border-radius:6px;box-shadow:0 0 12px ${ts.border};opacity:${dim ? 0.5 : 1};`;
        markLayer.appendChild(box);
        const badge = document.createElement('div');
        badge.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:${ts.badge};font-size:${ts.size}px;font-weight:900;text-shadow:0 1px 4px rgba(0,0,0,0.95);white-space:nowrap;`;
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
            status.textContent = `未瞄准 → 全屏（近排 1/2/3 各 −${Math.floor(N / 3)} · 中排 4/5/6 各 −${Math.floor(N / 4)} · 远排 7/8/9 各 −${Math.floor(N / 5)}）`;
            ps.forEach(m => drawMark(m, true));
            return;
        }
        const ps = previewCells(aim, N, xl);
        const hitCount = ps.filter(m => occSet.has(m.pos)).length;
        status.textContent = `瞄准 ${aim} 号位 → ${ps.length} 格（有目标 ${hitCount} 格）${aim === 8 ? ' · 8 号将被轰穿中列撞边眩晕' : ''}`;
        ps.forEach(m => drawMark(m, false));
    };

    // —— 瞄准判定（131 demo v29：最近有人敌格吸附；三条全屏兜底）——
    const computeAim = (px, py) => {
        const dx = px - apex.x, dy = py - apex.y;
        if (Math.hypot(dx, dy) < 26) return 0;           // 离施术者太近（原地按着不拖）
        if (dy > -8) return 0;                            // 指到己方半场（施术者下方）
        const poses = Object.keys(cells).map(Number);
        if (!poses.length) return 0;
        const xs = poses.map(p => cells[p].x), ys = poses.map(p => cells[p].y);
        const minX = Math.min(...xs) - 30, maxX = Math.max(...poses.map(p => cells[p].x + cells[p].w)) + 30;
        const minY = Math.min(...ys) - 30, maxY = Math.max(...poses.map(p => cells[p].y + cells[p].h)) + 44;
        if (px < minX || px > maxX || py < minY || py > maxY) return 0; // 拖出敌阵包围盒
        let best = 0, bestD = Infinity;
        for (const p of poses) {
            if (!occSet.has(p)) continue;                 // 只锁有人的格
            const d = Math.hypot(cells[p].cx - px, cells[p].cy - py);
            if (d < bestD) { bestD = d; best = p; }
        }
        return best;
    };

    const startHold = () => {
        if (done || holding) return;
        holding = true;
        holdStart = performance.now();
        status.textContent = '蓄力中…（拖到敌格选形状，原地或拖出 = 全屏）';
        const pulse = (el, delay, color) => el.animate([
            { width: '22px', height: '22px', opacity: 0.95, borderColor: color },
            { width: '64px', height: '64px', opacity: 0, borderColor: color }
        ], { duration: 820, delay, iterations: Infinity, easing: 'ease-out' });
        pulse(r1, 0, 'rgba(255,207,94,0.95)');
        pulse(r2, 320, 'rgba(127,199,255,0.9)');
    };

    // —— 完整循环演出（松手后：冲击扇形 → 逐格命中扣血 → 8特例 → 吸血 → 淡出退出）——
    const playBurstLoop = async (finalAim) => {
        overlay.style.cursor = 'default';
        markLayer.innerHTML = '';
        status.textContent = '';
        hint.innerHTML = `💥 <b>蓄意轰拳</b> 轰出！`;
        charge.remove();

        const hits = previewCells(finalAim, N, xl).filter(m => occSet.has(m.pos) && m.dmg > 0);
        const hitPos = new Set(hits.map(m => m.pos));

        // 冲击扇形（弧边金→冰渐变，fx/93 同形制）：从拳心冲向命中范围
        const hitCenters = hits.map(m => cells[m.pos]).filter(Boolean);
        if (hitCenters.length) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('data-fx', 'temporary');
            svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:4;overflow:visible;';
            const left = hitCenters.reduce((a, b) => (b.cx < a.cx ? b : a));
            const right = hitCenters.reduce((a, b) => (b.cx > a.cx ? b : a));
            const R = Math.max(Math.hypot(left.cx - apex.x, left.cy - apex.y), Math.hypot(right.cx - apex.x, right.cy - apex.y), 1);
            const a0 = Math.atan2(left.cy - apex.y, left.cx - apex.x);
            const a1 = Math.atan2(right.cy - apex.y, right.cx - apex.x);
            let d = a1 - a0;
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            const pts = [];
            for (let i = 0; i <= 26; i++) {
                const a = a0 + d * (i / 26);
                pts.push(`${(apex.x + Math.cos(a) * R).toFixed(1)} ${(apex.y + Math.sin(a) * R).toFixed(1)}`);
            }
            const gid = 'hlsAimFan' + Date.now();
            svg.innerHTML = `
                <defs>
                    <linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${apex.x}" y1="${apex.y}" x2="${(left.cx + right.cx) / 2}" y2="${(left.cy + right.cy) / 2}">
                        <stop offset="0%" stop-color="rgba(255,215,0,0.65)"/>
                        <stop offset="55%" stop-color="rgba(255,150,60,0.45)"/>
                        <stop offset="100%" stop-color="rgba(127,199,255,0.4)"/>
                    </linearGradient>
                    <filter id="${gid}b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
                </defs>
                <path d="M ${apex.x.toFixed(1)} ${apex.y.toFixed(1)} L ${pts.join(' L ')} Z" fill="url(#${gid})" filter="url(#${gid}b)"
                      stroke="rgba(255,224,150,0.85)" stroke-width="2.6"/>`;
            overlay.appendChild(svg);
            svg.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: 850, easing: 'ease-out' })
                .finished.then(() => svg.remove()).catch(() => svg.remove());
        }

        // 逐格命中（按与拳心距离由近到远 stagger）
        const ordered = hits.slice().sort((a, b) =>
            (Math.hypot(cells[a.pos].cx - apex.x, cells[a.pos].cy - apex.y)) - (Math.hypot(cells[b.pos].cx - apex.x, cells[b.pos].cy - apex.y)));
        let total = 0;
        const dmgByPos = {};
        ordered.forEach(m => { dmgByPos[m.pos] = m.dmg; total += m.dmg; });
        await sleep(220);
        for (const m of ordered) {
            const cellData = cells[m.pos];
            const cl = cellEls[m.pos];
            const e = enemyByPos[m.pos];
            if (!cellData || !cl) continue;
            // 格子受击抖
            cl.animate([
                { transform: 'translate(0,0) scale(1)' },
                { transform: `translate(${(Math.random() - 0.5) * 8}px,${(Math.random() - 0.5) * 6}px) scale(1.06)` },
                { transform: 'translate(0,0) scale(1)' }
            ], { duration: 260, easing: 'ease-out' });
            // 大号伤害数字（照 fx/93 分档字号）
            const ts = TIER_STYLE[m.tier] || TIER_STYLE.far;
            const big = m.tier === 'direct' || m.tier === 'eight' || m.tier === 'full' && m.pos <= 3;
            const num = document.createElement('div');
            num.setAttribute('data-fx', 'temporary');
            num.textContent = `−${m.dmg}`;
            num.style.cssText = `position:absolute;left:${cellData.cx}px;top:${cellData.y - 2}px;transform:translate(-50%,0);font-size:${big ? 32 : 24}px;font-weight:900;color:${ts.badge};text-shadow:0 0 12px rgba(255,200,80,0.9),0 2px 5px rgba(0,0,0,0.95);z-index:6;pointer-events:none;`;
            markLayer.appendChild(num);
            num.animate([
                { transform: 'translate(-50%,0) scale(0.6)', opacity: 0 },
                { transform: 'translate(-50%,-16px) scale(1.18)', opacity: 1, offset: 0.3 },
                { transform: 'translate(-50%,-44px) scale(1)', opacity: 0 }
            ], { duration: 1250, easing: 'ease-out' }).finished.then(() => num.remove()).catch(() => num.remove());
            // 血条扣血 + 血量数字滚动（克隆格内）
            if (e && e.maxHp > 0) {
                const bar = cl.querySelector('.hp-bar-inner');
                if (bar) {
                    const pctBefore = Math.max(0, e.hp / e.maxHp) * 100;
                    const pctAfter = Math.max(0, (e.hp - m.dmg) / e.maxHp) * 100;
                    bar.animate([{ height: pctBefore + '%' }, { height: pctAfter + '%' }], { duration: 420, easing: 'ease-in', fill: 'forwards' });
                    bar.style.height = pctAfter + '%';
                }
                const stats = cl.querySelector('.cell-stats');
                if (stats && stats.lastElementChild) {
                    const hpEl = stats.lastElementChild;
                    const before = e.hp, after = Math.max(0, e.hp - m.dmg);
                    const t0 = performance.now();
                    const tick = () => {
                        const p = Math.min(1, (performance.now() - t0) / 420);
                        hpEl.textContent = '血' + Math.round(before + (after - before) * p);
                        if (p < 1 && cl.isConnected) requestAnimationFrame(tick);
                    };
                    tick();
                }
            }
            await sleep(110);
        }

        // 瞄 8 特例：8 号克隆撞向 2 号位 + 😵（黑幕内简版：位移+旋转小跳，正式结算由引擎+fx/93 演）
        if (finalAim === 8 && cellEls[8] && cells[2]) {
            const cl8 = cellEls[8];
            const from = cells[8], to = cells[2];
            cl8.animate([
                { transform: 'translate(0,0) rotate(0deg)' },
                { transform: `translate(${(to.cx - from.cx) * 0.6}px,${(to.cy - from.cy) * 0.6}px) rotate(-8deg)`, offset: 0.6 },
                { transform: `translate(${to.cx - from.cx}px,${to.cy - from.cy}px) rotate(6deg) scale(0.92)` }
            ], { duration: 620, easing: 'cubic-bezier(.6,0,.8,1)', fill: 'forwards' });
            await sleep(640);
            const stun = document.createElement('div');
            stun.setAttribute('data-fx', 'temporary');
            stun.textContent = '😵 撞边眩晕';
            stun.style.cssText = `position:absolute;left:${to.cx}px;top:${to.y - 10}px;transform:translate(-50%,0);font-size:13px;font-weight:bold;color:#cfe6ff;text-shadow:0 1px 4px rgba(0,0,0,0.95);z-index:6;pointer-events:none;`;
            markLayer.appendChild(stun);
        }

        // 吸血（总伤害 1/3，封顶缺失生命——与 modules/27 同口径）
        const vampDiv = (xl.vampDiv != null) ? xl.vampDiv : 3;
        const vamp = vampDiv > 0 ? Math.min(Math.floor(total / vampDiv), Math.max(0, (hls.maxHp || 0) - (hls.hp || 0))) : 0;
        if (vamp > 0) {
            const vf = document.createElement('div');
            vf.setAttribute('data-fx', 'temporary');
            vf.textContent = `🩸 +${vamp}`;
            vf.style.cssText = `position:absolute;left:${apex.x}px;top:${hlsRect.top - 6}px;transform:translate(-50%,0);font-size:22px;font-weight:900;color:#9ff0b0;text-shadow:0 0 10px rgba(80,220,130,0.8),0 2px 4px rgba(0,0,0,0.9);z-index:6;pointer-events:none;`;
            overlay.appendChild(vf);
            vf.animate([
                { transform: 'translate(-50%,0)', opacity: 0 }, { transform: 'translate(-50%,-14px)', opacity: 1, offset: 0.3 },
                { transform: 'translate(-50%,-48px)', opacity: 0 }
            ], { duration: 1200, easing: 'ease-out' }).finished.then(() => vf.remove()).catch(() => vf.remove());
        }

        // 汇总 + 全场轻震
        status.textContent = `轰出完毕：命中 ${ordered.length} 格，真伤合计 −${total}${vamp > 0 ? ` · 吸血 +${vamp}` : ''}`;
        overlay.animate([
            { transform: 'translate(0,0)' },
            { transform: `translate(${(Math.random() - 0.5) * 10}px,${(Math.random() - 0.5) * 8}px)` },
            { transform: 'translate(0,0)' }
        ], { duration: 300, easing: 'ease-out' });

        await sleep(1100);
    };

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    const finish = async (finalAim, holdMs, skipped) => {
        if (done) return;
        done = true;
        clearTimeout(timeoutId);
        try { GlobalStore.set('bulletTimeActive', false); } catch (e) { /* noop */ }
        if (onWinUp) window.removeEventListener('pointerup', onWinUp);
        if (onKeyDown) window.removeEventListener('keydown', onKeyDown);
        if (onKeyUp) window.removeEventListener('keyup', onKeyUp);
        try {
            if (!skipped) {
                await playBurstLoop(finalAim);
                // 标记：黑幕已完整演出——紧随的 fx/93 舞台动作据此降为轻量版（回放/自动挡无标记不受影响）。
                // 跳过（skip/超时）不设标记：玩家没看黑幕演出，战场 fx/93 照常完整播
                GlobalStore.set('hlsAimPlayedAt', Date.now());
            }
        } catch (e) { console.warn('[蓄意轰拳] 演出异常', e); }
        overlay.style.opacity = '0';
        setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 260);
        resolve({ aim: finalAim | 0, holdMs: holdMs | 0 });
    };

    // 真实时间兜底：任何原因卡住 60s 强制结束（照 fx/85 防挂死）
    timeoutId = setTimeout(() => { if (!done) { console.warn('[蓄意轰拳] 瞄准超时，强制结束'); finish(aim, 0, true); } }, TIMEOUT_MS);

    skipBtn.addEventListener('click', (ev) => { ev.stopPropagation(); if (!done) finish(aim, Math.max(0, performance.now() - holdStart) | 0, true); });

    overlay.addEventListener('pointerdown', (ev) => {
        if (done) return;
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
        finish(aim, holdMs, false);
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
            finish(aim, holdMs, false);
        }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    try { GlobalStore.set('bulletTimeActive', true); } catch (e) { /* noop */ }
    renderMarks();               // 初始展示全屏兜底预览
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });   // 入场淡入
}

GlobalStore.setUIHandler('showHanlisaAim', showHanlisaAim);
