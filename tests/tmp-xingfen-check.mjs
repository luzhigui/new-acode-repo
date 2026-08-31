// 宋青书「性奋」触发验证：stage 4（敌方含宋青书+周芷若）
// 只读引擎不改代码：eventBus 侧挂探针统计 afterAttack/afterMiss/事实
if (typeof window === 'undefined') globalThis.window = globalThis;
if (typeof localStorage === 'undefined') {
    const _ls = new Map();
    globalThis.localStorage = {
        getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
        setItem: (k, v) => { _ls.set(k, String(v)); },
        removeItem: (k) => { _ls.delete(k); },
        clear: () => { _ls.clear(); }
    };
}
// node fetch 不支持 file:// → 用 fs 直接读
import { readFileSync } from 'node:fs';
globalThis.fetch = async (input) => {
    let u = String(input);
    u = u.replace(/^file:\/\//, '');
    const body = readFileSync(u);
    return { ok: true, json: async () => JSON.parse(body.toString('utf8')) };
};

const { loadGameData } = await import('../core/01config-5v5-test.js');
const { SeededRNG, flushBattleEvents } = await import('../infra/51-core-utils.js');
const { clearAllEliteStates } = await import('../core/18-elite-state.js');
const { createRoundStepper } = await import('../core/11battle-round.js');
const { setBattleRng } = await import('../core/13battle-shared.js');
const { initBattleTeams } = await import('../modules/29battle-init.js');
const { eventBus } = await import('../infra/50-event-bus.js');
const { GlobalStore } = await import('../infra/54-global-store.js');
await import('../modules/25elite-imperial.js');
await import('../modules/26elite-sixsects.js');
await import('../modules/27elite-mingjiao.js');

await loadGameData();

const BATTLES = 30;
const stats = {
    grants: 0,          // 性奋激活（回合开始周芷若+宋青书都活着）
    extraAttacks: 0,    // 额外攻击触发次数
    retries: 0,         // 未命中重试次数
    songAttacks: 0,     // 宋青书实际攻击总次数（afterAttack 计）
    songMisses: 0,      // 宋青书未命中次数（afterMiss 计）
    songRoundsAlive: 0, // 宋青书存活回合计数
    unhandled: 0
};
process.on('unhandledRejection', (r) => { stats.unhandled++; console.log('[unhandledRejection]', String(r).slice(0, 200)); });

function clearBattleGlobals() {
    eventBus.clearAll();
    GlobalStore.set('forceZhang', null);
    GlobalStore.set('forceWei', null);
    GlobalStore.set('forceXiaoZhao', null);
    GlobalStore.set('currentBattleState', null);
    flushBattleEvents();
    clearAllEliteStates();
}

for (let b = 0; b < BATTLES; b++) {
    clearBattleGlobals();
    const seed = 20260831 + b * 7919;
    const initRng = new SeededRNG(seed);
    const { allyTeam, enemyTeam } = initBattleTeams(4, initRng);
    if (!enemyTeam.some(u => u.name === '宋青书') || !enemyTeam.some(u => u.name === '周芷若')) {
        console.log(`battle ${b}: 阵容不含目标，跳过`, enemyTeam.map(u => u.name).join(','));
        continue;
    }
    // 探针：挂在最低优先级（90/90），在性奋额外攻击之后执行，统计事实
    eventBus.on('afterAttack', 90, (data) => {
        if (data.unit && data.unit.name === '宋青书') stats.songAttacks++;
    });
    eventBus.on('afterMiss', 90, (data) => {
        if (data.unit && data.unit.name === '宋青书') stats.songMisses++;
    });
    eventBus.on('roundStart', 90, (data) => {
        const song = (data.B || []).find(u => u.name === '宋青书');
        if (song && song.alive) stats.songRoundsAlive++;
    });

    let state = {
        ally: allyTeam.map(u => u.clone()),
        enemy: enemyTeam.map(u => u.clone()),
        round: 1,
        activeBuffs: [],
        allAllies: allyTeam.map(u => u.clone()),
        _rng: new SeededRNG(seed)
    };
    let finalWinner = null;
    for (let r = 1; r <= 35 && !finalWinner; r++) {
        const stepper = createRoundStepper(state, { ui: false });
        let lastStep = null;
        for (const step of stepper) {
            lastStep = step;
            for (const entry of (step.log || [])) {
                if (!entry || !entry.factType) continue;
                if (entry.factType === 'xingFenGrant') stats.grants++;
                if (entry.factType === 'xingFenExtraAttack') stats.extraAttacks++;
                if (entry.factType === 'xingFenRetry') stats.retries++;
            }
            if (step.winner) { finalWinner = step.winner; break; }
        }
        if (!lastStep) break;
        if (finalWinner) break;
        state.ally = lastStep.ally;
        state.enemy = lastStep.enemy;
        if (state.allAllies) {
            const baseAllies = state.allAllies;
            state.allAllies = baseAllies.map(full => {
                const cur = lastStep.ally.find(a => a.uid === full.uid);
                if (cur) {
                    full.hp = cur.hp; full.maxHp = cur.maxHp; full.alive = cur.alive;
                    full.atk = cur.atk; full.def = cur.def;
                }
                return full;
            });
        }
        state.activeBuffs = (state.activeBuffs || []).filter(b => b && b.remaining > 0).map(b => ({ ...b, remaining: b.remaining - 1 })).filter(b => b.remaining > 0);
        state.round = r + 1;
    }
    console.log(`battle ${b}: winner=${finalWinner || '超回合'} grants=${stats.grants} extra=${stats.extraAttacks} retry=${stats.retries}`);
}

console.log('\n===== 汇总（' + BATTLES + ' 场 stage4）=====');
console.log(`性奋激活(回合): ${stats.grants}`);
console.log(`额外攻击触发: ${stats.extraAttacks}`);
console.log(`未命中重试: ${stats.retries}`);
console.log(`宋青书攻击总次数(afterAttack): ${stats.songAttacks}`);
console.log(`宋青书未命中(afterMiss): ${stats.songMisses}`);
console.log(`宋青书存活回合(roundStart): ${stats.songRoundsAlive}`);
console.log(`未捕获Promise rejection: ${stats.unhandled}`);
