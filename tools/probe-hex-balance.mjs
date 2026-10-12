// 探针：海克斯平衡硬数据——每个海克斯「单独持有」的胜率 vs 无海克斯基线（同 seed 成对对照）
// 口径：只给这一个海克斯——抽取点它没拥有就抽它，否则本轮不抽（不做偏好+随机填坑，排除共现噪声）；
//       小昭·妹永久继承、圣火令抽行列、carry/职业需求过滤，与 tools/116 runHexStageJob 同款。
// 用法：node tools/probe-hex-balance.mjs [runsPerStage=100] [baseSeed=20261013]
import { initBattleTeams } from '../modules/29battle-init.js';
import { runBattle } from '../core/06battle-runner.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { eventBus } from '../infra/50-event-bus.js';
import { flushBattleEvents } from '../infra/51-core-utils.js';
import { loadGameData, getGameData, CONFIG } from '../core/01config-5v5-test.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import { hasCarryTarget } from '../modules/28buff-tools.js';
import { addPermanentBuff } from '../modules/20elite-skills.js';
import { CAMP_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';
import '../modules/00reg-mechanics.js';

// node 探针补丁（与 probe-lioness.mjs 同款）：fetch 映射 content/200game-data.json 到 file://
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
if (!getGameData()) throw new Error('游戏数据装载失败');

const runsPerStage = parseInt(process.argv[2] || '100', 10);
const baseSeed = parseInt(process.argv[3] || '20261013', 10);
const STAGES = [1, 2, 3, 4, 5, 6, 7];

function clearBattleGlobals() {
    eventBus.clearAll();
    GlobalStore.set('forceZhang', null); GlobalStore.set('forceWei', null); GlobalStore.set('forceXiaoZhao', null);
    GlobalStore.set('forceXieXun', null); GlobalStore.set('forcePang', null);
    GlobalStore.set('currentBattleState', null);
    flushBattleEvents();
}

function makePicker(onlyKey) {
    return (activeBuffs, allySide, rng) => {
        if (!onlyKey) return null;
        if (activeBuffs.some(b => b.key === onlyKey)) return null;
        const allyAlive = allySide.filter(u => u.alive);
        if (onlyKey === BUFF_TYPES.CARRY && !hasCarryTarget(allyAlive)) return null;
        const req = CONFIG.BUFF_ROLE_REQUIREMENTS?.[onlyKey];
        if (req && !allyAlive.some(u => u.role === req)) return null;
        const duration = CONFIG.BUFFS[onlyKey].duration || CONFIG.BUFF_DURATION || 4;
        const nb = { key: onlyKey, target: CAMP_TYPES.ALLY, remaining: duration, name: CONFIG.BUFFS[onlyKey].name };
        if (onlyKey === BUFF_TYPES.HOLY_FLAME) { nb.col = rng.nextInt(1, 3); nb.row = rng.nextInt(1, 3); }
        const brother = allySide.find(u => u.isXiaoZhaoBrother);
        if (brother) {
            const extra = onlyKey === BUFF_TYPES.HOLY_FLAME ? { col: nb.col, row: nb.row } : {};
            addPermanentBuff(brother, onlyKey, nb.name, extra);
        }
        return nb;
    };
}

function runCondition(onlyKey) {
    const wins = { ally: 0, enemy: 0, draw: 0 };
    for (const stage of STAGES) {
        for (let i = 0; i < runsPerStage; i++) {
            clearBattleGlobals();
            const seed = baseSeed + i * 7919;              // 同 seed 跨海克斯成对对照
            const initRng = new SeededRNG(seed);
            const teams = initBattleTeams(stage, initRng);
            const res = runBattle({ ally: teams.allyTeam, enemy: teams.enemyTeam, seed, hexPicker: makePicker(onlyKey) });
            const w = res.winner || '平局';
            if (w === '明教') wins.ally++;
            else if (w === '六大派') wins.enemy++;
            else wins.draw++;
        }
    }
    return wins;
}

const keys = Object.keys(CONFIG.BUFFS);
const rows = [];
const total = runsPerStage * STAGES.length;
const t0 = Date.now();

const base = runCondition(null);
rows.push({ name: '(无海克斯基线)', key: null, ...base });
console.log(`基线完成: 明教胜率 ${(base.ally / total * 100).toFixed(1)}%  [${Date.now() - t0}ms]`);

for (const k of keys) {
    const w = runCondition(k);
    rows.push({ name: CONFIG.BUFFS[k].name, key: k, ...w });
    console.log(`${CONFIG.BUFFS[k].name}(${k}) 完成: 明教胜率 ${(w.ally / total * 100).toFixed(1)}%  [${Date.now() - t0}ms]`);
}

const baseRate = base.ally / total * 100;
rows.sort((a, b) => (b.ally / total) - (a.ally / total));
console.log(`\n===== 海克斯胜率排名（每条件 ${total} 场 = 7 关 × ${runsPerStage}，seed 成对，明教方视角）=====`);
console.log('海克斯'.padEnd(12), '明教胜', '胜率', 'vs基线', '敌胜', '平');
for (const r of rows) {
    const rate = r.ally / total * 100;
    const delta = r.key ? (rate - baseRate).toFixed(1) : '—';
    console.log(
        r.name.padEnd(14),
        String(r.ally).padStart(4),
        (rate.toFixed(1) + '%').padStart(7),
        ((r.key ? (delta > 0 ? '+' : '') + delta + 'pp' : '—')).padStart(8),
        String(r.enemy).padStart(5),
        String(r.draw).padStart(3)
    );
}
console.log(`\n总耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
