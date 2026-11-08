// 回归规则：唐文亮「七伤拳」自损量 / 伤害倍率 / 临危档位 是否按 content 参数生效
// 真值源（content/001-game-data.json 唐文亮 skills.qiShangQuan.params）：
//   selfHpPct=0.04（自损 maxHp 的 4%，最少 minSelfDmg=1，留 1 血）、dmgBonus=0.45（伤害×1.45）、
//   lowHpThreshold=0.3 / lowHpExtra=0.3（出手前生命 <30% 时再 +0.3 → ×1.75）。
// 引擎落点（modules/315）：BEFORE_DAMAGE_CALC 推 DMG_MULTIPLIER（label 七伤拳 / 七伤拳·临危），
//   自损走 applyStatChange 并于本击攻击组 entries 开头插一条报幕：
//   「👊 唐文亮七伤拳：自损 N 点生命（伤己 i/7），本次伤害 ×M（临危加成）」。
// 复发信号：
//   1) 报幕倍率 M ≠ 1 + dmgBonus（(+ lowHpExtra)），或临危标注与「出手前生命 < 阈值」不一致；
//   2) 该击的 DMG_MULTIPLIER 声明缺失（报幕写 ×1.45/×1.75，实际伤害没乘）；
//   3) 自损 N ≠ min(max(minSelfDmg, round(maxHp×4%)), 剩余血-1)（配置改了引擎没跟 / 写死旧值）。
// 误报规避：本场无唐文亮命中报幕直接 skip；快照血量是展示取整值，自损公式允许 ±1 误差；
//   出手计数（伤己 i/7）由被击/冲刺路径共同推进，本规则不校验序号，只校验「分母=content cycle」。
export const VER = 'tests/health-rules/191-tangwenliang-qishang.js V1.0.0';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';
import { getSkillParams } from '../../core/201-config-5v5-test.js';
import { plain } from '../122health-utils.js';

function entryText(fact) {
    if (!fact || !fact.data || !Array.isArray(fact.data.entries)) return '';
    for (var i = 0; i < fact.data.entries.length; i++) {
        var t = fact.data.entries[i] && fact.data.entries[i].text;
        if (typeof t === 'string' && t.indexOf('七伤拳') !== -1) return plain(t);
    }
    return '';
}

function multEntry(dmgCalc, key) {
    var arr = (dmgCalc && dmgCalc.dmgMultiplierEntries) || [];
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] && typeof arr[i].label === 'string' && arr[i].label.indexOf(key) !== -1) return arr[i].value;
    }
    return null;
}

export const rule191 = {
    group: '技能效果回归',
    name: '唐文亮七伤拳自损与增伤(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!facts || facts.length === 0) return 'skip';
        var qi = getSkillParams('唐文亮', 'qiShangQuan') || {};
        var selfHpPct = (qi.selfHpPct != null) ? qi.selfHpPct : 0.04;
        var minSelfDmg = (qi.minSelfDmg != null) ? qi.minSelfDmg : 1;
        var dmgBonus = (qi.dmgBonus != null) ? qi.dmgBonus : 0.45;
        var lowHpThreshold = (qi.lowHpThreshold != null) ? qi.lowHpThreshold : 0.3;
        var lowHpExtra = (qi.lowHpExtra != null) ? qi.lowHpExtra : 0.3;
        var chong = getSkillParams('唐文亮', 'chongCi') || {};
        var cycle = (chong.cycle != null) ? chong.cycle : 7;   // 七伤循环 = 冲刺 chongCi.cycle

        var samples = 0;
        for (var i = 0; i < facts.length; i++) {
            var f = facts[i];
            if (!f || f.factType !== FACT_TYPES.ATTACK || !f.data || !f.data.attacker) continue;
            if (f.data.attacker.name !== '唐文亮') continue;
            var text = entryText(f);
            if (!text) continue;
            var m = text.match(/七伤拳：自损 ([\d,]+) 点生命/);
            if (!m) continue;
            samples++;

            var real = parseInt(m[1].replace(/,/g, ''), 10);
            var mm = text.match(/本次伤害 ×(\d+(?:\.\d+)?)/);
            if (!mm) continue;
            var noteMult = parseFloat(mm[1]);

            var snapshot = f.data.attacker;
            var maxHp = snapshot.maxHp;
            var hpAfter = snapshot.hp;
            var preHp = hpAfter + real;   // 自损前的生命（快照为自损后，取整误差 ≤1）

            // 出手前血量只能用展示取整快照反推，靠近阈值时不可靠 —— 只校验倍率档位 + 文案标注一致
            var highMult = 1 + dmgBonus + lowHpExtra;
            var noteSaysLow = text.indexOf('临危') !== -1;
            if (Math.abs(noteMult - (1 + dmgBonus)) > 0.005 && Math.abs(noteMult - highMult) > 0.005) {
                return { fail: true, msg: '复发：唐文亮七伤拳报幕倍率×' + noteMult + ' 不在配置档位 ×' + (1 + dmgBonus) + ' / ×' + (Math.round(highMult * 100) / 100) + ' 内' };
            }
            if (noteSaysLow !== (Math.abs(noteMult - highMult) <= 0.005)) {
                return { fail: true, msg: '复发：七伤拳「临危加成」标注与倍率×' + noteMult + '不一致（低血档文案/倍率脱钩）' };
            }

            var entryVal = multEntry(f.data.dmgCalc, '七伤拳');
            if (Math.abs((entryVal == null ? 1 : entryVal) - noteMult) > 0.005) {
                return { fail: true, msg: '复发：七伤拳伤害倍率声明=' + (entryVal == null ? '缺失' : entryVal) + '，与报幕×' + noteMult + '不一致（倍率没落到伤害计算）' };
            }

            var want = Math.max(minSelfDmg, Math.round(maxHp * selfHpPct));
            var expectReal = Math.min(want, Math.max(0, Math.floor(preHp) - 1));
            if (Math.abs(real - expectReal) > 1) {
                return { fail: true, msg: '复发：七伤拳自损 ' + real + ' ≠ 配置值 ' + expectReal + '（maxHp=' + maxHp + '，selfHpPct=' + selfHpPct + '，minSelfDmg=' + minSelfDmg + '）' };
            }

            var cyc = text.match(/伤己 (\d+)\/(\d+)/);
            if (cyc && parseInt(cyc[2], 10) !== cycle) {
                return { fail: true, msg: '复发：七伤拳报幕循环分母=' + cyc[2] + ' ≠ 7（七伤循环参数改了引擎没跟）' };
            }
        }
        if (samples === 0) return 'skip';
        return { fail: false };
    }
};




