// tests/semantic-stale-ref-scan.mjs | V1.0.0 | 2026-11-18 #36 语义陈旧引用扫描
// 目的：扫「路径活但指错目标」——同一层/编号在历史上被让过号（目前仅 infra/107↔112），
// 核对引用文件里 import 的是不是同号的那个文件；指错即点名（不判红，先只报）。
// 纯 tests/，不碰主代码。
export const VER = 'tests/semantic-stale-ref-scan.mjs V1.0.0';

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// 历史上「同层/同号被让号」的键：目前仅 infra/107 → 112（store-schema 让号）
export const REASSIGNED = [
    { layer: 'infra', oldNum: 107, newNum: 112, oldName: 'fact-contract', newName: 'store-schema' }
];

const DIRS = ['core', 'infra', 'modules', 'player', 'render', 'ui', 'fx'];
const IMPORT_RE = /import\s+[^'"]*from\s+['"](\.\.?\/)+([a-z]+)\/(\d{1,3})-([a-z0-9-]+)\.js['"]/g;
const COMMENT_RE = /(?<![A-Za-z0-9_])(core|infra|modules|player|render|ui|fx)\/(\d{1,3})(?!\d)/g;

function getLine(src, offset) {
    let line = 1;
    for (let i = 0; i < offset; i++) if (src[i] === '\n') line++;
    return line;
}

/**
 * 扫描给定根目录，返回疑似指错目标的引用列表（纯函数，供自证复用）。
 * @param {string} rootDir
 * @param {Array} reassigned
 * @returns {Array<{file:string,type:string,ref:string,expected:string,line:number}>}
 */
export function scanSemanticRefs(rootDir, reassigned = REASSIGNED) {
    const findings = [];
    for (const d of DIRS) {
        const dirPath = path.join(rootDir, d);
        let files;
        try { files = readdirSync(dirPath); } catch { continue; }
        for (const f of files) {
            if (!f.endsWith('.js')) continue;
            const rel = `${d}/${f}`;
            const src = readFileSync(path.join(dirPath, f), 'utf8');

            // 1) import 语句：精确拿到 layer/num/name
            IMPORT_RE.lastIndex = 0;
            let m;
            while ((m = IMPORT_RE.exec(src)) !== null) {
                const [_full, _relPath, layer, numStr, name] = m;
                const num = Number(numStr);
                for (const r of reassigned) {
                    if (layer === r.layer && num === r.oldNum && name !== r.oldName) {
                        findings.push({ file: rel, type: 'import', ref: `${layer}/${num}-${name}`, expected: `${r.layer}/${r.newNum}-${r.newName}`, line: getLine(src, m.index) });
                    }
                }
            }

            // 2) 注释/文本引用：同文件内有新号 import ⇒ 疑似指错旧号
            COMMENT_RE.lastIndex = 0;
            while ((m = COMMENT_RE.exec(src)) !== null) {
                const layer = m[1];
                const num = Number(m[2]);
                for (const r of reassigned) {
                    if (layer === r.layer && num === r.oldNum) {
                        const hasNewImport = src.includes(`${r.layer}/${r.newNum}-${r.newName}`);
                        if (hasNewImport) {
                            findings.push({ file: rel, type: 'comment', ref: `${layer}/${num}`, expected: `${r.layer}/${r.newNum}-${r.newName}`, line: getLine(src, m.index) });
                        }
                    }
                }
            }
        }
    }
    return findings;
}

// ── 自证（不改主代码、不碰磁盘基线）─────────────────────────────────────────
export function runSelfTest() {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = globalThis.__node_fs || {};
    // 用动态 import 避免顶层副作用问题
    return import('node:fs').then(({ mkdtempSync, mkdirSync, writeFileSync, rmSync }) => {
        return import('node:os').then(({ tmpdir }) => {
            const tmp = mkdtempSync(path.join(tmpdir(), 'sem-ref-'));
            const fails = [];
            const ok = (cond, desc) => { if (!cond) fails.push(desc); };
            try {
                for (const d of DIRS) mkdirSync(path.join(tmp, d), { recursive: true });
                // ① 正向：无旧号引用 ⇒ 绿
                writeFileSync(path.join(tmp, 'ui', '701-clean.js'), `import x from '../infra/112-store-schema.js';\n// use infra/112\n`);
                ok(scanSemanticRefs(tmp).length === 0, '① 无旧号引用应无命中');

                // ② 反向：同文件 import 新号但注释仍写旧号 ⇒ 命中
                writeFileSync(path.join(tmp, 'ui', '702-bad.js'), `import x from '../infra/112-store-schema.js';\n// 这里本意是 infra/107-store-schema\n`);
                const hits = scanSemanticRefs(tmp);
                ok(hits.some(h => h.file === 'ui/702-bad.js' && h.type === 'comment'), '② 同文件新号 import + 旧号注释应命中');

                // ③ 反向：import 旧号但 name 不是 fact-contract ⇒ 命中
                writeFileSync(path.join(tmp, 'ui', '703-bad-import.js'), `import x from '../infra/107-store-schema.js';\n`);
                const hits3 = scanSemanticRefs(tmp);
                ok(hits3.some(h => h.file === 'ui/703-bad-import.js' && h.type === 'import'), '③ import 旧号错名应命中');

                // ④ 正向：import 正确的旧号名(fact-contract) ⇒ 不误报
                writeFileSync(path.join(tmp, 'ui', '704-ok.js'), `import { FACT_SPECS } from '../infra/107-fact-contract.js';\n`);
                const hits4 = scanSemanticRefs(tmp);
                ok(!hits4.some(h => h.file === 'ui/704-ok.js'), '④ 正确引用 infra/107-fact-contract 不误报');
            } finally {
                try { rmSync(tmp, { recursive: true, force: true }); } catch {}
            }
            if (fails.length) {
                console.error('❌ 语义陈旧引用扫描自证失败：\n  ' + fails.join('\n  '));
                return { total: 4, fails };
            }
            console.log('✅ 语义陈旧引用扫描自证 4/4（正向不误报/反向命中注释/反向命中错名import/正确旧号放行）');
            return { total: 4, fails };
        });
    });
}

async function main() {
    if (process.argv.includes('--selftest')) {
        const { total, fails } = await runSelfTest();
        process.exit(fails.length ? 1 : 0);
    }
    const findings = scanSemanticRefs(root);
    if (findings.length === 0) {
        console.log('✅ 语义陈旧引用扫描：未发现指错目标的引用');
    } else {
        console.log(`⚠️ 语义陈旧引用扫描：发现 ${findings.length} 处疑似指错目标的引用（仅报告，不判红）`);
        for (const f of findings) {
            console.log(`  ${f.file}:${f.line} [${f.type}] ${f.ref} → 可能意指 ${f.expected}`);
        }
    }
    process.exit(0); // 不判红，只报
}

// 直接运行时执行
const isDirect = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirect) {
    main().catch(e => { console.error(e); process.exit(1); });
}
