// ui/13main-5v5-test.js - 光明顶5v5 主控模块
// V4.0.7 | ~32000 bytes | 2026-07-06 修复：UI/snapshot/adjustMode 状态统一到 39main-state
export const VER = 'ui/13main-5v5-test.js V4.0.7';

import '../modules/24error-capture.js';
import { CONFIG, STATE, KILL_TAUNT, ENEMY_M, VER as CFG_VER } from '../core/01config-5v5-test.js';
import { Unit, rand, runBattle, getRandomTaunt, getKillTaunt, getZhangNearTaunt, makeFXSnapshot, VER as BE_VER } from '../core/07battle-engine-5v5-test.js';
import { stripTags, renderGrid, updateUI, spawnVictoryEffects, clearLogExceptFirst, isUnitBenefitedByBuff, VER as UI_VER } from './14ui-render-5v5-test.js';
import { showDanmaku, showDamageFloat, showDodgeBubble, showHealFloat, VER as FX_VER } from '../fx/15fx-common-5v5-test.js';
import { showRangedArrow, VER as FA_VER } from '../fx/16fx-arrows-5v5-test.js';
import { showMeleeCrash, showMeleeDodge, showMeleeMiss, VER as FC_VER } from '../fx/17fx-crash-5v5-test.js';
import { playBattle, playLineText, clearAllEffects, handleBuffSummon, handleBuffDestroy, handleBuffLeech, VER as BP_VER } from '../player/11battle-player-5v5-test.js';
import { showModal, showAlert, updateCoverVersion } from './12main-utils.js';
import { AudioManager } from '../modules/28audio-manager.js';

// 拆分模块
import { getPlayerContext, getState, setState } from './39main-state.js';
import { showBattleReport, showMusicPanel, showVoteDialog, showCountdown } from './40main-dialogs.js';
import {
    doInitBattle, generateBuffChoices, showBuffSelection,
    updateBuffSlots, tickBuffDurations, getActiveBuffList,
    logTeamInfo, abortAll
} from './41main-battle.js';

import { VER as VER_BUFF } from '../core/04buff-system.js';
import { VER as VER_HORSE } from '../core/05battle-horse.js';
import { VER as VER_CORE } from '../core/06battle-engine-core.js';
import { VER as VER_PLAYER_CORE } from '../player/10player-core.js';
import { VER as VER_UNIT } from '../core/02unit.js';
import { VER as VER_UTILS } from '../core/03battle-utils.js';
import { VER as VER_TEXT } from '../player/08player-text.js';
import { VER as VER_BUFF_UI } from '../player/09player-buff-ui.js';
import { VER as VER_MAIN_UTILS } from './12main-utils.js';

import { runRuntimeSample } from '../tests/36runtime-sampler.js';

const C = CONFIG, S = STATE, KT = KILL_TAUNT;

const FILE_VER = '13main-5v5-test.js V4.0.7';
const INDEX_VER = 'mode-5v5-test.html test V3.0';
const LOG_LINE1 = '⚔️ 光明顶5v5对决 · 九宫格混战模式 ⚔️';

// ==================== 局部状态（尚未迁移到 39main-state 的部分） ====================
let gs = S.IDLE, autoMode = true, debugMode = false, speed = 500, userScrolled = false;
let abortController = null, waitingForNextRound = false, detailMode = true;
let battleResultForInfo = null, resettleCount = 0;
let gameStarted = false;
let hasLoggedTeam = false;
let manualSpeedLock = false, manualSpeedValue = null, slideSpeedActive = false;
window.bulletTimeActive = false;
let isBattleStarting = false;
let currentStage = 1;
window._crashMode = 'fly';
let dodgeEffectEnabled = true;
let selectedBuffIndex = -1;
let currentDoubleStrikeUid = null;
let runtimeMonitorActive = false;
let runtimeMonitorInterval = null;

window._voteScore = parseInt(localStorage.getItem('ming_vote_score_5v5_test') || '10');
window._voteChoice = null; window._battleHasZhang = false; window._debugMode = false;

let activeBuffs = [];

// UI 和 snapshot 已迁移到 39main-state.js，此处不再定义，通过 getState/setState 读写

const TRASH_TALK_ALLY = ['明教必胜！六大派受死！','光明顶，我守定了！','六大派也不过如此！','来战！明教弟子，何惧！','今日便让尔等见识魔教之威！'];
const TRASH_TALK_ENEMY = ['魔教余孽，今日必灭！','少林武当，放马过来！','邪魔歪道，不足为惧！','今日便要踏平光明顶！'];

const ALL_BUFF_KEYS = Object.keys(C.BUFFS);

// ==================== 音频管理 ====================
function initBGM() { AudioManager.init(); }
function playBGM() { AudioManager.play(); }
function pauseBGM() { AudioManager.pause(); }
function setBGMVolume(v) { AudioManager.setVolume(v); }
function fadeBGMTo(targetVol, durationMs) { AudioManager.fadeTo(targetVol, durationMs); }
function toggleBGM() { AudioManager.cycleSource(); updateBGMBtn(); }
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

async function waitWhilePaused() { while (getState.isPaused()) { await new Promise(r => setTimeout(r, 100)); } }
function getPausedState() { return window._getPlayerContext ? window._getPlayerContext().isPaused : false; }

// ==================== 辅助函数 ====================
function toggleDodgeEffect() {
    dodgeEffectEnabled = !dodgeEffectEnabled;
    let btn = document.getElementById('btnDodgeToggle');
    if (btn) {
        btn.classList.toggle('active', dodgeEffectEnabled);
        btn.textContent = dodgeEffectEnabled ? '华丽' : '简单';
    }
}

function updateScoreBadge() { document.getElementById('scoreBadge').textContent = `🏆 ${window._voteScore}分`; }
function lowerBGM() { setBGMVolume(0.3); }
function onAnyButtonClick() { if (!gameStarted) return; if (AudioManager.enabled && AudioManager.audio && AudioManager.audio.volume > 0.3) lowerBGM(); }
function autoScrollLog() { if (userScrolled) return; let logDiv = document.getElementById('log'); if (logDiv) logDiv.scrollTop = logDiv.scrollHeight; }
function onLogUserScroll() { let logDiv = document.getElementById('log'); if (!logDiv) return; let threshold = 10; let distToBottom = logDiv.scrollHeight - logDiv.scrollTop - logDiv.clientHeight; userScrolled = distToBottom > threshold; }

function initGlowSystem() {
    const battlefield = document.getElementById('battlefield');
    const canvas = document.getElementById('glowCanvas');
    if (!battlefield || !canvas) return;
    const ctx = canvas.getContext('2d');
    let cellsLightData = [];
    let currentLightColor = '#d2691e';
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
            let unit = getState.UI().allyTeam.find(u => u.pos === pos);
            if (!unit || !unit.alive) return;
            if (buffKey === 'doubleStrike' && unit.uid !== currentDoubleStrikeUid) return;
            if (buffKey && buffKey !== 'doubleStrike' && !isUnitBenefitedByBuff(unit, buffKey, getState.UI().allyTeam)) return;
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
    function drawLight(data, time) {}
    let lastTime = 0;
    function animate(time) {}
    resizeCanvas(); collectCellsData(); requestAnimationFrame(animate);
    window.addEventListener('resize', () => { resizeCanvas(); collectCellsData(); });
}

function updateButtons() {
    let mainBtn=document.getElementById('btnMain'),nextBtn=document.getElementById('btnNext'),settleBtn=document.getElementById('btnSettle'),pauseBtn=document.getElementById('btnPause'),randomBtn=document.getElementById('btnRandom'),stageBtn=document.getElementById('btnStageSelect'),infoBtn=document.getElementById('btnInfo'),copyBtn=document.getElementById('copyLog');
    if(gs===S.IDLE){mainBtn.innerHTML=getState.adjustMode()?'▶ 开始<br><span style="font-size:8px;">(投票)</span>':'🔄 调整<br>站位';mainBtn.disabled=false;nextBtn.disabled=true;if(getState.adjustMode()){if(stageBtn)stageBtn.disabled=true;if(randomBtn)randomBtn.disabled=true;if(infoBtn)infoBtn.disabled=true;if(copyBtn)copyBtn.disabled=true;}else{if(stageBtn)stageBtn.disabled=false;if(randomBtn)randomBtn.disabled=false;if(infoBtn)infoBtn.disabled=false;if(copyBtn)copyBtn.disabled=false;}}else if(gs===S.GAMEOVER){mainBtn.innerHTML=currentStage>=6?'🔄 重新<br>开始':'▶ 下一关';mainBtn.disabled=false;nextBtn.disabled=true;}else{mainBtn.disabled=true;}if(gs===S.RUNNING||gs===S.PAUSED){settleBtn.textContent='⏭ 直接结算';settleBtn.disabled=false;}else if(gs===S.GAMEOVER){settleBtn.textContent='🔄 重新结算';settleBtn.disabled=false;}else{settleBtn.disabled=true;}if(window.bulletTimeActive){pauseBtn.textContent='⏸️ 暂停';pauseBtn.disabled=true;pauseBtn.classList.remove('active');nextBtn.disabled=true;if(stageBtn)stageBtn.disabled=true;if(randomBtn)randomBtn.disabled=true;}else if(gs===S.RUNNING){pauseBtn.textContent='⏸️ 暂停';pauseBtn.disabled=false;pauseBtn.classList.remove('active');}else if(gs===S.PAUSED){pauseBtn.textContent='▶ 继续';pauseBtn.disabled=false;pauseBtn.classList.add('active');}else{pauseBtn.disabled=true;pauseBtn.classList.remove('active');}
}
window.updateButtons = updateButtons;
function enableAllButtons() { document.querySelectorAll('.controls button').forEach(b => b.disabled = false); updateButtons(); }
window.enableAllButtons = enableAllButtons;
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
    slideSpeedActive = true;
}
window.updateSpeedButtons = updateSpeedButtons;

function _triggerFX(fxSnapshot, unitA, unitD, isDead, isDodge, isMiss, isBlock, dmg, waveTaunt, waveUnit, attackerRole) {
    if(!detailMode)return;
    // 弹幕优先级：击杀台词 > 暴击台词 > 防御嘲讽 > 血量嘲讽 > 普通攻击台词
    if(isDead&&unitA&&!isBlock&&!isMiss&&!isDodge){
        let killTaunt=getKillTaunt(unitA,KT);
        setTimeout(() => showDanmaku(unitA,killTaunt), 0);
    } else if(waveTaunt&&waveUnit&&!isBlock&&!isMiss&&!isDodge){
        let delay = 0;
        if (dmg !== undefined && dmg >= 30) delay = 0;
        else if (dmg !== undefined && dmg >= 20) delay = 200;
        else delay = 400;
        setTimeout(() => showDanmaku(waveUnit,waveTaunt), delay);
    }
    if(unitA&&unitD){ if(attackerRole==='远程'&&!isBlock&&!isMiss&&!isDodge){showRangedArrow(unitA,unitD,speed,getPausedState);}else if(!isBlock){ if(isDodge){if(!dodgeEffectEnabled){showMeleeDodge(unitA,unitD,speed*2,getPausedState);}}else if(isMiss){showMeleeMiss(unitA,unitD,speed*2,getPausedState);}else{showMeleeCrash(unitA,unitD,speed,getPausedState, () => { if (isDead && unitD) { unitD._flash = 'dead'; updateUI(getState.UI()); } });} } }
    if(unitD&&dmg!==undefined&&!isBlock&&!isMiss&&!isDodge){showDamageFloat(unitD,dmg);}
    if(isDodge&&unitD&&unitA){let reboundDmg=Math.floor((unitD.atk+unitD.def)*0.5);showDamageFloat(unitA,reboundDmg);}
}
window._triggerFX = _triggerFX;

function swapAllyPositions(posA, posB) {
    const currentUI = getState.UI();
    let unitA = currentUI.allyTeam.find(u => u.pos === posA); let unitB = currentUI.allyTeam.find(u => u.pos === posB);
    if (unitA && unitA.fixed) return; if (unitB && unitB.fixed) return;
    let zhang = currentUI.allyTeam.find(u => u.isZhang);
    if (zhang && zhang.pos === 5) {
        let tempMap = {}; currentUI.allyTeam.forEach(u => { if (u.alive || u._isDead) tempMap[u.pos] = u; });
        if (unitA) tempMap[posB] = unitA; if (unitB) tempMap[posA] = unitB;
        if (unitA && !unitB) delete tempMap[posA]; if (!unitA && unitB) delete tempMap[posB];
        if (!tempMap[2] || !tempMap[2].alive) {
            let zhangUnit = currentUI.allyTeam.find(u => u.isZhang && u.pos === 5);
            if (zhangUnit) { let zhangCell = document.querySelector(`#allyGrid .cell[data-pos="5"]`); if (zhangCell) { zhangCell.classList.add('cell-protected'); setTimeout(() => zhangCell.classList.remove('cell-protected'), 600); } showDanmaku(zhangUnit, '前方不可无人！'); }
            return;
        }
    }
    if (unitA) unitA.pos = posB; if (unitB) unitB.pos = posA;
    updateUI(currentUI);
}
window._swapAllyPositions = swapAllyPositions;

// ==================== 版本日志 ====================
function logVersions() {
    let logDiv=document.getElementById('log');
    let appendDiv=(html)=>{let d=document.createElement('div');d.innerHTML=html+'<br>';logDiv.appendChild(d);};
    appendDiv(`<span class="debug">[版本信息] ${INDEX_VER} | ${FILE_VER} | ${UI_VER||'ui-render 未上报'} | ${FX_VER||'fx-common 未上报'} | ${FA_VER||'fx-arrows 未上报'} | ${FC_VER||'fx-crash 未上报'} | ${BP_VER||'battle-player 未上报'} | ${BE_VER||'battle-engine 未上报'}</span>`);
    appendDiv(`<span class="debug">[子模块] ${VER_UNIT||'?'} | ${VER_UTILS||'?'} | ${VER_BUFF||'?'} | ${VER_HORSE||'?'} | ${VER_CORE||'?'} | ${VER_TEXT||'?'} | ${VER_BUFF_UI||'?'} | ${VER_PLAYER_CORE||'?'} | ${VER_MAIN_UTILS||'?'}</span>`);
    logDiv.scrollTop=logDiv.scrollHeight;
}

// ==================== 运行时监控 ====================
function startRuntimeMonitor() {
    if (runtimeMonitorActive) return;
    runtimeMonitorActive = true;
    const logDiv = document.getElementById('log');
    let startDiv = document.createElement('div');
    startDiv.innerHTML = `<span class="gold">[体检] 静默监控已启动，每隔 5 秒自动采样</span><br>`;
    logDiv.appendChild(startDiv);
    autoScrollLog();
    runtimeMonitorInterval = setInterval(async () => {
        const ctx = getPlayerContext();
        if (!ctx || ctx.gs !== S.RUNNING) return;
        try {
            const result = await runRuntimeSample(ctx, 2);
            if (!result.passed) {
                let failDiv = document.createElement('div');
                failDiv.innerHTML = `<span class="red">[体检] 发现问题：</span><br>`;
                logDiv.appendChild(failDiv);
                result.failures.forEach(f => {
                    let lineDiv = document.createElement('div');
                    lineDiv.innerHTML = `<span class="red">  ❌ ${f.name} → ${f.fix || f.error}</span><br>`;
                    logDiv.appendChild(lineDiv);
                });
                autoScrollLog();
            }
        } catch (e) {}
    }, 5000);
}

function stopRuntimeMonitor() {
    runtimeMonitorActive = false;
    if (runtimeMonitorInterval) { clearInterval(runtimeMonitorInterval); runtimeMonitorInterval = null; }
    const logDiv = document.getElementById('log');
    logDiv.innerHTML += `<span class="gray">[体检] 静默监控已停止</span><br>`;
    autoScrollLog();
}

async function startApp() { updateCoverVersion(); }
startApp();

// ==================== DOM 初始化 ====================
document.addEventListener('DOMContentLoaded', function() {
    const controls = document.querySelector('.controls');
    if (controls) controls.style.zIndex = '100';
    const canvas = document.getElementById('glowCanvas');
    if (canvas) { canvas.style.zIndex = '1'; canvas.style.pointerEvents = 'none'; }

    // 初始化 UI 和 snapshot 到 39main-state，保持与 doInitBattle 之前的兼容
    if (!getState.UI().allyTeam.length) {
        setState.UI({ allyTeam: [], enemyTeam: [], currentResult: null, round: 0, lastSnapshot: null });
        setState.snapshot({ ally: [], enemy: [] });
    }

    document.getElementById('btnMain').addEventListener('click', async function(){
        onAnyButtonClick();
        if(gs===S.GAMEOVER){
            if(currentStage>=6){
                currentStage=1;
                let result = abortAll(abortController, getState.UI(), waitingForNextRound, isBattleStarting, getState.adjustMode(), getState.selectedAdjustPos(), activeBuffs, selectedBuffIndex, currentDoubleStrikeUid, () => updateBuffSlots(activeBuffs, selectedBuffIndex));
                abortController = result.abortController; waitingForNextRound = result.waitingForNextRound; isBattleStarting = result.isBattleStarting; setState.adjustMode(result.adjustMode); setState.selectedAdjustPos(result.selectedAdjustPos); activeBuffs = result.activeBuffs; selectedBuffIndex = result.selectedBuffIndex; currentDoubleStrikeUid = result.currentDoubleStrikeUid;
                clearLogExceptFirst(); clearAllEffects(); hasLoggedTeam=false;
                doInitBattle(currentStage, getState.UI(), getState.snapshot(), activeBuffs, selectedBuffIndex, currentDoubleStrikeUid);
                updateUI(getState.UI()); gs=S.IDLE; setState.isPaused(false); updateButtons(); enableAllButtons(); updateSpeedButtons(); if(window._refreshGlowCells)window._refreshGlowCells();
            } else {
                currentStage++;
                let result = abortAll(abortController, getState.UI(), waitingForNextRound, isBattleStarting, getState.adjustMode(), getState.selectedAdjustPos(), activeBuffs, selectedBuffIndex, currentDoubleStrikeUid, () => updateBuffSlots(activeBuffs, selectedBuffIndex));
                abortController = result.abortController; waitingForNextRound = result.waitingForNextRound; isBattleStarting = result.isBattleStarting; setState.adjustMode(result.adjustMode); setState.selectedAdjustPos(result.selectedAdjustPos); activeBuffs = result.activeBuffs; selectedBuffIndex = result.selectedBuffIndex; currentDoubleStrikeUid = result.currentDoubleStrikeUid;
                clearLogExceptFirst(); clearAllEffects(); hasLoggedTeam=false;
                doInitBattle(currentStage, getState.UI(), getState.snapshot(), activeBuffs, selectedBuffIndex, currentDoubleStrikeUid);
                updateUI(getState.UI()); gs=S.IDLE; setState.isPaused(false); updateButtons(); enableAllButtons(); updateSpeedButtons(); if(window._refreshGlowCells)window._refreshGlowCells();
            }
        } else if(gs===S.IDLE&&!isBattleStarting){
            if(!getState.adjustMode()){
                setState.adjustMode(true); setState.selectedAdjustPos(null); updateButtons(); updateUI(getState.UI()); if(window._refreshGlowCells)window._refreshGlowCells();
            } else {
                setState.adjustMode(false); setState.selectedAdjustPos(null); isBattleStarting=true; updateButtons(); updateUI(getState.UI());
                showVoteDialog(async(choice)=>{
                    clearLogExceptFirst(); hasLoggedTeam=false; fadeBGMTo(0.1,2000); logTeamInfo('初始阵容', getState.UI(), gs, battleResultForInfo, activeBuffs, hasLoggedTeam); hasLoggedTeam = true;
                    await showCountdown(TRASH_TALK_ALLY, TRASH_TALK_ENEMY, rand, showDanmaku, autoScrollLog);
                    let logDiv=document.getElementById('log'); logDiv.innerHTML+='<div class="separator">⚔️ 5v5对决开始 ⚔️</div>';
                    autoScrollLog();
                    await new Promise(resolve => { showBuffSelection(() => resolve(), activeBuffs, selectedBuffIndex, () => updateBuffSlots(activeBuffs, selectedBuffIndex), () => updateUI(getState.UI()), autoScrollLog); });
                    await new Promise(r=>setTimeout(r,600));
                    try {
                        gs=S.RUNNING; updateButtons(); document.getElementById('btnNext').disabled=true;
                        abortController=new AbortController();
                        const snap = getState.snapshot();
                        snap.ally = getState.UI().allyTeam.map(u=>Object.freeze(u.clone()));
                        let occupiedPositions = new Set(snap.ally.map(u => u.pos));
                        let freePositions = [1,2,3,4,5,6,7,8,9].filter(p => !occupiedPositions.has(p));
                        let enemyList = snap.enemy.map(u => u.clone());
                        for (let unit of enemyList) {
                            if (unit.pos === -1 || unit.pos == null) {
                                if (freePositions.length > 0) { unit.pos = freePositions[rand(0, freePositions.length - 1)]; unit._originalPos = unit.pos; freePositions = freePositions.filter(p => p !== unit.pos); }
                                else { unit.pos = 1 + rand(0, 8); unit._originalPos = unit.pos; }
                            }
                        }
                        snap.enemy = Object.freeze(enemyList.map(u => Object.freeze(u)));
                        setState.snapshot(snap);
                        const currentUI = getState.UI();
                        currentUI.enemyTeam = enemyList;
                        updateUI(currentUI);
                        const battleResult = runBattle(snap, activeBuffs);
                        setState.UI({ ...getState.UI(), currentResult: battleResult });
                        if (battleResult && battleResult.doubleStrikeUids) {
                            currentDoubleStrikeUid = battleResult.doubleStrikeUids[battleResult.doubleStrikeUids.length - 1] || null;
                        }
                        await playBattle();
                        let ctx = window._getPlayerContext();
                        if (ctx && ctx.battleResultForInfo) { showBattleReport(ctx.UI, ctx.battleResultForInfo); }
                    } catch (e) {
                        let logDiv=document.getElementById('log'); let errorDiv=document.createElement('div');
                        errorDiv.innerHTML=`<span class="red">❌ 战斗异常中断：${e.message || e}</span><br>`;
                        logDiv.appendChild(errorDiv); logDiv.scrollTop=logDiv.scrollHeight;
                        console.error('战斗异常', e);
                    } finally {
                        abortController=null;
                        if (runtimeMonitorActive) stopRuntimeMonitor();
                    }
                    updateButtons();
                }, window._battleHasZhang);
            }
        }
    });

    document.getElementById('btnNext').addEventListener('click',function(){onAnyButtonClick();waitingForNextRound=false;gs=S.RUNNING;updateButtons();});
    document.getElementById('btnSettle').addEventListener('click',async function(){
        onAnyButtonClick();
        let result = abortAll(abortController, getState.UI(), waitingForNextRound, isBattleStarting, getState.adjustMode(), getState.selectedAdjustPos(), activeBuffs, selectedBuffIndex, currentDoubleStrikeUid, () => updateBuffSlots(activeBuffs, selectedBuffIndex));
        abortController = result.abortController; waitingForNextRound = result.waitingForNextRound; isBattleStarting = result.isBattleStarting; setState.adjustMode(result.adjustMode); setState.selectedAdjustPos(result.selectedAdjustPos); activeBuffs = result.activeBuffs; selectedBuffIndex = result.selectedBuffIndex; currentDoubleStrikeUid = result.currentDoubleStrikeUid;
        clearAllEffects();
        gs = S.IDLE;
        setState.isPaused(false);
        waitingForNextRound = false;
        isBattleStarting = false;
        updateButtons();
        enableAllButtons();
        updateUI(getState.UI());
    });
    document.getElementById('btnPause').addEventListener('click',function(){onAnyButtonClick();if(gs===S.RUNNING){gs=S.PAUSED;setState.isPaused(true);window.bulletTimeActive = false;if(window._getPlayerContext()._scheduler)window._getPlayerContext()._scheduler.pause();document.body.classList.add('paused-animations');}else if(gs===S.PAUSED){gs=S.RUNNING;setState.isPaused(false);if(window._getPlayerContext()._scheduler)window._getPlayerContext()._scheduler.resume();document.body.classList.remove('paused-animations');}updateButtons();});
    document.getElementById('btnAuto').addEventListener('click',function(){
        autoMode=!autoMode;this.classList.toggle('active',autoMode);this.textContent=autoMode?'自动':'手动';
        window._autoMode = autoMode;
        if(autoMode&&waitingForNextRound)waitingForNextRound=false;
    });
    document.getElementById('btnDetail').addEventListener('click',function(){
        detailMode=!detailMode;this.classList.toggle('active',detailMode);this.textContent=detailMode?'详细':'简要';
        let logDiv=document.getElementById('log'); let scrollPos = logDiv.scrollTop; let totalBefore = logDiv.scrollHeight;
        if(!detailMode){document.querySelectorAll('#log .gray.small').forEach(el=>{if(el.parentElement)el.parentElement.classList.add('detail-hidden');});}
        else{document.querySelectorAll('#log .detail-hidden').forEach(el=>el.classList.remove('detail-hidden'));}
        let totalAfter = logDiv.scrollHeight; logDiv.scrollTop = scrollPos + (totalAfter - totalBefore);
    });
    document.getElementById('debugToggle').addEventListener('click',function(){
        onAnyButtonClick(); debugMode=!debugMode; this.classList.toggle('active',debugMode); this.textContent='V3.0'; window._debugMode=debugMode;
        updateSpeedButtons(); updateDebugUI(); updateUI(getState.UI());
        if (debugMode) { logVersions(); if (!runtimeMonitorActive) startRuntimeMonitor(); }
        else { if (runtimeMonitorActive) stopRuntimeMonitor(); }
    });
    document.getElementById('copyLog').addEventListener('click',()=>{
        showModal('选择复制类型', [
            {text:'📋 复制普通日志', value:'normal', cls:'buff'},
            {text:'🩺 复制体检日志', value:'health', cls:'buff'},
            {text:'📋 复制全部日志', value:'all', cls:'buff'}
        ], (choice)=>{
            let logDiv=document.getElementById('log');
            let lines=[];
            let seen=new Set();
            logDiv.querySelectorAll('div').forEach(div=>{
                let t=div.textContent||'';
                t=t.trim();
                if(!t) return;
                if(t.includes('回合开始')||t.includes('回合结束')){
                    let key=t.substring(0,20);
                    if(seen.has(key)) return;
                    seen.add(key);
                }
                if(choice==='health'){
                    if(t.includes('[体检]')) lines.push(t);
                } else if(choice==='normal'){
                    if(!t.includes('[体检]')) lines.push(t);
                } else {
                    lines.push(t);
                }
            });
            let text=lines.join('\n');
            if(!text.trim()){showAlert('没有匹配的日志');return;}
            navigator.clipboard.writeText(text).then(()=>showAlert('日志已复制'));
        });
    });

    document.getElementById('btnInfo').addEventListener('click',()=>{
        const currentUI = getState.UI();
        let ally=currentUI.allyTeam,enemy=currentUI.enemyTeam;
        if(!ally.length){showAlert('无阵容信息');return;}
        hasLoggedTeam = logTeamInfo('阵容详情', currentUI, gs, battleResultForInfo, activeBuffs, hasLoggedTeam);
    });
    document.getElementById('btnBGM').addEventListener('click',()=>{ showMusicPanel(); });
    document.getElementById('btnCrashMode').addEventListener('click',function(){window._crashMode=window._crashMode==='fly'?'ghost':'fly';this.textContent=window._crashMode==='fly'?'🕊️飞走':'👻虚影';});
    document.getElementById('btnDodgeToggle').addEventListener('click',()=>{toggleDodgeEffect();});
    document.getElementById('btnStageSelect').addEventListener('click',()=>{ if(gs!==S.IDLE)return; openStageSelectModal(); });

    function openStageSelectModal(){
        let buttons=[];
        for(let i=1;i<=6;i++){buttons.push({text:i===currentStage?`第${i}关 ◀`:`第${i}关`,value:i,cls:'buff'});}
        showModal('选择关卡',buttons,(stage)=>{ if(stage===currentStage)return; switchToStageInternal(stage); },false,false);
    }

    function switchToStageInternal(stage){
        onAnyButtonClick();
        let result = abortAll(abortController, getState.UI(), waitingForNextRound, isBattleStarting, getState.adjustMode(), getState.selectedAdjustPos(), activeBuffs, selectedBuffIndex, currentDoubleStrikeUid, () => updateBuffSlots(activeBuffs, selectedBuffIndex));
        abortController = result.abortController; waitingForNextRound = result.waitingForNextRound; isBattleStarting = result.isBattleStarting; setState.adjustMode(result.adjustMode); setState.selectedAdjustPos(result.selectedAdjustPos); activeBuffs = result.activeBuffs; selectedBuffIndex = result.selectedBuffIndex; currentDoubleStrikeUid = result.currentDoubleStrikeUid;
        clearLogExceptFirst(); clearAllEffects(); hasLoggedTeam=false;
        currentStage=stage;
        doInitBattle(currentStage, getState.UI(), getState.snapshot(), activeBuffs, selectedBuffIndex, currentDoubleStrikeUid);
        updateUI(getState.UI()); gs=S.IDLE; updateButtons(); enableAllButtons();
    }

    function forceStopGame(){
        const currentUI = getState.UI();
        if(!currentUI || !currentUI.allyTeam.length) return;
        let result = abortAll(abortController, currentUI, waitingForNextRound, isBattleStarting, getState.adjustMode(), getState.selectedAdjustPos(), activeBuffs, selectedBuffIndex, currentDoubleStrikeUid, () => updateBuffSlots(activeBuffs, selectedBuffIndex));
        abortController = result.abortController; waitingForNextRound = result.waitingForNextRound; isBattleStarting = result.isBattleStarting; setState.adjustMode(result.adjustMode); setState.selectedAdjustPos(result.selectedAdjustPos); activeBuffs = result.activeBuffs; selectedBuffIndex = result.selectedBuffIndex; currentDoubleStrikeUid = result.currentDoubleStrikeUid;
        clearLogExceptFirst(); clearAllEffects(); hasLoggedTeam=false;
        gs=S.IDLE;setState.isPaused(false);waitingForNextRound=false;isBattleStarting=false;
        updateButtons();enableAllButtons();updateSpeedButtons();
        try { updateUI(currentUI); } catch(e){}
    }

    function doManualReset(){
        activeBuffs=[]; setState.snapshot({ally:[],enemy:[]}); currentDoubleStrikeUid=null;
        forceStopGame();
        doInitBattle(currentStage, getState.UI(), getState.snapshot(), activeBuffs, selectedBuffIndex, currentDoubleStrikeUid);
        updateUI(getState.UI());
        gs=S.IDLE;updateButtons();enableAllButtons();
    }

    window.selectStage = (stage)=>{ if(stage===currentStage)return; forceStopGame(); switchToStageInternal(stage); };
    window.forceStopGame = forceStopGame;
    window.doManualReset = doManualReset;
    window.getGameState = ()=>({ gs, currentStage, isPaused: getState.isPaused(), isBattleStarting, allyCount: getState.UI().allyTeam.length, enemyCount: getState.UI().enemyTeam.length });

    for (let i = 0; i < 2; i++) { let slot = document.getElementById('buffSlot' + i); if (slot) slot.addEventListener('click', () => {
        if (i >= activeBuffs.length) return;
        selectedBuffIndex = selectedBuffIndex === i ? -1 : i;
        updateBuffSlots(activeBuffs, selectedBuffIndex);
        updateUI(getState.UI());
        if (window._updateGlowColors) window._updateGlowColors(selectedBuffIndex);
    }); }

    function setSpeed(val, lock) { speed = val; manualSpeedLock = lock; manualSpeedValue = lock ? val : null; slideSpeedActive = lock; updateSpeedButtons(); }
    function attachSpeedButton(id, speedVal) {
        let btn = document.getElementById(id); if (!btn) return;
        btn.addEventListener('click', function() { onAnyButtonClick(); if (speed === speedVal) setSpeed(1000, false); else setSpeed(speedVal, true); });
    }
    attachSpeedButton('btnSpeed2', 500);
    attachSpeedButton('btnSpeed7x', 143);
    attachSpeedButton('btnSpeed4x', 250);
    attachSpeedButton('btnSpeed2x', 500);
    attachSpeedButton('btnSpeed05', 1800);
    attachSpeedButton('btnSpeed05x', 1800);

    document.getElementById('voteFloat').addEventListener('click',function(){let overlay=document.getElementById('voteModalOverlay');if(overlay){overlay.style.display='flex';this.style.display='none';}});
    document.getElementById('coverStartBtn').addEventListener('click',function(){
        document.getElementById('coverOverlay').style.display='none';
        gameStarted=true; initBGM(); playBGM(); setBGMVolume(0.5);
        try { initGlowSystem(); } catch(e) { console.warn('光带特效初始化失败，已跳过', e); }
    });
    document.getElementById('allyGrid').addEventListener('click', function(e) {
        if (!getState.adjustMode()) return;
        let cell = e.target.closest('.cell'); if (!cell) return;
        let pos = parseInt(cell.dataset.pos); if (isNaN(pos)) return;
        const currentUI = getState.UI();
        let unit = currentUI.allyTeam.find(u => u.pos === pos);
        if (unit && unit.fixed) { cell.classList.add('cell-blocked'); setTimeout(() => cell.classList.remove('cell-blocked'), 500); return; }
        if (getState.selectedAdjustPos() === null) { setState.selectedAdjustPos(pos); }
        else { let targetUnit = currentUI.allyTeam.find(u => u.pos === pos); if (targetUnit && targetUnit.fixed) { cell.classList.add('cell-blocked'); setTimeout(() => cell.classList.remove('cell-blocked'), 500); setState.selectedAdjustPos(null); updateUI(currentUI); return; } swapAllyPositions(getState.selectedAdjustPos(), pos); setState.selectedAdjustPos(null); }
        updateUI(getState.UI()); if(window._refreshGlowCells)window._refreshGlowCells();
    });

    try {
        updateButtons(); updateSpeedButtons(); updateDebugUI();
        // 初始化第一关阵容
        doInitBattle(currentStage, getState.UI(), getState.snapshot(), activeBuffs, selectedBuffIndex, currentDoubleStrikeUid);
        updateUI(getState.UI()); updateScoreBadge();
        document.getElementById('log').innerHTML = '<div class="separator">' + LOG_LINE1 + '</div>';
        document.getElementById('btnDetail').classList.toggle('active', detailMode);
        document.getElementById('btnAuto').classList.toggle('active', autoMode);
        document.getElementById('btnDodgeToggle').classList.toggle('active', dodgeEffectEnabled);
        document.getElementById('btnDodgeToggle').textContent = dodgeEffectEnabled ? '华丽' : '简单';
        document.getElementById('btnCrashMode').textContent = window._crashMode === 'fly' ? '🕊️飞走' : '👻虚影';
    } catch(e) {
        console.error('[光明顶5v5测试版] 初始化错误：', e.stack || e.message || e);
    }
});