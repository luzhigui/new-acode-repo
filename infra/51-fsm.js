// infra/51-fsm.js - 光明顶5v5 轻量状态机
// V5.5.0 | ~1800 bytes| 2026-08-17 从core/06迁移至infra
export const VER = 'infra/51-fsm.js V5.5.0';

export class StateMachine {
    constructor(states, initialState, transitions) {
        this.states = states;
        this.current = initialState;
        this.previous = null;
        this.transitions = transitions || null;
    }

    transition(newState, data) {
        const old = this.states[this.current];
        const next = this.states[newState];
        if (!next) {
            console.warn(`[FSM] 目标状态 "${newState}" 不存在，当前="${this.current}"`);
            return false;
        }
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

    is(state) {
        return this.current === state;
    }
}