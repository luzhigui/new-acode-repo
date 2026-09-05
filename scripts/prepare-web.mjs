// prepare-web.mjs — 把游戏文件复制到 web/ 目录，供 Capacitor 打包
// 入口 mode-5v5-test.html 复制为 index.html（Capacitor 固定加载 index.html）
import { cpSync, rmSync, mkdirSync } from 'node:fs';
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

// 入口文件：mode-5v5-test.html → web/index.html
cpSync(join(root, 'mode-5v5-test.html'), join(webDir, 'index.html'));

console.log('[prepare-web] web/ 就绪，已复制目录：' + copyDirs.join(', '));
