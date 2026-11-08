// tests/health-rules/250-swap-permutation-closure.js
// 体检规则：惑心换位置换闭合（≥2 人必须是换位环）
//
// 判据源 core/215 shuffleThreeSlots：
//   · 候选 ≥2：随机顺序串成环，每个单位挪到下一个单位的原位 ⇒ 来源集合必须等于落点集合，
//     且 uid 不重复、fromPos 不重复、toPos 不重复（全员必动、无定点）。
//   · 候选 =1：直接挪去空位 ⇒ 允许 from≠to 的单边移动（此时来源/落点集合天然不等），不判闭合。
// 为什么值得盯：闭合一旦破坏，会出现「两人抢同一格」或「一人没动」，
//   后续所有站位/追打判断都建立在错的棋盘上；243/244 只看单边载荷，本条补整体置换。
// 数据源：MIND_CONTROL_SWAP 原始 fact（swaps / allPositions）。
export const VER = 'tests/health-rules/250-swap-permutation-closure.js V1.0.0';

function isPos(p) {
    return typeof p === 'number' && isFinite(p) && p >= 1 && p <= 9 && Math.floor(p) === p;
}

export const rule250 = {
    group: '选靶与站位回归',
    name: '换位置换闭合(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        var fs = facts || [];
        if (!fs.length) return 'skip';

        var checked = 0;
        var singleMoves = 0;
        var errs = [];

        for (var i = 0; i < fs.length; i++) {
            var f = fs[i];
            if (!f || f.factType !== 'mindControlSwap') continue;
            var d = f.data || {};
            var swaps = Array.isArray(d.swaps) ? d.swaps : [];
            if (!swaps.length) continue;
            checked++;
            if (swaps.length === 1) {
                singleMoves++;
                var only = swaps[0] || {};
                if (isPos(only.fromPos) && isPos(only.toPos) && only.fromPos === only.toPos) {
                    errs.push('单人换位原地未动：' + (only.name || only.uid) + ' 停在 ' + only.toPos);
                }
                continue;
            }

            var fromSet = [], toSet = [], uids = [], bad = [];
            for (var k = 0; k < swaps.length; k++) {
                var s = swaps[k] || {};
                if (s.uid == null) bad.push('第 ' + (k + 1) + ' 条换位缺 uid');
                uids.push(String(s.uid));
                fromSet.push(s.fromPos);
                toSet.push(s.toPos);
            }
            if (uids.length !== new Set(uids).size) bad.push('同一单位在一次换位里重复出现');
            if (fromSet.length !== new Set(fromSet).size) bad.push('来源格重复：' + fromSet.join(','));
            if (toSet.length !== new Set(toSet).size) bad.push('落点格重复：' + toSet.join(','));
            var a = fromSet.slice().sort(function (x, y) { return x - y; }).join(',');
            var b = toSet.slice().sort(function (x, y) { return x - y; }).join(',');
            if (a !== b) bad.push('来源/落点不闭合：[' + a + '] ≠ [' + b + ']');
            if (bad.length) errs.push('第?回合惑心换位：' + bad.join('；'));
        }

        if (checked === 0) return 'skip';
        if (errs.length) {
            return {
                fail: true,
                msg: errs.slice(0, 3).join('；') + (errs.length > 3 ? '（共 ' + errs.length + ' 次换位不闭合）' : '')
            };
        }
        return { fail: false, msg: '换位置换闭合：核对 ' + checked + ' 次惑心换位（其中单人挪空位 ' + singleMoves + ' 次）' };
    }
};
