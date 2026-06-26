// 18fx-position-swap.js - 光明顶对战 5v5 换位闪烁特效 (实验室节奏加强版)
// 预估行数: 90, 发送时间: 20260619 20:15, 版本: V1.0.1
export const VER = '18fx-position-swap.js V1.0.1';

/**
 * 获取单位对应的格子 DOM 元素
 */
function getCellElement(unit) {
    if (!unit || unit.pos == null) return null;
    const grid = document.getElementById(unit.camp === 'ally' ? 'allyGrid' : 'enemyGrid');
    if (!grid) return null;
    const order = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    const idx = order.indexOf(unit.pos);
    return idx >= 0 ? grid.children[idx] : null;
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * 换位闪烁动画（节奏加强版）
 * 阶段一：快速闪烁 3 次
 * 阶段二：中速位移 2 次，间隔渐长
 * 阶段三：最后一击长定格，淡出后在新位置淡入
 */
export async function animatePositionSwap(unit1, unit2, c) {
    const cell1 = getCellElement(unit1);
    const cell2 = getCellElement(unit2);
    if (!cell1 || !cell2) return;

    const pos1 = unit1.pos, pos2 = unit2.pos;
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

    // 交换数据
    unit1.pos = pos2;
    unit2.pos = pos1;

    // 清理样式并重绘
    cell1.style.transform = '';
    cell2.style.transform = '';
    cell1.style.opacity = '1';
    cell2.style.opacity = '1';
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