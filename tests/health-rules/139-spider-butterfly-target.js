// 回归规则：小昭妹/姐不可选期目标保护 —
//   妹妹(_spiderFlying 飞天窗口)与姐姐(_untargetable 附身窗口)期间不应被选为攻击目标
// 复发信号：飞天窗口内出现以妹妹为目标的攻击组（SPIDER_IMMUNE 对已飞天目标提前 return 未免疫且未 _untargetable）
//          附身窗口内出现以姐姐为目标的攻击组
//          姐姐开局前排却整场零承伤（附身前疑似提前不可选）
// 对应已报 Bug：妹妹被飞天了还会被打；姐姐附身前不会被打
// V6.1.26 补「宿主阵亡」退出分支：附身窗口有**两个**关闭点——
//   ① 正常飞回 `renderButterflyReturnFact`（render/35:360-362，带 butterflyAction:'return'）；
//   ② 宿主阵亡被迫返回 `renderButterflyHostDeadFact`（render/35:363-365），
//      该条目**不带 butterflyAction**（只有 uidD=sisterUid + isDead + 固定文本
//      「🦋 蝶变：宿主已阵亡，X 被迫返回！」）。旧实现只认 ①，于是宿主一死窗口永不关闭，
//      姐姐此后正常挨的每一次打都被判"附身期间被打"——实锤误报（seed=17 stage=3 第207条）。
//      语义上 ② 与 ① 等价（姐姐恢复原形、重新可选），故并列为窗口关闭点。
export const VER = 'tests/health-rules/139-spider-butterfly-target.js V6.1.26';

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

// 宿主阵亡被迫返回：无 butterflyAction 可认，只能按渲染文本识别（文本由 render/35:364 写死）
function isHostDeadReturn(e) {
    if (!e || typeof e.text !== 'string') return false;
    return e.text.indexOf('蝶变') !== -1 && e.text.indexOf('宿主已阵亡') !== -1;
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
            // 附身窗口关闭点：正常飞回 或 宿主阵亡被迫返回（两者都让姐姐恢复原形、重新可选）
            if (findMarker(e, 'butterflyAction', 'return') || isHostDeadReturn(e)) {
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
