// 临时探针：seed=9 stage=2，逐 MIND_CONTROL_SWAP 校验 toPos 是否等于当前战斗单位真实 pos
globalThis.fetch = async (url) => { const fs = await import('node:fs'); const p = fileURLToPath(new URL(url)); const text = fs.readFileSync(p, 'utf8'); return { ok: true, json: async () => JSON.parse(text) }; };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis; globalThis.self = globalThis;
import { fileURLToPath } from 'node:url';
const [{ CONFIG, loadGameData, loadHexEnhanceData }, { SeededRNG }, { createRoundStepper }, { initBattleTeams },
    { renderLog }, { createStore, battleReducer }, { createInitialState }, { GlobalStore },
    { STORE_ACTION_TYPES, CAMP_TYPES, BUFF_TYPES }] = await Promise.all([
    import('./core/201-config-5v5-test.js'), import('./infra/102-core-utils.js'),
    import('./core/210-battle-round.js'), import('./modules/330-battle-init.js'),
    import('./render/401-fact-renderer.js'), import('./modules/306-battle-store.js'),
    import('./core/218-state-keys.js'), import('./infra/104-global-store.js'),
    import('./infra/106-battle-enums.js') ]);
await import('./modules/307-elite-imperial.js'); await import('./modules/308-elite-sixsects.js'); await import('./modules/317-elite-mingjiao.js');
await import('./modules/331-custom-effects.js');
await loadGameData(); await loadHexEnhanceData();
const { tickAndPickBuffs: _sharedTickAndPickBuffs } = await import('./tests/_lib/buff-picker.mjs');
function tickBuffs(activeBuffs, ally, enemy, round, seed, pickNew) {
    return _sharedTickAndPickBuffs(activeBuffs, ally, enemy, round, seed, pickNew);
}
const seed = 9, stage = 2;
const rng = new SeededRNG(seed);
const store = createStore({ ...createInitialState(), units: [] }, battleReducer);
GlobalStore.set('battleStore', store);
const { allyTeam, enemyTeam } = initBattleTeams(stage, rng);
let battleState = {
    ally: allyTeam.map(u => u.clone()), enemy: enemyTeam.map(u => u.clone()),
    round: 1, activeBuffs: [], allAllies: allyTeam.map(u => u.clone()), _rng: rng
};
battleState.activeBuffs = tickBuffs([], battleState.ally, battleState.enemy, 1, seed, true);
function findIn(arr, uid) { return arr.find(u => u.uid === uid); }
const stages = [1,2,3,4,5,6,7];
for (const stage of stages) {
  const rngS = new SeededRNG(seed);
  const storeS = createStore({ ...createInitialState(), units: [] }, battleReducer);
  GlobalStore.set('battleStore', storeS);
  const { allyTeam, enemyTeam } = initBattleTeams(stage, rngS);
  let bs = { ally: allyTeam.map(u => u.clone()), enemy: enemyTeam.map(u => u.clone()), round: 1, activeBuffs: [], allAllies: allyTeam.map(u => u.clone()), _rng: rngS };
  bs.activeBuffs = tickBuffs([], bs.ally, bs.enemy, 1, seed, true);
  let found = 0, failcnt = 0;
  while (bs.round <= 35) {
    if (stage === 2) console.log(`round=${bs.round} buffs=[${bs.activeBuffs.map(b=>b.key+':'+b.target).join(', ')}]`);
    let lastStep = null;
    for (const step of createRoundStepper(bs)) {
      lastStep = step;
      for (const f of step.log || []) {
        if (!f || (f.factType !== 'MIND_CONTROL_SWAP' && f.factType !== 'MIND_CONTROL_FAIL')) continue;
        if (f.factType === 'MIND_CONTROL_FAIL') { failcnt++; continue; }
        found++;
        const side = f.data.side;
        console.log(`\n=== seed=${seed} stage=${stage} SWAP#${found} round=${bs.round} side=${side} ===`);
        for (const s of f.data.swaps) {
          const liveA = findIn(step.ally, s.uid);
          const liveE = findIn(step.enemy, s.uid);
          const live = liveA || liveE;
          const stateA = findIn(bs.ally, s.uid);
          const stateE = findIn(bs.enemy, s.uid);
          const st = stateA || stateE;
          console.log(`  ${s.name} uid=${s.uid} camp=${live ? live.camp : '?'} fromPos=${s.fromPos} toPos=${s.toPos}` +
            ` | LIVE clone pos=${live ? live.pos : 'NOT-IN-STEP'} | state pos=${st ? st.pos : 'NOT-IN-STATE'}` +
            ` | sameRefLive=${live === st}`);
        }
      }
    }
    if (lastStep) {
      const next = bs.round + 1;
      const nextActiveBuffs = tickBuffs(bs.activeBuffs, lastStep.ally, lastStep.enemy, bs.round, seed, bs.round % 3 === 0);
      bs = { ally: lastStep.ally.map(u => u.clone()), enemy: lastStep.enemy.map(u => u.clone()), round: next, activeBuffs: nextActiveBuffs, allAllies: bs.allAllies, _rng: rngS };
    } else break;
  }
  console.log(`seed=${seed} stage=${stage} 总 SWAP 数=${found} FAIL数=${failcnt}`);
}
