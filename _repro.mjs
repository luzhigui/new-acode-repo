// 临时探针：复现「选众志成城卡死」（跑完即删）
if (typeof window === 'undefined') globalThis.window = globalThis;
if (typeof localStorage === 'undefined') {
    const _ls = new Map();
    globalThis.localStorage = {
        getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
        setItem: (k, v) => { _ls.set(k, String(v)); },
        removeItem: (k) => { _ls.delete(k); },
        clear: () => _ls.clear()
    };
}
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
globalThis.fetch = async (url) => {
    const p = fileURLToPath(url);
    const txt = await readFile(p, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(txt) };
};
import { CONFIG, loadGameData } from './core/01config-5v5-test.js';
import { SeededRNG, flushBattleEvents } from './infra/51-core-utils.js';
import { runBattle } from './core/06battle-runner.js';
import { initBattleTeams } from './modules/29battle-init.js';
import { createBuffObject } from './modules/28buff-tools.js';
import { GlobalStore } from './infra/54-global-store.js';
import { eventBus } from './infra/50-event-bus.js';
import './modules/00reg-mechanics.js';
import { BUFF_TYPES } from './infra/56-battle-enums.js';

await loadGameData();

const VERBOSE = !!process.env.V;
if (process.env.E) {
    const _emit = eventBus.emit.bind(eventBus);
    eventBus.emit = (sig, data) => { console.log('  >>emit ' + sig); return _emit(sig, data); };
}
const STAGE = Number(process.env.STAGE || 1);
const N = Number(process.env.N || 40);
const START = Number(process.env.START || 0);

function clearGlobals() {
    eventBus.clearAll();
    for (const k of ['forceZhang', 'forceWei', 'forceXiaoZhao', 'forceXieXun', 'forcePang', 'forceWeakElite', 'currentBattleState']) GlobalStore.set(k, null);
    flushBattleEvents();
}

let globalSteps = 0;
for (let i = START; i < START + N; i++) {
    const seed = 123456 + i * 7919;
    clearGlobals();
    const teams = initBattleTeams(STAGE, new SeededRNG(seed));
    let pickedUnity = false;
    const hexPicker = (activeBuffs, allySide, rng) => {
        if (!pickedUnity) { pickedUnity = true; return createBuffObject(BUFF_TYPES.UNITY, CONFIG.BUFFS.unity.duration || 5); }
        const ks = Object.keys(CONFIG.BUFFS).filter(k => !activeBuffs.some(b => b && b.key === k));
        if (!ks.length) return null;
        const k = ks[rng.nextInt(0, ks.length - 1)];
        console.log('  >>picker pick=' + k);
        return createBuffObject(k, CONFIG.BUFFS[k].duration || 4);
    };
    console.log(`[g${i}] seed=${seed} start`);
    let nSteps = 0;
    const res = runBattle({
        ally: teams.allyTeam, enemy: teams.enemyTeam, seed, hexPicker,
        onStep: (s) => {
            globalSteps++; nSteps++;
            if (VERBOSE) {
                const f = (t) => t.map(u => `${u.name}@${u.pos}${u.alive ? '' : '☠'}${u.state._acted ? '' : '*'}`).join(' ');
                const ft = (s.log || []).map(e => e.factType).join('|');
                console.log(`   #${globalSteps} ally[${f(s.ally)}] enemy[${f(s.enemy)}]${s.winner ? ' WIN=' + s.winner : ''}${s.done ? ' DONE' : ''}\n      facts: ${ft}`);
            }
        }
    });
    console.log(`[g${i}] done winner=${res.winner} rounds=${res.rounds} steps=${nSteps}`);
}
console.log('ALL DONE steps=' + globalSteps);
