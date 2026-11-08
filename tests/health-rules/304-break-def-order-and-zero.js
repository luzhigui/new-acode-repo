// 回归规则：破防（BREAK_DEF）条目时序与零减防静默 —— 304 线（伤害数值与取整域）
// 机制真源：
//   core/217 L86-101 registerCalcModifier(BREAK_DEF)：reduce = min(声明量, refs.defBase)；
//     · reduce > 0 → refs.pendingDefReduceFact = {reduce}
//     · reduce === 0 → pendingDefReduceFact = null（实落减防为 0 不产条目，避免「减防 0.8 实际 0」）
//   核心/渲染两层时序（任一不符判红）：
//   A. 时序：BREAK_DEF 必须排在所有「伤害结算类」条目之前（引擎在算伤害前压栈；
//      core/209 L106-112 允许把「本击前回血」类条目 unshift 到更前，故不要求死板 index 0）
//   B. 数值：reduce 必须是整数且 >0，且严格等于本击 dmgCalc.defReduced（声明=实落）
//   C. 零减防静默：本击 defReduced === 0 时不得出现 BREAK_DEF 条目
//   D. 反向漏账：本击实际减了防（defReduced > 0）却没有 BREAK_DEF 条目
//   E. 渲染顺序：战报里「破防/减防」行必须出现在本击伤害行之前
// 零触发守卫：本局无破防条目且无实落减防 → skip。
export const VER = 'tests/health-rules/304-break-def-order-and-zero.js V1.0.1';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';
import { collectNodesGrouped, plain } from '../122health-utils.js';

// 伤害结算类条目（这些若排在 BREAK_DEF 之前 = 破防晚于命中结算，判红）
const DAMAGE_AFTER = new Set([
    FACT_TYPES.RONG_HUI_BONUS,
    FACT_TYPES.METEOR_SHOWER_SPLASH,
    FACT_TYPES.WIND_ASSAULT_SPLASH,
    FACT_TYPES.DISCIPLE_REBOUND,
    FACT_TYPES.HORSE_REBOUND,
    FACT_TYPES.FORTIFY_REBOUND,
    FACT_TYPES.WEI_LEECH
]);

function isNum(v) { return typeof v === 'number' && isFinite(v); }

export const rule304 = {
    group: '伤害数值与取整',
    name: '破防条目时序与零减防静默(回归)',
    test: function (ctx, log) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

        // 渲染顺序证据：按攻击组找「破防行」与「伤害行」的先后
        const groups = collectNodesGrouped(log);
        const badGroups = new Set();
        {
            const byGi = new Map();
            for (const { e, gi } of groups) {
                if (!byGi.has(gi)) byGi.set(gi, []);
                byGi.get(gi).push(e);
            }
            for (const list of byGi.values()) {
                let bdIdx = -1, dmgIdx = -1;
                list.forEach((e, i) => {
                    const t = plain(e && e.text);
                    // 只认 render/407 renderBreakDefFact 的固定措辞「X 破防：」，避免溅射/流星条的
                    //   「防御-N」误命中（那是后置条目，不是破防行）
                    if (bdIdx < 0 && /破防：/.test(t)) bdIdx = i;
                    if (dmgIdx < 0 && e && e.type === 'damage-text') dmgIdx = i;
                });
                if (bdIdx >= 0 && dmgIdx >= 0 && bdIdx > dmgIdx) badGroups.add(list);
            }
        }

        let saw = 0;
        const fails = [];

        for (const f of facts) {
            if (!f || f.factType !== FACT_TYPES.ATTACK) continue;
            const d = f.data || {};
            const calc = d.dmgCalc || {};
            const entries = Array.isArray(d.entries) ? d.entries : [];
            const bdIdx = entries.findIndex(e => e && e.factType === FACT_TYPES.BREAK_DEF);
            const defReduced = calc.defReduced;
            const round = isNum(d.round) ? d.round : '';

            if (bdIdx >= 0) {
                saw++;
                const bd = entries[bdIdx].data || {};
                const reduce = bd.reduce;

                // A. 时序：破防之前只能是回血/报幕类条目，不能有伤害结算类
                const before = entries.slice(0, bdIdx);
                const badBefore = before.filter(x => x && (DAMAGE_AFTER.has(x.factType) || (x.type === 'damage-text')));
                if (badBefore.length > 0) {
                    fails.push(`本击破防排在第 ${bdIdx} 位，前有伤害结算条目 ${badBefore.length} 条（破防必须早于命中结算）`);
                }
                // B. 数值
                if (!isNum(reduce) || reduce <= 0) {
                    fails.push(`破防 reduce=${String(reduce)} 非法（必须 >0；0 应静默不产条目）`);
                } else {
                    if (Math.abs(reduce - Math.round(reduce)) > 1e-9) {
                        fails.push(`破防 reduce=${reduce} 非整数（取整口径失守）`);
                    }
                    if (!isNum(defReduced) || Math.abs(defReduced - reduce) > 1e-9) {
                        fails.push(`破防声明 ${reduce} ≠ 实际减防 ${String(defReduced)}（条目与实落不同源）`);
                    }
                }
            } else {
                // C. 零减防静默 / D. 反向漏账
                if (isNum(defReduced) && defReduced > 0) {
                    saw++;
                    fails.push(`本击实际减防 ${defReduced} 却没有 BREAK_DEF 条目（漏账）`);
                }
            }
        }

        // E. 渲染顺序（只要有一组倒序就算红）
        if (badGroups.size > 0) {
            saw += badGroups.size;
            fails.push(`${badGroups.size} 个攻击组的破防行排在伤害行之后（应在前）`);
        }

        if (saw === 0) return 'skip';
        if (fails.length) return { fail: true, msg: fails.slice(0, 4).join('；') };
        return 'pass';
    }
};
