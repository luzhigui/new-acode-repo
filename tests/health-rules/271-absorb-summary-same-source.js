// 吸星汇总账实同源 + 账有屏必须有出处（ABSORB_SUMMARY ↔ SKILL_ANNOUNCE 吸星行）
// 背景：ABSORB_SUMMARY 的渲染器被显式声明为不上面（infra/107 renderFn:null，注释「只记账不上屏，
//   行仍由 SKILL_ANNOUNCE 出」）。于是同一笔结算有两份出口：账本（absorbedTotal/beneficiaries）与屏上
//   的「🌀 XX 发动吸星：全场吸取 攻+A 防+B 血+C」。这条规则把两边钉在一起：
//   ① 账本自洽：beneficiaries 按 stat 的正增量之和、负增量之和都必须等于 absorbedTotal 的对应项；
//   ② 账→屏：存在一条吸星报幕行，且行内三个数字与 absorbedTotal 的 fmtNum 显示口径完全一致；
//      找不到行 = 账有屏无（玩家看不到吸到多少），报断点。
// 判据来源（2026-11-08 实测 156 场）：吸星汇总每次全场结算一条；① 求和误差 0；② 报幕行 0 缺失。
export const VER = 'tests/health-rules/271-absorb-summary-same-source.js V1.0.1';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';
import { fmtNum } from '../../infra/102-core-utils.js';
import { plain } from '../122health-utils.js';
// 第 203 轮：属性键清单收口为唯一来源（原为函数体内手抄 var stats = [...]）
import { STAT_MOD_KEYS } from '../_lib/static-truth-slice.mjs';

function flatAll(arr) {
    var out = [];
    (function walk(a) {
        for (var i = 0; i < a.length; i++) {
            var v = a[i];
            if (Array.isArray(v)) walk(v);
            else if (v) out.push(v);
        }
    })(arr || []);
    return out;
}

export const rule271 = {
    group: '战报与渲染一致性',
    name: '吸星汇总账实同源且屏上有出处',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        var tol = 1e-6;
        var allFacts = flatAll(facts);
        var allLog = flatAll(log);
        var count = 0;
        for (var i = 0; i < allFacts.length; i++) {
            var f = allFacts[i];
            if (!f || f.factType !== FACT_TYPES.ABSORB_SUMMARY) continue;
            count++;
            var d = f.data || {};
            var tot = d.absorbedTotal || {};
            var ben = Array.isArray(d.beneficiaries) ? d.beneficiaries : [];
            var stats = STAT_MOD_KEYS;
            for (var si = 0; si < stats.length; si++) {
                var st = stats[si];
                var pos = 0, neg = 0;
                for (var bi = 0; bi < ben.length; bi++) {
                    var b = ben[bi];
                    if (!b || b.stat !== st) continue;
                    var dv = (b.after - b.before);
                    if (!isFinite(dv)) continue;
                    if (dv > 0) pos += dv; else neg += -dv;
                }
                var declared = tot[st] || 0;
                if (Math.abs(pos - declared) > tol || Math.abs(neg - declared) > tol) {
                    return { fail: true, msg: '吸星账本不自洽：' + st + ' 声明 +' + declared + '，但受益人正增 ' + pos + ' / 负增 ' + neg + '（' + (d.casterName || d.casterUid) + '）' };
                }
            }
            // 账→屏：吸星报幕行必须带上同一份数字（fmtNum 唯一显示出口）
            var expect = '攻+' + fmtNum(tot.atk || 0) + ' 防+' + fmtNum(tot.def || 0) + ' 血+' + fmtNum(tot.maxHp || 0);
            var found = false;
            for (var li = 0; li < allLog.length; li++) {
                var e = allLog[li];
                if (!e || typeof e.text !== 'string') continue;
                var t = plain(e.text);
                if (t.indexOf('吸星') >= 0 && t.indexOf(expect) >= 0) { found = true; break; }
            }
            if (!found) {
                return { fail: true, msg: '账有屏无：' + (d.casterName || d.casterUid) + ' 的吸星汇总声明「' + expect + '」，但战报里找不到同数字的吸星报幕行' };
            }
        }
        if (count === 0) return 'skip';
        return { fail: false, msg: '吸星汇总账实同源：' + count + ' 条，账本求和与屏上数字一致' };
    }
};
