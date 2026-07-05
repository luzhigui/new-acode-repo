// realtime/60-reactive-engine.js - 光明顶5v5 响应式战斗引擎
// V4.0.3 | ~6954 bytes | 2026-07-05
export const VER = 'realtime/60-reactive-engine.js V4.0.3';

// ==================== 状态管理器 ====================

/**
 * createStore - 创建一个响应式状态仓库
 * 
 * @param {object} initialState - 初始状态
 * @param {function} reducer - 状态变更处理器 (state, action) => newState
 * @returns {object} { getState, dispatch, subscribe }
 */
export function createStore(initialState, reducer) {
    let state = initialState;
    const listeners = [];

    function getState() {
        return state;
    }

    function dispatch(action) {
        const newState = reducer(state, action);
        if (newState === state) return;
        state = newState;
        for (const listener of listeners) {
            try { listener(state, action); } catch (e) { console.error('[ReactiveEngine] 监听器错误:', e); }
        }
    }

    function subscribe(listener) {
        listeners.push(listener);
        return () => {
            const index = listeners.indexOf(listener);
            if (index > -1) listeners.splice(index, 1);
        };
    }

    return { getState, dispatch, subscribe };
}

// ==================== 游戏状态 Reducer ====================

/**
 * gameReducer - 处理所有游戏状态变更
 * 这是唯一能修改状态的地方，根据 action 类型返回新的 state
 */
export function gameReducer(state, action) {
    switch (action.type) {

        // 应用伤害
        case 'APPLY_DAMAGE': {
            const { unitId, newHp, isDead, dmgDealt, dmgTaken } = action.payload;
            const newUnits = state.units.map(unit => {
                if (unit.uid !== unitId) return unit;
                return {
                    ...unit,
                    hp: newHp,
                    alive: !isDead,
                    _isDead: isDead,
                    dmgTaken: (unit.dmgTaken || 0) + (dmgTaken || 0)
                };
            });
            // 更新攻击者的造成伤害
            let finalUnits = newUnits;
            if (action.payload.attackerId) {
                finalUnits = newUnits.map(unit => {
                    if (unit.uid !== action.payload.attackerId) return unit;
                    return { ...unit, dmgDealt: (unit.dmgDealt || 0) + (dmgDealt || 0) };
                });
            }
            return { ...state, units: finalUnits };
        }

        // 应用治疗
        case 'APPLY_HEAL': {
            const { unitId, newHp, newMaxHp } = action.payload;
            const newUnits = state.units.map(unit => {
                if (unit.uid !== unitId) return unit;
                return {
                    ...unit,
                    hp: newHp,
                    maxHp: newMaxHp !== undefined ? newMaxHp : unit.maxHp
                };
            });
            return { ...state, units: newUnits };
        }

        // 单位死亡
        case 'UNIT_DIED': {
            const { unitId } = action.payload;
            const newUnits = state.units.map(unit => {
                if (unit.uid !== unitId) return unit;
                return { ...unit, hp: 0, alive: false, _isDead: true };
            });
            return { ...state, units: newUnits };
        }

        // 张无忌变身
        case 'ZHANG_SWITCHED': {
            const { unitId, newAtk, newDef, newMaxHp, newHp } = action.payload;
            const newUnits = state.units.map(unit => {
                if (unit.uid !== unitId) return unit;
                return {
                    ...unit,
                    atk: newAtk,
                    def: newDef,
                    maxHp: newMaxHp,
                    hp: newHp,
                    rangedForm: false,
                    role: '战士'
                };
            });
            return { ...state, units: newUnits };
        }

        // 回合开始
        case 'ROUND_START': {
            return { ...state, round: action.payload.round };
        }

        // 战斗结束
        case 'BATTLE_OVER': {
            return { ...state, winner: action.payload.winner, isOver: true };
        }

        default:
            return state;
    }
}

// ==================== UI 连接器 ====================

/**
 * connectToUI - 将 UI 渲染函数连接到状态仓库
 * 当 state 变化时，自动调用 renderFn，传入最新的 state
 */
export function connectToUI(store, renderFn) {
    store.subscribe((newState) => {
        renderFn(newState);
    });
}

// ==================== 测试用例 ====================

/**
 * 测试：创建 store 并验证基本流程
 * 可以直接在浏览器控制台运行此函数
 */
export function testReactiveEngine() {
    // 初始状态
    const initialState = {
        units: [
            { uid: 'a1', name: '宋青书', camp: 'enemy', hp: 100, maxHp: 100, atk: 30, def: 20, alive: true, _isDead: false, dmgDealt: 0, dmgTaken: 0, rangedForm: true, role: '飞行' },
            { uid: 'b1', name: '范遥', camp: 'ally', hp: 80, maxHp: 80, atk: 25, def: 24, alive: true, _isDead: false, dmgDealt: 0, dmgTaken: 0, rangedForm: true, role: '远程' }
        ],
        round: 1,
        winner: null,
        isOver: false
    };

    // 创建 store
    const store = createStore(initialState, gameReducer);

    // 订阅 UI 更新（这里只是打印到控制台）
    store.subscribe((newState) => {
        console.log('[UI更新] 最新状态:', newState.units.map(u => `${u.name}: HP ${u.hp}/${u.maxHp} ${u.alive ? '存活' : '阵亡'}`).join(', '));
    });

    // 模拟一次攻击：宋青书对范遥造成 35 点伤害
    console.log('--- 模拟攻击 ---');
    store.dispatch({
        type: 'APPLY_DAMAGE',
        payload: {
            unitId: 'b1',          // 范遥受伤
            attackerId: 'a1',      // 宋青书造成伤害
            newHp: 45,             // 80 - 35 = 45
            isDead: false,
            dmgDealt: 35,
            dmgTaken: 35
        }
    });

    // 模拟一次治疗
    console.log('--- 模拟治疗 ---');
    store.dispatch({
        type: 'APPLY_HEAL',
        payload: {
            unitId: 'b1',
            newHp: 50
        }
    });

    // 模拟击杀
    console.log('--- 模拟击杀 ---');
    store.dispatch({
        type: 'APPLY_DAMAGE',
        payload: {
            unitId: 'b1',
            attackerId: 'a1',
            newHp: 0,
            isDead: true,
            dmgDealt: 50,
            dmgTaken: 50
        }
    });

    console.log('--- 测试完成 ---');
    return store;
}

// 挂载到 window，方便在控制台测试
window.testReactiveEngine = testReactiveEngine;