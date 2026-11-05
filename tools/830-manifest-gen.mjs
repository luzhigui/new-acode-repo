// tools/830-manifest-gen.mjs — 生成 manifest.json（整套预装清单 + SHA-256 指纹）
// 用法：node tools/830-manifest-gen.mjs   （改完代码、推送前跑一次；漏跑会有 selftest 报）
// 范围：根目录散件 + core/modules/player/ui/fx/render/infra/content 下的 html/js/mjs/json/css
// 排除：sw.js（自身走 SW 更新机制）、manifest.json（每次 no-store 直拉）、dev-index.html（开发页），
//       以及运行时永远用不到的仓库/构建元数据（package*、capacitor、eslint 配置、根目录 debug 草稿）——
//       进了清单只会白占账本 + 改一下就白掀一次版本号
// 指纹口径：文本按 \r\n→\n 归一后哈希，与 sw.js 校验端一致，本地/远端换行差异不影响
// 2026-11-06 补 content/ 目录：001/002 游戏数据是运行时必拉文件，漏了它「离线可玩」是假的
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join(import.meta.dirname, '..');
const DIRS = ['core', 'modules', 'player', 'ui', 'fx', 'render', 'infra', 'content'];
const EXT = /\.(?:html?|js|mjs|json|css)$/i;
const SKIP = new Set([
    'sw.js', 'manifest.json', 'dev-index.html',
    'package.json', 'package-lock.json', 'capacitor.config.json', 'eslint.config.mjs',
    'debug2.mjs', 'debug_mc.mjs', '_probe134.mjs',
]);

export function collectFiles() {
    const out = [];
    for (const f of readdirSync(ROOT)) {
        const st = statSync(join(ROOT, f));
        if (st.isFile() && EXT.test(f) && !SKIP.has(f)) out.push(f);
    }
    for (const d of DIRS) {
        const dp = join(ROOT, d);
        if (!existsSync(dp)) continue;
        (function walk(p) {
            for (const f of readdirSync(p)) {
                const fp = join(p, f);
                const st = statSync(fp);
                if (st.isDirectory()) walk(fp);
                else if (EXT.test(f)) out.push(relative(ROOT, fp).split(sep).join('/'));
            }
        })(dp);
    }
    return out.sort();
}

export function hashFiles(paths) {
    return paths.map(p => [p,
        createHash('sha256').update(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')).digest('hex')]);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
    const files = hashFiles(collectFiles());
    const ver = createHash('sha256').update(JSON.stringify(files)).digest('hex');
    writeFileSync(join(ROOT, 'manifest.json'),
        JSON.stringify({ ver, gen: 'tools/830-manifest-gen.mjs', count: files.length, files }, null, 1));
    console.log(`manifest.json ✓ ${files.length} 个文件 · ver ${ver.slice(0, 8)}`);
}
