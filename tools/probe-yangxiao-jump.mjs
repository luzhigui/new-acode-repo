// 探针：杨逍「先机」抢夺概率实测——数掷骰次数与命中次数，验证 40% 是否真实生效
// 用法：node tools/probe-yangxiao-jump.mjs [stage] [battles]
import { initBattleTeams } from '../modules/29battle-init.js';
import { runBattle } from '../core/06battle-runner.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { eventBus } from '../infra/50-event-bus.js';
import { flushBattleEvents } from '../infra/51-core-utils.js';
import { loadGameData, getGameData } from '../core/01config-5v5-test.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import { SIGNAL_TYPES } from '../infra/56-battle-enums.js';
import { EXECUTION_LAYER as L } from '../infra/50-event-bus.js';
import '../modules/00reg-mechanics.js';

if (typeof localStorage === 'undefined') { globalThis.localStorage = { getItem: () => null, setItem: () => {} }; }
const _origFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
    const u = String(input);
    if (u.includes('200game-data.json')) {
        const fs = await import('node:fs');
        const path = new URL('../content/200game-data.json', import.meta.url);
        const buf = fs.readFileSync(path);
        return { ok: true, status: 200, json: async () => JSON.parse(buf.toString('utf-8')) };
    }
    return _origFetch(input, init);
};
await loadGameData();
if (!getGameData()) throw new Error('游戏数据装载失败');

const stage = parseInt(process.argv[2] || '7', 10);
const N = parseInt(process.argv[3] || '60', 10);

// 与杨逍监听器同判据的计数器：包一层 emit（clearAll 只清监听表不清方法，包一层能活过每回合重置），
// 在原 emit 返回后读 declaration.jumpConsume 终值——掷骰机会与命中一一对应
let rolls = 0, hits = 0;
const origEmit = eventBus.emit.bind(eventBus);
eventBus.emit = (type, data) => {
    const r = origEmit(type, data);
    if (type === SIGNAL_TYPES.BEFORE_ACTION_SELECT && data && data.unit && data.unit.isYangXiao) {
        const u = data.unit;
        if (u.alive && !u.state._acted) {
            const ahead = (data.allySide || []).some(m => m !== u && m.alive && !m.state._acted && m.pos < u.pos);
            if (ahead) {
                rolls++;
                if (data.declaration.jumpConsume) hits++;
            }
        }
    }
    return r;
};

function clearBattleGlobals() {
    eventBus.clearAll();
    GlobalStore.set('forceZhang', null); GlobalStore.set('forceWei', null); GlobalStore.set('forceXiaoZhao', null);
    GlobalStore.set('currentBattleState', null);
    flushBattleEvents();
}

let withYangXiao = 0, roundsTotal = 0, stealRounds = 0;
for (let seed = 1; seed <= 4000 && withYangXiao < N; seed++) {
    clearBattleGlobals();
    const initRng = new SeededRNG(seed);
    const { allyTeam, enemyTeam } = initBattleTeams(stage, initRng);
    const hasYangXiao = [...allyTeam, ...enemyTeam].some(u => u.isYangXiao);
    if (!hasYangXiao) continue;
    withYangXiao++;
    let roundSteal = false;
    runBattle({ ally: allyTeam, enemy: enemyTeam, seed, onStep: (step) => {
        for (const f of (step.log || [])) {
            if (f && f.factType === 'roundStart') { stealRounds += roundSteal ? 1 : 0; roundSteal = false; roundsTotal++; }
            if (f && f.factType === 'pass' && f.data && f.data.reason === '被先机占用') roundSteal = true;
        }
    } });
    stealRounds += roundSteal ? 1 : 0;
    clearBattleGlobals();
}

console.log(`第${stage}关 | 含杨逍对局 ${withYangXiao} 场 | 总回合 ${roundsTotal}`);
console.log(`掷骰机会 ${rolls} 次 | 命中 ${hits} 次 | 实测命中率 ${(hits / Math.max(1, rolls) * 100).toFixed(1)}%（口径 40%）`);
console.log(`有抢夺的回合 ${stealRounds} / ${roundsTotal} = ${(stealRounds / Math.max(1, roundsTotal) * 100).toFixed(1)}%`);
