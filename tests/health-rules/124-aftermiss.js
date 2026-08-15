// tests/health-rules/124-aftermiss.js
// 回归规则：宋青书未命中后不重试 — 修复后 resolveAttackHit 未命中时发射 afterMiss 信号触发重试
// 复发信号：宋青书出现未命中但整场无任何重试攻击（afterMiss 信号可能未发射）
// 对应已修 Bug：宋青书未命中后不重试（afterMiss 信号未发射）
export const VER = 'tests/health-rules/124-aftermiss.js V5.5.0';

export const rule71 = {
    group: '精英技能回归',
    name: '宋青书未命中重试(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var songUid = null;
        var allBefore = (beforeA || []).concat(beforeE || []);
        for (var i = 0; i < allBefore.length; i++) {
            if (allBefore[i] && allBefore[i].name === '宋青书') { songUid = allBefore[i].uid; break; }
        }
        if (!songUid) return 'skip';

        var missCount = 0;
        var retryCount = 0;
        for (var j = 0; j < log.length; j++) {
            var e = log[j];
            if (!e) continue;
            // 未命中日志：attack-group 且 isMiss:true，攻击者是宋青书
            if (e.isMiss && e.uidA === songUid) {
                missCount++;
                // 检查后续 1-2 条是否为同攻击者的重试 attack-group（非 miss）
                for (var k = j + 1; k < Math.min(j + 3, log.length); k++) {
                    var ne = log[k];
                    if (ne && ne.uidA === songUid && !ne.isMiss && ne.type === 'attack-group') {
                        retryCount++;
                        break;
                    }
                }
            }
        }
        if (missCount === 0) return 'skip';

        // 复发信号：有未命中但从无重试（afterMiss 信号可能未发射）
        if (retryCount === 0) {
            return { fail: true, msg: '复发：宋青书未命中' + missCount + '次但无重试，afterMiss 信号可能未发射（修复后未命中应能触发重试）' };
        }
        return { fail: false };
    }
};
