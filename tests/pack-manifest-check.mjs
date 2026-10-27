// tests/pack-manifest-check.mjs | V1.0.0 | 2026-10-27 第143轮(续)：打包清单(106)完整性自检 + 自动补全
// 职责：自动帮「工具文件复制器」(tools/106-ai-pack-config.js 的 ALL_PROJECT_FILES 清单) 检测漏登并补上。
//   必打包集（遗漏 = 包内真问题）：
//     ① 全部 tests/health-rules/*.js —— rules-replay 走 readdir 自动加载，漏登 ⇒ 包内静默丢弃该规则、无报错无覆盖。
//     ② run-all.mjs 的 CHECKS/OBSERVES 里 `script:` 指向的 tests/* —— spawnSync 直跑，漏登 ⇒ 包内找不到文件即跳过/报错。
//   任何磁盘有、清单漏登的，自动补进 ALL_PROJECT_FILES 的 tests 段末尾，并抬版本号（头注释 + VER 常量）。
//   反向：清单条目指向磁盘不存在的文件 ⇒ 仅告警、不擅删（删除有风险，交人工）。
// 退出码：0 = 完整或已自动补全；1 = 只读环境写失败，或 --report-only 且有漏登。
// 幂等：补完后再次运行即 0 漏登（不重复写入）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VER = 'tests/pack-manifest-check.mjs V1.0.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const MANIFEST = path.join(repoRoot, 'tools/106-ai-pack-config.js');
const RUNALL = path.join(repoRoot, 'tests/run-all.mjs');
const HR_DIR = path.join(repoRoot, 'tests/health-rules');

const reportOnly = process.argv.includes('--report-only');

// ---- 1) 期望集 ----
const expected = new Set();

// ① health-rules 全量
for (const f of fs.readdirSync(HR_DIR)) {
  if (f.endsWith('.js')) expected.add(`../tests/health-rules/${f}`);
}

// ② run-all 引用的 tests 脚本
const runallText = fs.readFileSync(RUNALL, 'utf8');
const scripts = [...runallText.matchAll(/script:\s*'([^']+)'/g)].map((m) => m[1]);
for (const s of scripts) {
  if (s.startsWith('tests/')) expected.add(`../${s}`);
}

// ---- 2) 清单现有条目 ----
const manifestText = fs.readFileSync(MANIFEST, 'utf8');
const existing = new Set(
  [...manifestText.matchAll(/'\.\.\/([^']+)'/g)].map((m) => `../${m[1]}`)
);

// ---- 3) 漏登 / 陈旧 ----
const missing = [...expected].filter((e) => !existing.has(e)).sort();
const stale = [...existing]
  .filter((e) => {
    const fp = path.join(repoRoot, e.replace(/^\.\.\//, ''));
    return !fs.existsSync(fp);
  })
  .sort();

if (missing.length === 0 && stale.length === 0) {
  console.log('✅ 打包清单(106)完整：health-rules 全登记 + run-all 引用脚本全登记，无漏登/无陈旧');
  process.exit(0);
}

console.log(`体检·打包清单完整性自检：发现漏登 ${missing.length} 项、陈旧 ${stale.length} 项`);
for (const m of missing) console.log('  漏登: ' + m);
for (const s of stale) console.log('  陈旧: ' + s + '（磁盘无此文件，仅告警不删）');
if (stale.length) console.log('⚠️ 陈旧条目需人工清理，本次不动。');

if (reportOnly) {
  if (missing.length) console.log('（--report-only：未写入）');
  process.exit(missing.length ? 1 : 0);
}
if (missing.length === 0) {
  console.log('无漏登需补，跳过写入');
  process.exit(0);
}

// ---- 4) 自动补全：在 `// tools（开发工具箱）` 之前插入 ----
const today = new Date().toISOString().slice(0, 10);
const lines = manifestText.split('\n');
const insIdx = lines.findIndex((l) => l.includes('// tools（开发工具箱）'));
if (insIdx === -1) {
  console.error('❌ 找不到插入锚点（// tools（开发工具箱）），中止写入避免破坏清单');
  process.exit(1);
}
const addedLine = `    // ${today} 自动补全：以下 tests 顶层脚本被 run-all.mjs 的 CHECKS/OBSERVES 引用（spawnSync 直跑），漏登则包内套件找不到文件即跳过/报错`;
const perLine = 4;
const entryLines = [];
for (let i = 0; i < missing.length; i += perLine) {
  const chunk = missing
    .slice(i, i + perLine)
    .map((m) => `'${m}'`)
    .join(', ');
  entryLines.push('    ' + chunk + ',');
}
lines.splice(insIdx, 0, addedLine, ...entryLines);

// ---- 5) 抬版本号（头注释 + VER 常量，patch +1，动态解析当前版本避免写死）----
let out = lines.join('\n');
const verMatch = out.match(/tools\/106-ai-pack-config\.js V(\d+\.\d+\.\d+)/);
const cur = verMatch ? verMatch[1] : '6.0.40';
const parts = cur.split('.').map(Number);
parts[2] += 1;
const next = parts.join('.');
out = out.replace(
  new RegExp('// V' + cur.replace(/\./g, '\\.') + ' '),
  `// V${next} | ${today} 自动补全 ${missing.length} 项 run-all 引用但漏登的 tests 顶层脚本 `
);
out = out.replace(
  "export const VER = 'tools/106-ai-pack-config.js V" + cur + "';",
  "export const VER = 'tools/106-ai-pack-config.js V" + next + "';"
);

try {
  fs.writeFileSync(MANIFEST, out, 'utf8');
} catch (e) {
  console.error('❌ 写入 106 失败（只读？）：' + e.message);
  process.exit(1);
}

// ---- 6) 自证：重写后确实都登记了 ----
const after = fs.readFileSync(MANIFEST, 'utf8');
const afterSet = new Set(
  [...after.matchAll(/'\.\.\/([^']+)'/g)].map((m) => `../${m[1]}`)
);
const stillMissing = missing.filter((m) => !afterSet.has(m));
if (stillMissing.length) {
  console.error('❌ 自动补全后仍有漏登（写入异常）：' + stillMissing.join(', '));
  process.exit(1);
}
console.log(
  `✅ 已自动补全 ${missing.length} 项进入 tools/106-ai-pack-config.js（V6.0.40→V6.0.41），请提交。`
);
process.exit(0);
