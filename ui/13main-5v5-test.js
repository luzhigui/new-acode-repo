// ui/13main-5v5-test.js - 光明顶5v5 主控模块
// V5.1.0 | ~24000 bytes | 2026-07-07 拆分音频到42、特效到43、倍速+按钮到44
export const VER = 'ui/13main-5v5-test.js V5.1.0';

import '../modules/24error-capture.js';
import { CONFIG, STATE, KILL_TAUNT, ENEMY_M, VER as CFG_VER } from '../core/01config-5v5-test.js';
import { Unit, rand, runBattle, getRandomTaunt, getKillTaunt, getZhangNearTaunt, makeFXSnapshot, VER as BE_VER } from '../core/07battle-engine-5v5-test.js';
import { stripTags, renderGrid, updateUI, setRenderStore, spawnVictoryEffects, clearLogExceptFirst, isUnitBenefitedByBuff, VER as UI_VER } from './14ui-render-5v5-test.js';
import { showDanmaku, showDamageFloat, showDodgeBubble, showHealFloat, VER as FX_VER } from '../fx/15fx-common-5v5-test.js';
import { showRangedArrow, VER as FA_VER } from '../fx/16fx-arrows-5v5-test.js';
import { showMeleeCrash, showMeleeDodge, showMeleeMiss, VER as FC_VER } from '../fx/17fx-crash-5v5-test.js';
import { playBattle, playLineText, clearAllEffects, handleBuffSummon, handleBuffDestroy, handleBuffLeech, VER as BP_VER } from '../player/11battle-player-5v5-test.js';
import { showModal, showAlert, updateCoverVersion } from './12main-utils.js';

// 拆分模块
import { getPlayerContext, getState, setState, gs } from '../ui/39main-state.js';
import { showBattleReport, showMusicPanel, showVoteDialog, showCountdown } from './40main-dialogs.js';
import {
    doInitBattle, generateBuffChoices, showBuffSelection,
    updateBuffSlots, tickBuffDurations, getActiveBuffList,
    logTeamInfo, abortAll
} from './41main-battle.js';
import { initBGM, playBGM, setBGMVolume, fadeBGMTo, toggleBGM, updateBGMBtn, lowerBGM } from './42audio-control.js';
import { toggleDodgeEffect, _triggerFX } from './43fx-trigger.js';
import { updateSpeedButtons, activateScrollSlowdown, restoreSpeedFromScroll, updateButtons, enableAllButtons, updateDebugUI } from './44ui-controls.js';

import { VER as VER_BUFF } from '../core/04buff-system.js';
import { VER as VER_HORSE } from '../core/05battle-horse.js';
import { VER as VER_CORE } from '../core/06battle-engine-core.js';
import { VER as VER_PLAYER_CORE } from '../player/10player-core.js';
import { VER as VER_UNIT } from '../core/02unit.js';
import { VER as VER_UTILS } from '../core/03battle-utils.js';
import { VER as VER_TEXT } from '../player/08player-text.js';
import { VER as VER_BUFF_UI } from '../player/09player-buff-ui.js';
import { addPermanentBuff } from '../modules/23elite-skills.js';
import { VER as VER_MAIN_UTILS } from './12main-utils.js';



const C = CONFIG, S = STATE, KT = KILL_TAUNT;

const LOG_LINE1 = '⚔️ 光明顶5v5对决 · 九宫格混战模式 ⚔️';

// ==================== 局部状态（仅 UI 控制，不包含 activeBuffs） ====================
let debugMode = false, speed = 500, userScrolled = false;
let abortController = null, detailMode = true;
let battleResultForInfo = null, resettleCount = 0;
let gameStarted = false;
let hasLoggedTeam = false;
let isBattleStarting = false;
let currentStage = 1;
window._crashMode = 'fly';
let selectedBuffIndex = -1;
let currentDoubleStrikeUid = null;
let runtimeMonitorActive = false;
let runtimeMonitorInterval = null;

window._voteScore = parseInt(localStorage.getItem('ming_vote_score_5v5_test') || '10');
window._voteChoice = null; window._battleHasZhang = false; window._debugMode = false;

const TRASH_TALK_ALLY = ['明教必胜！六大派受死！','光明顶，我守定了！','六大派也不过如此！','来战！明教弟子，何惧！','今日便让尔等见识魔教之威！'];
const TRASH_TALK_ENEMY = ['魔教余孽，今日必灭！','少林武当，放马过来！','邪魔歪道，不足为惧！','今日便要踏平光明顶！'];

const ALL_BUFF_KEYS = Object.keys(C.BUFFS);

function debugLog(msg) { if (!debugMode) return; let logDiv = document.getElementById('log'); let wrapper = document.createElement('div'); wrapper.innerHTML = `<span class="debug">[调试] ${msg}</span><br>`; logDiv.appendChild(wrapper); logDiv.scrollTop = logDiv.scrollHeight; }

async function waitWhilePaused() { while (getState.isPaused()) { await new Promise(r => setTimeout(r, 100)); } }

function updateScoreBadge() { document.getElementById('scoreBadge').textContent = `🏆 ${window._voteScore}分`; }
export function onAnyButtonClick() { if (!gameStarted) return; const AudioManager = window.AudioManager; if (AudioManager && AudioManager.enabled && AudioManager.audio && AudioManager.audio.volume > 0.3) lowerBGM(); }
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
        let buffKey = (selectedBuffIndex >= 0 && selectedBuffIndex < getState.activeBuffs().length) ? getState.activeBuffs()[selectedBuffIndex].key : null;
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
    if (unitA) { unitA.pos = posB; }
    if (unitB) { unitB.pos = posA; }
    updateUI();
}
window._swapAllyPositions = swapAllyPositions;



// ==================== 运行时监控 ====================


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
    // 小昭模式：从封面页传入
    if (localStorage.getItem('_forceXiaoZhao') === '1') {
        window._forceXiaoZhao = true;
        localStorage.removeItem('_forceXiaoZhao');
    }
    const controls = document.querySelector('.controls');
    if (controls) controls.style.zIndex = '100';
    const canvas = document.getElementById('glowCanvas');
    if (canvas) { canvas.style.zIndex = '1'; canvas.style.pointerEvents = 'none'; }

    if (!getState.UI().allyTeam.length) {
        setState.UI({ allyTeam: [], enemyTeam: [], currentResult: null, round: 0, lastSnapshot: null });
        setState.snapshot({ ally: [], enemy: [] });
    }

    document.getElementById('btnMain').addEventListener('click', async function(){
        onAnyButtonClick();

        // 全自动/手动共用战斗启动流程
        const startBattle = async (choice) => {
            clearLogExceptFirst(); hasLoggedTeam=false; fadeBGMTo(0.1,2000); logTeamInfo('初始阵容', getState.UI(), gs, battleResultForInfo, getState.activeBuffs(), hasLoggedTeam); hasLoggedTeam = true;
            await showCountdown(TRASH_TALK_ALLY, TRASH_TALK_ENEMY, rand, showDanmaku, autoScrollLog);
            let logDiv=document.getElementById('log'); logDiv.innerHTML+='<div class="separator">⚔️ 5v5对决开始 ⚔️</div>';
            autoScrollLog();
            if (getState.autoLevel() === 'full-auto') {
                const allKeys = Object.keys(C.BUFFS);
                const existing = getState.activeBuffs().map(b => b.key);
                const available = allKeys.filter(k => !existing.includes(k));
                if (available.length > 0) {
                    const pick = available[rand(0, available.length - 1)];
                    const duration = C.BUFFS[pick].duration || C.BUFF_DURATION;
                    const buffs = getState.activeBuffs();
                    if (buffs.length >= 2) {
                        const shortest = buffs.reduce((a, b) => a.remaining < b.remaining ? a : b);
                        buffs.splice(buffs.indexOf(shortest), 1);
                    }
                    if (pick === 'holyFlame') {
                        buffs.push({ key: pick, target: 'ally', remaining: duration, name: C.BUFFS[pick].name, col: rand(1, 3), row: rand(1, 3) });
                    } else {
                        buffs.push({ key: pick, target: 'ally', remaining: duration, name: C.BUFFS[pick].name });
                    }
                    // 小昭永久海克斯备份
                    const allyTeam = getState.UI().allyTeam;
                    const xz = allyTeam.find(u => u.isXiaoZhao);
                    if (xz) {
                        const extra = pick === 'holyFlame' ? { col: rand(1, 3), row: rand(1, 3) } : {};
                        addPermanentBuff(xz, pick, C.BUFFS[pick].name, extra);
                    }
                    updateBuffSlots(getState.activeBuffs(), selectedBuffIndex);
                    logDiv.innerHTML += `<span class="gold">✨ 获得Buff：${C.BUFFS[pick].name}（持续${duration}回合）</span><br>`;
                    autoScrollLog();
                }
            } else {
                await new Promise(resolve => { showBuffSelection(() => resolve(), getState.activeBuffs(), selectedBuffIndex, () => updateBuffSlots(getState.activeBuffs(), selectedBuffIndex), () => {}, autoScrollLog, getState.UI().allyTeam); });
            }
            await new Promise(r=>setTimeout(r,600));
            try {
                setState.gs(S.RUNNING); updateButtons(); document.getElementById('btnNext').disabled=true;
                abortController=new AbortController();
                const snap = getState.snapshot();
                snap.ally = getState.UI().allyTeam.map(u=>u.clone());
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
                updateUI();
                const battleResult = runBattle(snap, getState.activeBuffs());
                setState.UI({ ...getState.UI(), currentResult: battleResult });
                if (battleResult && battleResult.doubleStrikeUids) {
                    currentDoubleStrikeUid = battleResult.doubleStrikeUids[battleResult.doubleStrikeUids.length - 1] || null;
                    getState.currentDoubleStrikeUid = currentDoubleStrikeUid;
                }
                await playBattle();
                let ctx = window._getPlayerContext();
                if (ctx && ctx.battleResultForInfo) {
                    showBattleReport(ctx.UI, ctx.battleResultForInfo);
                    if (getState.autoLevel() === 'full-auto') {
                        setTimeout(() => {
                            const overlay = document.getElementById('battleReportOverlay');
                            if (overlay) overlay.remove();
                            const float = document.getElementById('battleReportFloat');
                            if (float) float.remove();
                        }, 3000);
                    }
                }
            } catch (e) {
                let logDiv=document.getElementById('log'); let errorDiv=document.createElement('div');
                errorDiv.innerHTML=`<span class="red">❌ 战斗异常中断：${e.message || e}</span><br>`;
                logDiv.appendChild(errorDiv); logDiv.scrollTop=logDiv.scrollHeight;
                console.error('战斗异常', e);
            } finally {
                abortController=null;
            }
            updateButtons();
            if (getState.autoLevel() === 'full-auto' && gs === 'GAMEOVER') {
                setTimeout(() => {
                    if (currentStage < 6) document.getElementById('btnMain').click();
                }, 3500);
            }
        };

        if(gs===S.GAMEOVER){
            window._fastForwardActive = false;
            setRenderStore(null);
            if(currentStage>=6){
                currentStage=1;
                let result = abortAll(abortController, getState.UI(), getState.waitingForNextRound(), isBattleStarting, getState.adjustMode(), getState.selectedAdjustPos(), getState.activeBuffs(), selectedBuffIndex, currentDoubleStrikeUid, () => updateBuffSlots(getState.activeBuffs(), selectedBuffIndex));
                abortController = result.abortController; setState.waitingForNextRound(result.waitingForNextRound); isBattleStarting = result.isBattleStarting; setState.adjustMode(result.adjustMode); setState.selectedAdjustPos(result.selectedAdjustPos); setState.activeBuffs(result.activeBuffs); selectedBuffIndex = result.selectedBuffIndex; currentDoubleStrikeUid = result.currentDoubleStrikeUid;
                clearLogExceptFirst(); clearAllEffects(); hasLoggedTeam=false;
                setState.snapshot({ ally: [], enemy: [] });  // 强制重置快照，与 doManualReset 保持一致
                let currentUI = getState.UI();
                let currentSnapshot = getState.snapshot();
                if (!currentUI || !currentUI.allyTeam || !currentUI.allyTeam.length) {
                    currentUI = { allyTeam: [], enemyTeam: [], currentResult: null, round: 0, lastSnapshot: null };
                    setState.UI(currentUI);
                }
                // 快照已强制清空，无需再条件初始化
                doInitBattle(currentStage, currentUI, currentSnapshot, getState.activeBuffs(), selectedBuffIndex, currentDoubleStrikeUid);
                setState.UI(currentUI);
                setState.snapshot(currentSnapshot);
                updateUI();
                renderGrid('allyGrid', 'ally');
                renderGrid('enemyGrid', 'enemy');
                setState.gs(S.IDLE); setState.isPaused(false); updateButtons(); enableAllButtons(); updateSpeedButtons(); if(window._refreshGlowCells)window._refreshGlowCells();
                if (getState.autoLevel() === 'full-auto') { setTimeout(() => { if (getState.autoLevel() === 'full-auto' && !getState.isBattleStarting()) document.getElementById('btnMain').click(); }, 500); }
            } else {
                currentStage++;
                setRenderStore(null);
                let result = abortAll(abortController, getState.UI(), getState.waitingForNextRound(), isBattleStarting, getState.adjustMode(), getState.selectedAdjustPos(), getState.activeBuffs(), selectedBuffIndex, currentDoubleStrikeUid, () => updateBuffSlots(getState.activeBuffs(), selectedBuffIndex));
                abortController = result.abortController; setState.waitingForNextRound(result.waitingForNextRound); isBattleStarting = result.isBattleStarting; setState.adjustMode(result.adjustMode); setState.selectedAdjustPos(result.selectedAdjustPos); setState.activeBuffs(result.activeBuffs); selectedBuffIndex = result.selectedBuffIndex; currentDoubleStrikeUid = result.currentDoubleStrikeUid;
                clearLogExceptFirst(); clearAllEffects(); hasLoggedTeam=false;
                let currentUI = getState.UI();
                let currentSnapshot = getState.snapshot();
                if (!currentUI || !currentUI.allyTeam || !currentUI.allyTeam.length) {
                    currentUI = { allyTeam: [], enemyTeam: [], currentResult: null, round: 0, lastSnapshot: null };
                    setState.UI(currentUI);
                }
                if (!currentSnapshot || !currentSnapshot.ally || !currentSnapshot.ally.length) {
                    currentSnapshot = { ally: [], enemy: [] };
                    setState.snapshot(currentSnapshot);
                }
                doInitBattle(currentStage, currentUI, currentSnapshot, getState.activeBuffs(), selectedBuffIndex, currentDoubleStrikeUid);
                setState.UI(currentUI);
                setState.snapshot(currentSnapshot);
                updateUI();
                renderGrid('allyGrid', 'ally');
                renderGrid('enemyGrid', 'enemy');
                setState.gs(S.IDLE); setState.isPaused(false); updateButtons(); enableAllButtons(); updateSpeedButtons(); if(window._refreshGlowCells)window._refreshGlowCells();
                if (getState.autoLevel() === 'full-auto') { setTimeout(() => { if (getState.autoLevel() === 'full-auto' && !getState.isBattleStarting()) document.getElementById('btnMain').click(); }, 500); }
            }
        } else if(gs===S.IDLE&&!isBattleStarting){
            if(!getState.adjustMode()){
                if(getState.autoLevel() === 'full-auto') {
                    // 全自动：跳过调整，直接进入战斗
                    setState.adjustMode(false); setState.selectedAdjustPos(null); isBattleStarting=true; updateButtons(); updateUI();
                    startBattle('明教');
                    return;
                }
                setState.adjustMode(true); setState.selectedAdjustPos(null); updateButtons(); updateUI(); if(window._refreshGlowCells)window._refreshGlowCells();
            } else {
                setState.adjustMode(false); setState.selectedAdjustPos(null); isBattleStarting=true; updateButtons(); updateUI();
                if (getState.autoLevel() === 'full-auto') {
                    startBattle('明教');
                } else {
                    showVoteDialog(startBattle, window._battleHasZhang);
                }
            }
        }
    });

    document.getElementById('btnNext').addEventListener('click',function(){onAnyButtonClick();setState.waitingForNextRound(false);setState.gs(S.RUNNING);updateButtons();});
    document.getElementById('btnSettle').addEventListener('click',async function(){
        onAnyButtonClick();
        if (gs === S.GAMEOVER) {
            clearAllEffects();
            window._fastForwardActive = false;
            setRenderStore(null);
            setState.speed(500);
            setState.gs(S.IDLE);
            setState.isPaused(false);
            setState.waitingForNextRound(false);
            isBattleStarting = false;
            setState.activeBuffs([]);
            setState.snapshot({ ally: [], enemy: [] });
            let currentUI = { allyTeam: [], enemyTeam: [], currentResult: null, round: 0, lastSnapshot: null };
            setState.UI(currentUI);
            updateButtons();
            enableAllButtons();
            doInitBattle(currentStage, currentUI, getState.snapshot(), getState.activeBuffs(), selectedBuffIndex, currentDoubleStrikeUid);
            setState.UI(currentUI);
            setState.snapshot(getState.snapshot());
            updateUI();
            renderGrid('allyGrid', 'ally');
            renderGrid('enemyGrid', 'enemy');
            if (window._refreshGlowCells) window._refreshGlowCells();
            return;
        }
        window._fastForwardActive = true;
        setState.waitingForNextRound(false);
        window._skipBuffPopup = true;
        let ffCtx = window._getPlayerContext ? window._getPlayerContext() : null;
        if (ffCtx) {
            if (!ffCtx._originalSpeed) ffCtx._originalSpeed = ffCtx.speed;
            ffCtx.speed = 1;
            if (ffCtx._scheduler && ffCtx._scheduler.setSpeed) ffCtx._scheduler.setSpeed(50);
        }
        if (gs === S.PAUSED) {
            setState.gs(S.RUNNING);
            setState.isPaused(false);
            if (ffCtx && ffCtx._scheduler) ffCtx._scheduler.resume();
            document.body.classList.remove('paused-animations');
        }
        if (window.bulletTimeActive) window.bulletTimeActive = false;
        setState.waitingForNextRound(false);
        updateButtons();
    });
    document.getElementById('btnPause').addEventListener('click',function(){onAnyButtonClick();if(gs===S.RUNNING){setState.gs(S.PAUSED);setState.isPaused(true);window.bulletTimeActive = false;if(window._getPlayerContext()._scheduler)window._getPlayerContext()._scheduler.pause();document.body.classList.add('paused-animations');}else if(gs===S.PAUSED){setState.gs(S.RUNNING);setState.isPaused(false);if(window._getPlayerContext()._scheduler)window._getPlayerContext()._scheduler.resume();document.body.classList.remove('paused-animations');}updateButtons();});
    document.getElementById('btnAuto').addEventListener('click',function(e){
        e.stopPropagation();
        const btn = this;
        const rect = btn.getBoundingClientRect();

        // 移除已有菜单
        const existing = document.querySelector('.auto-menu-backdrop');
        if (existing) { existing.remove(); return; }

        const backdrop = document.createElement('div');
        backdrop.className = 'auto-menu-backdrop';
        backdrop.addEventListener('click', () => backdrop.remove());

        const menu = document.createElement('div');
        menu.className = 'auto-menu';
        menu.style.left = (rect.left - 10) + 'px';
        menu.style.bottom = (window.innerHeight - rect.top + 6) + 'px';

        const levels = [
            { key: 'manual', label: '手动' },
            { key: 'auto', label: '自动' },
            { key: 'full-auto', label: '全自动' }
        ];
        const cur = getState.autoLevel?.() || 'auto';
        levels.forEach(l => {
            const mb = document.createElement('button');
            mb.textContent = l.label;
            if (cur === l.key) mb.classList.add('checked');
            mb.addEventListener('click', (ev) => {
                ev.stopPropagation();
                setState.autoLevel(l.key);
                const isManual = l.key === 'manual';
                const isFullAuto = l.key === 'full-auto';
                setState.autoMode(!isManual);
                btn.textContent = isManual ? '手动' : (isFullAuto ? '全自动' : '自动');
                btn.classList.toggle('active', !isManual);
                window._autoMode = !isManual;
                if (!isManual && getState.waitingForNextRound()) setState.waitingForNextRound(false);
                backdrop.remove();
            });
            menu.appendChild(mb);
        });

        backdrop.appendChild(menu);
        document.body.appendChild(backdrop);
    });
    document.getElementById('btnDetail').addEventListener('click',function(){
        detailMode=!detailMode;this.classList.toggle('active',detailMode);this.textContent=detailMode?'详细':'简要';
        let logDiv=document.getElementById('log'); let scrollPos = logDiv.scrollTop; let totalBefore = logDiv.scrollHeight;
        if(!detailMode){document.querySelectorAll('#log .gray.small').forEach(el=>{if(el.parentElement)el.parentElement.classList.add('detail-hidden');});}
        else{document.querySelectorAll('#log .detail-hidden').forEach(el=>el.classList.remove('detail-hidden'));}
        let totalAfter = logDiv.scrollHeight; logDiv.scrollTop = scrollPos + (totalAfter - totalBefore);
    });
    document.getElementById('debugToggle').addEventListener('click',function(){
        onAnyButtonClick(); setState.debugMode(!getState.debugMode()); var dm = getState.debugMode(); this.classList.toggle('active',dm); this.textContent='V3.0'; window._debugMode=dm;
        updateSpeedButtons(); updateDebugUI(); updateUI();
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
                if(t.includes('初始阵容')||t.includes('阵容详情')){
                    let key=t.substring(0,15);
                    if(seen.has(key)) return;
                    seen.add(key);
                }
                if(choice==='health'){
                    if(t.includes('[体检]')) lines.push(t);
                } else if(choice==='normal'){
                    if(!t.includes('[体检]') && !t.includes('[版本信息]') && !t.includes('[子模块]')) lines.push(t);
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
        hasLoggedTeam = logTeamInfo('阵容详情', currentUI, gs, battleResultForInfo, getState.activeBuffs(), hasLoggedTeam);
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
        let result = abortAll(abortController, getState.UI(), getState.waitingForNextRound(), isBattleStarting, getState.adjustMode(), getState.selectedAdjustPos(), getState.activeBuffs(), selectedBuffIndex, currentDoubleStrikeUid, () => updateBuffSlots(getState.activeBuffs(), selectedBuffIndex));
        abortController = result.abortController; setState.waitingForNextRound(result.waitingForNextRound); isBattleStarting = result.isBattleStarting; setState.adjustMode(result.adjustMode); setState.selectedAdjustPos(result.selectedAdjustPos); setState.activeBuffs(result.activeBuffs); selectedBuffIndex = result.selectedBuffIndex; currentDoubleStrikeUid = result.currentDoubleStrikeUid;
        clearLogExceptFirst(); clearAllEffects(); hasLoggedTeam=false;
        currentStage=stage;
        doInitBattle(currentStage, getState.UI(), getState.snapshot(), getState.activeBuffs(), selectedBuffIndex, currentDoubleStrikeUid);
        setState.UI(getState.UI());
        setState.snapshot(getState.snapshot());
        updateUI(); setState.gs(S.IDLE); updateButtons(); enableAllButtons();
    }

    function forceStopGame(){
        const currentUI = getState.UI();
        if(!currentUI || !currentUI.allyTeam.length) return;
        let result = abortAll(abortController, currentUI, getState.waitingForNextRound(), isBattleStarting, getState.adjustMode(), getState.selectedAdjustPos(), getState.activeBuffs(), selectedBuffIndex, currentDoubleStrikeUid, () => updateBuffSlots(getState.activeBuffs(), selectedBuffIndex));
        abortController = result.abortController; setState.waitingForNextRound(result.waitingForNextRound); isBattleStarting = result.isBattleStarting; setState.adjustMode(result.adjustMode); setState.selectedAdjustPos(result.selectedAdjustPos); setState.activeBuffs(result.activeBuffs); selectedBuffIndex = result.selectedBuffIndex; currentDoubleStrikeUid = result.currentDoubleStrikeUid;
        clearLogExceptFirst(); clearAllEffects(); hasLoggedTeam=false;
        setState.gs(S.IDLE);setState.isPaused(false);setState.waitingForNextRound(false);isBattleStarting=false;
        // 清除旧的 Store 引用，防止 renderGrid 访问无效 Store
        setRenderStore(null);
        try { updateUI(); } catch(e){}
        updateButtons();enableAllButtons();updateSpeedButtons();
    }

    function doManualReset(){
        setState.activeBuffs([]); setState.snapshot({ally:[],enemy:[]}); currentDoubleStrikeUid=null;
        forceStopGame();
        doInitBattle(currentStage, getState.UI(), getState.snapshot(), getState.activeBuffs(), selectedBuffIndex, currentDoubleStrikeUid);
        setState.UI(getState.UI());
        setState.snapshot(getState.snapshot());
        updateUI();
        setState.gs(S.IDLE);updateButtons();enableAllButtons();
    }

    window.selectStage = (stage)=>{ if(stage===currentStage)return; forceStopGame(); switchToStageInternal(stage); };
    window.forceStopGame = forceStopGame;
    window.doManualReset = doManualReset;
    window.getGameState = ()=>({ gs, currentStage, isPaused: getState.isPaused(), isBattleStarting, allyCount: getState.UI().allyTeam.length, enemyCount: getState.UI().enemyTeam.length });
    window._activateScrollSlowdown = activateScrollSlowdown;
    window._restoreSpeedFromScroll = restoreSpeedFromScroll;

    for (let i = 0; i < 2; i++) { let slot = document.getElementById('buffSlot' + i); if (slot) slot.addEventListener('click', () => {
        if (i >= getState.activeBuffs().length) return;
        selectedBuffIndex = selectedBuffIndex === i ? -1 : i;
        updateBuffSlots(getState.activeBuffs(), selectedBuffIndex);
        updateUI();
        if (window._updateGlowColors) window._updateGlowColors(selectedBuffIndex);
    }); }

    document.getElementById('voteFloat').addEventListener('click',function(){let overlay=document.getElementById('voteModalOverlay');if(overlay){overlay.style.display='flex';this.style.display='none';}});
    document.getElementById('coverStartBtn').addEventListener('click',function(){
        document.getElementById('coverOverlay').style.display='none';
        gameStarted=true; initBGM(); playBGM(); setBGMVolume(0.5);
        try { initGlowSystem(); } catch(e) { console.warn('光带特效初始化失败，已跳过', e); }
        speed = 500; updateSpeedButtons();
    });
    document.getElementById('allyGrid').addEventListener('click', function(e) {
        if (!getState.adjustMode()) return;
        let cell = e.target.closest('.cell'); if (!cell) return;
        let pos = parseInt(cell.dataset.pos); if (isNaN(pos)) return;
        const currentUI = getState.UI();
        let unit = currentUI.allyTeam.find(u => u.pos === pos);
        if (unit && unit.fixed) { cell.classList.add('cell-blocked'); setTimeout(() => cell.classList.remove('cell-blocked'), 500); return; }
        if (getState.selectedAdjustPos() === null) { setState.selectedAdjustPos(pos); }
        else { let targetUnit = currentUI.allyTeam.find(u => u.pos === pos); if (targetUnit && targetUnit.fixed) { cell.classList.add('cell-blocked'); setTimeout(() => cell.classList.remove('cell-blocked'), 500); setState.selectedAdjustPos(null); updateUI(); return; } swapAllyPositions(getState.selectedAdjustPos(), pos); setState.selectedAdjustPos(null); }
        updateUI(); if(window._refreshGlowCells)window._refreshGlowCells();
    });

    try {
        updateButtons(); updateSpeedButtons(); updateDebugUI();
        doInitBattle(currentStage, getState.UI(), getState.snapshot(), getState.activeBuffs(), selectedBuffIndex, currentDoubleStrikeUid);
        setState.UI(getState.UI());
        setState.snapshot(getState.snapshot());
        updateUI(); updateScoreBadge();
        document.getElementById('log').innerHTML = '<div class="separator">' + LOG_LINE1 + '</div>';
        document.getElementById('btnDetail').classList.toggle('active', detailMode);
        document.getElementById('btnAuto').classList.toggle('active', getState.autoMode());
        document.getElementById('btnDodgeToggle').classList.toggle('active', getState.dodgeEffectEnabled());
        document.getElementById('btnDodgeToggle').textContent = getState.dodgeEffectEnabled() ? '华丽' : '简单';
        document.getElementById('btnCrashMode').textContent = window._crashMode === 'fly' ? '🕊️飞走' : '👻虚影';
    } catch(e) {
        console.error('[光明顶5v5测试版] 初始化错误：', e.stack || e.message || e);
    }
});