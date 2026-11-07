// tools/828-verify-registry.mjs — 工具数据护栏：比对「主代码精英池/数值」与「工具名单/HERO_META」
// 目的：主代码加新精英、改 m 值、改出场方式时，工具侧(827/805)能立刻发现漂移，避免人工同步漏掉。
// 用法：node tools/828-verify-registry.mjs   （纯只读，不写任何文件）
//
// 数据维度核查项：
//   1) 主代码 registerElite 名单  vs  827 注册表覆盖名单 → 列出"主代码有、工具未覆盖"的精英
//   2) 主代码 characters 派生池（CONFIG.MING_M / ENEMY_M / ELITE_CONFIGS）/encounters 的 m 值  vs  805 HERO_META.baseM → 列出数值漂移
//   3) 主代码精英的"出场方式"粗判（明教自然/六大派敌方变体/朝廷/carry召唤），标注工具是否有对应评测通道

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

// ---- 1. 主代码真实精英名单 (registerElite) ----
const modulesDir = path.join(ROOT, 'modules');
const eliteNames = new Set();
for (const f of fs.readdirSync(modulesDir)) {
  if (!/^\d{3}-.*\.js$/.test(f)) continue;
  const txt = read(`modules/${f}`);
  for (const m of txt.matchAll(/registerElite\(\s*'([^']+)'/g)) eliteNames.add(m[1]);
}

// ---- 2. 主代码 m 值权威源（生产读取路径：characters 派生，roster 旧表已删）----
const game = JSON.parse(read('content/001-game-data.json'));
const mingM = CONFIG.MING_M;
const enemyM = CONFIG.ENEMY_M;
const eliteConfigs = CONFIG.ELITE_CONFIGS;
// 读不到即失败：池被删/改名会在这里炸，绝不允许「空集 vs 空集」假绿
for (const [label, v] of [['MING_M', mingM], ['ENEMY_M', enemyM], ['ELITE_CONFIGS', eliteConfigs]]) {
  if (!v || Object.keys(v).length === 0) throw new Error(`生产池 ${label} 读不到（core/201 getHeroPools 无输出）——828 拒绝空集通过`);
}
const mSrc = {}; // name -> [where:m]
const addM = (name, m, where) => { if (name && m != null) (mSrc[name] = mSrc[name] || []).push(`${where}:${m}`); };
// 折叠 A 段「主代码m=」的重复来源：按 [来源, 值] 计数，同来源同值只留一个并标 ×N。
// 例：enemyM:107/enc:107×5  —— 值和来源都保留，重复次数一眼可见。
// 只影响显示，不参与任何判据（B 段比较走的是自己的 ms，不经过这里）。
const fmtM = (arr = []) => {
  if (!arr.length) return '?';
  const counts = new Map();
  for (const s of arr) {
    const i = s.lastIndexOf(':');
    const key = `${s.slice(0, i)}:${s.slice(i + 1)}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts].map(([key, n]) => {
    if (n === 1) return key;
    const i = key.lastIndexOf(':');
    return `${key.slice(0, i)}:${key.slice(i + 1)}×${n}`;
  }).join('/');
};
for (const [k, v] of Object.entries(mingM)) addM(k, v, 'MING_M');
for (const [k, v] of Object.entries(enemyM)) addM(k, v, 'ENEMY_M');
for (const e of eliteConfigs) addM(e.name, e.m, 'ELITE_CONFIGS');
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
  if (eliteConfigs.some(e => e.name === name)) return '明教自然核心';
  if (enemyM[name] != null) return '六大派/朝廷(敌方阵容)';
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
    console.log(`  • ${n}  [${whereFrom(n)}]  主代码m=${fmtM(ms)}  ${sameAs805}`);
    console.log(`      ↳ 已知差异(白名单)：${known}`);
  } else {
    console.log(`  ⚠ ${n}  [${whereFrom(n)}]  主代码m=${fmtM(ms)}  ${sameAs805}`);
    console.log(`      → 建议补进 827 对应名单（NATURAL / SOLO / WEAK / BOSS）`);
    newProblems.push(n);
  }
}

console.log('\n── B. 805 HERO_META 数值漂移（vs 主代码 m 权威源）──');
const drift = [];
for (const [n, v] of Object.entries(heroMeta)) {
  const norm = n.replace(/·[一-龥]+$/, '');            // 归一化：小昭·姊/妹 → 小昭，对齐 characters 的键
  const ms = [...new Set((mSrc[norm] || mSrc[n] || []).map(s => Number(s.split(':')[1])))];
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
process.exit(problems === 0 ? 0 : 1);
