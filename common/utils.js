// common/utils.js - 通用工具函数
export const VER = 'common/utils.js V1.0.0';

export function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
export function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
export function getUnitRow(pos) { return Math.ceil(pos / 3); }
export function getUnitCol(pos) { return (pos - 1) % 3 + 1; }
export function getAdjacentPositions(pos) {
    const row = getUnitRow(pos), col = getUnitCol(pos);
    let adj = [];
    for (let r = row-1; r <= row+1; r++) {
        for (let c = col-1; c <= col+1; c++) {
            if (r === row && c === col) continue;
            if (r >= 1 && r <= 3 && c >= 1 && c <= 3) adj.push((r-1)*3 + c);
        }
    }
    return adj;
}
export function getCellElement(unit) {
    if (!unit || unit.pos == null) return null;
    const gridId = unit.camp === 'ally' ? 'allyGrid' : 'enemyGrid';
    const grid = document.getElementById(gridId);
    if (!grid) return null;
    const order = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    const idx = order.indexOf(unit.pos);
    return grid.children[idx] || null;
}
export function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
export function stripTags(html) { return html.replace(/<[^>]+>/g, ''); }