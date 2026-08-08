// modules/52battle-store.js - 光明顶5v5 战斗Store工厂
// V5.3.1 | ~11100 bytes| 2026-07-31 从 player/10 提取 Store 创建逻辑
export const VER = 'modules/52battle-store.js V5.3.1';

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
export const GAME_STATE_FIELDS = ['hp','alive','maxHp','atk','def','role','rangedForm','_isDead','_baseMaxHp','_baseAtk','_baseDef','dmgDealt','dmgTaken','healDone','reboundDone','leechDone','dodgeCount','critCount','survivedRounds','pos','buffAtkBonus','buffDefBonus','buffDodgeBonus','buffHpBonus','_phantomTarget', '_masteredRoles', '_fortifyStacks', '_baseFangDef', '_butterflyAtkBonus', '_butterflyDefBonus', '_butterflyHpBonus'];

/**
 * 战斗 Store 的 Reducer — 根据 action 类型处理单位状态变更
 * 所有 UI 层的格子显示（闪光/死亡/血条/位置）通过 dispatch action → reducer → Store 订阅 → renderGrid 的链路完成
 * @param {object} state - 当前 Store 状态 { units: Array }
 * @param {object} action - { type: string, uid?: string, flash?: string, events?: Array, unit?: object, ... }
 * @returns {object} 新状态
 */
export function battleReducer(state, action) {
    switch (action.type) {
        case 'INIT': return state;
        case 'SET_FLASH': {
            let next = state.units.map(u => {
                if (u.uid !== action.uid) return u;
                return { ...u, _flash: action.flash };
            });
            return { ...state, units: next };
        }
        case 'SET_VISUAL': {
            let next = state.units.map(u => {
                if (u.uid !== action.uid) return u;
                const patch = {};
                if (action._acted !== undefined) patch._acted = action._acted;
                if (action._resting !== undefined) patch._resting = action._resting;
                if (action._blocked !== undefined) patch._blocked = action._blocked;
                if (action._isDead !== undefined) patch._isDead = action._isDead;
                if (action._flyMode !== undefined) patch._flyMode = action._flyMode;
                if (action._hasKuaiLe !== undefined) patch._hasKuaiLe = action._hasKuaiLe;
                if (action._hasXingFen !== undefined) patch._hasXingFen = action._hasXingFen;
                return { ...u, ...patch };
            });
            return { ...state, units: next };
        }
        case 'CLEAR_ALL_FLASH': {
            let next = state.units.map(u => ({ ...u, _flash: null }));
            return { ...state, units: next };
        }
        case 'CLEAR_UNIT_FLASH': {
            let next = state.units.map(u => {
                if (u.uid !== action.uid) return u;
                return { ...u, _flash: null };
            });
            return { ...state, units: next };
        }
        case 'APPLY_EVENTS': {
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
                        if (p._isDead !== undefined) next[idx]._isDead = p._isDead;
                        if (p._resting !== undefined) next[idx]._resting = p._resting;
                        if (p._blocked !== undefined) next[idx]._blocked = p._blocked;
                        if (p._phantomTarget !== undefined) next[idx]._phantomTarget = p._phantomTarget;
                        if (p._stunned !== undefined) next[idx]._stunned = p._stunned;
                        if (p._flyMode !== undefined) next[idx]._flyMode = p._flyMode;
                        if (p._butterflyHost !== undefined) next[idx]._butterflyHost = p._butterflyHost;
                        if (p._masteredRoles !== undefined) next[idx]._masteredRoles = p._masteredRoles;
                        if (ev.eventType === 'zhang-switch') {
                            if (p.rangedForm !== undefined) next[idx].rangedForm = p.rangedForm;
                            if (p.role) next[idx].role = p.role;
                        }
                    }
                } else if (ev.eventType === 'unit-add') {
                    const p = ev.payload;
                    if (!next.find(u => u.uid === p.uid)) {
                        next.push({
                            uid: p.uid, name: p.name, role: p.role, camp: p.camp, pos: p.pos,
                            hp: p.hp, maxHp: p.maxHp, atk: p.atk, def: p.def, alive: p.alive,
                            isHorse: p.isHorse || false, _isDead: p._isDead || false,
                            _phantomTarget: p._phantomTarget || null,
                            dmgDealt: 0, dmgTaken: 0, healDone: 0, reboundDone: 0, leechDone: 0,
                            dodgeCount: 0, critCount: 0, survivedRounds: 0,
                            buffAtkBonus: 0, buffDefBonus: 0, buffDodgeBonus: 0, buffHpBonus: 0,
                            _flash: null, _acted: false, _resting: false, _blocked: false
                        });
                    }
                } else if (ev.eventType === 'unit-remove') {
                    next = next.filter(u => u.uid !== ev.payload.uid);
                } else if (ev.eventType === 'pos-change') {
                    const idx = next.findIndex(u => u.uid === ev.uid);
                    if (idx >= 0) {
                        next[idx].pos = ev.pos;
                    }
                }
            }
            return { ...state, units: next };
        }
        case 'SYNC_UNIT': {
            let next = state.units.map(u => {
                if (u.uid !== action.uid) return u;
                return { ...u, ...action.fields };
            });
            return { ...state, units: next };
        }
        case 'ADD_UNIT': {
            if (state.units.find(u => u.uid === action.unit.uid)) return state;
            return { ...state, units: [...state.units, action.unit] };
        }
        case 'REMOVE_UNIT': {
            return { ...state, units: state.units.filter(u => u.uid !== action.uid) };
        }
        case 'SYNC_BATTLE_STATS': {
            const allyMap = new Map(action.ally.map(u => [u.uid, u]));
            const enemyMap = new Map(action.enemy.map(u => [u.uid, u]));
            let next = state.units.map(u => {
                const src = u.camp === 'ally' ? allyMap.get(u.uid) : enemyMap.get(u.uid);
                if (!src) return u;
                return {
                    ...u,
                    dmgDealt: src.dmgDealt || 0,
                    dmgTaken: src.dmgTaken || 0,
                    healDone: src.healDone || 0,
                    reboundDone: src.reboundDone || 0,
                    leechDone: src.leechDone || 0,
                    dodgeCount: src.dodgeCount || 0,
                    critCount: src.critCount || 0,
                    survivedRounds: src.survivedRounds || 0
                };
            });
            return { ...state, units: next };
        }
        case 'hp-change': {
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
            if (p._isDead !== undefined) next[idx]._isDead = p._isDead;
            if (p._resting !== undefined) next[idx]._resting = p._resting;
            if (p._blocked !== undefined) next[idx]._blocked = p._blocked;
            if (p._stunned !== undefined) next[idx]._stunned = p._stunned;
            if (p._flyMode !== undefined) next[idx]._flyMode = p._flyMode;
            if (p._butterflyHost !== undefined) next[idx]._butterflyHost = p._butterflyHost;
            if (p._phantomTarget !== undefined) next[idx]._phantomTarget = p._phantomTarget;
            if (p.rangedForm !== undefined) next[idx].rangedForm = p.rangedForm;
            return { ...state, units: next };
        }
        case 'stat-bonus-change': {
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