// 临时 runner：修复 fetch file:// 路径平台问题，跑完即删
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
const SEEDS = [1, 42, 999, 12345, 777, 88888];
const STAGES = [1, 3, 5];

async function runBaselineCase(seed, stage) {
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
    return { seed, stage, winner: winner || '平局', rounds, factCount: facts.length, facts };
}

const cases = SEEDS.flatMap(seed => STAGES.map(stage => ({ seed, stage })));
const results = [];
for (const { seed, stage } of cases) {
    const r = await runBaselineCase(seed, stage);
    results.push(r);
}
console.log('RUNNER-DONE ' + results.length + ' cases');

const fs = await import('node:fs');
const { fileURLToPath: f2p } = await import('node:url');
const base = JSON.parse(fs.readFileSync(f2p(new URL('./baselines/baseline-v1.json', import.meta.url)), 'utf8'));
let diffs = 0;
for (const cur of results) {
    const ref = base.cases.find(c => c.seed === cur.seed && c.stage === cur.stage);
    if (!ref) { console.log(`DIFF seed=${cur.seed} stage=${cur.stage}: baseline中无此场`); diffs++; continue; }
    const sameWinner = ref.winner === cur.winner;
    const sameRounds = ref.rounds === cur.rounds;
    const sameFacts = JSON.stringify(ref.facts) === JSON.stringify(cur.facts);
    if (!(sameWinner && sameRounds && sameFacts)) {
        diffs++;
        console.log(`DIFF seed=${cur.seed} stage=${cur.stage} winner=${ref.winner}->${cur.winner} rounds=${ref.rounds}->${cur.rounds} factsSame=${sameFacts}`);
    }
}
console.log(diffs === 0 ? 'BASELINE-MATCH (18场逐字节一致)' : `BASELINE-DIFF 共${diffs}场不同`);