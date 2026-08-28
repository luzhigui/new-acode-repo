// 临时 runner：对比 seed=42 stage=5 的 fact 序列，定位首个差异
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

const LOG = !!process.env.VERBOSE;

const [{ CONFIG, loadGameData }, { SeededRNG }, { createRoundStepper }, { initBattleTeams }] = await Promise.all([
    import('../core/01config-5v5-test.js'),
    import('../infra/51-core-utils.js'),
    import('../core/11battle-round.js'),
    import('../modules/29battle-init.js')
]);
await import('../modules/25elite-imperial.js');
await import('../modules/26elite-sixsects.js');
await import('../modules/27elite-mingjiao.js');
await loadGameData();

const MAX_ROUND = CONFIG.MAX_ROUND || 35;

async function runCase(seed, stage) {
    const rng = new SeededRNG(seed);
    const { allyTeam, enemyTeam } = initBattleTeams(stage, rng);
    let battleState = {
        ally: allyTeam.map(u => u.clone()),
        enemy: enemyTeam.map(u => u.clone()),
        round: 1,
        activeBuffs: [],
        allAllies: allyTeam.map(u => u.clone()),
        _rng: rng
    };
    const facts = [];
    let winner = null;
    let rounds = 1;
    while (battleState.round <= MAX_ROUND) {
        const stepper = createRoundStepper(battleState);
        let lastStep = null;
        for await (const step of stepper) {
            lastStep = step;
            for (const e of step.log || []) {
                if (e && e.factType) facts.push(e.factType);
            }
            if (step.winner) winner = step.winner;
        }
        if (winner) { rounds = battleState.round; break; }
        if (!lastStep) { rounds = battleState.round; break; }
        battleState = {
            ally: lastStep.ally.map(u => u.clone()),
            enemy: lastStep.enemy.map(u => u.clone()),
            round: battleState.round + 1,
            activeBuffs: (lastStep.ally._activeBuffs || []).map(b => ({ ...b })),
            allAllies: battleState.allAllies,
            _rng: rng
        };
        rounds = battleState.round;
    }
    return { seed, stage, winner: winner || '平局', rounds, facts };
}

const cur = await runCase(42, 5);
const fs = await import('node:fs');
const base = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./baselines/baseline-v1.json', import.meta.url)), 'utf8'));
const ref = base.cases.find(c => c.seed === 42 && c.stage === 5);
console.log('ref facts len:', ref.facts.length, 'cur facts len:', cur.facts.length);
console.log('ref winner:', ref.winner, 'cur winner:', cur.winner, 'ref rounds:', ref.rounds, 'cur rounds:', cur.rounds);
console.log('cur result head:', JSON.stringify(cur.facts.slice(0, 8)));
console.log('ref result head:', JSON.stringify(ref.facts.slice(0, 8)));
const minLen = Math.min(ref.facts.length, cur.facts.length);
let firstDiff = -1;
for (let i = 0; i < minLen; i++) {
    if (ref.facts[i] !== cur.facts[i]) { firstDiff = i; break; }
}
console.log('firstDiff at index:', firstDiff);
if (firstDiff >= 0) {
    const start = Math.max(0, firstDiff - 10);
    const end = Math.min(minLen, firstDiff + 12);
    let checkVal = true;
    let wrongCount = 0;
    for (let i = start; i < end; i++) {
        const mark = ref.facts[i] === cur.facts[i] ? '  ' : '>>';
        if (ref.facts[i] !== cur.facts[i]) { checkVal = false; wrongCount++; }
        console.log(`${mark} [${i}] ref=${ref.facts[i]} cur=${cur.facts[i]}`);
    }
    console.log('contains wrong:', !checkVal, 'wrongCount:', wrongCount);
} else if (ref.facts.length !== cur.facts.length) {
    console.log('前缀一致，长度不同');
    console.log('ref tail:', ref.facts.slice(minLen, minLen + 5));
    console.log('cur tail:', cur.facts.slice(minLen, minLen + 5));
}