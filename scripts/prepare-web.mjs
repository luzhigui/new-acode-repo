// prepare-web.mjs — 把游戏文件复制到 web/ 目录，供 Capacitor 打包
// 入口 index.html（游戏本体）复制为 web/index.html（Capacitor 固定加载 index.html）
// 开发集成入口 dev-index.html 原样复制，仅供开发调试访问
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// 脚本在 scripts/ 下，仓库根 = scripts 的上一级
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = join(root, 'web');

// 需要打进 APK 的目录（测试/文档/构建产物不入包）
const copyDirs = ['assets', 'content', 'core', 'fx', 'infra', 'modules', 'player', 'render', 'ui', 'tools'];

rmSync(webDir, { recursive: true, force: true });
mkdirSync(webDir, { recursive: true });

for (const d of copyDirs) {
    cpSync(join(root, d), join(webDir, d), { recursive: true, force: true });
}

// 游戏本体：index.html → web/index.html（Capacitor 固定加载 index.html，WebView 直接进入游戏）
// Capacitor WebView 内 window.open('_blank') 会跳到系统浏览器，需改为同页跳转
let indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
indexHtml = indexHtml.replace(/window\.open\('([^']+)'\s*,\s*'_blank'\)/g, "location.href='$1'");
writeFileSync(join(webDir, 'index.html'), indexHtml);

// 开发集成入口：dev-index.html → web/dev-index.html（原样复制，APK 内不直接加载）
cpSync(join(root, 'dev-index.html'), join(webDir, 'dev-index.html'));

console.log('[prepare-web] web/ 就绪，入口为 index.html（游戏本体），已复制目录：' + copyDirs.join(', '));
