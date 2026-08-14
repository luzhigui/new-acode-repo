﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// modules/18global-store.js - 光明顶5v5 全局状态管理
// V5.4.0 | ~3700 bytes| 2026-08-12 战斗事件/状态桥接至 core/09-battle-event-store.js
export const VER = 'modules/18global-store.js V5.4.0';

import { pushBattleEvent, flushBattleEvents, onBattleEvents, getBattleState, setBattleState, isBattleStateKey } from '../core/09-battle-event-store.js';
import { CONFIG } from '../core/01config-5v5-test.js';
import { getBattleRng } from '../core/13battle-shared.js';

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

    // 通用读写（取代 window._* 直接访问）
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

    // 引擎专用：追加一条战斗事件（桥接至 core/09-battle-event-store.js）
    pushBattleEvent(event) {
        pushBattleEvent(event);
    },

    // 统一状态变更入口：直接 dispatch action 到 GlobalStore
    dispatch(action) {
        if (!action || !action.type) return;
        // 写入 _state
        if (action.payload) {
            Object.assign(_state, action.payload);
        }
        // 通知所有订阅者
        _listeners.forEach(fn => { try { fn(_state, action); } catch(e) {} });
        // 通知按 key 订阅的监听者
        const fns = _listenersByKey[action.type];
        if (fns) fns.forEach(fn => { try { fn(action.payload); } catch(e) {} });
        // 触发副作用
        if (_effects[action.type]) {
            try { _effects[action.type](action.payload); } catch(e) {}
        }
    },

    // 引擎专用：替换当前战斗事件队列（读取并清空，桥接至 core/09-battle-event-store.js）
    flushBattleEvents() {
        return flushBattleEvents();
    },

    // 引擎专用：更新当前战场快照
    updateBattleState(state) {
        _state.currentBattleState = state;
    }
};

// 所有兼容层已移除，统一使用 GlobalStore.get/set 读写状态
window.GlobalStore = GlobalStore;

// ==================== 状态读写器 — 供 player/ 和 ui/ 共用，避免循环依赖 ====================
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
        if (typeof window !== 'undefined' && window._syncGs) window._syncGs(v);
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

// ==================== Buff 工厂 — 供 player/ 和 ui/ 共用 ====================
export function createBuffObject(key, duration) {
    const buff = { key, target: 'ally', remaining: duration, name: CONFIG.BUFFS[key]?.name || key };
    if (key === 'holyFlame') {
        const cols = [];
        const rng = getBattleRng();
        while (cols.length < 2) { const c = rng.nextInt(1, 3); if (!cols.includes(c)) cols.push(c); }
        cols.sort((a, b) => a - b);
        const rows = [];
        while (rows.length < 2) { const r = rng.nextInt(1, 3); if (!rows.includes(r)) rows.push(r); }
        rows.sort((a, b) => a - b);
        buff.cols = cols;
        buff.rows = rows;
    }
    return buff;
}

// ==================== 玩家上下文工具函数（仅依赖 GlobalStore 和 DOM） ====================
// 等待-暂停恢复：当 isPaused 为 true 时轮询等待
function waitWhilePaused() {
    return new Promise(r => {
        const check = () => {
            if (!GlobalStore.get('isPaused')) { r(); return; }
            setTimeout(check, 100);
        };
        check();
    });
}
// 日志-自动滚动：仅在用户未手动滚动时滚动到底部
function autoScrollLog() {
    if (GlobalStore.get('userScrolled')) return;
    const logDiv = document.getElementById('log');
    if (logDiv) logDiv.scrollTop = logDiv.scrollHeight;
}
// 日志-用户滚动检测：判断用户是否已手动上滚
function onLogUserScroll() {
    const logDiv = document.getElementById('log');
    if (!logDiv) return;
    const distToBottom = logDiv.scrollHeight - logDiv.scrollTop - logDiv.clientHeight;
    GlobalStore.set('userScrolled', distToBottom > 10);
}
// 积分-更新徽章
function updateScoreBadge() {
    const badge = document.getElementById('scoreBadge');
    const score = GlobalStore.get('voteScore');
    const token = GlobalStore.get('holyToken');
    const displayScore = (score === null || score === undefined) ? 0 : score;
    const displayToken = (token === null || token === undefined) ? 0 : token;
    if (badge) badge.innerHTML = `🏆 ${displayScore}分 🔥${displayToken}`;
}
window.updateScoreBadge = updateScoreBadge;

// ==================== 玩家上下文 — 供 player/ 使用，ui 方法通过 window 桥接 ====================
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
            if (typeof window._updateBuffSlotsFn === 'function') window._updateBuffSlotsFn(buffs, GlobalStore.get('selectedBuffIndex'));
        },
        get selectedBuffIndex() { return GlobalStore.get('selectedBuffIndex'); },
        set selectedBuffIndex(v) { GlobalStore.set('selectedBuffIndex', v); },
        get currentDoubleStrikeUid() { return GlobalStore.get('currentDoubleStrikeUid'); },
        set currentDoubleStrikeUid(v) { GlobalStore.set('currentDoubleStrikeUid', v); },
        get dodgeEffectEnabled() { return GlobalStore.get('dodgeEffectEnabled'); },
        set dodgeEffectEnabled(v) { GlobalStore.set('dodgeEffectEnabled', v); },
        get store() { return window._battleStore; },
        set store(v) { window._battleStore = v; },

        // ui 方法 — 通过 window 桥接，由 ui/33main-state.js 在加载时注册
        updateUI: () => { if (window._updateUI) window._updateUI(); },
        spawnVictoryEffects: (...args) => { if (window._spawnVictoryEffects) window._spawnVictoryEffects(...args); },
        updateButtons: window.updateButtons,
        enableAllButtons: window.enableAllButtons,
        updateSpeedButtons: window.updateSpeedButtons,
        waitWhilePaused,
        autoScrollLog,
        onLogUserScroll,
        updateScoreBadge,
        tickBuffDurations: () => { if (window._tickBuffDurations) window._tickBuffDurations(); },
        fadeBGMTo: (targetVol, durationMs) => { if (window._fadeBGMTo) window._fadeBGMTo(targetVol, durationMs); },
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