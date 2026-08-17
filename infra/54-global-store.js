// infra/54-global-store.js - 光明顶5v5 全局状态管理
// V5.5.0 | ~3700 bytes| 2026-08-17 从modules/23迁移至infra
export const VER = 'infra/54-global-store.js V5.5.0';

import { pushBattleEvent, flushBattleEvents, onBattleEvents, getBattleState, setBattleState, isBattleStateKey } from './53-battle-event-store.js';

const _state = {
    fastForwardActive: false,
    voteScore: null,
    voteChoice: null,
    battleHasZhang: false,
    bugMode: false,
    crashMode: 'fly',
    currentBattleState: null,
    battleStore: null,
    forceXiaoZhao: false,
    skipBuffPopup: false
};

const _listeners = [];
const _listenersByKey = {};
const _effects = {};
const _uiHandlers = {};

export const GlobalStore = {
    getState() {
        return _state;
    },

    setState(partial) {
        Object.assign(_state, partial);
        _listeners.forEach(fn => { try { fn(_state, partial); } catch(e) {} });
    },

    subscribe(fn) {
        _listeners.push(fn);
        return () => {
            const i = _listeners.indexOf(fn);
            if (i >= 0) _listeners.splice(i, 1);
        };
    },

    get(key) {
        if (isBattleStateKey(key)) return getBattleState(key);
        return _state[key];
    },
    set(key, value) {
        if (isBattleStateKey(key)) {
            setBattleState(key, value);
        } else {
            _state[key] = value;
        }
        if (_effects[key]) {
            try { _effects[key](value); } catch(e) { console.error('[GlobalStore] 副作用执行失败:', key, e); }
        }
        const fns = _listenersByKey[key];
        if (fns) fns.forEach(fn => { try { fn(value); } catch(e) {} });
    },
    on(key, fn) {
        if (key === 'battleEvents') return onBattleEvents(fn);
        if (!_listenersByKey[key]) _listenersByKey[key] = [];
        _listenersByKey[key].push(fn);
        return () => {
            const arr = _listenersByKey[key];
            if (arr) {
                const i = arr.indexOf(fn);
                if (i >= 0) arr.splice(i, 1);
            }
        };
    },
    off(key, fn) {
        const arr = _listenersByKey[key];
        if (arr) {
            const i = arr.indexOf(fn);
            if (i >= 0) arr.splice(i, 1);
        }
    },
    effect(key, fn) {
        _effects[key] = fn;
    },

    pushBattleEvent(event) {
        pushBattleEvent(event);
    },

    dispatch(action) {
        if (!action || !action.type) return;
        if (action.payload) {
            Object.assign(_state, action.payload);
        }
        _listeners.forEach(fn => { try { fn(_state, action); } catch(e) {} });
        const fns = _listenersByKey[action.type];
        if (fns) fns.forEach(fn => { try { fn(action.payload); } catch(e) {} });
        if (_effects[action.type]) {
            try { _effects[action.type](action.payload); } catch(e) {}
        }
    },

    flushBattleEvents() {
        return flushBattleEvents();
    },

    updateBattleState(state) {
        _state.currentBattleState = state;
    },
    setUIHandler(name, fn) {
        _uiHandlers[name] = fn;
    },
    getUIHandler(name) {
        return _uiHandlers[name];
    }
};

window.GlobalStore = GlobalStore;

export const getState = {
    gs: () => GlobalStore.get('gs'),
    autoMode: () => GlobalStore.get('autoMode'),
    debugMode: () => GlobalStore.get('debugMode'),
    isPaused: () => GlobalStore.get('isPaused'),
    speed: () => GlobalStore.get('speed'),
    userScrolled: () => GlobalStore.get('userScrolled'),
    abortController: () => GlobalStore.get('abortController'),
    waitingForNextRound: () => GlobalStore.get('waitingForNextRound'),
    logLevel: () => GlobalStore.get('logLevel'),
    battleResultForInfo: () => GlobalStore.get('battleResultForInfo'),
    gameStarted: () => GlobalStore.get('gameStarted'),
    manualSpeedLock: () => false,
    manualSpeedValue: () => null,
    slideSpeedActive: () => false,
    isBattleStarting: () => GlobalStore.get('isBattleStarting'),
    adjustMode: () => GlobalStore.get('adjustMode'),
    selectedAdjustPos: () => GlobalStore.get('selectedAdjustPos'),
    currentStage: () => GlobalStore.get('currentStage'),
    dodgeEffectEnabled: () => GlobalStore.get('dodgeEffectEnabled'),
    selectedBuffIndex: () => GlobalStore.get('selectedBuffIndex'),
    currentDoubleStrikeUid: () => GlobalStore.get('currentDoubleStrikeUid'),
    activeBuffs: () => GlobalStore.get('activeBuffs'),
    autoLevel: () => GlobalStore.get('autoLevel'),
    snapshot: () => GlobalStore.get('snapshot'),
    UI: () => GlobalStore.get('UI')
};

export const setState = {
    gs: (v) => {
        GlobalStore.set('gs', v);
    },
    autoMode: (v) => GlobalStore.set('autoMode', v),
    debugMode: (v) => GlobalStore.set('debugMode', v),
    isPaused: (v) => GlobalStore.set('isPaused', v),
    speed: (v) => { GlobalStore.set('speed', v); if (typeof window !== 'undefined' && window.updateSpeedButtons) window.updateSpeedButtons(); },
    userScrolled: (v) => GlobalStore.set('userScrolled', v),
    abortController: (v) => GlobalStore.set('abortController', v),
    waitingForNextRound: (v) => GlobalStore.set('waitingForNextRound', v),
    logLevel: (v) => GlobalStore.set('logLevel', v),
    battleResultForInfo: (v) => GlobalStore.set('battleResultForInfo', v),
    gameStarted: (v) => GlobalStore.set('gameStarted', v),
    isBattleStarting: (v) => GlobalStore.set('isBattleStarting', v),
    adjustMode: (v) => GlobalStore.set('adjustMode', v),
    selectedAdjustPos: (v) => GlobalStore.set('selectedAdjustPos', v),
    currentStage: (v) => GlobalStore.set('currentStage', v),
    dodgeEffectEnabled: (v) => GlobalStore.set('dodgeEffectEnabled', v),
    selectedBuffIndex: (v) => GlobalStore.set('selectedBuffIndex', v),
    currentDoubleStrikeUid: (v) => GlobalStore.set('currentDoubleStrikeUid', v),
    activeBuffs: (v) => GlobalStore.set('activeBuffs', v),
    autoLevel: (v) => GlobalStore.set('autoLevel', v),
    snapshot: (v) => GlobalStore.set('snapshot', v),
    UI: (v) => GlobalStore.set('UI', v)
};

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
    const logDiv = document.getElementById('log');
    if (logDiv) logDiv.scrollTop = logDiv.scrollHeight;
}
function onLogUserScroll() {
    const logDiv = document.getElementById('log');
    if (!logDiv) return;
    const distToBottom = logDiv.scrollHeight - logDiv.scrollTop - logDiv.clientHeight;
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

let _playerCtx = null;
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
            const fn = GlobalStore.getUIHandler('updateBuffSlots');
            if (fn) fn(buffs, GlobalStore.get('selectedBuffIndex'));
        },
        get selectedBuffIndex() { return GlobalStore.get('selectedBuffIndex'); },
        set selectedBuffIndex(v) { GlobalStore.set('selectedBuffIndex', v); },
        get currentDoubleStrikeUid() { return GlobalStore.get('currentDoubleStrikeUid'); },
        set currentDoubleStrikeUid(v) { GlobalStore.set('currentDoubleStrikeUid', v); },
        get dodgeEffectEnabled() { return GlobalStore.get('dodgeEffectEnabled'); },
        set dodgeEffectEnabled(v) { GlobalStore.set('dodgeEffectEnabled', v); },
        get store() { return GlobalStore.get('battleStore'); },
        set store(v) { GlobalStore.set('battleStore', v); },

        updateUI: () => { const fn = GlobalStore.getUIHandler('updateUI'); if (fn) fn(); },
        spawnVictoryEffects: (...args) => { const fn = GlobalStore.getUIHandler('spawnVictoryEffects'); if (fn) fn(...args); },
        updateButtons: window.updateButtons,
        enableAllButtons: window.enableAllButtons,
        updateSpeedButtons: window.updateSpeedButtons,
        waitWhilePaused,
        autoScrollLog,
        onLogUserScroll,
        updateScoreBadge,
        tickBuffDurations: () => { const fn = GlobalStore.getUIHandler('tickBuffDurations'); if (fn) fn(); },
        fadeBGMTo: (targetVol, durationMs) => { const fn = GlobalStore.getUIHandler('fadeBGMTo'); if (fn) fn(targetVol, durationMs); },
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