// tools/37-filelist-checker.cjs - 光明顶5v5 文件清单一致性检查器
// V5.3.1 | ~5000 bytes | 2026-07-28

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SCAN_DIRS = ['core', 'player', 'ui', 'fx', 'modules', 'tests', 'tools'];
const EXTENSIONS = new Set(['.js', '.html', '.cjs']);

function collectActualFiles() {
  const files = [];

  // 根目录
  for (const entry of fs.readdirSync(ROOT)) {
    const ext = path.extname(entry).toLowerCase();
    if (EXTENSIONS.has(ext) && !entry.startsWith('_')) {
      files.push(entry);
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
      out.push(relPath);
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

  const toolkitCode = fs.readFileSync(path.join(ROOT, 'tools/32-toolkit.js'), 'utf-8');
  const moreCode = fs.readFileSync(path.join(ROOT, 'tools/33-toolkit-more.js'), 'utf-8');

  const toolkitFiles = extractArray('32-toolkit.js', toolkitCode, 'ALL_PROJECT_FILES');
  const moreFiles = extractArray('33-toolkit-more.js', moreCode, 'TARGET_FILES');

  const toolkitSet = new Set(toolkitFiles);
  const moreSet = new Set(moreFiles);

  console.log(`实际文件数: ${actualFiles.size}`);
  console.log(`32-toolkit.js 登记数: ${toolkitFiles.length}`);
  console.log(`33-toolkit-more.js 登记数: ${moreFiles.length}\n`);

  // 1. 实际存在但不在 32 清单里的文件
  const missingInToolkit = [...actualFiles].filter(f => !toolkitSet.has(`../${f}`)).sort();
  if (missingInToolkit.length > 0) {
    console.log(`❌ 实际存在但 32-toolkit.js 未登记 (${missingInToolkit.length} 个):`);
    for (const f of missingInToolkit) console.log(`   ${f}`);
    console.log('');
  }

  // 2. 32 清单里有但实际不存在的文件
  const ghostInToolkit = toolkitFiles.filter(f => !actualFiles.has(f.replace(/^\.\.\//, ''))).sort();
  if (ghostInToolkit.length > 0) {
    console.log(`❌ 32-toolkit.js 登记但实际不存在 (${ghostInToolkit.length} 个):`);
    for (const f of ghostInToolkit) console.log(`   ${f}`);
    console.log('');
  }

  // 3. 实际存在但不在 33 清单里的文件
  const missingInMore = [...actualFiles].filter(f => !moreSet.has(`../${f}`)).sort();
  if (missingInMore.length > 0) {
    console.log(`❌ 实际存在但 33-toolkit-more.js 未登记 (${missingInMore.length} 个):`);
    for (const f of missingInMore) console.log(`   ${f}`);
    console.log('');
  }

  // 4. 33 清单里有但实际不存在的文件
  const ghostInMore = moreFiles.filter(f => !actualFiles.has(f.replace(/^\.\.\//, ''))).sort();
  if (ghostInMore.length > 0) {
    console.log(`❌ 33-toolkit-more.js 登记但实际不存在 (${ghostInMore.length} 个):`);
    for (const f of ghostInMore) console.log(`   ${f}`);
    console.log('');
  }

  // 5. 32 和 33 清单不一致的地方（只统计共同登记的文件）
  const inToolkitNotMore = toolkitFiles.filter(f => !moreSet.has(f)).sort();
  const inMoreNotToolkit = moreFiles.filter(f => !toolkitSet.has(f)).sort();
  if (inToolkitNotMore.length > 0 || inMoreNotToolkit.length > 0) {
    console.log('⚠️  两份清单差异:');
    if (inToolkitNotMore.length > 0) {
      console.log(`   只在 32-toolkit.js 中 (${inToolkitNotMore.length} 个):`);
      for (const f of inToolkitNotMore) console.log(`      ${f}`);
    }
    if (inMoreNotToolkit.length > 0) {
      console.log(`   只在 33-toolkit-more.js 中 (${inMoreNotToolkit.length} 个):`);
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
