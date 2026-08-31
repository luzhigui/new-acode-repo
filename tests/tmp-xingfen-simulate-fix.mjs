// 模拟"正确顺序授权"：beforeAttack 时给宋青书补 _xingFenActive（不动引擎代码）
// 验证机制链条（async壳→submitXingFenExtra→processUnitAttack递归）本身是否通
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
import { readFileSync } from 'node:fs';
globalThis.fetch = async (input) => {
    const u = String(input).replace(/^file:\/\//, '');
    const body = readFileSync(u);
    return { ok: true, json: async () => JSON.parse(body.toString('utf8')) };
};

const { loadGameData } = await import('../core/01config-5v5-test.js');
const { SeededRNG, flushBattleEvents } = await import('../infra/51-core-utils.js');
const { GlobalStore } = await import('../infra/54-global-store.js');
const { setEliteState, clearAllEliteStates } = await import('../core/18-elite-state.js');
const { createRoundStepper } = await import('../core/11battle-round.js');
const { initBattleTeams } = await import('../modules/29battle-init.js');
const { eventBus } = await import('../infra/50-event-bus.js');
await import('../modules/25elite-imperial.js');
await import('../modules/26elite-sixsects.js');
await import('../modules/27elite-mingjiao.js');
await loadGameData();

let curRound = 1;
const origEmit = eventBus.emit.bind(eventBus);
eventBus.emit = (signal, data) => {
    // 模拟正确顺序：每回合宋青书第一次攻击前授权一次（等效"先重置后授权"）
    if (signal === 'beforeAttack' && data?.unit?.name === '宋青书' && data?.unit?.alive) {
        setEliteState(data.unit.uid, { _xingFenActive: true });
    }
    return origEmit(signal, data);
};

const stats = { extra: 0, retry: 0, attacks: 0, missFacts: 0, unhandled: 0 };
process.on('unhandledRejection', (r) => { stats.unhandled++; });
const BATTLES = 30;
for (let b = 0; b < BATTLES; b++) {
    eventBus.clearAll();
    GlobalStore.set('forceZhang', null);
    GlobalStore.set('forceWei', null);
    GlobalStore.set('forceXiaoZhao', null);
    GlobalStore.set('currentBattleState', null);
    flushBattleEvents();
    clearAllEliteStates();
    const seed = 20260831 + b * 7919;
    const initRng = new SeededRNG(seed);
    const { allyTeam, enemyTeam } = initBattleTeams(4, initRng);
    if (!enemyTeam.some(u => u.name === '宋青书') || !enemyTeam.some(u => u.name === '周芷若')) continue;
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
        state.round = r;
        const stepper = createRoundStepper(state, { ui: false });
        let lastStep = null;
        for (const step of stepper) {
            lastStep = step;
            for (const e of (step.log || [])) {
                if (e.factType === 'xingFenExtraAttack') stats.extra++;
                if (e.factType === "xingFenRetry") stats.retry++;
                if (e.factType === "miss" && e.data?.attacker?.name === "宋青书") stats.missFacts = (stats.missFacts||0)+1;
                if (e.factType === 'attack' && e.data?.attacker?.name === '宋青书') stats.attacks++;
            }
            if (step.winner) { finalWinner = step.winner; break; }
        }
        if (finalWinner) break;
        state.ally = lastStep.ally;
        state.enemy = lastStep.enemy;
        state.activeBuffs = (state.activeBuffs || []).filter(x => x && x.remaining > 0).map(x => ({ ...x, remaining: x.remaining - 1 })).filter(x => x.remaining > 0);
    }
}
console.log(`===== 模拟正确授权顺序后（${BATTLES} 场 stage4，同种子）=====`);
console.log(`宋青书普攻次数: ${stats.attacks}`);
console.log(`额外攻击触发: ${stats.extra}`);
console.log(`未命中重试: ${stats.retry}`);
console.log(`宋青书miss事实: ${stats.missFacts}`);
console.log(`未捕获Promise rejection: ${stats.unhandled}`);
