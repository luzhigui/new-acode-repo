// tests/coverage-ledger.mjs — 体检覆盖总账 V1.0.0
// 作用：把「机制清单 ↔ 规则 ↔ 数值契约 ↔ 账本 group」合成一张缺口表；只读，不改任何文件。
// 数据源：tests/_registry/*.json（域边界/归属/机制清单）+ 磁盘上的规则文件 + stat-decl 契约表。
// 用法：node tests/coverage-ledger.mjs           报告模式（恒退 0）
//       node tests/coverage-ledger.mjs --enforce 缺口服从模式（有机制零覆盖或 group 无契约则退 1）
// 说明：本工具属公共层，只有框架会话可改；机制域会话只读输出、按域认领自己的段落。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const REG = path.join(HERE, '_registry');
const RULES_DIR = path.join(HERE, 'health-rules');
const STAT_DECL = path.join(HERE, 'stat-decl-vs-actual-check.mjs');
const ENFORCE = process.argv.includes('--enforce');

// 结构性排除项：引擎有记账、但按设计不设单条契约（见体检规范「静态对账」）
const GROUP_WHITELIST = new Set(['roundStatGrant', 'xiaoZhaoCarry']);

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(REG, name), 'utf8'));
const registryDomains = readJson('domains.json');
const domains = registryDomains.domains;
const CLAIM_FROM = registryDomains.claimFrom || 229;
const ruleDomains = readJson('rule-domains.json').files;
const contractDomains = readJson('contract-domains.json').contracts;
const mechanisms = readJson('mechanisms.json').mechanisms;

const listFiles = (dir, ext) => fs.readdirSync(dir).filter((f) => f.endsWith(ext)).map((f) => path.join(dir, f));
const read = (f) => fs.readFileSync(f, 'utf8');

const domainOfSlot = (num) => domains.find((d) => num >= d.slots[0] && num <= d.slots[1])?.id || null;

// ---------- 1. 规则盘点 ----------
const rules = listFiles(RULES_DIR, '.js').map((file) => {
  const src = read(file);
  const base = path.basename(file);
  const num = Number((base.match(/^(\d+)-/) || [])[1] || 0);
  return {
    base,
    file: 'tests/health-rules/' + base,
    num,
    ruleId: (src.match(/export const (rule\d+)/) || [])[1] || '(未找到 ruleId)',
    name: (src.match(/name:\s*'([^']+)'/) || [])[1] || '(未找到 name)',
  };
});

const ruleIssues = [];
const idMap = new Map();
for (const r of rules) {
  idMap.set(r.ruleId, (idMap.get(r.ruleId) || []).concat(r.base));
  const assigned = ruleDomains[r.base];
  if (!assigned) {
    ruleIssues.push(`规则 ${r.base} 没有域归属，请在 rule-domains.json 补登`);
    continue;
  }
  if (r.num >= CLAIM_FROM) {
    const owner = domainOfSlot(r.num);
    if (!owner) ruleIssues.push(`新规则 ${r.base} 的号段 ${r.num} 不在任何域（${CLAIM_FROM} 起）内`);
    else if (owner !== assigned) ruleIssues.push(`新规则 ${r.base} 号段属 ${owner}，但归属写了 ${assigned}`);
  }
}
for (const [id, files] of idMap) {
  if (files.length > 1) ruleIssues.push(`规则 id 冲突：${id} 被 ${files.join(' / ')} 同时导出（并行会话撞号，须改名）`);
}
for (const base of Object.keys(ruleDomains)) {
  if (!rules.some((r) => r.base === base)) ruleIssues.push(`rule-domains.json 登记了不存在的文件 ${base}`);
}

// ---------- 2. 数值契约盘点 ----------
const statDeclText = read(STAT_DECL);
const contractIds = [...new Set([...statDeclText.matchAll(/id:\s*'([A-Z][A-Z0-9_]+)'/g)].map((m) => m[1]))];
const contractIssues = [];
for (const id of contractIds) if (!contractDomains[id]) contractIssues.push(`契约 ${id} 没有域归属`);
for (const id of Object.keys(contractDomains)) if (!contractIds.includes(id)) contractIssues.push(`contract-domains.json 登记了不存在的契约 ${id}`);

// ---------- 3. 机制覆盖 ----------
const ruleText = rules.map((r) => read(path.join(ROOT, r.file))) .join('\n');
const mechRows = mechanisms.map((m) => {
  const ruleHit = (m.scan || [m.name]).reduce((n, kw) => n + ruleText.split(kw).length - 1, 0);
  const contractHit = (m.scan || [m.name]).reduce((n, kw) => n + statDeclText.split(kw).length - 1, 0);
  const status = ruleHit > 0 && contractHit > 0 ? 'full' : ruleHit > 0 || contractHit > 0 ? 'partial' : 'none';
  return { ...m, ruleHit, contractHit, status };
});

// ---------- 4. 账本 group 静态对账 ----------
const engineDirs = ['core', 'modules', 'infra'].map((d) => path.join(ROOT, d));
const groupNames = new Set();
for (const dir of engineDirs) {
  if (!fs.existsSync(dir)) continue;
  for (const f of listFiles(dir, '.js')) {
    const src = read(f);
    for (const m of src.matchAll(/recordHpAudit\s*\(\s*[^,]+,\s*'([A-Za-z0-9_]+)'/g)) groupNames.add(m[1]);
    for (const m of src.matchAll(/group:\s*'([A-Za-z0-9_]+)'/g)) groupNames.add(m[1]);
  }
}
const uncoveredGroups = [...groupNames].filter((g) => !GROUP_WHITELIST.has(g) && !statDeclText.includes(`'${g}'`)).sort();

// ---------- 5. 输出 ----------
const line = (s = '') => console.log(s);
line('=== 体检覆盖总账 V1.0.0 ===');
line(`规则 ${rules.length} 条 / 契约 ${contractIds.length} 条 / 机制 ${mechanisms.length} 项 / 引擎记账 group ${groupNames.size} 个`);
const legacyCount = rules.filter((r) => r.num < CLAIM_FROM).length;
const claimed = rules.filter((r) => r.num >= CLAIM_FROM).map((r) => r.num).sort((a, b) => a - b);
const allSlots = domains.flatMap((d) => Array.from({ length: d.slots[1] - d.slots[0] + 1 }, (_, i) => d.slots[0] + i));
const nextFree = allSlots.find((n) => !claimed.includes(n)) ?? Math.max(CLAIM_FROM - 1, ...claimed) + 1;
line(`  其中 173–${CLAIM_FROM - 1} 遗留占用 ${legacyCount} 条；${CLAIM_FROM} 起已认领 ${claimed.length} 条${claimed.length ? '（' + claimed.join(',') + '）' : ''}；下一个空闲号 ${nextFree}`);
line('');
line('【域登记位】（新规则只许落在本域号段）');
for (const d of domains) {
  const used = rules.filter((r) => ruleDomains[r.base] === d.id && r.num >= d.slots[0] && r.num <= d.slots[1]).length;
  const total = d.slots[1] - d.slots[0] + 1;
  line(`  ${d.id} ${d.title.padEnd(18)} ${d.slots[0]}–${d.slots[1]}  已用 ${used}/${total}`);
}
line('');
line('【机制覆盖缺口】');
const none = mechRows.filter((r) => r.status === 'none');
const partial = mechRows.filter((r) => r.status === 'partial');
line(`  完全无判据（${none.length}）：` + (none.length ? none.map((r) => `${r.name}(${r.domain})`).join('、') : '无'));
line(`  只有一侧（${partial.length}）：` + (partial.length ? partial.map((r) => `${r.name}(${r.domain}·${r.ruleHit ? '仅规则' : '仅契约'})`).join('、') : '无'));
line('');
line('【账本 group 无契约】');
line(`  ${uncoveredGroups.length ? uncoveredGroups.join('、') : '无'}（结构性排除已白名单：${[...GROUP_WHITELIST].join('、')}）`);
line('');
line('【登记异常】');
line(`  规则：${ruleIssues.length ? ruleIssues.join('；') : '无'}`);
line(`  契约：${contractIssues.length ? contractIssues.join('；') : '无'}`);
line('');

if (ENFORCE && (none.length || uncoveredGroups.length || ruleIssues.length || contractIssues.length)) {
  line('判定：不服从（存在缺口或登记异常）');
  process.exit(1);
}
line('判定：报告模式，恒退 0（加 --enforce 才按缺口退 1）');
