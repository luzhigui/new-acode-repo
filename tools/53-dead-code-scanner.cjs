// tools/53-dead-code-scanner.cjs - 光明顶5v5 死代码扫描器
// V5.4.0 | ~4700 bytes| 2026-07-28

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SCAN_DIRS = ['core', 'player', 'ui', 'fx', 'modules', 'content', 'tests', 'tools'];
const EXTENSIONS = new Set(['.js', '.cjs']);

// 扫描时跳过的文件（入口/主控，导出会被外部 html 使用）
const SKIP_FILES = new Set([
  'index.html',
  'mode-5v5-test.html',
  'tests/55test-runner.html',
  'tools/48-toolkit.html',
  'tools/51-shop.html'
]);

// 永远不算死代码的白名单（版本常量、通用导出等）
const EXPORT_WHITELIST = new Set([
  'VER',
  'CONFIG',
  'ENEMY_M',
  'rand',
  'Unit',
  'GlobalStore',
  'AudioManager',
  'ReplayManager',
  'EventBus'
]);

function collectJsFiles() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    walkDir(path.join(ROOT, dir), dir, files);
  }
  return files.filter(f => !SKIP_FILES.has(f));
}

function walkDir(dir, relDir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const relPath = path.join(relDir, entry).replace(/\\/g, '/');
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, relPath, out);
    } else if (stat.isFile() && EXTENSIONS.has(path.extname(entry).toLowerCase())) {
      out.push(relPath);
    }
  }
}

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

// 提取文件中的 export 名称
function extractExports(code) {
  const exports = [];

  // export const VER = ...
  // export function foo(...)
  // export class Bar ...
  const regex1 = /export\s+(?:const|let|var|function|class)\s+(\w+)/g;
  let m;
  while ((m = regex1.exec(code)) !== null) {
    exports.push(m[1]);
  }

  // export { a, b as c }
  const regex2 = /export\s*\{([^}]+)\}/g;
  while ((m = regex2.exec(code)) !== null) {
    const items = m[1].split(',');
    for (const item of items) {
      const parts = item.trim().split(/\s+as\s+/);
      exports.push(parts[parts.length - 1].trim());
    }
  }

  // export default function foo() / export default class Foo
  const regex3 = /export\s+default\s+(?:function|class)\s+(\w+)/g;
  while ((m = regex3.exec(code)) !== null) {
    exports.push('default');
  }

  return exports;
}

// 提取文件中的 import 引用
function extractImports(code) {
  const imports = new Set();

  // import { a, b as c } from '...'
  const regex1 = /import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"];?/g;
  let m;
  while ((m = regex1.exec(code)) !== null) {
    const items = m[1].split(',');
    for (const item of items) {
      const name = item.trim().split(/\s+as\s+/)[0].trim();
      if (name) imports.add(name);
    }
  }

  // import foo from '...'
  const regex2 = /import\s+(\w+)\s+from\s*['"][^'"]+['"];?/g;
  while ((m = regex2.exec(code)) !== null) {
    imports.add(m[1]);
  }

  // import * as foo from '...'
  const regex3 = /import\s*\*\s+as\s+(\w+)\s+from\s*['"][^'"]+['"];?/g;
  while ((m = regex3.exec(code)) !== null) {
    imports.add(m[1]);
  }

  return imports;
}

function main() {
  console.log('======================================');
  console.log('光明顶5v5 死代码扫描器');
  console.log('======================================\n');

  const files = collectJsFiles();
  const allExports = {}; // relPath -> [names]
  const allImports = new Set();

  for (const relPath of files) {
    const code = readText(relPath);
    const exports = extractExports(code).filter(n => !EXPORT_WHITELIST.has(n));
    if (exports.length > 0) {
      allExports[relPath] = exports;
    }
    const imports = extractImports(code);
    imports.forEach(n => allImports.add(n));
  }

  let deadCount = 0;
  for (const [relPath, exports] of Object.entries(allExports)) {
    const dead = exports.filter(n => !allImports.has(n));
    if (dead.length > 0) {
      console.log(`📄 ${relPath}`);
      for (const name of dead) {
        console.log(`   ⚠️  ${name}`);
      }
      deadCount += dead.length;
    }
  }

  console.log('');
  console.log(`扫描文件数: ${files.length}`);
  console.log(`疑似死代码数: ${deadCount}`);

  if (deadCount === 0) {
    console.log('✅ 未发现明显死代码');
  } else {
    console.log('\n提示：部分导出可能被 HTML 直接引用、通过 window.xxx 使用，或被 eval 动态调用。');
    console.log('     删除前请人工二次确认。');
  }
}

main();
