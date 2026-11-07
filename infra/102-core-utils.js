export const VER = 'infra/102-core-utils.js V6.1.5';

import { CAMP_TYPES, ROLE_TYPES } from './106-battle-enums.js';
import { validateStoreValue } from './107-store-schema.js';

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
    // battle 桶的唯一写入点：schema 校验在这里做，104 的 set 直接委托过来
    validateStoreValue(key, value);
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

// 显示层统一取整入口（引擎内部一律实数；只有这里取整，且绝不回写数据）：
//   数值 ≥10 → 显示整数（四舍五入）；数值 <10 → 显示一位小数（四舍五入）。
//   例：15.899999999999999 → 16；0.30000000000000004 → 0.3。
export function fmtNum(v) {
    if (typeof v !== 'number' || !isFinite(v)) return v;
    return v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
}

// 攻击力显示下限（老板规则 2026-11-08）：引擎保留负数攻击力真值（如众志补员吃防战 atk-8 加成后为负），
//   只在显示出口把 <0 钳成 0，别让玩家看到「攻-7」。只做下限，不改调用点原有的取整口径（Math.floor/round/fmtNum）。
export function fmtAtk(v) {
    return typeof v === 'number' && v < 0 ? 0 : v;
}

// 血量数值快照入口（fact 字段 / 血条 / 动效目标值）：只取整，不加下限。
export function fmtHp(v) {
    if (!(v > 0)) return 0;
    return fmtNum(v);
}

// 玩家可见的血量数字文本（老板规则 2026-11-07）：存活单位最少显示 1 —— 0.6 血显示「1」、0.4 也显示「1」；
//   0 仍显示 0（死亡单位归零后不会被抬成 1）。叠在 fmtNum「<10 一位小数 / ≥10 取整」之上，只改文本，不回写引擎数值。
//   第二参 alive 只给「上游已把 hp 取整成 0」的老数据用（如 PASS fact 的 Math.floor）：存活 → 仍显示 1，死亡 → 0。
export function fmtHpText(v, alive = false) {
    if (!(v > 0)) return alive ? 1 : 0;
    const n = fmtNum(v);
    return n < 1 ? 1 : n;
}

// 兼容旧名：所有 fmt1 调用点自动走统一取整规则
export function fmt1(v) {
    return fmtNum(v);
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

// 全员血量低于 40% 时每单位给飞行单位 +2 攻
export function getBloodAuraBonus(allUnits) {
    let totalBonus = 0;
    allUnits.forEach(u => {
        if (!u.alive) return;
        const pct = u.hp / u.maxHp;
        if (pct < 0.4) totalBonus += 2;
    });
    return totalBonus;
}

// 形参语义（2026-11-05 修正）：mySide = 本队，oppSide = 对方队。
//   原形参名为 allySide/enemySide，内部又按 unit.camp 做了一次翻转——
//   但 core/210 传进来时已经是 (自己队伍, 对方队伍)，二次翻转导致六大派看自己的空列。
export function getAuraBonuses(unit, mySide, oppSide) {
    if (unit.isHorse) return { emptyCol: 0, bloodAura: 0 };
    // 空列光环：2026-11-02 起全局所有职业生效；看对方队伍空列，每空一列 +2 攻
    const emptyCol = countEnemyEmptyCols(oppSide) * 2;
    // 残血光环：飞行专属；全场每个 <40% 存活单位 +2 攻
    const bloodAura = unit.role === ROLE_TYPES.FLYER ? getBloodAuraBonus(mySide.concat(oppSide)) : 0;
    return { emptyCol, bloodAura };
}