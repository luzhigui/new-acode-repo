// V6.1.0 | ~3400 bytes | 2026-09-10 单位状态观察裁判：机制登记"关心谁+条件+回调"，状态一变统一重判
// 用法：机制调用 watchUnit(unit, checkFn, onChange)，checkFn 返回布尔，条件翻转时触发 onChange。
// 裁判内部只订阅 SIGNAL_TYPES.ON_UNIT_STATE_CHANGE 一个信号，所有状态变化源自动兜住。
export const VER = 'core/19unit-watch.js V6.1.0';

import { eventBus } from '../infra/50-event-bus.js';
import { SIGNAL_TYPES } from '../infra/56-battle-enums.js';

// 观察登记表：[{ uid, checkFn, onChange, lastResult, token }]
const _watchers = [];
let _subscribed = false;

// 返回 token，供 unwatch 注销
let _tokenCounter = 0;

function ensureSubscribed() {
    if (_subscribed) return;
    _subscribed = true;
    eventBus.on(SIGNAL_TYPES.ON_UNIT_STATE_CHANGE, 50, (data) => {
        reevaluateAll(data);
    });
}

// 重新评估所有登记；只在 checkFn 结果发生翻转时触发 onChange
// fromType：本次触发的 changeType，传给 onChange 供回调区分来源（可选）
function reevaluateAll(trigger) {
    for (let i = _watchers.length - 1; i >= 0; i--) {
        const w = _watchers[i];
        let result;
        try {
            result = !!w.checkFn();
        } catch (e) {
            console.error('[19unit-watch] checkFn 执行出错:', e);
            continue;
        }
        if (result !== w.lastResult) {
            w.lastResult = result;
            try {
                w.onChange(result, trigger);
            } catch (e) {
                console.error('[19unit-watch] onChange 执行出错:', e);
            }
        }
    }
}

/**
 * 登记一个观察
 * @param {object} unit - 被关心的单位（用 uid 标识）
 * @param {function} checkFn - 返回布尔的条件判断，每次状态变化后重跑
 * @param {function} onChange - 条件翻转时回调 (result, trigger)，result 为当前布尔值
 * @returns {object} token，可传给 unwatch 注销
 */
export function watchUnit(unit, checkFn, onChange) {
    if (!unit || !unit.uid) return null;
    ensureSubscribed();
    const token = { uid: unit.uid, id: ++_tokenCounter };
    // 初始评估：登记时先跑一次
    let initial = false;
    try { initial = !!checkFn(); } catch (e) { initial = false; }
    _watchers.push({
        uid: unit.uid,
        checkFn,
        onChange,
        lastResult: initial,
        token
    });
    // 关键：若登记时条件已成立，立即触发一次 onChange
    //   否则该条件永远为 true、等不到"翻转"，机制会卡死（该响应不响应）
    //   正常路径下不会走到这里（张无忌的 fsm 初始态已正确），这是安全网
    if (initial) {
        try {
            onChange(true, { unitUid: unit.uid, changeType: null, log: null, initial: true });
        } catch (e) {
            console.error('[19unit-watch] 初始 onChange 执行出错:', e);
        }
    }
    return token;
}

// 注销观察
export function unwatchUnit(token) {
    if (!token) return;
    const idx = _watchers.findIndex(w => w.token === token);
    if (idx >= 0) _watchers.splice(idx, 1);
}

// 注销某单位的全部观察（单位死亡时调用）
export function unwatchAllForUnit(uid) {
    for (let i = _watchers.length - 1; i >= 0; i--) {
        if (_watchers[i].uid === uid) _watchers.splice(i, 1);
    }
}

// 战斗重置：清空所有观察
// 注意：eventBus.clearAll 会删掉 ON_UNIT_STATE_CHANGE 的订阅，所以这里要重置 _subscribed
// 让下次 watchUnit 时重新订阅，否则裁判收不到信号
export function clearAllWatchers() {
    _watchers.length = 0;
    _subscribed = false;
}