// 临时探针4：把引擎状态灌进 battleStore，真跑 render/32 的格子渲染，打印何太冲格子的 HTML（用完即删）
import { fileURLToPath } from 'node:url';
globalThis.fetch = async (url) => {
    const fs = await import('node:fs');
    const p = fileURLToPath(new URL(url));
    const text = fs.readFileSync(p, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

const [{ SeededRNG }, { initBattleTeams }, { createRoundStepper }, { loadGameData }, { GlobalStore },
    { createStore, battleReducer }, { createInitialState }, { STORE_ACTION_TYPES }] = await Promise.all([
    import('../infra/51-core-utils.js'),
    import('../modules/29battle-init.js'),
    import('../core/11battle-round.js'),
    import('../core/01config-5v5-test.js'),
    import('../infra/54-global-store.js'),
    import('../modules/24battle-store.js'),
    import('../core/17-state-keys.js'),
    import('../infra/56-battle-enums.js')
]);
await import('../modules/25elite-imperial.js');
await import('../modules/26elite-sixsects.js');
await import('../modules/27elite-mingjiao.js');
await import('../modules/30custom-effects.js');
await loadGameData();

const rng = new SeededRNG(5);
const { allyTeam, enemyTeam } = initBattleTeams(2, rng);
const store = createStore({ ...createInitialState(), units: [] }, battleReducer);
GlobalStore.set('battleStore', store);
const state = {
    ally: allyTeam.map(u => u.clone()),
    enemy: enemyTeam.map(u => u.clone()),
    round: 1, activeBuffs: [], allAllies: allyTeam.map(u => u.clone()), _rng: rng
};

// 最小 DOM 垫片：只在渲染函数真的有 DOM 依赖时才需要；这里先试模块加载
let renderMod = null;
try {
    globalThis.document = {
        getElementById: () => null,
        createElement: () => ({ style: {}, classList: { add(){}, remove(){}, toggle(){} }, appendChild(){}, setAttribute(){}, dataset: {} })
    };
    renderMod = await import('../render/32-grid-render.js');
} catch (e) {
    console.log('render/32 import 失败（DOM 依赖）:', e.message);
}

for (const step of createRoundStepper(state)) {
    const units = [...step.ally, ...step.enemy];
    store.dispatch({ type: STORE_ACTION_TYPES.SET_UNITS, units });
    // 引擎给 player 的 roundStart events 也在这一步下发；这里模拟 player 的落账
    if (step.events && step.events.length) store.dispatch({ type: STORE_ACTION_TYPES.APPLY_EVENTS, events: step.events });
    const he = store.getState().units.find(u => u.isHeTaichong);
    if (he) {
        console.log('store 里何太冲 state._liangyiPartnerUid =', JSON.stringify(he.state._liangyiPartnerUid),
            '| 搭档在 store 里活着?', store.getState().units.some(u => u.uid === he.state._liangyiPartnerUid && u.alive));
    }
    break;
}

// 直接按 render/32 的 logoList 逻辑复算一遍（不依赖 DOM）
const units = store.getState().units;
const he = units.find(u => u.isHeTaichong);
if (he) {
    const partnerAlive = units.some(u => u.alive && u.uid === he.state._liangyiPartnerUid);
    console.log('复算 logoList 条件: he._liangyiPartnerUid=', he.state._liangyiPartnerUid, '→ partnerAlive=', partnerAlive, '→ ☯ 会入列 =', !!(he.state._liangyiPartnerUid && partnerAlive));
    const p = units.find(u => u.uid === he.state._liangyiPartnerUid);
    if (p) console.log('搭档:', p.name, '自己 partnerUid=', JSON.stringify(p.state._liangyiPartnerUid));
}