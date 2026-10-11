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
function team(extra, camp, rng) { const t = Object.entries(BT).map(([p, r]) => mk(r, camp, +p, rng)); t.push(mk(extra, camp, 8, rng)); return t; }
// 统计攻击组子条目里的 factType
const subFacts = {};
const origRun = runBattle;
for (let seed = 1; seed <= 5; seed++) {
    setBattleRng(new SeededRNG(seed));
    const res = origRun({ ally: team(ROLE_TYPES.WARRIOR, CAMP_TYPES.ALLY, new SeededRNG(seed)), enemy: team(ROLE_TYPES.DEFENDER, CAMP_TYPES.ENEMY, new SeededRNG(seed + 555)), seed, initialBuffs: [], firstSide: CAMP_TYPES.ENEMY, onStep: (step) => {
        for (const e of (step.log || [])) {
            if (e && e.factType === 'attack' && e.data) {
                for (const sub of (e.data.entries || [])) if (sub && sub.factType) subFacts[sub.factType] = (subFacts[sub.factType] || 0) + 1;
            }
        }
    } });
    // 结束后 dump 敌方存活防战的 def 词条
    if (seed === 1) {
        for (const u of res.enemy) {
            if (u.role === ROLE_TYPES.DEFENDER && (u._mods?.def?.length || 0) > 0) {
                console.log(`敌方防战 def 词条:`, JSON.stringify(u._mods.def.map(m => m.source + ':' + m.value)));
                break;
            }
        }
        for (const u of res.ally) {
            if (u.role === ROLE_TYPES.RANGED && (u._mods?.atk?.length || 0) > 0) {
                console.log(`明教远程 atk 词条:`, JSON.stringify(u._mods.atk.map(m => m.source + ':' + m.value)));
                break;
            }
        }
    }
}
console.log('攻击组子条目 fact 统计(5场):', JSON.stringify(subFacts));
