// tests/health-rules/246-empty-target-explicit.js
// 体检规则：空目标必须显式落账（不得静默变成打别人 / 不得有无目标的攻击事实）
//
// 两条结构不变量：
//   ① 攻击类事实（attack / miss / dodge / immune）必须带目标 uid —— 没有目标就没有「命中/落空」，
//      出现一条无目标攻击事实，说明选靶环节被绕过，战报会把「打别人」写得像一次正常出手。
//   ② 空目标事实（emptyTarget）必须带攻击者 uid 与非空原因 —— 空目标本身就是一次显式行动
//      （锁定目标已阵亡 / 无可选目标），漏字段会让渲染层无法归因到出手者。
// 判据来源：core/209 processUnitAttack 的两条 emptyFact 出口（锁定目标已阵亡 / 无可选目标）
//   与 core/212 resolveAttackHit 的 miss/dodge fact。只查字段完整性，不猜「本应打谁」。
export const VER = 'tests/health-rules/246-empty-target-explicit.js V1.0.0';

var TARGET_FACTS = { attack: true, miss: true, dodge: true, immune: true };

export const rule246 = {
    group: '选靶与站位回归',
    name: '空目标显式落账(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        var fs = facts || [];
        if (!fs.length) return 'skip';

        var checked = 0;
        var empties = 0;
        var errs = [];

        for (var i = 0; i < fs.length; i++) {
            var f = fs[i];
            if (!f || !f.factType) continue;
            var d = f.data || {};

            if (TARGET_FACTS[f.factType]) {
                checked++;
                var t = d.target || d.dodger;
                if (!t || t.uid == null) {
                    var a = d.attacker || {};
                    errs.push((a.name || a.uid || '未知单位') + ' 的 ' + f.factType + ' 事实没有目标 uid（静默打空/改打他人）');
                }
                continue;
            }

            if (f.factType === 'emptyTarget') {
                empties++;
                var at = d.attacker;
                if (!at || at.uid == null) {
                    errs.push('emptyTarget 事实缺少攻击者 uid');
                }
                if (typeof d.reason !== 'string' || !d.reason.length) {
                    errs.push((at && (at.name || at.uid) || '未知单位') + ' 的 emptyTarget 事实缺少原因');
                }
            }
        }

        if (checked === 0 && empties === 0) return 'skip';
        if (errs.length) {
            return {
                fail: true,
                msg: errs.slice(0, 3).join('；') + (errs.length > 3 ? '（共 ' + errs.length + ' 处空目标字段缺口）' : '')
            };
        }
        return { fail: false, msg: '空目标显式落账：核对 ' + checked + ' 条攻击事实 / ' + empties + ' 条空目标事实，字段齐全' };
    }
};
