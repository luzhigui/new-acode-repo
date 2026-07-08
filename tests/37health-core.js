// tests/37health-core.js - 光明顶5v5 全面体检（实战验证）
// V5.0.3 | ~20000 bytes | 2026-07-08 修正Carry/拒马/闪避误判，保留换位问题检测
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

// ==================== 实战规则定义 ====================

function createCombatChecks(win, doc) {
    return [

        // ========== 1. 白骨爪伤害公式检查 ==========
        {
            group: '👹 精英技能',
            name: '白骨爪伤害公式与斩杀',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var clawEvents = log.filter(function(e) {
                    return e.type === 'info' && e.isClawHit;
                });
                if (clawEvents.length === 0) return 'skip';
                var zhangAlive = (beforeA || []).some(function(u) { return u.isZhang && u.alive; });
                var baseHit = zhangAlive ? 5 : 3;
                var executeThreshold = 0.15;

                for (var i = 0; i < clawEvents.length; i++) {
                    var ev = clawEvents[i];
                    var targetUid = ev.clawTargetUid;
                    var targetAfter = findUnitByUid((afterA || []).concat(afterE || []), targetUid);
                    if (!targetAfter) continue;
                    var maxHp = targetAfter.maxHp;
                    var hpAfter = ev.clawTargetHpAfter !== undefined ? ev.clawTargetHpAfter : targetAfter.hp;
                    var text = ev.text || '';
                    var dmgMatch = text.match(/造成\s*(\d+)\s*点伤害/);
                    var actualDmg = dmgMatch ? parseInt(dmgMatch[1]) : 0;
                    if (actualDmg < baseHit) {
                        return { fail: true, msg: '白骨爪伤害偏低 | 根因: modules/23elite-skills.js → checkNineYinClaw函数 | 排查: 确认baseHit和ratio是否按有无忌正确取值，当前有无忌=' + zhangAlive + '，基础值应为' + baseHit + '，实际只有' + actualDmg };
                    }
                    var hpPct = hpAfter / maxHp;
                    if (hpPct <= executeThreshold && hpAfter > 0) {
                        if (!ev.isExecute) {
                            return { fail: true, msg: '白骨爪未触发斩杀 | 根因: modules/23elite-skills.js → checkNineYinClaw函数 | 排查: 目标血量' + Math.floor(hpPct*100) + '%≤15%，isExecute应为true，检查executeThreshold判断或斩杀逻辑是否被跳过' };
                        }
                    }
                }
                return { fail: false };
            }
        },

        // ========== 2. 倍速取消高亮检查 ==========
        {
            group: '🎮 按钮状态',
            name: '倍速锁定状态检查',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var speed = ctx.speed;
                if (speed === 500) return { fail: false };
                if (ctx.manualSpeedLock && speed !== 500 && speed !== 143 && speed !== 250 && speed !== 1800) {
                    return { fail: true, msg: '倍速值异常 | 根因: ui/44ui-controls.js → setSpeed或attachSpeedButton函数 | 排查: 当前速度' + speed + '不在已知倍速列表(500/143/250/1800)中，锁定状态=' + ctx.manualSpeedLock + '，检查赋值逻辑' };
                }
                return { fail: false };
            }
        },

        // ========== 3. Carry血量检查（修正版：不强制等比，只检查方向合法） ==========
        {
            group: '✨ Buff',
            name: 'Carry血量方向检查',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var carryUnit = (beforeA || []).find(function(u) { return u.pos === 5 && u.alive && !u.isHorse; });
                if (!carryUnit) return 'skip';
                var carryAfter = (afterA || []).find(function(u) { return u.uid === carryUnit.uid; });
                if (!carryAfter) return 'skip';
                // 只检查方向：maxHp 增加时 hp 不应减少，maxHp 减少时 hp 不应增加
                if (carryAfter.maxHp > carryUnit.maxHp) {
                    if (carryAfter.hp < carryUnit.hp - 2) {
                        return { fail: true, msg: 'Carry血量方向异常 | 根因: core/06battle-engine-core.js → carry加成逻辑 | 排查: maxHp从' + Math.floor(carryUnit.maxHp) + '增加到' + Math.floor(carryAfter.maxHp) + '，但hp从' + Math.floor(carryUnit.hp) + '降到了' + Math.floor(carryAfter.hp) + '，方向反了' };
                    }
                } else if (carryAfter.maxHp < carryUnit.maxHp) {
                    if (carryAfter.hp > carryUnit.hp + 2) {
                        return { fail: true, msg: 'Carry血量方向异常 | 根因: core/06battle-engine-core.js → carry加成逻辑 | 排查: maxHp从' + Math.floor(carryUnit.maxHp) + '减少到' + Math.floor(carryAfter.maxHp) + '，但hp从' + Math.floor(carryUnit.hp) + '升到了' + Math.floor(carryAfter.hp) + '，方向反了' };
                    }
                }
                // 合法性检查：不超上限，不为负
                if (carryAfter.hp > carryAfter.maxHp || carryAfter.hp < 0) {
                    return { fail: true, msg: 'Carry血量非法 | 根因: core/06battle-engine-core.js → carry加成逻辑 | 排查: hp=' + Math.floor(carryAfter.hp) + ' maxHp=' + Math.floor(carryAfter.maxHp) };
                }
                return { fail: false };
            }
        },

        // ========== 4. 拒马生成与销毁检查（修正版：允许战斗死亡） ==========
        {
            group: '🐴 拒马',
            name: '拒马生成与销毁检查',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var hasHorseBuff = (ctx.activeBuffs || []).some(function(b) { return b.key === 'horseFormation'; });
                if (!hasHorseBuff) return 'skip';

                var summonEvs = log.filter(function(e) { return e.type === 'buff-summon' && e.horseUid; });
                var destroyEvs = log.filter(function(e) { return e.type === 'buff-destroy' && e.horseUid; });

                if (summonEvs.length === 0) {
                    return { fail: true, msg: '拒马未生成 | 根因: core/05battle-horse.js → spawnHorse函数或core/06battle-engine-core.js → createRoundStepper里spawnHorse调用处 | 排查: 有horseFormation Buff但日志无召唤事件。检查spawnHorse是否被调用、available空位是否=0、或hasBuff检查是否失败' };
                }

                for (var i = 0; i < summonEvs.length; i++) {
                    var horseUid = summonEvs[i].horseUid;
                    var wasDestroyed = destroyEvs.some(function(e) { return e.horseUid === horseUid; });
                    var horseInFinal = findUnitByUid((afterA || []), horseUid);
                    
                    if (!horseInFinal) {
                        // 马不在最终队伍：要么被销毁了，要么在战斗中死了
                        if (wasDestroyed) {
                            // 被销毁了，这是正常的，继续下一匹
                            continue;
                        }
                        // 没有被销毁，检查是否在战斗中死亡
                        // 通过日志中是否有该马参与的 isDead 攻击事件来判断
                        var diedInCombat = false;
                        for (var j = 0; j < log.length; j++) {
                            var entry = log[j];
                            if (entry.type === 'attack-group' && entry.isDead) {
                                if (entry.uidD === horseUid) {
                                    diedInCombat = true;
                                    break;
                                }
                            }
                        }
                        if (!diedInCombat) {
                            return { fail: true, msg: '拒马异常丢失 | 根因: core/05battle-horse.js 或 core/06battle-engine-core.js | 排查: 拒马uid=' + horseUid + '未被销毁也未在战斗中阵亡，但不在最终队伍中，可能被错误移除' };
                        }
                        // 如果死于战斗，则正常，不报错
                    } else {
                        // 马在最终队伍，但可能已经死了却没有被销毁
                        if (!horseInFinal.alive && !wasDestroyed) {
                            // 马死了但没有销毁记录，检查是否死于战斗
                            var diedInCombat2 = false;
                            for (var k = 0; k < log.length; k++) {
                                var entry2 = log[k];
                                if (entry2.type === 'attack-group' && entry2.isDead) {
                                    if (entry2.uidD === horseUid) {
                                        diedInCombat2 = true;
                                        break;
                                    }
                                }
                            }
                            if (!diedInCombat2) {
                                return { fail: true, msg: '拒马死亡原因不明 | 根因: 拒马uid=' + horseUid + '已阵亡但未被销毁也未找到致死攻击，检查死亡逻辑' };
                            }
                        }
                    }
                }
                return { fail: false };
            }
        },

        // ========== 5. 换位后单位存在性检查（保留：检测主代码 bug） ==========
        {
            group: '📍 换位',
            name: '换位后双方单位存在',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var swapEvs = log.filter(function(e) {
                    return e.type === 'buff-swap' || e.type === 'buff-push';
                });
                if (swapEvs.length === 0) return 'skip';

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

                    for (var n = 0; n < names.length; n++) {
                        var unit = findUnitByName((afterA || []).concat(afterE || []), names[n]);
                        if (!unit) {
                            return { fail: true, msg: '换位后单位丢失 | 根因: player/10player-core.js → handleBuffSwap/handleBuffPush 或 fx/18fx-position-swap.js | 排查: ' + names[n] + '在换位后从队伍中消失。APPLY_EVENTS reducer 不支持无 eventType 的 pos 更新' };
                        }
                        if (unit.alive) {
                            var cell = getCellElement(unit, doc);
                            if (!cell) {
                                return { fail: true, msg: '换位后格子为空 | 根因: 同上 | 排查: ' + names[n] + '在' + unit.pos + '号位的格子未渲染，位置更新可能被 Store 忽略' };
                            }
                        }
                    }
                }
                return { fail: false };
            }
        },

        // ========== 6. 流云身法闪避率检查 ==========
        {
            group: '✨ Buff',
            name: '流云身法闪避率',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var hasCloudBody = (ctx.activeBuffs || []).some(function(b) { return b.key === 'cloudBody'; });
                if (!hasCloudBody) return 'skip';
                var dodgeCount = log.filter(function(e) {
                    return e.type === 'attack-group' && e.isDodge;
                }).length;
                var attackCount = log.filter(function(e) {
                    return e.type === 'attack-group' && !e.isMiss && !e.isBlock;
                }).length;
                if (attackCount < 20) return 'skip';
                if (dodgeCount === 0) {
                    return { fail: true, msg: '流云身法未生效 | 根因: core/04buff-system.js → computeBuffStats函数或core/06battle-engine-core.js → resolveDodge函数 | 排查: 有cloudBody Buff但' + attackCount + '次攻击零闪避。检查dodgeBonus=0.25是否正确传入resolveDodge' };
                }
                return { fail: false };
            }
        },

        // ========== 7. 闪避反击方向检查（修正版：移除闪避者阵亡检查） ==========
        {
            group: '🦅 闪避反击',
            name: '闪避反击方向正确',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var dodgeEvents = log.filter(function(e) {
                    return e.type === 'attack-group' && e.isDodge;
                });
                if (dodgeEvents.length === 0) return 'skip';
                for (var i = 0; i < dodgeEvents.length; i++) {
                    var ev = dodgeEvents[i];
                    var dodgerUid = ev.uidA;
                    var attackerUid = ev.uidD;
                    if (!dodgerUid || !attackerUid) continue;
                    var dodger = findUnitByUid((beforeA || []).concat(beforeE || []), dodgerUid);
                    var attacker = findUnitByUid((beforeA || []).concat(beforeE || []), attackerUid);
                    var attackerAfter = findUnitByUid((afterA || []).concat(afterE || []), attackerUid);
                    if (!dodger || !attacker || !attackerAfter) continue;
                    var attackerDmg = attacker.hp - attackerAfter.hp;
                    // 只检查攻击者是否受伤（反击扣血），不再检查闪避者是否阵亡
                    if (attackerDmg <= 0) {
                        return { fail: true, msg: '闪避反击未扣血 | 根因: core/06battle-engine-core.js → resolveDodge函数 | 排查: ' + dodger.name + '闪避了' + attacker.name + '的攻击，但攻击者血量未降。检查reboundDmg计算和unit.hp赋值，或uidA/uidD身份是否对调' };
                    }
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
