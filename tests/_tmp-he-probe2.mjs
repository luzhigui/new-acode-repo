// 临时探针：验两仪连接是否真的建立 / 红血互换是否产出可播放特效（用完即删）
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

const [{ SeededRNG }, { initBattleTeams }, { createRoundStepper }, { loadGameData }, { GlobalStore }] = await Promise.all([
    import('../infra/51-core-utils.js'),
    import('../modules/29battle-init.js'),
    import('../core/11battle-round.js'),
    import('../core/01config-5v5-test.js'),
    import('../infra/54-global-store.js')
]);
await import('../modules/25elite-imperial.js');
await import('../modules/26elite-sixsects.js');
await import('../modules/27elite-mingjiao.js');
await import('../modules/30custom-effects.js');
await loadGameData();

function runOne(seed, stage) {
    const rng = new SeededRNG(seed);
    const { allyTeam, enemyTeam } = initBattleTeams(stage, rng);
    const he0 = enemyTeam.find(u => u.isHeTaichong);
    const state = {
        ally: allyTeam.map(u => u.clone()),
        enemy: enemyTeam.map(u => u.clone()),
        round: 1, activeBuffs: [], allAllies: allyTeam.map(u => u.clone()), _rng: rng
    };
    const found = { link: null, swapFact: false, markFacts: 0, redFacts: 0, logos: null };
    let round = 0;
    while (state.round <= 14) {
        round++;
        for (const step of createRoundStepper(state)) {
            for (const f of step.log || []) {
                if (f && f.factType === 'skillAnnounce' && f.data && f.data.note) {
                    if (f.data.note.includes('两仪连接')) found.link = `R${round} ${f.data.note}`;
                    if (f.data.note.includes('两仪互换')) { found.swapFact = true; }
                    if (f.data.note.includes('标记')) found.markFacts++;
                    if (f.data.note.includes('红血')) found.redFacts++;
                }
            }
            if (step.winner) { state.round = 99; break; }
        }
        // 每回合末查一下双方 state
        const he = state.enemy.find(u => u.isHeTaichong);
        if (he && he.state._liangyiPartnerUid) {
            const p = state.enemy.find(u => u.uid === he.state._liangyiPartnerUid);
            found.logos = `R${round} he☯→${p ? p.name : '?'} dual=${JSON.stringify(he.state._dualSchools)} partner☯=${p ? p.state._liangyiPartnerUid : '-'}`;
        }
        if (state.round === 99) break;
        state.round++;
    }
    return { seed, stage, heBorn: !!he0, heRole: he0 ? he0.role : null, ...found };
}

for (const seed of [1, 3, 5, 42]) {
    console.log(JSON.stringify(runOne(seed, 2)));
}