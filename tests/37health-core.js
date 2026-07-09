// tests/37health-core.js - 光明顶5v5 全面体检（实战验证）
// V5.0.5 | 日志增强层 + 三向检验，规则拆分为独立文件
export const VER = 'tests/37health-core.js V5.0.5';

import { runBattle, Unit, rand } from '../core/07battle-engine-5v5-test.js';
import { CONFIG, ENEMY_M } from '../core/01config-5v5-test.js';

// 导入 9 条实战规则
import { rule60 } from './37health-rules/60-separator.js';
import { rule61 } from './37health-rules/61-boneclaw.js';
import { rule62 } from './37health-rules/62-speed-button.js';
import { rule63 } from './37health-rules/63-carry-hp.js';
import { rule64 } from './37health-rules/64-horse.js';
import { rule65 } from './37health-rules/65-swap.js';
import { rule67 } from './37health-rules/67-cloud-dodge.js';
import { rule68 } from './37health-rules/68-dodge-rebound.js';

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
    var initPosMap = {};
    for (var u = 0; u < allUnits.length; u++) {
        var unit = allUnits[u];
        if (unit && unit.uid) {
            initPosMap[unit.uid] = { name: unit.name, pos: unit.pos };
        }
    }
    
    for (var i = 0; i < battleLog.length; i++) {
        var entry = battleLog[i];
        
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

// ==================== 规则汇总 ====================

function createCombatChecks(win, doc) {
    return [
        rule60, rule61, rule62, rule63, rule64,
        rule65, rule67, rule68
    ];
}

// ==================== 纯数据版阵容生成（和 doInitBattle 逻辑一致，不碰 DOM） ====================

function generateCombatSnapshot(currentStage) {
    var C = CONFIG;
    var allyTeam = [], enemyTeam = [];
    var mingSquad = C.MING_SQUADS && C.MING_SQUADS[currentStage] ? C.MING_SQUADS[currentStage] : null;
    var enemySquad = C.ENEMY_SQUADS && C.ENEMY_SQUADS[currentStage] ? C.ENEMY_SQUADS[currentStage] : null;

    // ===== 明教阵容生成 =====
    var mingConfig;
    if (mingSquad) {
        if (currentStage === 1 && Array.isArray(mingSquad[0])) {
            mingConfig = mingSquad[rand(0, mingSquad.length - 1)];
        } else {
            mingConfig = mingSquad;
        }
        if (!Array.isArray(mingConfig)) mingConfig = [mingConfig];
        var takenPos = new Set();
        for (var mi = 0; mi < mingConfig.length; mi++) {
            var item = mingConfig[mi];
            var name, mVal;
            if (typeof item === 'string') { name = item; mVal = C.MING_M[name] || 95; }
            else {
                mVal = item;
                if (mVal === 95) {
                    var existingDisciples = allyTeam.filter(function(u) { return u.name && u.name.indexOf('明教弟子') === 0; });
                    name = '明教弟子' + (existingDisciples.length + 1);
                } else {
                    var usedNames = allyTeam.map(function(u) { return u.name; });
                    var candidates = Object.entries(C.MING_M).filter(function(e) { return e[1] === mVal && usedNames.indexOf(e[0]) === -1; });
                    if (candidates.length > 0) name = candidates[rand(0, candidates.length - 1)][0];
                    else {
                        var allCandidates = Object.entries(C.MING_M).filter(function(e) { return e[1] === mVal; });
                        name = allCandidates.length > 0 ? allCandidates[rand(0, allCandidates.length - 1)][0] : ('明教弟子' + (allyTeam.length + 1));
                    }
                }
            }
            if (!name) name = '明教弟子' + (allyTeam.length + 1);
            if (!mVal) mVal = 95;
            var role = name === '张无忌' ? '远程' : (name === '韦一笑' ? '飞行' : C.ROLES[rand(0, 3)]);
            var unit = new Unit(name, mVal, role, 'ally');
            if (name === '张无忌') unit.isZhang = true;
            if (name === '韦一笑') unit.isWei = true;
            unit.pos = null; unit.init(); unit.applyBonus();
            allyTeam.push(unit);
        }
        var zhang = allyTeam.find(function(u) { return u.isZhang; });
        var wei = allyTeam.find(function(u) { return u.isWei; });
        if (zhang) { zhang.pos = 5; takenPos.add(5); }
        if (wei) { wei.pos = 6; takenPos.add(6); }
        var others = allyTeam.filter(function(u) { return !u.isZhang && !u.isWei; });
        if (others.length > 0 && zhang && !takenPos.has(2)) { others[0].pos = 2; takenPos.add(2); others.shift(); }
        var remainingSlots = [1,2,3,4,5,6,7,8,9].filter(function(p) { return !takenPos.has(p); });
        for (var oi = 0; oi < others.length; oi++) {
            if (remainingSlots.length > 0) { var idx = rand(0, remainingSlots.length - 1); others[oi].pos = remainingSlots[idx]; takenPos.add(remainingSlots[idx]); remainingSlots.splice(idx, 1); }
            else { others[oi].pos = 5; }
        }
        allyTeam.forEach(function(u) { u.fixed = false; });
        var toLock = [zhang, wei].filter(Boolean);
        while (toLock.length < 3) { var pool = allyTeam.filter(function(u) { return toLock.indexOf(u) === -1; }); if (pool.length === 0) break; var pick = pool[rand(0, pool.length - 1)]; toLock.push(pick); }
        toLock.forEach(function(u) { u.fixed = true; });
    }

    // ===== 敌方阵容生成 =====
    var enemyUnits = [];
    if (enemySquad) {
        var enemyPosSet = new Set();
        for (var ei = 0; ei < enemySquad.length; ei++) {
            var eItem = enemySquad[ei];
            if (typeof eItem === 'object' && eItem.name) {
                var eUnit = new Unit(eItem.name, eItem.m, eItem.role, 'enemy');
                eUnit.pos = null; eUnit.init(); eUnit.applyBonus();
                enemyUnits.push(eUnit);
            } else {
                var eMVal = eItem;
                var ePool = Object.entries(ENEMY_M).filter(function(e) { return e[1] === eMVal; });
                var usedNames = enemyUnits.map(function(u) { return u.name; });
                var eName = null;
                var squadDefs = Object.values(C.ENEMY_SQUADS).flat();
                for (var sd = 0; sd < squadDefs.length; sd++) { var def = squadDefs[sd]; if (typeof def === 'object' && def.m === eMVal && usedNames.indexOf(def.name) === -1) { eName = def.name; break; } }
                if (!eName && ePool.length > 0) {
                    var attempts = 0;
                    while ((!eName || usedNames.indexOf(eName) !== -1) && attempts < 50) { var pick = ePool[rand(0, ePool.length - 1)]; eName = pick[0]; attempts++; }
                }
                if (!eName) eName = '六大派弟子';
                var eRole = C.ROLES[rand(0, 3)];
                var eUnit = new Unit(eName, eMVal, eRole, 'enemy');
                eUnit.pos = null; eUnit.init(); eUnit.applyBonus();
                enemyUnits.push(eUnit);
            }
        }

        var allUnits = enemyUnits.slice();
        var template = C.ENEMY_POS_TEMPLATES && C.ENEMY_POS_TEMPLATES[currentStage] ? C.ENEMY_POS_TEMPLATES[currentStage] : null;
        var eliteUnits = allUnits.filter(function(u) { return C.ELITE_POOL && C.ELITE_POOL[currentStage] && C.ELITE_POOL[currentStage].some(function(e) { return e.name === u.name; }); });
        var normalUnits = allUnits.filter(function(u) { return eliteUnits.indexOf(u) === -1; });

        if (template) {
            var roleCounts = { '战士': 0, '防战': 0, '远程': 0, '飞行': 0 };
            normalUnits.forEach(function(u) { if (roleCounts[u.role] !== undefined) roleCounts[u.role]++; });
            var templateNeeds = {};
            for (var role in template) { if (role === 'random') continue; templateNeeds[role] = template[role].length; }
            for (var role2 of ['防战', '远程', '飞行', '战士']) {
                var need = templateNeeds[role2] || 0;
                var current = roleCounts[role2] || 0;
                var shortage = need - current;
                if (shortage > 0) {
                    var others2 = normalUnits.filter(function(u) { return u.role !== role2 && (templateNeeds[u.role] || 0) < (roleCounts[u.role] || 0); });
                    for (var si = 0; si < Math.min(shortage, others2.length); si++) { roleCounts[others2[si].role]--; others2[si].role = role2; roleCounts[role2]++; }
                }
            }
        }

        if (template) {
            for (var role3 in template) {
                if (role3 === 'random') continue;
                var poses = template[role3];
                for (var pi = 0; pi < poses.length; pi++) {
                    var pos = poses[pi];
                    var unit2 = normalUnits.find(function(u) { return u.role === role3 && u.pos == null; });
                    if (unit2 && !enemyPosSet.has(pos)) { unit2.pos = pos; unit2._originalPos = pos; enemyPosSet.add(pos); }
                }
            }
        }

        var zhou = eliteUnits.find(function(u) { return u.name === '周芷若'; });
        var song = eliteUnits.find(function(u) { return u.name === '宋青书'; });

        if (zhou && zhou.pos == null) {
            var zhouPriority = [2, 3, 4, 5, 6, 7, 8, 9];
            for (var zp = 0; zp < zhouPriority.length; zp++) { if (!enemyPosSet.has(zhouPriority[zp])) { zhou.pos = zhouPriority[zp]; zhou._originalPos = zhouPriority[zp]; enemyPosSet.add(zhouPriority[zp]); break; } }
            if (zhou.pos == null) { var displaced = normalUnits.find(function(u) { return u.pos === 2; }); if (displaced) { displaced.pos = null; displaced._originalPos = -1; } zhou.pos = 2; zhou._originalPos = 2; enemyPosSet.add(2); }
        }

        if (song && song.pos == null) {
            var zhouPos = zhou ? zhou.pos : 0;
            var placed = false;
            for (var p = zhouPos + 1; p <= 9; p++) { if (!enemyPosSet.has(p)) { song.pos = p; song._originalPos = p; enemyPosSet.add(p); placed = true; break; } }
            if (!placed) { for (var p2 = 1; p2 <= 9; p2++) { if (!enemyPosSet.has(p2)) { song.pos = p2; song._originalPos = p2; enemyPosSet.add(p2); placed = true; break; } } }
            if (!placed) { var backPos = zhouPos + 1; if (backPos <= 9) { var displaced2 = normalUnits.find(function(u) { return u.pos === backPos; }); if (displaced2) { displaced2.pos = null; displaced2._originalPos = -1; } song.pos = backPos; song._originalPos = backPos; enemyPosSet.add(backPos); } }
        }

        var otherElites = eliteUnits.filter(function(u) { return u !== zhou && u !== song && u.pos == null; });
        for (var oe = 0; oe < otherElites.length; oe++) {
            var ou = otherElites[oe];
            var priority = [1, 2, 3, 4, 5, 6, 7, 8, 9];
            for (var pr = 0; pr < priority.length; pr++) { if (!enemyPosSet.has(priority[pr])) { ou.pos = priority[pr]; ou._originalPos = priority[pr]; enemyPosSet.add(priority[pr]); break; } }
            if (ou.pos == null) { var dp = priority[0]; var disp = normalUnits.find(function(u) { return u.pos === dp; }); if (disp) { disp.pos = null; disp._originalPos = -1; } ou.pos = dp; ou._originalPos = dp; enemyPosSet.add(dp); }
        }

        var unplacedNormals = normalUnits.filter(function(u) { return u.pos == null; });
        var emptySlots = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(function(p) { return !enemyPosSet.has(p); });
        for (var un = 0; un < unplacedNormals.length; un++) {
            if (emptySlots.length > 0) { var slotIdx = rand(0, emptySlots.length - 1); unplacedNormals[un].pos = emptySlots[slotIdx]; unplacedNormals[un]._originalPos = emptySlots[slotIdx]; enemyPosSet.add(emptySlots[slotIdx]); emptySlots.splice(slotIdx, 1); }
        }

        enemyTeam = allUnits;
    }

    var snapshot = { ally: [], enemy: [] };
    snapshot.ally = allyTeam.map(function(u) { return Object.freeze(u.clone()); });
    snapshot.enemy = enemyTeam.map(function(u) { return Object.freeze(u.clone()); });
    return snapshot;
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

                // 纯数据版阵容生成，和主代码 doInitBattle 逻辑一致但不碰 DOM
                var snap = generateCombatSnapshot(stage);
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

                battleLog = enhanceBattleLog(battleLog, ally, enemy);

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
                        if (!ctxSync) ctxSync = {};
                        ctxSync._doc = D();
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