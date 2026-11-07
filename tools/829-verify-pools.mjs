// tools/829-verify-pools.mjs — 池子推导对账（只读，不写任何文件）
// 口径：11 组池，全部以 content/001-game-data.json 的 characters 为真源做推导，
//   与 roster / buffs / core/202 / tools/827 的旧硬编码逐项比对。差集为 0 才允许切换读取路径。
// 用法：node tools/829-verify-pools.mjs
//
// 推导规则（characters 字段）
//   camp/sect/tier/summon/everyday/encounter/m/flag/forms/tool/mingOrder/enemyOrder/mingAll
//   —— 详见 文件汇总20260730/10 待办事项和想法优化/05 优化二-B方案-characters单一真源迁移清单.md

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
const { HERO_FLAGS } = await import('../core/202-unit.js');
const game = JSON.parse(read('content/001-game-data.json'));
const H = game.characters;
const roster = game.roster;
const enc = game.encounters;
const reg = await import('../tools/827-tool-registry.js');

const names = Object.keys(H);
const base = (n) => (typeof n === 'string' && n.includes('·') ? n.slice(0, n.indexOf('·')) : n);
const roleOf = (n) => {
    const c = H[base(n)];
    if (!c) return null;
    const own = (c.tags || []).find(t => ['战士', '防战', '远程', '飞行', '标枪', '蝴蝶'].includes(t));
    return own || null;
};
const byOrder = (arr, key) => arr.slice().sort((a, b) => (H[a][key] ?? 1e9) - (H[b][key] ?? 1e9));
const pick = (fn) => names.filter(fn);
const eqSet = (a, b) => a.length === b.length && [...new Set(a)].every(x => b.includes(x));
const minus = (a, b) => [...new Set(a)].filter(x => !b.includes(x));

// ── 推导 ──
const derive = {
    mingElite: () => byOrder(pick(n => H[n].camp === '明教' && ['boss', 'strong', 'weak'].includes(H[n].tier)), 'mingOrder'),
    strong: () => pick(n => H[n].camp === '明教' && ['boss', 'strong'].includes(H[n].tier)),
    weak: () => byOrder(pick(n => H[n].camp === '明教' && H[n].tier === 'weak'), 'mingOrder'),
    encounter: () => pick(n => H[n].camp === '六大派' && H[n].encounter),
    summonAlly: () => byOrder(pick(n => H[n].camp === '明教' && H[n].summon), 'mingOrder'),
    summonEnemy: () => pick(n => H[n].camp === '六大派' && H[n].summon),
    mingM: () => byOrder(pick(n => H[n].camp === '明教' && H[n].everyday), 'mingOrder'),
    enemyM: () => byOrder(pick(n => H[n].camp === '六大派' && H[n].everyday), 'enemyOrder'),
    mingAll: () => pick(n => H[n].mingAll),
    flags: () => Object.fromEntries(names.filter(n => H[n].flag).map(n => [n, H[n].flag])),
};

// ── 旧池（硬编码） ──
const legacy = {
    mingElite: () => [...(roster.eliteConfigs || []).map(e => e.name), ...legacy.weak()],
    strong: () => (roster.eliteConfigs || []).filter(e => e.tier !== 'weak').map(e => e.name),
    weak: () => {
        const heroFlags = legacy.flags();
        const fixed = new Set((roster.eliteConfigs || []).map(e => e.name));
        return Object.keys(roster.mingM || {}).filter(n => heroFlags[n] && !fixed.has(n));
    },
    encounter: () => {
        const s = new Set();
        for (const st of Object.values(enc.elitePool || {})) for (const e of st) if (e?.name) s.add(e.name);
        for (const st of Object.values(enc.enemySquads || {})) for (const e of st) if (e?.name) s.add(e.name);
        for (const v of Object.values(enc.squadVariants || {})) for (const g of v) for (const e of g.squad || []) if (e?.name) s.add(e.name);
        return [...s];
    },
    summonAlly: () => ((game.buffs?.unity?.recruitPool?.ally) || []).map(e => e.name),
    summonEnemy: () => ((game.buffs?.unity?.recruitPool?.enemy) || []).map(e => e.name),
    mingM: () => Object.keys(roster.mingM || {}),
    enemyM: () => Object.keys(roster.enemyM || {}),
    mingAll: () => roster.mingAll || [],
    flags: () => Object.fromEntries(names.filter(n => HERO_FLAGS[n]).map(n => [n, HERO_FLAGS[n]])),
};

let pass = 0;
const total = 11;
function check(idx, label, oldArr, newArr, detail) {
    const ok = eqSet(oldArr, newArr) && (detail ? detail() : true);
    if (ok) pass++;
    console.log(`\n[${idx}] ${label} ${ok ? '✅ 一致' : '❌ 有差集'}`);
    console.log(`  旧 ${oldArr.length}：${oldArr.join(' / ')}`);
    console.log(`  新 ${newArr.length}：${newArr.join(' / ')}`);
    const onlyOld = minus(oldArr, newArr), onlyNew = minus(newArr, oldArr);
    if (onlyOld.length) console.log(`  仅旧有：${onlyOld.join(' / ')}`);
    if (onlyNew.length) console.log(`  仅新有：${onlyNew.join(' / ')}`);
    return ok;
}

console.log('══════════════════════════════════════════════════════════════');
console.log(' 抽卡池推导对账（characters 单一真源）');
console.log('══════════════════════════════════════════════════════════════');
console.log(`characters ${names.length} 条 · roster.mingM ${Object.keys(roster.mingM || {}).length} · enemyM ${Object.keys(roster.enemyM || {}).length}`);

check(1, '明教精英池（三档合并）', legacy.mingElite(), derive.mingElite());
check(2, '明教 Boss+强精英（eliteConfigs）', legacy.strong(), derive.strong(), () => {
    const cfg = roster.eliteConfigs || [];
    return cfg.every(e => H[e.name] && H[e.name].m === e.m && H[e.name].tier === e.tier
        && (H[e.name].flag || H[e.name].forms?.brother?.flag || '') === e.flag);
});
check(3, '明教弱精英（HERO_FLAGS ∩ mingM − eliteConfigs）', legacy.weak(), derive.weak(),
    () => derive.weak().every(n => H[n].flag === legacy.flags()[n]));
check(4, '六大派具名敌方（encounters 各段）', legacy.encounter(), derive.encounter());
check(5, '召唤池 ally（unity.recruitPool.ally）', legacy.summonAlly(), derive.summonAlly(),
    () => derive.summonAlly().every(n => roleOf(n) === game.buffs.unity.recruitPool.ally.find(e => e.name === n)?.role));
check(6, '召唤池 enemy（unity.recruitPool.enemy）', legacy.summonEnemy(), derive.summonEnemy(),
    () => derive.summonEnemy().every(n => roleOf(n) === game.buffs.unity.recruitPool.enemy.find(e => e.name === n)?.role));

// 明教/六大派全员：集合 + 顺序 + m 值逐位
const mingMNew = derive.mingM(), mingMOld = legacy.mingM();
const enemyMNew = derive.enemyM(), enemyMOld = legacy.enemyM();
check(7, '明教全员 roster.mingM（含顺序/m）', mingMOld, mingMNew,
    () => mingMOld.every((n, i) => mingMNew[i] === n && roster.mingM[n] === H[n].m));
check(8, '六大派全员 roster.enemyM（含顺序/m）', enemyMOld, enemyMNew,
    () => enemyMOld.every((n, i) => enemyMNew[i] === n && roster.enemyM[n] === H[n].m));
check(9, 'roster.mingAll', legacy.mingAll(), derive.mingAll());

// HERO_FLAGS：名字→标记 逐键一致
const fNew = derive.flags(), fOld = legacy.flags();
const flagOk = Object.keys(fOld).length === Object.keys(fNew).length
    && Object.keys(fOld).every(k => fNew[k] === fOld[k]);
if (flagOk) pass++;
console.log(`\n[10] HERO_FLAGS（core/202 身份表） ${flagOk ? '✅ 一致' : '❌ 有差集'}`);
console.log(`  旧 ${Object.keys(fOld).length}：${Object.keys(fOld).join(' / ')}`);
console.log(`  新 ${Object.keys(fNew).length}：${Object.keys(fNew).join(' / ')}`);
if (!flagOk) for (const k of new Set([...Object.keys(fOld), ...Object.keys(fNew)])) if (fOld[k] !== fNew[k]) console.log(`  ⚠ ${k}: 旧=${fOld[k]} 新=${fNew[k]}`);

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

// 附加：职业口径（不计入 11 组，红只作诊断）
console.log('\n── 附加诊断：职业一致性 ──');
let roleBad = 0;
const seen = new Set();
for (const [n, r] of [...(roster.eliteConfigs || []).map(e => [e.name, e.role]),
...((game.buffs?.unity?.recruitPool?.ally) || []).map(e => [e.name, e.role]),
...((game.buffs?.unity?.recruitPool?.enemy) || []).map(e => [e.name, e.role])]) {
    if (seen.has(n)) continue; seen.add(n);
    if (roleOf(n) !== r) { roleBad++; console.log(`  ⚠ ${n}: 旧 role=${r} characters tag=${roleOf(n)}`); }
}
if (!roleBad) console.log('  （无差异）');

console.log('\n══════════════════════════════════════════════════════════════');
console.log(` 结论：${pass}/${total} 组一致${pass === total ? ' ✅ 可切读取路径' : ' ❌ 先补差集，不得切换'}`);
console.log('══════════════════════════════════════════════════════════════');
