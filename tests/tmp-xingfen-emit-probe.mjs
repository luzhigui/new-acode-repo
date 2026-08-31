// 包一层 emit 探针：看 afterAttack/afterMiss 信号发射与监听器注册情况
if (typeof window === 'undefined') globalThis.window = globalThis;
if (typeof localStorage === 'undefined') {
    const _ls = new Map();
    globalThis.localStorage = {
        getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
        setItem: (k, v) => { _ls.set(k, String(v)); },
        removeItem: (k) => { _ls.delete(k); },
        clear: () => { _ls.clear(); }
    };
}
import { readFileSync } from 'node:fs';
globalThis.fetch = async (input) => {
    const u = String(input).replace(/^file:\/\//, '');
    const body = readFileSync(u);
    return { ok: true, json: async () => JSON.parse(body.toString('utf8')) };
};

const { loadGameData } = await import('../core/01config-5v5-test.js');
const { getEliteState } = await import('../core/18-elite-state.js');
const { SeededRNG, flushBattleEvents } = await import('../infra/51-core-utils.js');
const { clearAllEliteStates } = await import('../core/18-elite-state.js');
const { createRoundStepper } = await import('../core/11battle-round.js');
const { initBattleTeams } = await import('../modules/29battle-init.js');
const { eventBus } = await import('../infra/50-event-bus.js');
const { GlobalStore } = await import('../infra/54-global-store.js');
await import('../modules/25elite-imperial.js');
await import('../modules/26elite-sixsects.js');
await import('../modules/27elite-mingjiao.js');
await loadGameData();

// ===== emit 探针（不改引擎，运行时包一层）=====
const origEmit = eventBus.emit.bind(eventBus);
const emitCounts = {};
eventBus.emit = (signal, data) => {
    emitCounts[signal] = (emitCounts[signal] || 0) + 1;
    const who = data?.unit?.name || data?.attacker?.name || '';
    if ((signal === 'afterAttack' || signal === 'afterMiss') && who === '宋青书') {
        const u = data?.unit;
        if (u) {
            const es = getEliteState(u.uid);
            console.log(`>>> R${state.round} ${signal} 宋青书 uid=${u.uid} alive=${u.alive} _xingFenActive=${es._xingFenActive} _extraAttacking=${u._xingFenExtraAttacking} _kuLianActive=${es._kuLianActive}`);
        } else {
            console.log(`>>> R${state.round} ${signal} 宋青书 data无unit字段! keys=${Object.keys(data || {}).join(',')}`);
        }
        const ls = eventBus._listeners[signal] || [];
        console.log(`    监听器${ls.length}个:`, ls.map(l => l.priority).join(','));
    }
    return origEmit(signal, data);
};

const seed = 20260831;
const initRng = new SeededRNG(seed);
const { allyTeam, enemyTeam } = initBattleTeams(4, initRng);

let state = {
    ally: allyTeam.map(u => u.clone()),
    enemy: enemyTeam.map(u => u.clone()),
    round: 1,
    activeBuffs: [],
    allAllies: allyTeam.map(u => u.clone()),
    _rng: new SeededRNG(seed)
};
for (let r = 1; r <= 35; r++) {
    const stepper = createRoundStepper(state, { ui: false });
    let lastStep = null;
    for (const step of stepper) {
        lastStep = step;
        if (step.winner) {
            console.log('\n== winner:', step.winner);
            console.log('== 信号发射统计:', JSON.stringify(emitCounts));
            process.exit(0);
        }
    }
    state.ally = lastStep.ally;
    state.enemy = lastStep.enemy;
    if (state.allAllies) {
        state.allAllies = state.allAllies.map(full => {
            const cur = lastStep.ally.find(a => a.uid === full.uid);
            if (cur) { full.hp = cur.hp; full.maxHp = cur.maxHp; full.alive = cur.alive; full.atk = cur.atk; full.def = cur.def; }
            return full;
        });
    }
    state.activeBuffs = (state.activeBuffs || []).filter(b => b && b.remaining > 0).map(b => ({ ...b, remaining: b.remaining - 1 })).filter(b => b.remaining > 0);
    state.round = r + 1;
}
console.log('\n== 信号发射统计:', JSON.stringify(emitCounts));
