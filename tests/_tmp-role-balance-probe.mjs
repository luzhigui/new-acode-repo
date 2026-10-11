// 职业平衡评测：第六人四职业两两对撞，胜率矩阵（口径抄 tools/116 worker：BASE_TEMPLATE + createUnit m=100）
// 用法：node tests/_tmp-role-balance-probe.mjs [--hex]   --hex = 带海克斯（开局一个+每3回合一个，照抄 worker 口径）
import { fileURLToPath } from 'node:url';
import { SeededRNG } from '../infra/51-core-utils.js';
import { runBattle } from '../core/06battle-runner.js';
import { Unit } from '../core/02unit.js';
import { ROLE_TYPES, CAMP_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';
import { setBattleRng } from '../core/13battle-shared.js';
import { createBuffObject, hasCarryTarget } from '../modules/28buff-tools.js';
import { CONFIG, loadGameData } from '../core/01config-5v5-test.js';
import '../infra/54-global-store.js';
import '../modules/00reg-mechanics.js';

const HEX = process.argv.includes('--hex');
const fs = await import('node:fs');
globalThis.fetch = async (url) => {
    const p = fileURLToPath(new URL(url, 'file://' + process.cwd() + '/'));
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
};
await loadGameData();
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

const BASE_TEMPLATE = { 1: ROLE_TYPES.DEFENDER, 2: ROLE_TYPES.WARRIOR, 5: ROLE_TYPES.FLYER, 7: ROLE_TYPES.RANGED, 9: ROLE_TYPES.RANGED };
const ROLES = [ROLE_TYPES.DEFENDER, ROLE_TYPES.WARRIOR, ROLE_TYPES.FLYER, ROLE_TYPES.RANGED];

function createUnit(role, camp, rng) {
    const campLabel = camp === CAMP_TYPES.ALLY ? '明教' : '六大派';
    const u = new Unit(`${campLabel}·${role}`, 100, role, camp);
    u.init(rng);
    u.applyBonus();
    return u;
}
function buildTeam(extraRole, camp, rng) {
    const team = [];
    for (const [posStr, role] of Object.entries(BASE_TEMPLATE)) {
        const u = createUnit(role, camp, rng);
        u.pos = parseInt(posStr, 10);
        u._originalPos = u.pos;
        team.push(u);
    }
    const extra = createUnit(extraRole, camp, rng);
    extra.pos = 8;
    extra._originalPos = 8;
    team.push(extra);
    return team;
}
// 海克斯抽取（照抄 tools/116 worker 口径）
function pickHexBuff(activeBuffs, allyTeam, rng) {
    const existing = activeBuffs.map(b => b.key);
    const allKeys = Object.keys(CONFIG.BUFFS);
    const available = allKeys.filter(k => {
        if (existing.includes(k)) return false;
        if (k === BUFF_TYPES.FORTIFY && !activeBuffs.some(b => b.remaining > 0)) return false;
        if (k === BUFF_TYPES.CARRY && !hasCarryTarget(allyTeam)) return false;
        const requiredRole = CONFIG.BUFF_ROLE_REQUIREMENTS[k];
        if (requiredRole && !allyTeam.some(u => u.alive && u.role === requiredRole)) return false;
        return true;
    });
    if (available.length === 0) return null;
    const pick = available[rng.nextInt(0, available.length - 1)];
    const duration = CONFIG.BUFFS[pick].duration || CONFIG.BUFF_DURATION || 4;
    return createBuffObject(pick, duration);
}

const RUNS = 250;
const results = {};
for (const a of ROLES) { results[a] = {}; for (const e of ROLES) results[a][e] = { allyWins: 0, enemyWins: 0, draws: 0, sumRounds: 0 }; }

for (const a of ROLES) {
    for (const e of ROLES) {
        for (let i = 0; i < RUNS; i++) {
            const seed = 20260000 + i * 7919 + (a.length * 131 + e.length * 17) * 97;
            const rngA = new SeededRNG(seed);
            const ally = buildTeam(a, CAMP_TYPES.ALLY, rngA);
            const enemy = buildTeam(e, CAMP_TYPES.ENEMY, new SeededRNG(seed + 555));
            setBattleRng(new SeededRNG(seed));
            let initialBuffs = [];
            if (HEX) {
                const rng0 = new SeededRNG(seed);
                const first = pickHexBuff(initialBuffs, ally, rng0);
                if (first) initialBuffs.push(first);
            }
            const res = runBattle({ ally, enemy, seed, initialBuffs, hexPicker: HEX ? pickHexBuff : null, firstSide: CAMP_TYPES.ENEMY });
            const r = results[a][e];
            if (res.winner === '明教') r.allyWins++;
            else if (res.winner === '六大派') r.enemyWins++;
            else r.draws++;
            r.sumRounds += res.rounds || 0;
        }
    }
}

const pad = (s, n) => String(s).padStart(n);
console.log(`===== 第六人职业对撞胜率矩阵 ${HEX ? '【带海克斯】' : '【无海克斯纯职业】'}（每格 ${RUNS} 场，行=明教第六人，列=六大派第六人）=====`);
process.stdout.write(pad('', 8));
for (const e of ROLES) process.stdout.write(pad(e, 12));
console.log('');
for (const a of ROLES) {
    process.stdout.write(pad(a, 8));
    for (const e of ROLES) {
        const r = results[a][e];
        const total = r.allyWins + r.enemyWins + r.draws;
        const wr = total ? (r.allyWins / total * 100) : 0;
        process.stdout.write(pad(wr.toFixed(1) + '%', 12));
    }
    console.log('');
}
console.log(`\n===== 各职业综合（对四对手合计胜率，对角线镜像局剔除）${HEX ? '【带海克斯】' : ''} =====`);
for (const a of ROLES) {
    let w = 0, t = 0;
    for (const e of ROLES) {
        if (e === a) continue;
        const r = results[a][e];
        w += r.allyWins; t += r.allyWins + r.enemyWins + r.draws;
    }
    console.log(`${a}: ${(w / t * 100).toFixed(1)}%  (${t}场)`);
}
console.log('\n===== 平均结束回合（对角线）=====');
for (const a of ROLES) {
    const r = results[a][a];
    console.log(`${a} vs ${a}: 平均 ${(r.sumRounds / RUNS).toFixed(1)} 回合（平局 ${r.draws}）`);
}
