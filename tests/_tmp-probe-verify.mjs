import { fileURLToPath } from 'node:url';
import { SeededRNG } from '../infra/51-core-utils.js';
import { runBattle } from '../core/06battle-runner.js';
import { Unit } from '../core/02unit.js';
import { ROLE_TYPES, CAMP_TYPES } from '../infra/56-battle-enums.js';
import { setBattleRng } from '../core/13battle-shared.js';
import '../infra/54-global-store.js';
import '../modules/00reg-mechanics.js';
const fs = await import('node:fs');
globalThis.fetch = async (url) => { const p = fileURLToPath(new URL(url, 'file://' + process.cwd() + '/')); return { ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) }; };
const { loadGameData } = await import('../core/01config-5v5-test.js');
await loadGameData();
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const BT = { 1: ROLE_TYPES.DEFENDER, 2: ROLE_TYPES.WARRIOR, 5: ROLE_TYPES.FLYER, 7: ROLE_TYPES.RANGED, 9: ROLE_TYPES.RANGED };
function mk(role, camp, pos, rng) { const u = new Unit(`x·${role}`, 100, role, camp); u.init(rng); u.applyBonus(); u.pos = pos; return u; }
function team(extra, camp, rng) { const t = Object.entries(BT).map(([p, r]) => mk(r, camp, +p, rng)); const e = mk(extra, camp, 8, rng); t.push(e); return t; }
const facts = {};
for (let seed = 1; seed <= 20; seed++) {
    setBattleRng(new SeededRNG(seed));
    const res = runBattle({ ally: team(ROLE_TYPES.WARRIOR, CAMP_TYPES.ALLY, new SeededRNG(seed)), enemy: team(ROLE_TYPES.DEFENDER, CAMP_TYPES.ENEMY, new SeededRNG(seed + 555)), seed, collectFacts: true, initialBuffs: [], firstSide: CAMP_TYPES.ENEMY });
    for (const f of res.facts) facts[f] = (facts[f] || 0) + 1;
}
console.log('20场 fact 统计:', JSON.stringify(facts, null, 0));
