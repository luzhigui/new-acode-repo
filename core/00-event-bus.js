// core/00-event-bus.js - 光明顶5v5 事件总线
// V5.2.1 | ~600 bytes | 2026-07-28 信号系统基础设施
export const VER = 'core/00-event-bus.js V5.2.1';

class EventBus {
    constructor() {
        this._listeners = {};
    }

    /**
     * 注册监听器
     * @param {string} signal - 信号名
     * @param {number} priority - 优先级，数字越小越先执行
     * @param {function} callback - 回调函数
     */
    on(signal, priority, callback) {
        if (!this._listeners[signal]) {
            this._listeners[signal] = [];
        }
        // 去重：同一个回调函数不重复注册
        if (this._listeners[signal].some(l => l.callback === callback)) return;
        this._listeners[signal].push({ priority, callback });
        this._listeners[signal].sort((a, b) => a.priority - b.priority);
    }

    /**
     * 发射信号
     * @param {string} signal - 信号名
     * @param {object} data - 传递给监听器的数据
     */
    async emit(signal, data) {
        const listeners = this._listeners[signal];
        // 调试日志：信号发射时自动生成
        if (data && data.log && data.unit) {
            const logLevel = window._getPlayerContext?.()?.logLevel;
            if (logLevel === 'debug') {
                const name = data.unit ? data.unit.name : '?';
                const targetName = data.target ? data.target.name : '';
                const dmgStr = data.dmg !== undefined ? ` 伤害=${data.dmg}` : '';
                data.log.push({ type: 'signal', text: `<span class="gray">[信号] ${signal} → ${name}${targetName ? '→' + targetName : ''}${dmgStr}</span>` });
            }
        }
        if (!listeners || listeners.length === 0) return;
        const promises = [];
        for (const { callback } of listeners) {
            try {
                promises.push(callback(data));
            } catch (e) {
                console.error(`[EventBus] 信号 "${signal}" 的监听器执行出错:`, e);
            }
        }
        if (promises.length > 0) await Promise.all(promises);
    }

    /**
     * 清除某个信号上的所有监听器（用于调试或重置）
     */
    clear(signal) {
        delete this._listeners[signal];
    }

    /**
     * 清除所有信号上的所有监听器
     */
    clearAll() {
        this._listeners = {};
    }
}

export const eventBus = new EventBus();