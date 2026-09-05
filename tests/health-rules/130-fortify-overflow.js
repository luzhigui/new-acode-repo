// 回归规则：坚盾叠加不超过每回合上限 — 日志"已叠X/Y"中 X 不应超过 Y
// 复发信号：已叠X/Y 里 X > Y（坚盾触发前跳过上限校验导致溢出，如成昆 +2）
// 对应已修 Bug：成昆坚盾 +2 溢出（跳过上限校验）
export const VER = 'tests/health-rules/130-fortify-overflow.js V5.5.0';

export const rule77 = {
    group: '数值回归',
    name: '坚盾叠加超上限(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var found = false;
        for (var j = 0; j < log.length; j++) {
            var e = log[j];
            if (!e || !e.text) continue;
            if (e.text.indexOf('🛡️') === -1) continue;
            var m = e.text.match(/已叠(\d+)\/(\d+)/);
            if (!m) continue;
            found = true;
            var cur = parseInt(m[1], 10);
            var cap = parseInt(m[2], 10);
            if (cur > cap) {
                return { fail: true, msg: '复发：坚盾叠加' + cur + '/' + cap + ' 超过上限（触发前未校验溢出）' };
            }
        }
        if (!found) return 'skip';
        return { fail: false };
    }
};
