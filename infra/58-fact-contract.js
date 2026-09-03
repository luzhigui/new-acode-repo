// infra/58-fact-contract.js - 光明顶5v5 fact 必填字段契约（校验清单）
// V1.0.1 | ~2200 bytes | 2026-09-03 fact 契约补全：覆盖全部 FACT_TYPES（72 key），缺字段红字报错不静默吞
export const VER = 'infra/58-fact-contract.js V1.0.1';

import { FACT_TYPES } from './56-battle-enums.js';

/**
 * fact 必填字段契约。
 * 每个 factType 列出"渲染/特效必须读到、漏了会静默吞或直接 TypeError"的字段。
 * 覆盖 FACT_TYPES 全部 key（即便某 type 无危险字段也给空数组，保证键齐全）。
 */
const FACT_REQUIRED_FIELDS = {
    // 回血类：弹幕定位必须知道在哪个格子
    [FACT_TYPES.BLOOD_THIRST_LEECH]: ['unitUid', 'leechVal'],
    [FACT_TYPES.HOT_BLOOD_HEAL]: ['unitUid', 'leech'],
    [FACT_TYPES.PHANTOM_DISGUISE_HEAL]: ['unitUid', 'heal'],
    [FACT_TYPES.CLAW_HEAL]: ['unitUid', 'totalHeal'],
    [FACT_TYPES.NINE_YANG_HEAL]: ['unitUid', 'heal'],
    [FACT_TYPES.WEI_LEECH]: ['unitUid', 'heal'],
    [FACT_TYPES.KUAI_LE_HEAL]: ['unitUid', 'heal'],
    // 攻击/闪避核心：渲染读这些对象（可能 undefined 直接 Type aError）
    [FACT_TYPES.ATTACK]: ['attacker', 'target', 'dmgResult'],
    [FACT_TYPES.DODGE]: ['attacker', 'dodger', 'reboundDmg'],
    [FACT_TYPES.MISS]: ['attacker', 'target'],
    [FACT_TYPES.IMMUNE]: ['attacker', 'target'],
    [FACT_TYPES.EMPTY_TARGET]: ['attacker'],
    // 掉落/破防
    [FACT_TYPES.DROP]: ['kind'],
    [FACT_TYPES.BREAK_DEF]: ['attackerName'],
    // 拒马 / 张无忌
    [FACT_TYPES.HORSE_DESTROY]: ['success'],
    [FACT_TYPES.ZHANG_SWITCH]: ['zhang'],
    // Buff 摘要 / carry
    [FACT_TYPES.BUFF_SUMMARY]: ['buff'],
    [FACT_TYPES.CARRY_APPLY]: ['unitName'],
    // 召唤/换位：位置与 uid
    [FACT_TYPES.HORSE_SUMMON]: ['horseUid', 'pos'],
    [FACT_TYPES.XIAO_ZHAO_HORSE]: ['horseUid', 'pos'],
    [FACT_TYPES.MIND_CONTROL_SWAP]: ['unitA', 'unitB'],
    [FACT_TYPES.WIND_ASSAULT_PUSH]: ['target'],
    // 行动跳过 / 苦练 / 连击 / 成长
    [FACT_TYPES.PASS]: ['unit'],
    [FACT_TYPES.KU_LIAN_PRIORITY]: ['unitName'],
    [FACT_TYPES.KU_LIAN]: ['unitName'],
    [FACT_TYPES.DOUBLE_STRIKE]: ['success'],
    [FACT_TYPES.RANGED_GROWTH]: ['unitName'],
    [FACT_TYPES.FORTIFY_SHIELD]: ['unitName'],
    [FACT_TYPES.DOUBLE_STRIKE_SUMMARY]: ['unitName'],
    [FACT_TYPES.STUN_SKIP]: ['unitName'],
    [FACT_TYPES.FLY_SKIP]: ['unitName'],
    // 惑心
    [FACT_TYPES.MIND_CONTROL_FAIL]: ['side'],
    [FACT_TYPES.MIND_CONTROL_BANNER]: ['side'],
    // 乾坤大挪移
    [FACT_TYPES.QIAN_KUN_UPGRADED]: ['rebound', 'zhangUid'],
    [FACT_TYPES.QIAN_KUN_BASIC]: ['rebound', 'zhangUid'],
    // 小昭蛛变 / 蛛袭（蛛袭不产文本，无危险字段）
    [FACT_TYPES.SPIDER_TRANSFORM]: ['unitName'],
    [FACT_TYPES.SPIDER_RETURN]: ['spiderUid', 'pos'],
    [FACT_TYPES.SPIDER_STRIKE]: [],
    [FACT_TYPES.SPIDER_DOUBLE_STRIKE]: [],
    [FACT_TYPES.SPIDER_FLY]: ['spiderUid'],
    [FACT_TYPES.SPIDER_DEAD_TARGET]: [],
    // 玄冥神掌
    [FACT_TYPES.XUAN_MING_DOT]: ['uidD', 'dot'],
    [FACT_TYPES.XUAN_MING_POISONED]: ['dotPercents'],
    [FACT_TYPES.XUAN_MING_LINK_ATTACK]: ['partnerName', 'unitName'],
    // 宋青书新婚 / 性奋
    [FACT_TYPES.XING_FEN_RETRY]: ['unitName'],
    [FACT_TYPES.XIN_HUN]: ['stackCount', 'zhouUid'],
    [FACT_TYPES.XING_FEN_COST]: ['unitName'],
    [FACT_TYPES.XING_FEN_EXTRA_ATTACK]: ['unitName'],
    [FACT_TYPES.XING_FEN_GRANT]: ['songName', 'zhouName'],
    [FACT_TYPES.XIN_HUN_DEATH]: ['uidD'],
    // 张无忌九阳 / 融会贯通
    [FACT_TYPES.RONG_HUI_BONUS]: ['extra', 'targetAtk'],
    // 小昭·姊 乾坤衍生 / 蝶变
    [FACT_TYPES.QIAN_KUN_DERIVED]: ['healTargetUid', 'atkTargetUid'],
    [FACT_TYPES.BUTTERFLY_ATTACH]: ['sisterUid', 'hostUid'],
    [FACT_TYPES.BUTTERFLY_NO_HOST]: ['sisterUid'],
    [FACT_TYPES.BUTTERFLY_RETURN]: ['sisterUid', 'hostUid'],
    [FACT_TYPES.BUTTERFLY_HOST_DEAD]: ['sisterUid'],
    // 巨马反伤 / 严阵以待反弹
    [FACT_TYPES.HORSE_REBOUND]: ['unitName', 'rebound'],
    [FACT_TYPES.FORTIFY_REBOUND]: ['unitName', 'reboundDmg'],
    // 乘风 / 流星溅射
    [FACT_TYPES.WIND_ASSAULT_SPLASH]: ['targets', 'splashDmg'],
    [FACT_TYPES.WIND_ASSAULT_FAIL]: ['reason'],
    [FACT_TYPES.METEOR_SPLASH_GROWTH]: ['unitName', 'growth'],
    [FACT_TYPES.METEOR_SHOWER_MAIN]: ['targetName', 'defReduce'],
    [FACT_TYPES.METEOR_SHOWER_SPLASH]: ['targets'],
    // 战士斩杀
    [FACT_TYPES.WARRIOR_EXECUTE]: ['unitName', 'targetName'],
    // 回合分隔线 / 台词
    [FACT_TYPES.ROUND_START]: ['round'],
    [FACT_TYPES.ROUND_END]: ['round'],
    [FACT_TYPES.ZHANG_TAUNT]: ['taunt'],
    // 白骨爪
    [FACT_TYPES.CLAW_NO_HEAL]: [],
    [FACT_TYPES.CLAW_HIT]: ['dmg', 'targetName'],
    [FACT_TYPES.CLAW_EXECUTE]: ['unitName', 'targetName'],
    // 幻影伪装识破/etc
    [FACT_TYPES.PHANTOM_REVEAL]: ['unitName', 'deceiver'],
    [FACT_TYPES.PHANTOM_CONFUSE]: ['unitName', 'deceiver'],
};

/**
 * 校验 fact 是否满足字段契约。缺字段 → console.error 红字，不阻断流程。
 * @param {string} type - factType
 * @param {object} data - fact.data
 */
export function validateFactContract(type, data) {
    const required = FACT_REQUIRED_FIELDS[type];
    if (!required) return;
    for (const key of required) {
        if (data[key] === undefined || data[key] === null) {
            console.error(`[fact契约] ${type} 缺字段: ${key}`, data);
        }
    }
}