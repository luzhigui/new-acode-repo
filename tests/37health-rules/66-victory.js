// tests/37health-rules/66-victory.js
// V5.2.0 | 胜利弹幕检查
export const VER = 'tests/37health-rules/66-victory.js V5.2.0';

export const rule66 = {
    group: '特效',
    name: '胜利弹幕检查',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var allyAlive = (afterA || []).filter(function(u) { return u.alive; });
        var enemyAlive = (afterE || []).filter(function(u) { return u.alive; });
        var winner = null;
        var aliveCount = 0;
        if (allyAlive.length > 0 && enemyAlive.length === 0) { winner = '明教'; aliveCount = allyAlive.length; }
        else if (enemyAlive.length > 0 && allyAlive.length === 0) { winner = '六大派'; aliveCount = enemyAlive.length; }
        else return 'skip';

        if (!ctx.store) return 'skip';
        var bubbles = document.querySelectorAll('.danmaku-bubble');
        if (bubbles.length === 0) {
            return { fail: true, msg: 'UI问题：' + winner + '获胜（' + aliveCount + '人存活），但没有任何胜利弹幕' };
        }
        if (bubbles.length < aliveCount) {
            return { fail: true, msg: 'UI问题：' + winner + '获胜，' + aliveCount + '人存活但只有' + bubbles.length + '条弹幕，缺少' + (aliveCount - bubbles.length) + '条' };
        }
        return { fail: false };
    }
};