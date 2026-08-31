// 终验：重试的第二刀真的打出去没有——看 xingFenRetry 后紧跟 attack 事实
if (typeof window === 'undefined') globalThis.window = globalThis;
if (typeof localStorage === 'undefined') {
    const _ls = new Map();
    globalThis.localStorage = { getItem: k => _ls.has(k)?_ls.get(k):null, setItem: (k,v)=>_ls.set(k,String(v)), removeItem: k=>_ls.delete(k), clear: ()=>_ls.clear() };
}
import { readFileSync } from 'node:fs';
globalThis.fetch = async (input) => {
    const body = readFileSync(String(input).replace(/^file:\/\//, ''));
    return { ok: true, json: async () => JSON.parse(body.toString('utf8')) };
};
const { loadGameData } = await import('/home/z/my-project/new-acode-repo/core/01config-5v5-test.js');
const { SeededRNG, flushBattleEvents } = await import('/home/z/my-project/new-acode-repo/infra/51-core-utils.js');
const { GlobalStore } = await import('/home/z/my-project/new-acode-repo/infra/54-global-store.js');
const { clearAllEliteStates } = await import('/home/z/my-project/new-acode-repo/core/18-elite-state.js');
const { eventBus } = await import('/home/z/my-project/new-acode-repo/infra/50-event-bus.js');
const { createRoundStepper } = await import('/home/z/my-project/new-acode-repo/core/11battle-round.js');
const { initBattleTeams } = await import('/home/z/my-project/new-acode-repo/modules/29battle-init.js');
await import('/home/z/my-project/new-acode-repo/modules/25elite-imperial.js');
await import('/home/z/my-project/new-acode-repo/modules/26elite-sixsects.js');
await import('/home/z/my-project/new-acode-repo/modules/27elite-mingjiao.js');
await loadGameData();
const seed = 20260831;
let retryThenAttack = 0, retryAlone = 0;
for (let b = 0; b < 30; b++) {
    eventBus.clearAll(); clearAllEliteStates();
    GlobalStore.set('forceZhang', null); GlobalStore.set('forceWei', null); GlobalStore.set('forceXiaoZhao', null);
    let { allyTeam, enemyTeam } = initBattleTeams(4, new SeededRNG(seed + b));
    let state = { ally: allyTeam.map(u=>u.clone()), enemy: enemyTeam.map(u=>u.clone()), round: 1, activeBuffs: [], allAllies: allyTeam.map(u=>u.clone()), _rng: new SeededRNG(seed*100+b) };
    for (let r = 1; r <= 35; r++) {
        const stepper = createRoundStepper(state, { ui: false });
        let last = null;
        for (const s of stepper) {
            last = s;
            const logs = s.log || [];
            for (let i = 0; i < logs.length; i++) {
                if (logs[i].factType === 'xingFenRetry') {
                    // 同一 step 内往前找：retry 之前应有 miss，之后应有宋青书 attack
                    const after = logs.slice(i+1).find(e => e.factType === 'attack' && e.data?.attacker?.name === '宋青书');
                    if (after) retryThenAttack++; else retryAlone++;
                }
            }
            if (s.winner) break;
        }
        if (last?.winner) break;
        state.ally = last.ally; state.enemy = last.enemy;
        state.activeBuffs = (state.activeBuffs || []).filter(x=>x&&x.remaining>0).map(x=>({...x, remaining:x.remaining-1})).filter(x=>x.remaining>0);
    }
}
console.log(`retry后有第二刀: ${retryThenAttack} / 孤立retry(无第二刀): ${retryAlone}`);
