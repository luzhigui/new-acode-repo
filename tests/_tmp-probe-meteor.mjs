// tests/_tmp-probe-meteor.mjs —— 一次性探针（查完即删，不得入库）
import { fileURLToPath } from 'node:url';
globalThis.fetch = async (url) => {
    const p = fileURLToPath(new URL(url));
    const fs = await import('node:fs');
    const text = fs.readFileSync(p, 'utf8');
    return { ok: true, json: async () => JSON.parse(text) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

const { CONFIG, loadGameData, loadHexEnhanceData, getSkillParams } = await import('../core/201-config-5v5-test.js');
const { SeededRNG } = await import('../infra/102-core-utils.js');
const { createRoundStepper } = await import('../core/210-battle-round.js');
const { initBattleTeams } = await import('../modules/330-battle-init.js');
const { BUFF_TYPES, ROLE_TYPES } = await import('../infra/106-battle-enums.js');
const { tickAndPickBuffs } = await import('./_lib/buff-picker.mjs');

await import('../modules/307-elite-imperial.js');
await import('../modules/308-elite-sixsects.js');
await import('../modules/317-elite-mingjiao.js');
await import('../modules/331-custom-effects.js');
await loadGameData();
await loadHexEnhanceData();

const sisEnh = getSkillParams('小昭', 'hexEnhance');
console.log('CONFIG.BUFFS 有 meteorShower :', Object.keys(CONFIG.BUFFS || {}).includes('meteorShower'));
console.log('BUFF_ROLE_REQUIREMENTS.meteorShower =', JSON.stringify(CONFIG.BUFF_ROLE_REQUIREMENTS?.[BUFF_TYPES.METEOR_SHOWER]));
console.log('小昭.hexEnhance.meteorShower =', JSON.stringify(sisEnh?.meteorShower));

const MAX_ROUND = CONFIG.MAX_ROUND || 35;
const stat = { battles: 0, meteorActive: 0, sisterAlive: 0, both: 0, rangedSplash: 0, growthFacts: 0, growBranchReached: 0 };

// 直接在引擎侧打点观测：探针不改主代码，改为监听 fact
for (const seed of [1, 42, 999, 12345, 777, 88888]) {
    for (const stage of [1, 3, 5, 7]) {
        const rng = new SeededRNG(seed);
        const { allyTeam, enemyTeam } = initBattleTeams(stage, rng);
        stat.battles++;
        let sawMeteor = false, sawSister = false;
        let bs = {
            ally: allyTeam.map(u => u.clone()), enemy: enemyTeam.map(u => u.clone()), round: 1,
            activeBuffs: tickAndPickBuffs([], allyTeam, enemyTeam, 1, seed, true),
            allAllies: allyTeam.map(u => u.clone()), _rng: rng
        };
        while (bs.round <= MAX_ROUND) {
            const stepper = createRoundStepper(bs);
            let lastStep = null;
            for (const step of stepper) {
                lastStep = step;
                if ((step.ally._activeBuffs || []).some(b => b.key === BUFF_TYPES.METEOR_SHOWER)) sawMeteor = true;
                if (step.ally.some(u => u.isXiaoZhaoSister && u.alive)) sawSister = true;
                for (const e of step.log || []) {
                    if (!e || !e.factType) continue;
                    if (e.factType === 'meteorSplashGrowth') stat.growthFacts++;
                    if (e.factType === 'meteorShowerSplash') stat.rangedSplash++;
                }
                if (step.winner) break;
            }
            if (!lastStep || lastStep.winner) break;
            bs = {
                ally: lastStep.ally.map(u => u.clone()), enemy: lastStep.enemy.map(u => u.clone()),
                round: bs.round + 1,
                activeBuffs: tickAndPickBuffs(bs.activeBuffs, lastStep.ally, lastStep.enemy, bs.round, seed, bs.round % 3 === 0),
                allAllies: bs.allAllies, _rng: rng
            };
        }
        if (sawMeteor) stat.meteorActive++;
        if (sawSister) stat.sisterAlive++;
        if (sawMeteor && sawSister) stat.both++;
    }
}
console.log('统计 :', JSON.stringify(stat, null, 0));
