// V1.4.3 | ~13860 bytes | 2026-10-09 SIGNAL_TYPES 增 CLAW_HIT_APPLIED（白骨爪连锁每爪结算后广播：供小昭·姊乾坤衍生按爪结算，堵住「一次攻击只触发一次」的断链）
export const VER = 'infra/56-battle-enums.js V1.4.3';

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
    MIND_CONTROL_FAIL: 'mindControlFail', MIND_CONTROL_BANNER: 'mindControlBanner',
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
    BLOOD_THIRST_LEECH: 'bloodthirstLeech', HOT_BLOOD_HEAL: 'hotBloodHeal', FLYER_REGEN: 'flyerRegen',
    WIND_ASSAULT_SPLASH: 'windAssaultSplash', WIND_ASSAULT_PUSH: 'windAssaultPush',
    WIND_ASSAULT_FAIL: 'windAssaultFail',
    // 击退退无可退 → 眩晕（乘风突袭 / 胖远桥·年轻气盛共用）
    PUSH_STUN: 'pushStun',
    // 通用属性裁定（EFFECT_TYPES.STAT_CHANGE）落地的数值声明 fact：供体检对照 statChange group，不进画面
    STAT_CHANGE_APPLY: 'statChangeApply',
    // 空列/残血光环（core/11 每回合 addMod group=aura）：每存活单位每回合 1 条，两值为 0 也发，供体检对照
    AURA_APPLY: 'auraApply',
    // 圣火令（core/14 命中列加攻/命中行加防，op:mul 乘法词条）：每次 addMod 1 条，发乘率不发增量（共享乘区）
    HOLY_FLAME_APPLY: 'holyFlameApply',
    // 韦一笑·闪避反击吸血（WEI_HEAL）独立数值声明：此前体检只能借 dodgeFact.weiHeal 嵌套读取；纯账本不进画面（演出仍走 dodgeFact）
    WEI_DODGE_LEECH: 'weiDodgeLeech',
    METEOR_SHOWER_MAIN: 'meteorShowerMain', METEOR_SHOWER_SPLASH: 'meteorShowerSplash',
    ROUND_START: 'roundStart', ROUND_END: 'roundEnd',
    DOUBLE_STRIKE_SUMMARY: 'doubleStrikeSummary', ZHANG_TAUNT: 'zhangTaunt',
    XING_FEN_EXTRA_ATTACK: 'xingFenExtraAttack', XIN_HUN_DEATH: 'xinHunDeath',
    CLAW_NO_HEAL: 'clawNoHeal', CLAW_HIT: 'clawHit',
    CLAW_EXECUTE: 'clawExecute', CLAW_HEAL: 'clawHeal',
    PHANTOM_REVEAL: 'phantomReveal', PHANTOM_CONFUSE: 'phantomConfuse',
    XUAN_MING_LINK_ATTACK: 'xuanmingLinkAttack',
    SPIDER_DEAD_TARGET: 'spiderDeadTarget', XING_FEN_GRANT: 'xingFenGrant',
    // 张三丰：生生不息（回血 + 加防）
    ENDLESS_BREATH: 'endlessBreath',
    // 张三丰：不争（仅剩一人判负）
    NO_CONTEND: 'noContend',
    // 召唤（谢逊狮子 / 灭绝召唤周芷若）
    SUMMON_UNIT: 'summonUnit',
    // 谢逊幼狮成长（一回合后按位置成形为雄狮 / 母狮）
    LION_GROW: 'lionGrow',
    // 数值声明 fact（供体检对照器比对「声明 vs 账本 group 实际增量」；不进画面，只进 step.log）
    BAGUA_ARRAY: 'baguaArray',
    RAGE_ON_HIT: 'rageOnHit',
    LION_INSPIRE: 'lionInspire'
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
    DAMAGE_FLOAT: 'damageFloat',
    HP_PCT_DANMAKU: 'hpPctDanmaku', BANNER: 'banner'
});

/** Buff 特效子类型：BUFF_EFFECT stageAction 的 effectType 唯一来源（不再用裸字符串） */
export const BUFF_EFFECT_TYPES = Object.freeze({
    SPLASH: 'splash',
    BONE_CLAW: 'boneClaw',
    ATK_BUFF: 'atkBuff',
    XIN_HUN: 'xinHun'
});

/** 飞行形态子类型：FLY_MODE stageAction 的 originalFactType 唯一来源 */
export const FLY_MODE_TYPES = Object.freeze({
    BUTTERFLY_ATTACH: 'butterflyAttach',
    BUTTERFLY_RETURN: 'butterflyReturn',
    SPIDER_FLY: 'spiderFly',
    SPIDER_RETURN: 'spiderReturn'
});

/**
 * 机制类型：content 里 characters.*.mechanics 顶层条目 type 的唯一来源。
 * 分两组承接：REGISTRY 组必须经 core/18 registerMechanicHandler 注册（modules/26、30），
 * LOCAL 组由 core/15 本地安装器承接；core/15 安装期对不上任一组即抛错（漏注册=开局炸，不静默）。
 */
export const MECHANIC_TYPES = Object.freeze({
    // core/18 注册表承接（modules 侧注册）
    CHAIN_CLAW: 'chainClaw',           // 周芷若·九阴白骨爪连锁（modules/26）
    KU_LIAN: 'kuLian',                 // 宋青书·苦练（modules/26）
    XIN_HUN: 'xinHun',                 // 宋青书·新婚（modules/26）
    XING_FEN: 'xingFen',               // 宋青书·性奋（modules/26）
    DOT_TICK: 'dotTick',               // 通用 DOT 逐回合扣血（modules/30）
    DAMAGE_REFLECT: 'damageReflect',   // 反伤弟子·反伤护盾（modules/30）
    // core/15 本地安装器承接（不经注册表）
    LINK_ATTACK: 'linkAttack',         // 玄冥二老联动
    FOLLOW_ATTACK: 'followAttack',     // 灭绝师太·跟随攻击
    PHANTOM_DISGUISE: 'phantomDisguise' // 成昆·幻影伪装
});

/**
 * 机制内层效果类型：mechanics 数组容器内元素 type 的唯一来源，按容器分组。
 * 容器名与 content JSON 字段一一对应；core/15 安装期逐元素校验，未知 type 抛错。
 * 注意 BONUS_LOST_HP 在 ON_HIT / BEFORE_DAMAGE 两容器都合法（同一值两组登记）。
 */
export const MECHANIC_EFFECT_TYPES = Object.freeze({
    ON_HIT: Object.freeze({
        LEECH: 'leech',                       // 命中吸血（韦一笑）
        HEAL_MAX_HP_PCT: 'healMaxHpPct',      // 命中按最大生命回血（张无忌·九阳）
        POISON: 'poison',                     // 命中施毒（鹿杖客·玄冥神掌）
        BONUS_LOST_HP: 'bonusLostHp'          // 命中按已损生命加伤
    }),
    BEFORE_DAMAGE: Object.freeze({
        IGNORE_DEF: 'ignoreDef',                          // 无视防御比例（鹤笔翁）
        DAMAGE_MULTIPLIER_IF_POISONED: 'damageMultiplierIfPoisoned', // 对中毒目标增伤（鹤笔翁）
        BONUS_LOST_HP: 'bonusLostHp',                     // 伤害前按已损生命加伤（成昆）
        BONUS_TARGET_CURRENT_HP: 'bonusTargetCurrentHp'   // 按目标当前生命加伤（宋青书·叛逆突袭）
    }),
    ATTRIBUTE_MODS: Object.freeze({
        FORTIFY_INCREMENT_MUL: 'fortifyIncrementMul' // 坚盾增幅倍率（成昆联动）
    }),
    DODGE_RULES: Object.freeze({
        LOST_HP_PERCENT: 'lostHpPercent' // 残血额外闪避（韦一笑）
    })
});

/**
 * 机制目标规则：mechanics 条目 targetRule 字段的唯一来源（core/15 installTargetRule）。
 * 未知值安装期抛错，不再 if/else 静默跳过。
 */
export const MECHANIC_TARGET_RULES = Object.freeze({
    LOWEST_HP: 'lowestHp',           // 打当前血量最低（宋青书）
    HIGHEST_HP_PCT: 'highestHpPct'   // 打血量百分比最高（韦一笑）
});

/** 单位事件类型：emitEvent 发出、APPLY_EVENTS 消费的事件标识唯一来源 */
export const UNIT_EVENT_TYPES = Object.freeze({
    HP_CHANGE: 'hp-change',
    POS_CHANGE: 'pos-change',
    UNIT_ADD: 'unit-add',
    UNIT_REMOVE: 'unit-remove',
    ZHANG_SWITCH: 'zhang-switch'
});

/** 掉落类型：DROP fact 的 kind / dropKind 唯一来源 */
export const DROP_TYPES = Object.freeze({
    TOKEN: 'token',
    CHEST: 'chest'
});

/** 格子闪示类型：SET_FLASH action 与 data-flash 的唯一来源 */
export const FLASH_TYPES = Object.freeze({
    ATTACK: 'attack',
    DEFEND: 'defend',
    DEAD: 'dead',
    CHEER: 'cheer'
});

/** 阵营类型：unit.camp 与所有阵营判断的唯一来源 */
export const CAMP_TYPES = Object.freeze({
    ALLY: 'ally',
    ENEMY: 'enemy'
});

/** 职业类型：unit.role 与所有职业判断的唯一来源 */
export const ROLE_TYPES = Object.freeze({
    WARRIOR: '战士',
    DEFENDER: '防战',
    RANGED: '远程',
    FLYER: '飞行'
});

/** 战斗信号类型：eventBus.on / eventBus.emit 的信号名唯一来源 */
export const SIGNAL_TYPES = Object.freeze({
    ON_ROUND_START: 'onRoundStart',
    ON_ROUND_END: 'onRoundEnd',
    BEFORE_ACTION_SELECT: 'beforeActionSelect',
    BEFORE_ATTACK: 'beforeAttack',
    BEFORE_SELECT_TARGET: 'beforeSelectTarget',
    BEFORE_DAMAGE_CALC: 'beforeDamageCalc',
    BEFORE_DAMAGE_APPLY: 'beforeDamageApply',
    ON_DODGE: 'onDodge',
    AFTER_DAMAGE_APPLIED: 'afterDamageApplied',
    AFTER_ATTACK: 'afterAttack',
    AFTER_MISS: 'afterMiss',
    ON_UNIT_DEATH: 'onUnitDeath',
    ON_POSITION_SWAP: 'onPositionSwap',
    BEFORE_STATE_TRANSITION: 'beforeStateTransition',
    ON_BEFORE_DEATH: 'onBeforeDeath',
    // 单位状态变化统一广播：所有"单位状态变了"的机制信号都走这个
    ON_UNIT_STATE_CHANGE: 'onUnitStateChange',
    // 单位行动完成广播：每次该单位走完自己的回合（攻击/休息/被遮挡）后发一次
    ON_UNIT_ACTED: 'onUnitActed',
    // 溅射伤害逐目标广播：SPLASH 效果每打完一个目标发一次（乘风波及 / 流星溅射）。
    //   专供"挨打增益"类被动（胖远桥莽撞）——它们只认 AFTER_DAMAGE_APPLIED，而那条只发主目标；
    //   若在溅射时重发 AFTER_DAMAGE_APPLIED，LEECH / 流星 / 嗜血等十余条监听会把溅射当一次完整攻击。
    SPLASH_DAMAGED: 'splashDamaged',
    // 白骨爪连锁逐爪广播：CLAW_CHAIN 每结算一爪发一次（爪击不走伤害计算管线，无 dmgCalc）。
    //   专供小昭·姊乾坤衍生——BEFORE_DAMAGE_CALC 每次攻击只 emit 一次，爪击拿不到「每爪」语义。
    CLAW_HIT_APPLIED: 'clawHitApplied'
});

/** 单位状态变化类型：ON_UNIT_STATE_CHANGE 信号的 changeType 唯一来源 */
export const STATE_CHANGE_TYPES = Object.freeze({
    DEATH: 'death',              // 单位死亡
    POSITION: 'position',        // 位置变更（换位/击退/落地）
    FLYING: 'flying',            // 飞天
    LANDING: 'landing',          // 落地
    ATTACHED: 'attached',        // 附身
    RETURNED: 'returned',        // 飞回
    STUNNED: 'stunned',          // 眩晕
    TRANSFORMED: 'transformed',  // 张无忌变身
    ROLE_CHANGED: 'roleChanged'  // 蛛变换职业
});

/** Buff 子类型：跨层传递的 buffType 唯一来源（不再用裸字符串） */
export const BUFF_SUBTYPES = Object.freeze({
    BUFF_STAT: 'buff_stat',
    WIND_ASSAULT: 'wind_assault',
    METEOR_SPLASH: 'meteor_splash',
    METEOR_BONUS: 'meteor_bonus',
    SUMMON: 'summon',
    DESTROY: 'destroy',
    SWAP: 'swap',
    PUSH: 'push',
    ELITE_XINGFEN: 'elite_xingfen',
    ELITE_XINHUN: 'elite_xinhun',
    ELITE_KUAILE_HEAL: 'elite_kuaile_heal',
    QIANKUN_ATK: 'qiankun_atk'
});

/** Store 动作类型：battleReducer 消费的 action.type 唯一来源 */
export const STORE_ACTION_TYPES = Object.freeze({
    INIT: 'INIT',
    SET_FLASH: 'SET_FLASH',
    SET_VISUAL: 'SET_VISUAL',
    CLEAR_ALL_FLASH: 'CLEAR_ALL_FLASH',
    CLEAR_UNIT_FLASH: 'CLEAR_UNIT_FLASH',
    APPLY_EVENTS: 'APPLY_EVENTS',
    ADD_UNIT: 'ADD_UNIT',
    REMOVE_UNIT: 'REMOVE_UNIT',
    HP_CHANGE: 'hp-change',
    SET_UNITS: 'SET_UNITS',
    // 2026-09-14 状态三轨收敛：回合数由 battleStore 持有（原先散在 c.UI.round）
    SET_ROUND: 'SET_ROUND'
});