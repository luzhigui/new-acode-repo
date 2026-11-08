// tests/round-order-check.mjs
// 体检巡检：回合四相位顺序的**运行期**实测（ROUND_START → 选 Buff → 攻击组 → ROUND_END）
//
// 为什么要有这一件（与规则 234/236 的分工）：
//   规则 234（回合前导结算顺序，V1.1.0 扩到光环/圣火/灵魂汲取/众志成城）与规则 236（回合边界 + 回合号上界，
//   V1.1.0 放宽终局清场事实）都在 rules-replay 的 fact 流上判；本件是独立巡检：自己起对局、自己攒 fact 流、
//   逐场打印回合数，能在 rules-replay 之外单独跑（新改动可以只改 SAMPLE 定向看时间线），不依赖 121 注册。
//
// 判据（与 234/236 同源，2026-11-08 12 seed × 7 关 = 84 场实测 0 红）：
//   ① 每条战报第一条 fact 是 roundStart；
//   ② 每回合的前导结算族（buffSummary / xuanmingDot / auraApply / holyFlameApply / soulDrainApply / unityApply）
//      全部早于本回合首次出手；
//   ③ 终局段（最后一条 roundEnd 之后、其后不再有 roundStart）不许出现出手类事实、不许再开新回合；
//      —— 终局清场事实（死亡/血量/摘要等非出手类）允许落在 ROUND_END 之后，这是已定口径；
//   ④ roundStart / roundEnd 的 round ∈ 1..MAX_ROUND，且到封顶后不许再开新回合。
//
// 用法：
//   node tests/round-order-check.mjs                       # 默认 5 种子 × 2 关卡
//   SEEDS=1,2,3 STAGES=1,3,5 node tests/round-order-check.mjs
// 退出码：0 = 全绿；1 = 有红（逐场打印 seed:stage 与首个违例位置）。
globalThis.fetch = async (url) => {
    const fs = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const p = fileURLToPath(new URL(url));
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

export const VER = 'tests/round-order-check.mjs V1.0.0';

const [{ CONFIG, loadGameData, loadHexEnhanceData }, { SeededRNG, setBattleState }, { createRoundStepper },
    { initBattleTeams }, { GlobalStore }, { createStore, battleReducer }, { createInitialState },
    { tickAndPickBuffs }, { FACT_TYPES }, { collectFacts }, { rule234 }, { rule236 }] = await Promise.all([
        import('../core/201-config-5v5-test.js'),
        import('../infra/102-core-utils.js'),
        import('../core/210-battle-round.js'),
        import('../modules/330-battle-init.js'),
        import('../infra/104-global-store.js'),
        import('../modules/306-battle-store.js'),
        import('../core/218-state-keys.js'),
        import('./_lib/buff-picker.mjs'),
        import('../infra/106-battle-enums.js'),
        import('./_lib/fact-collect.mjs'),
        import('./health-rules/234-round-settlement-order.js'),
        import('./health-rules/236-round-boundary.js')
    ]);
await import('./_lib/install-mechanics.mjs');
await loadGameData();
await loadHexEnhanceData();

const MAX_ROUND = CONFIG.MAX_ROUND || 35;
const SEEDS = (process.env.SEEDS || '1,2,3,4,5').split(',').map(Number).filter(Boolean);
const STAGES = (process.env.STAGES || '1,3').split(',').map(Number).filter(Boolean);

const TURN_TYPES = [FACT_TYPES.ATTACK, FACT_TYPES.MISS, FACT_TYPES.DODGE, FACT_TYPES.IMMUNE, FACT_TYPES.PASS];
const LEAD_TYPES = [FACT_TYPES.BUFF_SUMMARY, FACT_TYPES.XUAN_MING_DOT, FACT_TYPES.AURA_APPLY,
    FACT_TYPES.HOLY_FLAME_APPLY, FACT_TYPES.SOUL_DRAIN_APPLY, FACT_TYPES.UNITY_APPLY];

function playOne(seed, stage) {
    try { setBattleState('holyToken', 0); } catch (e) { /* 垫片环境允许失败 */ }
    const rng = new SeededRNG(seed);
    const store = createStore({ ...createInitialState(), units: [] }, battleReducer);
    GlobalStore.set('battleStore', store);
    const { allyTeam, enemyTeam } = initBattleTeams(stage, rng);
    let bs = {
        ally: allyTeam.map(u => u.clone()), enemy: enemyTeam.map(u => u.clone()), round: 1,
        activeBuffs: [], allAllies: allyTeam.map(u => u.clone()), _rng: rng
    };
    bs.activeBuffs = tickAndPickBuffs([], bs.ally, bs.enemy, 1, seed, true);
    const facts = [];
    let winner = null, lastStep = null;
    while (bs.round <= MAX_ROUND) {
        lastStep = null;
        for (const step of createRoundStepper(bs)) {
            lastStep = step;
            collectFacts(step.log, facts);
            if (step.winner) winner = step.winner;
        }
        if (winner || !lastStep) break;
        const nr = bs.round + 1;
        const nb = tickAndPickBuffs(bs.activeBuffs, lastStep.ally, lastStep.enemy, bs.round, seed, bs.round % 3 === 0);
        bs = { ally: lastStep.ally.map(u => u.clone()), enemy: lastStep.enemy.map(u => u.clone()), round: nr, activeBuffs: nb, allAllies: bs.allAllies, _rng: rng };
    }
    return { facts, winner };
}

function checkOne(facts) {
    const errs = [];
    if (facts.length && facts[0].factType !== FACT_TYPES.ROUND_START) {
        errs.push('战报第一条不是 roundStart（' + facts[0].factType + '）');
    }
    const starts = [];
    for (let i = 0; i < facts.length; i++) if (facts[i].factType === FACT_TYPES.ROUND_START) starts.push(i);
    if (!starts.length) return { errs: ['没有回合开始符'] };

    // ④ 回合号上界
    let cappedStart = -1, lastEnd = -1, lastStart = -1;
    for (let i = 0; i < facts.length; i++) {
        const f = facts[i], t = f.factType;
        if (t === FACT_TYPES.ROUND_END) lastEnd = i;
        if (t === FACT_TYPES.ROUND_START) lastStart = i;
        if (t !== FACT_TYPES.ROUND_START && t !== FACT_TYPES.ROUND_END) continue;
        const r = f.data && f.data.round;
        if (!(typeof r === 'number' && r >= 1 && r <= MAX_ROUND)) errs.push(t + '@' + i + ' 回合号越界：' + r);
        if (t === FACT_TYPES.ROUND_START) {
            if (cappedStart >= 0 && r !== cappedStart) errs.push('封顶第' + cappedStart + '回合后又开第' + r + '回合');
            if (r === MAX_ROUND) cappedStart = r;
        }
    }

    // ② 前导结算早于首次出手
    for (let k = 0; k < starts.length; k++) {
        const from = starts[k], to = (k + 1 < starts.length) ? starts[k + 1] : facts.length;
        const round = (facts[from].data && facts[from].data.round) || (k + 1);
        let firstTurn = -1, firstLead = -1;
        for (let i = from + 1; i < to; i++) {
            const t = facts[i].factType;
            if (firstTurn < 0 && TURN_TYPES.indexOf(t) >= 0) firstTurn = i;
            if (firstLead < 0 && LEAD_TYPES.indexOf(t) >= 0) firstLead = i;
        }
        if (firstLead >= 0 && firstTurn >= 0 && firstTurn < firstLead) {
            errs.push('第' + round + '回合：首次出手@' + firstTurn + ' 早于前导结算 ' + facts[firstLead].factType + '@' + firstLead);
        }
    }

    // ③ 终局段
    if (lastEnd >= 0 && lastStart <= lastEnd) {
        for (let i = lastEnd + 1; i < facts.length; i++) {
            const t = facts[i].factType;
            if (TURN_TYPES.indexOf(t) >= 0) errs.push('终局段出手：' + t + '@' + i);
            else if (t === FACT_TYPES.ROUND_START) errs.push('终局段又开回合@' + i);
        }
    }
    return { errs };
}

console.log('=== 回合四相位巡检 ===');
console.log('VER ' + VER);
let games = 0, red = 0;
const ruleStat = { 234: { pass: 0, fail: 0, skip: 0 }, 236: { pass: 0, fail: 0, skip: 0 } };
const ROUNDS_SHOWN = [];
for (const seed of SEEDS) {
    for (const stage of STAGES) {
        const { facts } = playOne(seed, stage);
        games++;
        const { errs } = checkOne(facts);
        if (errs.length) {
            red++;
            console.log(`❌ seed=${seed} stage=${stage}：${errs.length} 处 —— ${errs.slice(0, 3).join('；')}`);
        } else {
            let rounds = 0;
            for (const f of facts) if (f.factType === FACT_TYPES.ROUND_START) rounds++;
            ROUNDS_SHOWN.push(`seed=${seed} stage=${stage} 回合数=${rounds} fact=${facts.length}`);
        }
        for (const [id, rule] of [[234, rule234], [236, rule236]]) {
            const r = rule.test(null, null, null, null, null, null, facts);
            if (r === 'skip') ruleStat[id].skip++;
            else if (r && r.fail) { ruleStat[id].fail++; console.log(`   ❌ ${id} 判红：seed=${seed} stage=${stage} —— ${r.msg}`); }
            else ruleStat[id].pass++;
        }
    }
}
for (const s of ROUNDS_SHOWN) console.log('   ✓ ' + s);
console.log(`巡检：${games} 场，红 ${red} 场；234：pass=${ruleStat[234].pass} fail=${ruleStat[234].fail} skip=${ruleStat[234].skip}；236：pass=${ruleStat[236].pass} fail=${ruleStat[236].fail} skip=${ruleStat[236].skip}`);
console.log(red || ruleStat[234].fail || ruleStat[236].fail ? '\nRESULT: FAIL' : '\nRESULT: PASS');
process.exit(red || ruleStat[234].fail || ruleStat[236].fail ? 1 : 0);
