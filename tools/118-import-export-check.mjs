// tools/118-import-export-check.mjs — 静态对账：每个 import { 名字 } 的具名绑定，目标文件是否真的导出
// 背景：目标没导出该名字时，浏览器在模块加载期抛 SyntaxError、整个模块不执行（硬挂，非静默失效）。
//       2026-09-22 fx/89 从 87 取 showMeditateEffect 未导出，导致所有走信号的特效全灭——本脚本专治此类事故。
// 分工：tests/123static-scan.js 查「import 路径是否存在 / 是否漏 import」；本脚本查「目标是否导出该名字」，互补不重复。
// 优势：readdirSync 自动遍历，不依赖任何手工清单（123 的 SCAN_FILES 需人工登记，新增文件易漏）。
// 用法：node tools/118-import-export-check.mjs [仓库根目录]   （省略参数默认取本文件上一级）
// 退出码：0 = 全部通过；1 = 存在问题
// V1.0.0 | ~3700 bytes | 2026-09-22 由临时检查器收编进工具箱：补 export const VER、默认根目录与退出码
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VER = 'tools/118-import-export-check.mjs V1.0.0';

const ROOT = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['core', 'fx', 'player', 'render', 'modules', 'infra', 'ui'];

const files = [];
function walk(d) {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d)) {
        const p = join(d, e);
        const st = statSync(p);
        if (st.isDirectory()) walk(p);
        else if (e.endsWith('.js')) files.push(p);
    }
}
DIRS.forEach(d => walk(join(ROOT, d)));

const cache = new Map();
function exportsOf(file) {
    if (cache.has(file)) return cache.get(file);
    const t = readFileSync(file, 'utf8');
    const names = new Set();
    // 覆盖：export function / export function* / export const|let|var|class / export async function
    for (const m of t.matchAll(/export\s+(?:async\s+)?(?:function\s*\*?\s*|const\s+|let\s+|var\s+|class\s+)([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    // 覆盖：export { A, B as C }
    for (const m of t.matchAll(/export\s*\{([^}]*)\}/g)) {
        for (const part of m[1].split(',')) {
            const s = part.trim();
            if (!s) continue;
            const as = s.split(/\s+as\s+/);
            const out = (as[1] || as[0]).trim();
            if (out && out !== 'default') names.add(out);
        }
    }
    // export * 的目标跳过严格检查（导出面无法静态穷举，避免误报）
    const star = /export\s+\*/.test(t);
    const r = { names, star };
    cache.set(file, r);
    return r;
}

let bad = 0, checked = 0;
for (const f of files) {
    const t = readFileSync(f, 'utf8');
    for (const m of t.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
        const spec = m[2];
        const target = resolve(dirname(f), spec);
        if (!existsSync(target)) { console.log(`[缺文件] ${relative(ROOT, f)}  ->  ${spec}`); bad++; continue; }
        const { names, star } = exportsOf(target);
        if (star) continue;
        for (const part of m[1].split(',')) {
            const s = part.trim();
            if (!s) continue;
            const src = s.split(/\s+as\s+/)[0].trim();
            checked++;
            if (!names.has(src)) {
                console.log(`[未导出] ${relative(ROOT, f)}\n         从 ${spec} 取 '${src}'，但目标没导出`);
                bad++;
            }
        }
    }
}
console.log(`\n检查 ${files.length} 个文件 / ${checked} 个具名导入 ｜ 问题 ${bad} 处`);
process.exitCode = bad ? 1 : 0;
