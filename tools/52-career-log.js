// tools/52-career-log.js — 生涯记录（本地累积每局摘要，一键导出给 AI 分析）
// V1.8.0 | 2026-10-28 | 新增 getHexWinRates(mode)：逐海克斯实战胜率（mode='single' 与 108 常规榜口径对齐），
//   供 126 规则八做「逐海克斯 模拟 vs 实战」对照。52 每局已记 hex（同 CONFIG.BUFFS key），可直接按 key 匹配。
// V1.7.0 | 2026-10-28 | byMode 升级：原只数各模式场次（单机/联机），V1.6.0 加 byMode 的初衷是
//   「单机可能挂机刷会稀释胜率」，但只显示「单机 N 局」用户仍无法判断它把胜率拉高还是压低 →
//   现在 byMode 存 {n, wins, winRate, label}，界面/数据健康/Markdown 导出都按「N局(胜率%)」展示。
// V1.6.0 | 2026-10-28 |
//   ① getCareerInsights 加 byMode（single 单机 / pvp 联机）。单机可能挂机刷或开调试，
//      混进实战统计会让「模拟 vs 实战」对照失真 → 数据健康里分开显示。
//   ② exportCareerMarkdown 从「只有原始数据」升级为「带分析结论」：英雄表现表（含 95% 区间）、
//      英雄搭配（协同/拖累）、败因归类、最近 vs 之前趋势。丢给 AI 时不用它再从头算。
// V1.5.0 | 2026-10-28 | getCareerTrend()：最近 20 局 vs 之前 20 局。
//   200 局上限下唯一还能做的趋势。只摆数字、不判显著（20 局胜率的标准误差约 ±11pp，
//   大多数「变化」都在噪声内）；也不知道用户何时改的数值，所以只说「先后差异」不说因果。
// V1.4.0 | 2026-10-28 | 两条「数据可信度」：
//   ① 上限丢数据不再静默：appendCareerRecord 把被 200 局上限挤掉的局数累加进 meta 键，
//      getCareerInsights 返回 dropped。旧版超上限直接 shift，看的人不知道实际已打过多少局，
//      会误以为「总共就 200 局」，趋势判断直接错。
//   ② 生涯统计加数据覆盖时间 span（最早一局 / 最晚一局 / 跨度天数）。
//      没有它，看到「200 局 62% 胜率」无法判断是最近三天还是两个月的，也不知道中间改没改过数值。
// V1.3.0 | 2026-10-28 | 三条细化（用户拍板「按顺序全做」，接在 126 V2.5.0 之后）：
//   ① 样本置信度：getHeroAggregates 新增 ci（Wilson 95%）+ reliable（≥8 局）。
//      3 局 100% 胜率不再被当实力，和 126 对海克斯/精英的处理同口径。
//   ② 英雄两两组合 getHeroPairs()：谁和谁一起上更容易赢。口径同 126 的海克斯组合
//      （组合胜率 vs 两人各自胜率均值）。局限已知：5 人阵容只有 10 个对子、样本稀疏，
//      且「第三个特别强」会被误算成这对的功劳 → 门槛 8 局，结论只当线索。
//   ③ 败因归类 getLossAnalysis()：输局的共同点（被速推 / 团灭 / 输出打不出 / 承伤偏高 /
//      谁最先倒）。只用量化数据，不猜走位操作；输局 <5 局直说「不下结论」。
// V1.2.0 | 2026-10-28 | ① 海克斯中文名改从 127-tool-registry.js 单源取（与 108/126 同源，
//           删掉本文件里那一份手写副本——holyFire 这类新海克斯若只在 127 加了、忘改本副本就会显示英文 key）；
//         ② 抽出 computeCareerStats() 共享聚合，「各关胜率 / 主力英雄」两套循环不再在 markdown 与 insights 里各写一遍；
//         ③ 修「最难关卡」误判：hardest 与 easiest 统一要求 ≥3 局样本，避免 1 局 100% 胜率被当成最难关
// V1.1.0 | 2026-10-27 | 由 player/ 迁入 tools/（入口保留：战斗内写入在 42player-core、查看在 dev-index）
//         新增 getHeroAggregates()（英雄跨局聚合）与 exportCareerCSV()（表格软件友好导出）
// 只存摘要（阵容/结果/单位统计/回合走势），不存 steps——localStorage 约 5MB，
//   完整战报单局几百 KB 到 2MB，只有「保存战报」按钮按需导出单局时才用。
// 摘要单局约 2~3KB，上限 200 局约 600KB。
// 写入失败（配额满/隐私模式）静默跳过，不打断战斗。
import { FACT_TYPES, CAMP_TYPES } from '../infra/56-battle-enums.js';
import { CONFIG } from '../core/01config-5v5-test.js';
// 海克斯中文名单一来源：与 108 表头 / 126 告警文案同源（见 127-tool-registry.js 文件头）。
// 以前本文件另存一份手写副本，加新海克斯时若只改 127 忘改这里，就会退化成英文 key。
import { HEX_NAMES } from './127-tool-registry.js';

export const VER = 'tools/52-career-log.js V1.8.0';

const LS_KEY = 'ming_career_log_5v5_test';
const META_KEY = 'ming_career_log_5v5_meta';   // V1.4.0：记「已丢弃多少局」，避免上限到了悄悄扔数据
const MAX_RECORDS = 200;
// 英雄/组合少于此场次 → 标「样本少」，胜率仅供参考（3 局 100% 不等于这个英雄强）
const HERO_MIN_GAMES = 8;
// 败因归类至少要有这么多输局才下结论（少于这个数只报「样本太少」）
const LOSS_MIN = 5;

// 元信息：目前只存 dropped（累计被上限挤掉的局数）
function readMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function writeMeta(m) {
    try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) { /* 配额满就放弃，不影响战斗 */ }
}

// Wilson 95% 区间（V1.3.0）：与 tools/126 平衡告警同口径。
// 为什么不从 126 import：126 是带 DOM 副作用的 IIFE，为了十几行数学把整个告警面板拉进来不值得。
// 公式是常数，不会漂；两端都按 z=1.96。
function wilson95(wins, n) {
    if (!(n > 0)) return null;
    const z = 1.96, p = wins / n;
    const denom = 1 + z * z / n;
    const center = (p + z * z / (2 * n)) / denom;
    const half = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / denom;
    return [Math.max(0, center - half), Math.min(1, center + half)];
}

// 一回合的轻量摘要：双方总伤害 + 本回合击杀名单。纯读 step.log，不碰引擎。
export function summarizeRoundStep(step, round) {
    const log = (step && step.log) || [];
    let aDmg = 0, eDmg = 0;
    const kills = [];
    for (const e of log) {
        if (!e || e.factType !== FACT_TYPES.ATTACK || !e.data) continue;
        const d = e.data;
        const dmg = Math.round((d.dmgResult && d.dmgResult.dmg) || 0);
        if (d.attacker && d.attacker.camp === CAMP_TYPES.ALLY) aDmg += dmg;
        else if (d.attacker && d.attacker.camp === CAMP_TYPES.ENEMY) eDmg += dmg;
        if (d.dmgResult && (d.dmgResult.dead || d.dmgResult.executeKill) && d.target) {
            kills.push(d.target.name);
        }
    }
    return { r: round, aDmg, eDmg, kills };
}

function pickUnits(list) {
    return (list || []).map(u => ({
        name: u.name, m: u.m, role: u.role, pos: u.pos,
        hp: Math.round(u.hp), maxHp: Math.round(u.maxHp), alive: !!u.alive,
        dmgDealt: Math.round(u.dmgDealt || 0),
        dmgTaken: Math.round(u.dmgTaken || 0),
        healDone: Math.round(u.healDone || 0),
        dodgeCount: u.dodgeCount || 0,
        critCount: u.critCount || 0,
        survivedRounds: u.survivedRounds || 0
    }));
}

// roundSummary 为空 = 回放/从机路径（没有 careerRounds），返回 null 不写库
export function buildCareerRecord({ stage, mode, seed, winner, rounds, hexKeys, report, roundSummary }) {
    if (!roundSummary || roundSummary.length === 0) return null;
    return {
        v: 1,
        id: `s${stage}-${Date.now().toString(36)}`,
        ts: Date.now(),
        stage, mode, seed,
        winner, rounds,
        hex: (hexKeys || []).slice(),
        ally: pickUnits(report && report.ally),
        enemy: pickUnits(report && report.enemy),
        roundsSummary: roundSummary
    };
}

export function getCareerRecords() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
}

export function appendCareerRecord(record) {
    if (!record) return false;
    try {
        const arr = getCareerRecords();
        arr.push(record);
        // V1.4.0：超上限时把挤掉的局数记下来。旧版静默 shift，
        //   跑久了会以为「总共就 200 局」，而实际打过 600 局、丢了 400 局，趋势分析全错。
        let dropped = 0;
        while (arr.length > MAX_RECORDS) { arr.shift(); dropped++; }
        localStorage.setItem(LS_KEY, JSON.stringify(arr));
        if (dropped) {
            const meta = readMeta();
            meta.dropped = (meta.dropped || 0) + dropped;
            writeMeta(meta);
        }
        return true;
    } catch (e) { return false; }
}

export function clearCareerRecords() {
    try {
        localStorage.removeItem(LS_KEY);
        localStorage.removeItem(META_KEY);   // 清空时连「已丢弃计数」一起清，否则下次开始就带着旧账
        return true;
    } catch (e) { return false; }
}

// 共享聚合：被 exportCareerMarkdown / getCareerInsights 复用，避免「各关胜率」「主力英雄」
// 两套循环在两份导出里各写一遍（改一处忘改另一处就会漂移，输出对不上）。
// byStage: {stage: {n, w}}；byStageAsc: 升序 stage（数字字符串，如 '3'）。
export function computeCareerStats(arr) {
    const total = arr.length;
    const winA = arr.filter(r => r.winner === '明教').length;
    const winE = arr.filter(r => r.winner === '六大派').length;
    const byStage = {};
    for (const r of arr) {
        const s = r.stage || 0;
        if (!byStage[s]) byStage[s] = { n: 0, w: 0 };
        byStage[s].n++;
        if (r.winner === '明教') byStage[s].w++;
    }
    const byStageAsc = Object.keys(byStage).sort((a, b) => a - b);
    const appear = {}, heroWins = {};
    for (const r of arr) {
        const seen = new Set();
        for (const u of (r.ally || [])) {
            if (seen.has(u.name)) continue;
            seen.add(u.name);
            appear[u.name] = (appear[u.name] || 0) + 1;
            if (r.winner === '明教') heroWins[u.name] = (heroWins[u.name] || 0) + 1;
        }
    }
    return { total, winA, winE, byStage, byStageAsc, appear, heroWins };
}

// Markdown 导出（给 AI 分析：比 JSON 省 token 且可读）
export function exportCareerMarkdown() {
    const arr = getCareerRecords();
    if (arr.length === 0) return null;
    const lines = [];
    lines.push(`# 光明顶 5v5 生涯记录（共 ${arr.length} 局）`, '');

    const { total, winA, winE, byStage, byStageAsc, appear, heroWins } = computeCareerStats(arr);
    lines.push('## 汇总');
    lines.push(`总场次 ${total} ｜ 明教 ${winA} 胜 ｜ 六大派 ${winE} 胜 ｜ 平局 ${total - winA - winE}`);
    // 模式分布（V1.6.0 加；V1.7.0 补各模式胜率）：单机/联机分开看，且给出各自胜率，
    //   才能判断「单机局是不是把整体胜率拉高/压低」而不是只数场次
    try {
        const insM = getCareerInsights();
        if (insM && insM.byMode && Object.keys(insM.byMode).length) {
            lines.push('模式：' + Object.entries(insM.byMode).map(([k, v]) => `${v.label} ${v.n}局(${v.winRate}%)`).join(' ｜ '));
        }
    } catch (e) {}

    lines.push('各关明教胜率：' + byStageAsc
        .map(s => `s${s} ${Math.round(byStage[s].w / byStage[s].n * 100)}%(${byStage[s].n})`)
        .join(' '));

    const top = Object.entries(appear).sort((a, b) => b[1] - a[1]).slice(0, 12);
    lines.push('明教出场率 Top：' + top.map(([n, c]) =>
        `${n} ${c}局(${Math.round((heroWins[n] || 0) / c * 100)}%)`).join(' / '));
    lines.push('');

    // 分析结论（V1.6.0）：导出的 Markdown 不再只是原始数据，带上聚合/搭配/败因/趋势，
    //   直接丢给 AI 就能分析，不用它再从头算一遍。
    try {
        const agg = getHeroAggregates();
        if (agg && agg.length) {
            lines.push('## 英雄表现（仅明教侧；<8 局标「样本少」）');
            lines.push('| 英雄 | 出场 | 胜率 | 95%区间 | 均输出 | 均承伤 | 存活率 |');
            lines.push('|---|---|---|---|---|---|---|');
            for (const a of agg.slice(0, 15)) {
                lines.push(`| ${a.name} | ${a.games} | ${a.winRate}%${a.reliable === false ? '（样本少）' : ''} | `
                    + `${a.ci ? a.ci[0] + '–' + a.ci[1] + '%' : '—'} | ${a.avgDmg} | ${a.avgTaken} | ${a.aliveRate}% |`);
            }
            lines.push('');
        }
    } catch (e) {}
    try {
        const pairs = getHeroPairs();
        if (pairs && pairs.length) {
            const good = pairs.filter(p => p.delta >= 8).slice(0, 5);
            const bad = pairs.filter(p => p.delta <= -8).slice(-3).reverse();
            if (good.length || bad.length) {
                lines.push('## 英雄搭配（组合胜率 vs 两人单独胜率均值；只当线索）');
                for (const p of good) lines.push(`- 协同：${p.a} + ${p.b} → ${p.winRate}%（${p.n} 局，高于各自均值 ${p.delta}pp）`);
                for (const p of bad) lines.push(`- 拖累：${p.a} + ${p.b} → ${p.winRate}%（${p.n} 局，低于各自均值 ${-p.delta}pp）`);
                lines.push('');
            }
        }
    } catch (e) {}
    try {
        const la = getLossAnalysis();
        if (la && la.findings.length) {
            lines.push(`## 败因（${la.losses} 败 / ${la.wins} 胜）`);
            for (const f of la.findings) lines.push(`- ${f.text}`);
            lines.push('');
        }
    } catch (e) {}
    try {
        const tr = getCareerTrend(20);
        if (tr && tr.enough) {
            lines.push(`## 最近 ${tr.window} 局 vs 之前 ${tr.window} 局（只反映先后差异，不代表因果）`);
            lines.push(`- 胜率：${tr.earlier.winRate}% → ${tr.recent.winRate}%（${tr.delta.winRate > 0 ? '+' : ''}${tr.delta.winRate}pp，20 局波动约 ±11pp）`);
            lines.push(`- 平均回合：${tr.earlier.avgRounds} → ${tr.recent.avgRounds}`);
            lines.push(`- 平均存活：${tr.earlier.avgAlive} → ${tr.recent.avgAlive}`);
            lines.push('');
        }
    } catch (e) {}

    lines.push('## 逐局明细');
    for (let i = arr.length - 1; i >= 0; i--) {
        const r = arr[i];
        const hex = (r.hex && r.hex.length) ? ` ｜ 海克斯: ${r.hex.join('/')}` : '';
        // 降到 ### —— 上面已经有了 ## 逐局明细，同级会撞层级（V1.6.0 调整）
        lines.push(`### 第 ${i + 1} 局 ｜ s${r.stage} ｜ ${r.winner}胜 ｜ ${r.rounds} 回合${hex}`);
        lines.push('明教：' + (r.ally || []).map(u =>
            `${u.name}(${u.role} ${u.pos}号) ${u.dmgDealt}输出/${u.dmgTaken}承伤${u.alive ? '' : '☠'}`).join(' ｜ '));
        lines.push('六大派：' + (r.enemy || []).map(u =>
            `${u.name}(${u.role} ${u.pos}号) ${u.dmgDealt}输出/${u.dmgTaken}承伤${u.alive ? '' : '☠'}`).join(' ｜ '));
        lines.push('走势：' + (r.roundsSummary || []).map(x =>
            `R${x.r} ${x.aDmg}:${x.eDmg}${(x.kills && x.kills.length) ? `(斩${x.kills.join('、')})` : ''}`).join(' '));
        lines.push('');
    }
    return lines.join('\n');
}

// 生涯统计卡片：给弹窗顶部用。纯读已有记录，不新增存储。
export function getCareerInsights() {
    const arr = getCareerRecords();
    if (arr.length === 0) return null;
    const total = arr.length;
    const wins = arr.filter(r => r.winner === '明教').length;
    const winRate = Math.round(wins / total * 100);
    const avgRounds = Math.round(arr.reduce((s, r) => s + (r.rounds || 0), 0) / total * 10) / 10;

    // 各关胜率 / 主力英雄来自共享聚合；hardest 与 easiest 统一要求 ≥3 局样本，
    // 避免 1 局 100% 胜率被当成「最难 / 最易」关卡（旧版 easiest 有此保护、hardest 漏了）
    const { byStage, byStageAsc, appear, heroWins } = computeCareerStats(arr);
    const stages = byStageAsc.map(s => ({ stage: +s, n: byStage[s].n, rate: byStage[s].w / byStage[s].n }));
    const hardest = stages.filter(x => x.n >= 3).sort((a, b) => a.rate - b.rate)[0] || null;
    const easiest = stages.filter(x => x.n >= 3).sort((a, b) => b.rate - a.rate)[0] || null;

    // 主力英雄：明教侧出场次数最多
    const topEntry = Object.entries(appear).sort((a, b) => b[1] - a[1])[0];

    // 单局最高输出：跨所有局、双方所有单位取最大 dmgDealt
    let bestHit = null;
    for (const r of arr) {
        const all = (r.ally || []).concat(r.enemy || []);
        for (const u of all) {
            const d = u.dmgDealt || 0;
            if (!bestHit || d > bestHit.dmg) bestHit = { name: u.name, dmg: Math.round(d), stage: r.stage };
        }
    }

    // 海克斯胜率：只统计出场 >=2 次的，避免单局噪声
    const hexStat = {};
    for (const r of arr) {
        for (const k of (r.hex || [])) {
            if (!hexStat[k]) hexStat[k] = { n: 0, w: 0 };
            hexStat[k].n++;
            if (r.winner === '明教') hexStat[k].w++;
        }
    }
    // 改为按出场次数排序，反映“最常选”而不是“胜率最高”
    const hexTopEntry = Object.entries(hexStat)
        .filter(([, v]) => v.n >= 2)
        .sort((a, b) => b[1].n - a[1].n)[0];
    let hexTop = null;
    if (hexTopEntry) {
        const k = hexTopEntry[0], v = hexTopEntry[1];
        // 中文名：优先取 CONFIG.BUFFS 配置名，其次 127 单源 HEX_NAMES，最后兜底英文 key
        let name = k;
        try { name = (CONFIG.BUFFS && CONFIG.BUFFS[k] && CONFIG.BUFFS[k].name) || HEX_NAMES[k] || k; } catch (e) {}
        hexTop = { key: k, name, rate: Math.round(v.w / v.n * 100), n: v.n };
    }

    // 最近 10 局战绩（时间正序，老的在前）
    const recent = arr.slice(-10).map(r => r.winner || '平局');

    // 一句话总结（纯规则，不打分）
    let summaryLine = '';
    if (total < 5) summaryLine = '样本太少（' + total + ' 局），仅供参考。';
    else if (winRate >= 80) summaryLine = '明教 ' + winRate + '% 胜率，阵容强势。';
    else if (winRate <= 30) summaryLine = '明教 ' + winRate + '% 胜率，明显吃力。';
    if (avgRounds > 0) {
        const pace = avgRounds < 8 ? '速推型对局' : (avgRounds > 15 ? '鏖战居多' : '节奏正常');
        summaryLine += (summaryLine ? ' ' : '') + '平均 ' + avgRounds + ' 回合，' + pace + '。';
    }

    // 数据覆盖时间 + 被上限挤掉的局数（V1.4.0）。
    // 没有这两个数时，用户看到「200 局、62% 胜率」无法判断：这是最近三天的还是两个月的？
    // 中间有没有因为超上限丢过大半数据？——而现在上限一到就静默 shift，看的人根本不知道。
    const tsList = arr.map(r => r.ts).filter(t => typeof t === 'number' && t > 0);
    let span = null;
    if (tsList.length) {
        const from = Math.min(...tsList), to = Math.max(...tsList);
        span = { from, to, days: Math.max(0, Math.round((to - from) / 86400000)) };
    }
    const dropped = readMeta().dropped || 0;
    // 按模式分（V1.6.0 只数了场次，是半成品）：single=单机打 AI、pvp=联机。
    //   加 byMode 的初衷是「单机可能挂机刷/开调试，会稀释或抬高整体胜率」，
    //   但只显示「单机 N 局」用户仍无法判断它把胜率拉高还是压低 —— 必须给出各模式各自的胜率才用得上。
    //   所以这里存 {n, wins, winRate, label}，下面的数据健康/导出都按这个结构读。
    const byMode = {};
    for (const r of arr) {
        const k = r.mode || 'unknown';
        const rec = byMode[k] || (byMode[k] = { n: 0, wins: 0 });
        rec.n++;
        if (r.winner === '明教') rec.wins++;
    }
    for (const k of Object.keys(byMode)) {
        const rec = byMode[k];
        rec.winRate = rec.n ? Math.round(rec.wins / rec.n * 100) : 0;
        rec.label = k === 'single' ? '单机' : (k === 'pvp' ? '联机' : (k || '未知'));
    }

    return {
        total, wins, winRate, avgRounds,
        hardest: hardest ? { stage: hardest.stage, rate: Math.round(hardest.rate * 100), n: hardest.n } : null,
        easiest: easiest ? { stage: easiest.stage, rate: Math.round(easiest.rate * 100), n: easiest.n } : null,
        topHero: topEntry
            ? { name: topEntry[0], games: topEntry[1], rate: Math.round((heroWins[topEntry[0]] || 0) / topEntry[1] * 100) }
            : null,
        bestHit, hexTop, recent, summaryLine,
        span, dropped, maxRecords: MAX_RECORDS, byMode
    };
}

// V1.1.0 新增：英雄跨局聚合——看每个英雄的「出场次数 / 胜率 / 平均输出承伤」，
// 直接喂平衡判断：谁长期虚高、谁长期划水一目了然。纯读已有记录，不新增存储。
export function getHeroAggregates(includeEnemy = false) {
    const arr = getCareerRecords();
    if (arr.length === 0) return null;
    const M = {};
    const touch = (u, won) => {
        const a = M[u.name] || (M[u.name] = {
            name: u.name, games: 0, wins: 0, dmgDealt: 0, dmgTaken: 0,
            heal: 0, roundsSum: 0, alive: 0
        });
        a.games++;
        if (won) a.wins++;
        a.dmgDealt += Math.round(u.dmgDealt || 0);
        a.dmgTaken += Math.round(u.dmgTaken || 0);
        a.heal += Math.round(u.healDone || 0);
        a.roundsSum += (u.survivedRounds || 0);
        if (u.alive) a.alive++;
    };
    for (const r of arr) {
        const mWin = r.winner === '明教', eWin = r.winner === '六大派';
        for (const u of (r.ally || [])) touch(u, mWin);
        // V1.3.0 修：默认只统计明教侧。旧版把敌方英雄也并进同一张表，
        //   而敌方英雄「胜率高」= 明教输得多，含义正好相反，极容易被读反
        //   （测试里就出现过「张无忌 100% 胜率」其实是明教必输的假象）。
        //   要看敌方英雄强度请走 112 精英评测，那里有正确的单核对照。
        if (includeEnemy) for (const u of (r.enemy || [])) touch(u, eWin);
    }
    return Object.values(M).map(a => {
        const ci = wilson95(a.wins, a.games);
        return {
            name: a.name,
            games: a.games,
            wins: a.wins,
            winRate: Math.round(a.wins / a.games * 100),
            // 区间 + 可靠标记（V1.3.0）：3 局 100%、2 局 0% 这类会被区间宽度和场次门槛挡下来，
            //   不再把运气当实力（和 126 对海克斯/精英的处理同一口径）。
            ci: ci ? [Math.round(ci[0] * 100), Math.round(ci[1] * 100)] : null,
            reliable: a.games >= HERO_MIN_GAMES,
            avgDmg: Math.round(a.dmgDealt / a.games),
            avgTaken: Math.round(a.dmgTaken / a.games),
            avgHeal: Math.round(a.heal / a.games),
            avgRounds: Math.round(a.roundsSum / a.games * 10) / 10,
            aliveRate: Math.round(a.alive / a.games * 100)
        };
    }).sort((a, b) => b.games - a.games);
}

// V1.8.0 新增：逐海克斯实战胜率——给 126 规则八做「逐海克斯 模拟 vs 实战」对照用。
// 52 每局已经记了 hex（player/42player-core.js 写的是 c.activeBuffs.map(b=>b.key)），
// 与 108 模拟日志的 buffs（116 写的是 buffsPicked.map(b=>b.key)）是同一套 CONFIG.BUFFS key，可直接按 key 匹配。
// mode 可过滤：传 'single' 只取单机（vs AI）对局，与 108 常规榜（也是 vs AI、随机带海克斯）口径对齐；
//   不传则汇总所有模式（含联机——联机是人与人，108 没有对应模拟，混进来会污染对照）。
export function getHexWinRates(mode = null) {
    const arr = getCareerRecords();
    if (arr.length === 0) return null;
    const HEX_MIN_GAMES = 8;   // 逐海克斯门槛：玩家不会每局都带同一个，样本比英雄稀，仍给 ≥8 才判
    const stat = {};
    for (const r of arr) {
        if (mode && r.mode !== mode) continue;
        for (const k of (r.hex || [])) {
            const rec = stat[k] || (stat[k] = { n: 0, w: 0 });
            rec.n++;
            if (r.winner === '明教') rec.w++;
        }
    }
    if (!Object.keys(stat).length) return null;
    const out = Object.entries(stat).map(([k, v]) => {
        const ci = wilson95(v.w, v.n);
        let name = k;
        try { name = (CONFIG.BUFFS && CONFIG.BUFFS[k] && CONFIG.BUFFS[k].name) || HEX_NAMES[k] || k; } catch (e) {}
        return {
            key: k, name, n: v.n, wins: v.w,
            winRate: Math.round(v.w / v.n * 100),
            ci: ci ? [Math.round(ci[0] * 100), Math.round(ci[1] * 100)] : null,
            reliable: v.n >= HEX_MIN_GAMES
        };
    }).sort((a, b) => b.n - a.n);
    return out;
}

// V1.1.0 新增：CSV 导出——每行一个单位，表格软件（Excel/WPS）直接透视/排序。
// 列：局序/关卡/模式/胜方/回合/海克斯/阵营/角色名/定位/位置/输出/承伤/治疗/存活/闪避/暴击/生存回合
export function exportCareerCSV() {
    const arr = getCareerRecords();
    if (arr.length === 0) return null;
    const head = ['局序', '关卡', '模式', '胜方', '回合', '海克斯', '阵营', '角色名', '定位', '位置',
        '输出', '承伤', '治疗', '存活', '闪避', '暴击', '生存回合'];
    const cell = v => {
        const s = String(v == null ? '' : v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [head.join(',')];
    arr.forEach((r, gi) => {
        const hex = (r.hex || []).join('/');
        const pushRow = (list, camp) => {
            for (const u of (list || [])) {
                lines.push([
                    gi + 1, r.stage, r.mode, r.winner, r.rounds, hex, camp, u.name, u.role, u.pos,
                    Math.round(u.dmgDealt || 0), Math.round(u.dmgTaken || 0), Math.round(u.healDone || 0),
                    u.alive ? 1 : 0, u.dodgeCount || 0, u.critCount || 0, u.survivedRounds || 0
                ].map(cell).join(','));
            }
        };
        pushRow(r.ally, '明教');
        pushRow(r.enemy, '六大派');
    });
    return lines.join('\n');
}

// V1.5.0 新增：最近 N 局 vs 之前 N 局——改完数值有没有变化。
// 200 局上限下这是唯一还能做的「趋势」：拿最近 20 局和紧挨着的前 20 局比。
// 【诚实边界】只反映「先后差异」，不知道你什么时候改的数值、改了什么——
//   两组各 20 局的差异本身噪声不小（20 局胜率的标准误差约 ±11pp），所以这里不做显著性判断，
//   只把数字摆出来，方向由人判断。
export function getCareerTrend(recentN = 20) {
    const arr = getCareerRecords();
    if (arr.length < recentN * 2) {
        return { enough: false, need: recentN * 2, have: arr.length, window: recentN };
    }
    const stat = list => ({
        n: list.length,
        winRate: Math.round(list.filter(r => r.winner === '明教').length / list.length * 100),
        avgRounds: Math.round(list.reduce((s, r) => s + (r.rounds || 0), 0) / list.length * 10) / 10,
        avgAlive: Math.round(list.reduce((s, r) => s + (r.ally || []).filter(u => u.alive).length, 0) / list.length * 10) / 10
    });
    const recent = stat(arr.slice(-recentN));
    const earlier = stat(arr.slice(-recentN * 2, -recentN));
    return {
        enough: true, window: recentN, recent, earlier,
        delta: {
            winRate: recent.winRate - earlier.winRate,
            avgRounds: Math.round((recent.avgRounds - earlier.avgRounds) * 10) / 10,
            avgAlive: Math.round((recent.avgAlive - earlier.avgAlive) * 10) / 10
        }
    };
}

// V1.3.0 新增：英雄两两组合——「谁和谁一起上更容易赢」。
// 口径与 126 的海克斯组合一致：组合胜率 vs 两人各自胜率的均值（彼此无协同应接近该均值）。
// 已知局限（写在这里也写在界面上）：一局 5 人只有 10 个对子，样本天然稀疏；
//   而且「第三个人特别强」会被误算成这一对的功劳。所以门槛设 8 局，且结论只当线索看。
export function getHeroPairs(minGames = HERO_MIN_GAMES) {
    const arr = getCareerRecords();
    if (arr.length === 0) return null;
    const solo = {}, pair = {};
    const bump = (m, k, won) => {
        const rec = m[k] || (m[k] = { n: 0, w: 0 });
        rec.n++; if (won) rec.w++;
    };
    for (const r of arr) {
        const won = r.winner === '明教';
        // 先排序再拼 key，避免同一对因阵容站位顺序不同被拆成 "A␀B" / "B␀A" 两条
        const names = [...new Set((r.ally || []).map(u => u.name))].sort();
        for (const n of names) bump(solo, n, won);
        for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
            bump(pair, names[i] + '\u0000' + names[j], won);
        }
    }
    const rows = [];
    for (const [key, d] of Object.entries(pair)) {
        if (d.n < minGames) continue;
        const [a, b] = key.split('\u0000');
        const sa = solo[a], sb = solo[b];
        if (!sa || !sb || !sa.n || !sb.n) continue;
        const p = d.w / d.n;
        const base = (sa.w / sa.n + sb.w / sb.n) / 2;
        const ci = wilson95(d.w, d.n);
        rows.push({
            a, b, n: d.n, wins: d.w,
            winRate: Math.round(p * 100),
            base: Math.round(base * 100),
            delta: Math.round((p - base) * 100),
            ci: ci ? [Math.round(ci[0] * 100), Math.round(ci[1] * 100)] : null,
            reliable: d.n >= minGames
        });
    }
    return rows.sort((x, y) => y.delta - x.delta);
}

// V1.3.0 新增：败因归类——输的局到底输在哪。
// 只做「能量化的共同点」：回合数、剩余人数、总输出/承伤、最常见的「最先倒的人」。
// 不猜走位和操作（记录里没有这些数据，猜就是编）。样本不足时直说不下结论。
export function getLossAnalysis() {
    const arr = getCareerRecords();
    if (arr.length === 0) return null;
    const losses = arr.filter(r => r.winner === '六大派');
    const wins = arr.filter(r => r.winner === '明教');
    const avg = (list, fn) => list.length ? list.reduce((s, r) => s + fn(r), 0) / list.length : null;
    const of = list => ({
        n: list.length,
        rounds: avg(list, r => r.rounds || 0),
        alive: avg(list, r => (r.ally || []).filter(u => u.alive).length),
        dead: avg(list, r => (r.ally || []).filter(u => !u.alive).length),
        dmg: avg(list, r => (r.ally || []).reduce((s, u) => s + (u.dmgDealt || 0), 0)),
        taken: avg(list, r => (r.ally || []).reduce((s, u) => s + (u.dmgTaken || 0), 0))
    });
    const L = of(losses), W = of(wins);
    const f1 = v => (v === null || v === undefined) ? '—' : v.toFixed(1);
    const f0 = v => (v === null || v === undefined) ? '—' : Math.round(v).toString();

    // 「最先倒的人」只统计输局：存活回合最少的已阵亡单位（并列都算）
    const firstDead = {};
    for (const r of losses) {
        const dead = (r.ally || []).filter(u => !u.alive && (u.survivedRounds || 0) > 0);
        if (!dead.length) continue;
        const min = Math.min(...dead.map(u => u.survivedRounds));
        for (const u of dead) if (u.survivedRounds === min) firstDead[u.name] = (firstDead[u.name] || 0) + 1;
    }
    const firstDeadTop = Object.entries(firstDead)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count, share: losses.length ? count / losses.length : 0 }));

    const findings = [];
    if (losses.length < LOSS_MIN) {
        findings.push({
            kind: 'insufficient',
            text: `输局只有 ${losses.length} 局（需 ≥${LOSS_MIN} 局才归因），样本太少，现在说什么都是猜。多打几局再看。`
        });
    } else {
        if (W.rounds && L.rounds !== null && L.rounds < W.rounds * 0.75) {
            findings.push({
                kind: 'rush',
                text: `被速推：输的局平均 ${f1(L.rounds)} 回合就结束，赢的局要 ${f1(W.rounds)} 回合`
                    + ` → 前期站不住，先补前排/减伤，堆输出救不了。`
            });
        }
        if (W.alive !== null && L.alive !== null && L.alive < W.alive - 1.2) {
            findings.push({
                kind: 'wipe',
                text: `团灭型失败：输的局平均只剩 ${f1(L.alive)} 人活下来（赢局剩 ${f1(W.alive)} 人）`
                    + ` → 是整体崩盘，不是某一个英雄拖后腿。`
            });
        }
        if (W.dmg && L.dmg !== null && L.dmg < W.dmg * 0.8) {
            findings.push({
                kind: 'dps',
                text: `输出打不出来：输的局我方总输出 ${f0(L.dmg)}，赢局 ${f0(W.dmg)}（少了 ${Math.round((1 - L.dmg / W.dmg) * 100)}%）`
                    + ` → 更像被控/被秒，不是单纯数值不够。`
            });
        }
        if (W.taken && L.taken !== null && L.taken > W.taken * 1.2) {
            findings.push({
                kind: 'tank',
                text: `承伤偏高：输的局我方总承伤 ${f0(L.taken)}，赢局 ${f0(W.taken)}`
                    + ` → 挨打太多，先查减伤/治疗够不够。`
            });
        }
        const top = firstDeadTop[0];
        if (top && top.count >= LOSS_MIN && top.share >= 0.5) {
            findings.push({
                kind: 'firstblood',
                text: `${top.name} 是最常见的突破口：${losses.length} 局输局里有 ${top.count} 局（${Math.round(top.share * 100)}%）是他最先倒`
                    + ` → 优先给他加血/减伤，或者调站位。`
            });
        }
        if (!findings.length) {
            findings.push({
                kind: 'even',
                text: `输局和赢局在回合数、存活人数、输出承伤上都没明显差距（${L.n} 败 vs ${W.n} 胜）`
                    + ` → 更像单局随机波动，或者问题出在没被记录的维度（站位/技能释放时机）。`
            });
        }
    }
    return {
        losses: losses.length, wins: wins.length,
        loss: L, win: W,
        firstDead: firstDeadTop.slice(0, 5),
        findings
    };
}
