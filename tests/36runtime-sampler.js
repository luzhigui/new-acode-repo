// tests/36runtime-sampler.js - 光明顶5v5 运行时采样器
// V5.0.5 | 改用纯数据版阵容生成，不再依赖27
export const VER = 'tests/36runtime-sampler.js V5.0.5';

import { createHealthRules } from './29health-rules.js';
import { runBattle, Unit, rand } from '../core/07battle-engine-5v5-test.js';
import { CONFIG, ENEMY_M } from '../core/01config-5v5-test.js';

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

// ==================== 运行时采样 ====================

export async function runRuntimeSample(ctx, maxRounds) {
    maxRounds = maxRounds || 2;
    const stage = ctx.currentStage || 1;
    const snap = generateCombatSnapshot(stage);

    const activeBuffs = ctx.activeBuffs || [];
    snap.ally._activeBuffs = activeBuffs.filter(function(b) { return b.target === 'ally' || !b.target; });
    snap.enemy._activeBuffs = activeBuffs.filter(function(b) { return b.target === 'enemy'; });

    let battleResult;
    try {
        battleResult = runBattle(snap, activeBuffs);
    } catch (e) {
        return {
            passed: false,
            failures: [{ name: '战斗引擎崩溃', fix: e.message }],
            summary: '战斗引擎运行异常'
        };
    }

    const fakeCtx = {
        UI: {
            allyTeam: battleResult.ally || snap.ally,
            enemyTeam: battleResult.enemy || snap.enemy,
            currentResult: battleResult,
            round: battleResult.rounds || 0
        },
        currentStage: stage,
        activeBuffs: activeBuffs,
        currentDoubleStrikeUid: null
    };

    const allRules = createHealthRules(window, document);
    const runtimeGroups = ['❤️ 血条与属性', '🔗 数据', '⚙️ 引擎', '✨ Buff 系统'];
    const rules = allRules.filter(function(r) { return runtimeGroups.indexOf(r.group) !== -1; });

    const failures = [];
    for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        try {
            const originalGetCtx = window._getPlayerContext;
            window._getPlayerContext = function() { return fakeCtx; };
            const result = await rule.test();
            window._getPlayerContext = originalGetCtx;
            if (result === false) {
                failures.push({
                    name: rule.name,
                    group: rule.group,
                    fix: rule.fix
                });
            }
        } catch (e) {
            failures.push({
                name: rule.name,
                group: rule.group,
                error: e.message
            });
        }
    }

    // 胜利弹幕检查（仅在真实游戏结束、有播放器时执行）
    if (ctx.gs === 'GAMEOVER' && ctx.store) {
        try {
            var allyAlive = (ctx.UI.allyTeam || []).filter(function(u) { return u.alive; });
            var enemyAlive = (ctx.UI.enemyTeam || []).filter(function(u) { return u.alive; });
            var winner = null;
            var aliveCount = 0;
            if (allyAlive.length > 0 && enemyAlive.length === 0) { winner = '明教'; aliveCount = allyAlive.length; }
            else if (enemyAlive.length > 0 && allyAlive.length === 0) { winner = '六大派'; aliveCount = enemyAlive.length; }
            if (winner) {
                var bubbles = document.querySelectorAll('.danmaku-bubble');
                if (bubbles.length === 0) {
                    failures.push({ name: '胜利弹幕检查', group: '特效', fix: 'UI问题：' + winner + '获胜（' + aliveCount + '人存活），但没有任何胜利弹幕' });
                } else if (bubbles.length < aliveCount) {
                    failures.push({ name: '胜利弹幕检查', group: '特效', fix: 'UI问题：' + winner + '获胜，' + aliveCount + '人存活但只有' + bubbles.length + '条弹幕，缺少' + (aliveCount - bubbles.length) + '条' });
                }
            }
        } catch (e) {
            failures.push({ name: '胜利弹幕检查', group: '特效', error: e.message });
        }
    }

    return {
        passed: failures.length === 0,
        failures: failures,
        summary: '采样完成 (' + battleResult.rounds + ' 回合)，检测 ' + rules.length + ' 条规则'
    };
}