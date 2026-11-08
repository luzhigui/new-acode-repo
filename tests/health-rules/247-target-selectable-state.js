// tests/health-rules/247-target-selectable-state.js
// 体检规则：攻击目标必须处于「可选靶」状态（飞行/附身态不得被选为攻击目标）
//
// 判据源（core/203 canBeTargeted）：可选靶 = 存活 + 非待死 + 非 _untargetable
//   + 非蝶/蛛飞行 + 非蛛飞天 + 非附身/FSM 飞行。
//   本规则只看攻击类事实自带的**同一时刻快照**，因此能判的是：
//     目标 alive 必须为 true、state._isDead 必须为 false、
//     state._flyMode 不能是 butterfly/spider、_spiderFlying 必须 false、_butterflyHost 必须为空。
//   已阵亡/自伤/误伤归 182，本规则不重复；_pendingDeath 与 _untargetable 不在攻击快照里，
//   无从判定 → 宁漏勿误，不猜。
//   免疫 fact 的 attacker/target 是精简快照（无 state），跳过。
// 为什么值得盯：飞天/附身单位「打不到也不该被打」，若被选中，战报会出现「打天上的人」；
//   这类缺陷不会报错，只会让一整个回合的输出落空/错位。
export const VER = 'tests/health-rules/247-target-selectable-state.js V1.0.0';

var FULL_SNAPSHOT_FACTS = { attack: true, miss: true, dodge: true };

function badState(t) {
    var st = (t && t.state) || {};
    if (t.alive !== true) return '目标快照 alive=false';
    if (st._isDead === true) return '目标快照 _isDead=true';
    if (st._flyMode === 'butterfly') return '目标处于蝶附身态(flyMode=butterfly)';
    if (st._flyMode === 'spider') return '目标处于蛛飞态(flyMode=spider)';
    if (st._spiderFlying === true) return '目标处于蛛飞天(spiderFlying)';
    if (st._butterflyHost) return '目标处于附身态(butterflyHost)';
    return null;
}

export const rule247 = {
    group: '选靶与站位回归',
    name: '攻击目标可选性(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        var fs = facts || [];
        if (!fs.length) return 'skip';

        var checked = 0;
        var errs = [];

        for (var i = 0; i < fs.length; i++) {
            var f = fs[i];
            if (!f || !FULL_SNAPSHOT_FACTS[f.factType]) continue;
            var d = f.data || {};
            var a = d.attacker;
            var t = d.target || d.dodger;
            if (!a || !t) continue;   // 字段缺失归 246，不在此重复判
            checked++;
            var why = badState(t);
            if (why) {
                errs.push((a.name || a.uid) + ' 的 ' + f.factType + ' 指向了 ' + (t.name || t.uid) + '：' + why);
            }
        }

        if (checked === 0) return 'skip';
        if (errs.length) {
            return {
                fail: true,
                msg: errs.slice(0, 3).join('；') + (errs.length > 3 ? '（共 ' + errs.length + ' 次选中不可选目标）' : '')
            };
        }
        return { fail: false, msg: '攻击目标可选性成立：核对 ' + checked + ' 条攻击事实的目标快照' };
    }
};
