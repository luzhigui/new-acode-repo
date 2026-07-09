// tests/37health-core.js - 光明顶5v5 全面体检（实战验证）
// V5.0.4 | ~39000 bytes | 2026-07-09 日志增强层 + 三向检验，默认第4关
export const VER = 'tests/37health-core.js V5.0.4';

import { runBattle } from '../core/07battle-engine-5v5-test.js';
import { generateSnapshot } from '../tools/27auto-battle-utils.js';

// ==================== 辅助函数 ====================

function getCellElement(unit, doc) {
    if (!unit || unit.pos == null) return null;
    var gridId = unit.camp === 'ally' ? 'allyGrid' : 'enemyGrid';
    var grid = doc.getElementById(gridId);
    if (!grid) return null;
    var order = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    var idx = order.indexOf(unit.pos);
    return idx >= 0 ? grid.children[idx] : null;
}

function findUnitByUid(units, uid) {
    if (!units || !uid) return null;
    return units.find(function(u) { return u.uid === uid; });
}

function findUnitByName(units, name) {
    if (!units || !name) return null;
    return units.find(function(u) { return u.name === name; });
}

function getHpBarPct(unit, doc) {
    var cell = getCellElement(unit, doc);
    if (!cell) return null;
    var bar = cell.querySelector('.hp-bar-inner');
    if (!bar) return null;
    return parseFloat(bar.style.height);
}

// ==================== 日志增强层 ====================

function enhanceBattleLog(battleLog, ally, enemy) {
    var allUnits = (ally || []).concat(enemy || []);
    // 开局先记录所有单位的初始位置，供后续查不到时回退
    var initPosMap = {};
    for (var u = 0; u < allUnits.length; u++) {
        var unit = allUnits[u];
        if (unit && unit.uid) {
            initPosMap[unit.uid] = { name: unit.name, pos: unit.pos };
        }
    }
    
    for (var i = 0; i < battleLog.length; i++) {
        var entry = battleLog[i];
        
        // 增强攻击日志
        if (entry.type === 'attack-group') {
            if (entry.uidA) {
                var atkUnit = findUnitByUid(allUnits, entry.uidA);
                if (atkUnit) {
                    entry._atkPos = atkUnit.pos;
                    entry._atkName = atkUnit.name;
                } else if (initPosMap[entry.uidA]) {
                    entry._atkPos = initPosMap[entry.uidA].pos;
                    entry._atkName = initPosMap[entry.uidA].name;
                }
            }
            if (entry.uidD) {
                var defUnit = findUnitByUid(allUnits, entry.uidD);
                if (defUnit) {
                    entry._defPos = defUnit.pos;
                    entry._defName = defUnit.name;
                } else if (initPosMap[entry.uidD]) {
                    entry._defPos = initPosMap[entry.uidD].pos;
                    entry._defName = initPosMap[entry.uidD].name;
                }
            }
        }
        
        // 增强换位日志
        if (entry.type === 'buff-swap' || entry.type === 'buff-push') {
            var text = entry.text || '';
            var matches = text.match(/号位(.+?)\(/g);
            if (matches && matches.length >= 2) {
                var nameA = matches[0].replace(/号位/, '').replace(/\($/, '');
                var nameB = matches[1].replace(/号位/, '').replace(/\($/, '');
                var unitA = findUnitByName(allUnits, nameA);
                var unitB = findUnitByName(allUnits, nameB);
                
                entry._swapNameA = nameA;
                entry._swapNameB = nameB;
                
                if (unitA) {
                    entry._swapUidA = unitA.uid;
                    entry._swapEnginePosA = unitA.pos;
                }
                if (unitB) {
                    entry._swapUidB = unitB.uid;
                    entry._swapEnginePosB = unitB.pos;
                }
            }
        }
    }
    return battleLog;
}

// ==================== 实战规则定义 ====================

function createCombatChecks(win, doc) {
    return [

        // ========== 1. 分隔符缺失检查 ==========
        {
            group: '日志格式',
            name: '分隔符缺失检查',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var issues = [];
                var logDiv = doc.getElementById('log');
                if (!logDiv) return 'skip';

                var allDivs = logDiv.querySelectorAll('div');
                var divIndex = 0;

                for (var i = 1; i < log.length; i++) {
                    var prev = log[i-1];
                    var curr = log[i];

                    if (curr.type === 'attack-group' && prev.type !== 'attack-group' && prev.type !== 'round-start') {
                        var needSepTypes = ['buff-leech','buff-summary','info','buff-rebound-fortify','buff-swap','buff-push','buff-bonus','buff-splash','buff-destroy','buff-summon'];
                        if (needSepTypes.indexOf(prev.type) !== -1) {
                            // 排除战斗标题行（buff-summary类型但内容为战斗标题的）
                            if (prev.type === 'buff-summary' && prev.text) {
                                var pt = prev.text;
                                if (pt.indexOf('光明顶') !== -1 || pt.indexOf('对决开始') !== -1 || pt.indexOf('5v5') !== -1) continue;
                            }
                            
                            var prevDiv = null;
                            for (var d = divIndex; d < allDivs.length; d++) {
                                var html = allDivs[d].innerHTML || '';
                                if (html.indexOf('separator') === -1 && html.trim() !== '' && html !== '<br>') {
                                    prevDiv = allDivs[d];
                                    divIndex = d + 1;
                                    break;
                                }
                            }
                            var hasSep = false;
                            if (prevDiv && prevDiv.nextElementSibling) {
                                var nextHtml = prevDiv.nextElementSibling.innerHTML || '';
                                hasSep = nextHtml.indexOf('separator') !== -1;
                            }
                            if (!hasSep && prevDiv) {
                                var displayText = (prevDiv.textContent || '').substring(0, 50);
                                var buffName = '';
                                if (prev.buffType === 'leech') buffName = '嗜血狂刀';
                                else if (prev.buffType === 'hotBlood') buffName = '热血奋战';
                                else if (prev.buffType === 'fortify_rebound') buffName = '严阵以待反弹';
                                else if (prev.buffType === 'elite_xingfen') buffName = '性奋';
                                else if (prev.type === 'buff-swap') buffName = '惑人心智换位';
                                else if (prev.type === 'buff-push') buffName = '乘风突袭击退';
                                else if (prev.type === 'buff-bonus') buffName = '流星赶月伤害加深';
                                else if (prev.type === 'buff-splash') buffName = '溅射';
                                else if (prev.type === 'buff-destroy') buffName = '拒马销毁';
                                else if (prev.type === 'buff-summon') buffName = '拒马召唤';
                                else if (prev.type === 'info') buffName = '系统提示';
                                else if (prev.type === 'buff-summary') buffName = 'Buff说明';
                                else buffName = prev.type;
                                issues.push('日志问题：' + buffName + '（"' + displayText + '"）后面缺少分隔符，直接接了攻击动作');
                            }
                        }
                    }
                }
                if (issues.length > 0) {
                    return { fail: true, msg: issues.slice(0, 3).join(' | ') + (issues.length > 3 ? ' 等' + issues.length + '处' : '') };
                }
                return { fail: false };
            }
        },

        // ========== 2. 白骨爪伤害公式检查 ==========
        {
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

                for (var i = 0; i < clawEvents.length; i++) {
                    var ev = clawEvents[i];
                    var targetUid = ev.clawTargetUid;
                    var targetAfter = findUnitByUid((afterA || []).concat(afterE || []), targetUid);
                    if (!targetAfter) continue;
                    var maxHp = targetAfter.maxHp;
                    
                    // 从日志中追踪白骨爪前的实际血量
                    var hpBeforeClaw = ev.clawTargetHpBefore;
                    if (hpBeforeClaw === undefined) {
                        // 找白骨爪事件之前最近一次同目标的攻击记录
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
                    var lostHp = maxHp - hpBeforeClaw;
                    if (lostHp < 0) lostHp = 0;
                    var expectedDmg = baseHit + Math.floor(lostHp * ratio);
                    var text = ev.text || '';
                    var dmgMatch = text.match(/造成\s*(\d+)\s*点伤害/);
                    var actualDmg = dmgMatch ? parseInt(dmgMatch[1]) : 0;

                    var name = targetAfter.name || '目标';

                    if (actualDmg < expectedDmg - 3) {
                        issues.push('日志问题：白骨爪对' + name + '造成' + actualDmg + '点伤害，但目标已损失' + lostHp + '血（' + Math.floor(hpBeforeClaw) + '/' + Math.floor(maxHp) + '），有无忌=' + zhangAlive + '，理论应为' + baseHit + '+' + Math.floor(lostHp * ratio) + '=' + expectedDmg + '，实际偏低');
                    } else if (actualDmg > expectedDmg + 5) {
                        issues.push('日志问题：白骨爪对' + name + '造成' + actualDmg + '点伤害，但目标已损失' + lostHp + '血（' + Math.floor(hpBeforeClaw) + '/' + Math.floor(maxHp) + '），有无忌=' + zhangAlive + '，理论应为' + baseHit + '+' + Math.floor(lostHp * ratio) + '=' + expectedDmg + '，实际偏高');
                    }

                    var hpPct = hpAfter / maxHp;
                    if (hpPct <= executeThreshold && hpAfter > 0) {
                        if (!ev.isExecute) {
                            issues.push('日志问题：白骨爪后' + name + '血量' + Math.floor(hpPct*100) + '%≤' + Math.floor(executeThreshold*100) + '%斩杀线，但日志中没有"斩杀"标记');
                        }
                    }
                    if (ev.isExecute && hpPct > executeThreshold) {
                        issues.push('日志问题：白骨爪显示"斩杀"但' + name + '血量' + Math.floor(hpPct*100) + '%>' + Math.floor(executeThreshold*100) + '%斩杀线，不该触发斩杀');
                    }
                }
                if (issues.length > 0) {
                    return { fail: true, msg: issues.slice(0, 3).join(' | ') };
                }
                return { fail: false };
            }
        },

        // ========== 3. 倍速取消高亮检查 ==========
        {
            group: '按钮状态',
            name: '倍速锁定状态检查',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var speed = ctx.speed;
                var issues = [];
                var btn2 = doc.getElementById('btnSpeed2');
                var btn7x = doc.getElementById('btnSpeed7x');
                var btn4x = doc.getElementById('btnSpeed4x');

                var speedToBtn = { 500: btn2, 143: btn7x, 250: btn4x };
                var expectedBtn = speedToBtn[speed];
                if (expectedBtn && !expectedBtn.classList.contains('active') && !expectedBtn.classList.contains('semi-active')) {
                    issues.push('UI问题：当前速度=' + speed + '，但对应按钮没有高亮');
                }
                if (ctx.manualSpeedLock && speed !== 500 && speed !== 143 && speed !== 250 && speed !== 1800) {
                    issues.push('UI问题：当前速度' + speed + '不在已知倍速列表中');
                }
                if (issues.length > 0) {
                    return { fail: true, msg: issues.join(' | ') };
                }
                return { fail: false };
            }
        },

        // ========== 4. Carry血量方向检查（改用hp-change事件） ==========
        {
            group: 'Buff效果',
            name: 'Carry血量方向检查',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var carryUnit = (beforeA || []).find(function(u) { return u.pos === 5 && u.alive && !u.isHorse; });
                if (!carryUnit) return 'skip';
                var issues = [];
                
                // 从日志中找5号位的hp-change事件
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

                // DOM检查：对比血条和日志
                var carryAfter = findUnitByUid((afterA || []), carryUnit.uid);
                if (carryAfter && carryAfter.alive) {
                    var barPct = getHpBarPct(carryAfter, doc);
                    if (barPct !== null) {
                        var logPct = Math.floor((carryAfter.hp / carryAfter.maxHp) * 100);
                        if (Math.abs(barPct - logPct) > 3) {
                            issues.push('UI问题：' + carryAfter.name + '血条显示' + Math.floor(barPct) + '%，但日志记录hp/maxHp=' + Math.floor(carryAfter.hp) + '/' + Math.floor(carryAfter.maxHp) + '=' + logPct + '%，差距' + Math.abs(Math.floor(barPct) - logPct) + '%');
                        }
                    }
                }
                
                if (issues.length > 0) {
                    return { fail: true, msg: issues.join(' | ') };
                }
                return { fail: false };
            }
        },

        // ========== 5. 拒马存在性检查 ==========
        {
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
                        issues.push('日志问题：拒马(uid=' + horseUid + ')在' + horsePos + '号位生成，但后续所有攻击日志中从未出现此uid，拒马可能隐身了');
                    }

                    var allCells = doc.querySelectorAll('#allyGrid .cell, #enemyGrid .cell');
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
                        var horseInTeam = findUnitByUid((afterA || []), horseUid);
                        if (horseInTeam && horseInTeam.alive) {
                            issues.push('UI问题：拒马(uid=' + horseUid + ')在队伍中存活，但九宫格中找不到拒马格子');
                        }
                    }
                    if (wasDestroyed && foundHorse) {
                        issues.push('UI问题：拒马(uid=' + horseUid + ')已被销毁，但九宫格中仍有拒马格子');
                    }
                }
                if (issues.length > 0) {
                    return { fail: true, msg: issues.slice(0, 3).join(' | ') };
                }
                return { fail: false };
            }
        },

        // ========== 6. 换位后单位存在性检查（三向验证版） ==========
        {
            group: '换位',
            name: '换位后双方单位存在',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var swapEvs = log.filter(function(e) {
                    return e.type === 'buff-swap' || e.type === 'buff-push';
                });
                if (swapEvs.length === 0) return 'skip';
                var issues = [];

                for (var i = 0; i < swapEvs.length; i++) {
                    var ev = swapEvs[i];
                    
                    // 使用增强日志中的字段
                    var nameA = ev._swapNameA;
                    var nameB = ev._swapNameB;
                    var uidA = ev._swapUidA;
                    var uidB = ev._swapUidB;
                    var enginePosA = ev._swapEnginePosA;
                    var enginePosB = ev._swapEnginePosB;
                    
                    if (!nameA || !nameB) continue;

                    // 1. 日志自检：单位是否还在队伍中
                    var unitA = findUnitByUid((afterA || []).concat(afterE || []), uidA);
                    var unitB = findUnitByUid((afterA || []).concat(afterE || []), uidB);

                    // 2. 查找后续攻击记录验证换位
                    var foundAfterSwapA = false;
                    var foundAfterSwapB = false;
                    var correctPosA = false;
                    var correctPosB = false;
                    
                    for (var s = log.indexOf(ev) + 1; s < log.length; s++) {
                        var laterEntry = log[s];
                        if (laterEntry.type === 'attack-group') {
                            if (laterEntry._atkUid === uidA || laterEntry._defUid === uidA || laterEntry.uidA === uidA || laterEntry.uidD === uidA) {
                                foundAfterSwapA = true;
                                var atkPosA = laterEntry._atkPos;
                                var defPosA = laterEntry._defPos;
                                if (laterEntry.uidA === uidA && atkPosA !== undefined) correctPosA = atkPosA !== enginePosA ? false : (correctPosA === false ? false : true);
                                if (laterEntry.uidD === uidA && defPosA !== undefined) correctPosA = defPosA !== enginePosA ? false : (correctPosA === false ? false : true);
                            }
                            if (laterEntry._atkUid === uidB || laterEntry._defUid === uidB || laterEntry.uidA === uidB || laterEntry.uidD === uidB) {
                                foundAfterSwapB = true;
                                var atkPosB = laterEntry._atkPos;
                                var defPosB = laterEntry._defPos;
                                if (laterEntry.uidA === uidB && atkPosB !== undefined) correctPosB = atkPosB !== enginePosB ? false : (correctPosB === false ? false : true);
                                if (laterEntry.uidD === uidB && defPosB !== undefined) correctPosB = defPosB !== enginePosB ? false : (correctPosB === false ? false : true);
                            }
                        }
                    }

                    // 分析结果
                    if (foundAfterSwapA && !correctPosA) {
                        var reasonA = (enginePosA === undefined) ? '引擎pos缺失（单位可能已阵亡）' : '引擎pos=' + enginePosA + '，但后续攻击记录中实际位置不符';
                        issues.push('日志问题：' + nameA + '换位后' + reasonA + '，换位可能未生效');
                    }
                    if (foundAfterSwapB && !correctPosB) {
                        var reasonB = (enginePosB === undefined) ? '引擎pos缺失（单位可能已阵亡）' : '引擎pos=' + enginePosB + '，但后续攻击记录中实际位置不符';
                        issues.push('日志问题：' + nameB + '换位后' + reasonB + '，换位可能未生效');
                    }

                    // 3. UI检测
                    if (unitA && unitA.alive) {
                        var cellA = getCellElement(unitA, doc);
                        if (!cellA) {
                            issues.push('UI问题：' + nameA + '在队伍中存活(pos=' + unitA.pos + ')，但九宫格中找不到对应格子');
                        } else {
                            var uiPosA = parseInt(cellA.dataset.pos);
                            // 交叉检验
                            if (enginePosA !== undefined && uiPosA !== enginePosA) {
                                issues.push('交叉检验：' + nameA + '引擎pos=' + enginePosA + '，UI data-pos=' + uiPosA + '，两者不一致');
                            }
                            if (unitB && unitB.alive && enginePosB !== undefined && uiPosA === enginePosB) {
                                issues.push('交叉检验：' + nameA + '的格子(' + uiPosA + '号位)被' + nameB + '占据，换位后UI渲染可能混淆');
                            }
                        }
                    }
                    if (unitB && unitB.alive) {
                        var cellB = getCellElement(unitB, doc);
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
        },

        // ========== 7. 胜利弹幕检查 ==========
        {
            group: '特效',
            name: '胜利弹幕检查',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var allyAlive = (afterA || []).filter(function(u) { return u.alive; });
                var enemyAlive = (afterE || []).filter(function(u) { return u.alive; });
                var winner = null;
                var aliveCount = 0;
                if (allyAlive.length > 0 && enemyAlive.length === 0) { winner = '明教'; aliveCount = allyAlive.length; }
                else if (enemyAlive.length > 0 && allyAlive.length === 0) { winner = '六大派'; aliveCount = enemyAlive.length; }
                else return 'skip';

                var bubbles = doc.querySelectorAll('.danmaku-bubble');
                if (bubbles.length === 0) {
                    return { fail: true, msg: 'UI问题：' + winner + '获胜（' + aliveCount + '人存活），但没有任何胜利弹幕' };
                }
                if (bubbles.length < aliveCount) {
                    return { fail: true, msg: 'UI问题：' + winner + '获胜，' + aliveCount + '人存活但只有' + bubbles.length + '条弹幕，缺少' + (aliveCount - bubbles.length) + '条' };
                }
                return { fail: false };
            }
        },

        // ========== 8. 流云身法闪避率检查 ==========
        {
            group: 'Buff效果',
            name: '流云身法闪避率',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var hasCloudBody = (ctx.activeBuffs || []).some(function(b) { return b.key === 'cloudBody'; });
                if (!hasCloudBody) return 'skip';
                var dodgeCount = log.filter(function(e) { return e.type === 'attack-group' && e.isDodge; }).length;
                var attackCount = log.filter(function(e) { return e.type === 'attack-group' && !e.isMiss && !e.isBlock; }).length;
                if (attackCount < 10) return 'skip';

                var dodgeRate = dodgeCount / attackCount;
                if (dodgeCount === 0) {
                    return { fail: true, msg: '日志问题：有流云身法Buff，但' + attackCount + '次攻击中0次闪避（期望至少3~4次），流云身法可能未生效' };
                }
                if (dodgeRate > 0.5) {
                    return { fail: true, msg: '日志问题：有流云身法Buff，闪避率' + Math.floor(dodgeRate*100) + '%（' + dodgeCount + '/' + attackCount + '），异常偏高，可能有双重闪避叠加' };
                }
                return { fail: false };
            }
        },

        // ========== 9. 闪避反击方向检查 ==========
        {
            group: '闪避反击',
            name: '闪避反击方向检查',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var dodgeEvents = log.filter(function(e) { return e.type === 'attack-group' && e.isDodge; });
                if (dodgeEvents.length === 0) return 'skip';
                var issues = [];

                for (var i = 0; i < dodgeEvents.length; i++) {
                    var ev = dodgeEvents[i];
                    var dodgerUid = ev.uidA;
                    var attackerUid = ev.uidD;
                    if (!dodgerUid || !attackerUid) continue;
                    var dodger = findUnitByUid((afterA || []).concat(afterE || []), dodgerUid);
                    var attacker = findUnitByUid((afterA || []).concat(afterE || []), attackerUid);
                    if (!dodger || !attacker) continue;

                    // 日志检查：提取反击伤害值
                    var reboundDmg = 0;
                    if (ev.entries) {
                        for (var e = 0; e < ev.entries.length; e++) {
                            var entryText = ev.entries[e].text || '';
                            var dmgMatch = entryText.match(/造成\s*(\d+)\s*真实伤害/);
                            if (dmgMatch) { reboundDmg = parseInt(dmgMatch[1]); break; }
                        }
                    }

                    // UI检查：攻击者血条应下降
                    if (attacker.alive) {
                        var barPct = getHpBarPct(attacker, doc);
                        if (barPct !== null) {
                            var logPct = Math.floor((attacker.hp / attacker.maxHp) * 100);
                            if (Math.abs(barPct - logPct) > 3) {
                                issues.push('UI问题：' + dodger.name + '闪避后，攻击者' + attacker.name + '血条显示' + Math.floor(barPct) + '%，但日志hp/maxHp=' + Math.floor(attacker.hp) + '/' + Math.floor(attacker.maxHp) + '=' + logPct + '%，不同步');
                            }
                        }
                    }

                    // 日志检查：反击伤害值合理性
                    if (reboundDmg === 0 && attacker.alive) {
                        issues.push('日志问题：' + dodger.name + '闪避了' + attacker.name + '的攻击，但日志中未找到反击伤害数值（理论应为(' + Math.floor(dodger.atk) + '+' + Math.floor(dodger.def) + ')×0.5=' + Math.floor((dodger.atk+dodger.def)*0.5) + '），日志可能遗漏了反击记录');
                    }
                }
                if (issues.length > 0) {
                    return { fail: true, msg: issues.slice(0, 3).join(' | ') };
                }
                return { fail: false };
            }
        }
    ];
}

// ==================== 体检主流程 ====================

export async function runHealthCheck(config) {
    const { iframe, statusEl, reportEl, runBtn, progCont, progFill, progText, stageCbs } = config;

    const selectedStages = Array.from(stageCbs.querySelectorAll('input:checked'))
        .map(function(cb) { return parseInt(cb.value); }).sort(function(a, b) { return a - b; });

    if (!selectedStages.length) {
        statusEl.textContent = '请至少选择一个关卡';
        return;
    }

    reportEl.innerHTML = '';
    statusEl.textContent = '正在启动...';
    runBtn.disabled = true;
    runBtn.textContent = '检测中...';
    progCont.style.display = 'block';
    progFill.style.width = '0%';
    progText.textContent = '初始化...';

    var W = function() { return iframe.contentWindow; };
    var D = function() { return iframe.contentDocument || W().document; };

    var waitCtx = function(timeout) {
        timeout = timeout || 60000;
        return new Promise(function(resolve, reject) {
            var start = Date.now();
            var check = function() {
                try {
                    var ctx = W()._getPlayerContext ? W()._getPlayerContext() : null;
                    if (ctx && ctx.UI && ctx.UI.allyTeam && ctx.UI.allyTeam.length >= 1 && ctx.UI.enemyTeam && ctx.UI.enemyTeam.length >= 1) {
                        resolve(ctx);
                    } else if (Date.now() - start > timeout) {
                        reject(new Error('游戏上下文超时'));
                    } else {
                        setTimeout(check, 800);
                    }
                } catch (e) {
                    if (Date.now() - start > timeout) reject(new Error('游戏模块加载超时'));
                    else setTimeout(check, 800);
                }
            };
            check();
        });
    };

    var gameUrl = new URL('../mode-5v5-test.html', window.location.href).href;
    iframe.src = gameUrl;

    try {
        await new Promise(function(resolve, reject) {
            var timeout = setTimeout(function() { reject(new Error('iframe 加载超时')); }, 60000);
            iframe.addEventListener('load', function() { clearTimeout(timeout); resolve(); }, { once: true });
        });

        var coverBtn = await new Promise(function(resolve, reject) {
            var start = Date.now();
            var check = function() {
                var btn = D().getElementById('coverStartBtn');
                if (btn) resolve(btn);
                else if (Date.now() - start > 30000) reject(new Error('封面按钮加载超时'));
                else setTimeout(check, 500);
            };
            check();
        });
        coverBtn.click();
        await new Promise(function(r) { setTimeout(r, 1500); });

        await waitCtx(60000);

        var checks = createCombatChecks(W(), D());

        var summary = {};
        checks.forEach(function(c) {
            summary[c.name] = { pass: 0, fail: 0, skip: 0, total: 0, group: c.group, reasons: [] };
        });

        var TOTAL_ROUNDS = 5;
        var allBattleLogs = [];

        for (var idx = 0; idx < selectedStages.length; idx++) {
            for (var round = 0; round < TOTAL_ROUNDS; round++) {
                var stage = selectedStages[idx];
                var progress = Math.floor(((idx * TOTAL_ROUNDS + round + 1) / (selectedStages.length * TOTAL_ROUNDS)) * 100);
                progFill.style.width = progress + '%';
                progText.textContent = '第 ' + stage + ' 关 (' + (idx + 1) + '/' + selectedStages.length + ')';
                statusEl.textContent = '第 ' + stage + ' 关 - 第 ' + (round + 1) + '/' + TOTAL_ROUNDS + ' 轮';

                if (round === 0) {
                    W().selectStage(stage);
                    await new Promise(function(r) { setTimeout(r, 1500); });
                    await waitCtx(30000);
                }

                var snap = generateSnapshot(stage);
                var beforeAllies = snap.ally.map(function(u) { return Object.assign({}, u); });
                var beforeEnemies = snap.enemy.map(function(u) { return Object.assign({}, u); });

                var buffSets = [
                    [{ key: 'cloudBody', target: 'ally', remaining: 35 }, { key: 'hotBlood', target: 'ally', remaining: 35 }],
                    [{ key: 'fortify', target: 'ally', remaining: 35 }, { key: 'bloodthirst', target: 'ally', remaining: 35 }],
                    [{ key: 'windAssault', target: 'ally', remaining: 35 }, { key: 'meteorShower', target: 'ally', remaining: 35 }],
                    [{ key: 'mindControl', target: 'ally', remaining: 35 }, { key: 'doubleStrike', target: 'ally', remaining: 35 }],
                    [{ key: 'horseFormation', target: 'ally', remaining: 35 }, { key: 'carry', target: 'ally', remaining: 35 }]
                ];
                var testBuffs = buffSets[round % buffSets.length];
                var battleResult = runBattle(snap, testBuffs);

                var ally = (battleResult.ally || []).map(function(u) {
                    var cu = Object.assign(Object.create(Object.getPrototypeOf(u)), u);
                    if (!cu.alive) { cu._isDead = true; cu._flash = 'dead'; }
                    return cu;
                });
                var enemy = (battleResult.enemy || []).map(function(u) {
                    var cu = Object.assign(Object.create(Object.getPrototypeOf(u)), u);
                    if (!cu.alive) { cu._isDead = true; cu._flash = 'dead'; }
                    return cu;
                });
                var battleLog = battleResult.log || [];

                // 增强日志
                battleLog = enhanceBattleLog(battleLog, ally, enemy);

                // 保存增强后的日志供附件使用
                allBattleLogs.push({
                    stage: stage,
                    round: round + 1,
                    log: battleLog
                });

                var ctxSync = W()._getPlayerContext();
                if (ctxSync) {
                    ctxSync.UI.allyTeam = ally;
                    ctxSync.UI.enemyTeam = enemy;
                    ctxSync.UI.round = battleResult.rounds || 1;
                    if (battleResult.doubleStrikeUids && battleResult.doubleStrikeUids.length > 0) {
                        ctxSync.currentDoubleStrikeUid = battleResult.doubleStrikeUids[battleResult.doubleStrikeUids.length - 1];
                    }
                    ctxSync.activeBuffs = testBuffs;
                    ctxSync.updateUI(ctxSync.UI);
                    await new Promise(function(r) { setTimeout(r, 150); });
                }

                for (var c = 0; c < checks.length; c++) {
                    var check = checks[c];
                    summary[check.name].total++;
                    try {
                        var result = check.test(ctxSync, battleLog, beforeAllies, beforeEnemies, ally, enemy);
                        if (result === 'skip') {
                            summary[check.name].skip++;
                        } else if (result === true || (result && result.fail === false)) {
                            summary[check.name].pass++;
                        } else {
                            summary[check.name].fail++;
                            if (result && result.msg) {
                                if (summary[check.name].reasons.length < 3) {
                                    summary[check.name].reasons.push(result.msg);
                                }
                            }
                        }
                    } catch (e) {
                        summary[check.name].fail++;
                        if (summary[check.name].reasons.length < 3) {
                            summary[check.name].reasons.push('规则执行异常: ' + (e.message || '未知错误'));
                        }
                    }
                }
            }
        }

        var lines = [];
        var totalPass = 0, totalFail = 0, totalSkip = 0;
        var groups = {};
        for (var name in summary) {
            var stat = summary[name];
            if (!groups[stat.group]) groups[stat.group] = [];
            groups[stat.group].push({ name: name, pass: stat.pass, fail: stat.fail, skip: stat.skip, total: stat.total, reasons: stat.reasons || [] });
            totalPass += stat.pass;
            totalFail += stat.fail;
            totalSkip += stat.skip;
        }

        for (var group in groups) {
            lines.push('\n' + group);
            var items = groups[group];
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var checked = item.pass + item.fail;
                if (item.fail > 0) {
                    lines.push('  ❌ ' + item.name + '：' + item.pass + '/' + checked + ' 通过，' + item.fail + ' 失败' + (item.skip > 0 ? '，' + item.skip + ' 跳过' : ''));
                    if (item.reasons && item.reasons.length > 0) {
                        for (var r = 0; r < item.reasons.length; r++) {
                            lines.push('     ⮑ ' + item.reasons[r]);
                        }
                    }
                } else if (item.pass > 0) {
                    lines.push('  ✅ ' + item.name + '：' + item.pass + '/' + checked + ' 通过' + (item.skip > 0 ? '，' + item.skip + ' 跳过' : ''));
                } else {
                    lines.push('  ⏭️ ' + item.name + '：全部跳过（' + item.skip + ' 次）');
                }
            }
        }

        var reportText = lines.join('\n');

        reportEl.innerHTML = lines.map(function(line) {
            if (line.indexOf('  ❌') === 0) return '<div style="color:#f44336;">' + line + '</div>';
            if (line.indexOf('     ⮑') === 0) return '<div style="color:#ff9800;font-size:11px;margin-left:16px;">' + line + '</div>';
            if (line.indexOf('  ✅') === 0) return '<div style="color:#4caf50;">' + line + '</div>';
            if (line.indexOf('  ⏭️') === 0) return '<div style="color:#888;">' + line + '</div>';
            return '<div style="color:#ff9800;font-weight:bold;margin-top:6px;">' + line + '</div>';
        }).join('');

        var copyBtn = document.createElement('button');
        copyBtn.textContent = '复制结果';
        copyBtn.style.cssText = 'margin-top:8px;padding:6px 14px;font-size:12px;';
        copyBtn.onclick = function() {
            navigator.clipboard.writeText(reportText).then(function() {
                copyBtn.textContent = '已复制';
                setTimeout(function() { copyBtn.textContent = '复制结果'; }, 1500);
            });
        };
        reportEl.appendChild(copyBtn);

        statusEl.textContent = totalFail === 0
            ? '全部通过！' + totalPass + ' 项通过，' + totalSkip + ' 项跳过'
            : '通过 ' + totalPass + ' 项，失败 ' + totalFail + ' 项，跳过 ' + totalSkip + ' 项';

        // 存储增强后的日志供外部访问
        reportEl._battleLogs = allBattleLogs;

    } catch (e) {
        statusEl.textContent = e.message || '未知错误';
        reportEl.innerHTML = '<div style="color:#f44336;">' + (e.message || '未知错误') + '</div>';
    } finally {
        runBtn.disabled = false;
        runBtn.textContent = '开始全面体检';
        setTimeout(function() { progCont.style.display = 'none'; }, 5000);
    }
}
