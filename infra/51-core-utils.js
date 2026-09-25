// V6.1.1 | ~5800 bytes | 2026-09-26 StateMachine 加第4参 onChange 相位回调（供 unit.state._fsmPhase 镜像）；含 fmtHp 血量显示统一入口
export const VER = 'infra/51-core-utils.js V6.1.1';

import { CAMP_TYPES, ROLE_TYPES } from './56-battle-enums.js';

// StateMachine
// 通用有限状态机，transition 校验目标状态和转换表
export class StateMachine {
    constructor(states, initialState, transitions, onChange) {
        this.states = states;
        this.current = initialState;
        this.previous = null;
        this.transitions = transitions || null;
        // 相位回调：调用方用它把 current 镜像到外部字段（如 unit.state._fsmPhase），
        // 渲染层只读镜像值，不再直接持有 StateMachine 实例（妆造剥离）
        this.onChange = onChange || null;
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
        // 必须先于 onEnter 回调：onEnter 里可能再 transition（如 张无忌 switching→near），
        //   后置回调会被外层旧相位覆盖，与 this.current 打架
        if (this.onChange) this.onChange(newState);
        if (next.onEnter) next.onEnter(data);
        return true;
    }

    is(state) {
        return this.current === state;
    }
}

// 确定性随机数（原52-rng.js）
export class SeededRNG {
    constructor(seed) {
        if (typeof seed === 'string') {
            let h = 0;
            for (let i = 0; i < seed.length; i++) {
                h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
            }
            seed = h;
        }
        this._state = seed >>> 0;
    }

    // xorshift32，返回 [0,1)
    next() {
        let t = this._state;
        t ^= t << 13;
        t ^= t >> 17;
        t ^= t << 5;
        this._state = t >>> 0;
        return (t >>> 0) / 4294967296;
    }

    nextInt(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    getState() {
        return this._state;
    }

    setState(state) {
        this._state = state >>> 0;
    }
}

// 战斗事件与状态存储（原53-battle-event-store.js）
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

// 持久化接口：core 层经此间接访问 localStorage，避免跨层直读浏览器 API
export function persistValue(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (e) { /* Worker 环境或隐私模式无 localStorage，静默失败 */ }
}

export function loadPersistedValue(key, defaultValue = 0) {
    try {
        const v = localStorage.getItem(key);
        return v !== null ? parseInt(v, 10) : defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

// 纯战斗数学/几何工具（原55-battle-math.js）
export function calcDamage(atk, def) {
    if (def <= 0) return atk;
    let d = atk * (atk / (atk + def));
    return Math.max(d, atk * 0.1);
}

export function getFangLevelPure(def, m, levels) {
    let ratio = def / m;
    for (let i = levels.length - 1; i >= 0; i--) {
        if (ratio >= levels[i]) return i;
    }
    return 0;
}

export function makeFXSnapshot(attacker, defender) {
    return { attackerPos: attacker ? attacker.pos : null, defenderPos: defender ? defender.pos : null };
}

// 渲染层血量显示统一入口：0 < hp < 1 时至少显示 1（0.051 显示成 0 看着像死了）。
// 已接入：render/30、render/32、ui/62、ui/65，以及引擎 fact 构造处 core/10、core/12、core/15。
export function fmtHp(v) {
    if (!(v > 0)) return 0;
    return Math.max(1, Math.floor(v));
}

export function getUnitRow(pos) { return Math.ceil(pos / 3); }

export function getUnitCol(pos) { return (pos - 1) % 3 + 1; }

export function getAdjacentPositions(pos) {
    const row = getUnitRow(pos), col = getUnitCol(pos);
    let adj = [];
    for (let r = row - 1; r <= row + 1; r++) {
        for (let c = col - 1; c <= col + 1; c++) {
            if (r === row && c === col) continue;
            if (r >= 1 && r <= 3 && c >= 1 && c <= 3) adj.push((r - 1) * 3 + c);
        }
    }
    return adj;
}

export function countEnemyEmptyCols(enemySide) {
    const cols = [[1, 4, 7], [2, 5, 8], [3, 6, 9]];
    let count = 0;
    for (const poses of cols) {
        if (!enemySide.some(u => u.alive && poses.includes(u.pos))) count++;
    }
    return count;
}

// 全员血量低于 40% 时每单位给飞行单位 +3 攻
export function getBloodAuraBonus(allUnits) {
    let totalBonus = 0;
    allUnits.forEach(u => {
        if (!u.alive) return;
        const pct = u.hp / u.maxHp;
        if (pct < 0.4) totalBonus += 3;
    });
    return totalBonus;
}

export function getAuraBonuses(unit, allySide, enemySide) {
    if (unit.role !== ROLE_TYPES.FLYER || unit.isHorse) return { emptyCol: 0, bloodAura: 0 };
    const isAlly = unit.camp === CAMP_TYPES.ALLY;
    const mySide = isAlly ? allySide : enemySide;
    const oppSide = isAlly ? enemySide : allySide;
    const emptyCols = countEnemyEmptyCols(oppSide);
    const allUnits = mySide.concat(oppSide);
    const bloodBonus = getBloodAuraBonus(allUnits);
    return { emptyCol: emptyCols * 5, bloodAura: bloodBonus };
}

// 闪避规则注册表（原 core/12 迁移）
const _dodgeRules = [];

export function registerDodgeRule(fn) {
    _dodgeRules.push(fn);
}

export function clearEliteDodgeRules() {
    _dodgeRules.length = 2;
}

export function getDodgeRules() {
    return _dodgeRules;
}