// core/06-fsm.js - 光明顶5v5 轻量状态机
// V5.5.0 | ~1800 bytes| 2026-08-11 新增转换约束表
export const VER = 'core/06-fsm.js V5.5.0';

export class StateMachine {
    /**
     * @param {Object<string, {onEnter?: Function, onExit?: Function}>} states - 状态定义
     * @param {string} initialState - 初始状态名
     * @param {Object<string, string[]>} [transitions] - 可选，合法转换表 { fromState: [toState, ...] }
     *   不传则允许任意转换（兼容旧代码）
     */
    constructor(states, initialState, transitions) {
        this.states = states;
        this.current = initialState;
        this.previous = null;
        this.transitions = transitions || null;
    }

    /**
     * 状态转换
     * @param {string} newState - 目标状态名
     * @param {*} data - 传递给 onEnter/onExit 的数据
     * @returns {boolean} 是否允许转换（目标状态存在且合法则允许）
     */
    transition(newState, data) {
        const old = this.states[this.current];
        const next = this.states[newState];
        if (!next) {
            console.warn(`[FSM] 目标状态 "${newState}" 不存在，当前="${this.current}"`);
            return false;
        }
        // 转换约束检查
        if (this.transitions) {
            const allowed = this.transitions[this.current];
            if (!allowed || !allowed.includes(newState)) {
                console.warn(`[FSM] 非法转换: "${this.current}" → "${newState}"，允许: ${allowed ? allowed.join(', ') : '无'}`);
                return false;
            }
        }
        if (old && old.onExit) old.onExit(data);
        this.previous = this.current;
        this.current = newState;
        if (next.onEnter) next.onEnter(data);
        return true;
    }

    /** 检查是否在指定状态 */
    is(state) {
        return this.current === state;
    }
}