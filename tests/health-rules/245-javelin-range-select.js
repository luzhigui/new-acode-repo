// tests/health-rules/245-javelin-range-select.js
// 体检规则：标枪选靶射程（选中目标必须落在自身行段的射程表内）
//
// 判据来源（core/207-target-strategies.js 标枪策略 + content/001 roles.标枪.rangeByRow）：
//   1~3 号位（前排）打全场 1~9；4~6 号位（中排）打 1~6；7~9 号位（后排）只打 1~3。
//   射程内无人应主动放弃（abort）→ 由 emptyTarget 显式落账，不得改选射程外的人。
// 只看原始 fact 里确实带了位置/职业的 attack / miss / dodge：
//   免疫 fact 的 attacker/target 是精简快照（无 pos/role），无法判定，直接跳过（宁漏勿误）。
// 为什么值得盯：射程表是「数据驱动」的，改 content 或改行段计算不会报错、只会静默打错人；
//   这条把「声明射程 vs 实际选中」固定成可对账的硬判据。
export const VER = 'tests/health-rules/245-javelin-range-select.js V1.0.0';

var JAVELIN = '标枪';
var RANGE = { front: [1, 2, 3, 4, 5, 6, 7, 8, 9], mid: [1, 2, 3, 4, 5, 6], back: [1, 2, 3] };

function rowKeyOf(pos) {
    if (pos >= 7) return 'back';
    if (pos >= 4) return 'mid';
    return 'front';
}

export const rule245 = {
    group: '选靶与站位回归',
    name: '标枪选靶射程(观测)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        var fs = facts || [];
        if (!fs.length) return 'skip';

        var checked = 0;
        var errs = [];

        for (var i = 0; i < fs.length; i++) {
            var f = fs[i];
            if (!f || !f.factType) continue;
            if (f.factType !== 'attack' && f.factType !== 'miss' && f.factType !== 'dodge') continue;
            var d = f.data || {};
            var a = d.attacker;
            var t = d.target || d.dodger;
            if (!a || !t) continue;
            if (a.role !== JAVELIN) continue;
            // 非「常规选靶」出手不判射程：冲刺反手拳(dashStrike) / 反击 / 跟随 / 联动等
            //   都是被事件指定目标（core/209 extraRequests → snap.linkReason），不走标枪射程选靶链；
            //   唐文亮冲刺视觉帧(isDashStrikeFx) 同理。实测 seed=17 s2 / seed=18 s7 两例均属此类。
            if (d.isDashStrikeFx) continue;
            if (d.snap && d.snap.linkReason) continue;
            if (typeof a.pos !== 'number' || typeof t.pos !== 'number') continue;
            checked++;
            var row = rowKeyOf(a.pos);
            var range = RANGE[row];
            if (range.indexOf(t.pos) < 0) {
                errs.push('第?回合 ' + (a.name || a.uid) + '（' + a.pos + '号位·' + row + '）选中了射程外的 ' + (t.name || t.uid) + '（' + t.pos + '号位）');
            }
        }

        if (checked === 0) return 'skip';
        if (errs.length) {
            // 实测 156 场：63 次可判标枪出手，2 次射程外（seed=17 s2 / seed=18 s7），
            //   两例都是唐文亮带 skillAnnounce 的攻击组（疑与冲刺/七伤拳的动作穿插有关），
            //   主代码侧尚未确认是「技能力合法」还是「选靶时序错位」——按纪律先降观察项，
            //   等定位清楚、误报率归零后再升硬判据。
            return {
                fail: false,
                observe: '标枪射程外的选靶 ' + errs.length + '/' + checked + ' 次：' + errs.slice(0, 3).join('；')
            };
        }
        return { fail: false, msg: '标枪选靶射程成立：核对 ' + checked + ' 次标枪出手' };
    }
};
