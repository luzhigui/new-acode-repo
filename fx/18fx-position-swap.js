﻿﻿﻿﻿﻿﻿﻿// fx/18fx-position-swap.js - 光明顶5v5 换位闪烁特效
// V5.2.1 | ~3828 bytes | 2026-07-05
export const VER = 'fx/18fx-position-swap.js V5.2.1';

/**
 * 获取单位对应的格子 DOM 元素（本地定义，不依赖外部）
 */
function wait(ms) { return new Promise(r => setTimeout(r, window._fastForwardActive ? 1 : ms)); }

function getCellElement(unit) {
    if (!unit || unit.pos == null) return null;
    const grid = document.getElementById(unit.camp === 'ally' ? 'allyGrid' : 'enemyGrid');
    if (!grid) return null;
    const order = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    const idx = order.indexOf(unit.pos);
    return idx >= 0 ? grid.children[idx] : null;
}

function getCellByPos(camp, pos) {
    const grid = document.getElementById(camp === 'ally' ? 'allyGrid' : 'enemyGrid');
    if (!grid) return null;
    const order = camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    const idx = order.indexOf(pos);
    return idx >= 0 ? grid.children[idx] : null;
}

/**
 * 换位闪烁动画（节奏加强版）
 * 阶段一：快速闪烁 3 次
 * 阶段二：中速位移 2 次，间隔渐长
 * 阶段三：最后一击长定格，淡出后在新位置淡入
 */
export async function animatePositionSwap(unit1, unit2, c, options = {}) {
    const { skipDataChange, oldPositions } = options;
    // 如果传入了旧位置，用旧位置找格子；否则用当前 unit.pos
    let cell1, cell2;
    if (oldPositions) {
        cell1 = getCellByPos(unit1.camp, oldPositions[0]);
        cell2 = getCellByPos(unit2.camp, oldPositions[1]);
    } else {
        cell1 = getCellElement(unit1);
        cell2 = getCellElement(unit2);
    }
    if (!cell1 || !cell2) return;

    const pos1 = oldPositions ? oldPositions[0] : unit1.pos;
    const pos2 = oldPositions ? oldPositions[1] : unit2.pos;
    const rect1 = cell1.getBoundingClientRect();
    const rect2 = cell2.getBoundingClientRect();
    const dx = rect2.left + rect2.width/2 - (rect1.left + rect1.width/2);
    const dy = rect2.top + rect2.height/2 - (rect1.top + rect1.height/2);

    // ---- 阶段一：快速闪烁 3 次 ----
    cell1.classList.add('swap-flash');
    cell2.classList.add('swap-flash');
    for (let i = 0; i < 3; i++) {
        cell1.style.visibility = (i % 2 === 0) ? 'visible' : 'hidden';
        cell2.style.visibility = (i % 2 === 0) ? 'hidden' : 'visible';
        await wait(150);
    }
    cell1.style.visibility = 'visible';
    cell2.style.visibility = 'visible';

    // ---- 阶段二：中速位移 2 次，间隔渐长 ----
    for (let i = 0; i < 2; i++) {
        const delay = 250 + i * 250; // 250ms → 500ms
        cell1.style.transform = `translate(${dx}px, ${dy}px)`;
        cell2.style.transform = `translate(${-dx}px, ${-dy}px)`;
        await wait(delay);
        cell1.style.transform = 'translate(0,0)';
        cell2.style.transform = 'translate(0,0)';
        await wait(delay);
    }

    // ---- 阶段三：最后一击，长定格 ----
    cell1.style.transform = `translate(${dx}px, ${dy}px)`;
    cell2.style.transform = `translate(${-dx}px, ${-dy}px)`;

    cell1.classList.remove('swap-flash');
    cell2.classList.remove('swap-flash');
    cell1.classList.add('swap-lock');
    cell2.classList.add('swap-lock');

    await wait(900);

    cell1.classList.remove('swap-lock');
    cell2.classList.remove('swap-lock');

    // 同时隐去
    cell1.style.opacity = '0';
    cell2.style.opacity = '0';
    await wait(350);

    // 交换数据：不直接修改 unit.pos，全部通过 Store dispatch 完成
    if (!skipDataChange) {
        if (c.store) {
            c.store.dispatch({ type: 'APPLY_EVENTS', events: [
                { eventType: 'pos-change', uid: unit1.uid, pos: pos2 },
                { eventType: 'pos-change', uid: unit2.uid, pos: pos1 }
            ]});
        } else {
            // 兜底：没有 Store 时保留直接赋值
            unit1.pos = pos2;
            unit2.pos = pos1;
        }
    }

    // 强制清除所有可能残留的样式
    cell1.style.cssText = '';
    cell2.style.cssText = '';
    cell1.classList.remove('swap-flash', 'swap-lock');
    cell2.classList.remove('swap-flash', 'swap-lock');
    c.updateUI(c.UI);

    // 新格子出场动画
    const newCell1 = getCellElement(unit1);
    const newCell2 = getCellElement(unit2);
    if (newCell1) {
        newCell1.style.opacity = '0'; newCell1.style.transform = 'scale(0.85)';
        requestAnimationFrame(() => {
            newCell1.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            newCell1.style.opacity = '1'; newCell1.style.transform = 'scale(1)';
        });
    }
    if (newCell2) {
        newCell2.style.opacity = '0'; newCell2.style.transform = 'scale(0.85)';
        requestAnimationFrame(() => {
            newCell2.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            newCell2.style.opacity = '1'; newCell2.style.transform = 'scale(1)';
        });
    }
}