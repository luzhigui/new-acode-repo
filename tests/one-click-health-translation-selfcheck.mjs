// one-click-health-translation-selfcheck.mjs V1.2.0 | 2026-11-26 (#30 → #94 收口)
// 一键报告人话翻译覆盖度自检：防 one-click-health.mjs 的 MEANING 表（人工维护）在新增检查项后
//   把红项翻成“其他”而无人察觉。
//   ① 静态预检：交叉核对 run-all 的 CHECKS/OBSERVES 条目名 vs MEANING 表 keys（按 humanLine
//      一致的子串匹配），列出会翻成“其他”的条目，供补表。
//   ② 动态段（受环境约束）：真跑一次 one-click-health，统计生成报告里“其他”标题数；>0 提示补表。
//   挂 OBSERVES（不改 CHECKS 分母），pure tests/，不碰主代码、不改阈值/基线/判据。
// V1.2.0 | 2026-11-26 第193轮：**取消"第二份真相"**——不再 spawn 一键体检自己跑一遍 run-all（旧版跑出
//   22/27 缩减口径，与主 run-all 27/32 打架，还会递归建树）；改为只读唯一权威那一遍的报告文件。
// V1.1.0 | 2026-11-26 第193轮：递归防爆。一键体检会把 run-all 拉进干净 worktree 里跑，run-all 又挂本自检
//   ⇒ 本自检再 spawn 一次 one-click ⇒ 每层再建一棵 worktree。2026-11-26 实测跑成 6 层嵌套、约 4.0 GB
//   垃圾目录、进程越滚越多（与第40轮"5 层嵌套"同源复发，那次只挪了目录没断链）。修法：one-click 调 run-all
//   时下发 HEALTH_ONECLICK_DEPTH=1，本自检见到该变量就只做静态预检、跳过动态段。
export const VER = 'tests/one-click-health-translation-selfcheck.mjs V1.2.0';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const RA = path.join(ROOT, 'tests', 'run-all.mjs');
const OCH = path.join(ROOT, 'tests', 'one-click-health.mjs');
const OUT = path.join(ROOT, 'tests', 'output', 'one-click-health-report.html');

const runall = fs.readFileSync(RA, 'utf8');
const och = fs.readFileSync(OCH, 'utf8');

// 提取所有条目名（CHECKS + OBSERVES 的 name: '...'）
const entryNames = [];
for (const m of runall.matchAll(/\{\s*name:\s*'([^']+)'/g)) entryNames.push(m[1]);

// 提取 MEANING keys（'xxx': { ... }，保持文件声明顺序 = humanLine 优先级）
const meaningKeys = [];
for (const m of och.matchAll(/^\s*'([^']+)':\s*\{/gm)) meaningKeys.push(m[1]);

// humanLine 一致：按 Object.entries(MEANING) 顺序，第一个 line.includes(key) 命中；否则 '其他'
function meaningKey(line) {
    for (const k of meaningKeys) if (line.includes(k)) return k;
    return '其他';
}

const uncovered = entryNames.filter(n => meaningKey(n) === '其他');
console.log(`[静态预检] run-all 条目 ${entryNames.length} 条，MEANING 表 ${meaningKeys.length} 条，会翻成“其他”的条目 ${uncovered.length} 条：`);
for (const u of uncovered) console.log('  其他 ←', u);

// 报告段（第193轮，消灭「第二份真相」）：**不再 spawn 一次 one-click-health 自己跑一遍 run-all**。
//   旧版动态段会整跑一遍体检（约 500s），且它跑出来的是缩减口径（22/27），与主 run-all 的 27/32 对不上
//   ⇒ 同一套体检出两份真相，谁看哪份都可能被误导（看板 #94）；极端情况还会套娃建树（第193轮实测 6 层/4GB）。
//   现在只读「唯一权威那一遍」已经产出的报告文件；没有报告就如实说没有，不自己造第二份。
let otherCardCount = null, dynamicNote = '';
if (fs.existsSync(OUT)) {
    const html = fs.readFileSync(OUT, 'utf8');
    // HTML 里命中不到 MEANING 的条目标题渲染为：<div class="title">其他　<span class="badge">...</span></div>
    otherCardCount = (html.match(/class="title">其他/g) || []).length;
    dynamicNote = `报告里“其他”标题数 = ${otherCardCount}`;
} else {
    dynamicNote = '无现成报告可读（本自检不另跑一遍，避免第二份真相）';
}
console.log('[报告段]' + dynamicNote);
if (otherCardCount > 0) {
    console.log('⚠ 人话翻译覆盖度不足：报告里还有 ' + otherCardCount + ' 项翻成“其他”，请补 MEANING 表。');
} else if (otherCardCount === 0) {
    console.log('✅ 人话翻译覆盖度 OK：报告里无“其他”标题。');
}
if (uncovered.length > 0) {
    console.log('建议：为以上 ' + uncovered.length + ' 条条目补 MEANING 表项，避免翻成“其他”。');
}
if (otherCardCount > 0 || uncovered.length > 0) {
    console.log('提示：MEANING 表需补项（静态预检 ' + uncovered.length + ' 条未覆盖' + (otherCardCount != null ? '，报告“其他”' + otherCardCount + ' 条' : '') + '）。');
}
// 挂 OBSERVES 的呈现自检：退出码不计入 run-all 退码；此处始终 exit 0 以免误伤，靠输出来提示。
process.exit(0);
