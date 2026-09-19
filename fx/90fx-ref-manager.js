// V6.1.0 | ~2600 bytes | 2026-09-09 视觉引用管理器：特效统一走本文件获取 cell / rect，不缓存 DOM 引用
export const VER = 'fx/90fx-ref-manager.js V6.1.0';

import { CAMP_TYPES } from '../infra/56-battle-enums.js';

// 营地 → grid 元素 id
function getGridId(camp) {
    return camp === CAMP_TYPES.ALLY ? 'allyGrid' : 'enemyGrid';
}

// 2026-09-19 联网从机视角修复：查找 cell 改按 dataset.pos 直接匹配，不再背固定顺序表。
// 原先的 [1..9]/[7,8,9,4,5,6,1,2,3] 对照表只对房主视角成立；从机视角下 32-grid-render 会镜像行序
// （明教/六大派行序互换），旧表会把 7 号位指到 1 号位的格子上 → 飞箭/飞撞/击退/换位全飞错格子。
// renderGrid 渲染时已给每个格子盖了 dataset.pos 戳（空位/占用位都有），按戳找天然视角无关。
// 按营地+位置实时查找 cell DOM（不缓存，grid 重建后重新查找）
export function getCellByPos(camp, pos) {
    if (pos == null) return null;
    const grid = document.getElementById(getGridId(camp));
    if (!grid) return null;
    const want = String(pos);
    for (let i = 0; i < grid.children.length; i++) {
        if (String(grid.children[i].dataset.pos) === want) return grid.children[i];
    }
    return null;
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