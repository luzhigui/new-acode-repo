// 临时 runner：对比 seed=42 stage=5，打印 attack fact 的 data.entries 类型序列（看组内顺序）
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
const SEED = 42, STAGE = 5;

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
    const logEntries = [];
    let winner = null;
    let rounds = 1;
    while (battleState.round <= MAX_ROUND) {
        const stepper = createRoundStepper(battleState);
        let lastStep = null;
        for (const step of stepper) {
            lastStep = step;
            for (const e of step.log || []) logEntries.push(e);
            if (step.winner) winner = step.winner;
        }
        if (winner || !lastStep) break;
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
    return { winner, rounds, logEntries };
}

const cur = await runCase(SEED, STAGE);
let idx = 0;
const factList = [];
for (const e of cur.logEntries) {
    const ft = e.factType;
    factList.push(ft || e.type || e.kind || '?');
    if (ft === 'attack') {
        const atk = e.data && e.data.attacker;
        const tgt = e.data && e.data.target;
        const ents = (e.data && e.data.entries) || [];
        const detail = ents.map(x => (x && (x.factType || x.type || x.kind)) || '?').join(',');
        console.log(`[${idx}] ATTACK by=${atk && atk.name}->${tgt && tgt.name} entries:${detail}`);
    } else if (ft === 'xuanmingPoisoned' || ft === 'xuanmingLinkAttack') {
        const d = e.data || {};
        console.log(`[${idx}] ${ft} attr=${d.attackerName}->${d.targetName} data=${JSON.stringify(d).slice(0,120)}`);
    } else {
        console.log(`[${idx}] ${ft || e.type || e.kind || '?'}`);
    }
    idx++;
}