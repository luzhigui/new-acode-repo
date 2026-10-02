// 探针：母狮联动死亡剧透——dump 每步的 fact 序列与目标死活状态
// 用法：node tools/probe-lioness.mjs [stage] [seedStart] [seedCount]
import { initBattleTeams } from '../modules/29battle-init.js';
import { runBattle } from '../core/06battle-runner.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { eventBus } from '../infra/50-event-bus.js';
import { flushBattleEvents } from '../infra/51-core-utils.js';
import { loadGameData, getGameData } from '../core/01config-5v5-test.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import '../modules/25elite-imperial.js';
import '../modules/26elite-sixsects.js';
import '../modules/27elite-mingjiao.js';

// node 探针补丁：node 的 fetch 不认相对 URL，把 content/200game-data.json 映射成 file:// 读取
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

const stage = parseInt(process.argv[2] || '5', 10);   // 第5关=谢逊关
const seedStart = parseInt(process.argv[3] || '1', 10);
const seedCount = parseInt(process.argv[4] || '30', 10);

function clearBattleGlobals() {
    eventBus.clearAll();
    GlobalStore.set('forceZhang', null); GlobalStore.set('forceWei', null); GlobalStore.set('forceXiaoZhao', null);
    GlobalStore.set('currentBattleState', null);
    flushBattleEvents();
}

let found = 0;
for (let seed = seedStart; seed < seedStart + seedCount && found < 3; seed++) {
    clearBattleGlobals();
    const initRng = new SeededRNG(seed);
    const { allyTeam, enemyTeam } = initBattleTeams(stage, initRng);
    const hasXieXun = [...allyTeam, ...enemyTeam].some(u => u.isXieXun || (u.name && u.name.includes('谢逊')));
    if (!hasXieXun) { if (seed === seedStart) console.log(`第${stage}关无谢逊，换关试试`); continue; }

    runBattle({
        ally: allyTeam, enemy: enemyTeam, seed,
        onStep: (step) => {
            const log = step.log || [];
            // 找含 lionFollow（随动）迹象的步：母狮攻击 fact + 同目标多次被击
            const atkFacts = log.filter(e => e && e.factType === 'attack');
            if (atkFacts.length === 0) return;
            // 目标在步内被多次攻击 = 联动场景
            const byTarget = new Map();
            for (const f of atkFacts) {
                const tName = f.data?.target?.name || '?';
                if (!byTarget.has(tName)) byTarget.set(tName, []);
                byTarget.get(tName).push(f);
            }
            for (const [tName, facts] of byTarget) {
                if (facts.length < 2) continue;
                found++;
                console.log(`\n=== seed=${seed} 步内【${tName}】被击 ${facts.length} 次（联动场景）===`);
                for (const f of facts) {
                    const d = f.data || {};
                    const r = d.dmgResult || {};
                    const snap = d.snap || {};
                    console.log(`  攻者=${(d.attacker && d.attacker.name) || '?'} dead=${!!r.dead} execKill=${!!r.executeKill} hpBefore=${r.hpBefore} dmg=${Math.round(r.dmg || 0)} link=${!!(snap.isLinkAttack || (d.attacker && d.attacker.state && d.attacker.state._isLinkAttack))}`);
                }
                // 步终态：这个单位在 step.ally/enemy 里的死活
                const finalU = [...(step.ally || []), ...(step.enemy || [])].find(u => u.name === tName);
                if (finalU) console.log(`  步终态: alive=${finalU.alive} _isDead=${!!(finalU.state && finalU.state._isDead)} hp=${Math.round(finalU.hp)}`);
            }
        }
    });
}
console.log(`\n共找到 ${found} 个联动步样本`);
