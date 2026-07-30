// tools/35-version-calibrator.cjs - 光明顶5v5 版本号与字节数批量校准器
// V5.3.1 | ~6000 bytes | 2026-07-28

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// 扫描的目录（相对根目录）
const SCAN_DIRS = [
  'core',
  'player',
  'ui',
  'fx',
  'modules',
  'tests',
  'tools'
];

// 扫描的文件扩展名
const EXTENSIONS = new Set(['.js', '.html', '.cjs']);

// 跳过特殊文件
const SKIP_FILES = new Set([
  'tools/35-version-calibrator.cjs' // 自身最后处理，避免自引用问题
]);

// 百位近似
function roundToHundreds(n) {
  return Math.round(n / 100) * 100;
}

// 收集所有目标文件
function collectFiles() {
  const files = [];

  // 根目录下的 .js/.html/.cjs
  for (const entry of fs.readdirSync(ROOT)) {
    const ext = path.extname(entry).toLowerCase();
    if (EXTENSIONS.has(ext) && !entry.startsWith('_')) {
      files.push(entry);
    }
  }

  // 子目录
  for (const dir of SCAN_DIRS) {
    const fullDir = path.join(ROOT, dir);
    if (!fs.existsSync(fullDir)) continue;
    walkDir(fullDir, dir, files);
  }

  return files
    .filter(f => !SKIP_FILES.has(f))
    .sort();
}

function walkDir(dir, relDir, out) {
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const relPath = path.join(relDir, entry).replace(/\\/g, '/');
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walkDir(fullPath, relPath, out);
    } else if (stat.isFile()) {
      const ext = path.extname(entry).toLowerCase();
      if (EXTENSIONS.has(ext) && !entry.startsWith('_')) {
        out.push(relPath);
      }
    }
  }
}

// 读取文件为字符串，保留原始换行符
function readText(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

// 校准单个文件
function calibrateFile(relPath, targetVersion, dryRun = false) {
  const fullPath = path.join(ROOT, relPath);
  const original = readText(fullPath);
  const lines = original.split(/\r?\n/);
  const eol = original.includes('\r\n') ? '\r\n' : '\n';

  const fileSize = Buffer.byteLength(original, 'utf-8');
  const roundedSize = roundToHundreds(fileSize);

  let changed = false;
  const reportLines = [];

  // 1. 处理第二行注释中的版本号和字节数
  // 格式示例：
  // JS/CJS: // V5.2.1 | ~26000 bytes | 2026-07-24
  // HTML:   <!-- V5.2.0 | ~18638 bytes | 2026-07-05 -->
  if (lines.length >= 2) {
    const line2 = lines[1];
    const htmlCommentRegex = /^(\s*<!--\s*)V\d+\.\d+\.\d+(\s*\|\s*~\d+\s*bytes\s*\|\s*.*)(\s*-->\s*)$/;
    const jsCommentRegex = /^(\s*\/\/\s*)V\d+\.\d+\.\d+(\s*\|\s*~\d+\s*bytes\s*\|\s*.*)$/;

    let newLine2 = null;
    let oldVersion = null;

    const htmlMatch = line2.match(htmlCommentRegex);
    const jsMatch = line2.match(jsCommentRegex);

    if (htmlMatch) {
      oldVersion = line2.match(/V\d+\.\d+\.\d+/)[0];
      const prefix = htmlMatch[1];
      const suffix = htmlMatch[3];
      const version = targetVersion || oldVersion;
      newLine2 = `${prefix}${version} | ~${roundedSize} bytes${suffix}`;
    } else if (jsMatch) {
      oldVersion = line2.match(/V\d+\.\d+\.\d+/)[0];
      const prefix = jsMatch[1];
      const version = targetVersion || oldVersion;
      newLine2 = `${prefix}${version} | ~${roundedSize} bytes`;
      // 保留原行尾可能有的其他内容（如 | 2026-07-24）
      const restMatch = line2.match(/V\d+\.\d+\.\d+\s*\|\s*~\d+\s*bytes\s*(.*)$/);
      if (restMatch) {
        newLine2 = `${prefix}${version} | ~${roundedSize} bytes${restMatch[1]}`;
      }
    }

    if (newLine2 && newLine2 !== line2) {
      lines[1] = newLine2;
      changed = true;
      reportLines.push(`  头部: ${line2.trim()} -> ${newLine2.trim()}`);
    }
  }

  // 2. 处理 export const VER 行
  if (targetVersion) {
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const line = lines[i];
      const verMatch = line.match(/^(\s*export\s+const\s+VER\s*=\s*['"])([^'"]+)(['"]\s*;\s*)$/);
      if (verMatch) {
        const oldVerLine = line;
        const baseName = verMatch[2].replace(/\s+V\d+\.\d+\.\d+\s*$/, '').trim();
        const newVerLine = `${verMatch[1]}${baseName} ${targetVersion}${verMatch[3]}`;
        if (newVerLine !== oldVerLine) {
          lines[i] = newVerLine;
          changed = true;
          reportLines.push(`  VER:  ${oldVerLine.trim()} -> ${newVerLine.trim()}`);
        }
        break;
      }
    }
  }

  if (!changed) {
    return null;
  }

  const newContent = lines.join(eol);
  if (!dryRun) {
    fs.writeFileSync(fullPath, newContent, 'utf-8');
  }

  return {
    relPath,
    fileSize,
    roundedSize,
    changes: reportLines
  };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const targetVersion = args.find(a => a && !a.startsWith('--')) || null;

  console.log('======================================');
  console.log('光明顶5v5 版本号/字节数批量校准器');
  console.log('======================================');
  if (targetVersion) {
    console.log(`目标版本号: ${targetVersion}`);
  } else {
    console.log('未指定目标版本号，仅校准字节数');
  }
  if (dryRun) {
    console.log('【试运行模式】不会实际写入文件');
  }
  console.log('');

  const files = collectFiles();
  const reports = [];

  for (const relPath of files) {
    try {
      const report = calibrateFile(relPath, targetVersion, dryRun);
      if (report) reports.push(report);
    } catch (e) {
      console.error(`❌ 处理失败: ${relPath}`);
      console.error(e.message);
    }
  }

  // 处理自身
  try {
    const selfReport = calibrateFile('tools/35-version-calibrator.cjs', targetVersion, dryRun);
    if (selfReport) reports.push(selfReport);
  } catch (e) {
    console.error('❌ 自身校准失败:', e.message);
  }

  console.log(`扫描文件数: ${files.length + 1}`);
  console.log(`${dryRun ? '【试运行】预计修改' : '实际修改'}文件数: ${reports.length}`);
  console.log('');

  if (reports.length === 0) {
    console.log('✅ 无需修改，所有文件已是最新');
    return;
  }

  for (const r of reports) {
    console.log(`${dryRun ? '【试运行】' : '📄'} ${r.relPath} (${r.fileSize} bytes -> ~${r.roundedSize} bytes)`);
    for (const change of r.changes) {
      console.log(change);
    }
  }

  console.log('');
  console.log(dryRun ? '✅ 试运行完成，未写入文件' : '✅ 校准完成');
}

main();
