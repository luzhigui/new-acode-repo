export const VER = 'infra/104-global-store.js V6.1.1';
// V6.1.1 | 2026-11-10 删除 slideSpeedActive 两个恒 false 的死桩（getState.slideSpeedActive / STATE getter）：
//   它既不在 112-store-schema 的 67 键白名单里，也没有 setter，全仓无任何消费方——
//   ui/718-speed-controls.js 自己维护同名模块级变量，与 store 无关。
//   留着它会让人以为「store 里有个可读的滑速状态」，实际永远是 false，属指错方向的假接口。

import { pushBattleEvent, flushBattleEvents, onBattleEvents, getBattleState, setBattleState, isBattleStateKey } from './102-core-utils.js';
import { UI_HANDLER_KEYS } from './106-battle-enums.js';
import { validateStoreValue, isStoreKey } from './112-store-schema.js';

// UIHandler 键校验：非法键立即抛错（不再靠拼写正确才生效）；合法但尚未注册仍返回 undefined，
//   保留调用点 `const fn = getUIHandler(k); if (fn) fn()` 的加载时序语义。
const _uiHandlerKeys = new Set(Object.values(UI_HANDLER_KEYS));
function assertUIHandlerKey(name, api) {
    if (!_uiHandlerKeys.has(name)) {
        throw new Error(`[GlobalStore.${api}] 非法 UIHandler key='${String(name)}'（须为 infra/106 UI_HANDLER_KEYS 之一）`);
    }
}

const _state = {
    fastForwardActive: false,
    voteScore: null,
    voteChoice: null,
    battleHasZhang: false,
    crashMode: 'fly',
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
        // 逐键校验后再落库；battle 桶的键不在这里写（统一走 set 的路由）
        for (const key of Object.keys(partial || {})) {
            if (!isBattleStateKey(key)) validateStoreValue(key, partial[key]);
        }
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
            // 102 的 setBattleState 内部做同一套 schema 校验（单一校验点，避免双报）
            setBattleState(key, value);
        } else {
            validateStoreValue(key, value);
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
            // 只校验已注册的 store 键；非 store 字段沿用原行为（dispatch 当前无调用点）
            for (const key of Object.keys(action.payload)) {
                if (isStoreKey(key) && !isBattleStateKey(key)) validateStoreValue(key, action.payload[key]);
            }
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
        // 真值只在 _battleState（102），不再留 _state 死副本
        setBattleState('currentBattleState', state);
    },
    setUIHandler(name, fn) {
        assertUIHandlerKey(name, 'setUIHandler');
        _uiHandlers[name] = fn;
    },
    getUIHandler(name) {
        assertUIHandlerKey(name, 'getUIHandler');
        return _uiHandlers[name];
    }
};

// Worker 环境无 window，先补再挂，工具链 109/116 依赖
if (typeof window === 'undefined') globalThis.window = globalThis;
window.GlobalStore = GlobalStore;

// 提供 get/set 便捷 API，实际存储统一在 GlobalStore
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
    speed: (v) => { GlobalStore.set('speed', v); const fn = GlobalStore.getUIHandler('updateSpeedButtons'); if (fn) fn(); },
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
// infra 不摸 document：日志/徽章渲染归 player/47，此处只经 UIHandler 通道调用。
// 页面内消费方一律 import 或走 UIHandler，禁止 window 桥。

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
        updateButtons: () => { const fn = GlobalStore.getUIHandler('updateButtons'); if (fn) fn(); },
        enableAllButtons: () => { const fn = GlobalStore.getUIHandler('enableAllButtons'); if (fn) fn(); },
        updateSpeedButtons: () => { const fn = GlobalStore.getUIHandler('updateSpeedButtons'); if (fn) fn(); },
        waitWhilePaused,
        // V7.5.12：DOM 实现迁 player/47，此处只留 UIHandler 间接通道（消费方 c.autoScrollLog() / c.updateScoreBadge() 调用方式不变）
        autoScrollLog: () => { const fn = GlobalStore.getUIHandler('autoScrollLog'); if (fn) fn(); },
        updateScoreBadge: () => { const fn = GlobalStore.getUIHandler('updateScoreBadge'); if (fn) fn(); },
        tickBuffDurations: () => { const fn = GlobalStore.getUIHandler('tickBuffDurations'); if (fn) fn(); },
        fadeBGMTo: (targetVol, durationMs) => { const fn = GlobalStore.getUIHandler('fadeBGMTo'); if (fn) fn(targetVol, durationMs); },
        _battleEnded: false,
        _originalSpeed: null,
        swapAllyPositions: (...args) => { const fn = GlobalStore.getUIHandler('swapAllyPositions'); if (fn) fn(...args); }
    };
    GlobalStore.set('playerContext', _playerCtx);
    return _playerCtx;
}
// 原 window._getPlayerContext = getPlayerContext 已删：消费方（62/64/65/68）改为直接 import