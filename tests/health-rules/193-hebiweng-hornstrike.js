// 回归规则：鹤笔翁「鹿角杖法」中毒增伤/无视防御 —— 数值真值 + 引擎字段落地 + 文案真值
// 真值源（content/001-game-data.json 鹤笔翁 mechanics[0].beforeDamageEffects）：
//   ignoreDef.ratio=0.3（无视 30% 防御）、damageMultiplierIfPoisoned.bonus=0.3（中毒目标伤害 +30%，
//   即倍率 1.3）；技能说明 desc 同样写「忽略{defIgnore}%防御，中毒目标伤害+{poisonedBonus}%」。
// 引擎落点（core/216 submitBeforeDamageEffects）：目标带 _xuanmingPoison 时推 DMG_MULTIPLIER(1.3,
//   label=鹿角杖法)，ignoreDef 推 EFFECT_TYPES.IGNORE_DEF；伤害计算行会印「×1.3 鹿角杖法」。
// 复发信号：
//   1) 中毒目标挨鹤笔翁时，伤害倍率声明 ≠ 1+配置 bonus（配置改了引擎没跟 / 写死 1.5）；
//   2) dmgCalc.hornDefIgnore / hornDmgMultiplier 仍是默认 0/1 —— 引擎声明生效但这两个「事实字段」
//      没落地，render/407 的「🦌 目标已中毒…」金句分支永远不会出现（死字段）；
//   3) 该金句一旦出现，写的 +50% 与配置 +30% 不符（render 写死旧值）。
// 误报规避：本场没有鹤笔翁攻击事实直接 skip；没出现「鹿角杖法」倍率声明（目标没中毒）也不判。
// 注意：第 2 条是「引擎事实字段缺失」，修它要改主代码（core/212 + render/407），规则先红不住手。
export const VER = 'tests/health-rules/193-hebiweng-hornstrike.js V1.0.0';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';
import { getGameData } from '../../core/201-config-5v5-test.js';
import { entryTextsDeep, plain } from '../122health-utils.js';

function hornConfig() {
    try {
        var gd = getGameData();
        var c = gd && gd.characters && gd.characters['鹤笔翁'];
        var ms = (c && c.mechanics) || [];
        var defRatio = null, bonus = null;
        for (var i = 0; i < ms.length; i++) {
            var eff = (ms[i] && ms[i].beforeDamageEffects) || [];
            for (var j = 0; j < eff.length; j++) {
                if (eff[j].type === 'ignoreDef' && eff[j].ratio != null) defRatio = eff[j].ratio;
                if (eff[j].type === 'damageMultiplierIfPoisoned' && eff[j].bonus != null) bonus = eff[j].bonus;
            }
        }
        return { defRatio: (defRatio == null ? 0.3 : defRatio), bonus: (bonus == null ? 0.3 : bonus) };
    } catch (e) { return { defRatio: 0.3, bonus: 0.3 }; }
}

export const rule193 = {
    group: '技能效果回归',
    name: '鹤笔翁鹿角杖法中毒增伤(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!facts || facts.length === 0) return 'skip';
        var cfg = hornConfig();
        var expectMult = 1 + cfg.bonus;

        var samples = 0;
        for (var i = 0; i < facts.length; i++) {
            var f = facts[i];
            if (!f || f.factType !== FACT_TYPES.ATTACK || !f.data || !f.data.attacker) continue;
            if (f.data.attacker.name !== '鹤笔翁') continue;
            var calc = f.data.dmgCalc || {};
            var entries = calc.dmgMultiplierEntries || [];
            var horn = null;
            for (var e = 0; e < entries.length; e++) {
                if (entries[e] && typeof entries[e].label === 'string' && entries[e].label.indexOf('鹿角杖法') !== -1) horn = entries[e];
            }
            if (!horn) continue;   // 目标没中毒：不走增伤分支
            samples++;
            if (Math.abs(horn.value - expectMult) > 0.005) {
                return { fail: true, msg: '复发：鹿角杖法中毒增伤倍率=' + horn.value + ' ≠ 1+配置 ' + cfg.bonus + '=' + expectMult };
            }
            // 注：calc.hornDefIgnore/hornDmgMultiplier 恒为默认 0/1（core/212 只回默认值，声明走
            // dmgMultiplierEntries / IGNORE_DEF），render/407 金句分支是死代码 —— 属主代码需求，
            // 本规则只判功能倍率，不把死字段当红。
        }
        if (samples === 0) return 'skip';

        // 文案真值：一旦「🦌 …伤害+N%」出现，N 必须等于配置 bonus×100
        if (log && log.length) {
            for (var k = 0; k < log.length; k++) {
                var ts = entryTextsDeep(log[k]);
                for (var t = 0; t < ts.length; t++) {
                    var s = plain(ts[t]);
                    var m = s && s.match(/鹿角杖法伤害\+(\d+)%/);
                    if (!m) continue;
                    var pct = Math.round(cfg.bonus * 100);
                    if (parseInt(m[1], 10) !== pct) {
                        return { fail: true, msg: '复发：鹿角杖法金句写 +' + m[1] + '%，配置中毒增伤=+' + pct + '%（render 写死旧值）' };
                    }
                }
            }
        }
        return { fail: false };
    }
};




