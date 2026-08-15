// tests/health-rules/129-spider-fly-count.js
// 回归规则：小昭妹妹飞天免疫次数 — 每场限 3 次（27elite-mingjiao.js _spiderRemaining||3）
// 复发信号：飞天免疫触发次数超过上限，或"剩余次数"出现负数（飞天误触发 / 次数未正确递减）
// 对应已修 Bug：小昭妹妹飞天误触发、飞天后仍行动、飞天免疫次数超限
export const VER = 'tests/health-rules/129-spider-fly-count.js V5.5.0';

export const rule76 = {
    group: '精英技能回归',
    name: '小昭妹飞天免疫次数超限(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var flyCount = 0;
        var negative = null;
        for (var j = 0; j < log.length; j++) {
            var e = log[j];
            if (!e || !e.text) continue;
            if (e.text.indexOf('🕷️ 飞天') === -1) continue;
            flyCount++;
            var m = e.text.match(/剩余次数：(-?\d+)/);
            if (m && parseInt(m[1], 10) < 0) negative = parseInt(m[1], 10);
        }
        if (flyCount === 0) return 'skip';
        var cap = 3; // 与 27elite-mingjiao.js 的 _spiderRemaining||3 保持一致
        if (flyCount > cap) {
            return { fail: true, msg: '复发：小昭妹飞天免疫' + flyCount + '次，超过上限' + cap + '（飞天误触发/次数未递减）' };
        }
        if (negative !== null) {
            return { fail: true, msg: '复发：小昭妹飞天"剩余次数"出现负数' + negative + '（次数超限）' };
        }
        return { fail: false };
    }
};
