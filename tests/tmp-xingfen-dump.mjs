// dump 一场 stage4 的完整战报，看宋青书的行为轨迹
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

const seed = 20260831;
const initRng = new SeededRNG(seed);
const { allyTeam, enemyTeam } = initBattleTeams(4, initRng);
console.log('敌方阵容:', enemyTeam.map(u => `${u.name}(${u.role},pos${u.pos})`).join(' | '));

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
        // 打印所有提到宋青书/周芷若的日志条目
        for (const e of (step.log || [])) {
            const s = JSON.stringify(e);
            if (s.includes('宋青书') || s.includes('周芷若') || s.includes('xingFen') || s.includes('xinHun')) {
                console.log(`R${r}:`, s.slice(0, 220));
            }
        }
        if (step.winner) { console.log('== winner:', step.winner); process.exit(0); }
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
