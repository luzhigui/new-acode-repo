// 探针：杨逍「先机」抢夺概率实测——数掷骰次数与命中次数，验证 40% 是否真实生效
// 用法：node tools/probe-yangxiao-jump.mjs [stage] [battles]
import { initBattleTeams } from '../modules/29battle-init.js';
import { runBattle } from '../core/06battle-runner.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { eventBus } from '../infra/50-event-bus.js';
import { flushBattleEvents } from '../infra/51-core-utils.js';
import { loadGameData, loadHexEnhanceData, getGameData } from '../core/01config-5v5-test.js';
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
// 第 162 轮：小昭.hexEnhance 已迁到 content/201hex-enhance.json，启动链一并 loadHexEnhanceData（缺口由 tests/hex-boot-chain-guard.mjs 点名）
await loadHexEnhanceData();
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
let jumps = 0, victimActedLater = 0, victimNeverActed = 0, victimDied = 0;   // 插队式验证：顺延者同回合内是否补上出手
for (let seed = 1; seed <= 4000 && withYangXiao < N; seed++) {
    clearBattleGlobals();
    const initRng = new SeededRNG(seed);
    const { allyTeam, enemyTeam } = initBattleTeams(stage, initRng);
    const hasYangXiao = [...allyTeam, ...enemyTeam].some(u => u.isYangXiao);
    if (!hasYangXiao) continue;
    withYangXiao++;
    let roundSteal = false;
    let pendingVictims = [];    // 本回合被顺延、待验证的队友名
    runBattle({ ally: allyTeam, enemy: enemyTeam, seed, onStep: (step) => {
        for (const f of (step.log || [])) {
            if (f && f.factType === 'roundStart') {
                stealRounds += roundSteal ? 1 : 0; roundSteal = false; roundsTotal++;
                // 上回合没验完的顺延者（回合末才结算）——理想情况都应在同回合内出手
                for (const v of pendingVictims) { victimNeverActed++; }
                pendingVictims = [];
            }
            if (f && f.factType === 'skillAnnounce' && (f.data?.note || '').includes('先机：抢先出手')) {
                roundSteal = true; jumps++;
                const m = (f.data.note || '').match(/（(\S+) 顺延/);
                if (m) pendingVictims.push(m[1]);
            }
            // 顺延者出手了（普攻/反击等 attack fact）→ 验证通过
            if (f && f.factType === 'attack' && pendingVictims.length > 0) {
                const a = f.data?.attacker?.name;
                const idx = pendingVictims.indexOf(a);
                if (idx >= 0) { pendingVictims.splice(idx, 1); victimActedLater++; }
                // 顺延者被击杀（没来得及出手就死）→ 合法未出手
                const t = f.data?.target;
                const ti = t ? pendingVictims.indexOf(t.name) : -1;
                if (ti >= 0 && (t.alive === false || (f.data?.targetAlive === false))) { pendingVictims.splice(ti, 1); victimDied++; }
            }
            // 顺延者休息/被眩晕等 pass 也算行动权落地（没被吞）
            if (f && f.factType === 'pass' && pendingVictims.length > 0) {
                const u = f.data?.unit?.name;
                const idx = pendingVictims.indexOf(u);
                if (idx >= 0) { pendingVictims.splice(idx, 1); victimActedLater++; }
            }
        }
    } });
    stealRounds += roundSteal ? 1 : 0;
    for (const v of pendingVictims) { victimNeverActed++; }
    clearBattleGlobals();
}

console.log(`第${stage}关 | 含杨逍对局 ${withYangXiao} 场 | 总回合 ${roundsTotal}`);
console.log(`掷骰机会 ${rolls} 次 | 命中 ${hits} 次 | 实测命中率 ${(hits / Math.max(1, rolls) * 100).toFixed(1)}%（口径 40%）`);
console.log(`插队 ${jumps} 次 | 顺延者随后出手/落地 ${victimActedLater} 次 | 中途阵亡 ${victimDied} 次 | 行动权被吞 ${victimNeverActed} 次（应为 0）`);
