// 回归规则：坚盾叠加不超过每回合上限 — 日志"已叠X/Y"中 X 不应超过 Y
// 复发信号：已叠X/Y 里 X > Y（坚盾触发前跳过上限校验导致溢出，如成昆 +2）
// 对应已修 Bug：成昆坚盾 +2 溢出（跳过上限校验）
//
// 【口径修正（本次优化，关键）】旧版只扫战报顶层条目 e.text，但坚盾"🛡️ {名} 坚盾：防御+1（已叠X/Y）"
//   是 attack-group 的 entries 子条目（与 125-fortify-timing 同源，125 就是扫 entries 才跑得起来）。
//   实测回放 60 场对局：本规则 60/60 恒返回 'skip' —— 整条空转，连"本场没坚盾"和"真通过"都分不出来，
//   等于上限溢出这条防线长期处于失效状态。现改为「顶层 text + entries 子条目」双层扫描（与 139 同款），
//   每条战报只取首个"已叠X/Y"匹配，避免同一攻击组被重复计数。
//   判据本身不变（X > Y 即复发），保持"优化一处"：只修数据源，不改判定口径。
export const VER = 'tests/health-rules/130-fortify-overflow.js V6.1.11';

// 收集一条战报里所有可能被坚盾文本命中的字符串：顶层 text + attack-group 的 entries 子条目
function fortifyTexts(e) {
    var out = [];
    if (!e) return out;
    if (typeof e.text === 'string' && e.text) out.push(e.text);
    if (Array.isArray(e.entries)) {
        for (var i = 0; i < e.entries.length; i++) {
            var sub = e.entries[i];
            if (sub && typeof sub.text === 'string' && sub.text) out.push(sub.text);
        }
    }
    return out;
}

export const rule77 = {
    group: '数值回归',
    name: '坚盾叠加超上限(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var found = false;
        for (var j = 0; j < log.length; j++) {
            var texts = fortifyTexts(log[j]);
            for (var t = 0; t < texts.length; t++) {
                var s = texts[t];
                if (s.indexOf('🛡️') === -1) continue;
                var m = s.match(/已叠(\d+)\/(\d+)/);
                if (!m) continue;
                found = true;
                var cur = parseInt(m[1], 10);
                var cap = parseInt(m[2], 10);
                if (cur > cap) {
                    return { fail: true, msg: '复发：坚盾叠加' + cur + '/' + cap + ' 超过上限（触发前未校验溢出）' };
                }
                break; // 同一条战报只取首个匹配，避免重复计数
            }
        }
        if (!found) return 'skip';
        return { fail: false };
    }
};
