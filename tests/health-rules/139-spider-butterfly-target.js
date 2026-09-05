// 回归规则：小昭妹/姐不可选期目标保护 —
//   妹妹(_spiderFlying 飞天窗口)与姐姐(_untargetable 附身窗口)期间不应被选为攻击目标
// 复发信号：飞天窗口内出现以妹妹为目标的攻击组（SPIDER_IMMUNE 对已飞天目标提前 return 未免疫且未 _untargetable）
//          附身窗口内出现以姐姐为目标的攻击组
//          姐姐开局前排却整场零承伤（附身前疑似提前不可选）
// 对应已报 Bug：妹妹被飞天了还会被打；姐姐附身前不会被打
export const VER = 'tests/health-rules/139-spider-butterfly-target.js V5.5.0';

// 标记可能嵌套在攻击组内（飞天 fact 嵌在免疫组 entries 里），需双层扫描
function findMarker(e, key, val) {
    if (!e) return null;
    if (e[key] === val) return e;
    if (e.entries) {
        for (var j = 0; j < e.entries.length; j++) {
            if (e.entries[j] && e.entries[j][key] === val) return e.entries[j];
        }
    }
    return null;
}

export const rule86 = {
    group: '精英技能回归',
    name: '小昭妹/姐不可选期被打(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var problems = [];
        var spiderFlyIdx = -1, spiderUid = null;
        var attachIdx = -1;

        // 敌方 uid 集合（判攻击方向）+ 姐姐 uid（整场被选目标统计用）
        var enemyUids = {};
        for (var q = 0; q < beforeE.length; q++) {
            if (beforeE[q] && beforeE[q].uid !== undefined) enemyUids[beforeE[q].uid] = true;
        }
        var sisterUid = null;
        for (var q2 = 0; q2 < afterA.length; q2++) {
            if (afterA[q2] && afterA[q2].isXiaoZhaoSister) { sisterUid = afterA[q2].uid; break; }
        }

        var sisterTargeted = 0, enemyAttacks = 0;

        function checkWindow(from, to, uid, label) {
            for (var j = from; j < to; j++) {
                var f = log[j];
                if (!f || f.type !== 'attack-group') continue;
                if (f.uidD === uid && f.isImmune !== true) {
                    problems.push(label + '期间仍被攻击（第' + (j + 1) + '条日志）');
                }
            }
        }

        for (var i = 0; i < log.length; i++) {
            var e = log[i];
            if (!e) continue;
            if (e.type === 'attack-group') {
                if (enemyUids[e.uidA]) enemyAttacks++;
                // 姐姐被选为目标计数（正常受击=uidD；闪避反击组里闪避者为 uidA）
                if (sisterUid != null && (e.uidD === sisterUid || (e.isDodge === true && e.uidA === sisterUid))) {
                    sisterTargeted++;
                }
            }
            var flyM = findMarker(e, 'spiderAction', 'fly');
            if (flyM) {
                spiderFlyIdx = i; spiderUid = flyM.spiderUid != null ? flyM.spiderUid : spiderUid;
                continue;
            }
            if (findMarker(e, 'spiderAction', 'return')) {
                if (spiderFlyIdx !== -1 && spiderUid != null) checkWindow(spiderFlyIdx + 1, i, spiderUid, '妹妹飞天');
                spiderFlyIdx = -1; spiderUid = null;
                continue;
            }
            var attachM = findMarker(e, 'butterflyAction', 'attach');
            if (attachM) {
                attachIdx = i;
                if (attachM.sisterUid != null) sisterUid = attachM.sisterUid;
                continue;
            }
            if (findMarker(e, 'butterflyAction', 'return')) {
                if (attachIdx !== -1 && sisterUid != null) checkWindow(attachIdx + 1, i, sisterUid, '姐姐附身');
                attachIdx = -1;
                continue;
            }
        }
        // 战斗结束时仍在飞天/附身窗口：扫到日志末尾
        if (spiderFlyIdx !== -1 && spiderUid != null) checkWindow(spiderFlyIdx + 1, log.length, spiderUid, '妹妹飞天');
        if (attachIdx !== -1 && sisterUid != null) checkWindow(attachIdx + 1, log.length, sisterUid, '姐姐附身');

        // 姐姐附身前疑似提前不可选：开局前排 + 敌方攻击≥5次 + 整场从未被选为目标 + 零承伤
        var snap = (ctx && ctx.snapshot && Array.isArray(ctx.snapshot.ally)) ? ctx.snapshot.ally : null;
        var sisterAfter = null;
        for (var r = 0; r < afterA.length; r++) {
            if (afterA[r] && afterA[r].isXiaoZhaoSister) sisterAfter = afterA[r];
        }
        if (snap && sisterAfter && sisterTargeted === 0 && enemyAttacks >= 5 && (sisterAfter.dmgTaken || 0) === 0) {
            var sisInit = null;
            for (var s = 0; s < snap.length; s++) {
                if (snap[s] && snap[s].isXiaoZhaoSister) sisInit = snap[s];
            }
            if (sisInit && sisInit.pos != null && sisInit.pos <= 3) {
                problems.push('姐姐开局' + sisInit.pos + '号位前排，敌方攻击' + enemyAttacks + '次却整场零承伤零被选（附身前疑似提前不可选）');
            }
        }

        if (problems.length > 0) return { fail: true, msg: '复发：' + problems.slice(0, 3).join(' | ') };
        if (spiderFlyIdx === -1 && attachIdx === -1 && enemyAttacks === 0) return 'skip';
        return { fail: false };
    }
};
