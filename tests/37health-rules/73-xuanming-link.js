// tests/37health-rules/73-xuanming-link.js
// 回归规则：玄冥二老联动吞回合 — 修复后 partner._acted = wasActed 恢复联动前状态
// 复发信号：玄冥联动多次发生，但搭档（跟随者）从无自己发起的攻击（被吞回合）
// 对应已修 Bug：玄冥二老联动吞回合（partner._acted 被无条件设 true）
export const VER = 'tests/37health-rules/73-xuanming-link.js V5.4.0';

export const rule73 = {
    group: '精英技能回归',
    name: '玄冥联动吞回合(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var linkPartners = []; // 联动日志里的跟随者名字
        for (var j = 0; j < log.length; j++) {
            var e = log[j];
            if (!e) continue;
            if (e.type === 'info' && (e.text || '').indexOf('联动攻击') !== -1) {
                // 解析"🔗 {partner} 跟随 {unit} 发动联动攻击！"
                var m = (e.text || '').match(/跟随\s*(.+?)\s*发动联动/);
                if (m) linkPartners.push(m[1]);
            }
        }
        if (linkPartners.length === 0) return 'skip';

        // 找搭档的 uid
        var allUnits = (beforeA || []).concat(beforeE || []);
        var partnerUids = {};
        for (var p = 0; p < linkPartners.length; p++) {
            for (var u = 0; u < allUnits.length; u++) {
                if (allUnits[u] && allUnits[u].name === linkPartners[p]) {
                    partnerUids[allUnits[u].uid] = true;
                }
            }
        }

        // 检测搭档是否有自己发起的 attack-group
        var soloAttackCount = 0;
        for (var j2 = 0; j2 < log.length; j2++) {
            var e2 = log[j2];
            if (e2 && e2.type === 'attack-group' && e2.uidA && partnerUids[e2.uidA]) {
                soloAttackCount++;
            }
        }

        // 复发信号：联动≥2次但搭档无单独攻击（可能被吞回合）
        if (soloAttackCount === 0 && linkPartners.length >= 2) {
            return { fail: true, msg: '复发：玄冥联动' + linkPartners.length + '次但搭档' + linkPartners[0] + '从无单独攻击，可能 partner._acted 被无条件设 true（吞回合）' };
        }
        return { fail: false };
    }
};
