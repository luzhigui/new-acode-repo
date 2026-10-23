// player/52-career-log.js — 生涯记录（本地累积每局摘要，一键导出给 AI 分析）
// V1.0.0 | 2026-10-23 | ~5200 bytes
// 只存摘要（阵容/结果/单位统计/回合走势），不存 steps——localStorage 约 5MB，
//   完整战报单局几百 KB 到 2MB，只有「保存战报」按钮按需导出单局时才用。
// 摘要单局约 2~3KB，上限 200 局约 600KB。
// 写入失败（配额满/隐私模式）静默跳过，不打断战斗。
import { FACT_TYPES, CAMP_TYPES } from '../infra/56-battle-enums.js';

export const VER = 'player/52-career-log.js V1.0.0';

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

    const byStage = {};
    for (const r of arr) {
        const s = r.stage || 0;
        if (!byStage[s]) byStage[s] = { n: 0, w: 0 };
        byStage[s].n++;
        if (r.winner === '明教') byStage[s].w++;
    }
    const stages = Object.entries(byStage)
        .map(([s, v]) => ({ stage: +s, n: v.n, rate: v.w / v.n }))
        .filter(s => s.n >= 3);
    const hardest = stages.slice().sort((a, b) => a.rate - b.rate)[0] || null;
    const easiest = stages.slice().sort((a, b) => b.rate - a.rate)[0] || null;

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

    return {
        total, wins, winRate, avgRounds,
        hardest: hardest ? { stage: hardest.stage, rate: Math.round(hardest.rate * 100), n: hardest.n } : null,
        easiest: easiest ? { stage: easiest.stage, rate: Math.round(easiest.rate * 100), n: easiest.n } : null,
        topHero: topEntry
            ? { name: topEntry[0], games: topEntry[1], rate: Math.round((heroWins[topEntry[0]] || 0) / topEntry[1] * 100) }
            : null
    };
}