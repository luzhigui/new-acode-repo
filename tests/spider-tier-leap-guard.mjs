// V1.1.1 | 2026-11-11：① ③ 号结论原本写死「按 70 档接住」，降序后实际是 death ⇒ 改为如实报
//   实际档位分布；② 新增 ④ 签名↔调用点参数个数护栏（落地补 hpBefore 时漏改两个调用点会静默失真）。
// V1.1.0 | 2026-11-11 白天迭代：给守卫补「扫指定源码副本」与真源码正负路径自证。
//   夜间 V1.0.0 的 --self-test 只拿手搓的 chain 对象喂判据，没有证明「真源码改好了守卫会转绿」；
//   也无法在不改主代码的前提下验证处置方案。本版：
//   ① --src=<path> 让守卫可扫改动后的源码副本（人工复核/合流前验证用，输出标明不代表当前主代码）；
//   ② 自证新增两条**真源码形态**：把现状函数与按本仓验收口径修好的函数各写成源码串，
//      走同一个 readTierChain 抽取器 + runGuard，断言现状必红、修好必全绿。
//   ★ 三条判据、阈值来源、合成穷举口径一字未动；主代码零触碰。
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
// 自检：node tests/spider-tier-leap-guard.mjs --self-test（合成样本 + 真源码正负路径，不依赖真实文件）
// 复核：node tests/spider-tier-leap-guard.mjs --src=.tmp/fixed-tier.js（扫改动后的源码副本）

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const REPO = fileURLToPath(new URL('..', import.meta.url));
export const VER = 'tests/spider-tier-leap-guard.mjs V1.1.1';

/**
 * V1.1.1：函数签名 ↔ 调用点参数个数护栏。
 *   落地「补 hpBefore 入参」时最容易漏的是两个调用点；漏了不会语法错，但 hpAfter 会接到
 *   hpBefore 位置变成受击前血量，跨档判定静默失真。本函数只数参数个数（不解析表达式），
 *   多个调用点逐个点名，零误报优先：签名抓不到就直接报前提失效。
 */
export function checkCallSiteArity(src) {
    const text = String(src || '');
    const sig = /function\s+decideSpiderTier\s*\(([^)]*)\)/.exec(text);
    if (!sig) return ['找不到 decideSpiderTier 函数签名 ⇒ 无法核对调用点'];
    const count = (s) => s.split(',').map(x => x.trim()).filter(Boolean).length;
    const want = count(sig[1]);
    const fails = [];
    let calls = 0;
    for (const m of text.matchAll(/decideSpiderTier\s*\(([^)]*)\)/g)) {
        if (text.slice(Math.max(0, m.index - 12), m.index).includes('function')) continue; // 跳过定义本身
        calls++;
        const got = count(m[1]);
        const line = text.slice(0, m.index).split('\n').length;
        if (got !== want) fails.push('④ 调用点 L' + line + ' 传了 ' + got + ' 个参数，函数签名要 ' + want
            + ' 个 ⇒ 改签名后漏改调用点，hpAfter 会接到错误位置（静默失真，非语法错）');
    }
    if (!calls) fails.push('④ 一个 decideSpiderTier 调用点都没抓到 ⇒ 取样面塌陷，不许把「没查」当「没问题」');
    return fails;
}

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
        // V1.1.0：旧文案写死「按 70 档接住」，但降序序列下这些样本实际判的是 death ⇒ 报告说谎。
        //   改为如实报实际档位分布；本守卫只判「跨档致死必须 death」，不对非跨档样本选档拍板。
        const gotDist = [...new Set(reasonable.map(r => String(r.got)))].sort().join('/') || 'null';
        notes.push('③ 合成穷举 ' + sampled + ' 个致死击，跨档形态（受击前已在线下）全部正确判 death'
            + '（另有 ' + reasonable.length + ' 个「从阈值之上一次打死」的非跨档样本，实际判为 ' + gotDist
            + '；本守卫不对此类选档拍板）');
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

    // V1.1.0：真源码形态正负路径。上面三条喂的是手搓 chain 对象，没证明「真源码改好了守卫会转绿」。
    //   这里走同一个 readTierChain 抽取器，把源码文本 → 判定序列 → runGuard 整条链跑通。
    const OLD_SRC = [
        'function decideSpiderTier(state, maxHp, hpAfter, fp) {',
        "    if (!state._spiderTriggered70 && hpAfter <= maxHp * fp.hpThresholds[0]) return '70';",
        "    if (!state._spiderTriggered40 && hpAfter <= maxHp * fp.hpThresholds[1]) return '40';",
        "    if (!state._spiderTriggeredDeath && hpAfter <= 0) return 'death';",
        '    return null;',
        '}',
        '// 后面还有别的代码：验证函数体截取不越界'
    ].join('\n');
    const FIXED_SRC = [
        'function decideSpiderTier(state, maxHp, hpBefore, hpAfter, fp) {',
        "    if (!state._spiderTriggeredDeath && hpBefore > 0 && hpAfter <= 0) return 'death';",
        "    if (!state._spiderTriggered40 && hpAfter <= maxHp * fp.hpThresholds[1]) return '40';",
        "    if (!state._spiderTriggered70 && hpAfter <= maxHp * fp.hpThresholds[0]) return '70';",
        '    return null;',
        '}'
    ].join('\n');
    try {
        const cOld = readTierChain(OLD_SRC);
        const cFix = readTierChain(FIXED_SRC);
        if (cOld.error || cFix.error) {
            console.log('✗ 自检失败：真源码样本抽取器报错 ' + (cOld.error || cFix.error)); err++;
        } else {
            const fOld = runGuard({ chain: cOld, thresholds: th }).fails;
            const fFix = runGuard({ chain: cFix, thresholds: th }).fails;
            if (!fOld.length || !fOld.some(x => x.includes('跨档致死缺口'))) {
                console.log('✗ 自检失败：现状真源码竟没报跨档致死缺口 ⇒ 守卫把真缺陷洗绿了'); err++;
            }
            if (fFix.length) {
                console.log('✗ 自检失败：按验收口径修好的真源码仍报 ' + fFix.length + ' 处（' + fFix[0] + '）'); err++;
            }
            if (cOld.order.join() !== '70,40,death' || cFix.order.join() !== 'death,40,70') {
                console.log('✗ 自检失败：真源码判定序列抽取错位'); err++;
            }
        }
    } catch (e) {
        console.log('✗ 自检失败：真源码正负路径抛异常 ' + (e && e.message ? e.message : String(e))); err++;
    }
    // V1.1.1：④ 签名↔调用点护栏的正负路径（纯源码串，不读磁盘）
    const ARITY_OK = [
        'function decideSpiderTier(state, maxHp, hpAfter, fp) {',
        '    return null;',
        '}',
        'const a = decideSpiderTier(s, m, hpAfter, fp);',
        'const b = decideSpiderTier(s, m, hpAfter, fp);'
    ].join('\n');
    const ARITY_BAD = ARITY_OK.replace('function decideSpiderTier(state, maxHp, hpAfter, fp)',
        'function decideSpiderTier(state, maxHp, hpBefore, hpAfter, fp)');
    if (checkCallSiteArity(ARITY_OK).length) { console.log('✗ 自检失败：签名与两个调用点一致竟报 ④ ⇒ 假红'); err++; }
    const aBad = checkCallSiteArity(ARITY_BAD);
    if (aBad.length !== 2 || !aBad.every(x => x.includes('④ 调用点'))) {
        console.log('✗ 自检失败：改了签名漏改两个调用点竟没被逐一点名，实际 ' + aBad.length + ' 条'); err++;
    }
    if (!checkCallSiteArity('// 没有函数也没有调用').length) {
        console.log('✗ 自检失败：取样面空了竟没报 ④ ⇒ 把「没查」当「没问题」'); err++;
    }
    // ③ 结论文案不再写死档位：降序链下必须如实报实际分布
    const gNotes = runGuard({ chain: good, thresholds: th }).notes;
    if (!gNotes.some(n => n.includes('实际判为')) || gNotes.some(n => n.includes('按 70 档接住'))) {
        console.log('✗ 自检失败：③ 结论文案回潮成写死档位或没如实报分布'); err++;
    }
    console.log(err ? '\n❌ 自检未通过 ' + err + ' 例（守卫判定逻辑本身坏了，结论一律不作数）'
        : '\n✅ 自检全部通过（三条判据 + 手搓链 3 例 + 真源码正负 2 例 + 签名护栏/文案 3 例）');
    return err ? 1 : 0;
}

function main() {
    if (process.argv.includes('--self-test')) return selfTest();

    const th = readThresholds();
    if (th.error) { console.log('⚠ 守卫前提失效：' + th.error); return 2; }
    // V1.1.0：允许扫指定源码副本（合流前验证处置方案用）。未指定时仍只读真实主代码。
    const srcArg = process.argv.find(a => a.startsWith('--src='));
    const srcRel = srcArg ? srcArg.slice('--src='.length) : TIER_SRC;
    if (srcArg) console.log('⚙ 注入源码副本（仅验证用，结论不代表当前主代码）：' + srcRel);
    let src;
    try {
        src = readFileSync(srcArg ? resolve(REPO, srcRel) : join(REPO, TIER_SRC), 'utf8');
    } catch (e) {
        console.log('⚠ 守卫前提失效：读不到 ' + srcRel + '：' + e.message);
        return 2;
    }
    const chain = readTierChain(src);
    if (chain.error) { console.log('⚠ 守卫前提失效：' + chain.error); return 2; }

    const guard = runGuard({ chain, thresholds: th.hpThresholds, verbose: true });
    // V1.1.1：④ 签名↔调用点独立护栏，与三条判据的红合并后一起进退码。
    const fails = guard.fails.concat(checkCallSiteArity(src));
    const notes = guard.notes;
    console.log('\n飞天三档跨档判定守卫（阈值 ' + th.hpThresholds.map(t => (t * 100) + '%').join(' / ')
        + '，判定序列 ' + chain.order.join(' → ') + '）');
    if (fails.length) {
        console.log('❌ 发现 ' + fails.length + ' 处问题（跨档判定 / 签名同步；机械静态判定，未改主代码）：');
        for (const f of fails) console.log('  ❌ ' + f);
        console.log('\n处置：按本守卫 --self-test 的验收口径改 decideSpiderTier（判定序列按严重度降序'
            + ' + 入参补受击前血量，本击致死优先）；改完可用 --src=<副本> 在不碰主代码的前提下先验证本守卫转 0。'
            + '三条判据与阈值来源均不动，不需要放宽任何标准。');
        return 1;
    }
    console.log('✅ 飞天三档跨档判定合规：' + notes.join('；'));
    return 0;
}

process.exit(main());
