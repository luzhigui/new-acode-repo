// core/09-battle-event-store.js - core层战斗事件与状态存储
// V5.4.0 | ~1200 bytes| 2026-08-12 core层定义接口，modules层GlobalStore桥接
export const VER = 'core/09-battle-event-store.js V5.4.0';

// ==================== 战斗事件缓冲区 ====================
let _eventBuffer = [];
const _eventSubscribers = [];

export function pushBattleEvent(event) {
    _eventBuffer.push(event);
}

export function flushBattleEvents() {
    const events = _eventBuffer;
    _eventBuffer = [];
    for (const fn of _eventSubscribers) {
        try { fn(events); } catch(e) {}
    }
    return events;
}

export function onBattleEvents(fn) {
    if (!_eventSubscribers.includes(fn)) _eventSubscribers.push(fn);
    return () => {
        const i = _eventSubscribers.indexOf(fn);
        if (i >= 0) _eventSubscribers.splice(i, 1);
    };
}

// ==================== 战斗状态（core层自有，GlobalStore桥接同步） ====================
const _battleState = {};

// 这些key由core层拥有，GlobalStore的get/set会对这些key做桥接
const _battleStateKeys = new Set(['currentStage', 'holyToken', 'chestCount']);

export function getBattleState(key) {
    return _battleState[key];
}

export function setBattleState(key, value) {
    _battleState[key] = value;
}

export function isBattleStateKey(key) {
    return _battleStateKeys.has(key);
}
