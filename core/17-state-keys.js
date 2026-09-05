// V2.0.0 | ~7800 bytes | 2026-09-04 state schema 化：从 key 清单升级为带类型/默认值/生命周期的 schema
export const VER = 'core/17-state-keys.js V2.0.0';

/** 字段类型：决定 clone 时的拷贝方式 */
export const STATE_FIELD_TYPES = Object.freeze({
    BOOLEAN: 'boolean',
    NUMBER: 'number',
    STRING: 'string',
    ARRAY: 'array',
    OBJECT: 'object',
});

// 回合级状态：回合开始统一重置为 default
export const ROUND_STATE_SCHEMA = Object.freeze({
    _acted:                  { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _stunned:                { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _resting:                { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _blocked:                { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _emptyColBonus:          { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _bloodAuraBonus:         { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _holyAtkBonus:           { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _holyDefBonus:           { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _fortifyDefBonus:        { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _xingFenActive:          { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _isLinkAttack:           { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _spiderAttacked:         { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _nineYinFirstDone:       { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _spiderTriggeredThisRound: { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _phantomTarget:          { type: STATE_FIELD_TYPES.STRING,  default: null },
    _spiderFlying:           { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _fortifyThisRound:       { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _xiaoZhaoDoubleStriked:  { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _linkTriggered:          { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
});

// 整场状态：跨回合持续，不重置
export const BATTLE_STATE_SCHEMA = Object.freeze({
    _isDead:                 { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _xuanmingPoison:         { type: STATE_FIELD_TYPES.OBJECT,  default: null },
    _kuaiLeStack:            { type: STATE_FIELD_TYPES.ARRAY,   default: [] },
    _xingFenCount:           { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _xingFenPenaltyCount:    { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _kuLianActive:           { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _masteredRoles:          { type: STATE_FIELD_TYPES.ARRAY,   default: [] },
    _permanentBuffs:         { type: STATE_FIELD_TYPES.ARRAY,   default: [] },
    _butterflyAtk:           { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _butterflyDef:           { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _butterflyHp:            { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _butterflyHpTransfer:    { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _spiderRemaining:        { type: STATE_FIELD_TYPES.NUMBER,  default: 3 },
    _extinctionUsed:         { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _linkedPartnerUid:       { type: STATE_FIELD_TYPES.STRING,  default: null },
    _spiderTriggeredHit:     { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _spiderTriggered70:      { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _spiderTriggered40:      { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _spiderTriggeredDeath:   { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _untargetable:           { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _hotBloodCount:          { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _doubleStriked:          { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _zhangSwitched:          { type: STATE_FIELD_TYPES.BOOLEAN, default: false },
    _carryAtkBonus:          { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _carryDefBonus:          { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _carryHpBonus:           { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _butterflyAtkBonus:      { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _butterflyDefBonus:      { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _fortifyStacks:          { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _fortifyIncrement:       { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _fortifyCap:             { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _dodgeStack:             { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _flyMode:                { type: STATE_FIELD_TYPES.STRING,  default: null },
    _butterflyHost:          { type: STATE_FIELD_TYPES.STRING,  default: null },
    _zhangTauntDone:         { type: STATE_FIELD_TYPES.BOOLEAN, default: false },

    // 原顶层永久字段，迁入 state
    _baseAtk:                { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _baseDef:                { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _baseMaxHp:              { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _initAtk:                { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _initDef:                { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _initMaxHp:              { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _hpDmgRatio:             { type: STATE_FIELD_TYPES.NUMBER,  default: 0 },
    _originalPos:            { type: STATE_FIELD_TYPES.NUMBER,  default: -1 },
});

/** 保留旧导出名以兼容现有代码：合并 key 清单 */
export const ROUND_STATE_KEYS = Object.freeze(Object.keys(ROUND_STATE_SCHEMA));
export const BATTLE_STATE_KEYS = Object.freeze(Object.keys(BATTLE_STATE_SCHEMA));

/** 旧默认值映射（兼容用，从 schema 派生） */
export const ROUND_STATE_DEFAULTS = Object.freeze(
    Object.fromEntries(Object.entries(ROUND_STATE_SCHEMA).map(([k, v]) => [k, v.default]))
);
export const BATTLE_STATE_DEFAULTS = Object.freeze(
    Object.fromEntries(Object.entries(BATTLE_STATE_SCHEMA).map(([k, v]) => [k, v.default]))
);

/** 数组字段清单（兼容用，从 schema 派生） */
export const ARRAY_BATTLE_STATE_KEYS = Object.freeze(
    Object.entries(BATTLE_STATE_SCHEMA)
        .filter(([, v]) => v.type === STATE_FIELD_TYPES.ARRAY)
        .map(([k]) => k)
);
/** 对象字段清单（兼容用，从 schema 派生） */
export const OBJECT_BATTLE_STATE_KEYS = Object.freeze(
    Object.entries(BATTLE_STATE_SCHEMA)
        .filter(([, v]) => v.type === STATE_FIELD_TYPES.OBJECT)
        .map(([k]) => k)
);

/** 顶层回合级字段（已全部迁入 state，保留空表占位） */
export const ROUND_FIELD_KEYS = Object.freeze([]);
/** 顶层整场字段 */
export const BATTLE_FIELD_KEYS = Object.freeze(['_originalPos']);
/** 顶层永久字段 */
export const PERMANENT_FIELD_KEYS = Object.freeze([
    'isXiaoZhaoSister', 'isXiaoZhaoBrother',
    '_baseAtk', '_baseDef', '_baseMaxHp', '_initAtk', '_initDef', '_initMaxHp', '_hpDmgRatio'
]);

/** 按 schema 初始化一个 state 对象 */
export function createInitialState() {
    // 数组和对象 default 需独立实例，避免多单位共享引用
    const state = {};
    for (const [key, spec] of Object.entries(ROUND_STATE_SCHEMA)) {
        state[key] = spec.default;
    }
    for (const [key, spec] of Object.entries(BATTLE_STATE_SCHEMA)) {
        state[key] = spec.type === STATE_FIELD_TYPES.ARRAY
            ? []
            : spec.type === STATE_FIELD_TYPES.OBJECT
                ? spec.default
                : spec.default;
    }
    return state;
}

/** 拷贝整场状态字段到目标 state；数组深拷贝、对象浅拷贝 */
export function copyBattleStateFields(srcState, dstState) {
    for (const [key, spec] of Object.entries(BATTLE_STATE_SCHEMA)) {
        if (spec.type === STATE_FIELD_TYPES.ARRAY) {
            dstState[key] = (srcState && srcState[key]) ? srcState[key].map(x => (typeof x === 'object' && x !== null ? { ...x } : x)) : [];
        } else if (spec.type === STATE_FIELD_TYPES.OBJECT) {
            dstState[key] = (srcState && srcState[key]) ? { ...srcState[key] } : null;
        } else if (srcState && srcState[key] !== undefined) {
            dstState[key] = srcState[key];
        }
    }
    return dstState;
}

/** 拷贝全量状态字段（回合级 + 整场）到目标 state */
export function copyAllStateFields(srcState, dstState) {
    for (const [key, spec] of Object.entries(ROUND_STATE_SCHEMA)) {
        if (srcState && srcState[key] !== undefined) dstState[key] = srcState[key];
        else dstState[key] = spec.default;
    }
    return copyBattleStateFields(srcState, dstState);
}

/** UI 镜像统一同步：全量 state 字段 */
export function syncStateToUI(srcState, srcUid, dstState) {
    copyAllStateFields(srcState, dstState);
    return dstState;
}

/** 回合级状态统一重置 */
export function resetStateFields(state) {
    for (const [key, spec] of Object.entries(ROUND_STATE_SCHEMA)) {
        state[key] = spec.default;
    }
    return state;
}