// tests/health-rules/131-separator-duplicate.js
// 回归规则：回合/战斗分隔符不重复 — 同一回合的开始、结束分隔符最多各出现一次
// 复发信号：同一回合出现两次"第N回合开始"或两次"第N回合结束"（双分隔符）
// 对应已修 Bug：回合结束 / 战斗结束产生两次分隔符
export const VER = 'tests/health-rules/131-separator-duplicate.js V5.5.0';

export const rule78 = {
    group: '日志回归',
    name: '回合分隔符重复(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var startSeen = {};
        var endSeen = {};
        var dup = null;
        for (var j = 0; j < log.length; j++) {
            var e = log[j];
            if (!e || !e.text) continue;
            var t = String(e.text).replace(/<[^>]+>/g, '');
            var m = t.match(/第(\d+)回合(开始|结束)/);
            if (!m) continue;
            var round = parseInt(m[1], 10);
            if (m[2] === '开始') {
                if (startSeen[round]) { dup = '第' + round + '回合出现两次开始分隔符'; break; }
                startSeen[round] = true;
            } else {
                if (endSeen[round]) { dup = '第' + round + '回合出现两次结束分隔符'; break; }
                endSeen[round] = true;
            }
        }
        if (dup) return { fail: true, msg: '复发：' + dup + '（双分隔符）' };
        return { fail: false };
    }
};
