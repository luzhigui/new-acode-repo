// 回归规则：庄铮「断锤三式」——首击保命落账 + 触发后单次承伤上限 + 减半量 N 单一出口
// 真值源（content/001-game-data.json 庄铮 skills.duanChui.params）：{ keepHp: 3, cap: 1, selfCost: 1 }
// 引擎落点（modules/337-elite-mingjiao-zhuangzheng.js）：
//   ① BEFORE_DAMAGE_APPLY 首击致死 → 血量收到 keepHp、置 state._dmgCap、攻击 -N 并播报
//      「保留 {keepHp} 点生命，攻击减半（N=…）」，同时声明 immune → core/209 走免疫分支，
//      落 IMMUNE fact（不再落 ATTACK fact），免疫回退把这一击的血退回 → targetHp 恰为 keepHp。
//   ② 此后正规攻击 core/212 applyAttackResult 先用 _dmgCap 截 hpLoss，再判死；
//      直扣血出口 core/214 applyStatChange 读同一字段（单次受伤上限只有 _dmgCap 一个来源）。
//   ③ 每次出手 AFTER_ATTACK → 攻击 +N 并播 SKILL_ANNOUNCE（cue.kind=ATK_GROW，amount=N）。
// 复发信号：
//   1) 播报的保留值 ≠ content keepHp（写死旧值 / 配置改了引擎没跟）；
//   2) 播报缺 N 或 N ≤ 0（减半量没算出 / 减半分支走了但没记 N）；
//   3) 触发后 IMMUNE 落地血量 ≠ keepHp（保命没真正落账，或免疫回退把血退多了/少了）；
//   4) 触发后任何一次 ATTACK 的实际掉血 > cap（上限没生效 / 被别的直扣血出口绕过）；
//   5) 出手成长的 ATK_GROW 飘字金额 ≠ 触发时记下的 N（数字两处各自计算，账面分叉）。
// 误报规避：
//   · 未触发（没吃到致死伤害，或庄铮根本没在名单里）→ skip；
//   · 掉血用 hpBefore − 显示血（fmtHp <10 一位小数 / ≥10 整数），容差 cap+0.6；
//   · 护盾/波动减伤只会让实际掉血更小，不会误报；
//   · 反击存在性不判（攻击者可能被反弹打死而合法不反击），只判上面可观测的五项。
export const VER = 'tests/health-rules/205-zhuangzheng-duanchui.js V1.0.0';
import { FACT_TYPES, SKILL_CUE_KINDS } from '../../infra/106-battle-enums.js';
import { getSkillParams } from '../../core/201-config-5v5-test.js';

export const rule205 = {
    group: '技能效果回归',
    name: '庄铮断锤三式保命与承伤上限(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!facts || facts.length === 0) return 'skip';
        var p = getSkillParams('庄铮', 'duanChui');
        if (!p) return 'skip';
        var keepHp = p.keepHp;
        var cap = p.cap;
        if (typeof keepHp !== 'number' || typeof cap !== 'number') return 'skip';

        var triggerIdx = -1;
        var nValue = null;
        for (var i = 0; i < facts.length; i++) {
            var f = facts[i];
            if (!f || f.factType !== FACT_TYPES.SKILL_ANNOUNCE || !f.data) continue;
            if (f.data.unitName !== '庄铮' || f.data.skillName !== '断锤三式') continue;
            var note = String(f.data.note || '');
            if (note.indexOf('保留') < 0) continue;

            var mk = note.match(/保留\s*([\d.]+)\s*点生命/);
            if (!mk) return { fail: true, msg: '复发：断锤三式播报缺「保留 N 点生命」：' + note };
            var gotKeep = parseFloat(mk[1]);
            if (!(Math.abs(gotKeep - keepHp) <= 0.01)) {
                return { fail: true, msg: '复发：播报保留 ' + gotKeep + ' 点生命 ≠ 配置 keepHp ' + keepHp + '（写死旧值 / 配置改了引擎没跟）' };
            }
            var mn = note.match(/N=([\d.]+)/);
            if (!mn) return { fail: true, msg: '复发：断锤三式播报缺减半量 N：' + note };
            var n = parseFloat(mn[1]);
            if (!(n > 0)) return { fail: true, msg: '复发：断锤三式减半量 N=' + n + '（应 > 0，减半分支没算出量）' };
            if (triggerIdx < 0) { triggerIdx = i; nValue = n; }

            var cue = f.data.cue;
            if (cue && cue.kind === SKILL_CUE_KINDS.ATK_HALVE && typeof cue.amount === 'number' && Math.abs(cue.amount - n) > 0.05) {
                return { fail: true, msg: '复发：断锤减半飘字 amount=' + cue.amount + ' ≠ 播报 N=' + n + '（演出与数值两处各自算）' };
            }
        }

        if (triggerIdx < 0) return 'skip';

        // ② 触发那一击必须落地成 IMMUNE，且保命后的血量恰为 keepHp
        var immuneSeen = false;
        for (var j = triggerIdx; j < facts.length; j++) {
            var g = facts[j];
            if (!g || g.factType !== FACT_TYPES.IMMUNE || !g.data) continue;
            if (!g.data.target || g.data.target.name !== '庄铮') continue;
            if (String(g.data.reason || '').indexOf('断锤') < 0) continue;
            immuneSeen = true;
            var hpAfterImmune = typeof g.data.targetHp === 'number' ? g.data.targetHp : parseFloat(g.data.targetHp);
            if (isFinite(hpAfterImmune) && Math.abs(hpAfterImmune - keepHp) > 0.11) {
                return { fail: true, msg: '复发：断锤保命后落地血 ' + hpAfterImmune + ' ≠ 配置 keepHp ' + keepHp + '（保命没落账 / 免疫回退退多了）' };
            }
            var dc = g.data.dmgCalc;
            if (dc && typeof dc.hpBefore === 'number' && typeof dc.dmg === 'number' && dc.hpBefore - dc.dmg > 0) {
                return { fail: true, msg: '复发：断锤触发的那一击不致死（触发前血 ' + dc.hpBefore + ' − 伤害 ' + dc.dmg + ' > 0，首击判据写松了）' };
            }
            break;
        }
        if (!immuneSeen) {
            return { fail: true, msg: '复发：断锤三式已播报触发，但 IMMUNE 落地 fact 缺失（保命免疫声明被吞 / 未走免疫分支）' };
        }

        // ③ 触发后单次承伤不得超过 cap（cap 是单次受伤上限的唯一来源）
        for (var k = triggerIdx; k < facts.length; k++) {
            var a = facts[k];
            if (!a || a.factType !== FACT_TYPES.ATTACK || !a.data) continue;
            if (!a.data.target || a.data.target.name !== '庄铮') continue;
            var dmgCalc = a.data.dmgCalc || {};
            var snap = a.data.snap || {};
            if (typeof dmgCalc.hpBefore !== 'number') continue;
            var afterHp = typeof snap.targetHpAfter === 'number' ? snap.targetHpAfter : parseFloat(snap.targetHpAfter);
            if (!isFinite(afterHp)) continue;
            var loss = dmgCalc.hpBefore - afterHp;
            if (loss > cap + 0.6) {
                return { fail: true, msg: '复发：断锤触发后被单次打掉 ' + loss + ' 点，超过上限 cap=' + cap + '（_dmgCap 未生效 / 有直扣血出口绕过）' };
            }
        }

        // ④ 出手成长飘字金额必须与触发时记下的 N 同源
        if (nValue != null) {
            for (var m = triggerIdx; m < facts.length; m++) {
                var gf = facts[m];
                if (!gf || gf.factType !== FACT_TYPES.SKILL_ANNOUNCE || !gf.data) continue;
                if (gf.data.unitName !== '庄铮' || gf.data.skillName !== '断锤三式') continue;
                var c2 = gf.data.cue;
                if (!c2 || c2.kind !== SKILL_CUE_KINDS.ATK_GROW || typeof c2.amount !== 'number') continue;
                if (Math.abs(c2.amount - nValue) > 0.05) {
                    return { fail: true, msg: '复发：断锤出手成长飘字 amount=' + c2.amount + ' ≠ 触发时记下的 N=' + nValue + '（成长量与减半量不同源）' };
                }
            }
        }

        return { fail: false };
    }
};
