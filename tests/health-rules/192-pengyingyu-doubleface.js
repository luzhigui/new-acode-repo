// 回归规则：彭莹玉「双面观音」女装时长 / 女装增伤 / 唯一目标误攻队友 三处真值
// 真值源（content/001-game-data.json 彭莹玉 skills.doubleFace）：
//   params.disguiseChance / openingChance=1（首回合必进女装）/ duration=2 回合；
//   desc 写「女装期间自身造成的伤害 ×1.5」；modules/338 的 DMG_BONUS 是硬编码常量，label
//   「双面观音（伤害×1.5）」走 DMG_MULTIPLIER 声明进伤害计算。
// 引擎落点：
//   报幕「彭莹玉 女装上阵，众人不忍下手（N 回合）。」；
//   女装状态下是敌方唯一可选目标时改打自己队友，fact PHANTOM_CONFUSE（sourceSkill='双面观音'，
//   deceiver=彭莹玉，targetName=被误导的队友）。
// 复发信号：
//   1) 报幕时长 ≠ content duration（配置改了引擎没跟 / 写死旧值）；
//   2) openingChance=1 却整场没有一次「女装上阵」（首回合必进女装失效）；
//   3) 女装增伤声明值 ≠ desc 的 ×1.5，或 label 里的数字 ≠ 实际倍率（文案与引擎脱钩）；
//   4) PHANTOM_CONFUSE 归因错（sourceSkill 丢失 / 受骗者打的是彭莹玉本人 / deceiver 不是彭莹玉）。
// 误报规避：本场既无彭莹玉报幕也无其攻击事实直接 skip；desc 数字解析失败时跳过第 3 条数值比对。
export const VER = 'tests/health-rules/192-pengyingyu-doubleface.js V1.0.2';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';
import { getSkillParams, getGameData } from '../../core/201-config-5v5-test.js';
import { entryTextsDeep, plain } from '../122health-utils.js';

function collectTexts(log) {
    var texts = [];
    for (var i = 0; i < log.length; i++) {
        var ts = entryTextsDeep(log[i]);
        for (var t = 0; t < ts.length; t++) {
            var s = plain(ts[t]);
            if (s) texts.push(s);
        }
    }
    return texts;
}

function descMultiplier() {
    try {
        var gd = getGameData();
        var c = gd && gd.characters && gd.characters['彭莹玉'];
        var sk = c && c.skills && c.skills.doubleFace;
        var desc = sk && sk.desc;
        var m = typeof desc === 'string' ? desc.match(/×(\d+(?:\.\d+)?)/) : null;
        return m ? parseFloat(m[1]) : null;
    } catch (e) { return null; }
}

export const rule192 = {
    group: '技能效果回归',
    name: '彭莹玉双面观音女装真值(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!log || log.length === 0) return 'skip';
        var texts = collectTexts(log);
        var joined = texts.join('\n');
        var hasUnit = joined.indexOf('彭莹玉') !== -1;
        var attacks = [];
        if (facts) {
            for (var i = 0; i < facts.length; i++) {
                var f = facts[i];
                if (f && f.factType === FACT_TYPES.ATTACK && f.data && f.data.attacker && f.data.attacker.name === '彭莹玉') attacks.push(f);
            }
        }
        if (!hasUnit && attacks.length === 0) return 'skip';

        var params = getSkillParams('彭莹玉', 'doubleFace') || {};
        var duration = (params.duration != null) ? params.duration : 2;
        var openingChance = (params.openingChance != null) ? params.openingChance : 1;

        // 判据 1：报幕时长 = 配置
        var disguiseCount = 0;
        for (var k = 0; k < texts.length; k++) {
            var m = texts[k].match(/彭莹玉 女装上阵，众人不忍下手（(\d+) 回合）/);
            if (!m) continue;
            disguiseCount++;
            if (parseInt(m[1], 10) !== duration) {
                return { fail: true, msg: '复发：双面观音报幕持续 ' + m[1] + ' 回合 ≠ 配置 duration=' + duration };
            }
        }
        // 判据 2：首回合必进女装（openingChance=1）
        if (openingChance >= 1 && disguiseCount === 0) {
            return { fail: true, msg: '复发：彭莹玉在场且 openingChance=1，整场却没有一次「女装上阵」（首回合必进女装失效）' };
        }

        // 判据 3：女装增伤声明值 / label 数字
        var descMult = descMultiplier();
        for (var a = 0; a < attacks.length; a++) {
            var calc = attacks[a].data.dmgCalc;
            var entries = (calc && calc.dmgMultiplierEntries) || [];
            for (var e = 0; e < entries.length; e++) {
                var ent = entries[e];
                if (!ent || typeof ent.label !== 'string' || ent.label.indexOf('双面观音') === -1) continue;
                var lm = ent.label.match(/×(\d+(?:\.\d+)?)/);
                if (lm && Math.abs(parseFloat(lm[1]) - ent.value) > 0.005) {
                    return { fail: true, msg: '复发：双面观音 label 写 ×' + lm[1] + '，引擎实际倍率=' + ent.value + '（文案与声明脱钩）' };
                }
                if (descMult != null && Math.abs(ent.value - descMult) > 0.005) {
                    return { fail: true, msg: '复发：双面观音女装增伤=' + ent.value + ' ≠ 技能说明 ×' + descMult + '（硬编码常量和 desc 不同步）' };
                }
            }
        }

        // 判据 4：误攻队友事实归因
        if (facts) {
            for (var j = 0; j < facts.length; j++) {
                var pf = facts[j];
                if (!pf || pf.factType !== FACT_TYPES.PHANTOM_CONFUSE || !pf.data) continue;
                if (pf.data.sourceSkill !== '双面观音') continue;   // 只管彭莹玉这条，成昆的归 307 规则
                if (pf.data.deceiver !== '彭莹玉') {
                    return { fail: true, msg: '复发：双面观音误攻队友事实的 deceiver=' + pf.data.deceiver + '，应为彭莹玉' };
                }
                if (pf.data.targetName === '彭莹玉' || pf.data.unitName === '彭莹玉') {
                    return { fail: true, msg: '复发：双面观音误攻队友却指向彭莹玉本人（目标剔除/唯一目标逻辑反了）' };
                }
            }
        }

        return { fail: false };
    }
};
