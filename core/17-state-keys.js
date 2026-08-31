// core/17-state-keys.js - 光明顶5v5 单位状态字段分层清单
// V1.2.0 | ~4200 bytes| 2026-08-28 新增精英投影注册表与统一同步函数，收口三处手工列字段
export const VER = 'core/17-state-keys.js V1.2.0';

import { getEliteState } from './18-elite-state.js';

/** 回合级状态：clone 不拷贝，回合开始统一重置 */
export const ROUND_STATE_KEYS = Object.freeze([
    '_acted', '_stunned', '_resting', '_blocked',
    '_emptyColBonus', '_bloodAuraBonus',
    '_holyAtkBonus', '_holyDefBonus', '_fortifyDefBonus'
]);

/** 整场状态：clone 必须拷贝，回合开始不重置 */
export const BATTLE_STATE_KEYS = Object.freeze([
    '_isDead'
]);

/** 精英状态中需投影到 UI state 的字段（只读自 18-elite-state，不写回） */
export const ELITE_STATE_PROJECTION_KEYS = Object.freeze([
    '_flyMode', '_butterflyHost', '_spiderFlying'
]);

/** 顶层回合级字段：clone 不拷贝，回合开始统一重置（已全部迁入 state，保留空表占位） */
export const ROUND_FIELD_KEYS = Object.freeze([
]);

/** 顶层整场字段：clone 必须深拷贝（对象/数组）或浅拷贝（基本类型） */
export const BATTLE_FIELD_KEYS = Object.freeze([
    '_originalPos'
]);

/** 顶层永久字段：浅拷贝，永不重置 */
export const PERMANENT_FIELD_KEYS = Object.freeze([
    'isXiaoZhaoSister', 'isXiaoZhaoBrother',
    '_baseAtk', '_baseDef', '_baseMaxHp', '_initAtk', '_initDef', '_initMaxHp', '_hpDmgRatio'
]);

/** 拷贝整场状态字段（BATTLE_STATE_KEYS）到目标 state；源可为 null */
export function copyBattleStateFields(srcState, dstState) {
    for (const key of BATTLE_STATE_KEYS) {
        if (srcState && srcState[key] !== undefined) dstState[key] = srcState[key];
    }
    return dstState;
}

/** 拷贝全量状态字段（回合级 + 整场）到目标 state；源可为 null */
export function copyAllStateFields(srcState, dstState) {
    for (const key of ROUND_STATE_KEYS) {
        if (srcState && srcState[key] !== undefined) dstState[key] = srcState[key];
    }
    return copyBattleStateFields(srcState, dstState);
}

/** 拷贝精英投影字段到目标 state；数据只读自 18-elite-state */
export function copyEliteProjectionFields(srcUid, dstState) {
    const es = getEliteState(srcUid);
    for (const key of ELITE_STATE_PROJECTION_KEYS) {
        if (es[key] !== undefined) dstState[key] = es[key];
    }
    return dstState;
}

/** UI 镜像统一同步：全量 state 字段 + 精英投影。供 battleStore SYNC 与播放器 rebuild 调用 */
export function syncStateToUI(srcState, srcUid, dstState) {
    copyAllStateFields(srcState, dstState);
    copyEliteProjectionFields(srcUid, dstState);
    return dstState;
}

/** 回合级状态统一重置（查表驱动）；调用方需保证 state 对象已存在 */
const NUMERIC_STATE_KEYS = new Set(['_emptyColBonus', '_bloodAuraBonus', '_holyAtkBonus', '_holyDefBonus', '_fortifyDefBonus']);

export function resetStateFields(state) {
    for (const key of ROUND_STATE_KEYS) {
        if (key === '_phantomTarget') state[key] = null;
        else if (NUMERIC_STATE_KEYS.has(key)) state[key] = 0;
        else state[key] = false;
    }
    return state;
}