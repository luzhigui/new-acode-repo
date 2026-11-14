// tools/850-stage-elite-panel.js —— 工具箱「🎯 关卡精英评分」页签
// 口径（2026-11-14 老板定）：
//   ① 明教精英榜：两套固定明教骨架（全普通兵，队友永远同一批），被测明教精英按同职业换进骨架，
//      打七关原生防守，看各关明教胜率；
//   ② 六大派防守榜：明教用同一套固定骨架（阵容 A），把该关防守里的一名普通杂兵按同职业换成被测
//      六大派精英，看明教胜率 —— 越低说明防守越强，防守分 = 100 − 明教胜率。
export const VER = 'tools/850-stage-elite-panel.js V1.0.0';

import { runParallel } from './817-shared-worker-runner.js';
import { loadGameData, getGameData } from '../core/201-config-5v5-test.js';

const STAGES = [1, 2, 3, 4, 5, 6, 7];

// 固定明教骨架：全部普通兵（非具名），同一候选永远同一群队友。
//   pos：1-3 前排 / 4-6 中排 / 7-9 后排。
const LINEUPS = [
    { id: 'A-均衡', units: [
        { name: '颜垣', role: '防战', pos: 1 },
        { name: '范遥', role: '战士', pos: 2 },
        { name: '吴劲草', role: '战士', pos: 3 },
        { name: '冷谦', role: '战士', pos: 4 },
        { name: '明教洪午', role: '远程', pos: 7 },
        { name: '明教岳山', role: '远程', pos: 8 }
    ] },
    { id: 'B-前排厚', units: [
        { name: '颜垣', role: '防战', pos: 1 },
        { name: '明教石虎', role: '战士', pos: 2 },
        { name: '明教弟子1', role: '战士', pos: 3 },
        { name: '范遥', role: '战士', pos: 4 },
        { name: '冷谦', role: '远程', pos: 7 },
        { name: '吴劲草', role: '远程', pos: 8 }
    ] }
];

// 六大派防守榜的固定攻方：阵容 A + 寒离飒（同为固定队友）。
// 为什么不用纯普通兵骨架：基线胜率只有 0~13%，防守方再强也只会贴 0（全员防守分 100，读不出差距）；
// 换成这套中强度攻方后，多数关卡还有 30~70% 的下探空间。
const DEF_ATK = {
    id: 'D-攻方',
    units: [
        { name: '颜垣', role: '防战', pos: 1 },
        { name: '寒离飒', role: '战士', pos: 2 },
        { name: '吴劲草', role: '战士', pos: 3 },
        { name: '冷谦', role: '战士', pos: 4 },
        { name: '明教洪午', role: '远程', pos: 7 },
        { name: '明教岳山', role: '远程', pos: 8 }
    ]
};

const startBtn = document.getElementById('seStartBtn');
const runsInput = document.getElementById('seRuns');
const enemyHexChk = document.getElementById('seEnemyHex');
const progressEl = document.getElementById('seProgress');
const resultEl = document.getElementById('seResult');
const copyBtn = document.getElementById('seCopyBtn');
if (!startBtn) { /* 无该页签时静默 */ }

let lastText = '';

const pct = v => (v == null ? '—' : Math.round(v * 100) + '%');

function roleOfName(name) {
    const base = String(name).split('·')[0];
    const ch = getGameData()?.characters?.[base];
    if (!ch) return null;
    if (ch.role) return ch.role;
    return (ch.tags || []).find(t => ['防战', '战士', '远程', '飞行', '标枪'].includes(t)) || null;
}

function collectCands(camp) {
    const out = [];
    for (const [n, c] of Object.entries(getGameData()?.characters || {})) {
        if (c.camp !== camp || !c.named || c.tier === 'summon' || c.m == null) continue;
        if (camp === '明教' && n === '小昭') {
            // 小昭姊/妹是两种形态（initXiaoZhao 另算血攻防），分开测
            out.push({ name: '小昭·姊', role: c.role || roleOfName(n) });
            out.push({ name: '小昭·妹', role: c.role || roleOfName(n) });
            continue;
        }
        out.push({ name: n, role: c.role || roleOfName(n) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
}

const bump = (map, key, part) => {
    const cur = map.get(key) || { wins: 0, runs: 0, draws: 0, skipped: 0 };
    cur.wins += Number(part && part.wins || 0);
    cur.runs += Number(part && part.runs || 0);
    cur.draws += Number(part && part.draws || 0);
    if (part && part.skipped) cur.skipped++;
    map.set(key, cur);
};

startBtn?.addEventListener('click', async () => {
    const chars = getGameData()?.characters;
    if (!chars) { progressEl.textContent = '游戏数据还没加载完，稍后再点'; return; }
    const RUNS = Math.max(5, Math.min(300, parseInt(runsInput.value, 10) || 40));
    const ming = collectCands('明教');
    const six = collectCands('六大派');
    if (!ming.length || !six.length) { progressEl.textContent = '候选名单为空，检查 characters 数据'; return; }

    const jobs = [];
    for (const c of ming) for (const L of LINEUPS) for (const st of STAGES) {
        jobs.push({
            mode: 'ally', cand: c, lineupId: L.id, allyUnits: L.units, stage: st, runs: RUNS,
            key: `ally|${c.name}|${st}`, label: `${c.name}@阵容${L.id}/第${st}关`
        });
    }
    // 基线：不换人的固定阵容（明教榜两套 + 六大派榜攻方）
    for (const L of [...LINEUPS, DEF_ATK]) for (const st of STAGES) {
        jobs.push({
            mode: 'ally', cand: null, lineupId: L.id, allyUnits: L.units, stage: st, runs: RUNS,
            key: `base|${L.id}|${st}`, label: `基线-阵容${L.id}/第${st}关`
        });
    }
    for (const c of six) for (const st of STAGES) {
        jobs.push({
            mode: 'enemy', cand: c, lineupId: DEF_ATK.id, allyUnits: DEF_ATK.units, stage: st, runs: RUNS,
            key: `enemy|${c.name}|${st}`, label: `${c.name}@第${st}关防守`
        });
    }

    const allyAcc = new Map();
    const enemyAcc = new Map();
    const baseAcc = new Map();
    const t0 = performance.now();
    startBtn.disabled = true;
    progressEl.textContent = `准备 ${jobs.length} 个任务（每格 ${RUNS} 场）…`;

    try {
        await runParallel({
            jobs,
            kind: 'stageAB',
            nextJobMsg: (job, id) => ({
                jobId: id, kind: 'stageAB',
                stage: job.stage, mode: job.mode, allyUnits: job.allyUnits,
                cand: job.cand, runs: job.runs, startIndex: 0,
                enemyHex: !!(enemyHexChk && enemyHexChk.checked)
            }),
            onJobDone: (finished, total, job, part) => {
                if (job.key.startsWith('base|')) bump(baseAcc, `${job.lineupId}|${job.stage}`, part);
                else if (job.mode === 'ally') bump(allyAcc, job.key, part);
                else bump(enemyAcc, job.key, part);
                if (finished % 10 === 0 || finished === total) {
                    progressEl.textContent = `已跑 ${finished}/${total} 组（${job.label}），已用 ${((performance.now() - t0) / 1000).toFixed(1)}s`;
                }
            },
            onAllDone: () => render(ming, six, allyAcc, enemyAcc, baseAcc, RUNS)
        });
        progressEl.textContent = `✅ 完成 ${jobs.length} 组，总耗时 ${((performance.now() - t0) / 1000).toFixed(1)}s`;
    } catch (e) {
        console.error('[stageElite] 异常:', e);
        progressEl.textContent = '出错：' + e.message;
    } finally {
        startBtn.disabled = false;
    }
});

function cellRate(map, key) {
    const v = map.get(key);
    if (!v || !v.runs) return null;
    return v.wins / v.runs;
}

function rateColor(rate, invert) {
    if (rate == null) return '#888';
    const r = invert ? 1 - rate : rate;
    if (r >= 0.6) return '#4caf50';
    if (r <= 0.4) return '#f44336';
    return '#ffd700';
}

function render(ming, six, allyAcc, enemyAcc, baseAcc, RUNS) {
    const stages = STAGES;
    const L = [];
    let html = `<p style="color:#888;font-size:11px;margin:0 0 8px">每格 ${RUNS} 场｜固定阵容：`
        + [...LINEUPS, DEF_ATK].map(x => `${x.id}＝${x.units.map(u => u.name).join('/')}`).join('；')
        + '｜双海克斯</p>';

    // 基线：两套阵容各关（不换人）
    html += '<p style="color:#7f8aa8;font-size:11px;margin:0 0 10px">不换人基线：'
        + [...LINEUPS, DEF_ATK].map(x => `${x.id} ` + stages.map(st => {
            const v = baseAcc.get(`${x.id}|${st}`);
            return `关${st} ${v && v.runs ? pct(v.wins / v.runs) : '—'}`;
        }).join(' / ')).join('｜') + '</p>';

    const avgOf = (acc, name) => {
        let w = 0, r = 0;
        for (const st of stages) {
            const v = acc.get(`ally|${name}|${st}`) || acc.get(`enemy|${name}|${st}`);
            if (v && v.runs) { w += v.wins; r += v.runs; }
        }
        return r ? w / r : null;
    };

    // ── 明教精英榜 ──
    L.push('=== 不换人基线（明教胜率） ===');
    L.push(['阵容', ...stages.map(s => '关' + s)].join('\t'));
    for (const x of [...LINEUPS, DEF_ATK]) {
        L.push([x.id, ...stages.map(st => {
            const v = baseAcc.get(`${x.id}|${st}`);
            return v && v.runs ? pct(v.wins / v.runs) : '—';
        })].join('\t'));
    }
    L.push('');
    html += '<p style="color:#ffd700;font-weight:bold;margin:14px 0 6px;">明教精英榜（胜率越高越强；每关 = 两套固定阵容平均）</p>';
    html += '<table class="elite-table"><thead><tr><th>#</th><th>单位</th><th>职业</th>'
        + stages.map(st => `<th>关${st}</th>`).join('') + '<th>平均</th></tr></thead><tbody>';
    L.push('=== 明教精英榜（明教胜率） ===');
    L.push(['#', '单位', '职业', ...stages.map(s => '关' + s), '平均'].join('\t'));

    ming.map(c => ({ c, avg: avgOf(allyAcc, c.name) })).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))
        .forEach((row, i) => {
            const c = row.c;
            const cells = stages.map(st => {
                const r = cellRate(allyAcc, `ally|${c.name}|${st}`);
                return `<td style="color:${rateColor(r)}">${pct(r)}</td>`;
            }).join('');
            html += `<tr><td>${i + 1}</td><td>${c.name}</td><td>${c.role || '-'}</td>${cells}`
                + `<td style="color:${rateColor(row.avg)}"><b>${pct(row.avg)}</b></td></tr>`;
            L.push([i + 1, c.name, c.role || '-', ...stages.map(st => pct(cellRate(allyAcc, `ally|${c.name}|${st}`))), pct(row.avg)].join('\t'));
        });
    html += '</tbody></table>';

    // ── 六大派防守榜 ──
    html += '<p style="color:#ffd700;font-weight:bold;margin:18px 0 6px;">六大派防守榜（攻方固定 = 阵容 A + 寒离飒；明教胜率越低＝防守越强，防守分 = 100 − 明教胜率）</p>';
    html += '<table class="elite-table"><thead><tr><th>#</th><th>单位</th><th>职业</th>'
        + stages.map(st => `<th>关${st}</th>`).join('') + '<th>平均明教胜率</th><th>防守分</th></tr></thead><tbody>';
    L.push('');
    L.push('=== 六大派防守榜（防守分 = 100 − 明教胜率） ===');
    L.push(['#', '单位', '职业', ...stages.map(s => '关' + s), '平均明教胜率', '防守分'].join('\t'));

    six.map(c => ({ c, avg: avgOf(enemyAcc, c.name) })).sort((a, b) => (a.avg ?? 2) - (b.avg ?? 2))
        .forEach((row, i) => {
            const c = row.c;
            const skipped = stages.filter(st => (enemyAcc.get(`enemy|${c.name}|${st}`) || {}).skipped).length;
            const cells = stages.map(st => {
                const v = enemyAcc.get(`enemy|${c.name}|${st}`) || {};
                if (!v.runs) return `<td style="color:#666" title="${v.skipped === 'native' ? '该关原生防守已含此人' : '无可换杂兵位'}">—</td>`;
                return `<td style="color:${rateColor(v.wins / v.runs, true)}">${pct(v.wins / v.runs)}</td>`;
            }).join('');
            const score = row.avg == null ? null : 1 - row.avg;
            html += `<tr><td>${i + 1}</td><td>${c.name}</td><td>${c.role || '-'}</td>${cells}`
                + `<td>${pct(row.avg)}</td>`
                + `<td style="color:${rateColor(row.avg, true)}"><b>${score == null ? '—' : Math.round(score * 100)}</b></td></tr>`;
            L.push([i + 1, c.name, c.role || '-',
                ...stages.map(st => {
                    const v = enemyAcc.get(`enemy|${c.name}|${st}`) || {};
                    return v.runs ? pct(v.wins / v.runs) : '—';
                }),
                pct(row.avg), score == null ? '—' : Math.round(score * 100)].join('\t'));
            if (skipped) L.push(`  （${c.name}：${skipped} 关原生防守已含此人或无可换位，记 —）`);
        });
    html += '</tbody></table>';
    html += '<p style="color:#666;font-size:11px;margin-top:10px">「—」＝该关防守本来就带这名单位 / 没有可换的杂兵位；平均只统计有场次的关。</p>';

    resultEl.innerHTML = html;
    lastText = L.join('\n');
}

copyBtn?.addEventListener('click', async () => {
    if (!lastText) { progressEl.textContent = '还没有结果可复制'; return; }
    try { await navigator.clipboard.writeText(lastText); }
    catch (e) {
        const ta = document.createElement('textarea');
        ta.value = lastText;
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    const old = copyBtn.textContent;
    copyBtn.textContent = '已复制';
    setTimeout(() => { copyBtn.textContent = old; }, 1500);
});

(async () => {
    try { await loadGameData(); } catch (e) { console.error('[stageElite] 数据加载失败:', e); }
})();
