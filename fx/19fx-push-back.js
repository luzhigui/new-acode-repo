﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// fx/19fx-push-back.js - 光明顶5v5 击退特效
// V5.4.0 | ~5600 bytes| 2026-07-11 支持 skipDataChange 参数
export const VER = 'fx/19fx-push-back.js V5.4.0';

function getCellElement(unit) {
    if (!unit || unit.pos == null) return null;
    const grid = document.getElementById(unit.camp === 'ally' ? 'allyGrid' : 'enemyGrid');
    if (!grid) return null;
    const order = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    const idx = order.indexOf(unit.pos);
    return idx >= 0 ? grid.children[idx] : null;
}
function wait(ms) { return new Promise(r => setTimeout(r, window._fastForwardActive ? 1 : ms)); }

export async function animatePushBack(unit, c, targetPos, options = {}) {
    const { skipDataChange } = options;
    const cell = getCellElement(unit);
    if (!cell) return;

    const oldPos = unit.pos;

    cell.style.transition = 'transform 0.3s ease-out';
    cell.style.transform = unit.camp === 'ally' ? 'translateY(20px)' : 'translateY(-20px)';
    await wait(300);

    cell.style.transition = 'transform 0.2s ease-in';
    cell.style.transform = 'translate(0,0)';
    await wait(200);

    if (!skipDataChange) {
        if (c.store) {
            c.store.dispatch({ type: 'APPLY_EVENTS', events: [
                { eventType: 'pos-change', uid: unit.uid, pos: targetPos }
            ]});
        } else {
            unit.pos = targetPos;
        }
    }
    const ctx = window._getPlayerContext ? window._getPlayerContext() : c;
    if (ctx) ctx.updateUI();

    const newCell = getCellElement(unit);
    if (newCell) {
        newCell.style.transition = 'transform 0.15s ease';
        newCell.style.transform = 'scale(0.85)';
        requestAnimationFrame(() => {
            newCell.style.transform = 'scale(1)';
            // 动画结束后清理，防止残留 transform 导致重叠
            setTimeout(() => {
                if (newCell) newCell.style.transform = '';
            }, 200);
        });
    }
}

export async function animatePushSwap(frontUnit, rearUnit, c) {
    const cellF = getCellElement(frontUnit);
    const cellR = getCellElement(rearUnit);
    if (!cellF || !cellR) return;

    const posF = frontUnit.pos, posR = rearUnit.pos;
    const rectF = cellF.getBoundingClientRect();
    const rectR = cellR.getBoundingClientRect();
    const dx = rectR.left + rectR.width/2 - (rectF.left + rectF.width/2);
    const dy = rectR.top + rectR.height/2 - (rectF.top + rectF.height/2);

    // 被击退者套红色光圈
    cellF.style.boxShadow = '0 0 16px 4px rgba(255, 50, 50, 0.9)';
    cellF.style.border = '2px solid #ff3333';

    // 被挤位者套黄色光圈
    cellR.style.boxShadow = '0 0 16px 4px rgba(255, 215, 0, 0.9)';
    cellR.style.border = '2px solid #ffd700';

    // 停顿让人看清光圈
    await wait(400);

    cellF.style.transition = 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    cellF.style.transform = `translate(${dx}px, ${dy}px)`;

    const rotateDir = (frontUnit.camp === 'ally') ? 1 : -1;
    cellR.style.transition = 'transform 0.35s ease-out';
    cellR.style.transform = `translate(${dx * 0.3}px, ${dy * 0.3}px) rotate(${15 * rotateDir}deg)`;
    await wait(350);

    cellR.style.transition = 'transform 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
    cellR.style.transform = `translate(${-dx * 0.8}px, ${-dy * 0.8}px) rotate(${-10 * rotateDir}deg)`;
    await wait(400);

    // 清除光圈
    cellF.style.boxShadow = '';
    cellF.style.border = '';
    cellR.style.boxShadow = '';
    cellR.style.border = '';

    cellF.style.transition = 'none';
    cellR.style.transition = 'none';
    for (let i = 0; i < 2; i++) {
        cellF.style.visibility = 'hidden';
        cellR.style.visibility = 'hidden';
        await wait(100);
        cellF.style.visibility = 'visible';
        cellR.style.visibility = 'visible';
        await wait(100);
    }

    cellF.style.opacity = '0';
    cellR.style.opacity = '0';
    await wait(200);

    if (c.store) {
        c.store.dispatch({ type: 'APPLY_EVENTS', events: [
            { eventType: 'pos-change', uid: frontUnit.uid, pos: posR },
            { eventType: 'pos-change', uid: rearUnit.uid, pos: posF }
        ]});
    } else {
        frontUnit.pos = posR;
        rearUnit.pos = posF;
    }

    cellF.style.transition = '';
    cellF.style.transform = '';
    cellF.style.opacity = '1';
    cellF.style.visibility = 'visible';
    cellR.style.transition = '';
    cellR.style.transform = '';
    cellR.style.opacity = '1';
    cellR.style.visibility = 'visible';

    c.updateUI(c.UI);

    const newCellF = getCellElement(frontUnit);
    const newCellR = getCellElement(rearUnit);
    if (newCellF) {
        newCellF.style.transition = 'transform 0.2s ease';
        newCellF.style.transform = 'scale(0.8)';
        requestAnimationFrame(() => {
            newCellF.style.transform = 'scale(1)';
            setTimeout(() => { if (newCellF) newCellF.style.transform = ''; }, 250);
        });
    }
    if (newCellR) {
        newCellR.style.transition = 'transform 0.2s ease';
        newCellR.style.transform = 'scale(0.8)';
        requestAnimationFrame(() => {
            newCellR.style.transform = 'scale(1)';
            setTimeout(() => { if (newCellR) newCellR.style.transform = ''; }, 250);
        });
    }
}