// V6.1.0 | ~20100 bytes | 2026-09-09 特效层解耦：全部 cell 引用改为 snapshot + clone，原格子状态由 store/renderGrid 驱动
export const VER = 'fx/82fx-crash-5v5-test.js V6.1.0';

import { STORE_ACTION_TYPES, CAMP_TYPES, ROLE_TYPES } from '../infra/56-battle-enums.js';
import { markGridShake } from '../render/32-grid-render.js';
import { snapshotUnitCellRobust, getUnitCell } from './90fx-ref-manager.js';

function finishCrash(clone, unitA) {
    if (clone && clone.parentNode) clone.remove();
    const ctx = GlobalStore.get('playerContext');
    if (ctx && ctx.store) {
        ctx.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _flyMode: null, _acted: true });
        ctx.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: unitA.uid });
        Object.assign(unitA.state, { _flyMode: null });
    } else {
        Object.assign(unitA.state, { _flyMode: null });
    }
    if (ctx) ctx.updateUI();
}

function showCloseRangeFX(unitA, unitD, role, getPausedFn) {
    const rectA = snapshotUnitCellRobust(unitA);
    const rectD = snapshotUnitCellRobust(unitD);
    if (!rectA || !rectD) return;
    const ax = rectA.x, ay = rectA.y, bx = rectD.x, by = rectD.y;
    const ndx = bx - ax, ndy = by - ay, ndist = Math.sqrt(ndx*ndx + ndy*ndy);
    const nnx = ndist > 0 ? ndx / ndist : 0, nny = ndist > 0 ? ndy / ndist : 0;

    const icon = document.createElement('div');
    icon.setAttribute('data-fx', 'temporary');
    icon.style.cssText = `position:fixed;left:${ax}px;top:${ay}px;font-size:36px;z-index:99999;pointer-events:none;transform:translate(-50%,-50%);`;
    if (role === ROLE_TYPES.WARRIOR) icon.textContent = '⚔️';
    else if (role === ROLE_TYPES.DEFENDER) icon.textContent = '🛡️';
    else if (role === ROLE_TYPES.FLYER) icon.textContent = '🦅';
    document.body.appendChild(icon);

    let iconStart = null;
    function flyIcon(ts) {
        if (getPausedFn && getPausedFn()) { requestAnimationFrame(flyIcon); return; }
        if (!iconStart) iconStart = ts;
        let p = Math.min(1, (ts - iconStart) / 800);
        let x = ax + (bx - ax) * p, y = ay + (by - ay) * p;
        icon.style.left = x + 'px';
        icon.style.top = y + 'px';
        if (p < 1) { requestAnimationFrame(flyIcon); }
        else {
            markGridShake(unitD.uid, 500);
            setTimeout(() => {
                icon.style.transition = 'opacity 0.8s ease-out';
                icon.style.opacity = '0';
                setTimeout(() => { if (icon.parentNode) icon.remove(); }, 800);
            }, 800);
        }
    }
    requestAnimationFrame(flyIcon);
}

export function showMeleeCrash(unitA, unitD, speed, getPausedFn, onCrash) {
    const rectA = snapshotUnitCellRobust(unitA);
    const rectD = snapshotUnitCellRobust(unitD);
    if (!rectA || !rectD) return;
    const cellA = getUnitCell(unitA);
    if (!cellA) return;

    const sx = rectA.x, sy = rectA.y;
    const ex = rectD.x, ey = rectD.y;
    const dx = ex - sx, dy = ey - sy, dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    const aPos = unitA.pos, dPos = unitD.pos;
    const isClose = (aPos === 1 && dPos === 1) || (aPos === 2 && dPos === 2) || (aPos === 3 && dPos === 3) ||
                  (aPos === 1 && dPos === 2) || (aPos === 2 && dPos === 1) || (aPos === 2 && dPos === 3) || (aPos === 3 && dPos === 2);
    if (isClose) {
        showCloseRangeFX(unitA, unitD, unitA.role, getPausedFn);
        if (onCrash) onCrash();
        return;
    }

    const nx = dx / dist, ny = dy / dist;
    const flyDist = dist - rectD.width * 0.28;
    const flyMode = GlobalStore.get('crashMode') || 'ghost';
    const ctx = GlobalStore.get('playerContext');

    // 先 clone 原 cell（此时内容正常），再设置 _flyMode 触发重绘
    const clone = cellA.cloneNode(true);
    clone.setAttribute('data-fx', 'temporary');
    clone.classList.remove('ready', 'acted');
    clone.removeAttribute('data-flash');
    clone.classList.add('crash-clone');
    clone.style.cssText = `
        position: fixed;
        left: ${rectA.left}px;
        top: ${rectA.top}px;
        width: ${rectA.width}px;
        height: ${rectA.height}px;
        z-index: 99999;
        margin: 0;
        transition: none;
        opacity: 1;
        visibility: visible;
        display: flex;
        transform: none;
        border: 2px solid #bbb;
        border-radius: 5px;
        box-sizing: border-box;
        pointer-events: none;
    `;
    document.body.appendChild(clone);

    // 设置 _flyMode，renderGrid 自动处理原格子（fly=透明，ghost=虚影）
    if (ctx && ctx.store) {
        Object.assign(unitA.state, { _flyMode: flyMode });
        ctx.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: unitA.uid });
        ctx.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _acted: true, _flyMode: flyMode });
    }

    const chargeDur = 800 * (speed / 1000);
    const crashDur = 900 * (speed / 1000);
    const returnDur = 800 * (speed / 1000);

    // ghost 模式蓄力缩放 clone
    if (flyMode === 'ghost') {
        clone.style.transition = 'transform 0.3s ease-out';
        clone.style.transform = 'scale(1.15)';
    }

    let startC = null;
    function phaseCharge(ts) {
        if (getPausedFn && getPausedFn()) { requestAnimationFrame(phaseCharge); return; }
        if (!startC) startC = ts;
        let p = Math.min(1, (ts - startC) / chargeDur);
        if (p < 1) { requestAnimationFrame(phaseCharge); }
        else {
            clone.style.transition = '';
            clone.style.transform = 'none';
            phaseFly(0);
        }
    }

    function phaseFly(ts) {
        if (!ts) { requestAnimationFrame(phaseFly); return; }
        if (getPausedFn && getPausedFn()) { requestAnimationFrame(phaseFly); return; }
        const start = clone._flyStart || (clone._flyStart = ts);
        const p = Math.min(1, (ts - start) / crashDur);
        const ease = 1 - Math.pow(1 - p, 3);
        const flown = flyDist * ease;
        clone.style.left = (rectA.left + nx * flown) + 'px';
        clone.style.top = (rectA.top + ny * flown) + 'px';
        if (p < 1) { requestAnimationFrame(phaseFly); }
        else {
            if (onCrash) onCrash();
            const crashX = rectA.left + nx * flyDist, crashY = rectA.top + ny * flyDist;
            phaseReturn(0, crashX, crashY);
        }
    }

    function phaseReturn(ts, crashX, crashY) {
        if (!ts) { requestAnimationFrame(() => phaseReturn(performance.now(), crashX, crashY)); return; }
        if (getPausedFn && getPausedFn()) { requestAnimationFrame(() => phaseReturn(performance.now(), crashX, crashY)); return; }
        const start = clone._returnStart || (clone._returnStart = ts);
        const p = Math.min(1, (ts - start) / returnDur);
        const ease = 1 - Math.pow(1 - p, 4);
        clone.style.left = (crashX + (rectA.left - crashX) * ease) + 'px';
        clone.style.top = (crashY + (rectA.top - crashY) * ease) + 'px';
        if (p < 1) { requestAnimationFrame(() => phaseReturn(performance.now(), crashX, crashY)); }
        else {
            finishCrash(clone, unitA);
        }
    }

    if (flyMode === 'ghost') {
        requestAnimationFrame(phaseCharge);
    } else {
        phaseFly(0);
    }
}

export function showMeleeDodge(unitA, unitD, speed, getPausedFn) {
    const rectA = snapshotUnitCellRobust(unitA);
    const rectD = snapshotUnitCellRobust(unitD);
    if (!rectA || !rectD) return;
    const cellA = getUnitCell(unitA);
    if (!cellA) return;

    const sx = rectA.x, sy = rectA.y;
    const ex = rectD.x, ey = rectD.y;
    const dx = ex - sx, dy = ey - sy, dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    const nx = dx / dist, ny = dy / dist;
    const approachDist = dist - rectD.width * 0.35;

    const clone = cellA.cloneNode(true);
    clone.classList.remove('ready', 'acted');
    clone.removeAttribute('data-flash');
    clone.classList.add('crash-clone');
    clone.setAttribute('data-fx', 'temporary');
    clone.style.cssText = `
        position: fixed;
        left: ${rectA.left}px;
        top: ${rectA.top}px;
        width: ${rectA.width}px;
        height: ${rectA.height}px;
        z-index: 99999;
        margin: 0;
        transition: none;
        opacity: 1;
        visibility: visible;
        display: flex;
        transform: none;
        border: 2px solid #bbb;
        border-radius: 5px;
        box-sizing: border-box;
        pointer-events: none;
    `;
    document.body.appendChild(clone);

    const ctx = GlobalStore.get('playerContext');
    if (ctx && ctx.store) {
        ctx.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: unitA.uid });
        ctx.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _acted: true });
    }

    let flyDur = 350 * (speed / 1000);
    let startFly = null;
    let blocked = false;

    function phaseFly(ts) {
        if (getPausedFn && getPausedFn()) { requestAnimationFrame(phaseFly); return; }
        if (!startFly) startFly = ts;
        const p = Math.min(1, (ts - startFly) / flyDur);
        const flown = approachDist * (1 - Math.pow(1 - p, 3));
        clone.style.left = (rectA.left + nx * flown) + 'px';
        clone.style.top = (rectA.top + ny * flown) + 'px';

        if (!blocked && p >= 0.85) {
            blocked = true;
            markGridShake(unitD.uid, 400);
            clone.style.transition = 'transform 0.1s ease';
            clone.style.transform = 'scale(0.9)';
            setTimeout(() => {
                clone.style.transform = 'scale(1)';
            }, 100);
        }
        if (p < 1 && !blocked) requestAnimationFrame(phaseFly);
        else if (p < 1) {
            // 继续飞行到终点
            requestAnimationFrame(phaseFly);
        } else {
            // 飞回动画
            const contactX = rectA.left + nx * approachDist;
            const contactY = rectA.top + ny * approachDist;
            const returnDur = 500 * (speed / 1000);
            let startReturn = null;
            function phaseReturn(ts2) {
                if (getPausedFn && getPausedFn()) { requestAnimationFrame(phaseReturn); return; }
                if (!startReturn) startReturn = ts2;
                const p2 = Math.min(1, (ts2 - startReturn) / returnDur);
                const ease2 = 1 - Math.pow(1 - p2, 2);
                const perpX = -ny, perpY = nx;
                const offsetMag = Math.sin(p2 * Math.PI) * 35;
                const retreatDist = 50 * ease2;
                clone.style.left = (contactX - nx * retreatDist + perpX * offsetMag) + 'px';
                clone.style.top = (contactY - ny * retreatDist + perpY * offsetMag) + 'px';
                clone.style.transform = `rotate(${8 * (1 - p2)}deg) scale(1.05)`;
                clone.style.opacity = 0.6 + 0.4 * (1 - p2);
                if (p2 < 1) requestAnimationFrame(phaseReturn);
                else {
                    finishCrash(clone, unitA);
                }
            }
            requestAnimationFrame(phaseReturn);
        }
    }
    requestAnimationFrame(phaseFly);
}

export function showMeleeMiss(unitA, unitD, speed, getPausedFn) {
    const rectA = snapshotUnitCellRobust(unitA);
    const rectD = snapshotUnitCellRobust(unitD);
    if (!rectA || !rectD) return;
    const cellA = getUnitCell(unitA);
    if (!cellA) return;

    const dx = rectD.x - rectA.x, dy = rectD.y - rectA.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 1) return;
    const nx = dx / dist, ny = dy / dist;
    const approach = dist - rectD.width * 0.5;

    const clone = cellA.cloneNode(true);
    clone.classList.remove('ready', 'acted');
    clone.removeAttribute('data-flash');
    clone.classList.add('crash-clone');
    clone.setAttribute('data-fx', 'temporary');
    clone.style.cssText = `
        position: fixed;
        left: ${rectA.left}px;
        top: ${rectA.top}px;
        width: ${rectA.width}px;
        height: ${rectA.height}px;
        z-index: 99999;
        margin: 0;
        transition: transform 0.25s ease-out;
        opacity: 1;
        visibility: visible;
        display: flex;
        transform: none;
        border: 2px solid #bbb;
        border-radius: 5px;
        box-sizing: border-box;
        pointer-events: none;
    `;
    document.body.appendChild(clone);

    const ctx = GlobalStore.get('playerContext');
    if (ctx && ctx.store) {
        ctx.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: unitA.uid });
        ctx.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _acted: true });
    }

    // 前冲
    requestAnimationFrame(() => {
        clone.style.transform = `translate(${nx * approach}px, ${ny * approach}px)`;
    });

    setTimeout(() => {
        if (getPausedFn && getPausedFn()) { return; }
        clone.style.transition = 'transform 0.2s ease-in';
        clone.style.transform = 'translate(0,0)';
    }, 250);

    setTimeout(() => {
        if (clone.parentNode) clone.remove();
    }, 480);
}