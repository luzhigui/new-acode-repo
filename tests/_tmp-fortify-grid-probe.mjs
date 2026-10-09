// 复现：格子防37 vs 日志防56 —— 严阵以待词条在 step 单位上是否存在
import { fileURLToPath } from 'node:url';
import { SeededRNG } from '../infra/51-core-utils.js';
import { runBattle } from '../core/06battle-runner.js';
import { getStat } from '../core/13battle-shared.js';
import '../infra/54-global-store.js';
import '../modules/00reg-mechanics.js';

// Node 的 fetch 不支持 file://：垫 shim 再 loadGameData
const fs = await import('node:fs');
globalThis.fetch = async (url) => {
    const p = fileURLToPath(new URL(url, 'file://' + process.cwd() + '/'));
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
};
const { loadGameData } = await import('../core/01config-5v5-test.js');
await loadGameData();
// node 无 localStorage：垫空实现（29battle-init 读 _forceZhang）
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const { initBattleTeams } = await import('../modules/29battle-init.js');

const seed = 20261009;
const rng = new SeededRNG(seed);
const { allyTeam, enemyTeam } = initBattleTeams(1, rng);
console.log('明教阵容:', allyTeam.map(u => `${u.name}(${u.role})`).join(', '));
const hasDefender = allyTeam.some(u => u.role === '防战');
console.log('明教有防战:', hasDefender);

runBattle({
    ally: allyTeam,
    enemy: enemyTeam,
    seed,
    initialBuffs: [{ key: 'fortify', remaining: 99 }],
    maxRounds: 3,
    onStep: (step) => {
        for (const u of step.ally) {
            if (u.role !== '防战' || !u.alive) continue;
            const gs = getStat(u, 'def');
            const mods = (u._mods && u._mods.def) || [];
            const fort = mods.filter(m => m.source === '严阵以待');
            console.log(`[step] ${u.name} base=${u.state._baseDef} def属性=${u.def} getStat=${gs} 严阵词条数=${fort.length} 全部def词条=${JSON.stringify(mods.map(m => m.source + ':' + m.value + ':' + m.op))}`);
            break;
        }
        // 找日志里攻击防战的那行，看 defBase
        for (const e of (step.log || [])) {
            if (e && e.factType === 'attack' && e.data && e.data.dmgCalc) {
                const t = e.data.target;
                if (t && t.role === '防战') {
                    console.log(`  [攻击防战] defBase=${e.data.dmgCalc.defBase} defAct=${e.data.dmgCalc.defAct} target快照def=${t.def}`);
                }
            }
        }
    }
});
console.log('--- done ---');
