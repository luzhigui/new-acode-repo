﻿﻿﻿﻿﻿﻿﻿// tests/37health-rules/68-dodge-rebound.js
// V5.2.0 | 闪避反击方向检查
export const VER = 'tests/37health-rules/68-dodge-rebound.js V5.2.0';

export const rule68 = {
    group: '闪避反击',
    name: '闪避反击方向检查',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var dodgeEvents = log.filter(function(e) { return e.type === 'attack-group' && e.isDodge; });
        if (dodgeEvents.length === 0) return 'skip';
        var issues = [];

        var allAfter = (afterA || []).concat(afterE || []);

        for (var i = 0; i < dodgeEvents.length; i++) {
            var ev = dodgeEvents[i];
            var dodgerUid = ev.uidA;
            var attackerUid = ev.uidD;
            if (!dodgerUid || !attackerUid) continue;
            var dodger = allAfter.find(function(u) { return u.uid === dodgerUid; });
            var attacker = allAfter.find(function(u) { return u.uid === attackerUid; });
            if (!dodger || !attacker) continue;

            var reboundDmg = 0;
            if (ev.entries) {
                for (var e = 0; e < ev.entries.length; e++) {
                    var entryText = ev.entries[e].text || '';
                    var dmgMatch = entryText.match(/造成\s*(\d+)\s*真实伤害/);
                    if (dmgMatch) { reboundDmg = parseInt(dmgMatch[1]); break; }
                }
            }

            if (attacker.alive) {
                var cell = (function() {
                    if (!attacker || attacker.pos == null) return null;
                    var grid = document.getElementById(attacker.camp === 'ally' ? 'allyGrid' : 'enemyGrid');
                    if (!grid) return null;
                    var order = attacker.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
                    var idx = order.indexOf(attacker.pos);
                    return idx >= 0 ? grid.children[idx] : null;
                })();
                if (cell) {
                    var bar = cell.querySelector('.hp-bar-inner');
                    if (bar) {
                        var barPct = parseFloat(bar.style.height);
                        var logPct = Math.floor((attacker.hp / attacker.maxHp) * 100);
                        if (Math.abs(barPct - logPct) > 3) {
                            issues.push('UI问题：' + dodger.name + '闪避后，攻击者' + attacker.name + '血条显示' + Math.floor(barPct) + '%，但日志hp/maxHp=' + Math.floor(attacker.hp) + '/' + Math.floor(attacker.maxHp) + '=' + logPct + '%，不同步');
                        }
                    }
                }
            }

            if (reboundDmg === 0 && attacker.alive) {
                issues.push('日志问题：' + dodger.name + '闪避了' + attacker.name + '的攻击，但日志中未找到反击伤害数值（理论应为(' + Math.floor(dodger.atk) + '+' + Math.floor(dodger.def) + ')×0.5=' + Math.floor((dodger.atk+dodger.def)*0.5) + '），日志可能遗漏了反击记录');
            }
        }
        if (issues.length > 0) {
            return { fail: true, msg: issues.slice(0, 3).join(' | ') };
        }
        return { fail: false };
    }
};