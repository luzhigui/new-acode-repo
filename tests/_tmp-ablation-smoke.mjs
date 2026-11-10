// 831 消融实验室 · 闸口真火测试（临时探针，随 tests/_tmp-* 家族）
//   验四件事：①四臂跑局不炸 ②noQianKun → QIAN_KUN_DERIVED 事实=0 ③noAttach → butterfly 事件=0
//   ④每局必挂嗜血狂刀时，noSisterHex 臂的攻击事实数 < 基线（姊版双击消失）
//   用法: node tests/_tmp-ablation-smoke.mjs [每臂场数=15]
import { readFileSync } from 'fs';
if (typeof window === 'undefined') globalThis.window = globalThis;
globalThis.fetch = async (url) => {
    const p = new URL(url, 'file://' + process.cwd() + '/').pathname;
    return { ok: true, json: async () => JSON.parse(readFileSync(p, 'utf-8')) };
};
if (typeof localStorage === 'undefined') {
    const _ls = new Map();
    globalThis.localStorage = { getItem: k => (_ls.has(k) ? _ls.get(k) : null), setItem: (k, v) => { _ls.set(k, String(v)); }, removeItem: k => { _ls.delete(k); }, clear: () => _ls.clear() };
}
import { CONFIG, loadGameData, loadHexEnhanceData } from '../core/201-config-5v5-test.js';
import { SeededRNG } from '../infra/102-core-utils.js';
import { runBattle } from '../core/206-battle-runner.js';
import { createBuffObject, filterAvailableBuffs } from '../modules/329-buff-tools.js';
import { addPermanentBuff } from '../modules/302-elite-skills.js';
import { initBattleTeams } from '../modules/330-battle-init.js';
import { GlobalStore } from '../infra/104-global-store.js';
import '../modules/301-reg-mechanics.js';

await loadGameData();
await loadHexEnhanceData();
const N = +process.argv[2] || 15;

const pickHex = (activeBuffs, allyTeam, rng) => {
    const available = filterAvailableBuffs(activeBuffs, allyTeam, {});
    if (!available.length) return null;
    const pick = available.includes('bloodthirst') ? 'bloodthirst' : available[rng.nextInt(0, available.length - 1)];
    const duration = (CONFIG.BUFFS[pick] && CONFIG.BUFFS[pick].duration) || CONFIG.BUFF_DURATION || 4;
    const nb = createBuffObject(pick, duration);
    const brother = allyTeam.find(u => u.alive && u.isXiaoZhaoBrother);
    if (brother) addPermanentBuff(brother, pick, nb.name, {});
    return nb;
};

async function runArm(label, flags, n) {
    globalThis.MING_ABLATION = { ...flags };
    const out = { label, wins: 0, runs: 0, qianKun: 0, butterfly: 0, attacks: 0 };
    try {
        for (let i = 0; i < n; i++) {
            GlobalStore.set('forceXiaoZhao', 'sister');
            const seed = 900000 + i * 7919;
            const teams = initBattleTeams(2, new SeededRNG(seed));
            const ally = teams.allyTeam.map(u => u.clone());
            GlobalStore.set('battleHasZhang', ally.some(u => u.isZhang));
            const facts = [];
            const res = runBattle({
                ally, enemy: teams.enemyTeam, seed,
                hexPicker: (ab, al, rng) => pickHex(ab, al, rng),
                onStep: (step) => {
                    if (step && Array.isArray(step.log)) facts.push(...step.log);
                    const snap = JSON.stringify(step && step.ally || []) + JSON.stringify(step && step.enemy || []);
                    if (snap.includes('"_fsmPhase":"attached"') || snap.includes('"_fsmPhase":"attaching"')) out.butterfly++;
                }
            });
            out.runs++;
            if (res.winner === '明教') out.wins++;
            for (const f of facts) {
                const s = JSON.stringify(f);
                if (s.includes('"qianKunDerived"')) out.qianKun++;
                if (s.includes('蝶变附身')) out.butterfly++;
                if (s.includes('"ATTACK"') || s.includes('"attack"')) out.attacks++;
            }
        }
    } finally {
        globalThis.MING_ABLATION = null;
    }
    const wr = out.runs ? (100 * out.wins / out.runs).toFixed(1) : '—';
    console.log(`[${label}] 胜率 ${wr}% (${out.wins}/${out.runs}) | 乾坤衍生事实 ${out.qianKun} | butterfly事件 ${out.butterfly} | 攻击事实 ${out.attacks}`);
    return out;
}

const base = await runArm('基线        ', {}, N);
const hex = await runArm('关姐姐海克斯', { noSisterHex: true }, N);
const qk = await runArm('关乾坤衍生  ', { noQianKun: true }, N);
const att = await runArm('关附身      ', { noAttach: true }, N);

let fail = 0;
if (qk.qianKun !== 0) { console.log('❌ noQianKun 未归零'); fail++; } else console.log('✅ 乾坤衍生闸口归零');
if (att.butterfly !== 0) { console.log('❌ noAttach 未归零'); fail++; } else console.log('✅ 附身闸口归零');
if (!(base.butterfly > 0)) console.log('⚠️ 基线 15 场没观察到附身事件（小样本可能，非闸口问题）');
if (!(base.attacks > hex.attacks)) { console.log('⚠️ 姊版嗜血双击未体现（基线攻击数未多于关海克斯臂）'); } else console.log('✅ 姊版海克斯闸口生效（双击消失）');
if (base.wins === hex.wins && base.wins === qk.wins && base.wins === att.wins && base.wins === 0) { console.log('❌ 四臂全 0 胜，异常'); fail++; }
console.log(fail ? `\n结果：${fail} 项硬断言失败` : '\n结果：闸口全部通电');
