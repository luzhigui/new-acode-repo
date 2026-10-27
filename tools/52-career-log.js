// tools/52-career-log.js — 生涯记录（本地累积每局摘要，一键导出给 AI 分析）
// V1.1.0 | 2026-10-27 | 由 player/ 迁入 tools/（入口保留：战斗内写入在 42player-core、查看在 dev-index）
//         新增 getHeroAggregates()（英雄跨局聚合）与 exportCareerCSV()（表格软件友好导出）
// 只存摘要（阵容/结果/单位统计/回合走势），不存 steps——localStorage 约 5MB，
//   完整战报单局几百 KB 到 2MB，只有「保存战报」按钮按需导出单局时才用。
// 摘要单局约 2~3KB，上限 200 局约 600KB。
// 写入失败（配额满/隐私模式）静默跳过，不打断战斗。
import { FACT_TYPES, CAMP_TYPES } from '../infra/56-battle-enums.js';
import { CONFIG } from '../core/01config-5v5-test.js';

export const VER = 'tools/52-career-log.js V1.1.0';

const LS_KEY = 'ming_career_log_5v5_test';
const MAX_RECORDS = 200;

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
        while (arr.length > MAX_RECORDS) arr.shift();
        localStorage.setItem(LS_KEY, JSON.stringify(arr));
        return true;
    } catch (e) { return false; }
}

export function clearCareerRecords() {
    try { localStorage.removeItem(LS_KEY); return true; } catch (e) { return false; }
}

// Markdown 导出（给 AI 分析：比 JSON 省 token 且可读）
export function exportCareerMarkdown() {
    const arr = getCareerRecords();
    if (arr.length === 0) return null;
    const lines = [];
    lines.push(`# 光明顶 5v5 生涯记录（共 ${arr.length} 局）`, '');

    const total = arr.length;
    const winA = arr.filter(r => r.winner === '明教').length;
    const winE = arr.filter(r => r.winner === '六大派').length;
    lines.push('## 汇总');
    lines.push(`总场次 ${total} ｜ 明教 ${winA} 胜 ｜ 六大派 ${winE} 胜 ｜ 平局 ${total - winA - winE}`);

    const byStage = {};
    for (const r of arr) {
        const s = r.stage || 0;
        if (!byStage[s]) byStage[s] = { n: 0, w: 0 };
        byStage[s].n++;
        if (r.winner === '明教') byStage[s].w++;
    }
    lines.push('各关明教胜率：' + Object.keys(byStage).sort((a, b) => a - b)
        .map(s => `s${s} ${Math.round(byStage[s].w / byStage[s].n * 100)}%(${byStage[s].n})`)
        .join(' '));

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
    const top = Object.entries(appear).sort((a, b) => b[1] - a[1]).slice(0, 12);
    lines.push('明教出场率 Top：' + top.map(([n, c]) =>
        `${n} ${c}局(${Math.round((heroWins[n] || 0) / c * 100)}%)`).join(' / '));
    lines.push('');

    for (let i = arr.length - 1; i >= 0; i--) {
        const r = arr[i];
        const hex = (r.hex && r.hex.length) ? ` ｜ 海克斯: ${r.hex.join('/')}` : '';
        lines.push(`## 第 ${i + 1} 局 ｜ s${r.stage} ｜ ${r.winner}胜 ｜ ${r.rounds} 回合${hex}`);
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

    // 各关胜率：门槛降到 1 局，卡片上标局数，让读者自己判断可信度
    const byStage = {};
    for (const r of arr) {
        const s = r.stage || 0;
        if (!byStage[s]) byStage[s] = { n: 0, w: 0 };
        byStage[s].n++;
        if (r.winner === '明教') byStage[s].w++;
    }
    const stages = Object.entries(byStage).map(([s, v]) => ({ stage: +s, n: v.n, rate: v.w / v.n }));
    const hardest = stages.slice().sort((a, b) => a.rate - b.rate)[0] || null;
    // “最易”至少要 3 局样本，避免 1 局 100% 胜率挤掉真实数据
    const easiest = stages.filter(x => x.n >= 3).sort((a, b) => b.rate - a.rate)[0] || null;

    // 主力英雄：明教侧出场次数最多
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
        // 补充手动映射，防止 holyFire 这种新海克斯显示英文 key
        const HEX_NAMES = {
            doubleStrike: '概率连击', horseFormation: '巨马阵', carry: '你就是carry',
            windAssault: '乘风突袭', cloudBody: '流云身法', mindControl: '惑人心智',
            fortify: '严阵以待', hotBlood: '热血奋战', meteorShower: '流星赶月',
            bloodthirst: '嗜血狂刀', holyFlame: '圣火令', soulDrain: '摄魂',
            holyFire: '圣火不熄', lastStand: '背水一战', unity: '众志成城'
        };
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

    return {
        total, wins, winRate, avgRounds,
        hardest: hardest ? { stage: hardest.stage, rate: Math.round(hardest.rate * 100), n: hardest.n } : null,
        easiest: easiest ? { stage: easiest.stage, rate: Math.round(easiest.rate * 100), n: easiest.n } : null,
        topHero: topEntry
            ? { name: topEntry[0], games: topEntry[1], rate: Math.round((heroWins[topEntry[0]] || 0) / topEntry[1] * 100) }
            : null,
        bestHit, hexTop, recent, summaryLine
    };
}

// V1.1.0 新增：英雄跨局聚合——看每个英雄的「出场次数 / 胜率 / 平均输出承伤」，
// 直接喂平衡判断：谁长期虚高、谁长期划水一目了然。纯读已有记录，不新增存储。
export function getHeroAggregates() {
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
        for (const u of (r.enemy || [])) touch(u, eWin);
    }
    return Object.values(M).map(a => ({
        name: a.name,
        games: a.games,
        winRate: Math.round(a.wins / a.games * 100),
        avgDmg: Math.round(a.dmgDealt / a.games),
        avgTaken: Math.round(a.dmgTaken / a.games),
        avgHeal: Math.round(a.heal / a.games),
        avgRounds: Math.round(a.roundsSum / a.games * 10) / 10,
        aliveRate: Math.round(a.alive / a.games * 100)
    })).sort((a, b) => b.games - a.games);
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
