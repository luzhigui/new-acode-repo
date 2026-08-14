// tools/54-filelist-checker.cjs - 光明顶5v5 文件清单一致性检查器
// V5.4.0 | ~5600 bytes| 2026-07-28

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SCAN_DIRS = ['core', 'player', 'ui', 'fx', 'modules', 'content', 'tests', 'tools', 'assets'];
const EXTENSIONS = new Set(['.js', '.html', '.cjs', '.json', '.md', '.mp3']);

// 50-toolkit-more.js 是函数提取器，这些文件没有独立导出函数，不强制登记
const IGNORE_IN_MORE = new Set(['../index.html', '../mode-5v5-test.html', '../tools/48-toolkit.html']);
function shouldIgnoreInMore(f) {
    return IGNORE_IN_MORE.has(f) || f.endsWith('.md') || f.endsWith('.mp3');
}

// 有意从复制清单剔除的中文文件名（手机静态服务器对中文 URL 处理不稳，fetch 会卡住）
const INTENTIONALLY_EXCLUDED = new Set(['../记录-更改履历.md', '../待办-bug待修.md', '../tools/创意-精英战力评测脚本.js']);
function shouldIgnoreInToolkit(f) {
    return INTENTIONALLY_EXCLUDED.has(f);
}

function collectActualFiles() {
  const files = [];

  // 根目录
  for (const entry of fs.readdirSync(ROOT)) {
    const ext = path.extname(entry).toLowerCase();
    if (EXTENSIONS.has(ext) && !entry.startsWith('_')) {
      files.push(`../${entry}`);
    }
  }

  // 子目录
  for (const dir of SCAN_DIRS) {
    walkDir(path.join(ROOT, dir), dir, files);
  }

  return files.sort();
}

function walkDir(dir, relDir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const relPath = path.join(relDir, entry).replace(/\\/g, '/');
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, relPath, out);
    } else if (stat.isFile() && EXTENSIONS.has(path.extname(entry).toLowerCase()) && !entry.startsWith('_')) {
      out.push(`../${relPath}`);
    }
  }
}

function extractArray(toolName, code, varName) {
  const regex = new RegExp(`(?:const|let|var)\\s+${varName}\\s*=\\s*\\[([\\s\\S]*?)\\];`);
  const match = code.match(regex);
  if (!match) {
    console.error(`❌ 无法从 ${toolName} 提取 ${varName}`);
    return [];
  }
  const content = match[1];
  const paths = [];
  const lineRegex = /['"]([^'"]+)['"]/g;
  let m;
  while ((m = lineRegex.exec(content)) !== null) {
    paths.push(m[1]);
  }
  return paths;
}

function main() {
  console.log('======================================');
  console.log('光明顶5v5 文件清单一致性检查器');
  console.log('======================================\n');

  const actualFiles = new Set(collectActualFiles());

  const toolkitCode = fs.readFileSync(path.join(ROOT, 'tools/49-toolkit.js'), 'utf-8');
  const moreCode = fs.readFileSync(path.join(ROOT, 'tools/50-toolkit-more.js'), 'utf-8');

  const toolkitFiles = extractArray('49-toolkit.js', toolkitCode, 'ALL_PROJECT_FILES');
  const moreFiles = extractArray('50-toolkit-more.js', moreCode, 'TARGET_FILES');

  const toolkitSet = new Set(toolkitFiles);
  const moreSet = new Set(moreFiles);

  console.log(`实际文件数: ${actualFiles.size}`);
  console.log(`49-toolkit.js 登记数: ${toolkitFiles.length}`);
  console.log(`50-toolkit-more.js 登记数: ${moreFiles.length}\n`);

  // 1. 实际存在但不在 32 清单里的文件
  const missingInToolkit = [...actualFiles].filter(f => !toolkitSet.has(f) && !shouldIgnoreInToolkit(f)).sort();
  if (missingInToolkit.length > 0) {
    console.log(`❌ 实际存在但 49-toolkit.js 未登记 (${missingInToolkit.length} 个):`);
    for (const f of missingInToolkit) console.log(`   ${f}`);
    console.log('');
  }

  // 2. 32 清单里有但实际不存在的文件
  const ghostInToolkit = toolkitFiles.filter(f => !actualFiles.has(f)).sort();
  if (ghostInToolkit.length > 0) {
    console.log(`❌ 49-toolkit.js 登记但实际不存在 (${ghostInToolkit.length} 个):`);
    for (const f of ghostInToolkit) console.log(`   ${f}`);
    console.log('');
  }

  // 3. 实际存在但不在 33 清单里的文件（排除纯 HTML 页面和 md）
  const missingInMore = [...actualFiles].filter(f => !moreSet.has(f) && !shouldIgnoreInMore(f) && !shouldIgnoreInToolkit(f)).sort();
  if (missingInMore.length > 0) {
    console.log(`❌ 实际存在但 50-toolkit-more.js 未登记 (${missingInMore.length} 个):`);
    for (const f of missingInMore) console.log(`   ${f}`);
    console.log('');
  }

  // 4. 33 清单里有但实际不存在的文件
  const ghostInMore = moreFiles.filter(f => !actualFiles.has(f)).sort();
  if (ghostInMore.length > 0) {
    console.log(`❌ 50-toolkit-more.js 登记但实际不存在 (${ghostInMore.length} 个):`);
    for (const f of ghostInMore) console.log(`   ${f}`);
    console.log('');
  }

  // 5. 32 和 33 清单不一致的地方（排除纯 HTML 页面和 md）
  const inToolkitNotMore = toolkitFiles.filter(f => !moreSet.has(f) && !shouldIgnoreInMore(f) && !shouldIgnoreInToolkit(f)).sort();
  const inMoreNotToolkit = moreFiles.filter(f => !toolkitSet.has(f)).sort();
  if (inToolkitNotMore.length > 0 || inMoreNotToolkit.length > 0) {
    console.log('⚠️  两份清单差异:');
    if (inToolkitNotMore.length > 0) {
      console.log(`   只在 49-toolkit.js 中 (${inToolkitNotMore.length} 个):`);
      for (const f of inToolkitNotMore) console.log(`      ${f}`);
    }
    if (inMoreNotToolkit.length > 0) {
      console.log(`   只在 50-toolkit-more.js 中 (${inMoreNotToolkit.length} 个):`);
      for (const f of inMoreNotToolkit) console.log(`      ${f}`);
    }
    console.log('');
  }

  const hasIssue = missingInToolkit.length + ghostInToolkit.length + missingInMore.length + ghostInMore.length > 0;
  if (hasIssue) {
    console.log('✅ 检查完成，请根据上述结果更新工具清单');
  } else {
    console.log('✅ 两份清单均与实际文件一致');
  }
}

main();
