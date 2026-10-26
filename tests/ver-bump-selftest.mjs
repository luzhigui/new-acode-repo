// tests/ver-bump-selftest.mjs — 版本号遗忘抬升绊线（第140轮）
// V1.0.0 | ~6200 bytes | 2026-10-26
// 捕获「头注释写了 Vx 但 export const VER 还停在 Vy」的漏改（夜检 135 立线前已复发 ≥3 次）。
//   本轮初扫出 tests/ 下 16 处头/常量漂移（含上一轮自分的三处）；此线落地后，任何文件只抬一头都会退码 1。
//
// 机制：扫描 tests/ 下所有 .mjs / .js，对每个文件：
//   ① 头部版本：取前 40 行里首个形如 V\d+.\d+.\d+ 的标记（兼容版本号不在第 1 行的写法）
//   ② 常量版本：源码里 `const VER = '...Vx.y.z...'`（导出或局部均可）
//   若两者都存在且版本不一致 → 红（遗忘抬升）；若 VER 常量里根本没版本号 → 红（彻底漏标）。
//   只校验「声明了就一致」：仅一端有版本信息的文件跳过（不误报）。
//   白名单：140-baseline.js —— 其 VER 常量会写入 baselines/baseline-v1.json 的 version 字段（与入库基线耦合），
//           用户挂 hold 待拍板，暂不强制对齐，仅作豁免提示。
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VER = 'tests/ver-bump-selftest.mjs V1.0.0';
const here = dirname(fileURLToPath(import.meta.url));
const testDir = here;

// 140-baseline.js：VER 耦合入库基线 JSON，用户挂 hold 待拍板，豁免
const EXEMPT = new Set(['140-baseline.js']);

function headerVersion(src) {
    const lines = src.split('\n').slice(0, 40);
    for (const ln of lines) {
        const m = /(?:^|\s)V(\d+\.\d+\.\d+)/.exec(ln);
        if (m) return m[1];
    }
    return null;
}
function verConstVersion(src) {
    const m = src.match(/export\s+const\s+VER\s*=\s*['"]([^'"]*)['"]/)
        || src.match(/const\s+VER\s*=\s*['"]([^'"]*)['"]/);
    if (!m) return { raw: null, ver: null };
    const raw = m[1];
    const v = /V(\d+\.\d+\.\d+)/.exec(raw);
    return { raw, ver: v ? v[1] : null };
}

function main() {
    const files = readdirSync(testDir)
        .filter(f => f.endsWith('.mjs') || f.endsWith('.js'))
        .sort();
    const fail = [], warn = [], exempt = [];
    for (const f of files) {
        const src = readFileSync(join(testDir, f), 'utf8');
        const hv = headerVersion(src);
        const { raw: verRaw, ver: verV } = verConstVersion(src);
        if (EXEMPT.has(f)) { exempt.push(f); continue; }
        if (hv && verV) {
            if (hv !== verV) fail.push(`${f}: 头 V${hv} ≠ VER V${verV}（遗忘抬升）`);
        } else if (verRaw && !verV) {
            fail.push(`${f}: VER 常量无版本号（"${verRaw}"）`);
        } else if (hv && !verRaw) {
            warn.push(`${f}: 头 V${hv} 但无 VER 常量（跳过）`);
        } else if (verRaw && !hv) {
            warn.push(`${f}: 有 VER V${verV} 但头部无版本注释（跳过）`);
        }
    }
    console.log('=== 版本号遗忘抬升绊线 ' + VER + ' ===');
    console.log(`扫描 ${files.length} 个文件；豁免 ${exempt.length} 个（${exempt.join('、') || '无'}）`);
    for (const w of warn) console.log('  ~ ' + w);
    if (exempt.length) console.log('  ⊘ 豁免（hold）：' + exempt.join('、'));
    if (!fail.length) {
        console.log('  ✅ 全部声明版本一致，无遗忘抬升');
        return 0;
    }
    console.log(`\n⛔ 版本号漂移 ${fail.length} 处（头注释与 VER 常量对不上）：`);
    for (const x of fail) console.log('  ⚠ ' + x);
    return 1;
}
try { process.exit(main() || 0); } catch (e) { console.error(e); process.exit(1); }
