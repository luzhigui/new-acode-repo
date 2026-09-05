// 回归规则：白骨爪回血刷屏 — 修复后回血日志应在追击序列末尾统一输出一条汇总
// 复发信号：回血日志夹在 clawHit 之间（说明又改回循环内逐条 push）
// 对应已修 Bug：白骨爪回血刷屏（循环内累计，循环外统一输出一条）
export const VER = 'tests/health-rules/123-claw-heal-spam.js V5.5.0';

export const rule70 = {
    group: '精英技能回归',
    name: '白骨爪回血刷屏(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var clawEvs = [];
        var healEvs = [];
        var allBefore = (beforeA || []).concat(beforeE || []);
        var songUid = null;
        for (var i = 0; i < allBefore.length; i++) {
            if (allBefore[i] && allBefore[i].name === '宋青书') { songUid = allBefore[i].uid; break; }
        }
        for (var j = 0; j < log.length; j++) {
            var e = log[j];
            if (!e) continue;
            if (e.isClawHit) clawEvs.push(j);
            var isHeal = e.isHealEntry && (songUid == null || e.healUnitUid === songUid);
            if (!isHeal && e.type === 'info') {
                var t = e.text || '';
                if (t.indexOf('宋青书') !== -1 && (t.indexOf('回复') !== -1 || t.indexOf('回血') !== -1)) isHeal = true;
            }
            if (isHeal) healEvs.push(j);
        }
        if (clawEvs.length === 0) return 'skip';

        var issues = [];
        // 检查1（主信号）：回血日志夹在 clawHit 之间 → 循环内逐条 push（复发）
        for (var h = 0; h < healEvs.length; h++) {
            var ri = healEvs[h];
            var hasBefore = false, hasAfter = false;
            for (var k = 0; k < clawEvs.length; k++) {
                if (clawEvs[k] < ri) hasBefore = true;
                if (clawEvs[k] > ri) hasAfter = true;
            }
            if (hasBefore && hasAfter) {
                issues.push('复发：第' + ri + '条回血日志夹在白骨爪追击中间（claw区间' + clawEvs[0] + '~' + clawEvs[clawEvs.length - 1] + '），修复后应在序列末尾统一输出一条汇总');
                break;
            }
        }
        // 检查2（辅助）：回血条数 > 追击序列数（序列数=文本含"追击"的 clawHit，即 depth=0）
        var pursueCount = 0;
        for (var p = 0; p < clawEvs.length; p++) {
            var ev = log[clawEvs[p]];
            var txt = ev.text || '';
            if (txt.indexOf('追击') !== -1) pursueCount++;
        }
        if (pursueCount > 0 && healEvs.length > pursueCount) {
            issues.push('复发：回血日志' + healEvs.length + '条 > 追击序列数' + pursueCount + '条，修复后每序列应≤1条汇总回血');
        }

        if (issues.length > 0) {
            return { fail: true, msg: issues.slice(0, 2).join(' | ') };
        }
        return { fail: false };
    }
};
