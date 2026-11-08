// 隐藏渲染器（renderFn:null）出口登记守卫：账有屏无的边界必须逐类写清
// 背景：infra/107 里有一批 fact 显式声明「不上面」（renderFn:null）。它们分两类：
//   a. 纯账本/UI 状态（属性 apply、buff 图标），屏上由别的 fact 出；
//   b. 真正一条结算（如 ABSORB_SUMMARY），屏上由同批 SKILL_ANNOUNCE 行出。
// 两类都必须有「账 → 屏」的明确出口，否则就是玩家看不见的静默账。
// 本规则是静态守卫：renderFn:null 的每个 factType 都必须在下面的白名单里登记出口，
//   新增隐藏渲染器却不登记出口 ⇒ 直接红；白名单里的类型若已被改成可见渲染器 ⇒ 也红（防止陈旧登记）。
// 判据来源（2026-11-08 实测 156 场）：14 类隐藏渲染器全部登记，0 条未登记。
export const VER = 'tests/health-rules/272-hidden-renderer-outlets.js V1.0.0';
import { FACT_SPECS } from '../../infra/107-fact-contract.js';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

// 隐藏渲染器判定：infra/107 声明 renderFn:null，或渲染器名以 Hidden 结尾（实现恒返回 null）
function isHidden(type) {
    var spec = FACT_SPECS[type];
    if (!spec) return false;
    if (spec.renderFn === null) return true;
    return typeof spec.renderFn === 'string' && /Hidden$/.test(spec.renderFn);
}

// 隐藏渲染器 → 屏上出口（每条都必须写清「谁替它出画面」）
var HIDDEN_OUTLETS = {
    [FACT_TYPES.UNIT_DEATH]: '阵亡行由击杀/攻击组结算行呈现（renderKillLineFact）',
    [FACT_TYPES.BAGUA_ARRAY]: '八卦阵数值由 translateBaguaArray 的舞台动作呈现',
    [FACT_TYPES.RAGE_ON_HIT]: '受击激怒只改状态，数值行由属性变更入口统一出',
    [FACT_TYPES.LION_INSPIRE]: '狮吼报幕由 LION_GROW/技能报幕行呈现',
    [FACT_TYPES.STAT_CHANGE_APPLY]: '属性 apply 只记账，屏上由属性变更行出',
    [FACT_TYPES.AURA_APPLY]: '血雾光环只记账，光环效果由格子/buff 摘要呈现',
    [FACT_TYPES.HOLY_FLAME_APPLY]: '圣火百分比 apply 只记账，屏上由 BUFF_SUMMARY 摘要出',
    [FACT_TYPES.SOUL_DRAIN_APPLY]: '摄魂 apply 只记账，屏上由 BUFF_SUMMARY 摘要出',
    [FACT_TYPES.LAST_STAND_APPLY]: '背水 apply 只记账，屏上由 BUFF_SUMMARY 摘要出',
    [FACT_TYPES.UNITY_APPLY]: '同心 apply 只记账，屏上由 BUFF_SUMMARY 摘要出',
    [FACT_TYPES.TW_DASH_APPLY]: '唐文亮冲刺 apply 只记账，屏上由冲刺报幕/攻击组出',
    [FACT_TYPES.XIAO_ZHAO_CARRY_APPLY]: '小昭搬运 apply 只记账，屏上由 CARRY_APPLY 行出',
    [FACT_TYPES.WEI_DODGE_LEECH]: '韦一笑闪避吸血记账，屏上由 HEAL 行出',
    [FACT_TYPES.ABSORB_SUMMARY]: '吸星汇总只记账，屏上由同批 SKILL_ANNOUNCE 吸星行出（规则 267 对账）'
};

export const rule272 = {
    group: '战报与渲染一致性',
    name: '隐藏渲染器出口逐类登记',
    test: function() {
        var missing = [];
        var seen = 0;
        for (var type in FACT_SPECS) {
            if (!Object.prototype.hasOwnProperty.call(FACT_SPECS, type)) continue;
            if (isHidden(type)) {
                seen++;
                if (!HIDDEN_OUTLETS[type]) missing.push(type);
            }
        }
        if (missing.length > 0) {
            return { fail: true, msg: '隐藏渲染器未登记屏上出口：' + missing.join(', ') + '（新增 renderFn:null 必须写清谁替它出画面）' };
        }
        // 陈旧登记：白名单里的类型已经不再是隐藏渲染器
        var stale = [];
        for (var t2 in HIDDEN_OUTLETS) {
            if (!Object.prototype.hasOwnProperty.call(HIDDEN_OUTLETS, t2)) continue;
            if (!FACT_SPECS[t2] || !isHidden(t2)) stale.push(t2);
        }
        if (stale.length > 0) {
            return { fail: true, msg: '隐藏渲染器登记已陈旧：' + stale.join(', ') + ' 现在有可见渲染器，请从白名单移除' };
        }
        return { fail: false, msg: '隐藏渲染器出口登记完整：' + seen + ' 类' };
    }
};
