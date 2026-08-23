// tests/health-rules/138-wind-push.js
// 回归规则：乘风破浪击退换位 — 击退恰一行(+3)、有身后单位时双方换位、位置随后真实生效
// 复发信号：击退距离≠+3 / 换位描述缺失 / 击退后单位站位与战报宣告不一致（换位未生效或特效错位）
// 对应已报 Bug：乘风破浪击退换位特效不对
export const VER = 'tests/health-rules/138-wind-push.js V5.5.0';

export const rule85 = {
    group: '技能效果回归',
    name: '乘风击退换位异常(回归)',
    test: function(ctx, log) {
        var pushes = [];
        for (var i = 0; i < log.length; i++) {
            var e = log[i];
            if (e && e.type === 'buff-push') pushes.push({ idx: i, entry: e });
        }
        if (pushes.length === 0) return 'skip';
        var problems = [];
        for (var p = 0; p < pushes.length; p++) {
            var pu = pushes[p].entry;
            var oldPos = pu.oldPos, newPos = pu.newPos;
            // 1. 击退距离：应恰为一行（pos+3）
            if (oldPos != null && newPos != null && newPos !== oldPos + 3) {
                problems.push('击退距离异常：' + oldPos + '→' + newPos + '号位（应+3）');
                continue;
            }
            // 2. 换位描述：有身后单位时应含双方移位描述
            if (pu.behindUid != null && pu.text && pu.text.indexOf('移至') === -1) {
                problems.push('击退换位缺身后单位移位描述');
            }
            // 3. 位置一致性：击退后该单位下次参与攻击时站位应为宣告位置（中途再换位则跳过）
            var expect = [{ uid: pu.pushTargetUid, pos: newPos, tag: '被击退者' }];
            if (pu.behindUid != null) expect.push({ uid: pu.behindUid, pos: oldPos, tag: '被迫换位者' });
            for (var q = 0; q < expect.length; q++) {
                var exp = expect[q];
                for (var r = pushes[p].idx + 1; r < log.length; r++) {
                    var a = log[r];
                    if (!a || a.type !== 'attack-group' || !a._fxSnapshot) continue;
                    var actual = null;
                    if (a.uidA === exp.uid) actual = a._fxSnapshot.attackerPos;
                    else if (a.uidD === exp.uid) actual = a._fxSnapshot.defenderPos;
                    if (actual == null) continue;
                    var interrupted = false;
                    for (var s = pushes[p].idx + 1; s < r; s++) {
                        var mid = log[s];
                        if (mid && (mid.type === 'buff-push' || mid.type === 'buff-swap')) {
                            if (mid.pushTargetUid === exp.uid || mid.behindUid === exp.uid ||
                                mid.uidA === exp.uid || mid.uidB === exp.uid) { interrupted = true; break; }
                        }
                    }
                    if (interrupted) break;
                    if (actual !== exp.pos) {
                        problems.push(exp.tag + '击退后位置未生效：预期' + exp.pos + '号位实际' + actual + '号位');
                    }
                    break;
                }
            }
        }
        if (problems.length > 0) return { fail: true, msg: '复发：乘风击退换位异常 — ' + problems.slice(0, 3).join(' | ') };
        return { fail: false };
    }
};
