// 探针：胖远桥（六大派精英·第3关）改前/改后胜率对比——force 胖远桥阵容变体，逐 seed 跑第3关，统计明教胜率。
// 用法：node tools/probe-pang-balance.mjs [runs=600] [baseSeed=20261013]
//   · 改前：git stash（回到 HEAD）跑一次；改后：git stash pop（工作树）跑一次，比较两行「明教胜率」。
//   · 只读：不写任何文件；forcePang 走 GlobalStore（modules/29 轮盘互锁，强制第3关出胖远桥变体），无海克斯（裸机）口径。
import { initBattleTeams } from '../modules/29battle-init.js';
import { runBattle } from '../core/06battle-runner.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { eventBus } from '../infra/50-event-bus.js';
import { flushBattleEvents } from '../infra/51-core-utils.js';
import { loadGameData, loadHexEnhanceData, getGameData } from '../core/01config-5v5-test.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import '../modules/00reg-mechanics.js';

// node 探针补丁：fetch 映射 content/200game-data.json 到 file://（2026-10-16 海克斯探针 probe-hex-balance.mjs 已删，此处注释同步去掉引用）
if (typeof localStorage === 'undefined') { globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }; }
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

const runs = parseInt(process.argv[2] || '600', 10);
const baseSeed = parseInt(process.argv[3] || '20261013', 10);
const STAGE = 3;

function clearBattleGlobals() {
    eventBus.clearAll();
    GlobalStore.set('forceZhang', null); GlobalStore.set('forceWei', null); GlobalStore.set('forceXiaoZhao', null);
    GlobalStore.set('forceXieXun', null);
    GlobalStore.set('forcePang', true);                 // 强制第3关走「胖远桥」阵容变体
    GlobalStore.set('currentBattleState', null);
    flushBattleEvents();
}

const wins = { ally: 0, enemy: 0, draw: 0 };
const t0 = Date.now();
for (let i = 0; i < runs; i++) {
    clearBattleGlobals();
    const seed = baseSeed + i * 7919;                   // 同 seed 跨改前/改后成对对照
    const teams = initBattleTeams(STAGE, new SeededRNG(seed));
    const res = runBattle({ ally: teams.allyTeam, enemy: teams.enemyTeam, seed, hexPicker: () => null });
    const w = res.winner || '平局';
    if (w === '明教') wins.ally++; else if (w === '六大派') wins.enemy++; else wins.draw++;
}
const rate = wins.ally / runs * 100;
console.log(`第${STAGE}关·胖远桥变体 | ${runs} 场 | 明教胜 ${wins.ally} / 六大派胜 ${wins.enemy} / 平 ${wins.draw}`);
console.log(`明教胜率 ${rate.toFixed(2)}%  [${((Date.now() - t0) / 1000).toFixed(1)}s]`);
