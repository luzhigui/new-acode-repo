// 回归规则：属性变更数值（STAT_CHANGE_APPLY fact）— 此前该 group 完全在规则视野外：它的 renderFn:null
//   （契约明示"数值声明 fact 不进画面"），规则只看渲染文案根本看不到它，只能靠对照器（stat-decl）兜底。
//   2026-10-08 Step 0 后规则能读原始 fact 流，本规则让 STAT_CHANGE_APPLY 也进规则视野。
// 机制源（core/16effect-handlers.js L205-220 applyStatChange）：decl.field 为 atk/def 时 addMod + 发
//   STAT_CHANGE_APPLY fact（field/delta/reason 同源）；其余字段走 applyStatChange 不发 fact。
// 说明：属性变更的"数值是否正确落地"由对照器（stat-decl，偏差 0）把关，本规则不重复那一层；它补的是
//   规则侧此前**完全看不到**该 fact 的盲区，抓 gross-error 一类：delta 非有限数（取整/漏值）、field 非法、
//   reason 丢失（声明源定位失效）。属第一道粗筛，与对照器互补而非替代。
// 复活信号：
//   1) delta 非有限数 → 取整被改 / 声明漏值（NaN 会污染永久词条）
//   2) field 不在已知属性集 → 改了未登记的字段（契约缺口）
//   3) reason 空串 → 声明源丢失，复盘无法定位谁改的
// 误报规避：本场无 STAT_CHANGE_APPLY fact 直接 skip。
export const VER = 'tests/health-rules/162-stat-change.js V1.0.0';
import { FACT_TYPES } from '../../infra/56-battle-enums.js';

const VALID_FIELDS = { atk: 1, def: 1, maxHp: 1, hp: 1, spd: 1, cri: 1, eva: 1, act: 1 };

export const rule109 = {
    group: '数值回归',
    name: '属性变更数值(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!Array.isArray(facts) || facts.length === 0) return 'skip';
        let checked = 0;
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || f.factType !== FACT_TYPES.STAT_CHANGE_APPLY) continue;
            const d = f.data || {};
            if (typeof d.delta !== 'number' || !isFinite(d.delta)) {
                return { fail: true, msg: '复发：属性变更 delta=' + d.delta + '（非有限数，取整/漏值）' };
            }
            if (!d.field || !VALID_FIELDS[d.field]) {
                return { fail: true, msg: '复发：属性变更 field=' + d.field + '（未登记字段）' };
            }
            if (typeof d.reason !== 'string' || !d.reason) {
                return { fail: true, msg: '复发：属性变更 reason 为空（声明源丢失，无法定位改动方）' };
            }
            checked++;
        }
        if (checked === 0) return 'skip';
        return { fail: false };
    }
};
