// V1.1.0 | 2026-11-11 白天迭代：修取样面被注释污染。
//   实证：清单 806 第 23 行注释里写「只认 '../ 前缀，不受影响）」，旧正则 /'\.\.\/([^']+)'/g
//   的 [^'] 允许跨行，把注释里的半个引号一路吞到下一个真条目的引号，造出一条含整段注释的
//   假路径 ⇒ 「陈旧 1 项」长期假红；更险的是 run-all 侧同样全文抠 script:，注释里写个假脚本名
//   会被当成期望集，进而被「自动补全」真写进 806（不是只报错）。
//   修法：两处取样都先剥注释（用公共件 stripComments，不抄第二份），且条目正则禁止跨行；
//   第 6 步「写入后复查」也走同一个抽取器，避免两处口径分叉。
//   ★ 必打包集、漏登/陈旧判据、自动补全写入逻辑一字未动；只改「从哪读」。
// tests/pack-manifest-check.mjs | V1.0.0 | 2026-10-27 第143轮(续)：打包清单(106)完整性自检 + 自动补全
// 职责：自动帮「工具文件复制器」(tools/806-ai-pack-config.js 的 ALL_PROJECT_FILES 清单) 检测漏登并补上。
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
import { stripComments } from './_lib/static-truth-slice.mjs';

export const VER = 'tests/pack-manifest-check.mjs V1.1.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const MANIFEST = path.join(repoRoot, 'tools/806-ai-pack-config.js');
const RUNALL = path.join(repoRoot, 'tests/run-all.mjs');
const HR_DIR = path.join(repoRoot, 'tests/health-rules');

const reportOnly = process.argv.includes('--report-only');

/** 清单条目抽取：只认剥注释后的真代码，且单引号内容不许跨行（防注释残片吞掉几十行）。 */
function extractExisting(text) {
  const code = stripComments(String(text || ''));
  return [...new Set(
    [...code.matchAll(/'\.\.\/([^'\r\n]+)'/g)].map((m) => `../${m[1]}`)
  )];
}

/** run-all 清单脚本抽取：同取样面，注释里的 `script: 'tests/fake.mjs'` 不算条目。 */
function extractScripts(text) {
  const code = stripComments(String(text || ''));
  return [...code.matchAll(/script:\s*'([^'\r\n]+)'/g)].map((m) => m[1]);
}

/** V1.1.0 纯内存自证：正路径保真条目、负路径挡住两类注释污染、边界不抛异常。 */
function selfTestSamples() {
  const fails = [];
  const manifest = [
    "    '../tests/a.mjs', '../tests/b.mjs',",
    "    // 说明：本检查只认 '../ 前缀，不受影响）。",
    "    //   script: 'tests/fake-from-comment.mjs'",
    "    '../tests/c.mjs',",
    "    '../tests/gone.js',   // 磁盘已删，属真陈旧，必须仍能抽到"
  ].join('\n');
  const runall = [
    "// script: 'tests/fake-from-comment.mjs'",
    "{ name: '真守门', script: 'tests/real.mjs', args: [] },"
  ].join('\n');
  const got = extractExisting(manifest);
  const want = ['../tests/a.mjs', '../tests/b.mjs', '../tests/c.mjs', '../tests/gone.js'];
  for (const w of want) if (!got.includes(w)) fails.push('正路径：真条目 ' + w + ' 没抽到 ⇒ 取样面塌陷');
  if (got.length !== want.length) fails.push('正路径：抽出 ' + got.length + ' 条，应恰好 ' + want.length + ' 条 —— 注释残片仍被当条目');
  if (got.some((x) => /[\r\n]|[\u4e00-\u9fff]/.test(x))) fails.push('负路径 A：抽出的条目含换行或中文 ⇒ 跨行吞注释的老毛病复发');
  const scripts = extractScripts(runall);
  if (scripts.length !== 1 || scripts[0] !== 'tests/real.mjs') {
    fails.push('负路径 B：注释里的假 script 被当成期望集 ⇒ 自动补全可能把假脚本写进 806');
  }
  if (extractExisting('').length || extractScripts('').length) fails.push('边界：空文本竟抽出条目');
  // 反向证明：若退回未剥注释的旧正则，上述样本必然产出假条目（防后人把剥注释删掉）
  const legacy = [...manifest.matchAll(/'\.\.\/([^']+)'/g)].map((m) => `../${m[1]}`);
  if (!legacy.some((x) => /[\r\n]/.test(x))) fails.push('负路径 C：旧跨行正则在合成样本上没造出假条目 ⇒ 本自证失去意义');
  return fails;
}

// ★ 每次跑都先自证（纯内存、零 IO）：取样面一旦回潮，后面的漏登/陈旧结论全是假的。
//   --self-test 只是「只跑自证并早退」的开关，不是自证生效的前提。
const sampleFails = selfTestSamples();
if (sampleFails.length) {
  console.log('❌ 打包清单取样面自证失败 ' + sampleFails.length + ' 处（结论不可信，已中止）：');
  for (const f of sampleFails) console.log('  · ' + f);
  process.exit(1);
}
if (process.argv.includes('--self-test')) {
  console.log('✅ 打包清单取样面自证 6 条全过（真条目保留 / 跨行假路径挡住 / 注释假脚本挡住 / 空边界 / 旧口径反证）');
  process.exit(0);
}

// ---- 1) 期望集 ----
const expected = new Set();

// ① health-rules 全量
for (const f of fs.readdirSync(HR_DIR)) {
  if (f.endsWith('.js')) expected.add(`../tests/health-rules/${f}`);
}

// ② run-all 引用的 tests 脚本
const runallText = fs.readFileSync(RUNALL, 'utf8');
const scripts = extractScripts(runallText);
for (const s of scripts) {
  if (s.startsWith('tests/')) expected.add(`../${s}`);
}

// ---- 2) 清单现有条目 ----
const manifestText = fs.readFileSync(MANIFEST, 'utf8');
const existing = new Set(extractExisting(manifestText));

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
  "export const VER = 'tools/806-ai-pack-config.js V" + cur + "';",
  "export const VER = 'tools/806-ai-pack-config.js V" + next + "';"
);

try {
  fs.writeFileSync(MANIFEST, out, 'utf8');
} catch (e) {
  console.error('❌ 写入 106 失败（只读？）：' + e.message);
  process.exit(1);
}

// ---- 6) 自证：重写后确实都登记了 ----
const after = fs.readFileSync(MANIFEST, 'utf8');
const afterSet = new Set(extractExisting(after));
const stillMissing = missing.filter((m) => !afterSet.has(m));
if (stillMissing.length) {
  console.error('❌ 自动补全后仍有漏登（写入异常）：' + stillMissing.join(', '));
  process.exit(1);
}
console.log(
  `✅ 已自动补全 ${missing.length} 项进入 tools/806-ai-pack-config.js（V6.0.40→V6.0.41），请提交。`
);
process.exit(0);
