// 回归规则：成昆「混元霹雳劲」附加真伤 / 「幻影伪装」命中治疗 —— 两条数值是否按 content 生效
// 真值源（content/001-game-data.json 成昆 mechanics）：
//   beforeDamageEffects bonusLostHp.ratio=0.2 → 附加「已损失生命 20%」真伤（label 混元霹雳劲）；
//   phantomDisguise healRatio=0.06 → 命中时回复 floor(已损失生命 × 0.06 × 敌方存活人数)。
// 引擎落点（core/216 / modules/307 submitPhantomDisguiseOnHit）：
//   dmgCalc.thunderBonus = floor((maxHp-hp)×0.2)；治疗发 PHANTOM_DISGUISE_HEAL（unitUid/heal）。
// 复发信号：
//   1) 混元霹雳劲真伤 ≠ floor(自身已损失生命×20%)（比例写死/配置改了引擎没跟）；
//   2) 幻影治疗 heal 无法用 floor(lostHp×6%×k)（k∈1..5 敌方存活人数）解释 —— 比例或人数口径写死；
//   3) 治疗事实的 unitName/unitUid 不是成昆（治疗记到别人头上）。
// 误报规避：本场无成昆攻击事实直接 skip；快照血量为展示取整值，真伤/治疗公式允许 ±1 与 k 搜索。
export const VER = 'tests/health-rules/194-chengkun-phantom.js V1.0.0';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';
import { getGameData } from '../../core/201-config-5v5-test.js';

function chengkunConfig() {
    try {
        var gd = getGameData();
        var c = gd && gd.characters && gd.characters['成昆'];
        var ms = (c && c.mechanics) || [];
        var thunderRatio = 0.2, healRatio = 0.06;
        for (var i = 0; i < ms.length; i++) {
            var eff = (ms[i] && ms[i].beforeDamageEffects) || [];
            for (var j = 0; j < eff.length; j++) {
                if (eff[j].type === 'bonusLostHp' && eff[j].ratio != null) thunderRatio = eff[j].ratio;
            }
            if (ms[i] && ms[i].type === 'phantomDisguise' && ms[i].healRatio != null) healRatio = ms[i].healRatio;
        }
        return { thunderRatio: thunderRatio, healRatio: healRatio };
    } catch (e) { return { thunderRatio: 0.2, healRatio: 0.06 }; }
}

export const rule194 = {
    group: '技能效果回归',
    name: '成昆混元霹雳劲与幻影治疗(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!facts || facts.length === 0) return 'skip';
        var cfg = chengkunConfig();
        var lastAttack = null;
        var samples = 0;

        for (var i = 0; i < facts.length; i++) {
            var f = facts[i];
            if (!f || !f.data) continue;

            if (f.factType === FACT_TYPES.ATTACK) {
                var atk = f.data.attacker;
                if (atk && atk.name === '成昆') {
                    lastAttack = f;
                    samples++;
                    var calc = f.data.dmgCalc || {};
                    if (atk.maxHp == null || atk.hp == null) continue;
                    var lostHp = Math.max(0, atk.maxHp - atk.hp);
                    var expect = Math.floor(lostHp * cfg.thunderRatio);
                    // 引擎把「已损生命加伤」落成 BONUS_DMG 声明（bonusDmgEntries），不是 thunderBonus 字段
                    var bonus = null;
                    var be = calc.bonusDmgEntries || [];
                    for (var b = 0; b < be.length; b++) {
                        // 配置 label 可能缺失（引擎回落「额外伤害」），此时按金额匹配本击应得的真伤
                        if (!be[b]) continue;
                        if (be[b].label && /混元|霹雳/.test(be[b].label)) { bonus = be[b]; break; }
                        if (expect > 0 && Math.abs(be[b].value - expect) <= 1) bonus = be[b];
                    }
                    if (expect > 1) {
                        if (!bonus) {
                            return { fail: true, msg: '复发：成昆已损失 ' + lostHp + ' 点生命，但本击没有「混元霹雳劲」加伤声明（应 floor(' + lostHp + '×' + cfg.thunderRatio + ')=' + expect + '）' };
                        }
                        if (Math.abs(bonus.value - expect) > 1) {
                            return { fail: true, msg: '复发：混元霹雳劲=' + bonus.value + ' ≠ floor(已损失 ' + lostHp + '×' + cfg.thunderRatio + ')=' + expect };
                        }
                    } else if (bonus && bonus.value > expect + 1) {
                        // expect=0/1 时快照取整可能差 1，不判缺失，只判金额别超
                        return { fail: true, msg: '复发：成昆已损失 ' + lostHp + ' 点却出现混元霹雳劲 ' + bonus.value + '（比例口径不符）' };
                    }
                }
                continue;
            }

            if (f.factType !== FACT_TYPES.PHANTOM_DISGUISE_HEAL) continue;
            var d = f.data;
            if (d.unitName !== '成昆') {
                return { fail: true, msg: '复发：幻影伪装治疗记在「' + d.unitName + '」头上，应为成昆' };
            }
            if (!lastAttack) continue;
            var snap = lastAttack.data.attacker;
            if (!snap) continue;
            if (d.unitUid != null && snap.uid != null && d.unitUid !== snap.uid) {
                return { fail: true, msg: '复发：幻影治疗 unitUid=' + d.unitUid + ' 与最近一次成昆攻击 uid=' + snap.uid + ' 不匹配' };
            }
            var lost = Math.max(0, snap.maxHp - snap.hp);
            var per = lost * cfg.healRatio;
            if (per <= 0) {
                return { fail: true, msg: '复发：成昆满血却出现幻影伪装治疗 ' + d.heal + '（治疗不该触发）' };
            }
            var ok = false;
            // 敌方存活人数含召唤物，可超过 5；治疗还会被「缺口血量」截断，截断时 heal = 缺口
            var missing = Math.max(0, snap.maxHp - snap.hp);
            if (Math.abs(d.heal - missing) <= 1) ok = true;
            for (var k = 1; k <= 12 && !ok; k++) {
                if (Math.floor(per * k) === d.heal || Math.abs(Math.floor(per * k) - d.heal) <= 1) ok = true;
            }
            if (!ok) {
                return { fail: true, msg: '复发：幻影治疗 ' + d.heal + ' 无法用 floor(已损失 ' + lost + '×' + cfg.healRatio + '×k)（k=1..12，或缺口 ' + missing + ' 截断）解释（比例/人数口径写死）' };
            }
        }
        if (samples === 0) return 'skip';
        return { fail: false };
    }
};




