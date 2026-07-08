// tests/37health-core.js - 光明顶5v5 全面体检（实战验证）
// V5.0.3 | ~22000 bytes | 2026-07-08 日志自洽+DOM检测双轨，报错分日志/UI两大类
export const VER = 'tests/37health-core.js V5.0.3';

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
                            // 找前一条日志在DOM中的对应div
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
                                var prevText = (prevDiv.textContent || '').substring(0, 50);
                                var buffName = '';
                                if (prev.buffType === 'leech') buffName = '嗜血狂刀';
                                else if (prev.buffType === 'hotBlood') buffName = '热血奋战';
                                else if (prev.buffType === 'fortify_rebound') buffName = '严阵以待反弹';
                                else if (prev.buffType === 'elite_xingfen') buffName = '性奋';
                                else if (prev.type === 'buff-summary') buffName = 'Buff说明';
                                else if (prev.type === 'buff-swap') buffName = '惑人心智换位';
                                else if (prev.type === 'buff-push') buffName = '乘风突袭击退';
                                else if (prev.type === 'buff-bonus') buffName = '流星赶月伤害加深';
                                else if (prev.type === 'buff-splash') buffName = '溅射';
                                else if (prev.type === 'buff-destroy') buffName = '拒马销毁';
                                else if (prev.type === 'buff-summon') buffName = '拒马召唤';
                                else if (prev.type === 'info') buffName = '系统提示';
                                else buffName = prev.type;
                                issues.push('日志问题：' + buffName + '（"' + prevText + '"）后面缺少分隔符，直接接了攻击动作');
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
                    var hpBefore = maxHp;
                    var hpAfter = ev.clawTargetHpAfter !== undefined ? ev.clawTargetHpAfter : targetAfter.hp;
                    var lostHp = maxHp - hpBefore;
                    if (lostHp < 0) lostHp = 0;
                    var expectedDmg = baseHit + Math.floor(lostHp * ratio);
                    var text = ev.text || '';
                    var dmgMatch = text.match(/造成\s*(\d+)\s*点伤害/);
                    var actualDmg = dmgMatch ? parseInt(dmgMatch[1]) : 0;

                    var targetName = text.match(/(\S+)\s*造成/) || text.match(/对\s*(\S+)\s*造成/);
                    var name = targetName ? targetName[1] : '目标';
                    if (!name || name.length > 10) {
                        var uidMatch = findUnitByUid((afterA || []).concat(afterE || []), targetUid);
                        name = uidMatch ? uidMatch.name : '目标';
                    }

                    if (actualDmg < expectedDmg - 3) {
                        issues.push('日志问题：白骨爪对' + name + '造成' + actualDmg + '点伤害，但目标已损失' + lostHp + '血（' + Math.floor(hpBefore) + '/' + Math.floor(maxHp) + '），有无忌=' + zhangAlive + '，理论应为' + baseHit + '+' + Math.floor(lostHp * ratio) + '=' + expectedDmg + '，实际偏低');
                    } else if (actualDmg > expectedDmg + 5) {
                        issues.push('日志问题：白骨爪对' + name + '造成' + actualDmg + '点伤害，但目标已损失' + lostHp + '血（' + Math.floor(hpBefore) + '/' + Math.floor(maxHp) + '），有无忌=' + zhangAlive + '，理论应为' + baseHit + '+' + Math.floor(lostHp * ratio) + '=' + expectedDmg + '，实际偏高');
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
                var btn05 = doc.getElementById('btnSpeed05');
                var btn2x = doc.getElementById('btnSpeed2x');
                var btn05x = doc.getElementById('btnSpeed05x');

                var speedToBtn = { 500: btn2, 143: btn7x, 250: btn4x };
                var expectedBtn = speedToBtn[speed];
                if (expectedBtn && !expectedBtn.classList.contains('active') && !expectedBtn.classList.contains('semi-active')) {
                    issues.push('UI问题：当前速度=' + speed + '，但对应按钮' + expectedBtn.id + '没有高亮');
                }
                if (ctx.manualSpeedLock && speed !== 500 && speed !== 143 && speed !== 250 && speed !== 1800) {
                    issues.push('UI问题：当前速度' + speed + '不在已知倍速列表(500/143/250/1800)中');
                }
                if (issues.length > 0) {
                    return { fail: true, msg: issues.join(' | ') };
                }
                return { fail: false };
            }
        },

        // ========== 4. Carry血量方向检查 ==========
        {
            group: 'Buff效果',
            name: 'Carry血量方向检查',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var carryUnit = (beforeA || []).find(function(u) { return u.pos === 5 && u.alive && !u.isHorse; });
                if (!carryUnit) return 'skip';
                var carryAfter = (afterA || []).find(function(u) { return u.uid === carryUnit.uid; });
                if (!carryAfter) return 'skip';
                var issues = [];

                // 日志检查：找hp-change事件，看方向
                var hpEvents = log.filter(function(e) {
                    return e.type === 'attack-group' || e.type === 'info' || e.type === 'buff-leech' || e.type === 'buff-summary';
                });

                // DOM检查：对比血条和日志
                if (carryAfter.alive) {
                    var barPct = getHpBarPct(carryAfter, doc);
                    if (barPct !== null) {
                        var logPct = Math.floor((carryAfter.hp / carryAfter.maxHp) * 100);
                        if (Math.abs(barPct - logPct) > 3) {
                            issues.push('UI问题：' + carryAfter.name + '血条显示' + Math.floor(barPct) + '%，但日志记录hp/maxHp=' + Math.floor(carryAfter.hp) + '/' + Math.floor(carryAfter.maxHp) + '=' + logPct + '%，差距' + Math.abs(Math.floor(barPct) - logPct) + '%');
                        }
                    }
                }

                // 方向检查
                if (carryAfter.maxHp > carryUnit.maxHp) {
                    if (carryAfter.hp < carryUnit.hp - 2) {
                        issues.push('日志问题：' + carryAfter.name + '的maxHp从' + Math.floor(carryUnit.maxHp) + '增加到' + Math.floor(carryAfter.maxHp) + '，但hp从' + Math.floor(carryUnit.hp) + '降到' + Math.floor(carryAfter.hp) + '，方向反了（可能战斗掉血掩盖了加成效果，检查hp-change事件的顺序）');
                    }
                } else if (carryAfter.maxHp < carryUnit.maxHp) {
                    if (carryAfter.hp > carryUnit.hp + 2) {
                        issues.push('日志问题：' + carryAfter.name + '的maxHp从' + Math.floor(carryUnit.maxHp) + '减少到' + Math.floor(carryAfter.maxHp) + '，但hp从' + Math.floor(carryUnit.hp) + '升到' + Math.floor(carryAfter.hp) + '，方向反了');
                    }
                }
                if (carryAfter.hp > carryAfter.maxHp) {
                    issues.push('日志问题：' + carryAfter.name + '的hp=' + Math.floor(carryAfter.hp) + '超过maxHp=' + Math.floor(carryAfter.maxHp) + '，血量溢出');
                }
                if (carryAfter.hp < 0) {
                    issues.push('日志问题：' + carryAfter.name + '的hp=' + Math.floor(carryAfter.hp) + '为负数');
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

                    // 日志检查：追踪拒马uid在后续日志中的出现
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

                    // UI检查：DOM中对应位置是否有拒马格子
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

        // ========== 6. 换位后单位存在性检查 ==========
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
                    var text = ev.text || '';
                    var names = [];
                    var matches = text.match(/号位(.+?)\(/g);
                    if (matches) {
                        for (var m = 0; m < matches.length; m++) {
                            var name = matches[m].replace(/号位/, '').replace(/\($/, '');
                            if (name && names.indexOf(name) === -1) names.push(name);
                        }
                    }
                    if (names.length < 2) continue;

                    // 日志检查：换位后单位是否还在队伍中
                    for (var n = 0; n < names.length; n++) {
                        var unitInTeam = findUnitByName((afterA || []).concat(afterE || []), names[n]);
                        if (!unitInTeam) {
                            issues.push('日志问题：' + names[n] + '在换位日志中出现，但最终队伍中找不到此单位，换位后单位丢失');
                            continue;
                        }
                        // UI检查：DOM中是否有此单位的格子
                        if (unitInTeam.alive) {
                            var cell = getCellElement(unitInTeam, doc);
                            if (!cell) {
                                issues.push('UI问题：' + names[n] + '在队伍中存活(pos=' + unitInTeam.pos + ')，但九宫格中找不到对应格子');
                            } else {
                                var cellPos = parseInt(cell.dataset.pos);
                                if (cellPos !== unitInTeam.pos) {
                                    issues.push('UI问题：' + names[n] + '在队伍中pos=' + unitInTeam.pos + '，但九宫格格子data-pos=' + cellPos + '，位置不同步');
                                }
                            }
                        }
                    }

                    // 日志检查：追踪后续攻击记录验证换位是否真的执行了
                    var swapIdx = log.indexOf(ev);
                    if (swapIdx >= 0) {
                        for (var s = swapIdx + 1; s < log.length; s++) {
                            var laterEntry = log[s];
                            if (laterEntry.type === 'attack-group' && laterEntry.uidA) {
                                var attacker = findUnitByUid((afterA || []).concat(afterE || []), laterEntry.uidA);
                                if (attacker && names.indexOf(attacker.name) !== -1) {
                                    var attackPos = attacker.pos;
                                    var attackText = laterEntry.entries ? laterEntry.entries[0].text || '' : '';
                                    var posMatch = attackText.match(/号位/);
                                    if (posMatch) {
                                        var mentionedPos = parseInt(attackText.match(/(\d)号位/)?.[1]);
                                        if (mentionedPos && mentionedPos !== attackPos) {
                                            issues.push('日志问题：' + attacker.name + '换位后pos=' + attackPos + '，但后续攻击日志中显示在' + mentionedPos + '号位，换位可能未生效');
                                        }
                                    }
                                }
                                break;
                            }
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
                        if (reboundDmg > 0 && barPct !== null) {
                            var expectedDmg = Math.floor(reboundDmg / attacker.maxHp * 100);
                            if (expectedDmg > 0 && barPct > 90) {
                                issues.push('UI问题：' + dodger.name + '闪避后对' + attacker.name + '造成' + reboundDmg + '反击伤害，但攻击者血条仍为' + Math.floor(barPct) + '%，可能未扣血');
                            }
                        }
                    }

                    // 日志检查：反击伤害值合理性
                    if (reboundDmg === 0 && attacker.alive) {
                        var entryText2 = '';
                        if (ev.entries) {
                            for (var e2 = 0; e2 < ev.entries.length; e2++) {
                                entryText2 += (ev.entries[e2].text || '') + ' ';
                            }
                        }
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

    } catch (e) {
        statusEl.textContent = e.message || '未知错误';
        reportEl.innerHTML = '<div style="color:#f44336;">' + (e.message || '未知错误') + '</div>';
    } finally {
        runBtn.disabled = false;
        runBtn.textContent = '开始全面体检';
        setTimeout(function() { progCont.style.display = 'none'; }, 5000);
    }
}
