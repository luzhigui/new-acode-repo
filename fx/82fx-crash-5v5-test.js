﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// fx/82fx-crash-5v5-test.js - 光明顶5v5 飞撞与格挡特效
// V5.5.0 | 2026-07-12 修复飞走模式原地残留蓝色格子（清除_flash标记）
export const VER = 'fx/82fx-crash-5v5-test.js V5.5.0';

import { applyImpactShrink } from './80fx-common-5v5-test.js';
import { STORE_ACTION_TYPES, CAMP_TYPES, ROLE_TYPES } from '../infra/56-battle-enums.js';
import { getEliteState, setEliteState } from '../core/18-elite-state.js';

function clearCrashStyles(cell) {
    if (!cell) return;
    cell.style.opacity = '1';
    cell.style.visibility = 'visible';
    cell.style.background = '';
    cell.style.border = '';
    cell.style.transform = '';
    cell.style.boxShadow = '';
    cell.style.transition = '';
    cell.style.filter = '';
    cell.removeAttribute('data-flash');
    cell.classList.remove('ready', 'acted');
}

function finishCrash(clone, cell, unitA, UI) {
    if (clone && clone.parentNode) clone.remove();
    const ctx = GlobalStore.get('playerContext');
    if (ctx && ctx.store) {
        // ★ 飞回结束后，必须彻底清除飞走状态和蓝色 flash，避免再次出现原地蓝色格子
        ctx.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _flyMode: null, _acted: true });
        ctx.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: unitA.uid });
        setEliteState(unitA.uid, { _flyMode: null });
    } else {
        setEliteState(unitA.uid, { _flyMode: null });
    }
    if (cell) clearCrashStyles(cell);
    if (ctx) ctx.updateUI();
}

function showCloseRangeFX(unitA, unitD, role, getPausedFn) {
    let gridAId = unitA.camp===CAMP_TYPES.ALLY?'allyGrid':'enemyGrid', gridDId = unitD.camp===CAMP_TYPES.ALLY?'allyGrid':'enemyGrid';
    let gridA = document.getElementById(gridAId), gridD = document.getElementById(gridDId);
    let orderA = unitA.camp===CAMP_TYPES.ENEMY?[7,8,9,4,5,6,1,2,3]:[1,2,3,4,5,6,7,8,9], orderD = unitD.camp===CAMP_TYPES.ENEMY?[7,8,9,4,5,6,1,2,3]:[1,2,3,4,5,6,7,8,9];
    let idxA = orderA.indexOf(unitA.pos), idxD = orderD.indexOf(unitD.pos);
    if(idxA<0||idxD<0||!gridA.children[idxA]||!gridD.children[idxD]) return;
    let cellA = gridA.children[idxA], cellB = gridD.children[idxD];
    let rA = cellA.getBoundingClientRect(), rB = cellB.getBoundingClientRect();
    let ax = rA.left + rA.width/2, ay = rA.top + rA.height/2, bx = rB.left + rB.width/2, by = rB.top + rB.height/2;
    let ndx = bx - ax, ndy = by - ay, ndist = Math.sqrt(ndx*ndx + ndy*ndy);
    let nnx = ndist > 0 ? ndx / ndist : 0, nny = ndist > 0 ? ndy / ndist : 0;
    cellA.style.transition = 'transform 0.6s ease-out'; cellA.style.transform = 'scale(1.2)';
    setTimeout(() => { cellA.style.transform = 'scale(1)'; let icon = document.createElement('div'); icon.setAttribute('data-fx', 'temporary'); icon.style.position = 'fixed'; icon.style.left = ax+'px'; icon.style.top = ay+'px'; icon.style.fontSize = '36px'; icon.style.zIndex = '99999'; icon.style.pointerEvents = 'none'; icon.style.transform = 'translate(-50%,-50%)'; if (role === ROLE_TYPES.WARRIOR) icon.textContent = '⚔️'; else if (role === ROLE_TYPES.DEFENDER) icon.textContent = '🛡️'; else if (role === ROLE_TYPES.FLYER) icon.textContent = '🦅'; document.body.appendChild(icon);
        let iconStart = null;
        function flyIcon(ts) {
            if (getPausedFn && getPausedFn()) { requestAnimationFrame(flyIcon); return; }
            if (!iconStart) iconStart = ts; let p = Math.min(1, (ts - iconStart) / 800); let x = ax + (bx - ax) * p, y = ay + (by - ay) * p; icon.style.left = x + 'px'; icon.style.top = y + 'px'; if (p < 1) { requestAnimationFrame(flyIcon); } else {
            if (unitD) { unitD._shaking = true; unitD._shakeNx = nnx; unitD._shakeNy = nny;
                if (cellB) { applyImpactShrink(cellB, 600, () => false); }
                let c = window._getPlayerContext ? window._getPlayerContext() : null;
                if (c) { c.updateUI(c.UI); setTimeout(() => { unitD._shaking = false; unitD._shakeNx = 0; unitD._shakeNy = 0; c.updateUI(c.UI); }, 500); }
            }
            setTimeout(() => { icon.style.transition = 'opacity 0.8s ease-out'; icon.style.opacity = '0'; setTimeout(() => { if (icon.parentNode) icon.remove(); }, 800); }, 800);
        } }
        requestAnimationFrame(flyIcon);
    }, 600);
}

export function showMeleeCrash(unitA, unitD, speed, getPausedFn, onCrash) {
    let gridAId = unitA.camp === CAMP_TYPES.ALLY ? 'allyGrid' : 'enemyGrid';
    let gridDId = unitD.camp === CAMP_TYPES.ALLY ? 'allyGrid' : 'enemyGrid';
    let gridA = document.getElementById(gridAId);
    let gridD = document.getElementById(gridDId);
    
    let orderA = unitA.camp === CAMP_TYPES.ENEMY ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    let orderD = unitD.camp === CAMP_TYPES.ENEMY ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    
    let idxA = orderA.indexOf(unitA.pos);
    let idxD = orderD.indexOf(unitD.pos);
    
    if (idxA < 0 || idxD < 0 || !gridA.children[idxA] || !gridD.children[idxD]) return;
    
    let cellA = gridA.children[idxA];
    let cellB = gridD.children[idxD];

    if (cellA) {
        cellA.setAttribute('data-flash', 'attack');
        cellA.style.transition = 'none';
    }
    
    let rA = cellA.getBoundingClientRect();
    let rB = cellB.getBoundingClientRect();
    
    let sx = rA.left + rA.width / 2;
    let sy = rA.top + rA.height / 2;
    let ex = rB.left + rB.width / 2;
    let ey = rB.top + rB.height / 2;
    
    let dx = ex - sx;
    let dy = ey - sy;
    let dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < 1) return;

    let aPos = unitA.pos, dPos = unitD.pos;
    let isClose = (aPos === 1 && dPos === 1) || (aPos === 2 && dPos === 2) || (aPos === 3 && dPos === 3) ||
                  (aPos === 1 && dPos === 2) || (aPos === 2 && dPos === 1) || (aPos === 2 && dPos === 3) || (aPos === 3 && dPos === 2);
    
    // 近距离走简化表现、远距离才做完整飞行碰撞：近距离飞行距离太短，完整飞行动画无意义
    if (isClose) {
        showCloseRangeFX(unitA, unitD, unitA.role, getPausedFn);
        if (onCrash) onCrash();
        return;
    }

    let nx = dx / dist;
    let ny = dy / dist;
    let flyDist = dist - rB.width * 0.28;
    let flyMode = GlobalStore.get('crashMode') || 'ghost';

    const ctx = GlobalStore.get('playerContext');
    if (ctx && ctx.store) {
        ctx.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _flyMode: flyMode });
    }
    let UI = window._getPlayerContext ? window._getPlayerContext().UI : null;

    // ★ 飞走模式关键修复：必须在 updateUI 触发重绘之前完成三件事：
    // 1) 清除攻击闪示（CLEAR_UNIT_FLASH），避免渲染出蓝色格子；
    // 2) 同步 eliteState 的 _flyMode，因为 renderGrid 只读 getEliteState()._flyMode，不读 store state；
    // 3) 写入 store 的 _flyMode 和 _acted，供后续 finishCrash 恢复时使用。
    // ghost 模式要保留蓝色虚影，所以不清 flash，但同样需要同步 eliteState，否则 renderGrid 不认虚影。
    const ctxPre = window._getPlayerContext ? window._getPlayerContext() : null;
    if (ctxPre && ctxPre.store) {
        if (flyMode === 'fly') {
            ctxPre.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: unitA.uid });
            setEliteState(unitA.uid, { _flyMode: flyMode });
            ctxPre.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _acted: true, _flyMode: flyMode });
        } else if (flyMode === 'ghost') {
            // ghost 保持 attack flash，同时同步 eliteState，让 renderGrid 进入 ghost 分支（半透明虚影）
            setEliteState(unitA.uid, { _flyMode: flyMode });
            ctxPre.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _acted: true });
        }
    }

    // 现在才触发重绘，此时 store 与 eliteState 均已就绪，渲染结果正确
    if (UI) {
        let uiUnitA = UI.allyTeam.concat(UI.enemyTeam).find(u => u.uid === unitA.uid);
        if (uiUnitA) uiUnitA.state._acted = true;
        let c = window._getPlayerContext();
        c.updateUI(UI);
    }

    let savedLeft = rA.left, savedTop = rA.top, savedWidth = rA.width, savedHeight = rA.height;

    let clone = cellA.cloneNode(true);
    clone.setAttribute('data-fx', 'temporary');
    clone.classList.remove('ready', 'acted');
    clone.style.cssText = `
        position: fixed;
        left: ${savedLeft}px;
        top: ${savedTop}px;
        width: ${savedWidth}px;
        height: ${savedHeight}px;
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
    `;
    clone.classList.add('crash-clone');
    document.body.appendChild(clone);

    if (flyMode === 'ghost') {
        // ghost 模式原格子保留虚影样式，flash 已在上面通过 store 设置，这里只做 DOM 额外美化
        cellA.classList.remove('ready', 'acted');
        cellA.style.opacity = '0.5';
        cellA.style.background = 'rgba(30,100,255,0.28)';
        cellA.style.border = '2px solid rgba(100,150,255,0.6)';
        cellA.style.boxShadow = '0 0 12px rgba(100,150,255,0.5)';
        // 不再重复 dispatch，避免覆盖已同步的状态
    } else {
        // fly 模式：原格子已在重绘后进入透明/隐藏分支，无需再操作旧 cellA（旧引用已被重建丢弃）
        // 删除原 cellA.style.opacity = '0' 等无用代码
    }

    let chargeDur = 800 * (speed / 1000);
    let crashDur = 900 * (speed / 1000);
    let returnDur = 800 * (speed / 1000);

    if (flyMode === 'ghost') {
        cellA.classList.remove('ready', 'acted');
        cellA.style.transition = 'transform 0.3s ease-out';
        cellA.style.transform = 'scale(1.15)';
    }

    let startC = null;
    function phaseCharge(ts) {
        if (getPausedFn && getPausedFn()) { requestAnimationFrame(phaseCharge); return; }
        if (!startC) startC = ts;
        let p = Math.min(1, (ts - startC) / chargeDur);
        if (p < 1) { requestAnimationFrame(phaseCharge); }
        else {
            if (flyMode === 'ghost') {
                cellA.style.transform = 'scale(1)'; cellA.style.transition = '';
            }
            let start1 = null;
            function phase1(ts1) {
                if (getPausedFn && getPausedFn()) { requestAnimationFrame(phase1); return; }
                if (!start1) start1 = ts1;
                let p1 = Math.min(1, (ts1 - start1) / crashDur);
                let ease = 1 - Math.pow(1 - p1, 3);
                let flown = flyDist * ease;
                clone.style.left = (savedLeft + nx * flown) + 'px';
                clone.style.top = (savedTop + ny * flown) + 'px';
                if (p1 < 1) { requestAnimationFrame(phase1); }
                else {
                    if (onCrash) onCrash();
                    applyImpactShrink(cellB, 400, getPausedFn);
                    let crashX = savedLeft + nx * flyDist, crashY = savedTop + ny * flyDist;
                    let start3 = null;
                    function phase3(ts3) {
                        if (getPausedFn && getPausedFn()) { requestAnimationFrame(phase3); return; }
                        if (!start3) start3 = ts3;
                        let p3 = Math.min(1, (ts3 - start3) / returnDur);
                        let ease3 = 1 - Math.pow(1 - p3, 4);
                        clone.style.left = (crashX + (savedLeft - crashX) * ease3) + 'px';
                        clone.style.top = (crashY + (savedTop - crashY) * ease3) + 'px';
                        if (p3 < 1) { requestAnimationFrame(phase3); }
                        else {
                            finishCrash(clone, cellA, unitA, UI);
                        }
                    }
                    requestAnimationFrame(phase3);
                }
            }
            requestAnimationFrame(phase1);
        }
    }
    if (flyMode === 'ghost') {
        requestAnimationFrame(phaseCharge);
    } else {
        // fly 模式跳过 cellA 蓄力，直接进入飞行阶段
        let start1 = null;
        function phase1(ts1) {
            if (getPausedFn && getPausedFn()) { requestAnimationFrame(phase1); return; }
            if (!start1) start1 = ts1;
            let p1 = Math.min(1, (ts1 - start1) / crashDur);
            let ease = 1 - Math.pow(1 - p1, 3);
            let flown = flyDist * ease;
            clone.style.left = (savedLeft + nx * flown) + 'px';
            clone.style.top = (savedTop + ny * flown) + 'px';
            if (p1 < 1) { requestAnimationFrame(phase1); }
            else {
                applyImpactShrink(cellB, 400, getPausedFn);
                if (onCrash) onCrash();
                let crashX = savedLeft + nx * flyDist, crashY = savedTop + ny * flyDist;
                let start3 = null;
                function phase3(ts3) {
                    if (getPausedFn && getPausedFn()) { requestAnimationFrame(phase3); return; }
                    if (!start3) start3 = ts3;
                    let p3 = Math.min(1, (ts3 - start3) / returnDur);
                    let ease3 = 1 - Math.pow(1 - p3, 4);
                    clone.style.left = (crashX + (savedLeft - crashX) * ease3) + 'px';
                    clone.style.top = (crashY + (savedTop - crashY) * ease3) + 'px';
                    if (p3 < 1) { requestAnimationFrame(phase3); }
                    else {
                        finishCrash(clone, cellA, unitA, UI);
                    }
                }
                requestAnimationFrame(phase3);
            }
        }
        requestAnimationFrame(phase1);
    }
}

export function showMeleeDodge(unitA, unitD, speed, getPausedFn) {
    let gridAId = unitA.camp === CAMP_TYPES.ALLY ? 'allyGrid' : 'enemyGrid';
    let gridDId = unitD.camp === CAMP_TYPES.ALLY ? 'allyGrid' : 'enemyGrid';
    let gridA = document.getElementById(gridAId);
    let gridD = document.getElementById(gridDId);
    
    let orderA = unitA.camp === CAMP_TYPES.ENEMY ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    let orderD = unitD.camp === CAMP_TYPES.ENEMY ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    
    let idxA = orderA.indexOf(unitA.pos);
    let idxD = orderD.indexOf(unitD.pos);
    
    if (idxA < 0 || idxD < 0 || !gridA.children[idxA] || !gridD.children[idxD]) return;
    
    let cellA = gridA.children[idxA];
    let cellB = gridD.children[idxD];

    if (cellA) {
        cellA.setAttribute('data-flash', 'attack');
        cellA.style.transition = 'none';
    }
    
    let rA = cellA.getBoundingClientRect();
    let rB = cellB.getBoundingClientRect();
    
    let sx = rA.left + rA.width / 2;
    let sy = rA.top + rA.height / 2;
    let ex = rB.left + rB.width / 2;
    let ey = rB.top + rB.height / 2;
    
    let dx = ex - sx;
    let dy = ey - sy;
    let dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < 1) return;
    
    let nx = dx / dist;
    let ny = dy / dist;
    let approachDist = dist - rB.width * 0.35;

    const origOpacity = cellA.style.opacity;
    const origVisibility = cellA.style.visibility;
    const origBackground = cellA.style.background;
    const origBorder = cellA.style.border;

    let startX = rA.left;
    let startY = rA.top;

    let clone = cellA.cloneNode(true);
    clone.classList.remove('ready', 'acted');
    clone.style.position = 'fixed';
    clone.style.left = rA.left + 'px';
    clone.style.top = rA.top + 'px';
    clone.style.width = rA.width + 'px';
    clone.style.height = rA.height + 'px';
    clone.style.zIndex = '99999';
    clone.style.margin = '0';
    clone.style.transition = 'none';
    clone.style.opacity = '1';
    clone.classList.add('crash-clone');
    document.body.appendChild(clone);

    cellA.style.display = 'none';
    cellA.removeAttribute('data-flash');
    const ctxD = window._getPlayerContext ? window._getPlayerContext() : null;
    if (ctxD && ctxD.store) {
        ctxD.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: unitA.uid });
        ctxD.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _acted: true });
    }
    cellA.classList.remove('ready');

    let flyDur = 350 * (speed / 1000);
    let start1 = null;
    let blocked = false;
    
    function phaseFly(ts) {
        if (getPausedFn && getPausedFn()) { requestAnimationFrame(phaseFly); return; }
        if (!start1) start1 = ts;
        let p = Math.min(1, (ts - start1) / flyDur);
        let flown = approachDist * (1 - Math.pow(1 - p, 3));
        
        clone.style.left = (startX + nx * flown) + 'px';
        clone.style.top = (startY + ny * flown) + 'px';
        
        if (!blocked && p >= 0.85) {
            blocked = true;
            
            cellB.style.transition = 'transform 0.15s ease-out';
            cellB.style.transform = `translate(${-nx * 14}px, ${-ny * 14}px) scale(1.25)`;
            
            clone.style.transition = 'transform 0.1s ease';
            clone.style.transform = 'scale(0.9)';
            setTimeout(() => {
                clone.setAttribute('data-fx', 'temporary');
                clone.style.transform = 'scale(1)';
            }, 100);
            
            setTimeout(() => {
                cellB.style.transition = 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                cellB.style.transform = 'translate(0,0) scale(1)';
                
                let contactX = startX + nx * approachDist;
                let contactY = startY + ny * approachDist;
                let returnDur = 500 * (speed / 1000);
                let start2 = null;
                
                function phaseReturn(ts2) {
                    if (getPausedFn && getPausedFn()) { requestAnimationFrame(phaseReturn); return; }
                    if (!start2) start2 = ts2;
                    let p2 = Math.min(1, (ts2 - start2) / returnDur);
                    let ease2 = 1 - Math.pow(1 - p2, 2);
                    
                    let perpX = -ny;
                    let perpY = nx;
                    let offsetMag = Math.sin(p2 * Math.PI) * 35;
                    let retreatDist = 50 * ease2;
                    
                    let curX = contactX - nx * retreatDist + perpX * offsetMag;
                    let curY = contactY - ny * retreatDist + perpY * offsetMag;
                    
                    clone.style.left = curX + 'px';
                    clone.style.top = curY + 'px';
                    clone.style.transform = `rotate(${8 * (1 - p2)}deg) scale(1.05)`;
                    clone.style.opacity = 0.6 + 0.4 * (1 - p2);
                    
                    if (p2 < 1) {
                        requestAnimationFrame(phaseReturn);
                    } else {
                        finishCrash(clone, cellA, unitA, null);
                        if (cellB) cellB.style.transform = '';
                    }
                }
                requestAnimationFrame(phaseReturn);
            }, 200);
        }
        if (p < 1 && !blocked) requestAnimationFrame(phaseFly);
    }
    requestAnimationFrame(phaseFly);
}

export function showMeleeMiss(unitA, unitD, speed, getPausedFn) {
    let gridAId = unitA.camp===CAMP_TYPES.ALLY?'allyGrid':'enemyGrid', gridDId = unitD.camp===CAMP_TYPES.ALLY?'allyGrid':'enemyGrid';
    let gridA = document.getElementById(gridAId), gridD = document.getElementById(gridDId);
    let orderA = unitA.camp===CAMP_TYPES.ENEMY?[7,8,9,4,5,6,1,2,3]:[1,2,3,4,5,6,7,8,9], orderD = unitD.camp===CAMP_TYPES.ENEMY?[7,8,9,4,5,6,1,2,3]:[1,2,3,4,5,6,7,8,9];
    let idxA = orderA.indexOf(unitA.pos), idxD = orderD.indexOf(unitD.pos);
    if(idxA<0||idxD<0||!gridA.children[idxA]||!gridD.children[idxD]) return;
    let cellA = gridA.children[idxA], cellB = gridD.children[idxD];
    let rA = cellA.getBoundingClientRect(), rB = cellB.getBoundingClientRect();
    let savedLeft = rA.left, savedTop = rA.top, savedWidth = rA.width, savedHeight = rA.height;
    let dx = rB.left+rB.width/2 - (savedLeft+rA.width/2);
    let dy = rB.top+rB.height/2 - (savedTop+rA.height/2);
    let dist = Math.sqrt(dx*dx+dy*dy); if(dist<1) return;
    let nx=dx/dist, ny=dy/dist;

    let clone = cellA.cloneNode(true);
    clone.setAttribute('data-fx', 'temporary');
    clone.classList.remove('ready', 'acted');
    clone.style.cssText = `
        position: fixed;
        left: ${savedLeft}px;
        top: ${savedTop}px;
        width: ${savedWidth}px;
        height: ${savedHeight}px;
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
    `;
    clone.classList.add('crash-clone');
    document.body.appendChild(clone);

    cellA.style.display = 'none';
    cellA.removeAttribute('data-flash');
    const ctxM = window._getPlayerContext ? window._getPlayerContext() : null;
    if (ctxM && ctxM.store) {
        ctxM.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: unitA.uid });
        ctxM.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _acted: true });
    }
    cellA.classList.remove('ready');

    let flyDur = 800 * (speed/1000); let start1 = null;
    function phaseFly(ts) { if (getPausedFn && getPausedFn()) { requestAnimationFrame(phaseFly); return; } if (!start1) start1 = ts; let p = Math.min(1, (ts - start1) / flyDur); let ease = 1 - Math.pow(1-p, 3); let flown = (dist - rB.width * 0.2) * ease; clone.style.left = (savedLeft + nx * flown) + 'px'; clone.style.top = (savedTop + ny * flown) + 'px'; if (p < 1) { requestAnimationFrame(phaseFly); } else {
        let returnDur = 600 * (speed/1000); let start2 = null;
        function phaseReturn(ts2) { if (getPausedFn && getPausedFn()) { requestAnimationFrame(phaseReturn); return; } if (!start2) start2 = ts2; let p2 = Math.min(1, (ts2 - start2) / returnDur); let ease2 = 1 - Math.pow(1 - p2, 2); clone.style.left = (savedLeft + nx * (dist - rB.width * 0.2) * (1 - ease2)) + 'px'; clone.style.top = (savedTop + ny * (dist - rB.width * 0.2) * (1 - ease2)) + 'px'; if (p2 < 1) { requestAnimationFrame(phaseReturn); } else { finishCrash(clone, cellA, unitA, null); } }
        requestAnimationFrame(phaseReturn);
    } }
    requestAnimationFrame(phaseFly);
}