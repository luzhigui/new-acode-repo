// tools/839-reflect-eval.mjs — 弱精英（M104/M100/M97 档位全部带技能具名单位）强度测评 CLI 版
// 用法：node tools/839-reflect-eval.mjs [--games=200] [--m=104,100,97] [--reflect] [名字过滤...]
//   默认评 M 档内全部具名单位（2026-11-11 老板纠偏：原名「反伤类」以偏概全）；--reflect 缩到反伤/反弹/同归于尽那一类。
//   每单位跑 N 场：候选替换己方 1 号位，对照基线（无候选的原班阵容）算胜率增量；
//   反伤伤害读引擎权威账本 unit.reboundDone，次数按 rebound fact 归因。
// 浏览器常驻版：工具箱「🛡️ 弱精英测评」卡片（839-reflect-eval.html，同口径）。
// 纯只读：不改任何配置，不写文件，结果打 stdout（TSV 友好，可直接贴表）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// —— headless 环境垫片（与 tests/smoke-headless.mjs 同款）——
globalThis.window = globalThis;
globalThis.localStorage = { _d: new Map(), getItem(k) { return this._d.has(k) ? this._d.get(k) : null; }, setItem(k, v) { this._d.set(k, String(v)); }, removeItem(k) { this._d.delete(k); } };
globalThis.fetch = async (url) => {
    let p = typeof url === 'string' ? url : (url.pathname || String(url));
    p = decodeURIComponent(p);
    const m = p.replace(/\\/g, '/').match(/(?:^|\/)(content\/.+)$/);
    p = m ? path.join(ROOT, m[1]) : path.join(ROOT, p.replace(/^\/+/, ''));
    const text = readFileSync(p, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
};

const argv = Object.fromEntries(process.argv.slice(2).map(a => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const GAMES = Number(argv.games || 200);
const M_TIERS = String(argv.m || '104,100,97').split(',').map(Number);
const nameFilters = process.argv.slice(2).filter(a => !a.startsWith('--'));

const mods = {};
const toLoad = {
    enums: '../infra/106-battle-enums.js',
    utils: '../infra/102-core-utils.js',
    clock: '../infra/103-clock.js',
    cfg: '../core/201-config-5v5-test.js',
    unit: '../core/202-unit.js',
    round: '../core/210-battle-round.js',
    stateKeys: '../core/218-state-keys.js',
    store: '../modules/306-battle-store.js',
    elites: '../modules/302-elite-skills.js',
    mechanics: '../tests/_lib/install-mechanics.mjs'
};
for (const [k, rel] of Object.entries(toLoad)) mods[k] = await import(rel);
await mods.cfg.loadHexEnhanceData();
const game = await mods.cfg.loadGameData();
const { Unit, SeededRNG, CAMP_TYPES } = { Unit: mods.unit.Unit, SeededRNG: mods.utils.SeededRNG, CAMP_TYPES: mods.enums.CAMP_TYPES };

function roleOf(name, rng) {
    const ch = game.characters[name];
    const tags = (ch && ch.tags) || [];
    const hit = tags.find(t => mods.cfg.CONFIG.ROLES.includes(t));
    return hit || mods.cfg.CONFIG.ROLES[rng.nextInt(0, mods.cfg.CONFIG.ROLES.length - 1)];
}
function makeTeam(names, camp, rng, mTable) {
    return names.map((name, i) => {
        const u = new Unit(name, (mTable && mTable[name]) || 100, roleOf(name, rng), camp);
        u.init(rng);
        u.applyBonus();
        u.pos = i + 1;
        return u;
    });
}

// —— 候选：M 档内全部具名单位（都带技能；2026-11-11 老板纠偏，原名「反伤类」以偏概全）——
//   --reflect 缩到反伤/反弹/同归于尽那一类；名字过滤参数照常可用。
const REFLECT_RE = /damageReflect|reflectRatio|reboundPct|同归于尽|反噬|反弹|反伤/;
const cands = [];
for (const [n, c] of Object.entries(game.characters)) {
    if (!M_TIERS.includes(c.m) || c.named !== true) continue;
    const s = JSON.stringify(c);
    const kw = [...new Set(s.match(/damageReflect|reflectRatio|reboundPct|同归于尽|反噬/g) || [])].join('/');
    const isReflect = !!kw || REFLECT_RE.test(s);
    if (argv.reflect && !isReflect) continue;
    cands.push({ name: n, camp: c.camp, m: c.m, kw: isReflect ? (kw || '反弹/反伤文案') : '—' });
}
const filtered = nameFilters.length ? cands.filter(c => nameFilters.some(f => c.name.includes(f))) : cands;
if (!filtered.length) { console.log('没有匹配候选（检查名字过滤/--m 档位）'); process.exit(0); }

// —— 固定基线阵容（与冒烟同源）——
const mingBase = mods.cfg.CONFIG.MING_ALL.filter(n => mods.cfg.CONFIG.MING_M[n]).slice(0, 5);
const enemyBase = Object.keys(mods.cfg.CONFIG.ENEMY_M).slice(-9, -4);

// 反伤计数：*rebound fact（factType 以 rebound 结尾，attackerUid=反弹者）；同归于尽反噬走 skillAnnounce。
//   反伤伤害总额不走 fact 累加——引擎在 217 REBOUND handler 里给反弹者记账 unit.reboundDone，终局直接读，全路径覆盖。
function scanFacts(logs, uid, name) {
    let reflectCount = 0, deathblast = 0;
    // fact 两种形态：平铺（skillAnnounce 等）+ 分组下挂 data.entries（攻击组里的 rebound 声明，core/09 L519）
    const visit = (f) => {
        const d = f && f.data;
        if (!d) return;
        const ft = f.factType || '';
        if (/rebound$/i.test(ft) && (d.sourceName === name || d.attackerUid === uid)) reflectCount++;
        else if (ft === 'skillAnnounce' && d.unitUid === uid && /同归于尽|反噬/.test(String(d.note || '') + String(d.skillName || ''))) deathblast++;
        if (Array.isArray(d.entries)) d.entries.forEach(visit);
    };
    for (const f of logs || []) visit(f);
    return { reflectCount, deathblast };
}

function runBattleWithScan(allyNames, enemyNames, seed, side, candName) {
    const rng = new SeededRNG(seed);
    const ally = makeTeam(allyNames, CAMP_TYPES.ALLY, rng, mods.cfg.CONFIG.MING_M);
    const enemy = makeTeam(enemyNames, CAMP_TYPES.ENEMY, rng, mods.cfg.CONFIG.ENEMY_M);
    const uid = (side === 'ally' ? ally : enemy).find(u => u.name === candName)?.uid ?? null;
    const state = { ally, enemy, round: 1, activeBuffs: [], allAllies: ally.map(u => u.clone()), _rng: rng };
    let winner = null, candAlive = false, last = null;
    const agg = { reflectDmg: 0, reflectCount: 0, deathblast: 0 };
    for (let r = 0; r < 40; r++) {
        const stepper = mods.round.createRoundStepper(state, { ui: false });
        let won = false;
        for (const step of stepper) {
            if (uid != null) {
                const sc = scanFacts(step.log, uid, candName);
                agg.reflectCount += sc.reflectCount; agg.deathblast += sc.deathblast;
            }
            last = step;
            if (step.winner) { won = true; winner = step.winner; break; }
        }
        if (!last) break;
        state.ally = last.ally; state.enemy = last.enemy; state.round++;
        if (won) break;
    }
    if (uid != null && last) {
        const u = (side === 'ally' ? last.ally : last.enemy).find(x => x.uid === uid);
        candAlive = !!(u && u.alive);
        agg.reflectDmg = Number((u && u.reboundDone) || 0);
    }
    return { winner, candAlive, agg };
}

// —— 主循环：每候选 N 场 + 基线 N 场（基线按阵营缓存，不带候选）——
const baselineCache = {};
function runBaseline(side) {
    if (!baselineCache[side]) {
        let wins = 0;
        for (let s = 0; s < GAMES; s++) {
            const { winner } = runBattleWithScan(mingBase, enemyBase, 100000 + s * 31, side, null);
            if (winner === (side === 'ally' ? '明教' : '六大派')) wins++;
        }
        baselineCache[side] = { wins };
    }
    return baselineCache[side];
}

const rows = [];
for (const c of filtered) {
    const side = c.camp === '明教' ? 'ally' : 'enemy';
    const allyNames = side === 'ally' ? [c.name, ...mingBase.slice(1)] : mingBase;
    const enemyNames = side === 'enemy' ? [c.name, ...enemyBase.slice(1)] : enemyBase;
    let wins = 0, alive = 0, reflectDmg = 0, reflectCount = 0, deathblast = 0;
    for (let s = 0; s < GAMES; s++) {
        const { winner, candAlive, agg } = runBattleWithScan(allyNames, enemyNames, 100000 + s * 31, side, c.name);
        if (winner === (side === 'ally' ? '明教' : '六大派')) wins++;
        if (candAlive) alive++;
        reflectDmg += agg.reflectDmg; reflectCount += agg.reflectCount; deathblast += agg.deathblast;
    }
    const base = runBaseline(side);
    rows.push({ c, side, wins, alive, reflectDmg, reflectCount, deathblast, baseWin: base.wins });
}

// —— 输出 ——
console.log(`弱精英测评 | 档位 M${M_TIERS.join('/M')} | 每单位 ${GAMES} 场 | 基线：明教/六大派原班各 ${GAMES} 场`);
console.log('单位\t阵营\tM\t反伤机制\t胜率\t基线胜率\tΔ胜率\t反伤伤/场\t反伤次/场\t同尽/场\t存活率');
rows.sort((a, b) => (b.wins / GAMES - b.baseWin / GAMES) - (a.wins / GAMES - a.baseWin / GAMES));
for (const r of rows) {
    const winPct = (r.wins / GAMES * 100).toFixed(1);
    const basePct = (r.baseWin / GAMES * 100).toFixed(1);
    const delta = ((r.wins - r.baseWin) / GAMES * 100).toFixed(1);
    console.log([r.c.name, r.c.camp, r.c.m, r.c.kw, winPct + '%', basePct + '%', (delta >= 0 ? '+' : '') + delta + '%',
        (r.reflectDmg / GAMES).toFixed(1), (r.reflectCount / GAMES).toFixed(2), (r.deathblast / GAMES).toFixed(2),
        (r.alive / GAMES * 100).toFixed(1) + '%'].join('\t'));
}
