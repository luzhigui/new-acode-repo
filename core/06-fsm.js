// core/06-fsm.js - 光明顶5v5 轻量状态机
// V5.4.0 | ~1200 bytes| 2026-08-10 关键单位显式FSM基础设施
export const VER = 'core/06-fsm.js V5.4.0';

export class StateMachine {
    /**
     * @param {Object<string, {onEnter?: Function, onExit?: Function}>} states - 状态定义
     * @param {string} initialState - 初始状态名
     */
    constructor(states, initialState) {
        this.states = states;
        this.current = initialState;
        this.previous = null;
    }

    /**
     * 状态转换
     * @param {string} newState - 目标状态名
     * @param {*} data - 传递给 onEnter/onExit 的数据
     * @returns {boolean} 是否允许转换（目标状态存在则允许）
     */
    transition(newState, data) {
        const old = this.states[this.current];
        const next = this.states[newState];
        if (!next) return false;
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