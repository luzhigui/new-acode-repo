// 回归规则：唐文亮「回春术」每跳回血量是否按 content 参数逐层复利
// 真值源（content/001-game-data.json 唐文亮 skills.huiChunShu.params）：
//   lostHpPct=0.15（每层按当前已损血 15% 回）、lostHpPctLow=0.25（当前血 < maxHp×lowHpThreshold
//   (0.3) 时改用 25%）、rounds=3（每层存续 3 跳）。
// 引擎落点（modules/315 tickHuiChun）：逐层推进 —— 每层取「回血前」的 vhp 算
//   healed = floor((maxHp − vhp) × r)，vhp 递增后再算下一层；total 求和后一次
//   applyStatChange，并推 HEAL fact（label='回春术'，heal=实际回血, hpBefore/hpAfter=展示值）。
// 复发信号：
//   1) heal 不等于任何 k 层（k≤30）复利档位 → 引擎比例被写死/改了与 content 脱钩；
//   2) hpAfter − hpBefore ≠ heal → 播报/落账两套数值不同源；
//   3) 低血档位（<30%）用了 15%、高血档位用了 25%（阈值判断写反）。
// 观测缺口（不造假规则）：HEAL fact 不带 maxHp / stacks，所以 maxHp 取「同一单位在
//   前面 fact 里最近的快照 maxHp」；治疗被截脉/寒毒等减疗机制打折时（heal 小于最小单层值），
//   该样本跳过不判（减疗由其他规则负责），避免误报。
// 误报规避：本场无「回春术」HEAL fact → skip；展示血量取整，允许 ±1。
export const VER = 'tests/health-rules/196-tangwenliang-huichun.js V1.0.0';
import { FACT_TYPES, ROLE_TYPES } from '../../infra/106-battle-enums.js';
import { getSkillParams } from '../../core/201-config-5v5-test.js';
import { getRoleBonus } from '../../core/202-unit.js';

function num(v) {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return null;
    var s = v.replace(/[^\d.\-]/g, '');
    if (!s) return null;
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
}

// 逐层复利：返回 k=1..limit 的累计回血量数组
function foldTotals(hpStart, maxHp, hc, limit) {
    var out = [];
    var vhp = hpStart;
    var total = 0;
    for (var k = 1; k <= limit; k++) {
        var ratio = (vhp < maxHp * hc.lowHpThreshold) ? hc.lostHpPctLow : hc.lostHpPct;
        var healed = Math.floor((maxHp - vhp) * ratio);
        total += healed;
        vhp = Math.min(maxHp, vhp + healed);
        out.push(total);
        if (healed <= 0) break;
    }
    return out;
}

// 在 fact 序列里向前找该单位最近的快照（ATTACK 的 attacker/target），取当前 maxHp
function latestMaxHp(facts, idx, unitName) {
    for (var i = idx - 1; i >= 0; i--) {
        var f = facts[i];
        if (!f || !f.data) continue;
        if (f.factType !== FACT_TYPES.ATTACK) continue;
        var d = f.data;
        if (d.attacker && d.attacker.name === unitName && d.attacker.maxHp != null) return d.attacker.maxHp;
        if (d.target && d.target.name === unitName && d.target.maxHp != null) return d.target.maxHp;
    }
    return null;
}

export const rule196 = {
    group: '技能效果回归',
    name: '唐文亮回春术逐层回血(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!facts || facts.length === 0) return 'skip';
        var hc = getSkillParams('唐文亮', 'huiChunShu') || {};
        var lostHpPct = (hc.lostHpPct != null) ? hc.lostHpPct : 0.15;
        var lostHpPctLow = (hc.lostHpPctLow != null) ? hc.lostHpPctLow : 0.25;
        var lowHpThreshold = (hc.lowHpThreshold != null) ? hc.lowHpThreshold : 0.3;
        var p = { lostHpPct: lostHpPct, lostHpPctLow: lostHpPctLow, lowHpThreshold: lowHpThreshold };

        var samples = 0, debuffed = 0;
        for (var i = 0; i < facts.length; i++) {
            var f = facts[i];
            if (!f || f.factType !== FACT_TYPES.HEAL || !f.data) continue;
            if (f.data.label !== '回春术') continue;
            var heal = num(f.data.heal);
            if (heal == null || heal <= 0) continue;

            // 播报与落账同源：hpAfter − hpBefore 必须等于 heal（±1）
            var hpBefore = num(f.data.hpBefore);
            var hpAfter = num(f.data.hpAfter);
            if (hpBefore != null && hpAfter != null) {
                samples++;
                if (Math.abs((hpAfter - hpBefore) - heal) > 1) {
                    return { fail: true, msg: '复发：回春术 hpAfter−hpBefore=' + (hpAfter - hpBefore) + ' ≠ heal=' + heal + '（播报/落账不同源）' };
                }
            } else {
                continue;
            }

            var maxHp = latestMaxHp(facts, i, f.data.unitName || '唐文亮');
            if (maxHp == null || !(maxHp > 0) || maxHp < hpBefore) continue;   // 观测缺口，跳过

            samples++;
            // maxHp 候选：冲刺转战士会给唐文亮 +战士 maxHp（applyRoleBonusMods 全额），
            //   而「最近快照」可能落在转职前 → 同时按「快照值 / 快照值+战士加成」两档重算，
            //   任一档命中即通过；两档都不命中才判红（比例被写死/脱钩仍会红）。
            var wb = 0;
            try { wb = getRoleBonus(ROLE_TYPES.WARRIOR).maxHp || 0; } catch (e) { wb = 0; }
            var candidates = [maxHp];
            if (wb > 0) candidates.push(maxHp + wb);

            var matched = false, bestMsg = '';
            var minAll = Infinity;
            for (var ci = 0; ci < candidates.length; ci++) {
                var M = candidates[ci];
                if (!(M > 0) || M < hpBefore) continue;
                var folds = foldTotals(hpBefore, M, p, 30);
                var minFold = folds.length ? folds[0] : 0;
                if (minFold < minAll) minAll = minFold;
                for (var k = 0; k < folds.length; k++) {
                    if (Math.abs(heal - folds[k]) <= 1) { matched = true; break; }
                }
                if (matched) break;
                if (!bestMsg) {
                    var ratio = (hpBefore < M * lowHpThreshold) ? lostHpPctLow : lostHpPct;
                    var one = Math.floor((M - hpBefore) * ratio);
                    bestMsg = '回血 ' + heal + ' 不在配置复利档位（maxHp=' + M + '，hp=' + hpBefore + '，单层应为 ' + one + '，档位上限 ' + folds[folds.length - 1] + '，配置 ' + lostHpPct + '/' + lostHpPctLow + '）';
                }
            }
            // 治疗被减疗机制打折 → 小于最小单层值，交给减疗规则，不判
            if (!matched && heal < minAll && minAll > 0) { debuffed++; continue; }
            if (!matched) {
                return { fail: true, msg: '复发：回春术' + bestMsg };
            }
        }
        if (samples === 0) return 'skip';
        return { fail: false };
    }
};
