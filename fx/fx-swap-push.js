// fx/fx-swap-push.js - 换位+击退特效（合并自18+19）
export const VER = 'fx/fx-swap-push.js V4.0.0';

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

/**
 * 纯击退滑动动画（后面格子为空）
 * 动画节奏：向后弹出 → 回弹 → 真实移动到目标位置
 * @param {object} unit - 被击退的单位
 * @param {object} c - 播放器上下文（需包含 updateUI 方法和 UI 对象）
 * @param {number} targetPos - 击退目标位置
 */
export async function animatePushBack(unit, c, targetPos) {
    const cell = getCellElement(unit);
    if (!cell) return;

    const oldPos = unit.pos;

    // 阶段一：向后弹出
    cell.style.transition = 'transform 0.3s ease-out';
    cell.style.transform = unit.camp === 'ally' ? 'translateY(20px)' : 'translateY(-20px)';
    await wait(300);

    // 阶段二：回弹归位
    cell.style.transition = 'transform 0.2s ease-in';
    cell.style.transform = 'translate(0,0)';
    await wait(200);

    // 阶段三：真实移动到目标位置
    unit.pos = targetPos;
    c.updateUI(c.UI);

    // 新格子出场动画
    const newCell = getCellElement(unit);
    if (newCell) {
        newCell.style.transition = 'transform 0.15s ease';
        newCell.style.transform = 'scale(0.85)';
        requestAnimationFrame(() => {
            newCell.style.transform = 'scale(1)';
        });
    }
}

/**
 * 击退换位动画（后面有人，旋转挤开版）
 * 阶段一：前排猛退，后排旋转挤开
 * 阶段二：快速闪烁交换
 * 阶段三：落位淡入
 * @param {object} frontUnit - 被击退的前排单位
 * @param {object} rearUnit - 被挤开的后排单位
 * @param {object} c - 播放器上下文
 */
export async function animatePushSwap(frontUnit, rearUnit, c) {
    const cellF = getCellElement(frontUnit);
    const cellR = getCellElement(rearUnit);
    if (!cellF || !cellR) return;

    const posF = frontUnit.pos, posR = rearUnit.pos;
    const rectF = cellF.getBoundingClientRect();
    const rectR = cellR.getBoundingClientRect();
    const dx = rectR.left + rectR.width/2 - (rectF.left + rectF.width/2);
    const dy = rectR.top + rectR.height/2 - (rectF.top + rectF.height/2);

    // 阶段一：前排猛退，后排旋转挤开
    cellF.style.transition = 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    cellF.style.transform = `translate(${dx}px, ${dy}px)`;

    const rotateDir = (frontUnit.camp === 'ally') ? 1 : -1;
    cellR.style.transition = 'transform 0.25s ease-out';
    cellR.style.transform = `translate(${dx * 0.3}px, ${dy * 0.3}px) rotate(${15 * rotateDir}deg)`;
    await wait(250);

    cellR.style.transition = 'transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
    cellR.style.transform = `translate(${-dx * 0.8}px, ${-dy * 0.8}px) rotate(${-10 * rotateDir}deg)`;
    await wait(300);

    // 阶段二：快速闪烁交换
    cellF.style.transition = 'none';
    cellR.style.transition = 'none';
    for (let i = 0; i < 2; i++) {
        cellF.style.visibility = 'hidden';
        cellR.style.visibility = 'hidden';
        await wait(70);
        cellF.style.visibility = 'visible';
        cellR.style.visibility = 'visible';
        await wait(70);
    }

    // 阶段三：落位
    cellF.style.opacity = '0';
    cellR.style.opacity = '0';
    await wait(150);

    // 交换数据
    frontUnit.pos = posR;
    rearUnit.pos = posF;

    // 清理样式
    cellF.style.transition = '';
    cellF.style.transform = '';
    cellF.style.opacity = '1';
    cellF.style.visibility = 'visible';
    cellR.style.transition = '';
    cellR.style.transform = '';
    cellR.style.opacity = '1';
    cellR.style.visibility = 'visible';

    c.updateUI(c.UI);

    // 新格子出场动画
    const newCellF = getCellElement(frontUnit);
    const newCellR = getCellElement(rearUnit);
    if (newCellF) {
        newCellF.style.transition = 'transform 0.2s ease';
        newCellF.style.transform = 'scale(0.8)';
        requestAnimationFrame(() => { newCellF.style.transform = 'scale(1)'; });
    }
    if (newCellR) {
        newCellR.style.transition = 'transform 0.2s ease';
        newCellR.style.transform = 'scale(0.8)';
        requestAnimationFrame(() => { newCellR.style.transform = 'scale(1)'; });
    }
}