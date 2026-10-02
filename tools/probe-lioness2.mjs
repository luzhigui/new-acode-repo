// 探针2：母狮随动的 step 切分——随动多头是一个 step 还是各占一步；目标死后续打
// 用法：node tools/probe-lioness2.mjs [stage] [seedStart] [seedCount]
import { initBattleTeams } from '../modules/29battle-init.js';
import { runBattle } from '../core/06battle-runner.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { eventBus } from '../infra/50-event-bus.js';
import { flushBattleEvents, SeededRNG } from '../infra/51-core-utils.js';
import { loadGameData } from '../core/01config-5v5-test.js';
import '../modules/00reg-mechanics.js';   // 机制装配统一入口（25/26/27/30；此前漏装 30）

if (typeof localStorage === 'undefined') { globalThis.localStorage = { getItem: () => null, setItem: () => {} }; }
const _origFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
    if (String(input).includes('200game-data.json')) {
        const fs = await import('node:fs');
        const buf = fs.readFileSync(new URL('../content/200game-data.json', import.meta.url));
        return { ok: true, status: 200, json: async () => JSON.parse(buf.toString('utf-8')) };
    }
    return _origFetch(input, init);
};
await loadGameData();

const stage = parseInt(process.argv[2] || '5', 10);
const seedStart = parseInt(process.argv[3] || '1', 10);
const seedCount = parseInt(process.argv[4] || '60', 10);
const LION_NAMES = /(母狮|雄狮|金毛狮王)/;

function clearBattleGlobals() {
    eventBus.clearAll();
    GlobalStore.set('forceZhang', null); GlobalStore.set('forceWei', null); GlobalStore.set('forceXiaoZhao', null);
    GlobalStore.set('currentBattleState', null);
    flushBattleEvents();
}

let found = 0;
for (let seed = seedStart; seed < seedStart + seedCount && found < 4; seed++) {
    clearBattleGlobals();
    const initRng = new SeededRNG(seed);
    const { allyTeam, enemyTeam } = initBattleTeams(stage, initRng);
    const hasXieXun = [...allyTeam].some(u => u.isXieXun || (u.name || '').includes('谢逊'));
    if (!hasXieXun) continue;

    const stepSummaries = [];
    let stepIdx = 0;
    runBattle({
        ally: allyTeam, enemy: enemyTeam, seed,
        onStep: (step) => {
            const atk = (step.log || []).filter(e => e && e.factType === 'attack');
            if (!atk.length) { stepIdx++; return; }
            const lionInvolved = atk.some(f => LION_NAMES.test(f.data.attacker?.name || ''));
            if (!lionInvolved) { stepIdx++; return; }
            const rows = atk.map(f => {
                const d = f.data, r = d.dmgResult || {};
                return `${d.attacker.name}→${d.target.name}(dead=${!!r.dead})`;
            });
            const deadT = atk.filter(f => f.data.dmgResult && f.data.dmgResult.dead).map(f => f.data.target.name);
            stepSummaries.push({ stepIdx, rows, deadT });
            stepIdx++;
        }
    });
    const hasLionKill = stepSummaries.some(s => s.deadT.length > 0);
    if (!hasLionKill) continue;
    found++;
    console.log(`\n===== seed=${seed} 狮子击杀局 =====`);
    for (const s of stepSummaries) {
        console.log(`  step#${s.stepIdx}: ${s.rows.join(' | ')}${s.deadT.length ? '  ★死:' + s.deadT.join(',') : ''}`);
    }
}
console.log(`\n样本数 ${found}`);
