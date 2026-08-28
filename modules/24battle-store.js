// modules/24battle-store.js - 光明顶5v5 战斗Store工厂
// V5.6.1 | ~11800 bytes| 2026-08-26 GAME_STATE_FIELDS 删 _phantomTarget/_masteredRoles（已迁 18-elite-state）
export const VER = 'modules/24battle-store.js V5.6.1';

import { STORE_ACTION_TYPES } from '../infra/56-battle-enums.js';
import { getEliteState } from '../core/18-elite-state.js';

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

/**
 * 战斗 Store 的 Reducer — 根据 action 类型处理单位状态变更
 * 所有 UI 层的格子显示（闪光/死亡/血条/位置）通过 dispatch action → reducer → Store 订阅 → renderGrid 的链路完成
 * @param {object} state - 当前 Store 状态 { units: Array }
 * @param {object} action - { type: string, uid?: string, flash?: string, events?: Array, unit?: object, ... }
 * @returns {object} 新状态
 */
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
                if (action._acted !== undefined) newState._acted = action._acted;
                if (action._resting !== undefined) newState._resting = action._resting;
                if (action._blocked !== undefined) newState._blocked = action._blocked;
                if (action._isDead !== undefined) newState._isDead = action._isDead;
                if (action._flyMode !== undefined) newState._flyMode = action._flyMode;
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
                if (ev.eventType === 'hp-change' || ev.eventType === 'stat-bonus-change' || ev.eventType === 'zhang-switch') {
                    const idx = next.findIndex(u => u.uid === ev.unitUid);
                    if (idx >= 0) {
                        const p = ev.payload;
                        if (p.hp !== undefined) next[idx].hp = p.hp;
                        if (p.maxHp !== undefined) next[idx].maxHp = p.maxHp;
                        if (p.alive !== undefined) next[idx].alive = p.alive;
                        if (p.atk !== undefined) next[idx].atk = p.atk;
                        if (p.def !== undefined) next[idx].def = p.def;
                        if (p.role !== undefined) next[idx].role = p.role;
                        if (p.buffAtkBonus !== undefined) next[idx].buffAtkBonus = p.buffAtkBonus;
                        if (p.buffDefBonus !== undefined) next[idx].buffDefBonus = p.buffDefBonus;
                        if (p.buffDodgeBonus !== undefined) next[idx].buffDodgeBonus = p.buffDodgeBonus;
                        if (p.buffHpBonus !== undefined) next[idx].buffHpBonus = p.buffHpBonus;
                        if (p.dmgDealt !== undefined) next[idx].dmgDealt = p.dmgDealt;
                        if (p.dmgTaken !== undefined) next[idx].dmgTaken = p.dmgTaken;
                        if (p.healDone !== undefined) next[idx].healDone = p.healDone;
                        if (p.reboundDone !== undefined) next[idx].reboundDone = p.reboundDone;
                        if (p.leechDone !== undefined) next[idx].leechDone = p.leechDone;
                        if (p.dodgeCount !== undefined) next[idx].dodgeCount = p.dodgeCount;
                        if (p.critCount !== undefined) next[idx].critCount = p.critCount;
                        if (p.survivedRounds !== undefined) next[idx].survivedRounds = p.survivedRounds;
                        if (p._baseAtk !== undefined) next[idx]._baseAtk = p._baseAtk;
                        if (p._baseDef !== undefined) next[idx]._baseDef = p._baseDef;
                        if (p._baseMaxHp !== undefined) next[idx]._baseMaxHp = p._baseMaxHp;
                        if (!next[idx].state) next[idx].state = {};
                        if (p._isDead !== undefined) next[idx].state._isDead = p._isDead;
                        if (p._resting !== undefined) next[idx].state._resting = p._resting;
                        if (p._blocked !== undefined) next[idx].state._blocked = p._blocked;
                        if (p._phantomTarget !== undefined) next[idx].state._phantomTarget = p._phantomTarget;
                        if (p._stunned !== undefined) next[idx].state._stunned = p._stunned;
                        if (p._flyMode !== undefined) next[idx].state._flyMode = p._flyMode;
                        if (p._butterflyHost !== undefined) next[idx].state._butterflyHost = p._butterflyHost;
                        if (p._masteredRoles !== undefined) next[idx]._masteredRoles = p._masteredRoles;
                        if (ev.eventType === 'zhang-switch') {
                            if (p.rangedForm !== undefined) next[idx].rangedForm = p.rangedForm;
                        }
                    }
                } else if (ev.eventType === 'unit-add') {
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
                } else if (ev.eventType === 'unit-remove') {
                    next = next.filter(u => u.uid !== ev.payload.uid);
                } else if (ev.eventType === 'pos-change') {
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
        case STORE_ACTION_TYPES.SYNC_UNIT: {
            let next = state.units.map(u => {
                if (u.uid !== action.uid) return u;
                return { ...u, ...action.fields };
            });
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
            if (p.hp !== undefined) next[idx].hp = p.hp;
            if (p.maxHp !== undefined) next[idx].maxHp = p.maxHp;
            if (p.alive !== undefined) next[idx].alive = p.alive;
            if (p.atk !== undefined) next[idx].atk = p.atk;
            if (p.def !== undefined) next[idx].def = p.def;
            if (p.role !== undefined) next[idx].role = p.role;
            if (!next[idx].state) next[idx].state = {};
            if (p._isDead !== undefined) next[idx].state._isDead = p._isDead;
            if (p._resting !== undefined) next[idx].state._resting = p._resting;
            if (p._blocked !== undefined) next[idx].state._blocked = p._blocked;
            if (p._stunned !== undefined) next[idx].state._stunned = p._stunned;
            if (p._flyMode !== undefined) next[idx].state._flyMode = p._flyMode;
            if (p._butterflyHost !== undefined) next[idx].state._butterflyHost = p._butterflyHost;
            if (p._phantomTarget !== undefined) next[idx].state._phantomTarget = p._phantomTarget;
            if (p.rangedForm !== undefined) next[idx].rangedForm = p.rangedForm;
            return { ...state, units: next };
        }
        case STORE_ACTION_TYPES.STAT_BONUS_CHANGE: {
            const idx = state.units.findIndex(u => u.uid === action.unitUid);
            if (idx < 0) return state;
            let next = state.units.map(u => ({ ...u }));
            const p = action.payload;
            if (p.buffAtkBonus !== undefined) next[idx].buffAtkBonus = p.buffAtkBonus;
            if (p.buffDefBonus !== undefined) next[idx].buffDefBonus = p.buffDefBonus;
            if (p.buffDodgeBonus !== undefined) next[idx].buffDodgeBonus = p.buffDodgeBonus;
            if (p.buffHpBonus !== undefined) next[idx].buffHpBonus = p.buffHpBonus;
            return { ...state, units: next };
        }
        default: return state;
    }
}