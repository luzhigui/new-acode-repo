// tests/37health-rules/61-boneclaw.js
// V5.2.0 | 白骨爪伤害公式与斩杀 - 改为疑似标记，放宽判定
export const VER = 'tests/37health-rules/61-boneclaw.js V5.2.0';

export const rule61 = {
    group: '精英技能',
    name: '白骨爪伤害公式与斩杀',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var clawEvents = log.filter(function(e) {
            return e.type === 'info' && e.isClawHit;
        });
        if (clawEvents.length === 0) return 'skip';
        var zhangAlive = (beforeA || []).some(function(u) { return u.isZhang && u.alive; });
        var baseHit = zhangAlive ? 5 : 3;
        var ratio = zhangAlive ? 0.03 : 0.02;
        var executeThreshold = 0.15;
        var issues = [];

        var allAfter = (afterA || []).concat(afterE || []);

        for (var i = 0; i < clawEvents.length; i++) {
            var ev = clawEvents[i];
            var targetUid = ev.clawTargetUid;
            var targetAfter = allAfter.find(function(u) { return u.uid === targetUid; });
            if (!targetAfter) continue;
            var maxHp = targetAfter.maxHp;
            
            var hpBeforeClaw = ev.clawTargetHpBefore;
            if (hpBeforeClaw === undefined) {
                for (var j = log.indexOf(ev) - 1; j >= 0; j--) {
                    var prevEntry = log[j];
                    if (prevEntry.type === 'attack-group' && prevEntry.uidD === targetUid) {
                        if (prevEntry.hpAfter !== undefined) {
                            hpBeforeClaw = prevEntry.hpAfter;
                            break;
                        }
                    }
                }
                if (hpBeforeClaw === undefined) hpBeforeClaw = maxHp;
            }
            
            var hpAfter = ev.clawTargetHpAfter !== undefined ? ev.clawTargetHpAfter : targetAfter.hp;
            var name = targetAfter.name || '目标';

            // 斩杀检测：白骨爪后血量 ≤ 斩杀线但没标记斩杀 → 疑似
            var hpPct = hpAfter / maxHp;
            if (hpPct <= executeThreshold && hpAfter > 0) {
                if (!ev.isExecute) {
                    issues.push('疑似：白骨爪后' + name + '血量' + Math.floor(hpPct*100) + '%≤' + Math.floor(executeThreshold*100) + '%斩杀线，但日志中没有"斩杀"标记（可能后续已斩杀）');
                }
            }
            // 标记了斩杀但血量 > 斩杀线 → 疑似（可能是九阳神功回血导致）
            if (ev.isExecute && hpPct > executeThreshold) {
                issues.push('疑似：白骨爪显示"斩杀"但' + name + '血量' + Math.floor(hpPct*100) + '%>' + Math.floor(executeThreshold*100) + '%斩杀线，可能是九阳神功回血导致');
            }

            // 斩杀伤害不校验公式
            if (ev.isExecute) continue;

            // 普通追击/连锁：校验伤害公式，改为疑似标记
            var lostHp = maxHp - hpBeforeClaw;
            if (lostHp < 0) lostHp = 0;
            var expectedDmg = baseHit + Math.floor(lostHp * ratio);
            var text = ev.text || '';
            var dmgMatch = text.match(/造成\s*(\d+)\s*点伤害/);
            var actualDmg = dmgMatch ? parseInt(dmgMatch[1]) : 0;

            if (actualDmg < expectedDmg - 3) {
                issues.push('疑似：白骨爪对' + name + '造成' + actualDmg + '点伤害，但目标已损失' + lostHp + '血（' + Math.floor(hpBeforeClaw) + '/' + Math.floor(maxHp) + '），有无忌=' + zhangAlive + '，理论应为' + baseHit + '+' + Math.floor(lostHp * ratio) + '=' + expectedDmg + '，实际偏低（可能受九阳神功回血影响）');
            } else if (actualDmg > expectedDmg + 5) {
                issues.push('疑似：白骨爪对' + name + '造成' + actualDmg + '点伤害，但目标已损失' + lostHp + '血（' + Math.floor(hpBeforeClaw) + '/' + Math.floor(maxHp) + '），有无忌=' + zhangAlive + '，理论应为' + baseHit + '+' + Math.floor(lostHp * ratio) + '=' + expectedDmg + '，实际偏高');
            }
        }
        if (issues.length > 0) {
            return { fail: true, msg: issues.slice(0, 3).join(' | ') };
        }
        return { fail: false };
    }
};