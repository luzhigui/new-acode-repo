﻿﻿﻿﻿﻿// tests/37health-rules/65-swap.js
// V5.2.0 | 换位后双方单位存在 — 阵亡跳过，二次移动改文案
export const VER = 'tests/37health-rules/65-swap.js V5.2.0';

export const rule65 = {
    group: '换位',
    name: '换位后双方单位存在',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var swapEvs = log.filter(function(e) {
            return e.type === 'buff-swap' || e.type === 'buff-push';
        });
        if (swapEvs.length === 0) return 'skip';
        var issues = [];

        var allAfter = (afterA || []).concat(afterE || []);

        for (var i = 0; i < swapEvs.length; i++) {
            var ev = swapEvs[i];
            
            var nameA = ev._swapNameA;
            var nameB = ev._swapNameB;
            var uidA = ev._swapUidA;
            var uidB = ev._swapUidB;
            var enginePosA = ev._swapEnginePosA;
            var enginePosB = ev._swapEnginePosB;
            
            if (!nameA || !nameB) continue;

            var unitA = allAfter.find(function(u) { return u.uid === uidA; });
            var unitB = allAfter.find(function(u) { return u.uid === uidB; });

            // 如果单位已阵亡，跳过（找不到后续攻击记录是正常的）
            var deadA = !unitA || !unitA.alive;
            var deadB = !unitB || !unitB.alive;

            var foundAfterSwapA = false;
            var foundAfterSwapB = false;
            var matchedPosA = false;  // 至少有一次攻击记录的 pos 和换位 pos 一致
            var matchedPosB = false;
            
            if (!deadA || !deadB) {
                for (var s = log.indexOf(ev) + 1; s < log.length; s++) {
                    var laterEntry = log[s];
                    if (laterEntry.type === 'attack-group') {
                        if (!deadA && (laterEntry.uidA === uidA || laterEntry.uidD === uidA)) {
                            foundAfterSwapA = true;
                            var posA = laterEntry.uidA === uidA ? laterEntry._atkPos : laterEntry._defPos;
                            if (posA !== undefined && posA === enginePosA) matchedPosA = true;
                        }
                        if (!deadB && (laterEntry.uidA === uidB || laterEntry.uidD === uidB)) {
                            foundAfterSwapB = true;
                            var posB = laterEntry.uidA === uidB ? laterEntry._atkPos : laterEntry._defPos;
                            if (posB !== undefined && posB === enginePosB) matchedPosB = true;
                        }
                    }
                }
            }

            // 换位后单位存活、有后续攻击记录、但没有任何一次 pos 和换位 pos 匹配 → 可能被二次移动
            if (!deadA && foundAfterSwapA && !matchedPosA && enginePosA !== undefined) {
                issues.push('日志问题：' + nameA + '换位后引擎pos=' + enginePosA + '，但后续攻击记录中位置均不匹配，换位可能未生效或被二次移动');
            }
            if (!deadB && foundAfterSwapB && !matchedPosB && enginePosB !== undefined) {
                issues.push('日志问题：' + nameB + '换位后引擎pos=' + enginePosB + '，但后续攻击记录中位置均不匹配，换位可能未生效或被二次移动');
            }

            // UI检测
            if (unitA && unitA.alive) {
                var cellA = (function() {
                    if (!unitA || unitA.pos == null) return null;
                    var grid = document.getElementById('allyGrid') || document.getElementById('enemyGrid');
                    if (!grid) return null;
                    var order = unitA.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
                    var idx = order.indexOf(unitA.pos);
                    return idx >= 0 ? grid.children[idx] : null;
                })();
                if (!cellA) {
                    issues.push('UI问题：' + nameA + '在队伍中存活(pos=' + unitA.pos + ')，但九宫格中找不到对应格子');
                } else {
                    var uiPosA = parseInt(cellA.dataset.pos);
                    if (enginePosA !== undefined && uiPosA !== enginePosA && unitB && unitB.alive && uiPosA === enginePosB) {
                        issues.push('交叉检验：' + nameA + '的格子(' + uiPosA + '号位)被' + nameB + '占据，换位后UI渲染可能混淆');
                    }
                }
            }
            if (unitB && unitB.alive) {
                var cellB = (function() {
                    if (!unitB || unitB.pos == null) return null;
                    var grid = document.getElementById('allyGrid') || document.getElementById('enemyGrid');
                    if (!grid) return null;
                    var order = unitB.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
                    var idx = order.indexOf(unitB.pos);
                    return idx >= 0 ? grid.children[idx] : null;
                })();
                if (!cellB) {
                    issues.push('UI问题：' + nameB + '在队伍中存活(pos=' + unitB.pos + ')，但九宫格中找不到对应格子');
                }
            }
        }
        if (issues.length > 0) {
            return { fail: true, msg: issues.slice(0, 3).join(' | ') };
        }
        return { fail: false };
    }
};