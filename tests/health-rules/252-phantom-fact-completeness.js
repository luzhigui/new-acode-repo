// tests/health-rules/252-phantom-fact-completeness.js
// 体检规则：改打队友的归因事实完整性（phantomConfuse 分支审计）
//
// 背景（known-transfers 已记）：seed=15 stage=5 鹿杖客→鹤笔翁的 dodge 分支丢了 phantomConfuse，
//   战报只能写成「打队友」，归因断链。本轮把「同类缺口」按分支（attack / miss / dodge）重新数一遍：
//   ① 硬判：每条 phantomConfuse 必须带 unitName / deceiver / sourceSkill / targetName
//      （infra/107 fact-contract 的必填字段；缺一渲染标题就会回退成错的机制名）。
//   ② 观察：同阵营误攻（attacker.camp === target.camp）若本回合没有任何 phantomConfuse，
//      也没有 癫/惑心/心智/混乱/幻影/蝶舞 这类声明层豁免，就记一处「归因缺失」，
//      按分支统计，用来确认缺口的真值上限（先不染红）。
// 与 182 的分工：182 判「误伤是否合法」，本条只判「改打队友的归因事实是否补齐、字段是否够用」。
export const VER = 'tests/health-rules/252-phantom-fact-completeness.js V1.0.0';

var REQUIRED = ['unitName', 'deceiver', 'sourceSkill', 'targetName'];
var EXEMPT_WORDS = /癫|惑心|心智|混乱|幻影|蝶舞|双面观音|附身/;

export const rule252 = {
    group: '选靶与站位回归',
    name: '改目标事实完整性(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        var fs = facts || [];
        if (!fs.length) return 'skip';

        var round = null;
        var phantomRounds = Object.create(null);   // 回合 → true
        var fieldErrs = [];
        var checkedPhantom = 0;
        var friendly = [];
        var missing = Object.create(null);         // attack/miss/dodge → 次数
        var samples = [];
        var checkedFriendly = 0;

        for (var i = 0; i < fs.length; i++) {
            var f = fs[i];
            if (!f || !f.factType) continue;
            var d = f.data || {};

            if (f.factType === 'roundStart') { round = d.round; continue; }

            if (f.factType === 'phantomConfuse') {
                checkedPhantom++;
                phantomRounds[round == null ? '?' : round] = true;
                for (var r = 0; r < REQUIRED.length; r++) {
                    var v = d[REQUIRED[r]];
                    if (v == null || v === '') {
                        fieldErrs.push('第' + (round == null ? '?' : round) + '回合 phantomConfuse 缺 ' + REQUIRED[r]);
                    }
                }
                continue;
            }

            if (f.factType !== 'attack' && f.factType !== 'miss' && f.factType !== 'dodge') continue;
            var a = d.attacker;
            var t = d.target || d.dodger;
            if (!a || !t || !a.camp || !t.camp) continue;
            if (a.camp !== t.camp) continue;   // 只审计同阵营误攻
            checkedFriendly++;
            friendly.push({ round: round, type: f.factType, attacker: a.name || a.uid, target: t.name || t.uid });
        }

        if (checkedPhantom === 0 && checkedFriendly === 0) return 'skip';
        if (fieldErrs.length) {
            return {
                fail: true,
                msg: fieldErrs.slice(0, 3).join('；') + (fieldErrs.length > 3 ? '（共 ' + fieldErrs.length + ' 处字段缺口）' : '')
            };
        }

        // 逐回合判「误攻是否有归因」
        for (var j = 0; j < friendly.length; j++) {
            var ev = friendly[j];
            var key = ev.round == null ? '?' : ev.round;
            if (phantomRounds[key]) continue;
            if (EXEMPT_WORDS.test(ev.attacker || '')) continue;
            missing[ev.type] = (missing[ev.type] || 0) + 1;
            if (samples.length < 3) samples.push('第' + key + '回合 ' + ev.type + '：' + ev.attacker + '→' + ev.target);
        }
        var missTotal = 0;
        var parts = [];
        for (var ty in missing) { missTotal += missing[ty]; parts.push(ty + ' ' + missing[ty]); }
        if (missTotal) {
            return {
                fail: false,
                observe: '同阵营误攻缺 phantomConfuse 归因 ' + missTotal + ' 处（' + parts.join(' / ') + '）：' + samples.join('；')
            };
        }
        return { fail: false, msg: '改目标归因事实完整：phantomConfuse ' + checkedPhantom + ' 条字段齐 / 同阵营误攻 ' + checkedFriendly + ' 次均有归因或豁免' };
    }
};
