// tests/health-rules/137-kulian-prompt.js
// 回归规则：苦练提示 — 每场仅开场触发1次且数值非0（core/15-skill-mechanisms.js 开场应用）
// 复发信号：出现"+0攻+0防"占位提示（core/11battle-round.js 366/371 行占位 fact 未过滤）/ 同场提示≥2次
// 对应已报 Bug：苦练提示俩次，还不对一次
export const VER = 'tests/health-rules/137-kulian-prompt.js V5.5.0';

export const rule84 = {
    group: '战报渲染回归',
    name: '苦练提示重复/数值错误(回归)',
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
        if (count > 1) {
            return { fail: true, msg: '复发：苦练提示出现' + count + '次（每场应仅开场1次）' };
        }
        return { fail: false };
    }
};
