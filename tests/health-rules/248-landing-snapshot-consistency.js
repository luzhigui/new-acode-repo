// tests/health-rules/248-landing-snapshot-consistency.js
// 体检规则：位移宣告后的落位必须与后续出场快照一致（观测项起步）
//
// 盯的是「演出层读改写后的位置」这类时序缺陷：引擎宣告 A→B 后，
//   该单位下一次在战报里露面的位置必须就是 B；若仍是 A 或第三个值，说明
//   落位没生效、或宣告时读的是改写后的值（唐文亮冲刺曾把 from 读成后排恒值，吞掉真实拖拽）。
// 数据源（全部来自原始 fact 流）：
//   宣告侧：skillAnnounce(advanceFrom/advanceTo)、windAssaultPush(oldPos/behindPos/behindOldPos)、
//           mindControlSwap(swaps[].fromPos/toPos)
//   对账侧：attack / miss / dodge 的 attacker/target 快照、pass 的 unit 快照
// 宁漏勿误：只认「同一单位下一次露面」；中间若又出现该单位的新位移宣告，直接改期望值；
//   中间被其它不发位移事实的机制静默挤走，也会落成不一致——这种样本先按观察项上报，
//   等实测确认误报率后再决定是否升硬判据（纪律：0 误报才升硬）。
// 为什么 2026-11-08 仍不升硬（缺取证面，已在 known-transfers.md 登记）：
//   位移出口不止三处宣告：主代码还有直接调 moveUnitPosition 而不发 fact 的路径
//   （阵亡补位/复活归位/召唤占格等），fact 流里看不到这些「静默改位」，导致 11/94 的偏差无法判定。
//   缺什么才能立硬判据：核心位移出口（core/214 moveUnitPosition）统一产一条 MOVE fact
//   { uid, fromPos, toPos, reason }（含静默路径），体检侧才能把「宣告落点 vs 下次露面」闭合成硬账。
export const VER = 'tests/health-rules/248-landing-snapshot-consistency.js V1.1.0';

function addExpected(map, uid, pos, label) {
    if (uid == null || typeof pos !== 'number') return;
    map[uid] = { pos: pos, label: label };
}

function snapshotsOf(f, out) {
    var d = f.data || {};
    if (f.factType === 'attack' || f.factType === 'miss' || f.factType === 'dodge') {
        if (d.attacker && d.attacker.uid != null && typeof d.attacker.pos === 'number') out.push([d.attacker.uid, d.attacker.pos, d.attacker.name || d.attacker.uid]);
        var t = d.target || d.dodger;
        if (t && t.uid != null && typeof t.pos === 'number') out.push([t.uid, t.pos, t.name || t.uid]);
    } else if (f.factType === 'pass' && d.unit && d.unit.uid != null && typeof d.unit.pos === 'number') {
        out.push([d.unit.uid, d.unit.pos, d.unit.name || d.unit.uid]);
    }
}

export const rule248 = {
    group: '选靶与站位回归',
    name: '位移落位后快照一致(观测)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        var fs = facts || [];
        if (!fs.length) return 'skip';

        var expected = {};
        var verified = 0;
        var mismatches = [];

        for (var i = 0; i < fs.length; i++) {
            var f = fs[i];
            if (!f || !f.factType) continue;
            var d = f.data || {};

            // 宣告侧先记期望值，再让同一条 fact 的其它字段按正常顺序对账（申请顺序不交叉）
            if (f.factType === 'skillAnnounce' && d.advanceTo != null) {
                addExpected(expected, d.unitUid, d.advanceTo, '前压');
            } else if (f.factType === 'windAssaultPush') {
                if (d.target) addExpected(expected, d.target.uid, d.behindPos, '击退');
                if (d.behindUnit) addExpected(expected, d.behindUnit.uid, d.oldPos, '被换位');
            } else if (f.factType === 'mindControlSwap' && Array.isArray(d.swaps)) {
                for (var s = 0; s < d.swaps.length; s++) {
                    addExpected(expected, d.swaps[s] && d.swaps[s].uid, d.swaps[s] && d.swaps[s].toPos, '惑心换位');
                }
            }

            var snaps = [];
            snapshotsOf(f, snaps);
            for (var k = 0; k < snaps.length; k++) {
                var uid = snaps[k][0], pos = snaps[k][1], name = snaps[k][2];
                var exp = expected[uid];
                if (!exp) continue;
                delete expected[uid];
                verified++;
                if (pos !== exp.pos) {
                    mismatches.push(name + ' 宣告' + exp.label + '到 ' + exp.pos + ' 号位，下一次露面在 ' + pos + ' 号位');
                }
            }
        }

        if (verified === 0) return 'skip';
        if (mismatches.length) {
            return {
                fail: false,
                observe: '位移落位与后续快照不一致 ' + mismatches.length + '/' + verified + ' 次：' + mismatches.slice(0, 3).join('；')
            };
        }
        return { fail: false, msg: '位移落位与后续快照一致：核对 ' + verified + ' 次宣告移动' };
    }
};
