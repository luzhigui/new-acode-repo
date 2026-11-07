// tools/829-verify-pools.mjs — 池子推导对账（只读，不写任何文件）
// 口径：characters 是唯一真源。11 组池用两套独立口径互校：
//   ① 生产读取路径 = core/201 的 CONFIG getter（内部走 getHeroPools() 运行时推导）
//   ② 独立重算 = 本脚本按 characters 字段自己筛/排一遍（不调用 getHeroPools）
//   另有外部锚：encounters 各段名单、tools/827 工具登记表。
// 并断言 roster 旧表与 buffs.unity.recruitPool 已删除（不是拿旧表当对账快照）。
// 用法：node tools/829-verify-pools.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 让 core/201 的 loadGameData（fetch file://）在 Node 下可用
globalThis.fetch = async (url) => {
    const p = fileURLToPath(typeof url === 'string' ? new URL(url, import.meta.url) : url);
    const t = fs.readFileSync(p, 'utf8');
    return { ok: true, json: async () => JSON.parse(t) };
};
const cfgMod = await import('../core/201-config-5v5-test.js');
await cfgMod.loadGameData();
const CONFIG = cfgMod.CONFIG;
const { HERO_FLAGS } = await import('../core/202-unit.js');
const game = JSON.parse(read('content/001-game-data.json'));
const H = game.characters;
const enc = game.encounters;
const reg = await import('../tools/827-tool-registry.js');

const names = Object.keys(H);
const base = (n) => (typeof n === 'string' && n.includes('·') ? n.slice(0, n.indexOf('·')) : n);
const roleOf = (n) => {
    const c = H[base(n)];
    if (!c) return null;
    return (c.tags || []).find(t => ['战士', '防战', '远程', '飞行', '标枪', '蝴蝶'].includes(t)) || null;
};
const byOrder = (arr, key) => arr.slice().sort((a, b) => (H[a][key] ?? 1e9) - (H[b][key] ?? 1e9));
const pick = (fn) => names.filter(fn);
const eqSet = (a, b) => a.length === b.length && [...new Set(a)].every(x => b.includes(x));
const minus = (a, b) => [...new Set(a)].filter(x => !b.includes(x));

// ── ② 独立重算（只用 characters 字段） ──
const derive = {
    mingElite: () => byOrder(pick(n => H[n].camp === '明教' && ['boss', 'strong', 'weak'].includes(H[n].tier)), 'mingOrder'),
    strong: () => pick(n => H[n].camp === '明教' && ['boss', 'strong'].includes(H[n].tier)),
    weak: () => byOrder(pick(n => H[n].camp === '明教' && H[n].tier === 'weak'), 'mingOrder'),
    encounter: () => pick(n => H[n].camp === '六大派' && H[n].encounter),
    summonAlly: () => byOrder(pick(n => H[n].camp === '明教' && H[n].summon), 'recruitOrder'),
    summonEnemy: () => pick(n => H[n].camp === '六大派' && H[n].summon),
    mingM: () => byOrder(pick(n => H[n].camp === '明教' && H[n].everyday), 'mingOrder'),
    enemyM: () => byOrder(pick(n => H[n].camp === '六大派' && H[n].everyday), 'enemyOrder'),
    mingAll: () => pick(n => H[n].mingAll),
    flags: () => Object.fromEntries(names.filter(n => H[n].flag).map(n => [n, H[n].flag])),
    titles: () => {
        const out = {};
        for (const sect of game.roster.enemySects) {
            out[sect] = byOrder(pick(n => H[n].camp === '六大派' && H[n].everyday && H[n].sect === sect && H[n].titleOrder != null), 'titleOrder');
        }
        out.default = game.roster.enemySects.map(s => `${s}弟子`);
        return out;
    }
};

// ── ① 生产读取路径（CONFIG getter） ──
const prod = {
    eliteConfigs: () => CONFIG.ELITE_CONFIGS,
    mingM: () => Object.keys(CONFIG.MING_M),
    enemyM: () => Object.keys(CONFIG.ENEMY_M),
    mingAll: () => CONFIG.MING_ALL,
    recruit: () => CONFIG.BUFFS.unity.recruitPool,
    titles: () => CONFIG.ENEMY_TITLES,
    weak: () => {
        const fixed = new Set(prod.eliteConfigs().map(e => e.name));
        return Object.keys(CONFIG.MING_M).filter(n => HERO_FLAGS[n] && !fixed.has(n));
    },
    mingElite: () => [...prod.eliteConfigs().map(e => e.name), ...prod.weak()],
};

// ── 旧键清除断言 ──
const removedKeys = [
    ['roster.mingM', game.roster.mingM],
    ['roster.enemyM', game.roster.enemyM],
    ['roster.mingAll', game.roster.mingAll],
    ['roster.enemyTitles', game.roster.enemyTitles],
    ['roster.eliteConfigs', game.roster.eliteConfigs],
    ['roster._deprecated', game.roster._deprecated],
    ['buffs.unity.recruitPool', game.buffs?.unity?.recruitPool],
];
const oldGone = removedKeys.every(([, v]) => v === undefined);

let pass = 0;
const total = 11;
function check(idx, label, a, b, detail) {
    const ok = eqSet(a, b) && (detail ? detail() : true);
    if (ok) pass++;
    console.log(`\n[${idx}] ${label} ${ok ? '✅ 一致' : '❌ 有差集'}`);
    console.log(`  生产 ${a.length}：${a.join(' / ')}`);
    console.log(`  重算 ${b.length}：${b.join(' / ')}`);
    const onlyA = minus(a, b), onlyB = minus(b, a);
    if (onlyA.length) console.log(`  仅生产有：${onlyA.join(' / ')}`);
    if (onlyB.length) console.log(`  仅重算有：${onlyB.join(' / ')}`);
    return ok;
}

console.log('══════════════════════════════════════════════════════════════');
console.log(' 抽卡池推导对账（characters 单一真源 · 生产读取路径 vs 独立重算）');
console.log('══════════════════════════════════════════════════════════════');
console.log(`characters ${names.length} 条 · roster 现存键 ${Object.keys(game.roster).join(' / ')}`);

check(1, '明教精英池（三档合并）', prod.mingElite(), derive.mingElite());
check(2, '明教 Boss+强精英（ELITE_CONFIGS）', prod.eliteConfigs().map(e => e.name), derive.strong(), () => {
    console.log('  逐条：' + prod.eliteConfigs().map(e => `${e.name}(m${e.m}/${e.tier}/${e.flag ?? 'null'})`).join('  '));
    return prod.eliteConfigs().every(e => H[e.name] && H[e.name].m === e.m && H[e.name].tier === e.tier
        && (H[e.name].flag || H[e.name].forms?.brother?.flag || null) === e.flag);
});
check(3, '明教弱精英（HERO_FLAGS ∩ MING_M − ELITE_CONFIGS）', prod.weak(), derive.weak(),
    () => derive.weak().every(n => H[n].flag === derive.flags()[n]));
check(4, '六大派具名敌方（encounters 各段）', (() => {
    const s = new Set();
    for (const st of Object.values(enc.elitePool || {})) for (const e of st) if (e?.name) s.add(e.name);
    for (const st of Object.values(enc.enemySquads || {})) for (const e of st) if (e?.name) s.add(e.name);
    for (const v of Object.values(enc.squadVariants || {})) for (const g of v) for (const e of g.squad || []) if (e?.name) s.add(e.name);
    return [...s];
})(), derive.encounter());
check(5, '召唤池 ally（CONFIG.BUFFS.unity.recruitPool.ally）', prod.recruit().ally.map(e => e.name), derive.summonAlly(),
    () => prod.recruit().ally.every(e => roleOf(e.name) === e.role));
check(6, '召唤池 enemy（CONFIG.BUFFS.unity.recruitPool.enemy）', prod.recruit().enemy.map(e => e.name), derive.summonEnemy(),
    () => prod.recruit().enemy.every(e => roleOf(e.name) === e.role));

// 明教/六大派全员：集合 + 顺序 + m 值逐位
const mingMProd = prod.mingM(), mingMDerive = derive.mingM();
const enemyMProd = prod.enemyM(), enemyMDerive = derive.enemyM();
check(7, '明教全员 MING_M（含顺序/m）', mingMProd, mingMDerive,
    () => mingMProd.every((n, i) => mingMDerive[i] === n && CONFIG.MING_M[n] === H[n].m));
check(8, '六大派全员 ENEMY_M（含顺序/m）', enemyMProd, enemyMDerive,
    () => enemyMProd.every((n, i) => enemyMDerive[i] === n && CONFIG.ENEMY_M[n] === H[n].m));
check(9, 'MING_ALL', prod.mingAll(), derive.mingAll());

// HERO_FLAGS：名字→标记 逐键一致
const fNew = derive.flags(), fOld = Object.fromEntries(names.filter(n => HERO_FLAGS[n]).map(n => [n, HERO_FLAGS[n]]));
const flagOk = Object.keys(fOld).length === Object.keys(fNew).length
    && Object.keys(fOld).every(k => fNew[k] === fOld[k]);
if (flagOk) pass++;
console.log(`\n[10] HERO_FLAGS（core/202 身份表 proxy） ${flagOk ? '✅ 一致' : '❌ 有差集'}`);
console.log(`  proxy ${Object.keys(fOld).length}：${Object.keys(fOld).join(' / ')}`);
console.log(`  characters ${Object.keys(fNew).length}：${Object.keys(fNew).join(' / ')}`);
if (!flagOk) for (const k of new Set([...Object.keys(fOld), ...Object.keys(fNew)])) if (fOld[k] !== fNew[k]) console.log(`  ⚠ ${k}: proxy=${fOld[k]} characters=${fNew[k]}`);

// 827 各名单
const formNames = (flag) => names.flatMap(n => {
    const c = H[n];
    if (c.forms) return Object.values(c.forms).filter(f => f[flag] != null).map(f => [f.name, f[flag]]);
    return c.tool?.[flag] != null ? [[n, c.tool[flag]]] : [];
});
const list827 = (flag, extra = []) => formNames(flag).sort((a, b) => a[1] - b[1]).map(x => x[0]).concat(extra);
const meta827 = () => {
    const out = {};
    for (const n of names) {
        const c = H[n];
        if (c.forms) {
            for (const f of Object.values(c.forms)) if (f.stdPos != null) out[f.name] = { flag: f.flag, stdPos: f.stdPos, tag: f.tag, role: f.role };
        } else if (c.tool?.stdPos != null) {
            out[n] = { flag: c.flag, stdPos: c.tool.stdPos, tag: c.tool.tag, role: c.tool.role };
        }
    }
    return out;
};
const g11 = [
    eqSet(reg.NATURAL_ELITES, list827('natural')),
    eqSet(reg.SOLO_ELITES, list827('solo')),
    eqSet(reg.BOSS_ELITES, list827('boss')),
    eqSet(reg.WEAK_ELITES.map(w => w.name), list827('weakOrder')),
    eqSet(reg.WEAK_ELITES.map(w => w.side), formNames('weakOrder').sort((a, b) => a[1] - b[1]).map(([n]) => H[base(n)].camp === '明教' ? 'ally' : 'enemy')),
    eqSet(reg.M100_SKILL_ALLIES, list827('m100Skill')),
    eqSet(reg.ENEMY_VARIANTS, list827('variant', ['标准'])),
    Object.entries(reg.ELITE_UNIT_META).every(([k, v]) => {
        const d = meta827()[k];
        return d && d.flag === v.flag && d.stdPos === v.stdPos && d.tag === v.tag && d.role === v.role;
    }),
];
const ok11 = g11.every(Boolean);
if (ok11) pass++;
console.log(`\n[11] tools/827 各名单 ${ok11 ? '✅ 一致' : '❌ 有差集'}（${g11.filter(Boolean).length}/${g11.length} 次比对）`);
if (!ok11) console.log(`  分项：natural=${g11[0]} solo=${g11[1]} boss=${g11[2]} weakName=${g11[3]} weakSide=${g11[4]} m100=${g11[5]} variants=${g11[6]} meta=${g11[7]}`);

// ── 附加诊断 1：门派名册（ENEMY_TITLES，旧 roster.enemyTitles 已删，无旧锚，改结构自检）──
console.log('\n── 附加诊断：ENEMY_TITLES 结构 ──');
const tProd = prod.titles(), tDerive = derive.titles();
const sectOk = Object.keys(tDerive).every(s => {
    const a = tProd[s] || [], b = tDerive[s];
    const sameOrder = a.length === b.length && b.every((n, i) => a[i] === n);
    if (!sameOrder) console.log(`  ⚠ ${s}: 生产=${a.join(' / ')} 重算=${b.join(' / ')}`);
    return sameOrder;
});
console.log(sectOk ? '  ✅ 各门派名册与重算逐位一致' : '  ❌ 名册不一致');

// ── 附加诊断 2：职业一致性（不计入 11 组）──
console.log('\n── 附加诊断：职业一致性 ──');
let roleBad = 0;
const seen = new Set();
for (const [n, r] of [...prod.eliteConfigs().map(e => [e.name, e.role]),
...prod.recruit().ally.map(e => [e.name, e.role]),
...prod.recruit().enemy.map(e => [e.name, e.role])]) {
    if (seen.has(n)) continue; seen.add(n);
    if (roleOf(n) !== r) { roleBad++; console.log(`  ⚠ ${n}: 池 role=${r} characters tag=${roleOf(n)}`); }
}
if (!roleBad) console.log('  （无差异）');

// ── 旧键清除 ──
console.log('\n── 旧键清除断言（roster 旧表 / recruitPool 应已删除）──');
for (const [k, v] of removedKeys) console.log(`  ${v === undefined ? '✅ 不存在' : '❌ 仍存在'}  ${k}`);
if (!oldGone) console.log('  ⚠ 旧表未删干净');

console.log('\n══════════════════════════════════════════════════════════════');
console.log(` 结论：${pass}/${total} 组一致 · ${oldGone ? '旧键 7 项已清除 ✅' : '旧键仍有残留 ❌'}`);
console.log(`      ${pass === total && oldGone ? '✅ 推导链自洽且单一真源已收口' : '❌ 先补差集，不得收口'}`);
console.log('══════════════════════════════════════════════════════════════');
process.exit(pass === total && oldGone ? 0 : 1);
