// V6.1.0 | ~2600 bytes | 2026-09-09 视觉引用管理器：特效统一走本文件获取 cell / rect，不缓存 DOM 引用
export const VER = 'fx/90fx-ref-manager.js V6.1.0';

import { CAMP_TYPES } from '../infra/56-battle-enums.js';

// 营地 → grid 元素 id
function getGridId(camp) {
    return camp === CAMP_TYPES.ALLY ? 'allyGrid' : 'enemyGrid';
}

// 营地 → 显示顺序（enemy 从上往下看是倒序）
function getDisplayOrder(camp) {
    return camp === CAMP_TYPES.ENEMY ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
}

// 按营地+位置实时查找 cell DOM（不缓存，grid 重建后重新查找）
export function getCellByPos(camp, pos) {
    if (pos == null) return null;
    const grid = document.getElementById(getGridId(camp));
    if (!grid) return null;
    const order = getDisplayOrder(camp);
    const idx = order.indexOf(pos);
    return idx >= 0 ? grid.children[idx] : null;
}

// 按 unit 对象实时查找 cell DOM
export function getUnitCell(unit) {
    if (!unit || unit.pos == null) return null;
    return getCellByPos(unit.camp, unit.pos);
}

// 快照 unit 的 cell rect（纯数据，不持有 DOM 引用）
export function snapshotUnitCell(unit) {
    const cell = getUnitCell(unit);
    if (!cell) return null;
    const rect = cell.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom
    };
}

// 快照营地+位置的 cell rect（纯数据）
export function snapshotCellByPos(camp, pos) {
    const cell = getCellByPos(camp, pos);
    if (!cell) return null;
    const rect = cell.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom
    };
}

// 健壮版：当 cell rect 全 0 时，用 grid 整体 rect 按行列推算
export function snapshotUnitCellRobust(unit) {
    const cell = getUnitCell(unit);
    if (!cell) return null;
    const rect = cell.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            width: rect.width,
            height: rect.height,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom
        };
    }
    // fallback：用 grid 推算
    const grid = document.getElementById(getGridId(unit.camp));
    if (!grid) return null;
    const gridRect = grid.getBoundingClientRect();
    const order = getDisplayOrder(unit.camp);
    const idx = order.indexOf(unit.pos);
    if (idx < 0) return null;
    const cellW = gridRect.width / 3;
    const cellH = gridRect.height / 3;
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const left = gridRect.left + col * cellW;
    const top = gridRect.top + row * cellH;
    return {
        x: left + cellW / 2,
        y: top + cellH / 2,
        width: cellW,
        height: cellH,
        left,
        top,
        right: left + cellW,
        bottom: top + cellH
    };
}