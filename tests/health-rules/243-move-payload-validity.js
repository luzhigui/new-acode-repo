// tests/health-rules/243-move-payload-validity.js
// 体检规则：位移声明载荷合法性（越界 / 自环 / 换位落点重复）
//
// 为什么判这三条：站位类缺陷最容易被「演出层读改写后的值」掩盖——
//   播报里写 from→to 时若 from 已经是落点（自环），肉眼只会看到「已在前排」，
//   真实拖拽被吞掉；落点越界（0/10）则会让格子渲染直接落在棋盘外。
//   本规则只认引擎发出来的位移载荷，不猜：
//     · skillAnnounce 带 advanceFrom/advanceTo（标枪前压的单格滑行）
//     · windAssaultPush 的 oldPos / behindPos / behindOldPos（击退或换位）
//     · mindControlSwap 的 swaps[]（惑心/两仪换位）
//   from/to 必须同时是 1~9 的整数、from≠to；同一次换位里 toPos 必须互不重复。
//   数据源是原始 fact 流，漏采只会少报、不会误报。
export const VER = 'tests/health-rules/243-move-payload-validity.js V1.0.0';

function isPos(p) {
    return typeof p === 'number' && isFinite(p) && p >= 1 && p <= 9 && Math.floor(p) === p;
}

export const rule243 = {
    group: '选靶与站位回归',
    name: '位移载荷越界与自环(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        var fs = facts || [];
        if (!fs.length) return 'skip';

        var checked = 0;
        var errs = [];

        for (var i = 0; i < fs.length; i++) {
            var f = fs[i];
            if (!f || !f.factType) continue;
            var d = f.data || {};

            if (f.factType === 'skillAnnounce' && (d.advanceFrom != null || d.advanceTo != null)) {
                checked++;
                if (!isPos(d.advanceFrom) || !isPos(d.advanceTo)) {
                    errs.push((d.unitName || d.unitUid || '单位') + ' 前压载荷越界：' + d.advanceFrom + '→' + d.advanceTo);
                } else if (d.advanceFrom === d.advanceTo) {
                    errs.push((d.unitName || d.unitUid || '单位') + ' 前压载荷自环：from=to=' + d.advanceTo + '（播报读了改写后的位置）');
                }
            }

            if (f.factType === 'windAssaultPush') {
                checked++;
                // 蓄意轰拳·轰飞/崩飞 是「8 号位穿列落 2 号位」的专属位移，不走击退 +3 口径
                // （modules/319 hanlisa L315 明写 oldPos:8 / behindPos:land；138 已按 label 排除同类）。
                var isBombPush = typeof d.label === 'string' && /轰拳|轰飞|崩飞/.test(d.label);
                if (!isPos(d.oldPos) || !isPos(d.behindPos)) {
                    errs.push((d.target && (d.target.name || d.target.uid) || '受击者') + ' 击退载荷越界：' + d.oldPos + '→' + d.behindPos);
                } else {
                    if (!isBombPush && d.behindPos !== d.oldPos + 3) {
                        errs.push((d.target && (d.target.name || d.target.uid) || '受击者') + ' 击退落点不是后方三格：' + d.oldPos + '→' + d.behindPos);
                    }
                    if (d.behindUnit) {
                        if (!isPos(d.behindOldPos)) {
                            errs.push((d.behindUnit.name || d.behindUnit.uid || '后方单位') + ' 换位来源越界：' + d.behindOldPos);
                        } else if (d.behindOldPos !== d.behindPos) {
                            errs.push((d.behindUnit.name || d.behindUnit.uid || '后方单位') + ' 换位来源与受击者落点不一致：' + d.behindOldPos + '≠' + d.behindPos);
                        }
                        if (d.behindOldPos === d.oldPos) {
                            errs.push((d.target && (d.target.name || d.target.uid) || '受击者') + ' 与后方单位原地互换（自环）：' + d.oldPos + '→' + d.behindPos);
                        }
                    }
                }
            }

            if (f.factType === 'mindControlSwap') {
                var swaps = Array.isArray(d.swaps) ? d.swaps : [];
                if (swaps.length) {
                    checked++;
                    var tos = {};
                    for (var k = 0; k < swaps.length; k++) {
                        var s = swaps[k] || {};
                        var who = s.name || s.uid || ('第' + (k + 1) + '个');
                        if (!isPos(s.fromPos) || !isPos(s.toPos)) {
                            errs.push(who + ' 换位载荷越界：' + s.fromPos + '→' + s.toPos);
                            continue;
                        }
                        if (s.fromPos === s.toPos) {
                            errs.push(who + ' 换位载荷自环：from=to=' + s.toPos);
                        }
                        if (tos[s.toPos]) {
                            errs.push('换位落点重复：' + s.toPos + ' 同时被 ' + tos[s.toPos] + ' 与 ' + who + ' 占用');
                        } else {
                            tos[s.toPos] = who;
                        }
                    }
                }
            }
        }

        if (checked === 0) return 'skip';
        if (errs.length) {
            return {
                fail: true,
                msg: errs.slice(0, 3).join('；') + (errs.length > 3 ? '（共 ' + errs.length + ' 处位移载荷异常）' : '')
            };
        }
        return { fail: false, msg: '位移载荷合法：核对 ' + checked + ' 组位移声明（无越界/自环/落点重复）' };
    }
};
