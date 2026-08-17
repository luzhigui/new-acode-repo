// infra/53-battle-event-store.js - 光明顶5v5 战斗事件与状态存储
// V5.5.0 | ~1400 bytes| 2026-08-17 从core/09迁移至infra
export const VER = 'infra/53-battle-event-store.js V5.5.0';

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

const _battleState = {};
const _battleStateKeys = new Set(['currentStage', 'holyToken', 'chestCount', 'currentBattleState']);

export function getBattleState(key) {
    return _battleState[key];
}

export function setBattleState(key, value) {
    _battleState[key] = value;
}

export function isBattleStateKey(key) {
    return _battleStateKeys.has(key);
}