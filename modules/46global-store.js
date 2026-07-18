// modules/46global-store.js - 光明顶5v5 全局状态管理
// V5.1.0 | ~1200 bytes | 2026-07-18 第一步：收敛 window._* 全局变量
export const VER = 'modules/46global-store.js V5.1.0';

const _state = {
    fastForwardActive: false,
    voteScore: parseInt(localStorage.getItem('ming_vote_score_5v5_test') || '10'),
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

    // 引擎专用：追加一条战斗事件
    pushBattleEvent(event) {
        _state.battleEvents.push(event);
    },

    // 引擎专用：替换当前战斗事件队列（读取并清空）
    flushBattleEvents() {
        const events = _state.battleEvents;
        _state.battleEvents = [];
        return events;
    },

    // 引擎专用：更新当前战场快照
    updateBattleState(state) {
        _state.currentBattleState = state;
    }
};

// 向后兼容：逐步替换 window._* 的读写
// 阶段一：保留 window 挂载，但指向 Store 的值
Object.defineProperty(window, '_fastForwardActive', {
    get() { return _state.fastForwardActive; },
    set(v) { _state.fastForwardActive = v; },
    configurable: true
});
Object.defineProperty(window, '_voteScore', {
    get() { return _state.voteScore; },
    set(v) { _state.voteScore = v; localStorage.setItem('ming_vote_score_5v5_test', v); },
    configurable: true
});
Object.defineProperty(window, '_voteChoice', {
    get() { return _state.voteChoice; },
    set(v) { _state.voteChoice = v; },
    configurable: true
});
Object.defineProperty(window, '_battleHasZhang', {
    get() { return _state.battleHasZhang; },
    set(v) { _state.battleHasZhang = v; },
    configurable: true
});
Object.defineProperty(window, '_bugMode', {
    get() { return _state.bugMode; },
    set(v) { _state.bugMode = v; },
    configurable: true
});
Object.defineProperty(window, '_crashMode', {
    get() { return _state.crashMode; },
    set(v) { _state.crashMode = v; },
    configurable: true
});
Object.defineProperty(window, '_currentBattleState', {
    get() { return _state.currentBattleState; },
    set(v) { _state.currentBattleState = v; },
    configurable: true
});
Object.defineProperty(window, '_forceXiaoZhao', {
    get() { return _state.forceXiaoZhao; },
    set(v) { _state.forceXiaoZhao = v; },
    configurable: true
});