// 13main-5v5-test.js - 光明顶对战 5v5 主控模块 (V3.0 定制阵容)
// 0625 10:29 kimi: 暴露 window.selectStage/window.forceStopGame/window.doManualReset 供 test runner 调用
// 预估行数: 680, 发送时间: 20260621 08:15, 版本: V3.0.2
// 联动: 修复 doInitBattle 站位初始化值，确保数据驱动视图
export const VER = '13main-5v5-test.js V3.0.2';

import '../modules/24error-capture.js';
import { CONFIG, STATE, KILL_TAUNT, ENEMY_M, VER as CFG_VER } from '../core/01config-5v5-test.js';
import { Unit, rand, runBattle, getRandomTaunt, getKillTaunt, getZhangNearTaunt, makeFXSnapshot, VER as BE_VER } from '../core/07battle-engine-5v5-test.js';
import { stripTags, renderGrid, updateUI, spawnVictoryEffects, clearLogExceptFirst, isUnitBenefitedByBuff, VER as UI_VER } from './14ui-render-5v5-test.js';
import { showDanmaku, showDamageFloat, showDodgeBubble, showHealFloat, VER as FX_VER } from '../fx/15fx-common-5v5-test.js';
import { showRangedArrow, VER as FA_VER } from '../fx/16fx-arrows-5v5-test.js';
import { showMeleeCrash, showMeleeDodge, showMeleeMiss, VER as FC_VER } from '../fx/17fx-crash-5v5-test.js';
import { playBattle, playLineText, clearAllEffects, handleBuffSummon, handleBuffDestroy, handleBuffLeech, handleBuffSplash, VER as BP_VER } from '../player/11battle-player-5v5-test.js';
import { showModal, showAlert, updateCoverVersion, startApp as loadModules } from './12main-utils.js';
import { AudioManager } from '../modules/28audio-manager.js';

import { VER as VER_BUFF } from '../core/04buff-system.js';
import { VER as VER_HORSE } from '../core/05battle-horse.js';
import { VER as VER_CORE } from '../core/06battle-engine-core.js';
import { VER as VER_PLAYER_CORE } from '../player/10player-core.js';
import { VER as VER_UNIT } from '../core/02unit.js';
import { VER as VER_UTILS } from '../core/03battle-utils.js';
import { VER as VER_TEXT } from '../player/08player-text.js';
import { VER as VER_BUFF_UI } from '../player/09player-buff-ui.js';
import { VER as VER_MAIN_UTILS } from './12main-utils.js';

const C = CONFIG, S = STATE, KT = KILL_TAUNT;

const FILE_VER = '13main-5v5-test.js V3.0.1';
const INDEX_VER = 'mode-5v5-test.html test V3.0';
const LOG_LINE1 = '⚔️ 光明顶5v5对决 · 九宫格混战模式 ⚔️';
const PARTY_SIZE = 5;

let gs = S.IDLE, autoMode = true, debugMode = false, isPaused = false, speed = 1000, userScrolled = false;
let abortController = null, waitingForNextRound = false, detailMode = true;
let battleResultForInfo = null, resettleCount = 0;
let gameStarted = false;
let hasLoggedTeam = false;
let manualSpeedLock = false, manualSpeedValue = null, slideSpeedActive = false;
window.bulletTimeActive = false;
let isBattleStarting = false;
let adjustMode = false;
let selectedAdjustPos = null;
let currentStage = 1;
window._crashMode = 'fly';
let dodgeEffectEnabled = true;
let selectedBuffIndex = -1;
let currentDoubleStrikeUid = null;

window._voteScore = parseInt(localStorage.getItem('ming_vote_score_5v5_test') || '10');
window._voteChoice = null; window._battleHasZhang = false; window._debugMode = false;

let activeBuffs = [];
let snapshot = { ally: [], enemy: [] };
let UI = { allyTeam: [], enemyTeam: [], currentResult: null, round: 0, lastSnapshot: null };

const TRASH_TALK_ALLY = ['明教必胜！六大派受死！','光明顶，我守定了！','六大派也不过如此！','来战！明教弟子，何惧！','今日便让尔等见识魔教之威！'];
const TRASH_TALK_ENEMY = ['魔教余孽，今日必灭！','少林武当，放马过来！','邪魔歪道，不足为惧！','今日便要踏平光明顶！'];

const ALL_BUFF_KEYS = Object.keys(C.BUFFS);

// ==================== 音频管理 (由 28audio-manager.js 托管) ====================
function initBGM() { AudioManager.init(); }
function playBGM() { AudioManager.play(); }
function pauseBGM() { AudioManager.pause(); }
function setBGMVolume(v) { AudioManager.setVolume(v); }
function fadeBGMTo(targetVol, durationMs) { AudioManager.fadeTo(targetVol, durationMs); }
function toggleBGM() {
    AudioManager.cycleSource();
    updateBGMBtn();
}
function updateBGMBtn() {
    const btn = document.getElementById('btnBGM');
    if (btn) {
        const source = AudioManager.currentSource;
        btn.classList.toggle('active', AudioManager.enabled);
        if (source === 'network') btn.textContent = '🎵 网络';
        else if (source === 'local') btn.textContent = '🎵 本地';
        else btn.textContent = '🎵 静音';
    }
}

function debugLog(msg) { if (!debugMode) return; let logDiv = document.getElementById('log'); let wrapper = document.createElement('div'); wrapper.innerHTML = `<span class="debug">[调试] ${msg}</span><br>`; logDiv.appendChild(wrapper); logDiv.scrollTop = logDiv.scrollHeight; }

async function waitWhilePaused() { while (isPaused) { await new Promise(r => setTimeout(r, 100)); } }
function getPausedState() { return window._getPlayerContext ? window._getPlayerContext().isPaused : false; }

function generateBuffChoices() {
    let activeBuffKeys = activeBuffs.map(b => b.key);
    let available = ALL_BUFF_KEYS.filter(k => !activeBuffKeys.includes(k));
    let shuffled = [...available].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, C.BUFF_CHOICES);
}

function showBuffSelection(callback) {
    let choices = generateBuffChoices();
    let text = '选择 Buff（持续 ' + C.BUFF_DURATION + ' 回合）';
    let buttons = choices.map(key => {
        let buff = C.BUFFS[key];
        return { text: buff.icon + ' ' + buff.name + '\n' + buff.desc, value: key, cls: 'buff' };
    });
    showModal(text, buttons, (key) => {
        // 先回溯所有旧 Buff 的剩余回合，抵消 tickBuffDurations 的扣减
        activeBuffs = activeBuffs.map(b => ({...b, remaining: b.remaining + 1}));
        let duration = C.BUFFS[key].duration || C.BUFF_DURATION;
        // 海克斯槽位限制：最多同时持有2个，满时自动替换剩余最短的
        if (activeBuffs.length >= 2) {
            let shortest = activeBuffs.reduce((a, b) => a.remaining < b.remaining ? a : b);
            activeBuffs.splice(activeBuffs.indexOf(shortest), 1);
        }
        activeBuffs.push({ key: key, target: 'ally', remaining: duration, name: C.BUFFS[key].name });
        updateBuffSlots();
        let logDiv = document.getElementById('log');
        if (logDiv) { logDiv.innerHTML += `<span class="gold">✨ 获得Buff：${C.BUFFS[key].name}（持续${duration}回合）</span><br>`; autoScrollLog(); }
        if (window._updateGlowColors) window._updateGlowColors(selectedBuffIndex);
        callback();
    }, false);
}

function updateBuffSlots() {
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

function onBuffSlotClick(index) {
    if (index >= activeBuffs.length) return;
    if (selectedBuffIndex === index) { selectedBuffIndex = -1; }
    else { selectedBuffIndex = index; }
    updateBuffSlots();
    updateUI(UI);
    if (window._updateGlowColors) window._updateGlowColors(selectedBuffIndex);
}

function toggleDodgeEffect() {
    dodgeEffectEnabled = !dodgeEffectEnabled;
    let btn = document.getElementById('btnDodgeToggle');
    if (btn) {
        btn.classList.toggle('active', dodgeEffectEnabled);
        btn.textContent = dodgeEffectEnabled ? '华丽' : '简单';
    }
}

function tickBuffDurations() {
    activeBuffs = activeBuffs.map(b => ({...b, remaining: b.remaining - 1})).filter(b => b.remaining > 0);
    if (selectedBuffIndex >= activeBuffs.length) selectedBuffIndex = -1;
    updateBuffSlots();
}

function getActiveBuffList() {
    return activeBuffs.map(b => b.name + '(' + b.remaining + '回)').join('、') || '无';
}

function initGlowSystem() {
    const battlefield = document.getElementById('battlefield');
    const canvas = document.getElementById('glowCanvas');
    if (!battlefield || !canvas) return;
    const ctx = canvas.getContext('2d');
    let cellsLightData = [];
    let lightsOn = false;
    let currentLightColor = '#d2691e';
    const globalSpeed = 0.9;
    const globalLightLength = 0.25;
    const globalWave = 7.5;
    const globalGlow = 4;
    function hexToRgb(hex) { const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 255, g: 255, b: 255 }; }
    function resizeCanvas() { const rect = battlefield.getBoundingClientRect(); canvas.width = rect.width; canvas.height = rect.height; }
    function collectCellsData() {
        let buffKey = (selectedBuffIndex >= 0 && selectedBuffIndex < activeBuffs.length) ? activeBuffs[selectedBuffIndex].key : null;
        const allCells = document.querySelectorAll('#allyGrid .cell.occupied');
        const battlefieldRect = battlefield.getBoundingClientRect();
        cellsLightData = [];
        allCells.forEach(cell => {
            let pos = parseInt(cell.dataset.pos);
            if (isNaN(pos)) return;
            let unit = UI.allyTeam.find(u => u.pos === pos);
            if (!unit || !unit.alive) return;
            if (buffKey === 'doubleStrike' && unit.uid !== currentDoubleStrikeUid) return;
            if (buffKey && buffKey !== 'doubleStrike' && !isUnitBenefitedByBuff(unit, buffKey, UI.allyTeam)) return;
            const rect = cell.getBoundingClientRect();
            cellsLightData.push({ cell, frame: { x: rect.left - battlefieldRect.left + 1, y: rect.top - battlefieldRect.top + 1, w: rect.width - 2, h: rect.height - 2, color: currentLightColor, rgb: hexToRgb(currentLightColor) }, lights: [] });
        });
        cellsLightData.forEach(data => { if (data.lights.length === 0) for (let i = 0; i < 3; i++) data.lights.push({ progress: i / 3 }); });
    }
    function getPointOnPath(frame, p) {
        const perimeter = 2 * (frame.w + frame.h); p = ((p % 1) + 1) % 1; const dist = p * perimeter;
        if (dist <= frame.w) return { x: frame.x + dist, y: frame.y };
        else if (dist <= frame.w + frame.h) return { x: frame.x + frame.w, y: frame.y + (dist - frame.w) };
        else if (dist <= 2 * frame.w + frame.h) return { x: frame.x + frame.w - (dist - frame.w - frame.h), y: frame.y + frame.h };
        else return { x: frame.x, y: frame.y + frame.h - (dist - 2 * frame.w - frame.h) };
    }
    function drawLight(data, time) {
        const { frame, lights, cell } = data;
        lights.forEach(light => {
            light.progress = ((light.progress + globalSpeed * 0.003) % 1 + 1) % 1;
            const center = (light.progress + globalLightLength / 2) % 1;
            const start = light.progress;
            const end = (light.progress + globalLightLength) % 1;
            if (start > end) {
                drawLightSegment(frame, start, 1, light, ctx);
                drawLightSegment(frame, 0, end, light, ctx);
            } else {
                drawLightSegment(frame, start, end, light, ctx);
            }
        });
    }
    function drawLightSegment(frame, from, to, light, ctx) {
        const steps = 20;
        for (let i = 0; i < steps; i++) {
            const t = from + (to - from) * (i / steps);
            const pt = getPointOnPath(frame, t);
            const alpha = Math.sin((i / steps) * Math.PI) * 0.9;
            const dist = globalWave;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, globalGlow, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${frame.rgb.r},${frame.rgb.g},${frame.rgb.b},${alpha})`;
            ctx.shadowColor = `rgba(${frame.rgb.r},${frame.rgb.g},${frame.rgb.b},0.8)`;
            ctx.shadowBlur = globalWave;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
    let lastTime = 0;
    function animate(time) {
        if (!lightsOn) { requestAnimationFrame(animate); return; }
        if (!lastTime) lastTime = time;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        cellsLightData.forEach(data => { drawLight(data, time); });
        lastTime = time;
        requestAnimationFrame(animate);
    }
    resizeCanvas(); collectCellsData(); requestAnimationFrame(animate);
    window.addEventListener('resize', () => { resizeCanvas(); collectCellsData(); });
    window._updateGlowColors = (buffIndex) => {
        if (buffIndex >= 0 && buffIndex < activeBuffs.length) {
            lightsOn = true;
            currentLightColor = activeBuffs[buffIndex].color || '#d2691e';
            collectCellsData();
        } else {
            lightsOn = false;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    };
    window._refreshGlowCells = () => { if (lightsOn) collectCellsData(); };
}

function doInitBattle() {
    let allyTeam = [], enemyTeam = [];
    const mingSquad = C.MING_SQUADS && C.MING_SQUADS[currentStage] ? C.MING_SQUADS[currentStage] : null;
    const enemySquad = C.ENEMY_SQUADS && C.ENEMY_SQUADS[currentStage] ? C.ENEMY_SQUADS[currentStage] : null;
    
    // --- 生成明教单位 ---
    let mingConfig;
    if (mingSquad) {
        if (currentStage === 1 && Array.isArray(mingSquad[0])) {
            mingConfig = mingSquad[rand(0, mingSquad.length - 1)];
        } else {
            mingConfig = mingSquad;
        }
        // 确保 mingConfig 是数组
        if (!Array.isArray(mingConfig)) {
            mingConfig = [mingConfig];
        }
        let takenPos = new Set();
        for (let item of mingConfig) {
            let name, mVal;
            if (typeof item === 'string') {
                name = item;
                mVal = C.MING_M[name] || 95;
            } else {
                mVal = item;
                // 明教弟子统一用带编号的格式
                if (mVal === 95) {
                    const existingDisciples = allyTeam.filter(u => u.name && u.name.startsWith('明教弟子'));
                    name = '明教弟子' + (existingDisciples.length + 1);
                } else {
                    // 按 M 值查找名字，排除已使用的
                    const usedNames = allyTeam.map(u => u.name);
                    const candidates = Object.entries(C.MING_M).filter(([n, v]) => v === mVal && !usedNames.includes(n));
                    if (candidates.length > 0) {
                        name = candidates[rand(0, candidates.length - 1)][0];
                    } else {
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
            unit.pos = null; // 修复：改为 null，让兜底逻辑能正确识别
            unit.init(); unit.applyBonus();
            allyTeam.push(unit);
        }
        // 明教站位分配：张无忌5，韦一笑6，另一人2，其余随机
        let zhang = allyTeam.find(u => u.isZhang);
        let wei = allyTeam.find(u => u.isWei);
        if (zhang) { zhang.pos = 5; takenPos.add(5); }
        if (wei) { wei.pos = 6; takenPos.add(6); }
        let others = allyTeam.filter(u => !u.isZhang && !u.isWei);
        if (others.length > 0 && zhang && !takenPos.has(2)) {
            others[0].pos = 2;
            takenPos.add(2);
            others.shift();
        }
        // 分配剩余站位
        let remainingSlots = [1,2,3,4,5,6,7,8,9].filter(p => !takenPos.has(p));
        for (let u of others) {
            if (remainingSlots.length > 0) {
                let idx = rand(0, remainingSlots.length - 1);
                u.pos = remainingSlots[idx];
                takenPos.add(remainingSlots[idx]);
                remainingSlots.splice(idx, 1);
            } else { u.pos = 5; }
        }
        // 站位分配完毕后，统一标记所有单位为 unfixed，再随机锁三个
        allyTeam.forEach(u => { u.fixed = false; });
        let toLock = [zhang, wei].filter(Boolean);
        while (toLock.length < 3) {
            let pool = allyTeam.filter(u => !toLock.includes(u));
            if (pool.length === 0) break;
            let pick = pool[rand(0, pool.length - 1)];
            toLock.push(pick);
        }
        toLock.forEach(u => { u.fixed = true; });

    }
    
    // --- 生成六大派单位 ---
    let enemyUnits = [];
    if (enemySquad) {
        let enemyPosSet = new Set();
        for (let item of enemySquad) {
            if (typeof item === 'object' && item.name) {
                let unit = new Unit(item.name, item.m, item.role, 'enemy');
                unit.pos = null; // 修复：改为 null
                unit.init(); unit.applyBonus();
                enemyUnits.push(unit);
            } else {
                let mVal = item;
                let pool = Object.entries(ENEMY_M).filter(([n, v]) => v === mVal);
                let usedNames = enemyUnits.map(u => u.name);
                let name = null;
                const squadDefs = Object.values(C.ENEMY_SQUADS).flat();
                for (let def of squadDefs) {
                    if (typeof def === 'object' && def.m === mVal && !usedNames.includes(def.name)) {
                        name = def.name;
                        break;
                    }
                }
                if (!name && pool.length > 0) {
                    let attempts = 0;
                    while ((!name || usedNames.includes(name)) && attempts < 50) {
                        let pick = pool[rand(0, pool.length - 1)];
                        name = pick[0];
                        attempts++;
                    }
                }
                if (!name) name = '六大派弟子';
                let role = C.ROLES[rand(0, 3)];
                let unit = new Unit(name, mVal, role, 'enemy');
                unit.pos = null; // 修复：改为 null
                unit.init(); unit.applyBonus();
                enemyUnits.push(unit);
            }
        }

        // 站位分配
        let template = C.ENEMY_POS_TEMPLATES && C.ENEMY_POS_TEMPLATES[currentStage] ? C.ENEMY_POS_TEMPLATES[currentStage] : null;
        let allUnits = [...enemyUnits]; // 拷贝一份用于兜底

        if (template) {
            for (let [role, poses] of Object.entries(template)) {
                if (role === 'random') continue;
                for (let pos of poses) {
                    let unit = allUnits.find(u => u.role === role && u.pos == null);
                    if (unit && !enemyPosSet.has(pos)) {
                        unit.pos = pos; unit._originalPos = pos;
                        enemyPosSet.add(pos);
                    }
                }
            }
        }

        // 最终兜底：对所有还没有位置的单位，按顺序分配空余位置
        let unplaced = allUnits.filter(u => u.pos == null);
        let emptySlots = [1,2,3,4,5,6,7,8,9].filter(p => !enemyPosSet.has(p));
        for (let u of unplaced) {
            if (emptySlots.length > 0) {
                let idx = rand(0, emptySlots.length - 1);
                u.pos = emptySlots[idx]; u._originalPos = u.pos;
                enemyPosSet.add(emptySlots[idx]);
                emptySlots.splice(idx, 1);
            }
        }

        enemyTeam = allUnits;
    }

    snapshot.ally = allyTeam.map(u => Object.freeze(u.clone())); snapshot.enemy = enemyTeam.map(u => Object.freeze(u.clone()));
    UI.allyTeam = allyTeam.map(u => u.clone()); UI.enemyTeam = enemyTeam.map(u => u.clone());
    UI.currentResult = null; UI.round = 0; battleResultForInfo = null;
    window._battleHasZhang = allyTeam.some(u => u.isZhang);
    resettleCount = 0; hasLoggedTeam = false;
    adjustMode = false; selectedAdjustPos = null;
    activeBuffs = []; selectedBuffIndex = -1; currentDoubleStrikeUid = null; updateBuffSlots();
    window._lastBattleSeed = Date.now();
    let stageText = currentStage === 1 ? '第一关' : `第${currentStage}关`;
    document.getElementById('labelEnemy').textContent = `六大派\n${stageText}`;
    document.getElementById('labelAlly').textContent = '明 教';
    
    updateUI(UI);
}

function updateScoreBadge() { document.getElementById('scoreBadge').textContent = `🏆 ${window._voteScore}分`; }
function lowerBGM() { setBGMVolume(0.3); }
function onAnyButtonClick() { if (!gameStarted) return; if (AudioManager.enabled && AudioManager.audio && AudioManager.audio.volume > 0.3) lowerBGM(); }
function autoScrollLog() { if (userScrolled) return; let logDiv = document.getElementById('log'); if (logDiv) logDiv.scrollTop = logDiv.scrollHeight; }
function onLogUserScroll() { let logDiv = document.getElementById('log'); if (!logDiv) return; let threshold = 2; let distToBottom = logDiv.scrollHeight - logDiv.scrollTop - logDiv.clientHeight; userScrolled = distToBottom > threshold; }

function logTeamInfo(label) {
    let ally = UI.allyTeam, enemy = UI.enemyTeam; if (!ally.length || !enemy.length) return;
    let logDiv = document.getElementById('log'); let appendDiv = (html) => { let d = document.createElement('div'); d.innerHTML = html + '<br>'; logDiv.appendChild(d); };
    let lbl = label || '阵容详情', contextNote = '';
    if (gs===S.RUNNING||gs===S.PAUSED) contextNote = `（当前：第${UI.round||'?'}回合${gs===S.PAUSED?' 已暂停':''}）`;
    else if (gs===S.GAMEOVER) contextNote = '（当前：战斗已结束）'; else contextNote = '（当前：准备阶段）';
    appendDiv(`<div class="separator">📋 ${lbl} ${contextNote}</div>`);
    appendDiv(`<span class="gold">[Buff: ${getActiveBuffList()}]</span>`);
    let hasStats = (gs===S.GAMEOVER&&battleResultForInfo)||gs===S.RUNNING||gs===S.PAUSED;
    [{name:'明教',color:'blue',data:ally},{name:'六大派',color:'orange',data:enemy}].forEach(camp=>{appendDiv(`<span class="${camp.color}">【${camp.name}】</span>`);camp.data.forEach(u=>{let aliveText=u.alive?'存活':'💀阵亡',infoParts=[];
        let displayPos = u.pos === -1 ? (u._originalPos || '?') : u.pos;
        infoParts.push(`${u.name}(${u.role} M${u.m})`);
        if(u.isHorse) infoParts.push('[拒马]');
        infoParts.push(`站位${displayPos}`);
        infoParts.push(`攻${Math.floor(u.atk)} 防${Math.floor(u.def)}`);
        infoParts.push(`血${Math.floor(u.hp)}/${Math.floor(u.maxHp)}`);
        infoParts.push(aliveText);
        if(u.isZhang)infoParts.push('[无忌]'); if(u.isWei)infoParts.push('[韦一笑]');
        let statParts=[];
        if(hasStats){ if(u.dmgDealt !== undefined && u.dmgDealt > 0) statParts.push(`输出${u.dmgDealt}`); if(u.dmgTaken !== undefined && u.dmgTaken > 0) statParts.push(`承伤${u.dmgTaken}`); }
        if(u.dodgeCount > 0) statParts.push(`闪避${u.dodgeCount}次`); if(u.healDone > 0) statParts.push(`治疗${u.healDone}`);
        if(u.reboundDone > 0) statParts.push(`反弹${u.reboundDone}`); if(u.leechDone > 0) statParts.push(`吸血${u.leechDone}`);
        if(u.critCount > 0) statParts.push(`暴击${u.critCount}次`); if(u.survivedRounds > 0) statParts.push(`存活${u.survivedRounds}回合`);
        appendDiv('  '+infoParts.join(' '));
        if(statParts.length>0) appendDiv('    └ '+statParts.join(' | '));
    });});logDiv.scrollTop=logDiv.scrollHeight;hasLoggedTeam=true;
}

function logVersions() {
    let logDiv=document.getElementById('log');
    let appendDiv=(html)=>{let d=document.createElement('div');d.innerHTML=html+'<br>';logDiv.appendChild(d);};
    appendDiv(`<span class="debug">[版本信息] ${INDEX_VER} | ${FILE_VER} | ${UI_VER||'ui-render 未上报'} | ${FX_VER||'fx-common 未上报'} | ${FA_VER||'fx-arrows 未上报'} | ${FC_VER||'fx-crash 未上报'} | ${BP_VER||'battle-player 未上报'} | ${BE_VER||'battle-engine 未上报'}</span>`);
    appendDiv(`<span class="debug">[子模块] ${VER_UNIT||'?'} | ${VER_UTILS||'?'} | ${VER_BUFF||'?'} | ${VER_HORSE||'?'} | ${VER_CORE||'?'} | ${VER_TEXT||'?'} | ${VER_BUFF_UI||'?'} | ${VER_PLAYER_CORE||'?'} | ${VER_MAIN_UTILS||'?'}</span>`);
    logDiv.scrollTop=logDiv.scrollHeight;
}

function showVoteDialog(callback) { let hasZhang=window._battleHasZhang||false,text='你看好哪边？'+(hasZhang?' (张无忌在场，猜对双倍积分!)':'');let mainBtn=document.getElementById('btnMain');if(mainBtn)mainBtn.disabled=true;showModal(text,[{text:'六大派',value:'六大派',cls:'enemy'},{text:'明教',value:'明教',cls:'ming'},{text:'放弃',value:'skip',cls:'skip'}],(choice)=>{window._voteChoice=choice;if(choice==='明教')document.getElementById('labelAlly').textContent='🚩明 教';else if(choice==='六大派')document.getElementById('labelEnemy').textContent='🚩六大派';if(callback)callback(choice);},false); }
function abortAll() { if (abortController) { abortController.abort(); abortController = null; } UI.currentResult = null; waitingForNextRound = false; isBattleStarting = false; adjustMode = false; selectedAdjustPos = null; activeBuffs = []; selectedBuffIndex = -1; currentDoubleStrikeUid = null; updateBuffSlots(); }

function updateButtons() { let mainBtn=document.getElementById('btnMain'),nextBtn=document.getElementById('btnNext'),settleBtn=document.getElementById('btnSettle'),pauseBtn=document.getElementById('btnPause'),randomBtn=document.getElementById('btnRandom'),stageBtn=document.getElementById('btnStageSelect'),infoBtn=document.getElementById('btnInfo'),copyBtn=document.getElementById('copyLog');if(gs===S.IDLE){mainBtn.innerHTML=adjustMode?'▶ 开始<br><span style="font-size:8px;">(投票)</span>':'🔄 调整<br>站位';mainBtn.disabled=false;nextBtn.disabled=true;if(adjustMode){if(stageBtn)stageBtn.disabled=true;if(randomBtn)randomBtn.disabled=true;if(infoBtn)infoBtn.disabled=true;if(copyBtn)copyBtn.disabled=true;}else{if(stageBtn)stageBtn.disabled=false;if(randomBtn)randomBtn.disabled=false;if(infoBtn)infoBtn.disabled=false;if(copyBtn)copyBtn.disabled=false;}}else if(gs===S.GAMEOVER){mainBtn.innerHTML=currentStage>=6?'🔄 重新<br>开始':'▶ 下一关';mainBtn.disabled=false;nextBtn.disabled=true;}else{mainBtn.disabled=true;}if(gs===S.RUNNING||gs===S.PAUSED){settleBtn.textContent='⏭ 直接结算';settleBtn.disabled=false;}else if(gs===S.GAMEOVER){settleBtn.textContent='🔄 重新结算';settleBtn.disabled=false;}else{settleBtn.disabled=true;}if(window.bulletTimeActive){pauseBtn.textContent='⏸️ 暂停';pauseBtn.disabled=true;pauseBtn.classList.remove('active');nextBtn.disabled=true;if(stageBtn)stageBtn.disabled=true;if(randomBtn)randomBtn.disabled=true;}else if(gs===S.RUNNING){pauseBtn.textContent='⏸️ 暂停';pauseBtn.disabled=false;pauseBtn.classList.remove('active');}else if(gs===S.PAUSED){pauseBtn.textContent='▶ 继续';pauseBtn.disabled=false;pauseBtn.classList.add('active');}else{pauseBtn.disabled=true;pauseBtn.classList.remove('active');} }
function enableAllButtons() { document.querySelectorAll('.controls button').forEach(b => b.disabled = false); updateButtons(); }
function updateDebugUI() { let panel=document.getElementById('debugPanel');if(debugMode){if(panel)panel.style.display='flex';}else{if(panel)panel.style.display='none';} }

function updateSpeedButtons() {
    let sp2=document.getElementById('btnSpeed2'), sp05=document.getElementById('btnSpeed05');
    let sp7x=document.getElementById('btnSpeed7x'), sp4x=document.getElementById('btnSpeed4x');
    let sp2x=document.getElementById('btnSpeed2x'), sp05x=document.getElementById('btnSpeed05x');
    let grpH = document.getElementById('speedGroupHigh'), grpL = document.getElementById('speedGroupLow');
    if (debugMode) {
        if(sp2) sp2.style.display='none'; if(sp05) sp05.style.display='none';
        if(grpH) grpH.style.display='flex'; if(grpL) grpL.style.display='flex';
        [sp7x, sp4x, sp2x, sp05x].forEach(b=>{
            if(!b) return;
            let sv=parseInt(b.dataset.speed);
            b.classList.remove('active', 'semi-active');
            if (sv === speed) b.classList.add('active');
            else if (manualSpeedLock && sv === manualSpeedValue && !slideSpeedActive) b.classList.add('semi-active');
        });
        if (!slideSpeedActive && manualSpeedLock && sp05x) sp05x.classList.add('active');
    } else {
        if(sp2) sp2.style.display=''; if(sp05) sp05.style.display='';
        if(grpH) grpH.style.display='none'; if(grpL) grpL.style.display='none';
        if(sp2) sp2.classList.remove('active', 'semi-active');
        if(sp05) sp05.classList.remove('active', 'semi-active');
        if (speed === 500) sp2.classList.add('active');
        else if (speed === 1800) sp05.classList.add('active');
        if (!slideSpeedActive && manualSpeedLock && manualSpeedValue !== speed) {
            if (manualSpeedValue === 500) sp2.classList.add('semi-active');
            else if (manualSpeedValue === 1800) sp05.classList.add('semi-active');
        }
    }
}

async function showCountdown() { let nums=['3','2','1']; let mainBtn=document.getElementById('btnMain'); mainBtn.disabled=true; updateButtons(); for(let i=0;i<nums.length;i++){let div=document.createElement('div');div.className='countdown-num';div.textContent=nums[i];document.body.appendChild(div);await new Promise(r=>setTimeout(r,700));if(div.parentNode)div.parentNode.removeChild(div);if(i===0){let t=TRASH_TALK_ALLY[rand(0,TRASH_TALK_ALLY.length-1)];showDanmaku({camp:'ally',pos:5},t);let l=document.getElementById('log');let d=document.createElement('div');d.innerHTML=`<span class="blue">🗯️ 明教：${t}</span><br>`;l.appendChild(d);autoScrollLog();}if(i===1){let t=TRASH_TALK_ENEMY[rand(0,TRASH_TALK_ENEMY.length-1)];showDanmaku({camp:'enemy',pos:5},t);let l=document.getElementById('log');let d=document.createElement('div');d.innerHTML=`<span class="orange">🗯️ 六大派：${t}</span><br>`;l.appendChild(d);autoScrollLog();}await new Promise(r=>setTimeout(r,500));} }

function _triggerFX(fxSnapshot, unitA, unitD, isDead, isDodge, isMiss, isBlock, dmg, waveTaunt, waveUnit, attackerRole) {
    if(!detailMode)return;
    if(waveTaunt&&waveUnit&&!isBlock&&!isMiss&&!isDodge){showDanmaku(waveUnit,waveTaunt);}else if(isDead&&unitA&&!isBlock&&!isMiss&&!isDodge){let killTaunt=getKillTaunt(unitA,KT);showDanmaku(unitA,killTaunt);}
    if(unitA&&unitD){ if(attackerRole==='远程'&&!isBlock&&!isMiss&&!isDodge){showRangedArrow(unitA,unitD,speed,getPausedState);}else if(!isBlock){ if(isDodge){if(!dodgeEffectEnabled){showMeleeDodge(unitA,unitD,speed,getPausedState);}}else if(isMiss){showMeleeMiss(unitA,unitD,speed,getPausedState);}else{showMeleeCrash(unitA,unitD,speed,getPausedState, () => { if (isDead && unitD) { unitD._flash = 'dead'; updateUI(UI); } });} } }
    if(unitD&&dmg!==undefined&&!isBlock&&!isMiss&&!isDodge){showDamageFloat(unitD,dmg);}
    if(isDodge&&unitD&&unitA){let reboundDmg=Math.floor((unitD.atk+unitD.def)*0.5);showDamageFloat(unitA,reboundDmg);}
}

function swapAllyPositions(posA, posB) {
    let unitA = UI.allyTeam.find(u => u.pos === posA); let unitB = UI.allyTeam.find(u => u.pos === posB);
    if (unitA && unitA.fixed) return; if (unitB && unitB.fixed) return;
    let zhang = UI.allyTeam.find(u => u.isZhang);
    if (zhang && zhang.pos === 5) {
        let tempMap = {}; UI.allyTeam.forEach(u => { if (u.alive || u._isDead) tempMap[u.pos] = u; });
        if (unitA) tempMap[posB] = unitA; if (unitB) tempMap[posA] = unitB;
        if (unitA && !unitB) delete tempMap[posA]; if (!unitA && unitB) delete tempMap[posB];
        if (!tempMap[2] || !tempMap[2].alive) {
            let zhangUnit = UI.allyTeam.find(u => u.isZhang && u.pos === 5);
            if (zhangUnit) { let zhangCell = document.querySelector(`#allyGrid .cell[data-pos="5"]`); if (zhangCell) { zhangCell.classList.add('cell-protected'); setTimeout(() => zhangCell.classList.remove('cell-protected'), 600); } showDanmaku(zhangUnit, '前方不可无人！'); }
            return;
        }
    }
    if (unitA) unitA.pos = posB; if (unitB) unitB.pos = posA;
    updateUI(UI);
}

function getPlayerContext() {
    return {
        get speed() { return speed; }, set speed(v) { speed = v; },
        get gs() { return gs; }, set gs(v) { gs = v; },
        get isPaused() { return isPaused; }, set isPaused(v) { isPaused = v; },
        get waitingForNextRound() { return waitingForNextRound; }, set waitingForNextRound(v) { waitingForNextRound = v; },
        get detailMode() { return detailMode; },
        get userScrolled() { return userScrolled; }, set userScrolled(v) { userScrolled = v; },
        get abortController() { return abortController; }, set abortController(v) { abortController = v; },
        get snapshot() { return snapshot; },
        get UI() { return UI; },
        get autoMode() { return autoMode; }, set autoMode(v) { autoMode = v; },
        get manualSpeedLock() { return manualSpeedLock; },
        get manualSpeedValue() { return manualSpeedValue; },
        get slideSpeedActive() { return slideSpeedActive; }, set slideSpeedActive(v) { slideSpeedActive = v; },
        get battleResultForInfo() { return battleResultForInfo; }, set battleResultForInfo(v) { battleResultForInfo = v; },
        get isBattleStarting() { return isBattleStarting; }, set isBattleStarting(v) { isBattleStarting = v; },
        get adjustMode() { return adjustMode; },
        get selectedAdjustPos() { return selectedAdjustPos; },
        get currentStage() { return currentStage; }, set currentStage(v) { currentStage = v; },
        get activeBuffs() { return activeBuffs; },
        set activeBuffs(v) { activeBuffs = v; updateBuffSlots(); },
        updateBuffSlots,
        get selectedBuffIndex() { return selectedBuffIndex; }, set selectedBuffIndex(v) { selectedBuffIndex = v; },
        get currentDoubleStrikeUid() { return currentDoubleStrikeUid; }, set currentDoubleStrikeUid(v) { currentDoubleStrikeUid = v; },
        get dodgeEffectEnabled() { return dodgeEffectEnabled; }, set dodgeEffectEnabled(v) { dodgeEffectEnabled = v; },
        fadeBGMTo, waitWhilePaused, updateUI, updateScoreBadge,
        spawnVictoryEffects, updateButtons, enableAllButtons, updateSpeedButtons,
        _triggerFX, playLineTextWrapper: playLineText,
        getZhangNearTaunt, KT, clearAllEffects, swapAllyPositions,
        tickBuffDurations, autoScrollLog, onLogUserScroll,
        get UI_VER() { return UI_VER; }, get BE_VER() { return BE_VER; },
        get CFG_VER() { return CFG_VER; }, get FX_VER() { return FX_VER; },
        get FA_VER() { return FA_VER; }, get FC_VER() { return FC_VER; },
        get BP_VER() { return BP_VER; }, get FILE_VER() { return FILE_VER; },
        get INDEX_VER() { return INDEX_VER; },
        get VER_BUFF() { return VER_BUFF; }, get VER_HORSE() { return VER_HORSE; },
        get VER_CORE() { return VER_CORE; }, get VER_PLAYER_CORE() { return VER_PLAYER_CORE; },
    };
}

window._getPlayerContext = getPlayerContext;

async function startApp() { try { await loadModules(updateCoverVersion); } catch(e) { console.error('startApp 加载模块失败:', e); } }
startApp();

document.addEventListener('DOMContentLoaded', function() {
    const controls = document.querySelector('.controls');
    if (controls) controls.style.zIndex = '100';
    const canvas = document.getElementById('glowCanvas');
    if (canvas) { canvas.style.zIndex = '1'; canvas.style.pointerEvents = 'none'; }

    document.getElementById('btnMain').addEventListener('click', async function(){
        onAnyButtonClick();
        if(gs===S.GAMEOVER){
            if(currentStage>=6){ currentStage=1; abortAll(); clearLogExceptFirst(); clearAllEffects(); hasLoggedTeam=false; doInitBattle(); updateUI(UI); gs=S.IDLE; isPaused=false; updateButtons(); enableAllButtons(); updateSpeedButtons(); if(window._refreshGlowCells)window._refreshGlowCells(); }
            else { currentStage++; abortAll(); clearLogExceptFirst(); clearAllEffects(); hasLoggedTeam=false; doInitBattle(); updateUI(UI); gs=S.IDLE; isPaused=false; updateButtons(); enableAllButtons(); updateSpeedButtons(); if(window._refreshGlowCells)window._refreshGlowCells(); }
        } else if(gs===S.IDLE&&!isBattleStarting){
            if(!adjustMode){ adjustMode=true; selectedAdjustPos=null; updateButtons(); updateUI(UI); if(window._refreshGlowCells)window._refreshGlowCells(); }
            else {
                adjustMode=false; selectedAdjustPos=null; isBattleStarting=true; updateButtons(); updateUI(UI);
                showVoteDialog(async(choice)=>{
                    clearLogExceptFirst(); hasLoggedTeam=false; fadeBGMTo(0.1,2000); logTeamInfo('初始阵容'); await showCountdown();
                    let logDiv=document.getElementById('log'); logDiv.innerHTML+='<div class="separator">⚔️ 5v5对决开始 ⚔️</div>';
                    autoScrollLog();
                    await new Promise(resolve => { showBuffSelection(() => resolve()); });
                    await new Promise(r=>setTimeout(r,600));
                    try {
                        gs=S.RUNNING; updateButtons(); document.getElementById('btnNext').disabled=true;
                        abortController=new AbortController();
                        snapshot.ally=UI.allyTeam.map(u=>Object.freeze(u.clone()));
                        // 最终保底：确保所有敌人在战斗开始前都有合法位置
                        let occupiedPositions = new Set(snapshot.ally.map(u => u.pos));
                        let freePositions = [1,2,3,4,5,6,7,8,9].filter(p => !occupiedPositions.has(p));
                        let enemyList = snapshot.enemy.map(u => u.clone());
                        for (let unit of enemyList) {
                            if (unit.pos === -1 || unit.pos == null) {
                                if (freePositions.length > 0) {
                                    unit.pos = freePositions[rand(0, freePositions.length - 1)];
                                    unit._originalPos = unit.pos;
                                    freePositions = freePositions.filter(p => p !== unit.pos);
                                } else {
                                    unit.pos = 1 + rand(0, 8);
                                    unit._originalPos = unit.pos;
                                }
                            }
                        }
                        snapshot.enemy = Object.freeze(enemyList.map(u => Object.freeze(u)));
                        // 同时更新 UI 中的敌人队伍，保证界面与快照一致
                        UI.enemyTeam = enemyList;
                        updateUI(UI);
                        UI.currentResult=runBattle(snapshot, activeBuffs);
                        if (UI.currentResult && UI.currentResult.doubleStrikeUids) {
                            currentDoubleStrikeUid = UI.currentResult.doubleStrikeUids[UI.currentResult.doubleStrikeUids.length - 1] || null;
                        }
                        await playBattle();
                    } catch (e) {
                        let logDiv=document.getElementById('log');
                        let errorDiv=document.createElement('div');
                        errorDiv.innerHTML=`<span class="red">❌ 战斗异常中断：${e.message || e}</span><br>`;
                        logDiv.appendChild(errorDiv);
                        logDiv.scrollTop=logDiv.scrollHeight;
                        console.error('战斗异常', e);
                    } finally {
                        abortController=null;
                    }
                    updateButtons();
                });
            }
        }
    });

    document.getElementById('btnNext').addEventListener('click',function(){onAnyButtonClick();waitingForNextRound=false;gs=S.RUNNING;updateButtons();});
    document.getElementById('btnSettle').addEventListener('click',async function(){ });
    document.getElementById('btnPause').addEventListener('click',function(){onAnyButtonClick();if(gs===S.RUNNING){gs=S.PAUSED;isPaused=true;}else if(gs===S.PAUSED){gs=S.RUNNING;isPaused=false;}updateButtons();});
    document.getElementById('btnAuto').addEventListener('click',function(){
        autoMode=!autoMode;this.classList.toggle('active',autoMode);this.textContent=autoMode?'自动':'手动';
        window._autoMode = autoMode;
        if(autoMode&&waitingForNextRound)waitingForNextRound=false;
    });
    document.getElementById('btnDetail').addEventListener('click',function(){
        detailMode=!detailMode;this.classList.toggle('active',detailMode);this.textContent=detailMode?'详细':'简要';
        let logDiv=document.getElementById('log');
        let scrollPos = logDiv.scrollTop;
        let totalBefore = logDiv.scrollHeight;
        if(!detailMode){document.querySelectorAll('#log .gray.small').forEach(el=>{if(el.parentElement)el.parentElement.classList.add('detail-hidden');});}
        else{document.querySelectorAll('#log .detail-hidden').forEach(el=>el.classList.remove('detail-hidden'));}
        let totalAfter = logDiv.scrollHeight;
        logDiv.scrollTop = scrollPos + (totalAfter - totalBefore);
    });
    document.getElementById('debugToggle').addEventListener('click',function(){onAnyButtonClick();debugMode=!debugMode;this.classList.toggle('active',debugMode);this.textContent='V3.0';window._debugMode=debugMode;updateSpeedButtons();updateDebugUI();updateUI(UI);if (debugMode) logVersions();});
    document.getElementById('copyLog').addEventListener('click',()=>{
        let logDiv=document.getElementById('log');
        let lines=[];
        logDiv.querySelectorAll('div').forEach(div=>{
            let t=div.textContent||'';
            if(t.trim()) lines.push(t.trim());
        });
        let text=lines.join('\n');
        if(!text.trim()){showAlert('日志为空');return;}
        navigator.clipboard.writeText(text).then(()=>showAlert('日志已复制')).catch(()=>{
            let ta=document.createElement('textarea');
            ta.value=text;
            ta.style.position='fixed';ta.style.left='-9999px';
            document.body.appendChild(ta);ta.select();
            document.execCommand('copy');document.body.removeChild(ta);
            showAlert('日志已复制');
        });
    });

    document.getElementById('btnInfo').addEventListener('click',()=>{let ally=UI.allyTeam,enemy=UI.enemyTeam;if(!ally.length){showAlert('无阵容信息');return;}logTeamInfo('阵容详情');});
    document.getElementById('btnBGM').addEventListener('click',()=>{toggleBGM();});
    document.getElementById('btnCrashMode').addEventListener('click',function(){window._crashMode=window._crashMode==='fly'?'ghost':'fly';this.textContent=window._crashMode==='fly'?'🕊️飞走':'👻虚影';});
    document.getElementById('btnDodgeToggle').addEventListener('click',()=>{toggleDodgeEffect();});
    document.getElementById('btnStageSelect').addEventListener('click',()=>{
        if(gs!==S.IDLE)return;
        openStageSelectModal();
    });

    function openStageSelectModal(){
        let buttons=[];
        for(let i=1;i<=6;i++){buttons.push({text:i===currentStage?`第${i}关 ◀`:`第${i}关`,value:i,cls:'buff'});}
        showModal('选择关卡',buttons,(stage)=>{
            if(stage===currentStage)return;
            switchToStageInternal(stage);
        },false);
    }

    function switchToStageInternal(stage){
        onAnyButtonClick();abortAll();clearLogExceptFirst();clearAllEffects();hasLoggedTeam=false;
        currentStage=stage;doInitBattle();updateUI(UI);gs=S.IDLE;updateButtons();enableAllButtons();
    }

    function forceStopGame(){
        if(!UI) return;
        abortAll();clearLogExceptFirst();clearAllEffects();hasLoggedTeam=false;
        gs=S.IDLE;isPaused=false;waitingForNextRound=false;isBattleStarting=false;
        updateButtons();enableAllButtons();updateSpeedButtons();
        try { updateUI(UI); } catch(e){}
    }

    function doManualReset(){
        activeBuffs=[];snapshot={ally:[],enemy:[]};currentDoubleStrikeUid=null;
        forceStopGame();
        doInitBattle();updateUI(UI);
        gs=S.IDLE;updateButtons();enableAllButtons();
    }

    window.selectStage = (stage)=>{
        if(stage===currentStage)return;
        forceStopGame();
        switchToStageInternal(stage);
    };
    window.forceStopGame = forceStopGame;
    window.doManualReset = doManualReset;
    window.getGameState = ()=>({ gs, currentStage, isPaused, isBattleStarting, allyCount:UI.allyTeam.length, enemyCount:UI.enemyTeam.length });

    for (let i = 0; i < 2; i++) { let slot = document.getElementById('buffSlot' + i); if (slot) slot.addEventListener('click', () => onBuffSlotClick(i)); }

    function setSpeed(val, lock) { speed = val; manualSpeedLock = lock; manualSpeedValue = lock ? val : null; slideSpeedActive = lock; updateSpeedButtons(); }
    function attachSpeedButton(id, speedVal) {
        let btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('click', function() {
            onAnyButtonClick();
            if (speed === speedVal) setSpeed(1000, false);
            else setSpeed(speedVal, true);
        });
    }
    attachSpeedButton('btnSpeed2', 500);
    attachSpeedButton('btnSpeed7x', 143);
    attachSpeedButton('btnSpeed4x', 250);
    attachSpeedButton('btnSpeed2x', 500);
    attachSpeedButton('btnSpeed05', 1800);
    attachSpeedButton('btnSpeed05x', 1800);

    document.getElementById('voteFloat').addEventListener('click',function(){let overlay=document.getElementById('voteModalOverlay');if(overlay){overlay.style.display='flex';this.style.display='none';}});
    var coverBtn = document.getElementById('coverStartBtn');
    if (coverBtn) {
        coverBtn.addEventListener('click',function(){
            var overlay = document.getElementById('coverOverlay');
            if (overlay) overlay.style.display='none';
            gameStarted=true;
            try { initBGM(); playBGM(); setBGMVolume(0.6); } catch(e) {}
            try { initGlowSystem(); } catch(e) { console.warn('光带特效初始化失败，已跳过', e); }
        });
    }
    document.getElementById('allyGrid').addEventListener('click', function(e) {
        if (!adjustMode) return;
        let cell = e.target.closest('.cell'); if (!cell) return;
        let pos = parseInt(cell.dataset.pos); if (isNaN(pos)) return;
        let unit = UI.allyTeam.find(u => u.pos === pos);
        if (unit && unit.fixed) { cell.classList.add('cell-blocked'); setTimeout(() => cell.classList.remove('cell-blocked'), 500); return; }
        if (selectedAdjustPos === null) { selectedAdjustPos = pos; }
        else { let targetUnit = UI.allyTeam.find(u => u.pos === pos); if (targetUnit && targetUnit.fixed) { cell.classList.add('cell-blocked'); setTimeout(() => cell.classList.remove('cell-blocked'), 500); selectedAdjustPos = null; updateUI(UI); return; } swapAllyPositions(selectedAdjustPos, pos); selectedAdjustPos = null; }
        updateUI(UI); if(window._refreshGlowCells)window._refreshGlowCells();
    });

    try {
        updateButtons(); updateSpeedButtons(); updateDebugUI(); doInitBattle(); updateUI(UI); updateScoreBadge();
        document.getElementById('log').innerHTML = '<div class="separator">' + LOG_LINE1 + '</div>';
        document.getElementById('btnDetail').classList.toggle('active', detailMode);
        document.getElementById('btnAuto').classList.toggle('active', autoMode);
        document.getElementById('btnDodgeToggle').classList.toggle('active', dodgeEffectEnabled);
        document.getElementById('btnDodgeToggle').textContent = dodgeEffectEnabled ? '华丽' : '简单';
        document.getElementById('btnCrashMode').textContent = window._crashMode === 'fly' ? '🕊️飞走' : '👻虚影';
    } catch(e) {
        console.error('[光明顶5v5测试版] 初始化错误：', e.stack || e.message || e);
    }
    // 页面可见性变化时暂停/恢复，防止后台切回时特效堆积
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (gs === S.RUNNING && !window.bulletTimeActive) { gs = S.PAUSED; isPaused = true; updateButtons(); }
        }
    });
});