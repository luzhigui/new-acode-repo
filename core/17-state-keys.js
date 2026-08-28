// core/17-state-keys.js - 光明顶5v5 单位状态字段分层清单
// V1.1.0 | ~2500 bytes| 2026-08-26 精英机制字段迁出至 18-elite-state，清单只留保留字段
export const VER = 'core/17-state-keys.js V1.1.0';

/** 回合级状态：clone 不拷贝，回合开始统一重置 */
export const ROUND_STATE_KEYS = Object.freeze([
    '_acted', '_stunned', '_resting', '_blocked'
]);

/** 整场状态：clone 必须拷贝，回合开始不重置 */
export const BATTLE_STATE_KEYS = Object.freeze([
    '_isDead'
]);

/** 顶层回合级字段：clone 不拷贝，回合开始统一重置 */
export const ROUND_FIELD_KEYS = Object.freeze([
    '_emptyColBonus', '_bloodAuraBonus',
    '_holyAtkBonus', '_holyDefBonus', '_fortifyDefBonus'
]);

/** 顶层整场字段：clone 必须深拷贝（对象/数组）或浅拷贝（基本类型） */
export const BATTLE_FIELD_KEYS = Object.freeze([
]);

/** 顶层永久字段：浅拷贝，永不重置 */
export const PERMANENT_FIELD_KEYS = Object.freeze([
    'isXiaoZhaoSister', 'isXiaoZhaoBrother',
    '_baseAtk', '_baseDef', '_baseMaxHp', '_initAtk', '_initDef'
]);