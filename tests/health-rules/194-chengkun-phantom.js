// 回归规则：成昆「混元霹雳劲」附加真伤 / 「幻影伪装」命中治疗 —— 两条数值是否按 content 生效
// 真值源（content/001-game-data.json 成昆 mechanics）：
//   beforeDamageEffects bonusLostHp.ratio=0.2 → 附加「已损失生命 20%」真伤（label 混元霹雳劲）；
//   phantomDisguise healRatio=0.06 → 命中时回复 floor(已损失生命 × 0.06 × 敌方存活人数)。
// 引擎落点（core/216 / modules/307 submitPhantomDisguiseOnHit）：
//   dmgCalc.thunderBonus = floor((maxHp-hp)×0.2)；治疗发 PHANTOM_DISGUISE_HEAL（unitUid/heal）。
// 复发信号：
//   1) 混元霹雳劲真伤 ≠ floor(计算时自身已损失生命×20%)（比例写死/配置改了引擎没跟）；
//      ⚠ 口径（V1.1.0）：引擎按**成昆（攻击方）在 BEFORE_DAMAGE_CALC 时刻**的已损失生命算
//      （core/216 L193 `data.unit.maxHp - data.unit.hp`，data.unit 是攻击方），不是按目标已损失生命。
//      但 ATTACK fact 的 attacker 快照是结算**之后**取的，中间会被乾坤反弹等反噬扣血 —— 必须
//      把本击反弹量扣回来再复算，否则快照已损失偏大（实测 15 被误算成 17）。
//   2) 幻影治疗 heal 无法用 floor(lostHp×6%×k)（k∈1..5 敌方存活人数）解释 —— 比例或人数口径写死；
//   3) 治疗事实的 unitName/unitUid 不是成昆（治疗记到别人头上）。
// 误报规避：本场无成昆攻击事实直接 skip；快照血量为展示取整值，真伤/治疗公式允许 ±1 与 k 搜索。
export const VER = 'tests/health-rules/194-chengkun-phantom.js V1.1.0';
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

// 「计算时」已损失生命（V1.1.0）：ATTACK fact 的 attacker 快照是伤害结算**之后**（buildAttackGroup）
//   取的，而混元霹雳劲在 BEFORE_DAMAGE_CALC 时按**当时**血量算。两者之间 attacker 会被结算链内的
//   反噬扣血（乾坤反弹 applyStatChange(unit,'hp',-rebound)，modules/302 L81），使快照已损失偏大。
//   实证 seed=3 stage=6：快照 hp=113/maxHp=199 → 已损失 86，本击乾坤反弹 11 →
//   计算时已损失 75 → floor(75×0.2)=15（旧口径按快照算成 17，误报）。
//   反噬量只取本击 entries 里点名该 attacker 的反弹事实（乾坤 QIAN_KUN_* 的 rebound /
//   严阵反弹 FORTIFY_REBOUND 的 reboundDmg），不猜其它字段。
function calcLostHpOf(f, atk, snapLost) {
    var back = 0;
    var ents = (f && f.data && f.data.entries) || [];
    for (var i = 0; i < ents.length; i++) {
        var d = ents[i] && ents[i].data;
        if (!d || d.attackerUid == null || atk.uid == null || d.attackerUid !== atk.uid) continue;
        if (typeof d.rebound === 'number' && isFinite(d.rebound)) back += d.rebound;
        else if (typeof d.reboundDmg === 'number' && isFinite(d.reboundDmg)) back += d.reboundDmg;
    }
    return Math.max(0, snapLost - back);
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
                    var lostHp = calcLostHpOf(f, atk, Math.max(0, atk.maxHp - atk.hp));
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
                            return { fail: true, msg: '复发：混元霹雳劲漏发 — 成昆已损失 ' + lostHp + ' 点生命，但本击没有「混元霹雳劲」加伤声明（应 floor(' + lostHp + '×' + cfg.thunderRatio + ')=' + expect + '）' };
                        }
                        if (Math.abs(bonus.value - expect) > 1) {
                            return { fail: true, msg: '复发：混元霹雳劲=' + bonus.value + ' ≠ floor(已损失 ' + lostHp + '×' + cfg.thunderRatio + ')=' + expect };
                        }
                    } else if (bonus && bonus.value > expect + 1) {
                        // expect=0/1 时快照取整可能差 1，不判缺失，只判金额别超
                        return { fail: true, msg: '复发：混元霹雳劲不该出现 — 成昆已损失 ' + lostHp + ' 点却出现混元霹雳劲 ' + bonus.value + '（比例口径不符）' };
                    }
                }
                continue;
            }

            if (f.factType !== FACT_TYPES.PHANTOM_DISGUISE_HEAL) continue;
            var d = f.data;
            if (d.unitName !== '成昆') {
                return { fail: true, msg: '复发：幻影伪装治疗记在「' + d.unitName + '」头上，应为成昆' };
            }
            // V1.1.0：比「声明治疗量」healNominal，不比实际回血 heal —— 寒毒抑疗等减疗层会把
            //   实际回血打折（实证 seed=7 stage=6：nominal 35、heal 17.5，healMods=['寒毒抑疗削减']），
            //   那是减疗机制的合法结果，不是幻影伪装比例/人数口径出错。
            var healVal = (typeof d.healNominal === 'number' && isFinite(d.healNominal)) ? d.healNominal : d.heal;
            if (!lastAttack) continue;
            var snap = lastAttack.data.attacker;
            if (!snap) continue;
            if (d.unitUid != null && snap.uid != null && d.unitUid !== snap.uid) {
                return { fail: true, msg: '复发：幻影治疗 unitUid=' + d.unitUid + ' 与最近一次成昆攻击 uid=' + snap.uid + ' 不匹配' };
            }
            var lost = Math.max(0, snap.maxHp - snap.hp);
            var per = lost * cfg.healRatio;
            if (per <= 0) {
                return { fail: true, msg: '复发：成昆满血却出现幻影伪装治疗 ' + healVal + '（治疗不该触发）' };
            }
            var ok = false;
            // 敌方存活人数含召唤物，可超过 5；治疗还会被「缺口血量」截断，截断时声明值仍等于公式值
            var missing = Math.max(0, snap.maxHp - snap.hp);
            if (Math.abs(healVal - missing) <= 1) ok = true;
            for (var k = 1; k <= 12 && !ok; k++) {
                if (Math.floor(per * k) === healVal || Math.abs(Math.floor(per * k) - healVal) <= 1) ok = true;
            }
            if (!ok) {
                return { fail: true, msg: '复发：幻影治疗量不符公式 — ' + healVal + ' 无法用 floor(已损失 ' + lost + '×' + cfg.healRatio + '×k)（k=1..12，或缺口 ' + missing + ' 截断）解释（比例/人数口径写死）' };
            }
        }
        if (samples === 0) return 'skip';
        return { fail: false };
    }
};




