﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// ui/33main-state.js - 光明顶5v5 状态管理
// V5.4.0 | ~12500 bytes| 2026-07-31 迁移至 GlobalStore 统一状态源
export const VER = 'ui/33main-state.js V5.4.0';

import { STATE } from '../core/01config-5v5-test.js';
import { GlobalStore } from '../modules/18global-store.js';

import { updateUI, spawnVictoryEffects } from './32ui-render-5v5-test.js';
import { tickBuffDurations as _tickBuffDurations } from './35main-battle.js';
import { updateBuffSlots } from './38ui-controls.js';
import { AudioManager } from '../modules/17audio-manager.js';

const S = STATE;

// ==================== 模块级变量降级为 GlobalStore 的初始化入口 ====================
// 这些 export let 仅为向后兼容（外部可能存在直接引用），实际读写已全部走 GlobalStore

export let gs = S.IDLE;
export let autoMode = true;
export let autoLevel = 'auto';
export let debugMode = false;
export let isPaused = false;
export let speed = 500;
export let userScrolled = false;
export let abortController = null;
export let waitingForNextRound = false;
export let logLevel = 'detailed';
export let battleResultForInfo = null;
export let resettleCount = 0;
export let gameStarted = false;
export let hasLoggedTeam = false;

export let isBattleStarting = false;
export let adjustMode = false;
export let selectedAdjustPos = null;
export let currentStage = 1;
export let dodgeEffectEnabled = true;
export let selectedBuffIndex = -1;
export let currentDoubleStrikeUid = null;
export let runtimeMonitorActive = false;
export let runtimeMonitorInterval = null;
export let activeBuffs = [];
export let snapshot = { ally: [], enemy: [] };
export let UI = { allyTeam: [], enemyTeam: [], currentResult: null, round: 0, lastSnapshot: null };

// 初始化时同步模块级变量到 GlobalStore
GlobalStore.set('gs', S.IDLE);
GlobalStore.set('autoMode', true);
GlobalStore.set('autoLevel', 'auto');
GlobalStore.set('debugMode', false);
GlobalStore.set('isPaused', false);
GlobalStore.set('speed', 500);
GlobalStore.set('userScrolled', false);
GlobalStore.set('abortController', null);
GlobalStore.set('waitingForNextRound', false);
GlobalStore.set('logLevel', 'detailed');
GlobalStore.set('battleResultForInfo', null);
GlobalStore.set('gameStarted', false);
GlobalStore.set('isBattleStarting', false);
GlobalStore.set('adjustMode', false);
GlobalStore.set('selectedAdjustPos', null);
GlobalStore.set('currentStage', 1);
GlobalStore.set('dodgeEffectEnabled', true);
GlobalStore.set('selectedBuffIndex', -1);
GlobalStore.set('currentDoubleStrikeUid', null);
GlobalStore.set('activeBuffs', []);
GlobalStore.set('snapshot', { ally: [], enemy: [] });
GlobalStore.set('UI', { allyTeam: [], enemyTeam: [], currentResult: null, round: 0, lastSnapshot: null });

// 外部（如 26player-core.js）直接写 GlobalStore 后，调用此函数同步模块级 gs 变量
window._syncGs = function(v) { gs = v; };

// ==================== 状态读写 — 统一走 GlobalStore（实现已移至 modules/18global-store.js） ====================
export { getState, setState } from '../modules/18global-store.js';

// ==================== 内部函数（供 getPlayerContext 使用） ====================
function waitWhilePaused() {
    return new Promise(r => {
        const check = () => {
            if (!GlobalStore.get('isPaused')) { r(); return; }
            setTimeout(check, 100);
        };
        check();
    });
}

function autoScrollLog() {
    if (GlobalStore.get('userScrolled')) return;
    let logDiv = document.getElementById('log');
    if (logDiv) logDiv.scrollTop = logDiv.scrollHeight;
}

function onLogUserScroll() {
    let logDiv = document.getElementById('log');
    if (!logDiv) return;
    let distToBottom = logDiv.scrollHeight - logDiv.scrollTop - logDiv.clientHeight;
    GlobalStore.set('userScrolled', distToBottom > 10);
}

function updateScoreBadge() {
    const badge = document.getElementById('scoreBadge');
    const score = GlobalStore.get('voteScore');
    const token = GlobalStore.get('holyToken');
    const displayScore = (score === null || score === undefined) ? 0 : score;
    const displayToken = (token === null || token === undefined) ? 0 : token;
    if (badge) badge.innerHTML = `🏆 ${displayScore}分 🔥${displayToken}`;
}
window.updateScoreBadge = updateScoreBadge;

function tickBuffDurations() {
    const activeBuffs = GlobalStore.get('activeBuffs') || [];
    const result = _tickBuffDurations(activeBuffs, GlobalStore.get('selectedBuffIndex'), () => updateBuffSlots(GlobalStore.get('activeBuffs')));
    GlobalStore.set('activeBuffs', result.activeBuffs);
    GlobalStore.set('selectedBuffIndex', result.selectedBuffIndex);
    if (typeof window.updateBuffSlots === 'function') window.updateBuffSlots();
}

// ==================== getPlayerContext ====================
let _playerCtx = null;
// 状态-创建上下文：构建玩家上下文对象（GlobalStore接入）
export function getPlayerContext() {
    if (_playerCtx) return _playerCtx;
    _playerCtx = {
        get speed() { return GlobalStore.get('speed'); },
        set speed(v) { GlobalStore.set('speed', v); },
        get gs() { return GlobalStore.get('gs'); },
        set gs(v) { GlobalStore.set('gs', v); },
        get isPaused() { return GlobalStore.get('isPaused'); },
        set isPaused(v) { GlobalStore.set('isPaused', v); },
        get waitingForNextRound() { return GlobalStore.get('waitingForNextRound'); },
        set waitingForNextRound(v) { GlobalStore.set('waitingForNextRound', v); },
        get logLevel() { return GlobalStore.get('logLevel'); },
        get userScrolled() { return GlobalStore.get('userScrolled'); },
        set userScrolled(v) { GlobalStore.set('userScrolled', v); },
        get abortController() { return GlobalStore.get('abortController'); },
        set abortController(v) { GlobalStore.set('abortController', v); },
        get snapshot() { return GlobalStore.get('snapshot'); },
        set snapshot(v) { GlobalStore.set('snapshot', v); },
        get UI() { return GlobalStore.get('UI'); },
        set UI(v) { GlobalStore.set('UI', v); },
        get autoMode() { return GlobalStore.get('autoMode'); },
        set autoMode(v) { GlobalStore.set('autoMode', v); },
        get autoLevel() { return GlobalStore.get('autoLevel'); },
        set autoLevel(v) { GlobalStore.set('autoLevel', v); },
        get manualSpeedLock() { return false; },
        get manualSpeedValue() { return null; },
        get slideSpeedActive() { return false; },
        get battleResultForInfo() { return GlobalStore.get('battleResultForInfo'); },
        set battleResultForInfo(v) { GlobalStore.set('battleResultForInfo', v); },
        get isBattleStarting() { return GlobalStore.get('isBattleStarting'); },
        set isBattleStarting(v) { GlobalStore.set('isBattleStarting', v); },
        get adjustMode() { return GlobalStore.get('adjustMode'); },
        get selectedAdjustPos() { return GlobalStore.get('selectedAdjustPos'); },
        get currentStage() { return GlobalStore.get('currentStage'); },
        set currentStage(v) { GlobalStore.set('currentStage', v); },
        get activeBuffs() { return GlobalStore.get('activeBuffs'); },
        set activeBuffs(v) {
            GlobalStore.set('activeBuffs', v);
            if (typeof window.updateBuffSlots === 'function') window.updateBuffSlots();
        },
        updateBuffSlots: () => {
            const buffs = GlobalStore.get('activeBuffs');
            if (!Array.isArray(buffs)) return;
            updateBuffSlots(buffs, GlobalStore.get('selectedBuffIndex'));
        },
        get selectedBuffIndex() { return GlobalStore.get('selectedBuffIndex'); },
        set selectedBuffIndex(v) { GlobalStore.set('selectedBuffIndex', v); },
        get currentDoubleStrikeUid() { return GlobalStore.get('currentDoubleStrikeUid'); },
        set currentDoubleStrikeUid(v) { GlobalStore.set('currentDoubleStrikeUid', v); },
        get dodgeEffectEnabled() { return GlobalStore.get('dodgeEffectEnabled'); },
        set dodgeEffectEnabled(v) { GlobalStore.set('dodgeEffectEnabled', v); },
        get store() { return window._battleStore; },
        set store(v) { window._battleStore = v; },

        // 播放器上下文方法
        updateUI: () => updateUI(),
        spawnVictoryEffects,
        updateButtons: window.updateButtons,
        enableAllButtons: window.enableAllButtons,
        updateSpeedButtons: window.updateSpeedButtons,
        
        waitWhilePaused,
        autoScrollLog,
        onLogUserScroll,
        updateScoreBadge,
        tickBuffDurations,
        fadeBGMTo: (targetVol, durationMs) => { AudioManager.fadeTo(targetVol, durationMs); },
        _scheduler: null,
        _battleEnded: false,
        _originalSpeed: null,
        swapAllyPositions: window._swapAllyPositions,
        _triggerFX: (...args) => { if (window._triggerFX) window._triggerFX(...args); }
    };
    GlobalStore.set('playerContext', _playerCtx);
    return _playerCtx;
}

window._getPlayerContext = getPlayerContext;