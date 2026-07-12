// tests/37health-rules/64-horse.js
// V5.0.6 | 拒马存在性检查 - 增强日志定位
export const VER = 'tests/37health-rules/64-horse.js V5.0.6';

export const rule64 = {
    group: '拒马',
    name: '拒马存在性检查',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var hasHorseBuff = (ctx.activeBuffs || []).some(function(b) { return b.key === 'horseFormation'; });
        if (!hasHorseBuff) return 'skip';
        var issues = [];

        var summonEvs = log.filter(function(e) { return e.type === 'buff-summon' && e.horseUid; });
        var destroyEvs = log.filter(function(e) { return e.type === 'buff-destroy' && e.horseUid; });

        if (summonEvs.length === 0) {
            // 找最近的回合开始，定位缺失发生的回合
            var lastRound = '?';
            for (var i = log.length - 1; i >= 0; i--) {
                if (log[i].type === 'round-start') {
                    var m = (log[i].text || '').match(/第(\d+)回合/);
                    if (m) { lastRound = m[1]; break; }
                }
            }
            return { fail: true, msg: '日志问题：有horseFormation Buff但没有任何拒马召唤日志 (第' + lastRound + '回合附近)' };
        }

        for (var i = 0; i < summonEvs.length; i++) {
            var horseUid = summonEvs[i].horseUid;
            var horsePos = summonEvs[i].horsePos;
            var loc = summonEvs[i]._locate || '';
            var wasDestroyed = destroyEvs.some(function(e) { return e.horseUid === horseUid; });

            var appearCount = 0;
            for (var j = 0; j < log.length; j++) {
                var entry = log[j];
                if (entry.type === 'attack-group') {
                    if (entry.uidA === horseUid || entry.uidD === horseUid) appearCount++;
                }
            }
            if (appearCount === 0 && !wasDestroyed) {
                issues.push('日志问题：拒马(uid=' + horseUid + ')在' + horsePos + '号位生成，未被销毁但所有攻击日志中从未出现此uid，可能未进入行动队列 ' + loc);
            }
        }
        if (issues.length > 0) {
            return { fail: true, msg: issues.slice(0, 3).join(' | ') };
        }
        return { fail: false };
    }
};