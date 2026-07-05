// ui/41main-battle.js - 光明顶5v5 战斗初始化
// V4.0.0 | ~8000 bytes | 2026-07-06
export const VER = 'ui/41main-battle.js V4.0.0';

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
            enemyUnits.push(extraUnit);
        }
        let allUnits = [...enemyUnits];
        let template = C.ENEMY_POS_TEMPLATES && C.ENEMY_POS_TEMPLATES[currentStage] ? C.ENEMY_POS_TEMPLATES[currentStage] : null;
        let eliteUnits = allUnits.filter(u => C.ELITE_POOL && C.ELITE_POOL[currentStage] && C.ELITE_POOL[currentStage].some(e => e.name === u.name));
        let normalUnits = allUnits.filter(u => !eliteUnits.includes(u));
        if (template) {
            for (let [role, poses] of Object.entries(template)) {
                if (role === 'random') continue;
                for (let pos of poses) {
                    let unit = normalUnits.find(u => u.role === role && u.pos == null);
                    if (unit && !enemyPosSet.has(pos)) { unit.pos = pos; unit._originalPos = pos; enemyPosSet.add(pos); }
                }
            }
        }
        let unplacedNormals = normalUnits.filter(u => u.pos == null);
        let emptySlots = [1,2,3,4,5,6,7,8,9].filter(p => !enemyPosSet.has(p));
        for (let u of unplacedNormals) {
            if (emptySlots.length > 0) { let idx = rand(0, emptySlots.length - 1); u.pos = emptySlots[idx]; u._originalPos = u.pos; enemyPosSet.add(emptySlots[idx]); emptySlots.splice(idx, 1); }
        }
        const zhou = eliteUnits.find(u => u.name === '周芷若');
        const song = eliteUnits.find(u => u.name === '宋青书');
        if (zhou) {
            const zhouPriority = [2, 3, 4, 5, 6, 7, 8, 9];
            for (const p of zhouPriority) {
                if (!enemyPosSet.has(p)) {
                    zhou.pos = p; zhou._originalPos = p; enemyPosSet.add(p);
                    break;
                }
            }
        }
        if (song) {
            const zhouPos = zhou ? zhou.pos : 0;
            for (let p = zhouPos + 1; p <= 9; p++) {
                if (!enemyPosSet.has(p)) {
                    song.pos = p; song._originalPos = p; enemyPosSet.add(p);
                    break;
                }
            }
            if (song.pos == null) {
                for (let p = 1; p <= 9; p++) {
                    if (!enemyPosSet.has(p)) {
                        song.pos = p; song._originalPos = p; enemyPosSet.add(p);
                        break;
                    }
                }
            }
        }
        const otherElites = eliteUnits.filter(u => u !== zhou && u !== song && u.pos == null);
        for (let u of otherElites) {
            emptySlots = [1,2,3,4,5,6,7,8,9].filter(p => !enemyPosSet.has(p));
            if (emptySlots.length > 0) {
                let idx = rand(0, emptySlots.length - 1);
                u.pos = emptySlots[idx]; u._originalPos = u.pos; enemyPosSet.add(emptySlots[idx]);
            }
        }
        enemyTeam = allUnits;
    }

    snapshot.ally = allyTeam.map(u => Object.freeze(u.clone())); snapshot.enemy = enemyTeam.map(u => Object.freeze(u.clone()));
    UI.allyTeam = allyTeam.map(u => u.clone()); UI.enemyTeam = enemyTeam.map(u => u.clone());
    UI.currentResult = null; UI.round = 0;
    window._battleHasZhang = allyTeam.some(u => u.isZhang);
    window._lastBattleSeed = Date.now();
    let stageText = currentStage === 1 ? '第一关' : `第${currentStage}关`;
    document.getElementById('labelEnemy').textContent = `六大派\n${stageText}`;
    document.getElementById('labelAlly').textContent = '明 教';
    updateUI(UI);
}

// ==================== Buff 选择 ====================
export function generateBuffChoices(activeBuffs) {
    let activeBuffKeys = activeBuffs.map(b => b.key);
    let available = ALL_BUFF_KEYS.filter(k => !activeBuffKeys.includes(k));
    let shuffled = [...available].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, C.BUFF_CHOICES);
}

    showModal(text, buttons, (key) => {
        activeBuffs = activeBuffs.map(b => ({...b, remaining: b.remaining + 1}));
        let duration = C.BUFFS[key].duration || C.BUFF_DURATION;
        if (activeBuffs.length >= 2) {
            let shortest = activeBuffs.reduce((a, b) => a.remaining < b.remaining ? a : b);
            activeBuffs.splice(activeBuffs.indexOf(shortest), 1);
        }
        // ★ 圣火令初始化：携带随机生效行列
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