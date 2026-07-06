// ui/39main-state.js - 光明顶5v5 状态管理
// V5.0.0 | ~6500 bytes | 2026-07-06 统一 activeBuffs 读写，移除局部副本
export const VER = 'ui/39main-state.js V5.0.0';

import { STATE } from '../core/01config-5v5-test.js';
import { playLineText } from '../player/11battle-player-5v5-test.js';
import { updateUI, spawnVictoryEffects } from './14ui-render-5v5-test.js';
import { updateBuffSlots, tickBuffDurations as _tickBuffDurations } from './41main-battle.js';
import { AudioManager } from '../modules/28audio-manager.js';

const S = STATE;

// ==================== 全部全局状态 ====================
export let gs = S.IDLE;
export let autoMode = true;
export let debugMode = false;
export let isPaused = false;
export let speed = 500;
export let userScrolled = false;
export let abortController = null;
export let waitingForNextRound = false;
export let detailMode = true;
export let battleResultForInfo = null;
export let resettleCount = 0;
export let gameStarted = false;
export let hasLoggedTeam = false;
export let manualSpeedLock = false;
export let manualSpeedValue = null;
export let slideSpeedActive = false;
export let isBattleStarting = false;
export let adjustMode = false;
export let selectedAdjustPos = null;
export let currentStage = 1;
export let dodgeEffectEnabled = true;
export let selectedBuffIndex = -1;
export let currentDoubleStrikeUid = null;
export let runtimeMonitorActive = false;
export let runtimeMonitorInterval = null;
export let activeBuffs = [];                // ← 全局唯一的 activeBuffs
export let snapshot = { ally: [], enemy: [] };
export let UI = { allyTeam: [], enemyTeam: [], currentResult: null, round: 0, lastSnapshot: null };

// ==================== 状态读写 ====================
export const getState = {
    gs: () => gs, autoMode: () => autoMode, debugMode: () => debugMode,
    isPaused: () => isPaused, speed: () => speed, userScrolled: () => userScrolled,
    abortController: () => abortController, waitingForNextRound: () => waitingForNextRound,
    detailMode: () => detailMode, battleResultForInfo: () => battleResultForInfo,
    gameStarted: () => gameStarted, manualSpeedLock: () => manualSpeedLock,
    manualSpeedValue: () => manualSpeedValue, slideSpeedActive: () => slideSpeedActive,
    isBattleStarting: () => isBattleStarting, adjustMode: () => adjustMode,
    selectedAdjustPos: () => selectedAdjustPos, currentStage: () => currentStage,
    dodgeEffectEnabled: () => dodgeEffectEnabled, selectedBuffIndex: () => selectedBuffIndex,
    currentDoubleStrikeUid: () => currentDoubleStrikeUid, activeBuffs: () => activeBuffs,
    snapshot: () => snapshot, UI: () => UI
};

export const setState = {
    gs: (v) => { gs = v; },
    autoMode: (v) => { autoMode = v; },
    debugMode: (v) => { debugMode = v; },
    isPaused: (v) => { isPaused = v; },
    speed: (v) => { speed = v; },
    userScrolled: (v) => { userScrolled = v; },
    abortController: (v) => { abortController = v; },
    waitingForNextRound: (v) => { waitingForNextRound = v; },
    detailMode: (v) => { detailMode = v; },
    battleResultForInfo: (v) => { battleResultForInfo = v; },
    gameStarted: (v) => { gameStarted = v; },
    manualSpeedLock: (v) => { manualSpeedLock = v; },
    manualSpeedValue: (v) => { manualSpeedValue = v; },
    slideSpeedActive: (v) => { slideSpeedActive = v; },
    isBattleStarting: (v) => { isBattleStarting = v; },
    adjustMode: (v) => { adjustMode = v; },
    selectedAdjustPos: (v) => { selectedAdjustPos = v; },
    currentStage: (v) => { currentStage = v; },
    dodgeEffectEnabled: (v) => { dodgeEffectEnabled = v; },
    selectedBuffIndex: (v) => { selectedBuffIndex = v; },
    currentDoubleStrikeUid: (v) => { currentDoubleStrikeUid = v; },
    activeBuffs: (v) => { activeBuffs = v; },
    snapshot: (v) => { snapshot = v; },
    UI: (v) => { UI = v; }
};

// ==================== 内部函数（供 getPlayerContext 使用） ====================
function waitWhilePaused() {
    return new Promise(r => {
        const check = () => {
            if (!isPaused) { r(); return; }
            setTimeout(check, 100);
        };
        check();
    });
}

function autoScrollLog() {
    if (userScrolled) return;
    let logDiv = document.getElementById('log');
    if (logDiv) logDiv.scrollTop = logDiv.scrollHeight;
}

function onLogUserScroll() {
    let logDiv = document.getElementById('log');
    if (!logDiv) return;
    let distToBottom = logDiv.scrollHeight - logDiv.scrollTop - logDiv.clientHeight;
    userScrolled = distToBottom > 10;
}

function updateScoreBadge() {
    const badge = document.getElementById('scoreBadge');
    if (badge) badge.textContent = `🏆 ${window._voteScore || 10}分`;
}

function tickBuffDurations() {
    activeBuffs = activeBuffs.map(b => ({...b, remaining: b.remaining - 1})).filter(b => b.remaining > 0);
    if (selectedBuffIndex >= activeBuffs.length) selectedBuffIndex = -1;
    if (typeof window.updateBuffSlots === 'function') window.updateBuffSlots();
}

// ==================== getPlayerContext ====================
export function getPlayerContext() {
    return {
        get speed() { return speed; }, set speed(v) { speed = v; },
        get gs() { return gs; }, set gs(v) { gs = v; },
        get isPaused() { return isPaused; }, set isPaused(v) { isPaused = v; },
        get waitingForNextRound() { return waitingForNextRound; }, set waitingForNextRound(v) { waitingForNextRound = v; },
        get detailMode() { return detailMode; },
        get userScrolled() { return userScrolled; }, set userScrolled(v) { userScrolled = v; },
        get abortController() { return abortController; }, set abortController(v) { abortController = v; },
        get snapshot() { return snapshot; }, set snapshot(v) { snapshot = v; },
        get UI() { return UI; }, set UI(v) { UI = v; },
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
        set activeBuffs(v) { activeBuffs = v; if (typeof window.updateBuffSlots === 'function') window.updateBuffSlots(); },
        updateBuffSlots: () => {
            if (!Array.isArray(activeBuffs)) return;
            updateBuffSlots(activeBuffs, selectedBuffIndex);
        },
        get selectedBuffIndex() { return selectedBuffIndex; }, set selectedBuffIndex(v) { selectedBuffIndex = v; },
        get currentDoubleStrikeUid() { return currentDoubleStrikeUid; }, set currentDoubleStrikeUid(v) { currentDoubleStrikeUid = v; },
        get dodgeEffectEnabled() { return dodgeEffectEnabled; }, set dodgeEffectEnabled(v) { dodgeEffectEnabled = v; },
        get store() { return window._battleStore; },
        set store(v) { window._battleStore = v; },

        // 播放器上下文方法
        updateUI: () => updateUI(),
        spawnVictoryEffects,
        updateButtons: window.updateButtons,
        enableAllButtons: window.enableAllButtons,
        updateSpeedButtons: window.updateSpeedButtons,
        playLineTextWrapper: playLineText,
        waitWhilePaused,
        autoScrollLog,
        onLogUserScroll,
        updateScoreBadge,
        tickBuffDurations: () => {
            if (!Array.isArray(activeBuffs)) return;
            const result = _tickBuffDurations(activeBuffs, selectedBuffIndex, () => updateBuffSlots(activeBuffs, selectedBuffIndex));
            activeBuffs = result.activeBuffs;
            selectedBuffIndex = result.selectedBuffIndex;
        },
        fadeBGMTo: (targetVol, durationMs) => { AudioManager.fadeTo(targetVol, durationMs); },
        _scheduler: null,
        _battleEnded: false,
        _originalSpeed: null,
        swapAllyPositions: window._swapAllyPositions,
        _triggerFX: (...args) => { if (window._triggerFX) window._triggerFX(...args); }
    };
}

window._getPlayerContext = getPlayerContext;