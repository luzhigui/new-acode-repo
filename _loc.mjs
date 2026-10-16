// 临时定位探针：逐局打印 i（打印后即跑该局；最后一个打印的 i = 卡死种子）
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
globalThis.self = globalThis;
globalThis.postMessage = () => {};
if (typeof globalThis.window === 'undefined'); globalThis.window = globalThis;
{
    const _ls = new Map();
    globalThis.localStorage = { getItem: (k) => (_ls.has(k) ? _ls.get(k) : null), setItem: (k, v) => { _ls.set(k, String(v)); }, removeItem: (k) => { _ls.delete(k); }, clear: () => { _ls.clear(); } };
}
globalThis.fetch = async (input) => {
    const p = typeof input === 'string' ? input : (input instanceof URL ? input.href : String(input));
    const href = p.startsWith('file:') ? p : new URL(p, import.meta.url).href;
    const text = fs.readFileSync(fileURLToPath(href), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
};
const P = (s) => { try { fs.appendFileSync('./_loc.log', s + '\n'); } catch {} };
try { fs.writeFileSync('./_loc.log', ''); } catch {}

await import('./tools/116-role-balance-worker.js');
const { CONFIG } = await import('./core/01config-5v5-test.js');
const { SeededRNG, flushBattleEvents } = await import('./infra/51-core-utils.js');
const { runBattle } = await import('./core/06battle-runner.js');
const { createBuffObject, hasCarryTarget } = await import('./modules/28buff-tools.js');
const { initBattleTeams } = await import('./modules/29battle-init.js');
const { BUFF_TYPES } = await import('./infra/56-battle-enums.js');
const { GlobalStore } = await import('./infra/54-global-store.js');
const { eventBus } = await import('./infra/50-event-bus.js');

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

const stage = Number(process.argv[2] || 3);
const only = process.argv[3] !== undefined ? Number(process.argv[3]) : null;
const N = 150, SEED = 20261016;
for (let i = 0; i < N; i++) {
    if (only !== null && i !== only) continue;
    P(`[i=${i}] seed=${SEED + i * 7919}`);
    eventBus.clearAll();
    for (const k of ['forceZhang', 'forceWei', 'forceXiaoZhao', 'forceXieXun', 'forcePang', 'forceWeakElite', 'currentBattleState']) GlobalStore.set(k, null);
    flushBattleEvents();
    GlobalStore.set('forceWeakElite', '殷天正');
    const rng = new SeededRNG(SEED + i * 7919);
    const t = initBattleTeams(stage, rng);
    const ally = t.allyTeam.map(u => u.clone());
    GlobalStore.set('battleHasZhang', ally.some(u => u.isZhang));
    const res = runBattle({ ally, enemy: t.enemyTeam, seed: SEED + i * 7919, hexPicker: pickHexBuff });
    P(`[i=${i}] done winner=${res.winner} rounds=${res.rounds}`);
}
P('[done]');
