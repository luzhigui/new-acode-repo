// tests/fuzz-invariants.mjs | ~10800 bytes | V1.0.0 | 2026-10-09
// 大样本通用不变量模糊测试（一键全量体检第 8 项）。
// 为什么要有它：rules-replay 的不变量套件有牙，但固定只跑 20 seed×7 关=140 场，
//   小概率时序（如灭绝延迟召唤周芷若落位格被当回合新生拒马占走→两个活人同格）走不到就漏。
//   本探针不针对任何具体机制，默认扫 300 seed×7 关=2100 场，专撞引擎级事故：
//   stepper 崩溃 / NaN·Infinity 污染 / 负或爆属性 / hp 越界 / 空血活死人 / 同格 / 同 uid /
//   fact 数值非有限 / 伤害字段为负 / winner 与存活矛盾 / 打满 MAX_ROUND 无胜负。
// 用法：node tests/fuzz-invariants.mjs                 （默认 seed 1..300）
//      node tests/fuzz-invariants.mjs 1 60             （自定义区间，约 5s）
//      STAGES=7 node tests/fuzz-invariants.mjs 1 300   （只跑灭绝关）
// 口径：硬伤（高可信）去重后逐条列、退出码 1；可疑项只计数+样本，需人工定性，不单独判红。
import { fileURLToPath } from 'node:url';

export const VER = 'tests/fuzz-invariants.mjs V1.0.0';

// --- 环境垫片：引擎零 DOM，但 import 链上会碰浏览器 API ---
globalThis.fetch = async (url) => {
    const fs = await import('node:fs');
    const p = fileURLToPath(new URL(url));
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.self = globalThis;

const [{ CONFIG, loadGameData }, { SeededRNG }, { createRoundStepper }, { initBattleTeams },
    { createStore, battleReducer }, { createInitialState }, { GlobalStore },
    { STORE_ACTION_TYPES, CAMP_TYPES, BUFF_TYPES }, { getStat }, { hasCarryTarget }] = await Promise.all([
    import('../core/01config-5v5-test.js'),
    import('../infra/51-core-utils.js'),
    import('../core/11battle-round.js'),
    import('../modules/29battle-init.js'),
    import('../modules/24battle-store.js'),
    import('../core/17-state-keys.js'),
    import('../infra/54-global-store.js'),
    import('../infra/56-battle-enums.js'),
    import('../core/13battle-shared.js'),
    import('../modules/28buff-tools.js')
]);
await import('../modules/25elite-imperial.js');
await import('../modules/26elite-sixsects.js');
await import('../modules/27elite-mingjiao.js');
await import('../modules/30custom-effects.js');
await loadGameData();

const MAX_ROUND = CONFIG.MAX_ROUND || 35;
const argv = process.argv.slice(2);
const seedFrom = Number(argv[0] || process.env.SEED_FROM || 1);
const seedTo = Number(argv[1] || process.env.SEED_TO || 300);
const STAGES = process.env.STAGES ? process.env.STAGES.split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7];

// 确定性团队 Buff 注入（与 rules-replay 同口径，seed/round 轮转、不消耗战斗 RNG）
function tickAndPickBuffs(activeBuffs, ally, enemy, round, seed, pickNew) {
    let next = (activeBuffs || []).map(b => ({ ...b, remaining: b.remaining - 1 })).filter(b => b.remaining > 0);
    if (!pickNew) return next;
    const turn = Math.floor(round / 3);
    const sides = [{ camp: CAMP_TYPES.ALLY, team: ally, off: 0 }, { camp: CAMP_TYPES.ENEMY, team: enemy, off: 1 }];
    for (const s of sides) {
        const existing = next.filter(b => (b.target || CAMP_TYPES.ALLY) === s.camp).map(b => b.key);
        const alive = (s.team || []).filter(u => u && u.alive);
        const avail = Object.keys(CONFIG.BUFFS).sort().filter(k => {
            if (existing.includes(k)) return false;
            if (k === BUFF_TYPES.CARRY && !hasCarryTarget(s.team)) return false;
            const req = CONFIG.BUFF_ROLE_REQUIREMENTS ? CONFIG.BUFF_ROLE_REQUIREMENTS[k] : null;
            if (req && !alive.some(u => u.role === req)) return false;
            return true;
        });
        if (!avail.length) continue;
        const pick = avail[(seed + turn + s.off) % avail.length];
        const def = CONFIG.BUFFS[pick] || {};
        next.push({ key: pick, target: s.camp, remaining: def.duration || CONFIG.BUFF_DURATION || 4, name: def.name || pick });
    }
    return next;
}

const hard = new Set();       // 硬伤（高可信真问题）
const suspect = new Map();    // 可疑（计数 + 样本，需人工定性）
const timeouts = [];
function addHard(m) { if (!hard.has(m)) hard.add(m); }
function addSuspect(k, sample) { const e = suspect.get(k) || { n: 0, sample }; e.n++; suspect.set(k, e); }

function walkFacts(arr, cb, depth) {
    for (const f of arr || []) {
        if (!f || typeof f !== 'object') continue;
        cb(f);
        if (depth < 6) {
            walkFacts(f.data && f.data.entries, cb, depth + 1);
            walkFacts(f.entries, cb, depth + 1);
        }
    }
}
const NUMKEY = /dmg|damage|heal|amount|delta|value|cost|hpAfter/i;
const DMGKEY = /dmg|damage/i;
function checkFacts(stepLog, tag) {
    walkFacts(stepLog, (f) => {
        const d = f.data;
        if (!d || typeof d !== 'object') return;
        for (const [k, v] of Object.entries(d)) {
            if (typeof v !== 'number') continue;
            if (NUMKEY.test(k) && !Number.isFinite(v)) addHard(tag + 'fact ' + f.factType + '.' + k + '=' + v + '（NaN/Infinity）');
            if (DMGKEY.test(k) && !/heal/i.test(k) && Number.isFinite(v) && v < 0)
                addSuspect('伤害字段为负 ' + f.factType + '.' + k + '=' + v, tag);
        }
    }, 0);
}

function checkUnits(units, seed, stage, round) {
    const tag = `[s=${seed} 关${stage} r${round}] `;
    const seenPos = new Map(), seenUid = new Map();
    for (const u of units) {
        if (!u) continue;
        const nm = u.name || u.uid;
        for (const st of ['atk', 'def']) {
            let v; try { v = getStat(u, st); } catch (e) { addHard(tag + nm + ' getStat(' + st + ') 抛错: ' + e.message); continue; }
            if (!Number.isFinite(v)) addHard(tag + nm + ' ' + st + ' 非有限值=' + v);
            else if (v < 0) addSuspect(st + '为负(' + v + ') ' + nm, tag);
        }
        if (!Number.isFinite(u.hp)) addHard(tag + nm + ' hp 非有限=' + u.hp);
        if (!Number.isFinite(u.maxHp) || u.maxHp <= 0) addHard(tag + nm + ' maxHp 异常=' + u.maxHp);
        if (Number.isFinite(u.hp) && u.hp < -0.5) addHard(tag + nm + ' hp<0=' + u.hp);
        if (Number.isFinite(u.hp) && Number.isFinite(u.maxHp) && u.hp > u.maxHp + 1)
            addHard(tag + nm + ' hp(' + u.hp + ') > maxHp(' + u.maxHp + ')');
        const pend = !!(u.state && u.state._pendingDeath), bf = !!(u.state && u.state._butterflyHost);
        if (u.alive === true && !(u.hp > 0) && !pend && !bf) addHard(tag + nm + ' 空血却存活且无待死标记 hp=' + u.hp);
        if (u.alive === false && u.hp > 0) addHard(tag + nm + ' 已阵亡却 hp>0=' + u.hp);
        if (u.pos != null && u.alive !== false) {
            const pk = (u.camp || '?') + '#p' + u.pos;
            if (seenPos.has(pk)) addHard(tag + nm + ' 与 ' + seenPos.get(pk) + ' 同占格 ' + u.pos);
            else seenPos.set(pk, nm);
            const uk = (u.camp || '?') + '#u' + u.uid;
            if (seenUid.has(uk)) addHard(tag + nm + ' 与 ' + seenUid.get(uk) + ' uid 重复 ' + u.uid);
            else seenUid.set(uk, nm);
        }
    }
}

function runCase(seed, stage) {
    const rng = new SeededRNG(seed);
    const store = createStore({ ...createInitialState(), units: [] }, battleReducer);
    GlobalStore.set('battleStore', store);
    const { allyTeam, enemyTeam } = initBattleTeams(stage, rng);
    let bs = {
        ally: allyTeam.map(u => u.clone()), enemy: enemyTeam.map(u => u.clone()),
        round: 1, activeBuffs: tickAndPickBuffs([], allyTeam, enemyTeam, 1, seed, true),
        allAllies: allyTeam.map(u => u.clone()), _rng: rng
    };
    let winner = null, last = null, crashed = false;
    while (bs.round <= MAX_ROUND && !winner) {
        try { store.dispatch({ type: STORE_ACTION_TYPES.SET_UNITS, units: [...bs.ally, ...bs.enemy].map(u => ({ ...u })) }); } catch (e) {}
        try {
            for (const step of createRoundStepper(bs)) {
                last = step;
                checkFacts(step.log, `[s=${seed} 关${stage} r${bs.round}] `);
                checkUnits([...(step.ally || []), ...(step.enemy || [])], seed, stage, bs.round);
                if (step.winner) winner = step.winner;
            }
        } catch (e) {
            crashed = true;
            addHard(`[s=${seed} 关${stage} r${bs.round}] stepper 崩溃: ` + String(e && e.message || e).split('\n')[0]);
            break;
        }
        if (winner || !last) break;
        bs = {
            ally: last.ally.map(u => u.clone()), enemy: last.enemy.map(u => u.clone()),
            round: bs.round + 1,
            activeBuffs: tickAndPickBuffs(bs.activeBuffs, last.ally, last.enemy, bs.round, seed, bs.round % 3 === 0),
            allAllies: bs.allAllies, _rng: rng
        };
    }
    const fin = last ? [...last.ally, ...last.enemy] : [...bs.ally, ...bs.enemy];
    const aAlive = fin.filter(u => u && u.camp === CAMP_TYPES.ALLY && u.alive !== false).length;
    const eAlive = fin.filter(u => u && u.camp === CAMP_TYPES.ENEMY && u.alive !== false).length;
    if (winner) {
        const w = String(winner);
        const winnerAlly = /ally|ALL|明/i.test(w) && !/enem|ENEM|六/i.test(w);
        if (winnerAlly && aAlive === 0 && eAlive > 0) addHard(`[s=${seed} 关${stage}] winner=${w} 但明教全灭、对方存活${eAlive}`);
        if (!winnerAlly && eAlive === 0 && aAlive > 0) addHard(`[s=${seed} 关${stage}] winner=${w} 但对方全灭、明教存活${aAlive}`);
    } else if (!crashed) {
        timeouts.push(`s=${seed} 关${stage} 打满${MAX_ROUND}回合无胜负（明教活${aAlive}/对方活${eAlive}）`);
    }
}

let cases = 0;
for (let s = seedFrom; s <= seedTo; s++) for (const st of STAGES) { runCase(s, st); cases++; }

console.log('============ fuzz 不变量：' + cases + ' 场（seed ' + seedFrom + '..' + seedTo + ' × 关 ' + STAGES.join(',') + '） ============');
console.log('硬伤种类数 = ' + hard.size);
[...hard].slice(0, 50).forEach(m => console.log('  X ' + m));
if (suspect.size) {
    console.log('可疑项（计数，需人工定性）:');
    [...suspect.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12)
        .forEach(([k, v]) => console.log('  ~ ' + k + ' x' + v.n + '  例: ' + v.sample));
}
if (timeouts.length) {
    console.log('打满无胜负 = ' + timeouts.length + ' 场');
    timeouts.slice(0, 12).forEach(t => console.log('  T ' + t));
}
console.log(hard.size ? 'RESULT: 发现硬伤 ' + hard.size + ' 类' : 'RESULT: 无硬伤（崩溃/NaN/同格/越界/胜负矛盾 均 0）');
process.exit(hard.size ? 1 : 0);
