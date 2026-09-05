// modules/24battle-store.js - 光明顶5v5 战斗Store工厂
// V5.6.1 | ~11800 bytes| 2026-08-26 GAME_STATE_FIELDS 删 _phantomTarget/_masteredRoles（已迁 18-elite-state）
export const VER = 'modules/24battle-store.js V5.6.1';

import { STORE_ACTION_TYPES, UNIT_EVENT_TYPES } from '../infra/56-battle-enums.js';
import { ROUND_STATE_KEYS, BATTLE_STATE_KEYS } from '../core/17-state-keys.js';

const ALL_STATE_KEYS = [...ROUND_STATE_KEYS, ...BATTLE_STATE_KEYS];

// 顶层字段清单：加新顶层字段只补这里
const UNIT_TOP_FIELDS = [
    'hp', 'maxHp', 'alive', 'atk', 'def', 'role',
    'buffAtkBonus', 'buffDefBonus', 'buffDodgeBonus', 'buffHpBonus',
    'dmgDealt', 'dmgTaken', 'healDone', 'reboundDone', 'leechDone',
    'dodgeCount', 'critCount', 'survivedRounds',
    '_baseAtk', '_baseDef', '_baseMaxHp',
    'rangedForm'
];

// ==================== Store 工厂 ====================
export function createStore(initialState, reducer) {
    let state = initialState;
    const listeners = [];
    return {
        getState: () => state,
        dispatch: (action) => {
            const next = reducer(state, action);
            if (next === state) return;
            state = next;
            listeners.forEach(fn => { try { fn(state, action); } catch(e) { console.error('Store subscriber error:', e); } });
        },
        subscribe: (fn) => { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; }
    };
}

// ==================== 战斗 Reducer ====================

// UI 格子显示通过 dispatch → reducer → store 订阅 → renderGrid 完成
export function battleReducer(state, action) {
    if (!Object.values(STORE_ACTION_TYPES).includes(action.type)) {
        console.error(`[battleReducer] 未知 action type: ${action.type}`);
        return state;
    }
    switch (action.type) {
        case STORE_ACTION_TYPES.INIT: return state;
        case STORE_ACTION_TYPES.SET_FLASH: {
            let next = state.units.map(u => {
                if (u.uid !== action.uid) return u;
                return { ...u, _flash: action.flash };
            });
            return { ...state, units: next };
        }
        case STORE_ACTION_TYPES.SET_VISUAL: {
            let next = state.units.map(u => {
                if (u.uid !== action.uid) return u;
                const newState = { ...(u.state || {}) };
                for (const key of ALL_STATE_KEYS) {
                    if (action[key] !== undefined) newState[key] = action[key];
                }
                const updated = { ...u, state: newState };
                if (action._hasKuaiLe !== undefined) updated._hasKuaiLe = action._hasKuaiLe;
                if (action._hasXingFen !== undefined) updated._hasXingFen = action._hasXingFen;
                return updated;
            });
            return { ...state, units: next };
        }
        case STORE_ACTION_TYPES.CLEAR_ALL_FLASH: {
            let next = state.units.map(u => ({ ...u, _flash: null }));
            return { ...state, units: next };
        }
        case STORE_ACTION_TYPES.CLEAR_UNIT_FLASH: {
            let next = state.units.map(u => {
                if (u.uid !== action.uid) return u;
                return { ...u, _flash: null };
            });
            return { ...state, units: next };
        }
        case STORE_ACTION_TYPES.APPLY_EVENTS: {
            const events = action.events;
            if (!events || events.length === 0) return state;
            let next = state.units.map(u => ({ ...u }));
            for (const ev of events) {
                if (ev.eventType === UNIT_EVENT_TYPES.HP_CHANGE || ev.eventType === UNIT_EVENT_TYPES.STAT_BONUS_CHANGE || ev.eventType === UNIT_EVENT_TYPES.ZHANG_SWITCH) {
                    const idx = next.findIndex(u => u.uid === ev.unitUid);
                    if (idx >= 0) {
                        const p = ev.payload;
                        for (const key of UNIT_TOP_FIELDS) {
                            if (p[key] !== undefined) next[idx][key] = p[key];
                        }
                        if (!next[idx].state) next[idx].state = {};
                        for (const key of ALL_STATE_KEYS) {
                            if (p[key] !== undefined) next[idx].state[key] = p[key];
                        }
                    }
                // 新增单位（拒马）默认战斗统计字段清零
                } else if (ev.eventType === UNIT_EVENT_TYPES.UNIT_ADD) {
                    const p = ev.payload;
                    if (!next.find(u => u.uid === p.uid)) {
                        next.push({
                            uid: p.uid, name: p.name, role: p.role, camp: p.camp, pos: p.pos,
                            hp: p.hp, maxHp: p.maxHp, atk: p.atk, def: p.def, alive: p.alive,
                            isHorse: p.isHorse || false,
                            dmgDealt: 0, dmgTaken: 0, healDone: 0, reboundDone: 0, leechDone: 0,
                            dodgeCount: 0, critCount: 0, survivedRounds: 0,
                            buffAtkBonus: 0, buffDefBonus: 0, buffDodgeBonus: 0, buffHpBonus: 0,
                            _flash: null,
                            state: {
                                _acted: false, _resting: false, _blocked: false,
                                _isDead: p._isDead || false,
                                _phantomTarget: p._phantomTarget || null
                            }
                        });
                    }
                } else if (ev.eventType === UNIT_EVENT_TYPES.UNIT_REMOVE) {
                    next = next.filter(u => u.uid !== ev.payload.uid);
                } else if (ev.eventType === UNIT_EVENT_TYPES.POS_CHANGE) {
                    const uid = ev.uid || ev.unitUid;
                    const pos = ev.pos !== undefined ? ev.pos : (ev.payload && ev.payload.pos);
                    const idx = next.findIndex(u => u.uid === uid);
                    if (idx >= 0 && pos !== undefined) {
                        next[idx].pos = pos;
                    }
                }
            }
            return { ...state, units: next };
        }
        case STORE_ACTION_TYPES.ADD_UNIT: {
            if (state.units.find(u => u.uid === action.unit.uid)) return state;
            return { ...state, units: [...state.units, action.unit] };
        }
        case STORE_ACTION_TYPES.REMOVE_UNIT: {
            return { ...state, units: state.units.filter(u => u.uid !== action.uid) };
        }
        case STORE_ACTION_TYPES.HP_CHANGE: {
            const idx = state.units.findIndex(u => u.uid === action.unitUid);
            if (idx < 0) return state;
            let next = state.units.map(u => ({ ...u }));
            const p = action.payload;
            for (const key of UNIT_TOP_FIELDS) {
                if (p[key] !== undefined) next[idx][key] = p[key];
            }
            if (!next[idx].state) next[idx].state = {};
            for (const key of ALL_STATE_KEYS) {
                if (p[key] !== undefined) next[idx].state[key] = p[key];
            }
            return { ...state, units: next };
        }
        case STORE_ACTION_TYPES.STAT_BONUS_CHANGE: {
            const idx = state.units.findIndex(u => u.uid === action.unitUid);
            if (idx < 0) return state;
            let next = state.units.map(u => ({ ...u }));
            const p = action.payload;
            for (const key of UNIT_TOP_FIELDS) {
                if (p[key] !== undefined) next[idx][key] = p[key];
            }
            return { ...state, units: next };
        }
        default: return state;
    }
}