// 回归规则：苦练提示 — 设计为宋青书单飞（无周芷若）时每回合行动前给全队叠加 +攻+防+血上限（自身三倍）
// 复发信号：出现"+0攻+0防"占位提示（core/11battle-round.js 366/371 行占位 fact 未过滤）/ 一场超 24 次疑死循环
// 对应已报 Bug：苦练提示数值为+0攻/+0防（占位未过滤）
export const VER = 'tests/health-rules/137-kulian-prompt.js V5.6.0';

export const rule84 = {
    group: '战报渲染回归',
    name: '苦练提示数值错误/异常高频(回归)',
    test: function(ctx, log) {
        var count = 0, zeroVal = 0;
        for (var i = 0; i < log.length; i++) {
            var e = log[i];
            if (!e || !e.text) continue;
            if (e.text.indexOf('🏋️ 苦练') === -1) continue;
            count++;
            if (e.text.indexOf('+0攻') !== -1 || e.text.indexOf('+0防') !== -1) zeroVal++;
        }
        if (count === 0) return 'skip';
        if (zeroVal > 0) {
            return { fail: true, msg: '复发：苦练提示' + zeroVal + '处数值为+0攻/+0防（占位提示未过滤，数值不对）' };
        }
        if (count > 24) {
            return { fail: true, msg: '异常：苦练提示出现' + count + '次（每回合叠加设计，一场正常应≤回合数，疑死循环）' };
        }
        return { fail: false };
    }
};
