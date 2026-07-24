// tests/37health-rules/63-carry-hp.js
// V5.2.0 | Carry血量方向检查
export const VER = 'tests/37health-rules/63-carry-hp.js V5.2.0';

export const rule63 = {
    group: 'Buff效果',
    name: 'Carry血量方向检查',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var carryUnit = (beforeA || []).find(function(u) { return u.pos === 5 && u.alive && !u.isHorse; });
        if (!carryUnit) return 'skip';
        var issues = [];
        
        for (var i = 0; i < log.length; i++) {
            var entry = log[i];
            if (entry._events && entry._events.length > 0) {
                for (var e = 0; e < entry._events.length; e++) {
                    var ev = entry._events[e];
                    if (ev.eventType === 'hp-change' && ev.unitUid === carryUnit.uid && ev.payload) {
                        var hp = ev.payload.hp;
                        var maxHp = ev.payload.maxHp;
                        if (maxHp !== undefined && hp !== undefined) {
                            if (hp > maxHp) {
                                issues.push('日志问题：' + carryUnit.name + '的hp=' + Math.floor(hp) + '超过maxHp=' + Math.floor(maxHp) + '，血量溢出');
                            }
                            if (hp < 0) {
                                issues.push('日志问题：' + carryUnit.name + '的hp=' + Math.floor(hp) + '为负数');
                            }
                        }
                    }
                }
            }
        }

        var carryAfter = (afterA || []).find(function(u) { return u.uid === carryUnit.uid; });
        if (carryAfter && carryAfter.alive) {
            var cell = carryAfter.pos != null ? (function() {
                var grid = document.getElementById('allyGrid');
                if (!grid) return null;
                var order = [1,2,3,4,5,6,7,8,9];
                var idx = order.indexOf(carryAfter.pos);
                return idx >= 0 ? grid.children[idx] : null;
            })() : null;
            if (cell) {
                var bar = cell.querySelector('.hp-bar-inner');
                if (bar) {
                    var barPct = parseFloat(bar.style.height);
                    var logPct = Math.floor((carryAfter.hp / carryAfter.maxHp) * 100);
                    if (Math.abs(barPct - logPct) > 3) {
                        issues.push('UI问题：' + carryAfter.name + '血条显示' + Math.floor(barPct) + '%，但日志记录hp/maxHp=' + Math.floor(carryAfter.hp) + '/' + Math.floor(carryAfter.maxHp) + '=' + logPct + '%，差距' + Math.abs(Math.floor(barPct) - logPct) + '%');
                    }
                }
            }
        }
        
        if (issues.length > 0) {
            return { fail: true, msg: issues.join(' | ') };
        }
        return { fail: false };
    }
};