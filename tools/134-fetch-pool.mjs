// tools/134-fetch-pool.mjs — 创意摸奖的「外部词条池」维护脚本（手动跑，不自动执行）
// 词条去向：134-idea-lab.html 启动时 fetch 这个 JSON，合并进对应维度的池子。
//   规则：source 固定 'web'；新词条 tag='待确认'；人工过目后 --promote 标 '可用' 或 --archive 标 '归档'。
//   归档的不删，组合时权重降到 0.3。
//
// 用法（在仓库根目录跑）：
//   node tools/134-fetch-pool.mjs --keywords
//   node tools/134-fetch-pool.mjs --add "血祭（自损换爆发）,天罚（延迟雷击）" --dim effect
//   node tools/134-fetch-pool.mjs --list
//   node tools/134-fetch-pool.mjs --promote "血祭（自损换爆发）"
//   node tools/134-fetch-pool.mjs --archive "天罚（延迟雷击）"
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const POOL_FILE = join(HERE, '134-idea-pool-additions.json');

// 关键词组分 10 批，按日期轮换（每天换一批，10 天一轮）
const KEYWORD_BATCHES = [
    ['游戏技能机制 触发条件 分类', '游戏 负面状态 效果 列表'],
    ['Roguelike 技能 词条 组合', '自走棋 英雄 技能 设计'],
    ['武侠 内功 招式 效果', '游戏 Buff 回调点 触发时机'],
    ['召唤物 继承 成长 机制', '塔防 关卡 特殊规则 设计'],
    ['Boss 战 阶段 机制', '回合制 战斗 资源系统'],
    ['游戏 状态异常 分类 眩晕 沉默 缴械', '游戏 护盾 反伤 机制 设计'],
    ['战棋 站位 规则 设计', '游戏 连携 合击 机制'],
    ['游戏 仇恨 嘲讽 目标选择 机制', '游戏 斩杀 处决 机制 设计'],
    ['游戏 成长型 单位 永久属性 机制', '游戏 复活 免死 机制 设计'],
    ['游戏 环境伤害 地形 机制', '游戏 波次 增援 关卡 设计']
];

const DIMS = { effect: '效果类型', trigger: '触发时机', flavor: '武侠风味', elite: '精英', other: '其他' };

function loadPool() {
    if (!existsSync(POOL_FILE)) {
        return { version: 1, updated: today(), items: [] };
    }
    try {
        const j = JSON.parse(readFileSync(POOL_FILE, 'utf8'));
        if (!Array.isArray(j.items)) j.items = [];
        return j;
    } catch (e) {
        console.error(`词条池文件解析失败：${e.message}`);
        process.exit(1);
    }
}
function savePool(pool) {
    pool.updated = today();
    writeFileSync(POOL_FILE, JSON.stringify(pool, null, 2) + '\n', 'utf8');
}
function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function arg(flag) {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : null;
}
function findItem(pool, text) {
    return pool.items.find(x => x.text === text);
}

const pool = loadPool();

if (process.argv.includes('--keywords')) {
    const day = Math.floor(Date.now() / 86400000);
    const idx = day % KEYWORD_BATCHES.length;
    const batch = KEYWORD_BATCHES[idx];
    console.log(`【本批关键词 · 第 ${idx + 1}/${KEYWORD_BATCHES.length} 组 · ${today()}】\n`);
    batch.forEach((k, i) => console.log(`  ${i + 1}. ${k}`));
    console.log(`\n搜回来的词条用下面这条登记（dim 选 ${Object.keys(DIMS).join(' / ')}）：`);
    console.log(`  node tools/134-fetch-pool.mjs --add "词条A,词条B" --dim effect`);
    console.log(`\n筛选标准：能用一句话说清机制；纯数值调整（"攻击+10%"）不要。`);
    process.exit(0);
}

if (process.argv.includes('--add')) {
    const raw = arg('--add');
    const dim = arg('--dim') || 'effect';
    if (!raw) { console.error('缺 --add "词条1,词条2"'); process.exit(1); }
    if (!DIMS[dim]) { console.error(`--dim 只能是 ${Object.keys(DIMS).join(' / ')}`); process.exit(1); }
    let added = 0, dup = 0;
    for (const text of raw.split(',').map(s => s.trim()).filter(Boolean)) {
        if (findItem(pool, text)) { dup++; continue; }
        pool.items.push({ dim, text, source: 'web', tag: '待确认', note: '', added: today() });
        added++;
    }
    savePool(pool);
    console.log(`已登记 ${added} 条（重复跳过 ${dup} 条），维度：${DIMS[dim]} → ${POOL_FILE}`);
    process.exit(0);
}

if (process.argv.includes('--promote') || process.argv.includes('--archive')) {
    const promote = process.argv.includes('--promote');
    const text = arg(promote ? '--promote' : '--archive');
    const item = text && findItem(pool, text);
    if (!item) { console.error('词条不存在：' + text); process.exit(1); }
    item.tag = promote ? '可用' : '归档';
    savePool(pool);
    console.log(`「${item.text}」→ ${item.tag}`);
    process.exit(0);
}

if (process.argv.includes('--list')) {
    if (!pool.items.length) { console.log(`词条池为空（${POOL_FILE}）。`); process.exit(0); }
    const byDim = {};
    for (const it of pool.items) (byDim[it.dim] = byDim[it.dim] || []).push(it);
    console.log(`词条池：${pool.items.length} 条 · 更新 ${pool.updated}\n`);
    for (const [dim, arr] of Object.entries(byDim)) {
        console.log(`【${DIMS[dim] || dim}】${arr.length} 条`);
        for (const it of arr) console.log(`  [${it.tag}] ${it.text}`);
        console.log('');
    }
    process.exit(0);
}

console.log(`创意摸奖 · 外部词条池维护 v1.0.0

  --keywords              打印本批该搜的关键词组（按日期轮换）
  --add "A,B" --dim X     登记词条（tag=待确认）
  --list                  列出现有词条
  --promote "A"           人工过目后标「可用」
  --archive "A"           归档（不删，组合权重降到 0.3）

  词条池文件：${POOL_FILE}
  消费方：tools/134-idea-lab.html`);
