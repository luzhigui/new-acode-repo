// fx/82fx-crash-5v5-test.js
// V6.1.0 | 2026-09-13 统一时间层：手写 rAF/setTimeout 换 clock，删 speed/getPausedFn 参数
// V6.1.0 | 2026-09-09 特效层解耦：全部 cell 引用改为 snapshot + clone
export const VER = 'fx/82fx-crash-5v5-test.js V6.1.0';

import { STORE_ACTION_TYPES, CAMP_TYPES, ROLE_TYPES } from '../infra/56-battle-enums.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { markGridShake } from '../render/32-grid-render.js';
import { snapshotUnitCellRobust, getUnitCell } from './90fx-ref-manager.js';
import { clock } from '../infra/52-clock.js';

function finishCrash(clone, unitA) {
    if (clone && clone.parentNode) clone.remove();
    const ctx = GlobalStore.get('playerContext');
    if (ctx && ctx.store) {
        ctx.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _renderFlyMode: null, _acted: true });
        ctx.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: unitA.uid });
    }
    if (ctx) ctx.updateUI();
}

function showCloseRangeFX(unitA, unitD, role) {
    const rectA = snapshotUnitCellRobust(unitA);
    const rectD = snapshotUnitCellRobust(unitD);
    if (!rectA || !rectD) return;
    const ax = rectA.x, ay = rectA.y, bx = rectD.x, by = rectD.y;

    const icon = document.createElement('div');
    icon.setAttribute('data-fx', 'temporary');
    icon.style.cssText = `position:fixed;left:${ax}px;top:${ay}px;font-size:36px;z-index:99999;pointer-events:none;transform:translate(-50%,-50%);`;
    if (role === ROLE_TYPES.WARRIOR) icon.textContent = '⚔️';
    else if (role === ROLE_TYPES.DEFENDER) icon.textContent = '🛡️';
    else if (role === ROLE_TYPES.FLYER) icon.textContent = '🦅';
    document.body.appendChild(icon);

    clock.animate(800, (p) => {
        icon.style.left = (ax + (bx - ax) * p) + 'px';
        icon.style.top = (ay + (by - ay) * p) + 'px';
        if (p >= 1) {
            clock.wait(800).then(() => {
                icon.style.transition = 'opacity 0.8s ease-out';
                icon.style.opacity = '0';
                clock.wait(800).then(() => { if (icon.parentNode) icon.remove(); });
            });
        }
    });
}

export function showMeleeCrash(unitA, unitD, onCrash) {
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
        showCloseRangeFX(unitA, unitD, unitA.role);
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
        background: #1e6bb8;
        border: 3px solid #0d47a1;
        border-radius: 5px;
        box-sizing: border-box;
        pointer-events: none;
    `;
    clone.querySelectorAll('*').forEach(el => { el.style.color = '#ffffff'; });
    document.body.appendChild(clone);

    // 设置 _renderFlyMode，renderGrid 自动处理原格子（fly=透明，ghost=虚影）
    if (ctx && ctx.store) {
        ctx.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _acted: true, _renderFlyMode: flyMode });
    }

    const chargeDur = 800;
    const crashDur = 900;
    const returnDur = 800;

    // ghost 模式蓄力缩放 clone
    const startFly = () => {
        clock.animate(crashDur, (p) => {
            const ease = 1 - Math.pow(1 - p, 3);
            const flown = flyDist * ease;
            clone.style.left = (rectA.left + nx * flown) + 'px';
            clone.style.top = (rectA.top + ny * flown) + 'px';
            if (p >= 1) {
                if (onCrash) onCrash();
                const crashX = rectA.left + nx * flyDist, crashY = rectA.top + ny * flyDist;
                clock.animate(returnDur, (p2) => {
                    const ease2 = 1 - Math.pow(1 - p2, 4);
                    clone.style.left = (crashX + (rectA.left - crashX) * ease2) + 'px';
                    clone.style.top = (crashY + (rectA.top - crashY) * ease2) + 'px';
                    if (p2 >= 1) finishCrash(clone, unitA);
                });
            }
        });
    };

    if (flyMode === 'ghost') {
        clone.style.transition = 'transform 0.3s ease-out';
        clone.style.transform = 'scale(1.15)';
        clock.animate(chargeDur, (p) => {
            if (p >= 1) {
                clone.style.transition = '';
                clone.style.transform = 'none';
                startFly();
            }
        });
    } else {
        startFly();
    }
}

export function showMeleeDodge(unitA, unitD) {
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
        background: #1e6bb8;
        border: 3px solid #0d47a1;
        border-radius: 5px;
        box-sizing: border-box;
        pointer-events: none;
    `;
    clone.querySelectorAll('*').forEach(el => { el.style.color = '#ffffff'; });
    document.body.appendChild(clone);

    const ctx = GlobalStore.get('playerContext');
    if (ctx && ctx.store) {
        ctx.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _acted: true });
    }

    const flyDur = 350;
    const returnDur = 500;
    let blocked = false;

    clock.animate(flyDur, (p) => {
        const flown = approachDist * (1 - Math.pow(1 - p, 3));
        clone.style.left = (rectA.left + nx * flown) + 'px';
        clone.style.top = (rectA.top + ny * flown) + 'px';
        if (!blocked && p >= 0.85) {
            blocked = true;
            clone.style.transition = 'transform 0.1s ease';
            clone.style.transform = 'scale(0.9)';
            clock.wait(100).then(() => { clone.style.transform = 'scale(1)'; });
        }
        if (p >= 1) {
            const contactX = rectA.left + nx * approachDist;
            const contactY = rectA.top + ny * approachDist;
            clock.animate(returnDur, (p2) => {
                const ease2 = 1 - Math.pow(1 - p2, 2);
                const perpX = -ny, perpY = nx;
                const offsetMag = Math.sin(p2 * Math.PI) * 35;
                const retreatDist = 50 * ease2;
                clone.style.left = (contactX - nx * retreatDist + perpX * offsetMag) + 'px';
                clone.style.top = (contactY - ny * retreatDist + perpY * offsetMag) + 'px';
                clone.style.transform = `rotate(${8 * (1 - p2)}deg) scale(1.05)`;
                clone.style.opacity = 0.6 + 0.4 * (1 - p2);
                if (p2 >= 1) finishCrash(clone, unitA);
            });
        }
    });
}

export function showMeleeMiss(unitA, unitD) {
    const rectA = snapshotUnitCellRobust(unitA);
    const rectD = snapshotUnitCellRobust(unitD);
    if (!rectA || !rectD) return;
    const cellA = getUnitCell(unitA);
    if (!cellA) return;

    const dx = rectD.x - rectA.x, dy = rectD.y - rectA.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;
    const nx = dx / dist, ny = dy / dist;
    const approach = dist - rectD.width * 0.5;

    // 未命中配色：半透明灰 + 虚线边框，和命中(蓝)/闪避(金)区分，表达"扑空"
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
        opacity: 0.75;
        visibility: visible;
        display: flex;
        transform: none;
        background: #cfcfcf;
        border: 2px dashed #888;
        border-radius: 5px;
        box-sizing: border-box;
        pointer-events: none;
    `;
    document.body.appendChild(clone);

    // 原格进入扑空态：隐藏原格，避免"人变两个"
    const flyMode = GlobalStore.get('crashMode') || 'fly';
    const ctx = GlobalStore.get('playerContext');
    if (ctx && ctx.store) {
        ctx.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _acted: true, _renderFlyMode: flyMode });
    }

    const flyDur = 700;
    const returnDur = 500;

    clock.animate(flyDur, (p) => {
        const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        clone.style.transform = `translate(${nx * approach * ease}px, ${ny * approach * ease}px)`;
        if (p >= 1) {
            clock.animate(returnDur, (p2) => {
                clone.style.transform = `translate(${nx * approach * (1 - p2)}px, ${ny * approach * (1 - p2)}px)`;
                if (p2 >= 1) {
                    if (clone.parentNode) clone.remove();
                    if (ctx && ctx.store) {
                        ctx.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _renderFlyMode: null });
                    }
                }
            });
        }
    });
}