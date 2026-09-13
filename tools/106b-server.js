// 光明顶5v5 工具链本地静态服务器
// 无任何第三方依赖（仅 node 内置 http/fs/path），断网可用。把工具箱跑在 http://localhost 下，
// 使 showDirectoryPicker 等需要 secure-context 的 API 正常工作（file:// 双击打开会被浏览器禁用）。
// 启动后自动打开浏览器进入 102-toolkit.html。Ctrl+C 停止。
// V1.0.0 | ~1600 bytes | 2026-09-13

const http = require('http');
const fs = require('fs');
const path = require('path');

// 仓库根 = 本文件所在目录的上一级（本文件在 new-acode-repo/tools/ 下）
const ROOT = path.resolve(__dirname, '..');
const PORT = 8765;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.cjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.md': 'text/plain; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
};

// 路径穿越防护 + 路径归一：把 URL 映射到 ROOT 下的真实文件
function resolvePath(urlPath) {
    const decoded = decodeURIComponent(urlPath.split('?')[0]);
    // 空路径默认进工具箱
    if (decoded === '/' || decoded === '') return path.join(ROOT, 'tools', '102-toolkit.html');
    // 防穿越：联合后必须仍在 ROOT 内
    const target = path.normalize(path.join(ROOT, decoded));
    if (!target.startsWith(ROOT + path.sep) && target !== ROOT) return null;
    return target;
}

const server = http.createServer((req, res) => {
    const target = resolvePath(req.url);
    if (!target) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Forbidden');
        return;
    }
    fs.stat(target, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found: ' + req.url);
            return;
        }
        const ext = path.extname(target).toLowerCase();
        const type = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        fs.createReadStream(target).pipe(res);
    });
});

const { exec } = require('child_process');
server.listen(PORT, () => {
    const url = `http://localhost:${PORT}/tools/102-toolkit.html`;
    console.log(`\n  光明顶5v5 工具链已启动:`);
    console.log(`  ${url}`);
    console.log(`  按 Ctrl+C 停止服务\n`);
    // 尝试自动打开默认浏览器
    try {
        exec(`start "" "${url}"`);
    } catch (e) { /* 忽略自动打开失败，手动访问即可 */ }
});