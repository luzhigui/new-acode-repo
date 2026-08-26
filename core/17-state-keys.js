// core/17-state-keys.js - 光明顶5v5 单位状态字段分层清单
// V1.0.0 | ~2500 bytes| 2026-08-26 状态位分层：roundState 不拷每回合重置，battleState 必拷全程保留
export const VER = 'core/17-state-keys.js V1.0.0';

/** 回合级状态：clone 不拷贝，回合开始统一重置 */
export const ROUND_STATE_KEYS = Object.freeze([
    '_acted', '_stunned', '_resting', '_blocked',
    '_spiderFlying', '_spiderTriggeredThisRound',
    '_phantomTarget'
]);

/** 整场状态：clone 必须拷贝，回合开始不重置 */
export const BATTLE_STATE_KEYS = Object.freeze([
    '_isDead', '_flyMode', '_butterflyHost',
    '_spiderTriggeredHit', '_spiderTriggered70',
    '_spiderTriggered40', '_spiderTriggeredDeath'
]);

/** 顶层回合级字段：clone 不拷贝，回合开始统一重置 */
export const ROUND_FIELD_KEYS = Object.freeze([
    '_xingFenActive', '_isLinkAttack', '_spiderAttacked',
    '_emptyColBonus', '_bloodAuraBonus',
    '_holyAtkBonus', '_holyDefBonus', '_fortifyDefBonus'
]);

/** 顶层整场字段：clone 必须深拷贝（对象/数组）或浅拷贝（基本类型） */
export const BATTLE_FIELD_KEYS = Object.freeze([
    '_kuaiLeStack', '_xingFenCount', '_xingFenPenaltyCount',
    '_kuLianActive', '_masteredRoles', '_permanentBuffs',
    '_butterflyAtk', '_butterflyDef', '_butterflyHp', '_butterflyHpTransfer',
    '_spiderRemaining', '_nineYinFirstDone', '_extinctionUsed',
    '_fortifyStacks', '_dodgeStack', '_linkedPartnerUid'
]);

/** 顶层永久字段：浅拷贝，永不重置 */
export const PERMANENT_FIELD_KEYS = Object.freeze([
    'isXiaoZhaoSister', 'isXiaoZhaoBrother',
    '_fortifyIncrement', '_fortifyCap',
    '_baseAtk', '_baseDef', '_baseMaxHp', '_initAtk', '_initDef'
]);