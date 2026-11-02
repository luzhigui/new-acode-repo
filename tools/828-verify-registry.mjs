// tools/828-verify-registry.mjs — 工具数据护栏：比对「主代码精英池/数值」与「工具名单/HERO_META」
// 目的：主代码加新精英、改 m 值、改出场方式时，工具侧(827/805)能立刻发现漂移，避免人工同步漏掉。
// 用法：node tools/828-verify-registry.mjs   （纯只读，不写任何文件）
//
// 数据维度核查项：
//   1) 主代码 registerElite 名单  vs  827 注册表覆盖名单 → 列出"主代码有、工具未覆盖"的精英
//   2) 主代码 roster.mingM/enemyM/eliteConfigs/encounters 的 m 值  vs  805 HERO_META.baseM → 列出数值漂移
//   3) 主代码精英的"出场方式"粗判（明教自然/六大派敌方变体/朝廷/carry召唤），标注工具是否有对应评测通道

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---- 1. 主代码真实精英名单 (registerElite) ----
const modulesDir = path.join(ROOT, 'modules');
const eliteNames = new Set();
for (const f of fs.readdirSync(modulesDir)) {
  if (!/^\d{3}-.*\.js$/.test(f)) continue;
  const txt = read(`modules/${f}`);
  for (const m of txt.matchAll(/registerElite\(\s*'([^']+)'/g)) eliteNames.add(m[1]);
}

// ---- 2. 主代码 m 值权威源 (roster) ----
const game = JSON.parse(read('content/001-game-data.json'));
const r = game.roster || {};
const mSrc = {}; // name -> [where:m]
const addM = (name, m, where) => { if (name && m != null) (mSrc[name] = mSrc[name] || []).push(`${where}:${m}`); };
for (const [k, v] of Object.entries(r.mingM || {})) addM(k, v, 'mingM');
for (const [k, v] of Object.entries(r.enemyM || {})) addM(k, v, 'enemyM');
for (const e of (r.eliteConfigs || [])) addM(e.name, e.m, 'eliteConfigs');
// encounters 阵容段里的 m（宽松匹配 "name":"X","role":"Y","m":N 或 "name": "X", "role": "Y", "m": N）
const encTxt = JSON.stringify(game.encounters || {});
for (const m of encTxt.matchAll(/"name":\s*"([^"]+)",\s*"role":\s*"[^"]+",\s*"m":\s*([0-9]+)/g)) addM(m[1], Number(m[2]), 'enc');

// ---- 3. 827 注册表覆盖名单 ----
const reg = read('tools/827-tool-registry.js');
const arrOf = (name) => {
  const m = reg.match(new RegExp(`export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!m) return [];
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
};
const NATURAL = arrOf('NATURAL_ELITES');
const SOLO = arrOf('SOLO_ELITES');
const BOSS = arrOf('BOSS_ELITES');
const WEAK = arrOf('WEAK_ELITES').length ? arrOf('WEAK_ELITES') : []; // 对象数组，单独处理
const weakNames = [...reg.matchAll(/name:\s*'([^']+)'/g)].map(x => x[1]);
const covered827 = new Set([...NATURAL, ...SOLO, ...BOSS, ...weakNames]);

// ---- 4. 805 HERO_META ----
const shop = read('tools/805-shop.html');
const heroMeta = {};
const hmBlock = shop.match(/const HERO_META\s*=\s*\{([\s\S]*?)\n\};/);
if (hmBlock) {
  for (const m of hmBlock[1].matchAll(/'([^']+)'\s*:\s*\{\s*baseM:\s*([0-9]+),\s*role:\s*'([^']+)',\s*camp:\s*'([^']+)'/g)) {
    heroMeta[m[1]] = { baseM: Number(m[2]), role: m[3], camp: m[4] };
  }
}

// ---- 5. 出场方式粗判 ----
function whereFrom(name) {
  if (r.eliteConfigs?.some(e => e.name === name)) return '明教自然核心';
  if ((r.enemyM || {})[name] != null) return '六大派/朝廷(敌方阵容)';
  if (mSrc[name]?.some(s => s.startsWith('enc'))) return '敌方阵容配置段';
  if (name === '雄鹰') return 'carry海克斯召唤(明教)';
  return '未归类';
}

// 已知差异白名单：主代码有、但工具侧【有意不单列 / 有意分档】的项。
// 这些是设计选择，不算漂移；但若未来主代码真改了这些项，仍需人工复核（输出中仍列出，仅不计为告警）。
const KNOWN_DIFFS = {
  // A 类：明教核心评测以己方为主，敌方强精英随阵容出场，不在 827 精选名单单列
  '周芷若': '六大派强精英，随敌方阵容出场（eliteConfigs），112 以明教侧为核心不强求单列',
  '张三丰': '六大派强精英，随敌方阵容出场',
  '灭绝师太': '六大派强精英，随敌方阵容出场',
  '成昆': '朝廷强精英，随敌方阵容出场',
  '鹿杖客': '朝廷强精英，随敌方阵容出场',
  '鹤笔翁': '朝廷强精英，随敌方阵容出场',
  '胖远桥': '六大派强精英，随敌方阵容出场',
  '宋青书': '六大派强精英，随敌方阵容出场',
  '雄鹰': 'carry 海克斯召唤物（317 注册），由 108 海克斯仪表盘覆盖',
  // B 类：小昭·姊 805 有意分档 ±2（主代码小昭统一 107，805 拆姊 105/妹 107）
  '小昭·姊': '805 有意分档：姊 105 / 妹 107（主代码小昭统一 107，±2 属设计性）',
};

// ===== 输出 =====
console.log('══════════════════════════════════════════════════════════════');
console.log(' 工具数据护栏 · 主代码精英池 vs 工具名单/HERO_META');
console.log('══════════════════════════════════════════════════════════════');
console.log(`\n[主代码 registerElite 精英] 共 ${eliteNames.size} 个`);
console.log(`[827 覆盖] NATURAL=${NATURAL.length} SOLO=${SOLO.length} BOSS=${BOSS.length} WEAK=${weakNames.length}（去重覆盖 ${covered827.size} 个名字）`);
console.log(`[805 HERO_META] ${Object.keys(heroMeta).length} 项`);

console.log('\n── A. 主代码有、但 827 注册表未覆盖的精英 ──');
const uncovered = [...eliteNames].filter(n => !covered827.has(n)).sort();
if (!uncovered.length) console.log('  （无，827 已覆盖全部注册精英）');
const newProblems = [];
for (const n of uncovered) {
  const ms = mSrc[n] || [];
  const sameAs805 = heroMeta[n] ? `  805.baseM=${heroMeta[n].baseM}` : '  805:无此英雄';
  const known = KNOWN_DIFFS[n];
  if (known) {
    console.log(`  • ${n}  [${whereFrom(n)}]  主代码m=${ms.join('/') || '?'}  ${sameAs805}`);
    console.log(`      ↳ 已知差异(白名单)：${known}`);
  } else {
    console.log(`  ⚠ ${n}  [${whereFrom(n)}]  主代码m=${ms.join('/') || '?'}  ${sameAs805}`);
    console.log(`      → 建议补进 827 对应名单（NATURAL / SOLO / WEAK / BOSS）`);
    newProblems.push(n);
  }
}

console.log('\n── B. 805 HERO_META 数值漂移（vs 主代码 m 权威源）──');
const drift = [];
for (const [n, v] of Object.entries(heroMeta)) {
  const norm = n.replace(/·[一-龥]+$/, '');            // 归一化：小昭·姊/妹 → 小昭，对齐 roster.eliteConfigs 的键
  const ms = (mSrc[norm] || mSrc[n] || []).map(s => Number(s.split(':')[1]));
  const ok = ms.length && ms.includes(v.baseM);
  if (!ok) drift.push({ n, shopM: v.baseM, src: ms.length ? ms.join('/') : '主代码无记录' });
}
if (!drift.length) console.log('  （无漂移，805 全部 baseM 与主代码一致）');
for (const d of drift) {
  const known = KNOWN_DIFFS[d.n];
  if (known) {
    console.log(`  • ${d.n}: 805=${d.shopM}  主代码=${d.src}`);
    console.log(`      ↳ 已知差异(白名单)：${known}`);
  } else {
    console.log(`  ⚠ ${d.n}: 805=${d.shopM}  主代码=${d.src}`);
    console.log(`      → 建议改 805 HERO_META.baseM 对齐主代码`);
    newProblems.push(d.n);
  }
}

console.log('\n── C. 805 有、但主代码未注册的英雄（可能是商店设计性收录）──');
const extra805 = Object.keys(heroMeta).filter(n => !eliteNames.has(n));
if (!extra805.length) console.log('  （无）');
else for (const n of extra805) console.log(`  • ${n}  baseM=${heroMeta[n].baseM}`);

console.log('\n══════════════════════════════════════════════════════════════');
const problems = newProblems.length;
const knownCount = uncovered.filter(n => KNOWN_DIFFS[n]).length + drift.filter(d => KNOWN_DIFFS[d.n]).length;
console.log(problems === 0
  ? ` ✅ 无新漂移（已知差异 ${knownCount} 处，均为有意不单列/分档，白名单已记录）`
  : ` ⚠️ 发现 ${problems} 处新漂移需关注（见上 ⚠ 项；已知差异 ${knownCount} 处不计）`);
console.log('══════════════════════════════════════════════════════════════');
