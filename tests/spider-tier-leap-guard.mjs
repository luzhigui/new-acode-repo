// tests/spider-tier-leap-guard.mjs | V1.0.0 | 2026-11-11 夜间第 207 轮
//
// 守什么：小昭·妹「飞天三档」的**跨档判定**必须看「受击前血量」，不能只看「受击后血量」。
//
// ═══ 为什么立这条（第 207 轮实跑取证，不是推断）═══
//   内容表 content/001-game-data.json 小昭.spiderFly.desc 原话：
//     「受击**将跌破**{hpThresholds}**或致死**时化为小蜘蛛免疫伤害（…）；毒/反伤致死原地结茧」
//   ——「将跌破」和「或致死」都是**受击前**视角的判据：一击如果从阈值之上直接打到 0，
//     它同时满足「将跌破 70%」「将跌破 40%」「致死」三件事，必须按**最严重的那一档**结算。
//
//   现行实现（modules/323-elite-mingjiao-xiaozhao-brother.js decideSpiderTier）只吃 hpAfter：
//     if (!_spiderTriggered70   && hpAfter <= maxHp*0.7) return '70';
//     if (!_spiderTriggered40   && hpAfter <= maxHp*0.4) return '40';
//     if (!_spiderTriggeredDeath&& hpAfter <= 0)         return 'death';
//   一击从 42.5% 打到 0 时，第一条就命中，返回 '70' ⇒ 只消耗 70 档，
//   单位被这一击**直接打死**，40 档与致死档（结茧）**都没机会执行**。
//
//   第 207 轮实测（对照器同源主循环，seed 17 stage 4）逐步状态：
//     R8 hp=82/378（21.7%，70 档已在 R3 用掉）→ R9 hp=70/378 → **R9 末 hp=0 alive=false**
//     死亡时 _spiderTriggered40=false、_spiderTriggeredDeath=false、_spiderRemaining=2（还剩 2 次）
//   ⇒ 不是"样本没覆盖"，是**保命机制在该形态下结构性失效**：血线剩 2 次却再也不飞。
//
//   同一根因还解释了长期留红的 SPIDER_EGG 契约零触发（结茧必须走致死档，而致死档永远轮不到）。
//
// ═══ 本守卫的定位（重要，别误解）═══
//   只做**机械静态判定**：把 decideSpiderTier 的判定序列读出来，用合成样本跑穷举，
//   指出「哪些输入会得到比应得更轻的档」。**不改主代码一行**，也不判红主流程（夜间不动主代码）。
//   把结论与复现数写清楚，交白天拍板修 decideSpiderTier 的签名（补 hpBefore 或 dmg）。
//
//   ★ 阈值与档位顺序一律从内容表/主代码**现读**，不在本文件抄第二份数字。
//
// 判据（三条，全部机械可判）：
//   ① 判定序列必须按「严重度降序」排列（death → 越低的阈值 → 越高的阈值）。
//      现行是升序（70 → 40 → death），升序 + 只吃 hpAfter ⇒ 一击致命必被判成最轻档。
//   ② 判定函数必须能区分「本击是否致死」，即入参里必须存在能还原受击前血量的信息
//      （hpBefore / dmg 任一）；只有 hpAfter 时，hpAfter=0 与 hpAfter=1 无法区分谁该走致死档。
//   ③ 合成样本穷举：对每个「受击前血量 × 伤害」组合，若该击会把血打到 0 且致死档尚未消耗，
//      判定结果必须是 'death'；否则逐条点名。
//
// 退出码：0 = 三条全过（口径已正确）；1 = 有可机检的跨档缺口（当前即此态，如实报）；
//         2 = 守卫自身前提失效（找不到 decideSpiderTier / 内容表缺参数），先修守卫。
//
// 自检：node tests/spider-tier-leap-guard.mjs --self-test（合成样本，不依赖真实文件）

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const REPO = fileURLToPath(new URL('..', import.meta.url));
export const VER = 'tests/spider-tier-leap-guard.mjs V1.0.0';

const TIER_SRC = 'modules/323-elite-mingjiao-xiaozhao-brother.js';
const CONTENT = 'content/001-game-data.json';

// ── 从内容表现读阈值（唯一来源，禁止在本文件写第二份数字）──
function readThresholds() {
    let raw;
    try {
        raw = JSON.parse(readFileSync(join(REPO, CONTENT), 'utf8'));
    } catch (e) {
        return { error: '读不到内容表 ' + CONTENT + '：' + e.message };
    }
    // 结构：characters['小昭'].skills.spiderFly.params，逐层防御，缺任一键即报错（不回落魔数）
    const walk = (o, path) => {
        let cur = o;
        for (const k of path) {
            if (!cur || typeof cur !== 'object' || !(k in cur)) return undefined;
            cur = cur[k];
        }
        return cur;
    };
    let p = walk(raw, ['characters', '小昭', 'skills', 'spiderFly', 'params']);
    if (!p) {
        // 兼容 skills 为数组的形态：找 name/skillName === 'spiderFly' 的条目
        const skills = walk(raw, ['characters', '小昭', 'skills']);
        const arr = Array.isArray(skills) ? skills : Object.values(skills || {});
        const hit = arr.find(s => s && (s.id === 'spiderFly' || s.name === '飞天' || s.key === 'spiderFly'));
        p = hit && hit.params;
    }
    if (!p || !Array.isArray(p.hpThresholds) || p.hpThresholds.length === 0) {
        return { error: '内容表里找不到 小昭.spiderFly.params.hpThresholds（结构变了，先修本守卫）' };
    }
    return { hpThresholds: p.hpThresholds.slice(), maxTriggers: p.maxTriggers };
}

// ── 从主代码现读判定序列（不抄逻辑副本，读它真实的 if 顺序）──
function readTierChain(src) {
    const start = src.indexOf('function decideSpiderTier');
    if (start < 0) return { error: '在 ' + TIER_SRC + ' 里找不到 function decideSpiderTier' };
    const end = src.indexOf('\n}', start);
    const body = src.slice(start, end < 0 ? undefined : end);
    // 逐行抓 `return 'xxx'`，按出现顺序 = 判定优先级顺序
    const order = [];
    const re = /return\s+'([A-Za-z0-9_]+)'/g;
    let m;
    while ((m = re.exec(body)) !== null) order.push(m[1]);
    if (!order.length) return { error: 'decideSpiderTier 里没抓到任何 return 档位字面量' };
    // 入参名（判能不能还原受击前血量）
    const sig = /function\s+decideSpiderTier\s*\(([^)]*)\)/.exec(body);
    const params = sig ? sig[1].split(',').map(s => s.trim()).filter(Boolean) : [];
    // 受击前血量的痕迹：入参里出现 hpBefore/dmg/before，或函数体里读了 .hp（而非 hpAfter）
    const hasBeforeInfo = /\b(hpBefore|dmg|beforeHp|incomingDmg)\b/.test(body)
        || params.some(p => /hpBefore|dmg|before/i.test(p));
    return { order, params, hasBeforeInfo, body };
}

// ── 严重度排序：death 最重，其余按阈值数值升序（阈值越低 = 越严重）──
function severityRank(tier, thresholds) {
    if (tier === 'death') return 0;                     // 最严重
    const n = parseFloat(tier);
    if (Number.isFinite(n)) {
        // 阈值 0.7 → 档位写 '70'；映射回阈值后按数值升序排严重度
        const th = thresholds.find(t => Math.round(t * 100) === Math.round(n)) ?? n / 100;
        return 1 + th;                                   // 0.4 → 1.4，0.7 → 1.7（越小越严重）
    }
    return 99;
}

// ── 复刻判定（只在合成样本上用；真跑仍以主代码为准，本复刻随主代码签名同步）──
function decideByChain(state, maxHp, hpAfter, thresholds, order) {
    for (const tier of order) {
        if (tier === 'death') {
            if (!state._spiderTriggeredDeath && hpAfter <= 0) return 'death';
            continue;
        }
        const n = parseFloat(tier);
        const th = thresholds.find(t => Math.round(t * 100) === Math.round(n)) ?? n / 100;
        const flag = '_spiderTriggered' + tier;
        if (!state[flag] && hpAfter <= maxHp * th) return tier;
    }
    return null;
}

function runGuard({ chain, thresholds, verbose = false }) {
    const fails = [];
    const notes = [];

    // ① 顺序：严重度必须降序
    const ranks = chain.order.map(t => severityRank(t, thresholds));
    let orderOk = true;
    for (let i = 1; i < ranks.length; i++) {
        if (ranks[i] < ranks[i - 1]) orderOk = false;
    }
    if (!orderOk) {
        fails.push('① 判定序列不是「严重度降序」：实际 ' + chain.order.join(' → ')
            + '（' + ranks.map(r => r.toFixed(2)).join(' / ') + '）。'
            + '升序 + 只吃 hpAfter ⇒ 一击致命会被最轻的档先接住，致死档永远轮不到');
    } else {
        notes.push('① 判定序列按严重度降序（' + chain.order.join(' → ') + '）');
    }

    // ② 受击前血量可还原
    if (!chain.hasBeforeInfo) {
        fails.push('② decideSpiderTier 的入参/函数体都没有「受击前血量」信息（现为 ' + chain.params.join(', ')
            + '）：hpAfter=0 与 hpAfter=1 无从区分谁该走致死档 ⇒ 无法判定「本击是否致死」');
    } else {
        notes.push('② 判定函数能还原受击前血量（入参含 ' + chain.params.join(', ') + '）');
    }

    // ③ 合成穷举：**「跨档致死」**必须判 death
    //   ★ 什么叫跨档：这一击不仅把血打到 0，而且**同时跨过了尚未消耗的最严重的那道阈值**。
    //     从满血（>70%）一击打死，只跨过了 70% 线 ⇒ 70 档接住是**对的**（内容表原话
    //     「受击将跌破{hpThresholds}…时化为小蜘蛛免疫伤害」，70 档本就该先接）。
    //     从 42.5% 一击打死，**已经在线下**、跳过 40 档直接归零 ⇒ 这才叫跨档，必须判 death。
    //   ⇒ 判据不是「致死即 death」，而是「致死且受击前已在最严重未消耗阈值之下」。
    const maxHp = 400;
    const leaps = [];
    const reasonable = [];
    let sampled = 0;
    const untouchedWorstThreshold = () => {
        // 全部档位都未消耗时，最严重的那道阈值 = 数值最小的阈值（如 0.4）
        const nums = thresholds.slice().sort((a, b) => a - b);
        return nums[0];
    };
    const worstTh = untouchedWorstThreshold();
    for (let pct = 1; pct <= 100; pct++) {          // 受击前血量占最大生命百分比
        const hpBefore = Math.round(maxHp * pct / 100);
        for (let dmg = 1; dmg <= hpBefore; dmg++) { // 伤害 1..hpBefore（含致死）
            const hpAfter = hpBefore - dmg;
            if (hpAfter > 0) continue;              // 只看致死击
            sampled++;
            const got = decideByChain({}, maxHp, hpAfter, thresholds, chain.order);
            // 受击前血量已在最严重阈值之下（或恰在线上）= 跨档致死；否则是「从阈值之上一次打死」，70 档接住合理
            const isLeap = (hpBefore / maxHp) <= worstTh;
            if (isLeap && got !== 'death') leaps.push({ hpBefore, dmg, pct, got });
            else if (!isLeap && got !== null) reasonable.push({ hpBefore, dmg, pct, got });
        }
    }
    if (leaps.length) {
        const minPct = Math.min(...leaps.map(l => l.pct));
        const maxPct = Math.max(...leaps.map(l => l.pct));
        const gotSet = [...new Set(leaps.map(l => l.got))].join('/');
        fails.push('③ 跨档致死缺口：' + leaps.length + ' 个合成样本被判成 ' + gotSet + ' 档而非 death 档'
            + '（受击前血量 ' + minPct + '%–' + maxPct + '%，即已在 ' + (worstTh * 100) + '% 线上或之下，'
            + '跳过该档直接归零）。例：受击前 ' + leaps[0].hpBefore + '（' + leaps[0].pct + '%）、伤害 '
            + leaps[0].dmg + ' ⇒ 返回 ' + leaps[0].got + '（应 death）⇒ 该击直接打死，'
            + '最严重档与致死档（结茧）都不执行');
    } else {
        notes.push('③ 合成穷举 ' + sampled + ' 个致死击，跨档形态（受击前已在线下）全部正确判 death'
            + '（另有 ' + reasonable.length + ' 个「从阈值之上一次打死」按 70 档接住，属合理形态）');
    }

    if (verbose) for (const n of notes) console.log('  ✅ ' + n);
    return { fails, notes, sampled };
}

function selfTest() {
    // 守卫自己的判定逻辑必须能区分「对」与「错」——两条合成链各跑一遍
    const th = [0.7, 0.4];
    const bad = { order: ['70', '40', 'death'], params: ['state', 'maxHp', 'hpAfter', 'fp'], hasBeforeInfo: false, body: '' };
    const good = { order: ['death', '40', '70'], params: ['state', 'maxHp', 'hpBefore', 'hpAfter', 'fp'], hasBeforeInfo: true, body: '' };
    let err = 0;
    const b = runGuard({ chain: bad, thresholds: th });
    if (b.fails.length !== 3) { console.log('✗ 自检失败：「升序 + 无 hpBefore」应命中 3 条，实际 ' + b.fails.length); err++; }
    const g = runGuard({ chain: good, thresholds: th });
    if (g.fails.length !== 0) { console.log('✗ 自检失败：「降序 + 有 hpBefore」应全过，实际 ' + g.fails.length); err++; }
    // 半对：降序但无 hpBefore ⇒ 应只命中 ②
    const half = { order: ['death', '40', '70'], params: ['state', 'maxHp', 'hpAfter'], hasBeforeInfo: false, body: '' };
    const h = runGuard({ chain: half, thresholds: th });
    if (h.fails.length !== 1) { console.log('✗ 自检失败：「降序但无 hpBefore」应只命中 1 条，实际 ' + h.fails.length); err++; }
    console.log(err ? '\n❌ 自检未通过 ' + err + ' 例（守卫判定逻辑本身坏了，结论一律不作数）' : '\n✅ 自检全部通过（三条判据都能咬住对应缺陷形态）');
    return err ? 1 : 0;
}

function main() {
    if (process.argv.includes('--self-test')) return selfTest();

    const th = readThresholds();
    if (th.error) { console.log('⚠ 守卫前提失效：' + th.error); return 2; }
    let src;
    try {
        src = readFileSync(join(REPO, TIER_SRC), 'utf8');
    } catch (e) {
        console.log('⚠ 守卫前提失效：读不到 ' + TIER_SRC + '：' + e.message);
        return 2;
    }
    const chain = readTierChain(src);
    if (chain.error) { console.log('⚠ 守卫前提失效：' + chain.error); return 2; }

    const { fails, notes } = runGuard({ chain, thresholds: th.hpThresholds, verbose: true });
    console.log('\n飞天三档跨档判定守卫（阈值 ' + th.hpThresholds.map(t => (t * 100) + '%').join(' / ')
        + '，判定序列 ' + chain.order.join(' → ') + '）');
    if (fails.length) {
        console.log('❌ 发现 ' + fails.length + ' 处跨档缺口（机械静态判定，未改主代码）：');
        for (const f of fails) console.log('  ❌ ' + f);
        console.log('\n建议（交白天拍板，夜间不动主代码）：把 decideSpiderTier 的判定改为「先致死、后阈值」并补受击前血量入参；'
            + '改完本守卫应转 0。改前请先补负样本，确认旧口径确实会漏致死档。');
        return 1;
    }
    console.log('✅ 飞天三档跨档判定合规：' + notes.join('；'));
    return 0;
}

process.exit(main());
