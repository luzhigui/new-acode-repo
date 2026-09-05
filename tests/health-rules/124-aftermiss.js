// 回归规则：宋青书未命中后不重试 — 修复后 resolveAttackHit 未命中时发射 afterMiss 信号触发重试
// 判定口径（2026-09-03 v2）：性奋是回合级一次性资源，额外攻击/重试共用一次消耗。
//   正常不重试的场景（旧规则会误报）：buff 已被消耗后 miss（额外攻击自身未命中）。
//   死链特征：周芷若在场（有授权）+ 宋青书有 miss + 整场零次"获得额外攻击机会"
//   —— 命中会走 AFTER_DAMAGE 触发额外攻击，miss 走 AFTER_MISS 触发重试，两条路全灭才是信号链断裂。
// 对应已修 Bug：宋青书未命中后不重试（afterMiss 信号未发射）
export const VER = 'tests/health-rules/124-aftermiss.js V5.6.0';

export const rule71 = {
    group: '精英技能回归',
    name: '宋青书未命中重试(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var songUid = null;
        var hasZhou = false;
        var allBefore = (beforeA || []).concat(beforeE || []);
        for (var i = 0; i < allBefore.length; i++) {
            var u = allBefore[i];
            if (!u) continue;
            if (u.name === '宋青书' && songUid === null) songUid = u.uid;
            if (u.name === '周芷若') hasZhou = true;
        }
        if (songUid === null) return 'skip';
        // 周芷若不在场：性奋无从授权，miss 不重试是设计行为
        if (!hasZhou) return 'skip';

        var missCount = 0;
        var fenGrant = 0;
        var fenTrigger = 0;
        for (var j = 0; j < log.length; j++) {
            var e = log[j];
            if (!e) continue;
            if (e.isMiss && e.uidA === songUid) missCount++;
            var txt = e.text || '';
            if (txt.indexOf('性奋') !== -1) {
                if (txt.indexOf('获得额外攻击机会') !== -1) fenTrigger++;
                else if (txt.indexOf('受周芷若激励') !== -1) fenGrant++;
            }
        }
        if (missCount === 0) return 'skip';

        // 死链：有授权 + 有 miss，但整场零次性奋触发（命中→额外攻击、miss→重试，两路全灭）
        if (fenTrigger === 0) {
            return { fail: true, msg: '复发：宋青书未命中' + missCount + '次且整场零次性奋触发（授权' + fenGrant + '次），afterMiss/攻击后信号链可能断裂' };
        }
        return { fail: false };
    }
};
