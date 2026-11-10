export const VER = 'infra/107-store-schema.js V1.0.0';

import { BUFF_TYPES, FACT_TYPES } from './106-battle-enums.js';

// GlobalStore 值形状真源：65 键白名单 + 类型声明 + 运行期校验。
// 分层：本文件只依赖 infra/106，禁止 import core/（core→infra 单向，反向会破坏架构铁律）。
// 只做「只读浅校验」：不 clone、不 freeze、不修正值——store 里存的是活引用与状态唯一真源。
// 深校验（逐元素逐字段）只在 ?schema=1 调试开关下开启，见 validateStoreValue 的 deep 选项。

/** 值类型（与 core/218 STATE_FIELD_TYPES 同口径，补 FUNCTION/NULL/ANY） */
export const STORE_VALUE_TYPES = Object.freeze({
    BOOLEAN: 'boolean',
    NUMBER: 'number',
    STRING: 'string',
    ARRAY: 'array',
    OBJECT: 'object',
    FUNCTION: 'function',
    NULL: 'null',
    ANY: 'any'
});

const S = STORE_VALUE_TYPES;

// 65 键白名单：与 2026-11-06 对照表逐字一致（含 currentBattleState）。
// 新增键必须同时补白名单与 STORE_SCHEMA，禁止裸字符串。
export const STORE_KEY_WHITELIST = Object.freeze(new Set([
    '_hasPlayedFair', 'abortController', 'activeBuffs', 'adjustMode', 'autoLevel', 'autoMode',
    'battleFacts', 'battleHasZhang', 'battleHistory', 'battleLog', 'battleResultForInfo',
    'battleStore', 'bugMode', 'bulletTimeActive', 'careerLogSuppress', 'chestCount', 'crashMode',
    'currentBattleState', 'currentDoubleStrikeUid', 'currentStage', 'debugMode',
    'dodgeEffectEnabled', 'enemyAutoHex', 'fastForwardActive', 'forceHanLiSa', 'forceMingUnit',
    'forcePang', 'forceSectUnit', 'forceSoloWeakElite', 'forceWeakElite', 'forceWei', 'forceXiaoZhao',
    'forceXieXun', 'forceZhang', 'fxDashSlow', 'fxDodgeBullet', 'fxHanlisaAim', 'gameStarted',
    'glowColors', 'gs', 'hlsAimPlayedThisTurn', 'holyToken', 'isBattleStarting', 'isPaused',
    'logLevel', 'netGuestDone', 'netGuestReady', 'netPeerReady', 'netRole', 'panelPaused',
    'playerContext', 'pvpMode', 'restoreSpeed', 'scrollSlowdown', 'selectedAdjustPos',
    'selectedBuffIndex', 'skipBuffPopup', 'snapshot', 'speed', 'UI', 'usedBuffKeys',
    'userScrolled', 'voteChoice', 'voteScore', 'waitingForNextRound', 'xiaoZhaoBackup',
    'xiaoZhaoPermanentBuffs'
]));

/** 12 个集合/动态结构键（其余 53 个为标量/布尔/枚举） */
export const STRUCTURED_STORE_KEYS = Object.freeze([
    'snapshot', 'UI', 'activeBuffs', 'battleHistory', 'battleLog', 'battleFacts',
    'usedBuffKeys', 'xiaoZhaoPermanentBuffs', 'xiaoZhaoBackup', 'battleStore',
    'currentBattleState', 'battleResultForInfo'
]);

const FACT_VALUES = new Set(Object.values(FACT_TYPES));
const BUFF_VALUES = new Set(Object.values(BUFF_TYPES));
const ALLY = 'ally';
const GS_VALUES = new Set(['IDLE', 'RUNNING', 'PAUSED', 'GAMEOVER']);

// 65 键逐键声明。required 默认 true；nullable 默认 false；default 仅结构键给（初始化/缺键读取）。
export const STORE_SCHEMA = Object.freeze({
    _hasPlayedFair: { type: S.BOOLEAN },
    abortController: { type: S.OBJECT, nullable: true },
    activeBuffs: { type: S.ARRAY, item: 'BUFF', default: [] },
    adjustMode: { type: S.BOOLEAN },
    autoLevel: { type: S.STRING },
    autoMode: { type: S.BOOLEAN },
    battleFacts: { type: S.ARRAY, item: 'FACT', default: [] },
    battleHasZhang: { type: S.BOOLEAN },
    battleHistory: { type: S.ARRAY, item: 'ROUND_SNAPSHOT', nullable: true, default: null },
    battleLog: { type: S.ARRAY, item: 'LOG_ENTRY', default: [] },
    battleResultForInfo: {
        type: S.OBJECT, nullable: true, default: null,
        fields: {
            winner: { type: S.STRING, enum: ['明教', '六大派'], required: true },
            ally: { type: S.ARRAY, item: 'REPORT_UNIT', required: true },
            enemy: { type: S.ARRAY, item: 'REPORT_UNIT', required: true }
        }
    },
    battleStore: {
        type: S.OBJECT, nullable: true, default: null,
        fields: {
            getState: { type: S.FUNCTION, required: true },
            dispatch: { type: S.FUNCTION, required: true },
            subscribe: { type: S.FUNCTION, required: true }
        }
    },
    bulletTimeActive: { type: S.BOOLEAN },
    careerLogSuppress: { type: S.BOOLEAN },
    chestCount: { type: S.NUMBER },
    crashMode: { type: S.STRING },
    currentBattleState: {
        type: S.OBJECT, nullable: true, default: null,
        fields: {
            ally: { type: S.ARRAY, item: 'UNIT', required: true },
            enemy: { type: S.ARRAY, item: 'UNIT', required: true }
        }
    },
    // 真实写入是 core/210 的 doubleStrikeUid（= doubleStrikeUnitUids 数组），
    //   player/504:179 原样透传；render/404:97 也按 Array.isArray + includes 读。
    //   定成 string 会在第 1 回合写 step.doubleStrikeUid 时直接抛错（线上 v=6535f8a3 P0）。
    currentDoubleStrikeUid: { type: S.ARRAY, item: S.STRING, nullable: true },
    currentStage: { type: S.NUMBER },
    debugMode: { type: S.BOOLEAN },
    bugMode: { type: S.BOOLEAN },
    dodgeEffectEnabled: { type: S.BOOLEAN },
    enemyAutoHex: { type: S.BOOLEAN },
    fastForwardActive: { type: S.BOOLEAN },
    forceHanLiSa: { type: S.BOOLEAN, nullable: true },
    forceMingUnit: { type: S.STRING, nullable: true },
    forcePang: { type: S.BOOLEAN, nullable: true },
    forceSectUnit: { type: S.STRING, nullable: true },
    forceSoloWeakElite: { type: S.BOOLEAN, nullable: true },
    forceWeakElite: { type: S.STRING, nullable: true },
    forceWei: { type: S.BOOLEAN, nullable: true },
    // 工具链（816）会写 'sister'/'brother'，主路径写 true/false/null
    forceXiaoZhao: { type: [S.BOOLEAN, S.STRING], nullable: true },
    forceXieXun: { type: S.BOOLEAN, nullable: true },
    forceZhang: { type: S.BOOLEAN, nullable: true },
    fxDashSlow: { type: S.BOOLEAN },
    fxDodgeBullet: { type: S.BOOLEAN },
    fxHanlisaAim: { type: S.BOOLEAN },
    gameStarted: { type: S.BOOLEAN },
    glowColors: { type: S.NUMBER },
    gs: { type: S.STRING, enum: [...GS_VALUES] },
    hlsAimPlayedThisTurn: { type: S.BOOLEAN },
    holyToken: { type: S.NUMBER },
    isBattleStarting: { type: S.BOOLEAN },
    isPaused: { type: S.BOOLEAN },
    logLevel: { type: S.STRING },
    netGuestDone: { type: S.BOOLEAN },
    netGuestReady: { type: S.BOOLEAN },
    netPeerReady: { type: S.BOOLEAN },
    netRole: { type: S.STRING, nullable: true },
    panelPaused: { type: S.BOOLEAN },
    playerContext: { type: S.OBJECT, nullable: true },
    pvpMode: { type: S.BOOLEAN },
    restoreSpeed: { type: S.BOOLEAN },
    scrollSlowdown: { type: S.BOOLEAN },
    selectedAdjustPos: { type: S.NUMBER, nullable: true },
    selectedBuffIndex: { type: S.NUMBER },
    skipBuffPopup: { type: S.BOOLEAN },
    snapshot: {
        type: S.OBJECT,
        default: { ally: [], enemy: [] },
        fields: {
            ally: { type: S.ARRAY, item: 'UNIT', required: true },
            enemy: { type: S.ARRAY, item: 'UNIT', required: true },
            _rngSeed: { type: S.NUMBER, required: false }
        },
        frozen: 'deep'
    },
    speed: { type: S.NUMBER },
    UI: {
        type: S.OBJECT,
        default: { allyTeam: [], enemyTeam: [], currentResult: null, round: 0 },
        fields: {
            allyTeam: { type: S.ARRAY, item: 'UNIT', required: true },
            enemyTeam: { type: S.ARRAY, item: 'UNIT', required: true },
            // 死字段：全仓只写 null（tests/121 仍读），本轮定死为 null，B4 保留 deprecated
            currentResult: { type: S.NULL, required: true, deprecated: true },
            // 恒 0；真回合数在 battleStore.round。保留 number，B4 单独评估删除
            round: { type: S.NUMBER, required: true, deprecated: true }
        }
    },
    usedBuffKeys: { type: S.ARRAY, item: S.STRING, default: [] },
    userScrolled: { type: S.BOOLEAN },
    voteChoice: { type: S.STRING, nullable: true },
    voteScore: { type: S.NUMBER, nullable: true },
    waitingForNextRound: { type: S.BOOLEAN },
    xiaoZhaoBackup: {
        type: S.OBJECT, nullable: true, default: null,
        fields: {
            form: { type: S.STRING, enum: ['sister', 'brother'], required: true },
            unit: { type: 'UNIT', required: true }
        }
    },
    xiaoZhaoPermanentBuffs: { type: S.ARRAY, item: 'PERM_BUFF', default: [] }
});

// 结构键缺省值：704/104 初始化与 GlobalStore.get 缺键时取这里，避免第二份初始化清单
export const STORE_DEFAULTS = Object.freeze({
    snapshot: { ally: [], enemy: [] },
    UI: { allyTeam: [], enemyTeam: [], currentResult: null, round: 0 },
    activeBuffs: [],
    battleHistory: null,
    battleLog: [],
    battleFacts: [],
    usedBuffKeys: [],
    xiaoZhaoPermanentBuffs: [],
    xiaoZhaoBackup: null,
    battleStore: null,
    currentBattleState: null,
    battleResultForInfo: null
});

function cloneDefault(value) {
    if (Array.isArray(value)) return value.map(cloneDefault);
    if (value && typeof value === 'object') {
        const out = {};
        for (const k of Object.keys(value)) out[k] = cloneDefault(value[k]);
        return out;
    }
    return value;
}

export function getStoreDefault(key) {
    return STORE_DEFAULTS[key] === undefined ? undefined : cloneDefault(STORE_DEFAULTS[key]);
}

// ── 元素级校验：Unit 用 duck-type（兼容 Unit 实例 / clone / toJSON / 跨 worker plain object） ──
function isUnitLike(v) {
    return !!v && typeof v === 'object' &&
        typeof v.uid === 'string' &&
        typeof v.name === 'string' &&
        (typeof v.pos === 'number' || v.pos === null) &&
        typeof v.hp === 'number' &&
        typeof v.maxHp === 'number' &&
        typeof v.alive === 'boolean' &&
        !!v.state && typeof v.state === 'object';
}

function isBuff(v) {
    if (!v || typeof v !== 'object') return false;
    if (typeof v.key !== 'string' || !BUFF_VALUES.has(v.key)) return false;
    if (typeof v.name !== 'string') return false;
    if (typeof v.remaining !== 'number') return false;
    // 历史 buff 可能缺 target（引擎侧按「无 target 归明教」处理），只做可选类型校验
    if (v.target !== undefined && typeof v.target !== 'string') return false;
    if (v.cols !== undefined && !Array.isArray(v.cols)) return false;
    if (v.rows !== undefined && !Array.isArray(v.rows)) return false;
    return true;
}

function isPermBuff(v) {
    return !!v && typeof v === 'object' &&
        typeof v.key === 'string' && BUFF_VALUES.has(v.key) &&
        typeof v.name === 'string' &&
        v.target === ALLY &&
        typeof v.remaining === 'number';
}

function isFact(v) {
    return !!v && typeof v === 'object' &&
        typeof v.factType === 'string' && FACT_VALUES.has(v.factType) &&
        !!v.data && typeof v.data === 'object';
}

function isLogEntry(v) {
    return !!v && typeof v === 'object' &&
        (typeof v.text === 'string' || typeof v.type === 'string');
}

function isRoundSnapshot(v) {
    return !!v && typeof v === 'object' &&
        typeof v.version === 'number' &&
        typeof v.round === 'number' &&
        Array.isArray(v.ally) && v.ally.every(isUnitLike) &&
        Array.isArray(v.enemy) && v.enemy.every(isUnitLike) &&
        Array.isArray(v.activeBuffs) && v.activeBuffs.every(isBuff);
}

function isReportUnit(v) {
    return isUnitLike(v) && typeof v._isDead === 'boolean';
}

const ITEM_VALIDATORS = {
    UNIT: isUnitLike,
    BUFF: isBuff,
    PERM_BUFF: isPermBuff,
    FACT: isFact,
    LOG_ENTRY: isLogEntry,
    ROUND_SNAPSHOT: isRoundSnapshot,
    REPORT_UNIT: isReportUnit
};

// ── 模式与违规账本 ──
let _mode = 'strict';           // B4 收口默认；off 仅调试
const _violations = [];
const _reported = new Set();

export function setSchemaMode(mode) {
    if (mode !== 'off' && mode !== 'warn' && mode !== 'strict') {
        throw new TypeError(`[GlobalStore.schema] 非法模式 '${mode}'（只允许 off/warn/strict）`);
    }
    _mode = mode;
}

export function getSchemaMode() { return _mode; }

export function getSchemaViolations() { return _violations.slice(); }

export function resetSchemaViolations() { _violations.length = 0; _reported.clear(); }

function recordViolation(key, reason) {
    _violations.push({ key, reason, at: Date.now() });
    if (!_reported.has(key)) {
        _reported.add(key);
        console.error(`[GlobalStore.schema] key='${key}' ${reason}`);
    }
}

// ── 核心校验 ──
function typeName(t) { return t === 'UNIT' ? 'Unit' : t; }

function matchesType(type, value) {
    switch (type) {
        case S.BOOLEAN: return typeof value === 'boolean';
        case S.NUMBER: return typeof value === 'number';
        case S.STRING: return typeof value === 'string';
        case S.ARRAY: return Array.isArray(value);
        case S.OBJECT: return !!value && typeof value === 'object' && !Array.isArray(value);
        case S.FUNCTION: return typeof value === 'function';
        case S.NULL: return value === null;
        case S.ANY: return true;
        case 'UNIT': return isUnitLike(value);
        default: return false;
    }
}

function checkSpec(spec, value, path, deep, reasons) {
    if (value === null) {
        if (!spec.nullable && spec.type !== S.NULL) reasons.push(`${path} 不可为 null`);
        return;
    }
    if (value === undefined) {
        reasons.push(`${path} 不可为 undefined`);
        return;
    }
    const types = Array.isArray(spec.type) ? spec.type : [spec.type];
    if (!types.some(t => matchesType(t, value))) {
        reasons.push(`${path} 期望 ${types.map(typeName).join('|')}，实际 ${Array.isArray(value) ? 'array' : typeof value}`);
        return;
    }
    if (spec.enum && typeof value === 'string' && !spec.enum.includes(value)) {
        reasons.push(`${path} 不在枚举 [${spec.enum.join(', ')}]，实际 '${value}'`);
    }
    if (spec.item) {
        const isArr = Array.isArray(value);
        const list = isArr ? value : [];
        const validator = typeof spec.item === 'string' && !Object.values(S).includes(spec.item)
            ? ITEM_VALIDATORS[spec.item]
            : null;
        // deep=false 只看首元素：热路径不遍历大数组；深校验由 ?schema=1 打开
        const checkList = deep ? list : list.slice(0, 1);
        checkList.forEach((el, i) => {
            let ok;
            if (validator) ok = validator(el);
            else if (spec.item === S.STRING) ok = typeof el === 'string';
            else if (spec.item === S.NUMBER) ok = typeof el === 'number';
            else if (spec.item === S.BOOLEAN) ok = typeof el === 'boolean';
            else ok = true;
            if (!ok) reasons.push(`${path}[${i}] 不是合法 ${typeName(spec.item)}`);
        });
    }
    if (spec.fields) {
        for (const name of Object.keys(spec.fields)) {
            const fs = spec.fields[name];
            const has = Object.prototype.hasOwnProperty.call(value, name);
            if (!has) {
                if (fs.required !== false) reasons.push(`${path}.${name} 缺少必填字段`);
                continue;
            }
            checkSpec(fs, value[name], `${path}.${name}`, deep, reasons);
        }
    }
}

/**
 * 校验一个 store 值。
 * @param {string} key
 * @param {*} value
 * @param {{mode?:'off'|'warn'|'strict', deep?:boolean, ignoreUnknown?:boolean}} [opts]
 * @returns {boolean} 是否合法（strict 模式非法会直接抛 TypeError）
 */
export function validateStoreValue(key, value, opts = {}) {
    const mode = opts.mode || _mode;
    if (mode === 'off') return true;

    const spec = STORE_SCHEMA[key];
    if (!spec) {
        if (opts.ignoreUnknown) return true;
        recordViolation(key, '未在 STORE_SCHEMA 注册（禁止裸字符串）');
        if (mode === 'strict') throw new TypeError(`[GlobalStore.schema] key='${key}' 未在 107 注册`);
        return false;
    }

    const reasons = [];
    checkSpec(spec, value, key, !!opts.deep, reasons);

    if (reasons.length === 0) return true;
    recordViolation(key, reasons.join('；'));
    if (mode === 'strict') {
        throw new TypeError(`[GlobalStore.schema] key='${key}' ${reasons.join('；')}`);
    }
    return false;
}

export function isStoreKey(key) { return STORE_KEY_WHITELIST.has(key); }

/** 装配自检：白名单/声明/结构键数量必须对齐，防止漏注册 */
export function assertStoreSchema() {
    const schemaKeys = Object.keys(STORE_SCHEMA);
    if (STORE_KEY_WHITELIST.size !== 65) {
        throw new Error(`[107] 白名单应为 65 键，实际 ${STORE_KEY_WHITELIST.size}`);
    }
    if (schemaKeys.length !== 65) {
        throw new Error(`[107] STORE_SCHEMA 应为 65 键，实际 ${schemaKeys.length}`);
    }
    for (const key of schemaKeys) {
        if (!STORE_KEY_WHITELIST.has(key)) throw new Error(`[107] schema 键 '${key}' 不在白名单`);
    }
    for (const key of STORE_KEY_WHITELIST) {
        if (!STORE_SCHEMA[key]) throw new Error(`[107] 白名单键 '${key}' 缺 schema 声明`);
    }
    if (STRUCTURED_STORE_KEYS.length !== 12) {
        throw new Error(`[107] 结构键应为 12 个，实际 ${STRUCTURED_STORE_KEYS.length}`);
    }
    for (const key of STRUCTURED_STORE_KEYS) {
        if (!STORE_SCHEMA[key]) throw new Error(`[107] 结构键 '${key}' 缺 schema 声明`);
    }
}

assertStoreSchema();

export function getSchemaStats() {
    return {
        mode: _mode,
        whitelist: STORE_KEY_WHITELIST.size,
        declared: Object.keys(STORE_SCHEMA).length,
        structured: STRUCTURED_STORE_KEYS.length,
        violations: _violations.length
    };
}
