// tests/37health-core.js - 光明顶5v5 全面体检（实战验证）
// V5.0.2 | ~20000 bytes | 2026-07-07 规则全面重写，适配新日志格式
export const VER = 'tests/37health-core.js V5.0.2';

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

function getHpBarPct(unit, doc) {
    var cell = getCellElement(unit, doc);
    if (!cell) return null;
    var bar = cell.querySelector('.hp-bar-inner');
    if (!bar) return null;
    return parseFloat(bar.style.height);
}

function getCellStats(unit, doc) {
    var cell = getCellElement(unit, doc);
    if (!cell) return null;
    var statsEl = cell.querySelector('.cell-stats');
    if (!statsEl) return null;
    var text = statsEl.textContent;
    var am = text.match(/攻(\d+)/), dm = text.match(/防(\d+)/);
    return { atk: am ? parseInt(am[1]) : null, def: dm ? parseInt(dm[1]) : null, text: text };
}

function hasDeadMark(unit, doc) {
    var cell = getCellElement(unit, doc);
    if (!cell) return false;
    if (cell.querySelector('.dead-mark')) return true;
    if (cell.getAttribute('data-flash') === 'dead') return true;
    return false;
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

        // ========== 基础战斗 ==========
        {
            group: '⚔️ 基础',
            name: '普通攻击后受击者血量同步',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'attack-group' && !e.isDodge && !e.isMiss && !e.isBlock;
                });
                if (!ev) return 'skip';
                var targetUid = ev.uidD;
                if (!targetUid) return 'skip';
                var before = findUnitByUid((beforeA || []).concat(beforeE || []), targetUid);
                var after = findUnitByUid((afterA || []).concat(afterE || []), targetUid);
                if (!before || !after) return 'skip';
                if (before.hp <= after.hp) return false;
                if (after.alive) {
                    var pct = getHpBarPct(after, doc);
                    if (pct == null) return 'skip';
                    var expectedPct = Math.floor((after.hp / after.maxHp) * 100);
                    if (Math.abs(pct - expectedPct) > 3) return false;
                } else {
                    if (!hasDeadMark(after, doc)) return false;
                }
                return true;
            }
        },

        {
            group: '⚔️ 基础',
            name: '闪避反击后攻击者血量下降',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'attack-group' && e.isDodge;
                });
                if (!ev) return 'skip';
                // 闪避时 uidD 是原攻击者，被反击扣血
                var attackerUid = ev.uidD;
                if (!attackerUid) return 'skip';
                var before = findUnitByUid((beforeA || []).concat(beforeE || []), attackerUid);
                var after = findUnitByUid((afterA || []).concat(afterE || []), attackerUid);
                if (!before || !after) return 'skip';
                if (before.hp <= after.hp) return false;
                return true;
            }
        },

        {
            group: '⚔️ 基础',
            name: '格挡休息后血量回复',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'attack-group' && e.isBlock;
                });
                if (!ev) return 'skip';
                // 搜索格挡日志中的回复文本，当场验证回血量
                var entry = ev.entries ? ev.entries.find(function(en) {
                    return en.text && en.text.indexOf('休息回复') !== -1;
                }) : null;
                if (!entry) return 'skip';
                var match = entry.text.match(/(\d+)\s*→\s*(\d+)/);
                if (!match) return 'skip';
                var hpAfter = parseInt(match[2]);
                // 验证格挡单位的当前血量 >= 回复后的血量（多回合后可能更高）
                var blocker = findUnitByUid((afterA || []).concat(afterE || []), ev.uidA);
                if (!blocker) return 'skip';
                if (blocker.hp < hpAfter) return false;
                return true;
            }
        },

        {
            group: '⚔️ 基础',
            name: '击杀后死亡单位标记完整',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var killEv = log.find(function(e) {
                    return e.type === 'attack-group' && e.isDead;
                });
                if (!killEv) return 'skip';
                var deadUid = killEv.uidD;
                if (!deadUid) return 'skip';
                var after = findUnitByUid((afterA || []).concat(afterE || []), deadUid);
                if (!after) return 'skip';
                if (after.alive) return false;
                if (!after._isDead) return false;
                if (!hasDeadMark(after, doc)) return false;
                return true;
            }
        },

        {
            group: '⚔️ 基础',
            name: '所有存活单位血条与引擎同步',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var allAfter = (afterA || []).concat(afterE || []);
                var hasAlive = false;
                for (var i = 0; i < allAfter.length; i++) {
                    var u = allAfter[i];
                    if (!u.alive) continue;
                    hasAlive = true;
                    var pct = getHpBarPct(u, doc);
                    if (pct == null) continue;
                    var expectedPct = Math.floor((u.hp / u.maxHp) * 100);
                    if (Math.abs(pct - expectedPct) > 3) return false;
                }
                return hasAlive;
            }
        },

        {
            group: '⚔️ 基础',
            name: '属性值无 NaN/Infinity',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var allAfter = (afterA || []).concat(afterE || []);
                for (var i = 0; i < allAfter.length; i++) {
                    var u = allAfter[i];
                    if (isNaN(u.atk) || isNaN(u.def) || isNaN(u.hp) || isNaN(u.maxHp)) return false;
                    if (!isFinite(u.atk) || !isFinite(u.def) || !isFinite(u.hp) || !isFinite(u.maxHp)) return false;
                }
                return true;
            }
        },

        // ========== 张无忌 ==========
        {
            group: '⚔️ 张无忌',
            name: '九阳神功回血后血量增加',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'info' && e.text && e.text.indexOf('九阳神功回复') !== -1;
                });
                if (!ev) return 'skip';
                var match = ev.text.match(/回复\+(\d+)/);
                if (!match) return 'skip';
                var heal = parseInt(match[1]);
                var zhangBefore = findUnitByName(beforeA || [], '张无忌');
                var zhangAfter = findUnitByName(afterA || [], '张无忌');
                if (!zhangBefore || !zhangAfter) return 'skip';
                if (zhangAfter.hp < zhangBefore.hp + heal - 1) return false;
                return true;
            }
        },

        {
            group: '⚔️ 张无忌',
            name: '乾坤大挪移反弹后攻击者血量下降',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'info' && e.text && e.text.indexOf('乾坤大挪移反弹') !== -1;
                });
                if (!ev) return 'skip';
                var match = ev.text.match(/反弹(\d+)给(.+?)（/);
                if (!match) return 'skip';
                var attackerName = match[2];
                var attackerBefore = findUnitByName((beforeE || []), attackerName);
                var attackerAfter = findUnitByName((afterE || []), attackerName);
                if (!attackerBefore || !attackerAfter) return 'skip';
                if (attackerBefore.hp <= attackerAfter.hp) return false;
                return true;
            }
        },

        {
            group: '⚔️ 张无忌',
            name: '切换近战形态后属性提升',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) { return e.isZhangSwitch; });
                if (!ev) return 'skip';
                var zhangBefore = findUnitByName(beforeA || [], '张无忌');
                var zhangAfter = findUnitByName(afterA || [], '张无忌');
                if (!zhangBefore || !zhangAfter) return 'skip';
                if (zhangAfter.atk < zhangBefore.atk) return false;
                if (zhangAfter.def < zhangBefore.def) return false;
                return true;
            }
        },

        // ========== 韦一笑 ==========
        {
            group: '🦇 韦一笑',
            name: '吸血后 maxHp 增加',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'info' && e.text && e.text.indexOf('韦一笑吸血') !== -1;
                });
                if (!ev) return 'skip';
                var match = ev.text.match(/上限→(\d+)/);
                if (!match) return 'skip';
                var expectedMax = parseInt(match[1]);
                var wei = findUnitByName(afterA || [], '韦一笑');
                if (!wei) return 'skip';
                if (wei.maxHp < expectedMax) return false;
                return true;
            }
        },

        // ========== Buff 系统 ==========
        {
            group: '✨ Buff',
            name: '嗜血狂刀吸血后血量增加',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'buff-leech' && e.buffType === 'leech';
                });
                if (!ev) return 'skip';
                // 直接从日志中解析回血前后的血量
                var match = ev.text.match(/血量\s*(\d+)\s*→\s*(\d+)/);
                if (!match) return 'skip';
                var hpAfter = parseInt(match[2]);
                var uid = ev.healUnitUid;
                if (!uid) return 'skip';
                var unit = findUnitByUid((afterA || []).concat(afterE || []), uid);
                if (!unit) return 'skip';
                if (unit.hp < hpAfter) return false;
                return true;
            }
        },

        {
            group: '✨ Buff',
            name: '热血奋战回血后血量增加',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'buff-leech' && e.buffType === 'hotBlood';
                });
                if (!ev) return 'skip';
                var match = ev.text.match(/血量\s*(\d+)\s*→\s*(\d+)/);
                if (!match) return 'skip';
                var hpAfter = parseInt(match[2]);
                var uid = ev.healUnitUid;
                if (!uid) return 'skip';
                var unit = findUnitByUid((afterA || []).concat(afterE || []), uid);
                if (!unit) return 'skip';
                if (unit.hp < hpAfter) return false;
                return true;
            }
        },

        {
            group: '✨ Buff',
            name: '严阵以待反弹后攻击者血量下降',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'buff-rebound-fortify';
                });
                if (!ev) return 'skip';
                var attackerUid = ev.attackerUid;
                if (!attackerUid) return 'skip';
                var before = findUnitByUid((beforeA || []).concat(beforeE || []), attackerUid);
                var after = findUnitByUid((afterA || []).concat(afterE || []), attackerUid);
                if (!before || !after) return 'skip';
                if (before.hp <= after.hp) return false;
                return true;
            }
        },

        {
            group: '✨ Buff',
            name: '流星赶月溅射后受击者血量下降',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'buff-splash' && e.buffType === 'meteor_splash' && e.splashUids;
                });
                if (!ev) return 'skip';
                for (var i = 0; i < ev.splashUids.length; i++) {
                    var uid = ev.splashUids[i];
                    var before = findUnitByUid((beforeA || []).concat(beforeE || []), uid);
                    var after = findUnitByUid((afterA || []).concat(afterE || []), uid);
                    if (!before || !after) continue;
                    if (after.hp >= before.hp) return false;
                }
                return true;
            }
        },

        {
            group: '✨ Buff',
            name: '乘风突袭波及后受击者血量下降',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'buff-splash' && e.buffType === 'wind_assault' && e.splashUids;
                });
                if (!ev) return 'skip';
                for (var i = 0; i < ev.splashUids.length; i++) {
                    var uid = ev.splashUids[i];
                    var before = findUnitByUid((beforeA || []).concat(beforeE || []), uid);
                    var after = findUnitByUid((afterA || []).concat(afterE || []), uid);
                    if (!before || !after) continue;
                    if (after.hp >= before.hp) return false;
                }
                return true;
            }
        },

        {
            group: '✨ Buff',
            name: '惑人心智换位后双方位置交换',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'buff-swap';
                });
                if (!ev) return 'skip';
                var matchA = ev.text.match(/号位(.+?)\(/);
                var matchB = ev.text.match(/与.*?号位(.+?)\(/);
                if (!matchA || !matchB) return 'skip';
                var unitA = findUnitByName((beforeA || []).concat(beforeE || []), matchA[1]);
                var unitB = findUnitByName((beforeA || []).concat(beforeE || []), matchB[1]);
                var afterUnitA = findUnitByName((afterA || []).concat(afterE || []), matchA[1]);
                var afterUnitB = findUnitByName((afterA || []).concat(afterE || []), matchB[1]);
                if (!unitA || !unitB || !afterUnitA || !afterUnitB) return 'skip';
                if (afterUnitA.pos !== unitB.pos || afterUnitB.pos !== unitA.pos) return false;
                return true;
            }
        },

        // ========== 精英技能 ==========
        {
            group: '👹 精英',
            name: '玄冥神掌中毒后每回合扣血',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var poisonEv = log.find(function(e) {
                    return e.type === 'info' && e.text && e.text.indexOf('玄冥神掌') !== -1 && e.text.indexOf('中毒') !== -1;
                });
                if (!poisonEv) return 'skip';
                var dotEv = log.find(function(e) {
                    return e.type === 'info' && e.text && e.text.indexOf('寒毒发作') !== -1;
                });
                if (!dotEv) return 'skip';
                return true;
            }
        },

        {
            group: '👹 精英',
            name: '九阴白骨爪追击后受击者血量下降',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'info' && e.isClawHit;
                });
                if (!ev) return 'skip';
                var targetUid = ev.clawTargetUid;
                if (!targetUid) return 'skip';
                var before = findUnitByUid((beforeA || []).concat(beforeE || []), targetUid);
                var after = findUnitByUid((afterA || []).concat(afterE || []), targetUid);
                if (!before || !after) return 'skip';
                if (before.hp <= after.hp) return false;
                return true;
            }
        },

        {
            group: '👹 精英',
            name: '新婚扣血后周芷若血量下降',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'info' && e.text && e.text.indexOf('新婚') !== -1;
                });
                if (!ev) return 'skip';
                var zhouBefore = findUnitByName(beforeE || [], '周芷若');
                var zhouAfter = findUnitByName(afterE || [], '周芷若');
                if (!zhouBefore || !zhouAfter) return 'skip';
                if (zhouAfter.hp >= zhouBefore.hp) return false;
                return true;
            }
        },

        {
            group: '👹 精英',
            name: '快乐回血后血量增加',
            test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
                var ev = log.find(function(e) {
                    return e.type === 'info' && e.text && e.text.indexOf('快乐回血') !== -1;
                });
                if (!ev) return 'skip';
                // 从日志中解析回血后的血量
                var hpMatch = ev.text.match(/血量\s*(\d+)\s*→\s*(\d+)/);
                if (!hpMatch) return 'skip';
                var hpAfter = parseInt(hpMatch[2]);
                var nameMatch = ev.text.match(/：(.+?) 回复/);
                if (!nameMatch) return 'skip';
                var unitName = nameMatch[1];
                var unit = findUnitByName((afterA || []).concat(afterE || []), unitName);
                if (!unit) return 'skip';
                if (unit.hp < hpAfter) return false;
                return true;
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
    runBtn.textContent = '⏳ 检测中...';
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
            summary[c.name] = { pass: 0, fail: 0, skip: 0, total: 0, group: c.group };
        });

        var TOTAL_ROUNDS = 5;

        for (var idx = 0; idx < selectedStages.length; idx++) {
            for (var round = 0; round < TOTAL_ROUNDS; round++) {
                var stage = selectedStages[idx];
                var progress = Math.floor(((idx * TOTAL_ROUNDS + round + 1) / (selectedStages.length * TOTAL_ROUNDS)) * 100);
                progFill.style.width = progress + '%';
                progText.textContent = '第 ' + stage + ' 关 (' + (idx + 1) + '/' + selectedStages.length + ')';
                statusEl.textContent = '第 ' + stage + ' 关 · 第 ' + (round + 1) + '/' + TOTAL_ROUNDS + ' 轮';

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
                    [{ key: 'holyFlame', target: 'ally', remaining: 35 }, { key: 'carry', target: 'ally', remaining: 35 }]
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
                        } else if (result === true) {
                            summary[check.name].pass++;
                        } else {
                            summary[check.name].fail++;
                        }
                    } catch (e) {
                        summary[check.name].fail++;
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
            groups[stat.group].push({ name: name, pass: stat.pass, fail: stat.fail, skip: stat.skip, total: stat.total });
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
            if (line.indexOf('  ✅') === 0) return '<div style="color:#4caf50;">' + line + '</div>';
            if (line.indexOf('  ⏭️') === 0) return '<div style="color:#888;">' + line + '</div>';
            return '<div style="color:#ff9800;font-weight:bold;margin-top:6px;">' + line + '</div>';
        }).join('');

        var copyBtn = document.createElement('button');
        copyBtn.textContent = '📋 复制结果';
        copyBtn.style.cssText = 'margin-top:8px;padding:6px 14px;font-size:12px;';
        copyBtn.onclick = function() {
            navigator.clipboard.writeText(reportText).then(function() {
                copyBtn.textContent = '✅ 已复制';
                setTimeout(function() { copyBtn.textContent = '📋 复制结果'; }, 1500);
            });
        };
        reportEl.appendChild(copyBtn);

        statusEl.textContent = totalFail === 0
            ? '✅ 全部通过！' + totalPass + ' 项通过，' + totalSkip + ' 项跳过'
            : '⚠️ 通过 ' + totalPass + ' 项，失败 ' + totalFail + ' 项，跳过 ' + totalSkip + ' 项';

    } catch (e) {
        statusEl.textContent = '❌ ' + (e.message || '未知错误');
        reportEl.innerHTML = '<div style="color:#f44336;">❌ ' + (e.message || '未知错误') + '</div>';
    } finally {
        runBtn.disabled = false;
        runBtn.textContent = '🤖 开始全面体检';
        setTimeout(function() { progCont.style.display = 'none'; }, 5000);
    }
}