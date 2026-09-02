// core/17-state-keys.js - 光明顶5v5 单位状态字段分层清单
// V1.3.0 | 2026-09-02 状态收口：吸收 core/18-elite-state.js 全部字段，17 成为 state 字段唯一来源
export const VER = 'core/17-state-keys.js V1.3.0';

/** 回合级状态：clone 按 copyAllStateFields 拷贝，回合开始统一重置 */
export const ROUND_STATE_KEYS = Object.freeze([
    '_acted', '_stunned', '_resting', '_blocked',
    '_emptyColBonus', '_bloodAuraBonus',
    '_holyAtkBonus', '_holyDefBonus', '_fortifyDefBonus',
    '_xingFenActive', '_isLinkAttack', '_spiderAttacked', '_nineYinFirstDone',
    '_spiderTriggeredThisRound', '_phantomTarget', '_spiderFlying',
    '_fortifyThisRound', '_xiaoZhaoDoubleStriked', '_linkTriggered'
]);

/** 整场状态：clone 必须拷贝，回合开始不重置 */
export const BATTLE_STATE_KEYS = Object.freeze([
    '_isDead',
    '_xuanmingPoison',
    '_kuaiLeStack', '_xingFenCount', '_xingFenPenaltyCount', '_kuLianActive',
    '_masteredRoles', '_permanentBuffs',
    '_butterflyAtk', '_butterflyDef', '_butterflyHp', '_butterflyHpTransfer',
    '_spiderRemaining', '_extinctionUsed', '_linkedPartnerUid',
    '_spiderTriggeredHit', '_spiderTriggered70', '_spiderTriggered40',
    '_spiderTriggeredDeath',
    '_untargetable', '_hotBloodCount', '_doubleStriked', '_zhangSwitched',
    '_carryAtkBonus', '_carryDefBonus', '_carryHpBonus',
    '_butterflyAtkBonus', '_butterflyDefBonus',
    '_fortifyStacks', '_fortifyIncrement', '_fortifyCap', '_dodgeStack',
    '_flyMode', '_butterflyHost',
    '_zhangTauntDone'
]);

/** 整场状态中的数组字段：clone 时深拷贝 */
export const ARRAY_BATTLE_STATE_KEYS = Object.freeze([
    '_kuaiLeStack', '_masteredRoles', '_permanentBuffs'
]);

/** 整场状态中的对象字段：clone 时浅拷贝对象 */
export const OBJECT_BATTLE_STATE_KEYS = Object.freeze([
    '_xuanmingPoison'
]);

/** 回合级状态默认值映射（key → 默认值）；未列出的 key 一律重置为 false */
export const ROUND_STATE_DEFAULTS = Object.freeze({
    '_emptyColBonus': 0, '_bloodAuraBonus': 0,
    '_holyAtkBonus': 0, '_holyDefBonus': 0, '_fortifyDefBonus': 0,
    '_phantomTarget': null
});

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

/** 拷贝整场状态字段（BATTLE_STATE_KEYS）到目标 state；数组深拷贝、对象浅拷贝；源可为 null */
export function copyBattleStateFields(srcState, dstState) {
    for (const key of BATTLE_STATE_KEYS) {
        if (ARRAY_BATTLE_STATE_KEYS.includes(key)) {
            dstState[key] = (srcState && srcState[key]) ? srcState[key].map(x => ({ ...x })) : [];
        } else if (OBJECT_BATTLE_STATE_KEYS.includes(key)) {
            dstState[key] = (srcState && srcState[key]) ? { ...srcState[key] } : null;
        } else if (srcState && srcState[key] !== undefined) {
            dstState[key] = srcState[key];
        }
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

/** UI 镜像统一同步：全量 state 字段。供 battleStore SYNC 与播放器 rebuild 调用 */
export function syncStateToUI(srcState, srcUid, dstState) {
    copyAllStateFields(srcState, dstState);
    return dstState;
}

/** 回合级状态统一重置（查表驱动）；调用方需保证 state 对象已存在 */
export function resetStateFields(state) {
    for (const key of ROUND_STATE_KEYS) {
        if (key in ROUND_STATE_DEFAULTS) {
            state[key] = ROUND_STATE_DEFAULTS[key];
        } else {
            state[key] = false;
        }
    }
    return state;
}