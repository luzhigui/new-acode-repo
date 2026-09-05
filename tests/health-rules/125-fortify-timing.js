// 回归规则：坚盾计数"已叠0/N" — 修复后坚盾日志在监听器内生成，_fortifyThisRound 已更新
// 复发信号：坚盾日志显示"已叠0/N"（_fortifyThisRound 未更新就读取，时序回退，N 为任意上限值）
// 对应已修 Bug：坚盾计数"已叠0/3"（日志读取早于监听器更新）
export const VER = 'tests/health-rules/125-fortify-timing.js V5.5.1';

export const rule72 = {
    group: '精英技能回归',
    name: '坚盾计数时序(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var fortifyTexts = [];
        for (var j = 0; j < log.length; j++) {
            var e = log[j];
            if (!e) continue;
            // 坚盾日志在 attack-group 的 entries 里（type='detail'）
            var entries = e.entries || [];
            for (var k = 0; k < entries.length; k++) {
                var en = entries[k];
                if (en && en.type === 'detail' && (en.text || '').indexOf('坚盾') !== -1) {
                    fortifyTexts.push(en.text);
                }
            }
            // 防御性：也检查顶层 detail
            if (e.type === 'detail' && (e.text || '').indexOf('坚盾') !== -1) {
                fortifyTexts.push(e.text);
            }
        }
        if (fortifyTexts.length === 0) return 'skip';

        // 复发信号：显示"已叠0/N"（_fortifyThisRound 未更新就读取，N 为任意上限值）
        for (var m = 0; m < fortifyTexts.length; m++) {
            if (fortifyTexts[m].indexOf('已叠0/') !== -1) {
                return { fail: true, msg: '复发：坚盾日志显示"已叠0/N"，_fortifyThisRound 未更新就读取（时序回退，修复后日志应在监听器内生成）' };
            }
        }
        return { fail: false };
    }
};
