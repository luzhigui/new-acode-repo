// tests/health-rules/136-meteor-atk.js
// 回归规则：流星赶月普通溅射加攻 — 溅射命中应附带攻击成长（core/12battle-attack-steps.js atkPerSplash）
// 复发信号：普通"☄️ 流星赶月溅射"条目均无"攻击+N"（当前仅小昭姐姐增强版蝶星有成长，普通版缺失）
// 对应已报 Bug：流星赶月普通加攻
export const VER = 'tests/health-rules/136-meteor-atk.js V5.5.0';

export const rule83 = {
    group: 'Buff效果回归',
    name: '流星赶月普通溅射加攻缺失(回归)',
    test: function(ctx, log) {
        var normal = 0, withGrowth = 0;
        for (var i = 0; i < log.length; i++) {
            var e = log[i];
            if (!e || !e.text) continue;
            if (e.text.indexOf('流星赶月溅射') === -1) continue; // 只查普通流星（🦋蝶星增强版另行口径）
            normal++;
            if (e.text.indexOf('攻击+') !== -1) withGrowth++;
        }
        if (normal === 0) return 'skip';
        if (withGrowth === 0) {
            return { fail: true, msg: '复发：普通流星赶月溅射' + normal + '次均无攻击成长（溅射命中应加攻）' };
        }
        if (withGrowth < normal) {
            return { fail: true, msg: '复发：流星赶月溅射' + normal + '次中仅' + withGrowth + '次有攻击成长' };
        }
        return { fail: false };
    }
};
