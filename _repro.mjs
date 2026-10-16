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
let _btwSinceStep = 0;
{
    const _emit = eventBus.emit.bind(eventBus);
    eventBus.emit = (sig, data) => {
        if (sig === 'beforeStateTransition') {
            _btwSinceStep++;
            if (_btwSinceStep > 300) {
                console.log('!!! SPIN_GUARD beforeStateTransition x' + _btwSinceStep);
                const { A, B } = data || {};
                const dump = (t, tag) => console.log('   ' + tag + ' ' + (t || []).map(u => `${u.name}@${u.pos} alive=${u.alive} _isDead=${u.state._isDead} _acted=${u.state._acted} hp=${u.hp} stun=${u.state._stunned} horse=${!!u.isHorse} lion=${!!u.isLionCub} rec=${!!u.isUnityRecruit} end=${!!u.endlessBreath} f=(${!!u._fsm ? (u._fsm.current || '?') : 'none'})`).join('\n      '));
                dump(A, 'A:'); dump(B, 'B:');
                throw new Error('SPIN_GUARD');
            }
        }
        if (VERBOSE && process.env.E) console.log('  >>emit ' + sig);
        return _emit(sig, data);
    };
}
// 紧循环探测器：同一 (min,max) 连续调用超阈值 = 无界重抽循环，抛错拿栈
let _lastPair = '', _run = 0;
const _origNextInt = SeededRNG.prototype.nextInt;
SeededRNG.prototype.nextInt = function (a, b) {
    const key = a + ',' + b;
    if (key === _lastPair) { _run++; if (_run > 20000) { const e = new Error('LOOP_GUARD nextInt(' + a + ',' + b + ') x' + _run); console.log('!!! LOOP_GUARD nextInt(' + a + ',' + b + ')'); console.log(e.stack); _run = 0; throw e; } }
    else { _lastPair = key; _run = 0; }
    return _origNextInt.call(this, a, b);
};

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
        return createBuffObject(k, CONFIG.BUFFS[k].duration || 4);
    };
    console.log(`[g${i}] seed=${seed} start`);
    let nSteps = 0;
    const res = runBattle({
        ally: teams.allyTeam, enemy: teams.enemyTeam, seed, hexPicker,
        onStep: (s) => {
            globalSteps++; nSteps++; _btwSinceStep = 0;
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
