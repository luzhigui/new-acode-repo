// tests/manifest-fresh-selftest.mjs — 清单新鲜度自检（整套预装的兜底规则）
// 防两件事：① 改了代码忘跑 tools/830-manifest-gen.mjs（指纹对不上）
//          ② 仓库新增/删了代码文件但清单没更新（清单外有漏网文件）
// 用法：node tests/manifest-fresh-selftest.mjs   （退出码 0=绿 1=红）
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { collectFiles, hashFiles } from '../tools/830-manifest-gen.mjs';

const ROOT = join(import.meta.dirname, '..');
const problems = [];

let manifest;
try {
    manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
} catch (_) {
    console.error('manifest-fresh ✗ manifest.json 不存在或不是合法 JSON —— 跑一次 node tools/830-manifest-gen.mjs');
    process.exit(1);
}
if (!manifest.ver || !Array.isArray(manifest.files)) {
    console.error('manifest-fresh ✗ manifest.json 缺 ver/files 字段');
    process.exit(1);
}

// ① 指纹逐个对照（归一换行后哈希，与 830/sw.js 口径一致）
const actual = new Map(hashFiles(collectFiles()));
const listed = new Map(manifest.files);
for (const [p, h] of actual) {
    if (!listed.has(p)) problems.push(`漏登记：${p}（仓库有、清单无）`);
    else if (listed.get(p) !== h) problems.push(`指纹过期：${p}（改了没重跑 830）`);
}
for (const p of listed.keys()) {
    if (!actual.has(p)) problems.push(`已失效：${p}（清单有、仓库已删）`);
}

// ② ver 与清单内容自洽
const ver = createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex');
if (ver !== manifest.ver) problems.push(`ver 不自洽（应为 ${ver.slice(0, 8)}，实为 ${manifest.ver.slice(0, 8)}）`);

if (problems.length) {
    for (const p of problems) console.error('manifest-fresh ✗ ' + p);
    console.error(`manifest-fresh ✗ 共 ${problems.length} 处 —— 修复后重跑 node tools/830-manifest-gen.mjs`);
    process.exit(1);
}
console.log(`manifest-fresh ✓ ${actual.size} 个文件指纹全部相符 · ver ${manifest.ver.slice(0, 8)}`);
