// 临时探针（用完即删，不入库）：① 玄冥联动双向自检（infra/50 key 修复）② 殷天正 值3 / 反击率40% 后的关卡胜率
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

globalThis.self = globalThis;
globalThis.postMessage = () => {};
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
{
    const _ls = new Map();
    globalThis.localStorage = {
        getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
        setItem: (k, v) => { _ls.set(k, String(v)); },
        removeItem: (k) => { _ls.delete(k); },
        clear: () => { _ls.clear(); }
    };
}
globalThis.fetch = async (input) => {
    const p = typeof input === 'string' ? input : (input instanceof URL ? input.href : String(input));
    const href = p.startsWith('file:') ? p : new URL(p, import.meta.url).href;
    const text = fs.readFileSync(fileURLToPath(href), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
};

await import('./tools/116-role-balance-worker.js');

const { CONFIG } = await import('./core/01config-5v5-test.js');
const { SeededRNG, flushBattleEvents } = await import('./infra/51-core-utils.js');
const { runBattle } = await import('./core/06battle-runner.js');
const { createBuffObject, hasCarryTarget } = await import('./modules/28buff-tools.js');
const { initBattleTeams } = await import('./modules/29battle-init.js');
const { BUFF_TYPES, SIGNAL_TYPES, FACT_TYPES } = await import('./infra/56-battle-enums.js');
const { eventBus, EXECUTION_LAYER: L } = await import('./infra/50-event-bus.js');
const { GlobalStore } = await import('./infra/54-global-store.js');

// ── 运行期抓 XUAN_MING_LINK_ATTACK fact（证明两方向都真出手）──
const linkFacts = [];
const order = [];
const origEmit = eventBus.emit.bind(eventBus);
eventBus.emit = (signal, data) => {
    const before = (data && data.log) ? data.log.length : -1;
    const r = origEmit(signal, data);
    if (signal === SIGNAL_TYPES.AFTER_ATTACK && data && data.log && before >= 0) {
        for (let i = before; i < data.log.length; i++) {
            const e = data.log[i];
            if (e && e.factType === FACT_TYPES.XUAN_MING_LINK_ATTACK) linkFacts.push(`${e.data.unitName}→${e.data.partnerName}`);
        }
    }
    return r;
};
let snapshotListeners = [];
const origClearAll = eventBus.clearAll.bind(eventBus);
eventBus.clearAll = () => { origClearAll(); };

function pickHexBuff(activeBuffs, allyTeam, rng, withFortifyRule) {
    const existing = activeBuffs.map(b => b.key);
    const available = Object.keys(CONFIG.BUFFS).filter(k => {
        if (existing.includes(k)) return false;
        if (withFortifyRule && k === BUFF_TYPES.FORTIFY && !activeBuffs.some(b => b.remaining > 0)) return false;
        if (k === BUFF_TYPES.CARRY && !hasCarryTarget(allyTeam)) return false;
        if (k === BUFF_TYPES.UNITY && allyTeam.filter(u => u.alive).length >= 4) return false;
        const requiredRole = CONFIG.BUFF_ROLE_REQUIREMENTS[k];
        if (requiredRole && !allyTeam.some(u => u.alive && u.role === requiredRole)) return false;
        return true;
    });
    if (available.length === 0) return null;
    const pick = available[rng.nextInt(0, available.length - 1)];
    const duration = CONFIG.BUFFS[pick].duration || CONFIG.BUFF_DURATION || 4;
    return createBuffObject(pick, duration);
}

function clearBattleGlobals() {
    eventBus.clearAll();
    for (const k of ['forceZhang', 'forceWei', 'forceXiaoZhao', 'forceXieXun', 'forcePang', 'forceWeakElite', 'currentBattleState']) {
        GlobalStore.set(k, null);
    }
    flushBattleEvents();
}

const SEED = 20261016, N = 150, STAGES = [3, 4, 5, 7];
const PREV = { 3: 68.7, 4: 74.7, 5: 80.0, 7: 60.0 };   // 上轮：值5 / 反击率45% / 仅反击命中
const gateAgg = { battles: 0, growMods: 0, growExpected: 0, mismatch: 0 };
let xuanmingBattles = 0;

for (const stage of STAGES) {
    let wins = 0, games = 0, xuanmingN = 0;
    for (let i = 0; i < N; i++) {
        clearBattleGlobals();
        GlobalStore.set('forceWeakElite', '殷天正');
        const rng = new SeededRNG(SEED + i * 7919);
        const t = initBattleTeams(stage, rng);
        const ally = t.allyTeam.map(u => u.clone());
        if (!ally.length) continue;
        GlobalStore.set('battleHasZhang', ally.some(u => u.isZhang));
        const enemyHasXM = t.enemyTeam.some(u => u.name === '鹿杖客') && t.enemyTeam.some(u => u.name === '鹤笔翁');
        const res = runBattle({ ally, enemy: t.enemyTeam, seed: SEED + i * 7919, hexPicker: pickHexBuff });
        if (!res.winner) continue;
        games++;
        if (res.winner === '明教') wins++;
        if (enemyHasXM) { xuanmingN++; xuanmingBattles++; }

        const all = [...(res.ally || []), ...(res.enemy || [])];
        const yin = all.find(u => u.isYinTianZheng);
        if (!yin) continue;
        const growN = (yin._mods?.atk || []).filter(m => m.group === 'laoDangYiZhuang').length;
        const expect = Math.round((yin.state?._counterProbBonus || 0) / 0.05);
        gateAgg.battles++; gateAgg.growMods += growN; gateAgg.growExpected += expect;
        if (growN !== expect) gateAgg.mismatch++;
    }
    const rate = 100 * wins / games;
    console.log(`stage ${stage}: ${wins}/${games} = ${rate.toFixed(1)}%   (上轮值5/45% ${PREV[stage]}%  Δ${(rate - PREV[stage]).toFixed(1)}pp)  含玄冥二老 ${xuanmingN} 局`);
}

// ── 联动注册自检（_listeners 里 XUANMING_LINK 优先级 + linkAttack: 身份键）──
const ll = eventBus._listeners[SIGNAL_TYPES.AFTER_ATTACK] || [];
const linkL = ll.filter(x => x.priority === L.AFTER_ATTACK.XUANMING_LINK);
console.log(`\n[联动注册] AFTER_ATTACK 上 XUANMING_LINK 钩子数=${linkL.length}（修前=1）keys=${JSON.stringify(linkL.map(x => x.key))}`);

const g = gateAgg;
console.log(`[gate 自检] 局数=${g.battles} 老当益壮mod=${g.growMods} 期望(反击命中数)=${g.growExpected} 不匹配局=${g.mismatch}`);

const d1 = linkFacts.filter(s => s.startsWith('鹿杖客→')).length;
const d2 = linkFacts.filter(s => s.startsWith('鹤笔翁→')).length;
console.log(`[联动实跑] fact 总数=${linkFacts.length}  鹿杖客→鹤笔翁=${d1}  鹤笔翁→鹿杖客=${d2}  (含玄冥局=${xuanmingBattles})`);
console.log(linkL.length === 2 && d1 > 0 && d2 > 0
    ? '[联动自检] ✅ 两条声明都注册、两方向都真出手'
    : '[联动自检] ❌ 仍有缺失');
