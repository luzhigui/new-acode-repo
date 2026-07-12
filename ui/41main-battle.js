// ui/41main-battle.js - 光明顶5v5 战斗初始化
// V5.0.1 | ~10000 bytes | 2026-07-07 修复第五关额外单位、职业按模板分配、精英怪站位
export const VER = 'ui/41main-battle.js V5.0.2';

import { CONFIG, ENEMY_M } from '../core/01config-5v5-test.js';
import { Unit, rand, runBattle } from '../core/07battle-engine-5v5-test.js';
import { updateUI, clearLogExceptFirst } from './14ui-render-5v5-test.js';
import { showModal } from './12main-utils.js';

const C = CONFIG;
const ALL_BUFF_KEYS = Object.keys(C.BUFFS);

// ==================== 阵容生成 ====================
export function doInitBattle(currentStage, UI, snapshot, activeBuffs, selectedBuffIndex, currentDoubleStrikeUid) {
    let allyTeam = [], enemyTeam = [];
    const mingSquad = C.MING_SQUADS && C.MING_SQUADS[currentStage] ? C.MING_SQUADS[currentStage] : null;
    const enemySquad = C.ENEMY_SQUADS && C.ENEMY_SQUADS[currentStage] ? C.ENEMY_SQUADS[currentStage] : null;

    let mingConfig;
    if (mingSquad) {
        if (currentStage === 1 && Array.isArray(mingSquad[0])) {
            mingConfig = mingSquad[rand(0, mingSquad.length - 1)];
        } else {
            mingConfig = mingSquad;
        }
        if (!Array.isArray(mingConfig)) mingConfig = [mingConfig];
        let takenPos = new Set();
        for (let item of mingConfig) {
            let name, mVal;
            if (typeof item === 'string') { name = item; mVal = C.MING_M[name] || 95; }
            else {
                mVal = item;
                if (mVal === 95) {
                    const existingDisciples = allyTeam.filter(u => u.name && u.name.startsWith('明教弟子'));
                    name = '明教弟子' + (existingDisciples.length + 1);
                } else {
                    const usedNames = allyTeam.map(u => u.name);
                    const candidates = Object.entries(C.MING_M).filter(([n, v]) => v === mVal && !usedNames.includes(n));
                    if (candidates.length > 0) name = candidates[rand(0, candidates.length - 1)][0];
                    else {
                        const allCandidates = Object.entries(C.MING_M).filter(([n, v]) => v === mVal);
                        name = allCandidates.length > 0 ? allCandidates[rand(0, allCandidates.length - 1)][0] : ('明教弟子' + (allyTeam.length + 1));
                    }
                }
            }
            if (!name) name = '明教弟子' + (allyTeam.length + 1);
            if (!mVal) mVal = 95;
            let role = name === '张无忌' ? '远程' : (name === '韦一笑' ? '飞行' : C.ROLES[rand(0, 3)]);
            let unit = new Unit(name, mVal, role, 'ally');
            if (name === '张无忌') unit.isZhang = true;
            if (name === '韦一笑') unit.isWei = true;
            unit.pos = null; unit.init(); unit.applyBonus();
            allyTeam.push(unit);
        }
        let zhang = allyTeam.find(u => u.isZhang);
        let wei = allyTeam.find(u => u.isWei);
        if (zhang) { zhang.pos = 5; takenPos.add(5); }
        if (wei) { wei.pos = 6; takenPos.add(6); }
        let others = allyTeam.filter(u => !u.isZhang && !u.isWei);
        if (others.length > 0 && zhang && !takenPos.has(2)) { others[0].pos = 2; takenPos.add(2); others.shift(); }
        let remainingSlots = [1,2,3,4,5,6,7,8,9].filter(p => !takenPos.has(p));
        for (let u of others) {
            if (remainingSlots.length > 0) { let idx = rand(0, remainingSlots.length - 1); u.pos = remainingSlots[idx]; takenPos.add(remainingSlots[idx]); remainingSlots.splice(idx, 1); }
            else { u.pos = 5; }
        }
        allyTeam.forEach(u => { u.fixed = false; });
        let toLock = [zhang, wei].filter(Boolean);
        while (toLock.length < 3) { let pool = allyTeam.filter(u => !toLock.includes(u)); if (pool.length === 0) break; let pick = pool[rand(0, pool.length - 1)]; toLock.push(pick); }
        toLock.forEach(u => { u.fixed = true; });
    }

    let enemyUnits = [];
    if (enemySquad) {
        let enemyPosSet = new Set();
        let xuanmingPairCount = 0;
        let extraUnitForStage5 = null;

        for (let item of enemySquad) {
            if (typeof item === 'object' && item.name) {
                let unit = new Unit(item.name, item.m, item.role, 'enemy');
                unit.pos = null; unit.init(); unit.applyBonus();
                enemyUnits.push(unit);
                if (item.name === '鹿杖客' || item.name === '鹤笔翁') {
                    xuanmingPairCount++;
                }
            } else {
                let mVal = item;
                let pool = Object.entries(ENEMY_M).filter(([n, v]) => v === mVal);
                let usedNames = enemyUnits.map(u => u.name);
                let name = null;
                const squadDefs = Object.values(C.ENEMY_SQUADS).flat();
                for (let def of squadDefs) { if (typeof def === 'object' && def.m === mVal && !usedNames.includes(def.name)) { name = def.name; break; } }
                if (!name && pool.length > 0) {
                    let attempts = 0;
                    while ((!name || usedNames.includes(name)) && attempts < 50) { let pick = pool[rand(0, pool.length - 1)]; name = pick[0]; attempts++; }
                }
                if (!name) name = '六大派弟子';
                let role = C.ROLES[rand(0, 3)];
                let unit = new Unit(name, mVal, role, 'enemy');
                unit.pos = null; unit.init(); unit.applyBonus();
                enemyUnits.push(unit);
            }
        }

        // 第五关：玄冥二老在场时，额外增加一个敌人（固定 104，共 6 人）
        if (currentStage === 5 && xuanmingPairCount === 2) {
            let extraM = 104;
            let pool = Object.entries(ENEMY_M).filter(([n, v]) => v === extraM);
            let usedNames = enemyUnits.map(u => u.name);
            let name = null;
            while ((!name || usedNames.includes(name)) && pool.length > 0) {
                let pick = pool[rand(0, pool.length - 1)];
                name = pick[0];
                if (usedNames.includes(name)) { name = null; pool.splice(pool.indexOf(pick), 1); }
            }
            if (!name) name = '六大派弟子';
            let role = C.ROLES[rand(0, 3)];
            let extraUnit = new Unit(name, extraM, role, 'enemy');
            extraUnit.init(); extraUnit.applyBonus();
            enemyUnits.push(extraUnit);          // ← 加入队伍
            extraUnitForStage5 = extraUnit;
        }

        let allUnits = [...enemyUnits];
        let template = C.ENEMY_POS_TEMPLATES && C.ENEMY_POS_TEMPLATES[currentStage] ? C.ENEMY_POS_TEMPLATES[currentStage] : null;
        let eliteUnits = allUnits.filter(u => C.ELITE_POOL && C.ELITE_POOL[currentStage] && C.ELITE_POOL[currentStage].some(e => e.name === u.name));
        let normalUnits = allUnits.filter(u => !eliteUnits.includes(u));

        // 按站位模板调整普通单位的职业，确保每种职业的数量满足模板需求
        if (template) {
            let roleCounts = { '战士': 0, '防战': 0, '远程': 0, '飞行': 0 };
            normalUnits.forEach(u => { if (roleCounts[u.role] !== undefined) roleCounts[u.role]++; });
            let templateNeeds = {};
            for (let [role, poses] of Object.entries(template)) {
                if (role === 'random') continue;
                templateNeeds[role] = poses.length;
            }
            for (let role of ['防战', '远程', '飞行', '战士']) {
                let need = templateNeeds[role] || 0;
                let current = roleCounts[role] || 0;
                let shortage = need - current;
                if (shortage > 0) {
                    let others = normalUnits.filter(u => u.role !== role && (templateNeeds[u.role] || 0) < (roleCounts[u.role] || 0));
                    for (let i = 0; i < Math.min(shortage, others.length); i++) {
                        roleCounts[others[i].role]--;
                        others[i].role = role;
                        roleCounts[role]++;
                    }
                }
            }
        }

        // 先分配站位模板（普通单位），保留精英怪位置不被抢占
        if (template) {
            for (let [role, poses] of Object.entries(template)) {
                if (role === 'random') continue;
                for (let pos of poses) {
                    let unit = normalUnits.find(u => u.role === role && u.pos == null);
                    if (unit && !enemyPosSet.has(pos)) { unit.pos = pos; unit._originalPos = pos; enemyPosSet.add(pos); }
                }
            }
        }

        // 精英怪站位：有偏好位置，但可能被普通单位抢占（保留随机性）
        const zhou = eliteUnits.find(u => u.name === '周芷若');
        const song = eliteUnits.find(u => u.name === '宋青书');

        if (zhou && zhou.pos == null) {
            const zhouPriority = [2, 3, 4, 5, 6, 7, 8, 9];
            let placed = false;
            for (const p of zhouPriority) {
                if (!enemyPosSet.has(p)) {
                    zhou.pos = p; zhou._originalPos = p; enemyPosSet.add(p); placed = true;
                    break;
                }
            }
            if (!placed) {
                // 硬保底：强制挤掉 2 号位的单位
                let displaced = normalUnits.find(u => u.pos === 2);
                if (displaced) { displaced.pos = null; displaced._originalPos = -1; }
                zhou.pos = 2; zhou._originalPos = 2; enemyPosSet.add(2);
            }
        }

        if (song && song.pos == null) {
            const zhouPos = zhou ? zhou.pos : 0;
            let placed = false;
            for (let p = zhouPos + 1; p <= 9; p++) {
                if (!enemyPosSet.has(p)) {
                    song.pos = p; song._originalPos = p; enemyPosSet.add(p); placed = true;
                    break;
                }
            }
            if (!placed) {
                for (let p = 1; p <= 9; p++) {
                    if (!enemyPosSet.has(p)) {
                        song.pos = p; song._originalPos = p; enemyPosSet.add(p); placed = true;
                        break;
                    }
                }
            }
            if (!placed) {
                // 硬保底：强制挤掉周芷若后面的单位
                let backPos = zhouPos + 1;
                if (backPos <= 9) {
                    let displaced = normalUnits.find(u => u.pos === backPos);
                    if (displaced) { displaced.pos = null; displaced._originalPos = -1; }
                    song.pos = backPos; song._originalPos = backPos; enemyPosSet.add(backPos); placed = true;
                }
            }
        }

        // 其他精英怪按优先级分配（成昆→1号位，鹿杖客→7号位，鹤笔翁→4号位）
        const otherElites = eliteUnits.filter(u => u !== zhou && u !== song && u.pos == null);
        for (let u of otherElites) {
            let priority;
            if (u.name === '成昆') priority = [1, 2, 3, 4, 5, 6, 7, 8, 9];
            else if (u.name === '鹿杖客') priority = [7, 8, 9, 4, 5, 6, 1, 2, 3];
            else if (u.name === '鹤笔翁') priority = [4, 5, 6, 7, 8, 9, 1, 2, 3];
            else priority = [1, 2, 3, 4, 5, 6, 7, 8, 9];

            for (const p of priority) {
                if (!enemyPosSet.has(p)) {
                    u.pos = p; u._originalPos = p; enemyPosSet.add(p);
                    break;
                }
            }
            if (u.pos == null) {
                // 硬保底：挤掉优先位置的单位
                let p = priority[0];
                let displaced = normalUnits.find(u2 => u2.pos === p);
                if (displaced) { displaced.pos = null; displaced._originalPos = -1; }
                u.pos = p; u._originalPos = p; enemyPosSet.add(p);
            }
        }

        // 剩余普通单位填充空位
        let unplacedNormals = normalUnits.filter(u => u.pos == null);
        let emptySlots = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(p => !enemyPosSet.has(p));
        for (let u of unplacedNormals) {
            if (emptySlots.length > 0) {
                let idx = rand(0, emptySlots.length - 1);
                u.pos = emptySlots[idx];
                u._originalPos = u.pos;
                enemyPosSet.add(emptySlots[idx]);
                emptySlots.splice(idx, 1);
            }
        }

        enemyTeam = allUnits;
    }

    snapshot.ally = allyTeam.map(u => Object.freeze(u.clone()));
    snapshot.enemy = enemyTeam.map(u => Object.freeze(u.clone()));
    UI.allyTeam = allyTeam.map(u => u.clone());
    UI.enemyTeam = enemyTeam.map(u => u.clone());
    UI.currentResult = null;
    UI.round = 0;
    window._battleHasZhang = allyTeam.some(u => u.isZhang);
    window._lastBattleSeed = Date.now();
    let stageText = currentStage === 1 ? '第一关' : `第${currentStage}关`;
    document.getElementById('labelEnemy').textContent = `六大派\n${stageText}`;
    document.getElementById('labelAlly').textContent = '明 教';
    updateUI();
}

// ==================== Buff 选择 ====================
export function generateBuffChoices(activeBuffs) {
    let activeBuffKeys = activeBuffs.map(b => b.key);
    let available = ALL_BUFF_KEYS.filter(k => !activeBuffKeys.includes(k));
    let shuffled = [...available].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, C.BUFF_CHOICES);
}

export function showBuffSelection(callback, activeBuffs, selectedBuffIndex, updateBuffSlotsFn, updateUIFn, autoScrollLogFn) {
    const choices = generateBuffChoices(activeBuffs);
    const text = '选择 Buff（持续 ' + C.BUFF_DURATION + ' 回合）';
    const buttons = choices.map(key => ({
        text: (C.BUFFS[key]?.icon || '?') + ' ' + (C.BUFFS[key]?.name || key) + '\n' + (C.BUFFS[key]?.desc || ''),
        value: key,
        cls: 'buff'
    }));
    showModal(text, buttons, (key) => {
        let duration = C.BUFFS[key].duration || C.BUFF_DURATION;
        if (activeBuffs.length >= 2) {
            let shortest = activeBuffs.reduce((a, b) => a.remaining < b.remaining ? a : b);
            activeBuffs.splice(activeBuffs.indexOf(shortest), 1);
        }
        if (key === 'holyFlame') {
            activeBuffs.push({ key, target: 'ally', remaining: duration, name: C.BUFFS[key].name, col: Math.floor(Math.random() * 3) + 1, row: Math.floor(Math.random() * 3) + 1 });
        } else {
            activeBuffs.push({ key, target: 'ally', remaining: duration, name: C.BUFFS[key].name });
        }
        updateBuffSlotsFn();
        let logDiv = document.getElementById('log');
        if (logDiv) { logDiv.innerHTML += `<span class="gold">✨ 获得Buff：${C.BUFFS[key].name}（持续${duration}回合）</span><br>`; autoScrollLogFn(); }
        if (window._updateGlowColors) window._updateGlowColors(selectedBuffIndex);
        updateUIFn();
        callback();
    }, true, false);
}

// ==================== Buff 槽 ====================
export function updateBuffSlots(activeBuffs, selectedBuffIndex) {
    for (let i = 0; i < 2; i++) {
        let slot = document.getElementById('buffSlot' + i);
        if (!slot) continue;
        if (i < activeBuffs.length) {
            let buff = activeBuffs[i];
            slot.textContent = buff.name + '/' + buff.remaining + '回';
            slot.classList.add('glow');
            if (selectedBuffIndex === i) slot.classList.add('active');
            else slot.classList.remove('active');
        } else {
            slot.textContent = 'buff' + (i + 1);
            slot.classList.remove('active', 'glow');
        }
    }
}

export function tickBuffDurations(activeBuffs, selectedBuffIndex, updateBuffSlotsFn) {
    activeBuffs = activeBuffs.map(b => ({...b, remaining: b.remaining - 1})).filter(b => b.remaining > 0);
    if (selectedBuffIndex >= activeBuffs.length) selectedBuffIndex = -1;
    updateBuffSlotsFn();
    return { activeBuffs, selectedBuffIndex };
}

export function getActiveBuffList(activeBuffs) {
    return activeBuffs.map(b => b.name + '(' + b.remaining + '回)').join('、') || '无';
}

// ==================== 战斗日志 ====================
export function logTeamInfo(label, UI, gs, battleResultForInfo, activeBuffs, hasLoggedTeam) {
    let ally = UI.allyTeam, enemy = UI.enemyTeam;
    if (!ally.length || !enemy.length) return;
    let logDiv = document.getElementById('log');
    let appendDiv = (html) => { let d = document.createElement('div'); d.innerHTML = html + '<br>'; logDiv.appendChild(d); };
    let lbl = label || '阵容详情', contextNote = '';
    if (gs === 'RUNNING' || gs === 'PAUSED') contextNote = `（当前：第${UI.round||'?'}回合${gs==='PAUSED'?' 已暂停':''}）`;
    else if (gs === 'GAMEOVER') contextNote = '（当前：战斗已结束）';
    else contextNote = '（当前：准备阶段）';
    appendDiv(`<div class="separator">📋 ${lbl} ${contextNote}</div>`);
    appendDiv(`<span class="gold">[Buff: ${getActiveBuffList(activeBuffs)}]</span>`);
    let hasStats = (gs === 'GAMEOVER' && battleResultForInfo) || gs === 'RUNNING' || gs === 'PAUSED';
    [
        {name:'明教', color:'blue', data:ally},
        {name:'六大派', color:'orange', data:enemy}
    ].forEach(camp => {
        appendDiv(`<span class="${camp.color}">【${camp.name}】</span>`);
        camp.data.forEach(u => {
            let aliveText = u.alive ? '存活' : '💀阵亡';
            let displayPos = u.pos === -1 ? (u._originalPos || '?') : u.pos;
            let infoParts = [
                `${u.name}(${u.role} M${u.m})`,
                u.isHorse ? '[拒马]' : '',
                `站位${displayPos}`,
                `攻${Math.floor(u.atk)} 防${Math.floor(u.def)}`,
                `血${Math.floor(u.hp)}/${Math.floor(u.maxHp)}`,
                aliveText,
                u.isZhang ? '[无忌]' : '',
                u.isWei ? '[韦一笑]' : ''
            ].filter(Boolean);
            appendDiv('  ' + infoParts.join(' '));
            let statParts = [];
            if (hasStats) {
                if (u.dmgDealt !== undefined && u.dmgDealt > 0) statParts.push(`输出${u.dmgDealt}`);
                if (u.dmgTaken !== undefined && u.dmgTaken > 0) statParts.push(`承伤${u.dmgTaken}`);
            }
            if (u.dodgeCount > 0) statParts.push(`闪避${u.dodgeCount}次`);
            if (u.healDone > 0) statParts.push(`治疗${u.healDone}`);
            if (u.reboundDone > 0) statParts.push(`反弹${u.reboundDone}`);
            if (u.leechDone > 0) statParts.push(`吸血${u.leechDone}`);
            if (u.critCount > 0) statParts.push(`暴击${u.critCount}次`);
            if (u.survivedRounds > 0) statParts.push(`存活${u.survivedRounds}回合`);
            if (statParts.length > 0) appendDiv('    └ ' + statParts.join(' | '));
        });
    });
    logDiv.scrollTop = logDiv.scrollHeight;
    return true;
}

// ==================== 中止 ====================
export function abortAll(abortController, UI, waitingForNextRound, isBattleStarting, adjustMode, selectedAdjustPos, activeBuffs, selectedBuffIndex, currentDoubleStrikeUid, updateBuffSlotsFn) {
    if (abortController) { abortController.abort(); abortController = null; }
    window._fastForwardActive = false;  // 重置快进标志，防止弹幕被跳过
    UI.currentResult = null;
    waitingForNextRound = false;
    isBattleStarting = false;
    adjustMode = false;
    selectedAdjustPos = null;
    activeBuffs = [];
    selectedBuffIndex = -1;
    currentDoubleStrikeUid = null;
    updateBuffSlotsFn();
    return { abortController, waitingForNextRound, isBattleStarting, adjustMode, selectedAdjustPos, activeBuffs, selectedBuffIndex, currentDoubleStrikeUid };
}