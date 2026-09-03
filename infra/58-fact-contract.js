// infra/58-fact-contract.js - 光明顶5v5 fact 必填字段契约（校验清单）
// V1.0.0 | ~900 bytes| 2026-09-03 fact 契约首版：覆盖高频回血/攻击/换位类，缺字段红字报错不静默吞
export const VER = 'infra/58-fact-contract.js V1.0.0';

import { FACT_TYPES } from './56-battle-enums.js';

/**
 * fact 必填字段契约。
 * 每个 factType 列出"渲染/特效必须读到的字段"。
 * 未列出的 factType 暂不校验，后续按需补全。
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
    // 攻击/闪避核心：渲染读这些对象
    [FACT_TYPES.ATTACK]: ['attacker', 'target', 'dmgResult'],
    [FACT_TYPES.DODGE]: ['attacker', 'dodger', 'reboundDmg'],
    [FACT_TYPES.MISS]: ['attacker', 'target'],
    // 召唤/换位：位置与 uid
    [FACT_TYPES.HORSE_SUMMON]: ['horseUid', 'pos'],
    [FACT_TYPES.XIAO_ZHAO_HORSE]: ['horseUid', 'pos'],
    [FACT_TYPES.MIND_CONTROL_SWAP]: ['unitA', 'unitB'],
    [FACT_TYPES.WIND_ASSAULT_PUSH]: ['target'],
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