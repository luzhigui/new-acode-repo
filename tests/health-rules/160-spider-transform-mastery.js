// 回归规则：蛛变 / 精通 数值 — 此前这两条 group 只有对照器（stat-decl）盯"声明==实际"，
//   规则侧完全看不到（SPIDER_TRANSFORM fact 虽发射，但规则只看渲染文案）。2026-10-08 Step 0 后
//   规则能读原始 fact（rule.test 第 7 参 facts），本规则据此重算对账，真正长牙。
// 机制源（modules/20elite-skills.js L130-161 spiderTransform）：
//   - 蛛变：每次变身叠加新职业加成（newRole），atkDelta/defDelta/maxHpDelta
//     = newStats.atk/def/maxHp = getRoleBonus(newRole).{atk,def,maxHp}；不扣旧。
//   - 精通：首次精通（isNewMastery）按层数差结算 masteryGain = { atk:gained*m.atkPer, def:gained*m.defPer, hp:gained*m.hpPer }
//     m = getSkillParams('小昭','mastery')；gained = 本层 − 上层（正整数）。
// 为什么值得盯（真实回归，非对照器能替）：对照器只验"声明值==实际加值"，本规则验"声明值本身算对没"——
//   即 getRoleBonus / 精通系数被改、或两层加成归属错乱时，对照器（看 addMod 入参）未必现形，重算对账会。
// 复活信号：
//   1) data.atkDelta !== getRoleBonus(data.newRole).atk（含 def/maxHp）→ 蛛变数值漂移（取错角色 / getRoleBonus 被改）
//   2) 若 data.masteryGain 存在：g = mg.atk / m.atkPer 必须为整数，且 mg.def === g*m.defPer、mg.hp === g*m.hpPer
//      → 精通系数 m.*Per 被改、或 gained 算错（两层叠加归属错乱）
//   3) data.mastered < 1 → 已掌握角色数异常
// 误报规避：本场无 SPIDER_TRANSFORM fact 直接 skip；getRoleBonus / getSkillParams 取不到配置就跳过对应判据。
export const VER = 'tests/health-rules/160-spider-transform-mastery.js V1.0.0';
import { getRoleBonus } from '../../core/02unit.js';
import { getSkillParams } from '../../core/01config-5v5-test.js';
import { FACT_TYPES } from '../../infra/56-battle-enums.js';

export const rule107 = {
    group: '数值回归',
    name: '蛛变/精通数值(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!Array.isArray(facts) || facts.length === 0) return 'skip';
        let checked = 0;
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || f.factType !== FACT_TYPES.SPIDER_TRANSFORM) continue;
            const d = f.data || {};
            if (typeof d.newRole === 'undefined') continue;

            // 判据1：蛛变数值 == getRoleBonus(newRole)（atk/def/maxHp 三项）
            let rb = null;
            try { rb = getRoleBonus(d.newRole); } catch (e) { rb = null; }
            if (rb && typeof rb.atk === 'number') {
                if (d.atkDelta !== rb.atk || d.defDelta !== rb.def || d.maxHpDelta !== rb.maxHp) {
                    return { fail: true, msg: '复发：蛛变数值漂移（newRole=' + d.newRole + '）事实 atk/def/maxHp='
                        + d.atkDelta + '/' + d.defDelta + '/' + d.maxHpDelta + '，应=' + rb.atk + '/' + rb.def + '/' + rb.maxHp };
                }
            }

            // 判据2：精通数值（masteryGain 存在时，用比值反推 gained 再核 def/hp 比例）
            const mg = d.masteryGain;
            if (mg && typeof mg.atk === 'number') {
                let m = null;
                try { m = getSkillParams('小昭', 'mastery'); } catch (e) { m = null; }
                if (m && typeof m.atkPer === 'number' && m.atkPer !== 0) {
                    const g = mg.atk / m.atkPer;
                    if (!isFinite(g) || g < 0 || Math.floor(g) !== g) {
                        return { fail: true, msg: '复发：精通层数差 g=' + mg.atk + '/' + m.atkPer + ' 非整数（精通结算错）' };
                    }
                    if (mg.def !== g * m.defPer || mg.hp !== g * m.hpPer) {
                        return { fail: true, msg: '复发：精通数值不成比例（atkPer:defPer:hpPer=' + m.atkPer + ':' + m.defPer + ':' + m.hpPer
                            + '），实为 ' + mg.atk + ':' + mg.def + ':' + mg.hp };
                    }
                }
            }

            // 判据3：已掌握角色数
            if (typeof d.mastered === 'number' && d.mastered < 1) {
                return { fail: true, msg: '复发：SPIDER_TRANSFORM.mastered=' + d.mastered + '（应≥1）' };
            }
            checked++;
        }
        if (checked === 0) return 'skip';
        return { fail: false };
    }
};
