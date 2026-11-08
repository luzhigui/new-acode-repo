// tests/health-rules/251-post-swap-followup.js
// 体检规则：换位后同一回合追打连通（观测项）
//
// 要回答的问题：「换位/击退/前压之后，同一个回合里这个单位还能不能被继续追打？」
// 判法（只统计、不染红）：
//   按回合收集「被位移的单位」，再看这些 uid 在本回合后续是否还作为
//   attacker / target / dodger / pass 主体出场。出场＝仍能被战报与后续结算看见；
//   一整个回合都不出场，可能是已经行动过、死亡、或被控制跳过——不能直接判错，
//   所以只给覆盖率，等主代码侧确认哪些属于「换位后被锁死」再升硬判。
// 数据源：skillAnnounce(advanceTo) / windAssaultPush / mindControlSwap 的位移宣告 + 后续快照。
export const VER = 'tests/health-rules/251-post-swap-followup.js V1.0.0';

function isSnapOf(f) {
    var d = f.data || {};
    if (f.factType === 'attack' || f.factType === 'miss' || f.factType === 'dodge') {
        return [d.attacker, d.target || d.dodger].filter(Boolean);
    }
    if (f.factType === 'pass' && d.unit) return [d.unit];
    return [];
}

export const rule251 = {
    group: '选靶与站位回归',
    name: '换位后同回合追打连通(观测)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        var fs = facts || [];
        if (!fs.length) return 'skip';

        var round = null;
        var moved = Object.create(null);      // uid → 名字（本回合被位移）
        var followed = Object.create(null);   // uid → true（本回合后续又出场）
        var totalMoved = 0;
        var totalFollowed = 0;
        var lonely = [];
        var checked = 0;

        function closeRound() {
            for (var uid in moved) {
                totalMoved++;
                if (followed[uid]) totalFollowed++;
                else if (lonely.length < 3) lonely.push(moved[uid] || uid);
            }
            moved = Object.create(null);
            followed = Object.create(null);
        }

        for (var i = 0; i < fs.length; i++) {
            var f = fs[i];
            if (!f || !f.factType) continue;
            var d = f.data || {};

            if (f.factType === 'roundStart') {
                closeRound();
                round = d.round;
                continue;
            }

            if (f.factType === 'skillAnnounce' && d.advanceTo != null && d.unitUid != null) {
                moved[d.unitUid] = d.unitName || d.unitUid;
            } else if (f.factType === 'windAssaultPush') {
                if (d.target) moved[d.target.uid] = d.target.name || d.target.uid;
                if (d.behindUnit) moved[d.behindUnit.uid] = d.behindUnit.name || d.behindUnit.uid;
            } else if (f.factType === 'mindControlSwap' && Array.isArray(d.swaps)) {
                for (var s = 0; s < d.swaps.length; s++) {
                    var sw = d.swaps[s] || {};
                    if (sw.uid != null) moved[sw.uid] = sw.name || sw.uid;
                }
            }

            var snaps = isSnapOf(f);
            for (var k = 0; k < snaps.length; k++) {
                if (snaps[k] && snaps[k].uid != null && moved[snaps[k].uid]) {
                    followed[snaps[k].uid] = true;
                    checked++;
                }
            }
        }
        closeRound();

        if (totalMoved === 0) return 'skip';
        var rate = Math.round(totalFollowed * 100 / totalMoved);
        if (totalFollowed === 0) {
            return { fail: false, observe: '本批 ' + totalMoved + ' 次位移后，同一回合内 0 次再出场（追打覆盖率 0%；样本：' + lonely.join('、') + '）' };
        }
        return { fail: false, msg: '换位后同回合追打连通：' + totalFollowed + '/' + totalMoved + ' 次位移参与者在本回合后续出场（覆盖率 ' + rate + '%）' };
    }
};
