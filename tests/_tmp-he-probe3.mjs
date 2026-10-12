// 临时探针2：逐回合打印何太冲 state._liangyiPartnerUid（用完即删）
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

const [{ SeededRNG }, { initBattleTeams }, { createRoundStepper }, { loadGameData }] = await Promise.all([
    import('../infra/51-core-utils.js'),
    import('../modules/29battle-init.js'),
    import('../core/11battle-round.js'),
    import('../core/01config-5v5-test.js')
]);
await import('../modules/25elite-imperial.js');
await import('../modules/26elite-sixsects.js');
await import('../modules/27elite-mingjiao.js');
await import('../modules/30custom-effects.js');
await loadGameData();

const rng = new SeededRNG(5);
const { allyTeam, enemyTeam } = initBattleTeams(2, rng);
const state = {
    ally: allyTeam.map(u => u.clone()),
    enemy: enemyTeam.map(u => u.clone()),
    round: 1, activeBuffs: [], allAllies: allyTeam.map(u => u.clone()), _rng: rng
};
const he0 = state.enemy.find(u => u.isHeTaichong);
console.log('何太冲初始 state._liangyiPartnerUid =', JSON.stringify(he0.state._liangyiPartnerUid), 'role=', he0.role);
while (state.round <= 6) {
    for (const step of createRoundStepper(state)) {
        const he = (step.enemy || []).find(u => u.isHeTaichong);
        if (he && he.state._liangyiPartnerUid) {
            const p = (step.enemy || []).find(u => u.uid === he.state._liangyiPartnerUid);
            console.log(`R${state.round} step: he.partner=${he.state._liangyiPartnerUid} → ${p ? p.name : '(不在本队)'} | he.state是活体引用?`, he.state === he0.state);
            break;
        }
    }
    const he = state.enemy.find(u => u.isHeTaichong);
    console.log(`R${state.round} 回合末: he.partner=`, JSON.stringify(he && he.state._liangyiPartnerUid));
    state.round++;
}