// prepare-web.mjs — 把游戏文件复制到 web/ 目录，供 Capacitor 打包
// 入口 index.html 复制为 web/index.html（Capacitor 固定加载 index.html）
// 注意：打包版入口是"开发集成入口"界面，window.open 需改为同 WebView 内跳转
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

// 入口：index.html（开发集成入口界面）→ web/index.html
// Capacitor WebView 内 window.open('_blank') 会跳到系统浏览器，需改为同页跳转
let indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
indexHtml = indexHtml.replace(/window\.open\('([^']+)', '_blank'\)/g, "location.href='$1'");
writeFileSync(join(webDir, 'index.html'), indexHtml);

// 游戏本体：mode-5v5-test.html 原样复制，供 index 入口跳转
cpSync(join(root, 'mode-5v5-test.html'), join(webDir, 'mode-5v5-test.html'));

console.log('[prepare-web] web/ 就绪，入口为 index.html，已复制目录：' + copyDirs.join(', '));
