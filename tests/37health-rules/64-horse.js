﻿// tests/37health-rules/64-horse.js
// V5.2.0 | ~2400 bytes | 拒马存在性检查
export const VER = 'tests/37health-rules/64-horse.js V5.2.0';

export const rule64 = {
    group: '拒马',
    name: '拒马存在性检查',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var hasHorseBuff = (ctx.activeBuffs || []).some(function(b) { return b.key === 'horseFormation'; });
        if (!hasHorseBuff) return 'skip';
        var issues = [];

        var summonEvs = log.filter(function(e) { return e.type === 'buff-summon' && e.horseUid; });
        var destroyEvs = log.filter(function(e) { return e.type === 'buff-destroy' && e.horseUid; });

        if (summonEvs.length === 0) {
            return { fail: true, msg: '日志问题：有horseFormation Buff但没有任何拒马召唤日志' };
        }

        for (var i = 0; i < summonEvs.length; i++) {
            var horseUid = summonEvs[i].horseUid;
            var horsePos = summonEvs[i].horsePos;
            var wasDestroyed = destroyEvs.some(function(e) { return e.horseUid === horseUid; });

            var appearCount = 0;
            for (var j = 0; j < log.length; j++) {
                var entry = log[j];
                if (entry.type === 'attack-group') {
                    if (entry.uidA === horseUid || entry.uidD === horseUid) appearCount++;
                }
            }
            if (appearCount === 0 && !wasDestroyed) {
                issues.push('日志问题：拒马(uid=' + horseUid + ')在' + horsePos + '号位生成，未被销毁但所有攻击日志中从未出现此uid，可能未进入行动队列');
            }

            if (ctx.store) {
                var allCells = document.querySelectorAll('#allyGrid .cell');
                var foundHorse = false;
                for (var c = 0; c < allCells.length; c++) {
                    var cellName = allCells[c].querySelector('.cell-name');
                    if (cellName && cellName.textContent.indexOf('拒马') !== -1) {
                        foundHorse = true;
                        if (parseInt(allCells[c].dataset.pos) !== horsePos) {
                            issues.push('UI问题：拒马在日志中生成于' + horsePos + '号位，但九宫格中拒马出现在' + allCells[c].dataset.pos + '号位，位置不一致');
                        }
                        break;
                    }
                }
                if (!foundHorse && !wasDestroyed) {
                    var horseInTeam = (afterA || []).find(function(u) { return u.uid === horseUid; });
                    if (horseInTeam && horseInTeam.alive) {
                        issues.push('UI问题：拒马(uid=' + horseUid + ')在队伍中存活，但九宫格中找不到拒马格子');
                    }
                }
                if (wasDestroyed && foundHorse) {
                    issues.push('UI问题：拒马(uid=' + horseUid + ')已被销毁，但九宫格中仍有拒马格子');
                }
            }
        }
        if (issues.length > 0) {
            return { fail: true, msg: issues.slice(0, 3).join(' | ') };
        }
        return { fail: false };
    }
};