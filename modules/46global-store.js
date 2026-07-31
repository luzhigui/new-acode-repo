﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// modules/46global-store.js - 光明顶5v5 全局状态管理
// V5.3.1 | ~3600 bytes| 2026-07-18 第一步：收敛 window._* 全局变量
export const VER = 'modules/46global-store.js V5.3.1';

const _state = {
    fastForwardActive: false,
    voteScore: null,
    holyToken: null,
    voteChoice: null,
    battleHasZhang: false,
    bugMode: false,
    crashMode: 'fly',
    currentBattleState: null,
    battleStore: null,
    forceXiaoZhao: false,
    skipBuffPopup: false,
    battleEvents: [],
    currentBattleState: null
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
    get(key) { return _state[key]; },
    set(key, value) {
        _state[key] = value;
        if (_effects[key]) {
            try { _effects[key](value); } catch(e) { console.error('[GlobalStore] 副作用执行失败:', key, e); }
        }
        const fns = _listenersByKey[key];
        if (fns) fns.forEach(fn => { try { fn(value); } catch(e) {} });
    },
    on(key, fn) {
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

    // 引擎专用：追加一条战斗事件
    pushBattleEvent(event) {
        _state.battleEvents.push(event);
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

    // 引擎专用：替换当前战斗事件队列（读取并清空）
    flushBattleEvents() {
        const events = _state.battleEvents;
        _state.battleEvents = [];
        // 通知所有 battleEvents 的订阅者
        const fns = _listenersByKey['battleEvents'];
        if (fns) fns.forEach(fn => { try { fn(events); } catch(e) {} });
        return events;
    },

    // 引擎专用：更新当前战场快照
    updateBattleState(state) {
        _state.currentBattleState = state;
    }
};

// 所有兼容层已移除，统一使用 GlobalStore.get/set 读写状态
window.GlobalStore = GlobalStore;