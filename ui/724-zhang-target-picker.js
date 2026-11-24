// ui/724-zhang-target-picker.js — 张无忌专属·我命由我（拖拽选目标窗口）
// 结构照抄 ui/720-hanlisa-aim：模块加载即注册 UIHandler，player/512 handleZhangTargetPicker
//   门控（快进/全自动跳过）后取用。玩家按住张无忌格子拖到敌方格子 → resolve(uid)，
//   512 写 zhang.state._manualTargetUid（step 单位与引擎 generator A/B 同引用），
//   随后 core/212 selectAttackTarget 优先读手动目标，出手结算后 core/210 清理。
//   放弃（点空白/ESC/拖出界）→ resolve(null)，走正常选目标。
// V1.1.0 | 2026-11-17 FIX-2026-1117-11（老板拍板）：① 拖拽手感对齐 ui/723 圣火令——
//   跟手虚影 + SVG 连线/流动光点 + 起点格 dragging 脉冲 + 终点有效金光/无效灰显 + 跟随提示；
//   全部 JS 内动态建 DOM + inline style（含运行时注入 <style> 的 keyframes），**不碰 index.html CSS 块**。
//   ② 合法目标口径改调 core/203 getMeleeLegalTargetSet(...,{noFallback:true})，与引擎手动/自动三路同源：
//   近战够不着后排 → 后排灰显不可选，杜绝「亮了打不到 / 能打没亮」。零引擎改动（本文件自身）。
// V1.1.1 | 2026-11-19 FIX「一拖就没了」：① 压暗层加 pointer-events:none（旧版全屏遮罩把起点/终点指针全吃掉）；
//   ② 高亮格同步挂 touch-action:none（手机拖拽被当滚动 → pointercancel 直接取消窗口）；
//   ③ 点空白＝取消改由 document pointerdown 兜（遮罩不再拦后补回该语义）。
// V1.1.2 | 2026-11-23 修复「敌方有前排却全场灰、拖了也白拖」：原把马排除在可拖目标外，
//   而引擎把拒马算作一列前排（203:119），该列就变成「引擎能打、UI 不给选」→ 松手落空转随机。
//   现把马纳入可选；另在「无地面前排（全飞天/附体）」时如实提示只能随机。
// V1.1.3 | 2026-11-23 修「有前排也不亮、拖了照样随机」：① 敌方归属改按队伍数组判（不再看 camp 字段，
//   该字段可被复制/叛变/召唤改写）；② 判定集算空时 UI 全亮 + 引擎 212 放行手动目标，两边口径一致。
export const VER = 'ui/724-zhang-target-picker.js V1.1.3';

import { GlobalStore } from '../infra/104-global-store.js';
import { getMeleeLegalTargetSet } from '../core/203-battle-utils.js';

export function showZhangTargetPicker(c, step, resolve) {
    const zhangUid = step && step.zhangTargetPickerWindow && step.zhangTargetPickerWindow.zhangUid;
    const allUnits = [...((step && step.ally) || []), ...((step && step.enemy) || [])];
    const zhang = allUnits.find(u => u && u.uid === zhangUid);
    const zhangCell = zhangUid ? document.querySelector(`[data-uid="${zhangUid}"]`) : null;
    if (!zhang || !zhangCell) { resolve(null); return; }

    const enemySide = (step && step.enemy) || [];
    // 合法目标 = 引擎单一真源（core/203）。noFallback：UI 预览零 RNG 消耗。
    //   legalSet===null ⇒ 远程形态，全部敌方合法；否则仅前排 uid 合法。
    const legalSet = getMeleeLegalTargetSet(zhang, enemySide, { noFallback: true });
    // 自愈：判定集为空但场上明明有活敌 ⇒ 不再把整场锁成灰（老板多次撞见「有前排也不亮」）。
    //   此时一律按可选处理，引擎侧 212 同步放行手动目标，保证「拖到谁就打谁」。
    const legalNone = (legalSet !== null && legalSet.size === 0);
    const isLegalUid = (uid) => legalSet === null || legalNone || legalSet.has(uid);

    // 可拖拽目标 = 敌方半场（step.enemy = 引擎 B 队）的存活单位。
    //   不再按 u.camp 过滤：camp 会被复制/叛变/召唤类机制改写，某个敌人的 camp 一旦变成我方，
    //   他那一列就被判成「不是我方敌人」→ 整列灰、拖上去引擎也判非法 → 随机出手（老板 2026-11-23 报的现象）。
    //   战场归属只认「他在不在敌方队伍数组里」。含马：拒马是引擎认定的一列前排，能打。
    const enemyUids = new Set(enemySide.filter(u => u && u.alive).map(u => u.uid));

    // 高亮底账：每个格子记原 style，收尾精确还原
    //   touch-action:none 跟着高亮一起挂（2026-11-19）：手机上拖拽会被浏览器当成滚动 → 触发 pointercancel
    //   → 选目标窗当场 resolve(null)（「还没拖到人就没了」）。挂 none 后手势交给我们的 pointer 事件。
    const GLOW_ZHANG = ';box-shadow:0 0 24px rgba(255,215,0,0.95);position:relative;z-index:10011;touch-action:none;';
    const GLOW_LEGAL = ';box-shadow:0 0 18px rgba(255,215,0,0.9);position:relative;z-index:10011;touch-action:none;';
    const GLOW_ILLEGAL = ';box-shadow:0 0 10px rgba(130,130,130,0.5);filter:grayscale(0.85) brightness(0.72);position:relative;z-index:10011;touch-action:none;';
    const GLOW_HOVER_OK = ';box-shadow:0 0 36px rgba(255,215,0,1),0 0 14px rgba(255,215,0,0.9) inset;filter:none;';
    const GLOW_HOVER_BAD = ';box-shadow:0 0 22px rgba(170,170,170,0.95);filter:grayscale(1) brightness(0.6);';
    const baseZhang = zhangCell.getAttribute('style') || '';
    zhangCell.setAttribute('style', baseZhang + GLOW_ZHANG);
    const baseCells = new Map();
    const enemyCells = new Map();
    enemyUids.forEach(uid => {
        const cell = document.querySelector(`[data-uid="${uid}"]`);
        if (!cell) return;
        const base = cell.getAttribute('style') || '';
        baseCells.set(uid, base);
        enemyCells.set(uid, cell);
        cell.setAttribute('style', base + (isLegalUid(uid) ? GLOW_LEGAL : GLOW_ILLEGAL));
    });

    // ── 运行时样式（keyframes 注入 <style>，不落盘 index.html，零撞车）──
    const styleTag = document.createElement('style');
    styleTag.id = 'zhangPickerFxStyle';
    styleTag.textContent = '@keyframes zhangPickerPulse{'
        + '0%,100%{box-shadow:0 0 18px rgba(255,215,0,0.8),0 0 6px rgba(255,215,0,0.5) inset;}'
        + '50%{box-shadow:0 0 42px rgba(255,215,0,1),0 0 20px rgba(255,215,0,0.95) inset;}}';
    document.head.appendChild(styleTag);

    // 全屏压暗层 + 提示
    //   V1.1.1：压暗层必须 pointer-events:none——旧版它是全屏实体层，把下面所有格子的指针事件全吃掉，
    //   起点按不住/终点 elementFromPoint 永远拿到遮罩 → 拖一下就 resolve(null)（老板报「一拖就没了」）。
    const overlay = document.createElement('div');
    overlay.id = 'zhangTargetOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:10010;pointer-events:none;';
    const tipBar = document.createElement('div');
    tipBar.textContent = '☀️ 按住张无忌，金色可打／灰色是够不着的后排（松手在空白=取消）';
    tipBar.style.cssText = 'position:absolute;bottom:18%;left:50%;transform:translateX(-50%);color:#ffd700;font-size:14px;font-weight:bold;text-shadow:0 0 8px rgba(0,0,0,0.9);white-space:nowrap;';
    overlay.appendChild(tipBar);

    // ── SVG 连线（起点=张无忌格中心，终点=指针）──
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:10012;opacity:0;transition:opacity .12s;';
    const mkPath = (stroke, width, opacity) => {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', stroke);
        p.setAttribute('stroke-width', String(width));
        p.setAttribute('stroke-linecap', 'round');
        p.setAttribute('opacity', String(opacity));
        svg.appendChild(p);
        return p;
    };
    const linkGlow = mkPath('#ffd700', 10, 0.35);
    const linkCore = mkPath('#fff3b0', 2.5, 0.95);
    const flowGroup = document.createElementNS(NS, 'g');
    svg.appendChild(flowGroup);

    // ── 跟手虚影 ──
    const ghost = document.createElement('div');
    ghost.style.cssText = 'position:fixed;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;'
        + 'display:flex;align-items:center;justify-content:center;font-size:26px;pointer-events:none;z-index:10013;'
        + 'background:radial-gradient(circle at 35% 30%,#ffe066,#d97706 70%,#7a3a00);border:2px solid #ffd700;'
        + 'box-shadow:0 0 26px rgba(255,215,0,0.9);opacity:0;transition:opacity .12s;';
    ghost.textContent = '☀️';

    // ── 跟随提示（合法金光／非法灰显文案）──
    const hoverTip = document.createElement('div');
    hoverTip.style.cssText = 'position:fixed;padding:5px 10px;border-radius:6px;background:rgba(20,12,4,0.94);'
        + 'border:1px solid #ffd700;color:#ffd700;font-size:12px;font-weight:bold;white-space:nowrap;'
        + 'pointer-events:none;z-index:10014;opacity:0;transition:opacity .1s;box-shadow:0 4px 14px rgba(0,0,0,0.6);';

    document.body.appendChild(overlay);
    document.body.appendChild(svg);
    document.body.appendChild(ghost);
    document.body.appendChild(hoverTip);

    let dragging = false;
    let hoverUid = null;
    let start = { x: 0, y: 0 };

    const refreshStart = () => {
        const r = zhangCell.getBoundingClientRect();
        start = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const updateLink = (px, py, legal) => {
        const mx = (start.x + px) / 2;
        const my = (start.y + py) / 2 - 46;
        const d = `M ${start.x} ${start.y} Q ${mx} ${my} ${px} ${py}`;
        linkGlow.setAttribute('d', d);
        linkCore.setAttribute('d', d);
        linkGlow.setAttribute('stroke', legal ? '#ffd700' : '#8a8a8a');
        linkCore.setAttribute('stroke', legal ? '#fff3b0' : '#c4c4c4');
    };

    // ── 流动光点（同 ui/723 startFlowDots：沿 path.getPointAtLength 走）──
    let flowRaf = 0, flowT0 = 0;
    const DOT_COUNT = 4;
    const startFlowDots = () => {
        flowGroup.innerHTML = '';
        const dots = [];
        for (let i = 0; i < DOT_COUNT; i++) {
            const c = document.createElementNS(NS, 'circle');
            c.setAttribute('r', '3.5');
            c.setAttribute('fill', '#fff7c2');
            flowGroup.appendChild(c);
            dots.push(c);
        }
        flowT0 = performance.now();
        const tick = (now) => {
            if (!dragging) return;
            const len = linkCore.getTotalLength ? linkCore.getTotalLength() : 0;
            if (len > 1) {
                const off = ((now - flowT0) / 900) % 1;
                dots.forEach((c, i) => {
                    const t = (off + i / DOT_COUNT) % 1;
                    const pt = linkCore.getPointAtLength(t * len);
                    c.setAttribute('cx', pt.x);
                    c.setAttribute('cy', pt.y);
                    c.setAttribute('opacity', String(0.35 + 0.65 * Math.sin(t * Math.PI)));
                });
            }
            flowRaf = requestAnimationFrame(tick);
        };
        flowRaf = requestAnimationFrame(tick);
    };
    const stopFlowDots = () => {
        if (flowRaf) cancelAnimationFrame(flowRaf);
        flowRaf = 0;
        flowGroup.innerHTML = '';
    };

    const setHover = (uid, px, py) => {
        const legal = uid ? isLegalUid(uid) : false;
        if (hoverUid !== uid) {
            if (hoverUid) {
                const old = enemyCells.get(hoverUid);
                if (old) old.setAttribute('style', baseCells.get(hoverUid) + (isLegalUid(hoverUid) ? GLOW_LEGAL : GLOW_ILLEGAL));
            }
            hoverUid = uid;
            if (hoverUid) {
                const cell = enemyCells.get(hoverUid);
                if (cell) cell.setAttribute('style', baseCells.get(hoverUid) + (isLegalUid(hoverUid) ? GLOW_LEGAL : GLOW_ILLEGAL) + (legal ? GLOW_HOVER_OK : GLOW_HOVER_BAD));
            }
        }
        if (uid) {
            const u = allUnits.find(x => x && x.uid === uid);
            hoverTip.textContent = legal ? `☀️ 松手攻击 ${u ? u.name : '目标'}` : '⛔ 近战够不着后排';
            hoverTip.style.borderColor = legal ? '#ffd700' : '#888';
            hoverTip.style.color = legal ? '#ffd700' : '#bbb';
            hoverTip.style.left = (px + 16) + 'px';
            hoverTip.style.top = (py + 18) + 'px';
            hoverTip.style.opacity = '1';
        } else {
            hoverTip.style.opacity = '0';
        }
        updateLink(px, py, legal);
    };

    const cleanup = () => {
        stopFlowDots();
        ghost.remove();
        svg.remove();
        hoverTip.remove();
        styleTag.remove();
        overlay.remove();
        zhangCell.setAttribute('style', baseZhang);
        zhangCell.removeEventListener('pointerdown', onDown);
        enemyCells.forEach((cell, uid) => cell.setAttribute('style', baseCells.get(uid)));
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('pointerdown', onDocDown);
    };
    const onKey = (e) => { if (e.key === 'Escape') { cleanup(); resolve(null); } };
    // 压暗层不再拦事件后，点空白＝取消由这里兜（旧版靠遮罩吃掉点击，用户点了没反应）
    const onDocDown = (e) => {
        if (dragging) return;
        if (e.target === zhangCell || (zhangCell.contains && zhangCell.contains(e.target))) return;
        cleanup();
        resolve(null);
    };
    const onMove = (e) => {
        ghost.style.left = e.clientX + 'px';
        ghost.style.top = e.clientY + 'px';
        if (!dragging) return;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const cell = el && el.closest ? el.closest('.cell.occupied') : null;
        const uid = (cell && cell.dataset) ? cell.dataset.uid : null;
        setHover(uid && enemyUids.has(uid) ? uid : null, e.clientX, e.clientY);
    };
    const onUp = () => {
        if (!dragging) return;
        dragging = false;
        const picked = hoverUid && isLegalUid(hoverUid) ? hoverUid : null;
        cleanup();
        resolve(picked || null);
    };
    const onDown = (e) => {
        if (e.preventDefault) e.preventDefault();
        refreshStart();
        dragging = true;
        zhangCell.setAttribute('style', baseZhang + GLOW_ZHANG + ';animation:zhangPickerPulse .9s ease-in-out infinite;');
        ghost.style.left = e.clientX + 'px';
        ghost.style.top = e.clientY + 'px';
        ghost.style.opacity = '1';
        svg.style.opacity = '1';
        updateLink(e.clientX, e.clientY, false);
        startFlowDots();
    };

    zhangCell.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDocDown);
}

GlobalStore.setUIHandler('showZhangTargetPicker', showZhangTargetPicker);
