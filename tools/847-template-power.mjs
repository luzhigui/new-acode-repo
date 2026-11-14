// tools/847-template-power.mjs —— 模板战力评测（node 端 CLI，不进网页）
// 口径：A 池 = 靶子阵容（弱/中/强，明教与六大派各一套），B 池 = 被测骨架（4 套形状）。
//   被测单位替换 B 队同职业位（无同职业则同排降级），然后逐套攻打 A 池，统计「被测方胜率」。
//   每对固定场次、固定种子序列；双海克斯（双方各随机一张，各自独立抽取）。
// 用法：node tools/847-template-power.mjs [--runs=30] [--cand=杨逍,张中] [--a=3] [--b=2] [--out=路径.csv]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// node 的 fetch 不支持 file://，这里补一层（core/201 用 new URL(..., import.meta.url) 取 content/*.json）
const _fetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
    const u = typeof input === 'string' ? input : (input && (input.href || input.url)) || '';
    if (u.startsWith('file:')) {
        const txt = fs.readFileSync(fileURLToPath(u), 'utf8');
        return new Response(txt, { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return _fetch(input, init);
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { loadGameData, loadHexEnhanceData, getGameData, CONFIG } = await import('../core/201-config-5v5-test.js');
const { Unit, applyHeroFlags } = await import('../core/202-unit.js');
const { runBattle } = await import('../core/206-battle-runner.js');
const { SeededRNG } = await import('../infra/102-core-utils.js');
const { createBuffObject, filterAvailableBuffs, buffsOfCamp } = await import('../modules/329-buff-tools.js');
const { CAMP_TYPES } = await import('../infra/106-battle-enums.js');
// 机制/技能注册（与 816 worker 同口径）：不 import 会在装技能时报「未知顶层机制」
await import('../infra/104-global-store.js');
await import('../modules/301-reg-mechanics.js');

const argv = Object.fromEntries(process.argv.slice(2).map(s => {
    const m = s.match(/^--([^=]+)=?(.*)$/);
    return m ? [m[1], m[2] || true] : [s, true];
}));
const RUNS = parseInt(argv.runs, 10) || 30;
const TPL = JSON.parse(fs.readFileSync(path.join(HERE, '847-templates.json'), 'utf8'));
const rawCands = argv.cand ? String(argv.cand).split(',').map(s => s.trim()).filter(Boolean) : TPL.candidates;
const MAX_A = parseInt(argv.a, 10) || 99;
const MAX_B = parseInt(argv.b, 10) || 99;

await loadGameData();
await loadHexEnhanceData();
const chars = getGameData().characters;

// 职业值只有 战士 / 防战 / 远程 / 飞行（无「坦克/刺客」这类别名）
const isFront = role => role === '防战' || role === '战士';

function makeUnit(spec, camp, rng) {
    const ch = chars[spec.name];
    if (!ch) throw new Error('未知角色：' + spec.name);
    const u = new Unit(spec.name, ch.m, spec.role, camp);
    applyHeroFlags(u);
    u.init(rng);
    u.applyBonus();
    u.pos = spec.pos;
    return u;
}

// B 骨架 + 被测单位替换：指定 pos（辅助固定后排）→ 同职业 → 同排 → 末位
function buildB(tpl, candSpec, rng) {
    const units = tpl.units.map(s => ({ ...s }));
    let slot = null, replacedRole = null;
    if (candSpec) {
        const cand = { name: candSpec.name, role: candSpec.role, pos: null };
        let idx = candSpec.pos ? units.findIndex(u => u.pos === candSpec.pos) : -1;
        if (idx < 0) idx = units.findIndex(u => u.role === candSpec.role);
        if (idx < 0) idx = units.findIndex(u => isFront(u.role) === isFront(candSpec.role));
        if (idx < 0) idx = units.length - 1;
        cand.pos = units[idx].pos;
        replacedRole = units[idx].role;
        units[idx] = cand;
        slot = cand.pos;
    }
    return { units: units.map(s => makeUnit(s, CAMP_TYPES.ALLY, rng)), slot, replacedRole };
}

function buildA(tpl, rng) {
    return tpl.units.map(s => makeUnit(s, CAMP_TYPES.ENEMY, rng));
}

// 双海克斯：明教（ally）与六大派（enemy）各自独立随机
function makeHexPickers() {
    const allyPicker = (activeBuffs, allySide, rng) => {
        const alive = (allySide || []).filter(u => u && u.alive);
        const enemyAlive = (allySide && allySide.__enemy) || [];
        const available = filterAvailableBuffs(activeBuffs, alive, { enemyTeam: enemyAlive });
        if (!available.length) return null;
        const key = available[rng.nextInt(0, available.length - 1)];
        return createBuffObject(key, CONFIG.BUFFS[key]?.duration || CONFIG.BUFF_DURATION || 4);
    };
    const enemyPicker = (activeBuffs, enemySide, allySide, rng) => {
        const alive = (enemySide || []).filter(u => u && u.alive);
        const allyAlive = (allySide || []).filter(u => u && u.alive);
        const available = filterAvailableBuffs(buffsOfCamp(activeBuffs, CAMP_TYPES.ENEMY), alive,
            { withFortifyRule: true, enemyTeam: allyAlive });
        if (!available.length) return null;
        const key = available[rng.nextInt(0, available.length - 1)];
        return createBuffObject(key, null, CAMP_TYPES.ENEMY, alive);
    };
    return { allyPicker, enemyPicker };
}

function roleOf(name) {
    const ch = chars[name];
    if (!ch) return null;
    if (ch.role) return ch.role;
    for (const r of ['防战', '战士', '远程', '飞行', '标枪']) {
        if ((ch.tags || []).includes(r)) return r;
    }
    return null;
}
// 候选可写成 "名字" 或 { name, role, kind, pos }：数据里没职业的显式指定；kind= support 走辅助模板并固定 pos
function candSpec(c) {
    // 命令行 --cand=名字 时，回查 json 里的完整定义（kind/pos/role 不丢）
    const o = typeof c === 'string'
        ? (TPL.candidates.find(x => (typeof x === 'string' ? x : x.name) === c) || { name: c })
        : c;
    return { name: o.name, role: o.role || roleOf(o.name), kind: o.kind || 'dps', pos: o.pos || null };
}

const aPool = TPL.a.slice(0, MAX_A);
const bPool = TPL.b.slice(0, MAX_B);
const rows = [];
const baseline = [];
const t0 = Date.now();
let done = 0;
const totalPlanned = rawCands.length * bPool.length * 3 * RUNS;

// ===== 基线：不替换任何单位，纯 B 骨架打 A（判断靶子档位是否还有区分度）=====
for (const b of bPool) {
    for (const a of aPool.filter(x => x.camp !== b.camp)) {
        let wins = 0;
        for (let i = 0; i < RUNS; i++) {
            const seed = 2000003 + i * 7919 + a.id.length * 131 + b.id.length * 17;
            const rng = new SeededRNG(seed);
            const bb = buildB(b, null, rng);
            const aa = buildA(a, rng);
            const { allyPicker, enemyPicker } = makeHexPickers();
            aa.__enemy = aa;
            const res = runBattle({
                ally: bb.units, enemy: aa, seed,
                hexPicker: allyPicker,
                enemyHexPicker: enemyPicker,
                maxRounds: CONFIG.MAX_ROUND
            });
            if (res && res.winner === '明教') wins++;
        }
        baseline.push({ bCamp: b.camp, bId: b.id, aId: a.id, pct: wins / RUNS * 100 });
    }
}

for (const raw of rawCands) {
    const cs = candSpec(raw);
    const role = cs.role;
    const candName = cs.name;
    if (!role) { console.log(`跳过 ${candName}：数据里没有职业，请在 847-templates.json 的 candidates 里补 role`); continue; }
    const myCamp = chars[candName].camp;
    const bList = bPool.filter(b => b.camp === myCamp && (!b.kinds || b.kinds.includes(cs.kind)));
    const aList = aPool.filter(a => a.camp !== myCamp);
    if (!bList.length || !aList.length) { console.log(`跳过 ${candName}：没有匹配的模板`); continue; }

    const byA = {};
    for (const b of bList) {
        for (const a of aList) {
            let wins = 0;
            for (let i = 0; i < RUNS; i++) {
                const seed = 1000003 + (i * 7919) + a.id.length * 131 + b.id.length * 17;
                const rng = new SeededRNG(seed);
                const bb = buildB(b, { name: candName, role }, rng);
                const aa = buildA(a, rng);
                const { allyPicker, enemyPicker } = makeHexPickers();
                aa.__enemy = aa;
                const res = runBattle({
                    ally: bb.units, enemy: aa, seed,
                    hexPicker: allyPicker,
                    enemyHexPicker: enemyPicker,
                    maxRounds: CONFIG.MAX_ROUND
                });
                if (res && res.winner === '明教') wins++;
                done++;
                if (done % 200 === 0) {
                    const el = ((Date.now() - t0) / 1000).toFixed(0);
                    process.stdout.write(`\r进度 ${done}/${totalPlanned}  ${el}s`);
                }
            }
            const key = `${a.id}`;
            byA[key] = byA[key] || { wins: 0, runs: 0 };
            byA[key].wins += wins;
            byA[key].runs += RUNS;
        }
    }
    const cells = Object.entries(byA).map(([k, v]) => `${k}:${(v.wins / v.runs * 100).toFixed(0)}%`);
    const sumW = Object.values(byA).reduce((s, v) => s + v.wins, 0);
    const sumR = Object.values(byA).reduce((s, v) => s + v.runs, 0);
    rows.push({ name: candName, camp: myCamp, role, avg: (sumW / sumR * 100).toFixed(1), byA, cells: cells.join(' ') });
    console.log(`\n${candName}（${myCamp}/${role}） 平均 ${(sumW / sumR * 100).toFixed(1)}%  ${cells.join('  ')}`);
}

console.log('\n\n===== 基线（纯骨架不替换，靶子档位参考）=====');
for (const camp of [...new Set(baseline.map(x => x.bCamp))]) {
    console.log(`\n[${camp} 骨架]`);
    const ids = [...new Set(baseline.filter(x => x.bCamp === camp).map(x => x.aId))];
    console.log('  骨架     ' + ids.map(i => i.padEnd(7)).join(' '));
    for (const bId of [...new Set(baseline.filter(x => x.bCamp === camp).map(x => x.bId))]) {
        const cells = ids.map(i => {
            const r = baseline.find(x => x.bId === bId && x.aId === i);
            return (r ? r.pct.toFixed(0) + '%' : '-').padEnd(7);
        });
        console.log('  ' + bId.padEnd(9) + cells.join(' '));
    }
}

function printGroup(title, list) {
    if (!list.length) return;
    list.sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg));
    console.log(`\n===== ${title} =====`);
    const ids = [...new Set(list.flatMap(r => Object.keys(r.byA)))];
    const head = ['单位', '职业', ...ids, '平均'];
    const table = [head, ...list.map(r => [r.name, r.role,
        ...ids.map(k => r.byA[k] ? (r.byA[k].wins / r.byA[k].runs * 100).toFixed(0) + '%' : '-'),
        r.avg + '%'])];
    const widths = head.map((_, i) => Math.max(...table.map(row => String(row[i]).length)));
    for (const row of table) console.log(row.map((c, i) => String(c).padEnd(widths[i])).join('  '));
}

printGroup('明教单位（打六大派靶）', rows.filter(r => r.camp === '明教'));
printGroup('六大派单位（打明教靶）', rows.filter(r => r.camp === '六大派'));

const allRows = rows.slice().sort((a, b) => a.camp.localeCompare(b.camp, 'zh') || parseFloat(b.avg) - parseFloat(a.avg));
const aIds = [...new Set(allRows.flatMap(r => Object.keys(r.byA)))];
const head = ['阵营', '单位', '职业', ...aIds, '平均'];
const table = [head, ...allRows.map(r => [r.camp, r.name, r.role,
    ...aIds.map(k => r.byA[k] ? (r.byA[k].wins / r.byA[k].runs * 100).toFixed(0) + '%' : '-'), r.avg + '%'])];
const outPath = argv.out ? String(argv.out) : path.join(process.env.TEMP || '.', `847-power-${Date.now()}.csv`);
fs.writeFileSync(outPath, '\uFEFF' + table.map(r => r.map(c => `"${c}"`).join(',')).join('\n'), 'utf8');
console.log('\nCSV: ' + outPath);
console.log('总耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's，共 ' + done + ' 场');
