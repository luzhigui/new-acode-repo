// V1.1.0 | ~9500 bytes | 2026-09-04 fact 单源化：FACT_SPECS 成为唯一事实源，30/31 从本文件生成映射
export const VER = 'infra/58-fact-contract.js V1.1.0';

import { FACT_TYPES } from './56-battle-enums.js';

/**
 * FACT_SPECS —— fact 唯一事实源。
 * 每条包含：
 *   - requiredFields: 渲染/特效必须读到的字段（漏了会静默吞或 TypeError）
 *   - renderFn: 30-fact-renderer.js 中的渲染函数名（null 表示无渲染，renderLog 返回 null）
 *   - translateFn: 31-stage-actions.js 中的翻译函数名（null 表示不产生 stageAction）
 *
 * 新增 factType 只需在此登记一条，30/31 通过 buildRendererMap / buildTranslatorMap
 * 自动生成映射表，不再需要手动同步四处。
 */
export const FACT_SPECS = Object.freeze({
    // 攻击/闪避核心
    [FACT_TYPES.ATTACK]: { requiredFields: ['attacker', 'target', 'dmgResult'], renderFn: 'renderAttackFact', translateFn: 'makeAttackAction' },
    [FACT_TYPES.DODGE]: { requiredFields: ['attacker', 'dodger', 'reboundDmg'], renderFn: 'renderDodgeFact', translateFn: 'translateDodge' },
    [FACT_TYPES.MISS]: { requiredFields: ['attacker', 'target'], renderFn: 'renderMissFact', translateFn: 'translateMiss' },
    [FACT_TYPES.IMMUNE]: { requiredFields: ['attacker', 'target'], renderFn: 'renderImmuneFact', translateFn: 'translateImmune' },
    [FACT_TYPES.EMPTY_TARGET]: { requiredFields: ['attacker'], renderFn: 'renderEmptyTargetFact', translateFn: 'translateEmptyTarget' },

    // 掉落 / 破防
    [FACT_TYPES.DROP]: { requiredFields: ['kind'], renderFn: 'renderDropFact', translateFn: null },
    [FACT_TYPES.BREAK_DEF]: { requiredFields: ['attackerName'], renderFn: 'renderBreakDefFact', translateFn: null },

    // 拒马 / 张无忌
    [FACT_TYPES.HORSE_DESTROY]: { requiredFields: ['success'], renderFn: 'renderHorseDestroyFact', translateFn: 'translateHorseDestroy' },
    [FACT_TYPES.ZHANG_SWITCH]: { requiredFields: ['zhang'], renderFn: 'renderZhangSwitchFact', translateFn: 'translateZhangSwitch' },

    // Buff 摘要 / carry
    [FACT_TYPES.BUFF_SUMMARY]: { requiredFields: ['buff'], renderFn: 'renderBuffSummaryFact', translateFn: null },
    [FACT_TYPES.CARRY_APPLY]: { requiredFields: ['unitName'], renderFn: 'renderCarryApplyFact', translateFn: 'translateStatChange' },

    // 召唤
    [FACT_TYPES.HORSE_SUMMON]: { requiredFields: ['horseUid', 'pos'], renderFn: 'renderHorseSummonFact', translateFn: 'translateHorseSummon' },
    [FACT_TYPES.XIAO_ZHAO_HORSE]: { requiredFields: ['horseUid', 'pos'], renderFn: 'renderXiaoZhaoHorseFact', translateFn: 'translateHorseSummon' },

    // 行动跳过 / 苦练 / 连击 / 成长
    [FACT_TYPES.PASS]: { requiredFields: ['unit'], renderFn: 'renderPassFact', translateFn: 'translatePass' },
    [FACT_TYPES.KU_LIAN_PRIORITY]: { requiredFields: ['unitName'], renderFn: 'renderKuLianPriorityFact', translateFn: null },
    [FACT_TYPES.KU_LIAN]: { requiredFields: ['unitName'], renderFn: 'renderKuLianFact', translateFn: 'translateStatChange' },
    [FACT_TYPES.DOUBLE_STRIKE]: { requiredFields: ['success'], renderFn: 'renderDoubleStrikeFact', translateFn: 'translateDoubleStrike' },
    [FACT_TYPES.RANGED_GROWTH]: { requiredFields: ['unitName'], renderFn: 'renderRangedGrowthFact', translateFn: 'translateStatChange' },
    [FACT_TYPES.FORTIFY_SHIELD]: { requiredFields: ['unitName'], renderFn: 'renderFortifyShieldFact', translateFn: 'translateStatChange' },
    [FACT_TYPES.DOUBLE_STRIKE_SUMMARY]: { requiredFields: ['unitName'], renderFn: 'renderDoubleStrikeSummaryFact', translateFn: null },

    // 惑心
    [FACT_TYPES.MIND_CONTROL_SWAP]: { requiredFields: ['unitA', 'unitB'], renderFn: 'renderMindControlSwapFact', translateFn: 'translateMindControlSwap' },
    [FACT_TYPES.MIND_CONTROL_FAIL]: { requiredFields: ['side'], renderFn: 'renderMindControlFailFact', translateFn: null },
    [FACT_TYPES.MIND_CONTROL_BANNER]: { requiredFields: ['side'], renderFn: 'renderMindControlBannerFact', translateFn: 'translateMindControlBanner' },

    // 乾坤大挪移
    [FACT_TYPES.QIAN_KUN_UPGRADED]: { requiredFields: ['rebound', 'zhangUid'], renderFn: 'renderQianKunUpgradedFact', translateFn: null },
    [FACT_TYPES.QIAN_KUN_BASIC]: { requiredFields: ['rebound', 'zhangUid'], renderFn: 'renderQianKunBasicFact', translateFn: null },

    // 快乐回血
    [FACT_TYPES.KUAI_LE_HEAL]: { requiredFields: ['unitUid', 'heal'], renderFn: 'renderKuaiLeHealFact', translateFn: 'makeHealAction' },

    // 小昭蛛变
    [FACT_TYPES.SPIDER_TRANSFORM]: { requiredFields: ['unitName'], renderFn: 'renderSpiderTransformFact', translateFn: 'translateSpiderTransform' },
    [FACT_TYPES.SPIDER_RETURN]: { requiredFields: ['spiderUid', 'pos'], renderFn: 'renderSpiderReturnFact', translateFn: 'translateFlyMode' },
    [FACT_TYPES.SPIDER_STRIKE]: { requiredFields: [], renderFn: 'renderSpiderStrikeFact', translateFn: 'translateSpiderStrike' },
    [FACT_TYPES.SPIDER_FLY]: { requiredFields: ['spiderUid'], renderFn: 'renderSpiderFlyFact', translateFn: 'translateFlyMode' },
    [FACT_TYPES.SPIDER_DOUBLE_STRIKE]: { requiredFields: [], renderFn: 'renderSpiderDoubleStrikeFact', translateFn: 'translateDoubleStrike' },
    [FACT_TYPES.SPIDER_DEAD_TARGET]: { requiredFields: [], renderFn: 'renderSpiderDeadTargetFact', translateFn: null },

    // 玄冥神掌
    [FACT_TYPES.XUAN_MING_DOT]: { requiredFields: ['uidD', 'dot'], renderFn: 'renderXuanmingDotFact', translateFn: 'translateXuanmingDot' },
    [FACT_TYPES.XUAN_MING_POISONED]: { requiredFields: ['dotPercents'], renderFn: 'renderXuanmingPoisonedFact', translateFn: null },
    [FACT_TYPES.XUAN_MING_LINK_ATTACK]: { requiredFields: ['partnerName', 'unitName'], renderFn: 'renderXuanmingLinkAttackFact', translateFn: null },

    // 幻影伪装
    [FACT_TYPES.PHANTOM_DISGUISE_HEAL]: { requiredFields: ['unitUid', 'heal'], renderFn: 'renderPhantomDisguiseHealFact', translateFn: 'makeHealAction' },
    [FACT_TYPES.PHANTOM_REVEAL]: { requiredFields: ['unitName', 'deceiver'], renderFn: 'renderPhantomRevealFact', translateFn: null },
    [FACT_TYPES.PHANTOM_CONFUSE]: { requiredFields: ['unitName', 'deceiver'], renderFn: 'renderPhantomConfuseFact', translateFn: null },

    // 宋青书新婚 / 性奋
    [FACT_TYPES.XING_FEN_RETRY]: { requiredFields: ['unitName'], renderFn: 'renderXingFenRetryFact', translateFn: null },
    [FACT_TYPES.XIN_HUN]: { requiredFields: ['stackCount', 'zhouUid'], renderFn: 'renderXinHunFact', translateFn: 'translateXinHun' },
    [FACT_TYPES.XING_FEN_COST]: { requiredFields: ['unitName'], renderFn: 'renderXingFenCostFact', translateFn: null },
    [FACT_TYPES.XING_FEN_EXTRA_ATTACK]: { requiredFields: ['unitName'], renderFn: 'renderXingFenExtraAttackFact', translateFn: null },
    [FACT_TYPES.XING_FEN_GRANT]: { requiredFields: ['songName', 'zhouName'], renderFn: 'renderXingFenGrantFact', translateFn: null },
    [FACT_TYPES.XIN_HUN_DEATH]: { requiredFields: ['uidD'], renderFn: 'renderXinHunDeathFact', translateFn: 'translateXinHunDeath' },

    // 张无忌九阳 / 融会贯通
    [FACT_TYPES.NINE_YANG_HEAL]: { requiredFields: ['unitUid', 'heal'], renderFn: 'renderNineYangHealFact', translateFn: 'makeHealAction' },
    [FACT_TYPES.RONG_HUI_BONUS]: { requiredFields: ['extra', 'targetAtk'], renderFn: 'renderRongHuiBonusFact', translateFn: null },

    // 韦一笑吸血
    [FACT_TYPES.WEI_LEECH]: { requiredFields: ['unitUid', 'heal'], renderFn: 'renderWeiLeechFact', translateFn: 'makeHealAction' },

    // 小昭·姊 乾坤衍生 / 蝶变
    [FACT_TYPES.QIAN_KUN_DERIVED]: { requiredFields: ['healTargetUid', 'atkTargetUid'], renderFn: 'renderQianKunDerivedFact', translateFn: 'translateAtkBuff' },
    [FACT_TYPES.BUTTERFLY_ATTACH]: { requiredFields: ['sisterUid', 'hostUid'], renderFn: 'renderButterflyAttachFact', translateFn: 'translateFlyMode' },
    [FACT_TYPES.BUTTERFLY_NO_HOST]: { requiredFields: ['sisterUid'], renderFn: 'renderButterflyNoHostFact', translateFn: 'translateFlyMode' },
    [FACT_TYPES.BUTTERFLY_RETURN]: { requiredFields: ['sisterUid', 'hostUid'], renderFn: 'renderButterflyReturnFact', translateFn: 'translateFlyMode' },
    [FACT_TYPES.BUTTERFLY_HOST_DEAD]: { requiredFields: ['sisterUid'], renderFn: 'renderButterflyHostDeadFact', translateFn: 'translateFlyMode' },

    // 巨马反伤 / 严阵以待反弹
    [FACT_TYPES.HORSE_REBOUND]: { requiredFields: ['unitName', 'rebound'], renderFn: 'renderHorseReboundFact', translateFn: 'translateRebound' },
    [FACT_TYPES.FORTIFY_REBOUND]: { requiredFields: ['unitName', 'reboundDmg'], renderFn: 'renderFortifyReboundFact', translateFn: 'translateFortifyRebound' },

    // 乘风 / 流星溅射
    [FACT_TYPES.WIND_ASSAULT_SPLASH]: { requiredFields: ['targets', 'splashDmg'], renderFn: 'renderWindAssaultSplashFact', translateFn: 'translateSplash' },
    [FACT_TYPES.WIND_ASSAULT_PUSH]: { requiredFields: ['target'], renderFn: 'renderWindAssaultPushFact', translateFn: 'translateWindAssaultPush' },
    [FACT_TYPES.WIND_ASSAULT_FAIL]: { requiredFields: ['reason'], renderFn: 'renderWindAssaultFailFact', translateFn: null },
    [FACT_TYPES.METEOR_SHOWER_MAIN]: { requiredFields: ['targetName', 'defReduce'], renderFn: 'renderMeteorShowerMainFact', translateFn: 'translateStatChange' },
    [FACT_TYPES.METEOR_SHOWER_SPLASH]: { requiredFields: ['targets'], renderFn: 'renderMeteorShowerSplashFact', translateFn: 'translateSplash' },
    [FACT_TYPES.METEOR_SPLASH_GROWTH]: { requiredFields: ['unitName', 'growth'], renderFn: 'renderMeteorSplashGrowthFact', translateFn: 'translateStatChange' },

    // 战士斩杀
    [FACT_TYPES.WARRIOR_EXECUTE]: { requiredFields: ['unitName', 'targetName'], renderFn: 'renderWarriorExecuteFact', translateFn: 'translateExecute' },

    // 嗜血 / 热血
    [FACT_TYPES.BLOOD_THIRST_LEECH]: { requiredFields: ['unitUid', 'leechVal'], renderFn: 'renderBloodthirstLeechFact', translateFn: 'makeHealAction' },
    [FACT_TYPES.HOT_BLOOD_HEAL]: { requiredFields: ['unitUid', 'leech'], renderFn: 'renderHotBloodHealFact', translateFn: 'makeHealAction' },

    // 回合分隔线 / 台词
    [FACT_TYPES.ROUND_START]: { requiredFields: ['round'], renderFn: 'renderRoundStartFact', translateFn: 'translateRoundStart' },
    [FACT_TYPES.ROUND_END]: { requiredFields: ['round'], renderFn: 'renderRoundEndFact', translateFn: 'translateRoundEnd' },
    [FACT_TYPES.ZHANG_TAUNT]: { requiredFields: ['taunt'], renderFn: 'renderZhangTauntFact', translateFn: null },

    // 白骨爪
    [FACT_TYPES.CLAW_NO_HEAL]: { requiredFields: [], renderFn: 'renderClawNoHealFact', translateFn: null },
    [FACT_TYPES.CLAW_HIT]: { requiredFields: ['dmg', 'targetName'], renderFn: 'renderClawHitFact', translateFn: null },
    [FACT_TYPES.CLAW_EXECUTE]: { requiredFields: ['unitName', 'targetName'], renderFn: 'renderClawExecuteFact', translateFn: 'translateExecute' },
    [FACT_TYPES.CLAW_HEAL]: { requiredFields: ['unitUid', 'totalHeal'], renderFn: 'renderClawHealFact', translateFn: 'makeHealAction' },

    // 行动跳过
    [FACT_TYPES.STUN_SKIP]: { requiredFields: ['unitName'], renderFn: 'renderStunSkipFact', translateFn: 'translateStunSkip' },
    [FACT_TYPES.FLY_SKIP]: { requiredFields: ['unitName'], renderFn: 'renderFlySkipFact', translateFn: 'translateFlyMode' },
});

/**
 * 校验 fact 是否满足字段契约。缺字段 → console.error 红字，不阻断流程。
 */
export function validateFactContract(type, data) {
    const spec = FACT_SPECS[type];
    if (!spec || !spec.requiredFields || spec.requiredFields.length === 0) return;
    for (const key of spec.requiredFields) {
        if (data[key] === undefined || data[key] === null) {
            console.error(`[fact契约] ${type} 缺字段: ${key}`, data);
        }
    }
}

/**
 * 从 FACT_SPECS 生成渲染映射表，供 30-fact-renderer.js 使用。
 * @param {Object<string, Function>} rendererFns - 渲染函数集合（key 为函数名，value 为函数）
 * @returns {Object<string, Function>} factType → 渲染函数
 */
export function buildRendererMap(rendererFns) {
    const map = {};
    for (const [type, spec] of Object.entries(FACT_SPECS)) {
        if (!spec.renderFn) { map[type] = () => null; continue; }
        const fn = rendererFns[spec.renderFn];
        if (typeof fn !== 'function') {
            console.error(`[58] 渲染函数未注册: ${spec.renderFn}（factType ${type}）`);
            map[type] = () => null;
            continue;
        }
        map[type] = fn;
    }
    return map;
}

/**
 * 从 FACT_SPECS 生成翻译映射表，供 31-stage-actions.js 使用。
 * @param {Object<string, Function>} translatorFns - 翻译函数集合（key 为函数名，value 为函数）
 * @returns {Object<string, Function>} factType → 翻译函数
 */
export function buildTranslatorMap(translatorFns) {
    const map = {};
    for (const [type, spec] of Object.entries(FACT_SPECS)) {
        if (!spec.translateFn) { map[type] = null; continue; }
        const fn = translatorFns[spec.translateFn];
        if (typeof fn !== 'function') {
            console.error(`[58] 翻译函数未注册: ${spec.translateFn}（factType ${type}）`);
            map[type] = null;
            continue;
        }
        map[type] = fn;
    }
    return map;
}