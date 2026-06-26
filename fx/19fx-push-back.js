// 19fx-push-back.js - 光明顶对战 5v5 击退特效 (纯击退 + 击退换位)
// 预估行数: 135, 发送时间: 20260619 21:00, 版本: V1.1.0
export const VER = '19fx-push-back.js V1.1.0';

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