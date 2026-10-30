export const VER = 'fx/90fx-ref-manager.js V6.1.1';

// 2026-10-31：getGridId/getCellByPos 下移到 render/32grid-cells（DOM 查询归渲染层）。
// 这里保留 re-export，fx/83、fx/94 等既有调用不用改；player 侧不再需要 import 本文件。
import { getGridId, getCellByPos } from '../render/32grid-cells.js';
export { getCellByPos };

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
    // fallback：用 grid 推算（idx 取该 pos 戳在 DOM 里的真实序号，视角无关）
    const grid = document.getElementById(getGridId(unit.camp));
    if (!grid) return null;
    const gridRect = grid.getBoundingClientRect();
    const want = String(unit.pos);
    let idx = -1;
    for (let i = 0; i < grid.children.length; i++) {
        if (String(grid.children[i].dataset.pos) === want) { idx = i; break; }
    }
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