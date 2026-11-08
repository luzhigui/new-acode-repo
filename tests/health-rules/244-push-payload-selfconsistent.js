// tests/health-rules/244-push-payload-selfconsistent.js
// 体检规则：击退/换位载荷自洽（前方单位与后方单位不得落在同一格）
//
// 和 243 的分工：243 只看单边 from/to 是否越界/自环；本规则看「一次击退涉及的两个单位」
//   在载荷层面是否互斥——target 落 behindPos、behindUnit 落 oldPos，两者不能是同一格；
//   有 behindUnit 时必须换位（behindOldPos 必须等于 behindPos），否则就是「宣告换位、实际只挪一边」。
//   这类载荷错误会让演出把两个单位画到同一格，随后所有站位/行动序判断都错。
// 数据源：WIND_ASSAULT_PUSH 原始 fact（core/214 resolvePushOrStun 发出）。
export const VER = 'tests/health-rules/244-push-payload-selfconsistent.js V1.0.0';

function isPos(p) {
    return typeof p === 'number' && isFinite(p) && p >= 1 && p <= 9 && Math.floor(p) === p;
}

export const rule244 = {
    group: '选靶与站位回归',
    name: '击退换位载荷自洽(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        var fs = facts || [];
        if (!fs.length) return 'skip';

        var checked = 0;
        var errs = [];

        for (var i = 0; i < fs.length; i++) {
            var f = fs[i];
            if (!f || f.factType !== 'windAssaultPush') continue;
            var d = f.data || {};
            checked++;

            var tName = (d.target && (d.target.name || d.target.uid)) || '受击者';
            if (!isPos(d.oldPos) || !isPos(d.behindPos)) {
                errs.push(tName + ' 载荷位置不是有效棋格：' + d.oldPos + '→' + d.behindPos);
                continue;
            }
            if (d.oldPos === d.behindPos) {
                errs.push(tName + ' 原地未动却宣告击退：' + d.oldPos);
                continue;
            }
            if (d.behindUnit) {
                var bName = d.behindUnit.name || d.behindUnit.uid || '后方单位';
                if (!isPos(d.behindOldPos)) {
                    errs.push(bName + ' 缺少有效的换位来源位置：' + d.behindOldPos);
                    continue;
                }
                if (d.behindOldPos === d.oldPos) {
                    errs.push(tName + ' 与 ' + bName + ' 落在同一格 ' + d.oldPos + '（换位两侧同格）');
                }
                if (d.behindOldPos !== d.behindPos) {
                    errs.push(bName + ' 的来源位置 ' + d.behindOldPos + ' 与 ' + tName + ' 的落点 ' + d.behindPos + ' 不一致（宣告换位但来源对不上）');
                }
            } else if (d.behindPos < 1 || d.behindPos > 9) {
                errs.push(tName + ' 退无可退却宣告挪到 ' + d.behindPos + '（应改判眩晕或原地不动）');
            }
        }

        if (checked === 0) return 'skip';
        if (errs.length) {
            return {
                fail: true,
                msg: errs.slice(0, 3).join('；') + (errs.length > 3 ? '（共 ' + errs.length + ' 处击退载荷异常）' : '')
            };
        }
        return { fail: false, msg: '击退换位载荷自洽：核对 ' + checked + ' 次击退声明' };
    }
};
