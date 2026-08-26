// infra/56-battle-enums.js - 光明顶5v5 战斗类型枚举（单一事实源）
// V1.0.0 | ~3000 bytes| 2026-08-26 从裸字符串收敛
export const VER = 'infra/56-battle-enums.js V1.0.0';

/** 事实类型：所有 factType 字符串的唯一来源 */
export const FACT_TYPES = Object.freeze({
    ATTACK: 'attack', MISS: 'miss', DODGE: 'dodge', IMMUNE: 'immune',
    EMPTY_TARGET: 'emptyTarget', DROP: 'drop', BREAK_DEF: 'breakDef',
    HORSE_DESTROY: 'horseDestroy', ZHANG_SWITCH: 'zhangSwitch',
    BUFF_SUMMARY: 'buffSummary', CARRY_APPLY: 'carryApply',
    HORSE_SUMMON: 'horseSummon', PASS: 'pass',
    KU_LIAN_PRIORITY: 'kuLianPriority', KU_LIAN: 'kuLian',
    DOUBLE_STRIKE: 'doubleStrike', RANGED_GROWTH: 'rangedGrowth',
    FORTIFY_SHIELD: 'fortifyShield', MIND_CONTROL_SWAP: 'mindControlSwap',
    MIND_CONTROL_FAIL: 'mindControlFail',
    QIAN_KUN_UPGRADED: 'qianKunUpgraded', QIAN_KUN_BASIC: 'qianKunBasic',
    KUAI_LE_HEAL: 'kuaiLeHeal', SPIDER_TRANSFORM: 'spiderTransform',
    SPIDER_RETURN: 'spiderReturn', SPIDER_STRIKE: 'spiderStrike',
    XUAN_MING_DOT: 'xuanmingDot', XUAN_MING_POISONED: 'xuanmingPoisoned',
    PHANTOM_DISGUISE_HEAL: 'phantomDisguiseHeal',
    XING_FEN_RETRY: 'xingFenRetry', XIN_HUN: 'xinHun',
    XING_FEN_COST: 'xingFenCost', NINE_YANG_HEAL: 'nineYangHeal',
    RONG_HUI_BONUS: 'rongHuiBonus', WEI_LEECH: 'weiLeech',
    QIAN_KUN_DERIVED: 'qianKunDerived',
    BUTTERFLY_ATTACH: 'butterflyAttach', BUTTERFLY_NO_HOST: 'butterflyNoHost',
    BUTTERFLY_RETURN: 'butterflyReturn', BUTTERFLY_HOST_DEAD: 'butterflyHostDead',
    SPIDER_FLY: 'spiderFly', XIAO_ZHAO_HORSE: 'xiaoZhaoHorse',
    SPIDER_DOUBLE_STRIKE: 'spiderDoubleStrike',
    STUN_SKIP: 'stunSkip', FLY_SKIP: 'flySkip',
    HORSE_REBOUND: 'horseRebound', FORTIFY_REBOUND: 'fortifyRebound',
    METEOR_SPLASH_GROWTH: 'meteorSplashGrowth',
    WARRIOR_EXECUTE: 'warriorExecute',
    BLOOD_THIRST_LEECH: 'bloodthirstLeech', HOT_BLOOD_HEAL: 'hotBloodHeal',
    WIND_ASSAULT_SPLASH: 'windAssaultSplash', WIND_ASSAULT_PUSH: 'windAssaultPush',
    WIND_ASSAULT_FAIL: 'windAssaultFail',
    METEOR_SHOWER_MAIN: 'meteorShowerMain', METEOR_SHOWER_SPLASH: 'meteorShowerSplash',
    ROUND_START: 'roundStart', ROUND_END: 'roundEnd',
    DOUBLE_STRIKE_SUMMARY: 'doubleStrikeSummary', ZHANG_TAUNT: 'zhangTaunt',
    XING_FEN_EXTRA_ATTACK: 'xingFenExtraAttack', XIN_HUN_DEATH: 'xinHunDeath',
    CLAW_NO_HEAL: 'clawNoHeal', CLAW_HIT: 'clawHit',
    CLAW_EXECUTE: 'clawExecute', CLAW_HEAL: 'clawHeal',
    PHANTOM_REVEAL: 'phantomReveal', PHANTOM_CONFUSE: 'phantomConfuse',
    XUAN_MING_LINK_ATTACK: 'xuanmingLinkAttack',
    SPIDER_DEAD_TARGET: 'spiderDeadTarget', XING_FEN_GRANT: 'xingFenGrant'
});

/** Buff 类型：buff.key 唯一来源（与 CONFIG.BUFFS / XIAO_ZHAO_PERMANENT_BUFFS 11 项对应） */
export const BUFF_TYPES = Object.freeze({
    FORTIFY: 'fortify', BLOODTHIRST: 'bloodthirst',
    METEOR_SHOWER: 'meteorShower', WIND_ASSAULT: 'windAssault',
    CLOUD_BODY: 'cloudBody', HOT_BLOOD: 'hotBlood',
    CARRY: 'carry', DOUBLE_STRIKE: 'doubleStrike',
    MIND_CONTROL: 'mindControl', HORSE_FORMATION: 'horseFormation',
    HOLY_FLAME: 'holyFlame'
});

/** 舞台动作类型：31 翻译和 42 消费的 kind 唯一来源 */
export const STAGE_ACTION_TYPES = Object.freeze({
    ROUND_START: 'roundStart', ROUND_END: 'roundEnd', REST: 'rest',
    ATTACK: 'attack', MISS: 'miss', DODGE: 'dodge', IMMUNE: 'immune',
    EMPTY_TARGET: 'emptyTarget', EXECUTE: 'execute', DEATH: 'death',
    SPIDER_STRIKE: 'spiderStrike', REBOUND: 'rebound',
    DOT: 'dot', HEAL: 'heal',
    POS_SWAP: 'posSwap', PUSH: 'push',
    STAT_CHANGE: 'statChange',
    SUMMON: 'summon', DESTROY: 'destroy',
    TRANSFORM: 'transform', FLY_MODE: 'flyMode', STUN: 'stun',
    SPLASH: 'splash', BUFF_EFFECT: 'buffEffect',
    HP_PCT_DANMAKU: 'hpPctDanmaku', BANNER: 'banner'
});

/** Store 动作类型：battleReducer 消费的 action.type 唯一来源 */
export const STORE_ACTION_TYPES = Object.freeze({
    INIT: 'INIT',
    SET_FLASH: 'SET_FLASH',
    SET_VISUAL: 'SET_VISUAL',
    CLEAR_ALL_FLASH: 'CLEAR_ALL_FLASH',
    CLEAR_UNIT_FLASH: 'CLEAR_UNIT_FLASH',
    APPLY_EVENTS: 'APPLY_EVENTS',
    SYNC_UNIT: 'SYNC_UNIT',
    ADD_UNIT: 'ADD_UNIT',
    REMOVE_UNIT: 'REMOVE_UNIT',
    SYNC_FULL_UNITS: 'SYNC_FULL_UNITS',
    SYNC_BATTLE_STATS: 'SYNC_BATTLE_STATS',
    HP_CHANGE: 'hp-change',
    STAT_BONUS_CHANGE: 'stat-bonus-change'
});