#!/usr/bin/env node
// tools/check-manifest.mjs — 检查「AI 复制包清单」和磁盘实际文件对不对得上
//
// 背景：tools/106-ai-pack-config.js 里的 ALL_PROJECT_FILES 是发给 AI 的代码包的唯一来源。
// 每次新建/改名/移动文件，都得手动往里加。忘加了，包里那个文件就变成空的（显示「读取失败」）。
// 这个脚本自动对比「清单里写了啥」和「磁盘上真有啥」，用大白话告诉你哪里对不上。
//
// 用法：
//   node tools/check-manifest.mjs          正常跑（清单有断链就报错退出）
//   node tools/check-manifest.mjs --strict 严格模式（磁盘上有但清单没登记的新文件也报错）
//
// 退出码：发现「清单指向不存在的文件」→ 退出 1（可接 git 钩子卡住提交）；否则 0。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..'); // 仓库根目录（tools 的上一级）
const MANIFEST = path.join(__dirname, '106-ai-pack-config.js');

// 只扫这些引擎目录里的 .js/.mjs（用来发现「新文件没登记」）
const SCAN_DIRS = ['core', 'ui', 'render', 'modules', 'player', 'fx', 'infra', 'content'];
const SKIP_DIRS = new Set(['node_modules', '.workbuddy', 'output', '_archive', '_jobs', '_logs', '_bak_web', '_replaced', '_publish']);

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');

// ---------- 1. 从清单文件里抠出所有登记的文件路径 ----------
const src = fs.readFileSync(MANIFEST, 'utf8');
// 只取 ALL_PROJECT_FILES = [ ... ] 这一段
const m = src.match(/ALL_PROJECT_FILES\s*=\s*\[([\s\S]*?)\n\];/);
if (!m) {
  console.error('❌ 没在 106-ai-pack-config.js 里找到 ALL_PROJECT_FILES 数组，检查脚本需要更新。');
  process.exit(1);
}
const block = m[1];
// 抓所有 '...' 或 "..." 字符串（清单里的路径都是 ../xxx 形式）
const entries = [...block.matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1])
  .filter(p => p.startsWith('../'));

// 转成「仓库根目录相对路径」并去重
const toRepoRel = (p) => path.normalize(p.replace(/^\.\.\//, '')).replace(/\\/g, '/');
const manifestSet = new Set(entries.map(toRepoRel));
const manifestList = entries.map(toRepoRel);

// ---------- 2. 清单里写了、但磁盘上找不到的（= 断链，包会读失败） ----------
const missing = [];
const seen = new Set();
const dups = [];
for (const rel of manifestList) {
  if (seen.has(rel)) { dups.push(rel); continue; }
  seen.add(rel);
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) missing.push(rel);
}

// ---------- 3. 磁盘上有、但清单没登记的（= 新建文件可能忘加） ----------
const untracked = [];
function walk(dir) {
  let items;
  try { items = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const it of items) {
    if (it.isSymbolicLink()) continue;
    const full = path.join(dir, it.name);
    if (it.isDirectory()) {
      if (SKIP_DIRS.has(it.name)) continue;
      walk(full);
    } else if (/\.(js|mjs)$/.test(it.name)) {
      const rel = path.relative(ROOT, full).replace(/\\/g, '/');
      if (!manifestSet.has(rel)) untracked.push(rel);
    }
  }
}
for (const d of SCAN_DIRS) walk(path.join(ROOT, d));

// ---------- 4. 打印报告 ----------
const line = '─'.repeat(56);
console.log('\n' + line);
console.log('  AI 复制包清单检查（106-ai-pack-config.js ↔ 磁盘）');
console.log(line);
console.log(`  清单登记文件数：${manifestList.length}（去重后 ${manifestSet.size}）`);

let problem = false;

if (missing.length === 0 && dups.length === 0) {
  console.log('  ✅ 清单里的文件磁盘上都在，没有断链。');
} else {
  problem = true;
  if (missing.length) {
    console.log(`\n  ❌ 清单指向不存在的文件（改名/移动/删除后忘改清单 → 包里会「读取失败」），共 ${missing.length} 个：`);
    for (const f of missing) console.log('     • ' + f);
  }
  if (dups.length) {
    console.log(`\n  ⚠️ 清单里有重复登记，共 ${dups.length} 个：`);
    for (const f of dups) console.log('     • ' + f);
  }
}

if (untracked.length) {
  if (STRICT) problem = true;
  const tag = STRICT ? '❌' : '⚠️';
  console.log(`\n  ${tag} 磁盘上有但清单没登记的新文件（若被引用会断包），共 ${untracked.length} 个：`);
  for (const f of untracked) console.log('     • ' + f);
  if (!STRICT) console.log('     （加 --strict 可把这些也算作错误；若某文件本就不该进包，可忽略）');
}

console.log('\n' + line);
if (problem) {
  console.log('  🔴 检查未通过。先修上面的 ❌ 项，AI 包才不会再「读取失败」。');
  console.log(line + '\n');
  process.exit(1);
} else {
  console.log('  🟢 检查通过，清单和磁盘一致。');
  console.log(line + '\n');
  process.exit(0);
}
