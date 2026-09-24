// V1.1.0 | ~2300 bytes | 2026-09-23 视图表：妆造字段（uid → { _flash, _renderFlyMode, ... }）与引擎单位账本解耦
// 写：dispatch hook 里 applyActionToView 按 action 类型写入；读：render/fx/player 走 getView
export const VER = 'infra/61-view-sheet.js V1.1.0';

import { STORE_ACTION_TYPES } from './56-battle-enums.js';

// 妆造字段清单：只影响"看起来怎样"，不影响"谁打谁/掉多少血/死没死"
export const VIEW_FIELDS = Object.freeze([
    '_flash',
    '_renderFlyMode',
    '_phantomFlash',
    '_hasXingFen'
]);

const _sheet = new Map();

export function setView(uid, key, value) {
    if (!uid || !VIEW_FIELDS.includes(key)) return;
    let view = _sheet.get(uid);
    if (!view) { view = {}; _sheet.set(uid, view); }
    view[key] = value;
}

export function getView(uid, key) {
    const view = _sheet.get(uid);
    return view ? view[key] : undefined;
}

export function getUnitView(uid) {
    return _sheet.get(uid) || null;
}

export function clearAllView() {
    _sheet.clear();
}

/**
 * dispatch hook：按 action 类型把妆造字段写入视图表。
 * reducer 不再往 units 里写这些字段（units 只装账本），妆造独立存在本表。
 */
export function applyActionToView(action, units) {
    if (!action) return;
    switch (action.type) {
        case STORE_ACTION_TYPES.SET_FLASH:
            setView(action.uid, '_flash', action.flash);
            break;
        case STORE_ACTION_TYPES.CLEAR_UNIT_FLASH:
            setView(action.uid, '_flash', null);
            break;
        case STORE_ACTION_TYPES.CLEAR_ALL_FLASH:
            if (Array.isArray(units)) for (const u of units) setView(u.uid, '_flash', null);
            break;
        case STORE_ACTION_TYPES.SET_VISUAL:
            if (action._phantomFlash !== undefined) setView(action.uid, '_phantomFlash', action._phantomFlash);
            if (action._hasXingFen !== undefined) setView(action.uid, '_hasXingFen', action._hasXingFen);
            if (action._renderFlyMode !== undefined) setView(action.uid, '_renderFlyMode', action._renderFlyMode);
            break;
    }
}