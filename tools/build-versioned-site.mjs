#!/usr/bin/env node
// tools/build-versioned-site.mjs — 构建带版本号的部署副本（零依赖，只用 node:fs）
// 目的：GitHub Pages 固定 10 分钟缓存；给所有 JS import / HTML script src / new URL 字面量
//   加 ?v=<sha>，使每笔推送全站刷新。源码一个字不动，只写 _site/ 副本。
// 用法：BUILD_V=<版本号> node tools/build-versioned-site.mjs
// 口径（2026-10-28 老板拍板上指纹方案，参照外部 AI 稿修订）：
//   ① 版本化：相对 import（含 export from / 裸 import / 动态 import()）、HTML script src、
//      new URL('....js|.json', import.meta.url) 字面量（覆盖 01config 游戏数据 + 117 worker 地址——
//      worker 地址不版本化，仪表盘会吃 10 分钟旧 worker）。
//   ② 不版本化：音频/图片/CSS（装饰性过期可容忍；全量 sha 化会让每次推送重下全部资源，BGM 太贵）。
//   ③ index.html 手工维护的 ?v=3.5.0 会被本脚本统一替换成 <sha>，手工版本号仪式同步退休。

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, '_site');
const VER = (process.env.BUILD_V || '').trim().slice(0, 8);
if (!VER) { console.error('[build] 缺 BUILD_V 环境变量'); process.exit(1); }

const SKIP_DIRS = new Set(['.git', '.github', 'node_modules', '_site']);
const TEXT_EXT = new Set(['.js', '.mjs', '.html', '.htm']);
const stats = { files: 0, js: 0, html: 0, imports: 0, scripts: 0, urls: 0 };

function joinVersion(spec) {
    const m = spec.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
    if (!m) return spec;
    const [, p, q, h] = m;
    const params = new URLSearchParams(q ? q.slice(1) : '');
    params.set('v', VER);
    return p + '?' + params.toString() + (h || '');
}

function rewriteJS(src) {
    let n = 0;
    // import ... from './x.js' / export ... from './x.js'——pre 段允许跨行（仓库多行 import 块很常见），
    //   靠 [^'"] 在首个引号处自然截断，不会跨语句误吞
    src = src.replace(/(\b(?:import|export)\b[^'"]*?\bfrom\s*)(['"])(\.{1,2}\/[^'"\n]*?)\2/g,
        (all, pre, q, spec) => { n++; return pre + q + joinVersion(spec) + q; });
    // 裸副作用 import './x.js'
    src = src.replace(/(\bimport\s*)(['"])(\.{1,2}\/[^'"\n]*?)\2/g,
        (all, pre, q, spec) => { n++; return pre + q + joinVersion(spec) + q; });
    // 动态 import('./x.js')
    src = src.replace(/(\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"\n]*?)\2/g,
        (all, pre, q, spec) => { n++; return pre + q + joinVersion(spec) + q; });
    // new URL('....js|.json', import.meta.url) 字面量（01config 游戏数据 / 117 worker 地址等）
    src = src.replace(/(new URL\(\s*)(['"])(\.{1,2}\/[^'"]*?\.(?:js|json))\2(\s*,\s*import\.meta\.url\s*\))/g,
        (all, pre, q, spec, post) => { n++; return pre + q + joinVersion(spec) + q + post; });
    stats.imports += n;
    return src;
}

function rewriteHTML(src) {
    let n = 0;
    // .js 后可带旧查询串（index.html 现存 ?v=3.5.0 手工版本号）——joinVersion 统一替换成 <sha>
    src = src.replace(/(<script\b[^>]*\bsrc\s*=\s*)(['"])(\.{1,2}\/[^'"]*?\.js(?:\?[^'"]*)?(?:#[^'"]*)?)\2/g,
        (all, pre, q, spec) => { n++; return pre + q + joinVersion(spec) + q; });
    stats.scripts += n;
    return src;
}

function walk(dir, cb) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(ent.name)) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full, cb);
        else cb(full);
    }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

walk(ROOT, (src) => {
    const rel = path.relative(ROOT, src);
    if (!rel || rel.startsWith('_site')) return;
    const dst = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const ext = path.extname(src).toLowerCase();
    stats.files++;
    if (TEXT_EXT.has(ext)) {
        let s = fs.readFileSync(src, 'utf8');
        if (ext === '.js' || ext === '.mjs') { s = rewriteJS(s); stats.js++; }
        else { s = rewriteHTML(s); stats.html++; }
        fs.writeFileSync(dst, s);
    } else {
        fs.copyFileSync(src, dst);
    }
});

console.log(`[build] v=${VER} files=${stats.files} js=${stats.js} html=${stats.html} imports=${stats.imports} scripts=${stats.scripts}`);
console.log(`[build] 输出：${OUT}`);
