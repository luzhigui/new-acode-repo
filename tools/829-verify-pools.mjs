// tools/829-verify-pools.mjs — 抽卡池推导对账（只读，不写任何文件）
// 目的：把「现有硬编码池子」逐项与「从 content.characters.tags 推导出的池子」比对，输出差集。
//   一致 → 才允许切换读取路径；不一致 → 只报差集，不改主代码。
// 用法：node tools/829-verify-pools.mjs
//
// 推导规则（当前唯一可用真源：characters 的 tags）
//   阵营 = tags 含 '明教' / '六大派'
//   职业 = tags 命中 ROLES 之一（战士/防战/远程/飞行；蝴蝶、标枪为身份职业，不参与随机池）
//   精英 = tags 含 '精英'；普通 = tags 含 '普通'
//   门派 = tags 命中 enemySects 之一
//   杂兵（少林弟子/明教弟子1 等）不在 characters 内 → 不可推导

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const game = JSON.parse(read('content/001-game-data.json'));
const chars = game.characters || {};
const roster = game.roster || {};
const enc = game.encounters || {};

const ROLES = ['战士', '防战', '远程', '飞行'];
const has = (n, t) => (chars[n]?.tags || []).includes(t);
const roleOf = (n) => (chars[n]?.tags || []).find(t => ROLES.includes(t)) || null;

// ── 推导器：characters → 池 ──
const derived = {
    mingElite: Object.keys(chars).filter(n => has(n, '明教') && has(n, '精英')),
    sectElite: Object.keys(chars).filter(n => has(n, '六大派') && has(n, '精英')),
    mingNamed: Object.keys(chars).filter(n => has(n, '明教')),
    sectNamed: Object.keys(chars).filter(n => has(n, '六大派')),
};

// ── 现有池子（数据表） ──
const mingM = Object.keys(roster.mingM || {});
const enemyM = Object.keys(roster.enemyM || {});
const eliteConfigs = (roster.eliteConfigs || []).map(e => e.name);
const recruitAlly = ((game.buffs?.unity?.recruitPool?.ally) || []).map(e => e.name);
const recruitEnemy = ((game.buffs?.unity?.recruitPool?.enemy) || []).map(e => e.name);

// 六大派具名敌方：encounters 各段里 {name,role,m} 的具名项（去重）
const sectEncounterNames = new Set();
for (const stage of Object.values(enc.elitePool || {})) for (const e of stage) if (e?.name) sectEncounterNames.add(e.name);
for (const stage of Object.values(enc.enemySquads || {})) for (const e of stage) if (e?.name) sectEncounterNames.add(e.name);
for (const v of Object.values(enc.squadVariants || {})) for (const g of v) for (const e of g.squad || []) if (e?.name) sectEncounterNames.add(e.name);

// ── 现有池子（代码硬编码） ──
const unitTxt = read('core/202-unit.js');
const heroFlags = [...unitTxt.matchAll(/'([^']+)'\s*:\s*'is[A-Za-z]+'/g)].map(m => m[1]);
// 明教弱精英实际生效池 = HERO_FLAGS ∩ mingM − eliteConfigs（modules/330 现行派生）
const weakPool = heroFlags.filter(n => mingM.includes(n) && !eliteConfigs.includes(n));

const regTxt = read('tools/827-tool-registry.js');
const arrOf = (name) => {
    const m = regTxt.match(new RegExp(`export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
    return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : [];
};
const reg827 = [
    ...arrOf('NATURAL_ELITES'), ...arrOf('SOLO_ELITES'), ...arrOf('BOSS_ELITES'),
    ...[...regTxt.matchAll(/name:\s*'([^']+)'/g)].map(x => x[1])
];

// ── 差集工具 ──
const uniq = (a) => [...new Set(a)];
const minus = (a, b) => uniq(a).filter(x => !b.includes(x));
function cmp(label, existing, deriveFn, note) {
    const d = deriveFn(existing);
    const onlyOld = minus(existing, d);
    const onlyNew = minus(d, existing);
    const same = onlyOld.length === 0 && onlyNew.length === 0;
    console.log(`\n── ${label} ${same ? '✅ 一致' : '❌ 有差集'} ──`);
    console.log(`   现有 ${uniq(existing).length} 个：${uniq(existing).join(' / ')}`);
    console.log(`   推导 ${uniq(d).length} 个：${uniq(d).join(' / ')}`);
    if (onlyOld.length) console.log(`   仅现有有：${onlyOld.join(' / ')}`);
    if (onlyNew.length) console.log(`   仅推导有：${onlyNew.join(' / ')}`);
    if (note) console.log(`   ${note}`);
    return same;
}

console.log('══════════════════════════════════════════════════════════════');
console.log(' 抽卡池推导对账 · 现有硬编码池 vs characters.tags 推导');
console.log('══════════════════════════════════════════════════════════════');
console.log(`[characters] ${Object.keys(chars).length} 个；[roster.mingM] ${mingM.length}；[roster.enemyM] ${enemyM.length}`);

const rows = [];
const results = [];

// 1. 明教精英池（eliteConfigs + 弱精英派生）
results.push(cmp('P1 明教精英池（eliteConfigs ∪ 弱精英）', [...eliteConfigs, ...weakPool],
    () => derived.mingElite,
    '规则：characters tag 明教+精英'));
// 2. 明教强精英（eliteConfigs）
results.push(cmp('P2 明教强精英/Boss（roster.eliteConfigs）', eliteConfigs,
    () => eliteConfigs.filter(n => derived.mingElite.includes(n)),
    '仅比对成员：m/flag/tier 在 characters 无对应字段，无法推导'));
// 3. 明教弱精英（代码派生）
results.push(cmp('P3 明教弱精英（HERO_FLAGS ∩ mingM − eliteConfigs）', weakPool,
    () => derived.mingElite.filter(n => !eliteConfigs.includes(n)),
    '规则：明教精英 − eliteConfigs'));
// 4. 六大派具名敌方（encounters 各段）
results.push(cmp('P4 六大派具名敌方（encounters 各段）', [...sectEncounterNames],
    () => derived.sectElite,
    '规则：characters tag 六大派+精英'));
// 5. 众志召唤池·明教
results.push(cmp('P5 召唤池 ally（unity.recruitPool.ally）', recruitAlly,
    () => derived.mingElite,
    '规则：characters tag 明教+精英（characters 无「可召唤」标记 → 召唤池是精选子集，非全池）'));
// 6. 众志召唤池·六大派
results.push(cmp('P6 召唤池 enemy（unity.recruitPool.enemy）', recruitEnemy,
    () => derived.sectElite,
    '规则：characters tag 六大派+精英（同上，精选子集）'));
// 7. 明教全员（mingM）
results.push(cmp('P7 明教全员 roster.mingM', mingM,
    () => derived.mingNamed,
    'characters 缺 13 个明教杂兵 → 不可推导'));
// 8. 六大派全员（enemyM）
results.push(cmp('P8 六大派全员 roster.enemyM', enemyM,
    () => derived.sectNamed,
    'characters 缺 42 个六大派杂兵 → 不可推导'));
// 9. mingAll
results.push(cmp('P9 roster.mingAll', roster.mingAll || [],
    () => derived.mingNamed.filter(n => mingM.includes(n)),
    '规则：characters tag 明教 且 在 mingM 内（mingAll ⊂ mingM，无独立标记 → 不可推导）'));
// 10. HERO_FLAGS
results.push(cmp('P10 HERO_FLAGS（core/202 身份表）', heroFlags,
    () => heroFlags.filter(n => Object.keys(chars).includes(n)),
    '三狮（雄狮/幼狮/母狮）为召唤物，不在 characters'));
// 11. 827 工具名单
results.push(cmp('P11 tools/827 工具名单', reg827,
    () => reg827.filter(n => Object.keys(chars).includes(n)),
    '小昭·姊/妹 为形态名，characters 键为 小昭'));

// ── 明细：职业一致性 ──
console.log('\n── P12 职业一致性（现有池内声明 role vs characters tag 职业）──');
const roleChecks = [
    ...(roster.eliteConfigs || []).map(e => [e.name, e.role, 'eliteConfigs']),
    ...((game.buffs?.unity?.recruitPool?.ally) || []).map(e => [e.name, e.role, 'recruitPool.ally']),
    ...((game.buffs?.unity?.recruitPool?.enemy) || []).map(e => [e.name, e.role, 'recruitPool.enemy']),
    ...[...sectEncounterNames].flatMap(n => Object.values(enc.elitePool || {}).flat().filter(e => e?.name === n).map(e => [e.name, e.role, 'elitePool'])),
];
const seenRole = new Set();
let roleBad = 0;
for (const [n, r, where] of roleChecks) {
    const key = `${n}|${r}`;
    if (seenRole.has(key)) continue;
    seenRole.add(key);
    const d = roleOf(n);
    if (d == null) { roleBad++; console.log(`  ⚠ ${n} (${where}) 声明 role=${r}，characters 无职业 tag`); continue; }
    if (d !== r) { roleBad++; console.log(`  ⚠ ${n} (${where}) 声明 role=${r}，characters tag=${d}`); }
}
if (!roleBad) console.log('  （无差异）');

// ── 汇总 ──
console.log('\n══════════════════════════════════════════════════════════════');
console.log(` 结论：${results.filter(Boolean).length}/${results.length} 组完全一致`);
if (results.some(r => !r)) console.log(' ⚠️ 存在差集 → 按验收硬条件，不得切换读取路径');
console.log('══════════════════════════════════════════════════════════════');
