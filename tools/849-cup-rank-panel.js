// tools/849-cup-rank-panel.js —— 工具箱「🏆 交叉积分赛」页签
// 明教每个被测单位 × 六大派每个被测单位，两两对战（各配本方均衡骨架、同职业替换），
// 每场胜 3 分 / 平 1 分 / 负 0 分，按总积分出两个阵营的排名。双海克斯。
export const VER = 'tools/849-cup-rank-panel.js V1.0.0';

import { runParallel } from './817-shared-worker-runner.js';
import { loadGameData, getGameData } from '../core/201-config-5v5-test.js';

const startBtn = document.getElementById('cupStartBtn');
const runsInput = document.getElementById('cupRuns');
const progressEl = document.getElementById('cupProgress');
const resultEl = document.getElementById('cupResult');
const copyBtn = document.getElementById('cupCopyBtn');
if (!startBtn) { /* 无该页签时静默 */ }

let TPL = null;
let lastText = '';
let lastCsv = [];

const front = r => r === '防战' || r === '战士';

function roleOf(name) {
    const ch = getGameData()?.characters?.[name];
    if (!ch) return null;
    if (ch.role) return ch.role;
    for (const r of ['防战', '战士', '远程', '飞行', '标枪']) if ((ch.tags || []).includes(r)) return r;
    return null;
}
function candSpec(raw) {
    const o = typeof raw === 'string' ? { name: raw } : raw;
    return { name: o.name, role: o.role || roleOf(o.name) };
}
// 把被测单位换进骨架：同职业 → 同排 → 末位（与 worker 的替换口径一致）
function compose(units, cand) {
    const arr = units.map(u => ({ ...u }));
    if (!cand) return arr;
    let i = arr.findIndex(u => u.role === cand.role);
    if (i < 0) i = arr.findIndex(u => front(u.role) === front(cand.role));
    if (i < 0) i = arr.length - 1;
    arr[i] = { name: cand.name, role: cand.role, pos: arr[i].pos };
    return arr;
}

startBtn?.addEventListener('click', async () => {
    if (!TPL) return;
    const RUNS = Math.max(5, Math.min(500, parseInt(runsInput.value, 10) || 100));
    const chars = getGameData().characters;
    const BM = TPL.b.find(b => b.id === 'BM-均衡');
    const BS = TPL.b.find(b => b.id === 'BS-均衡');
    const ming = TPL.candidates.map(candSpec).filter(c => chars[c.name]?.camp === '明教' && c.role);
    const six = TPL.candidates.map(candSpec).filter(c => chars[c.name]?.camp === '六大派' && c.role);
    if (!ming.length || !six.length) { progressEl.textContent = '候选里缺少某一方阵营的单位'; return; }

    const jobs = [];
    for (const m of ming) for (const s of six) {
        jobs.push({
            m, s, runs: RUNS,
            key: `${m.name}|${s.name}`,
            label: `${m.name} vs ${s.name}`,
            aUnits: compose(BS.units, s),
            bUnits: BM.units,
            cand: m
        });
    }

    const acc = new Map();
    const t0 = performance.now();
    startBtn.disabled = true;
    progressEl.textContent = `准备 ${jobs.length} 个任务（${ming.length}×${six.length}）…`;

    try {
        await runParallel({
            jobs,
            kind: 'templateAB',
            nextJobMsg: (job, id) => ({
                jobId: id, kind: 'templateAB',
                aUnits: job.aUnits, bUnits: job.bUnits, cand: job.cand,
                runs: job.runs, startIndex: 0
            }),
            onJobDone: (finished, total, job, part) => {
                const cur = acc.get(job.key) || { wins: 0, draws: 0, runs: 0 };
                cur.wins += Number(part?.wins || 0);
                cur.draws += Number(part?.draws || 0);
                cur.runs += Number(part?.runs || 0);
                acc.set(job.key, cur);
                if (finished % 7 === 0 || finished === total) {
                    progressEl.textContent = `${job.label} 完成 (${finished}/${total}，已用 ${((performance.now() - t0) / 1000).toFixed(1)}s)`;
                }
            },
            onAllDone: () => render(ming, six, acc)
        });
        progressEl.textContent = `✅ 完成 ${jobs.length} 组，总耗时 ${((performance.now() - t0) / 1000).toFixed(1)}s`;
    } catch (e) {
        console.error('[cup] 异常:', e);
        progressEl.textContent = '出错：' + e.message;
    } finally {
        startBtn.disabled = false;
    }
});

function render(ming, six, acc) {
    const mingScore = new Map(), sixScore = new Map();
    const init = n => ({ pts: 0, w: 0, d: 0, l: 0, runs: 0 });
    ming.forEach(c => mingScore.set(c.name, init()));
    six.forEach(c => sixScore.set(c.name, init()));

    for (const m of ming) for (const s of six) {
        const v = acc.get(`${m.name}|${s.name}`) || { wins: 0, draws: 0, runs: 0 };
        const lose = Math.max(0, v.runs - v.wins - v.draws);
        const a = mingScore.get(m.name);
        a.w += v.wins; a.d += v.draws; a.l += lose; a.runs += v.runs;
        a.pts += v.wins * 3 + v.draws * 1;
        const b = sixScore.get(s.name);
        b.w += lose; b.d += v.draws; b.l += v.wins; b.runs += v.runs;
        b.pts += lose * 3 + v.draws * 1;
    }

    const rank = (camp, map) => [...map.entries()]
        .map(([name, v]) => ({ name, role: roleOf(name) || '-', ...v, win: v.runs ? v.w : 0 }))
        .sort((a, b) => b.pts - a.pts || b.w - a.w);

    const tables = [['明教', rank('明教', mingScore)], ['六大派', rank('六大派', sixScore)]];
    let html = `<p style="color:#888;font-size:12px;line-height:1.6;margin:0 0 10px">积分 = 胜×3 + 平×1；每个单位都与对方阵营全部单位各打 ${ming[0] ? '' : ''}N 场。</p>`;
    const L = [];

    for (const [camp, rows] of tables) {
        html += `<p style="color:#ffd700;font-weight:bold;margin:14px 0 6px;">${camp}排名</p>`;
        html += '<table class="elite-table"><thead><tr><th>#</th><th>单位</th><th>职业</th><th>积分</th><th>胜-平-负</th><th>胜率</th><th>场次</th></tr></thead><tbody>';
        L.push(`=== ${camp}排名 ===`);
        L.push(['#', '单位', '职业', '积分', '胜-平-负', '胜率', '场次'].join('\t'));
        rows.forEach((r, i) => {
            const wr = r.runs ? (r.w / r.runs * 100).toFixed(0) + '%' : '-';
            const color = r.pts >= (rows[0].pts * 0.75) ? '#4caf50' : (i >= rows.length - 2 ? '#f44336' : '#ffd700');
            html += `<tr><td>${i + 1}</td><td>${r.name}</td><td>${r.role}</td><td style="color:${color}"><b>${r.pts}</b></td>`
                + `<td>${r.w}-${r.d}-${r.l}</td><td>${wr}</td><td>${r.runs}</td></tr>`;
            L.push([i + 1, r.name, r.role, r.pts, `${r.w}-${r.d}-${r.l}`, wr, r.runs].join('\t'));
            lastCsv.push([camp, i + 1, r.name, r.role, r.pts, `${r.w}-${r.d}-${r.l}`, wr, r.runs]);
        });
        html += '</tbody></table>';
        L.push('');
    }
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
    try {
        await loadGameData();
        TPL = await (await fetch('./847-templates.json')).json();
    } catch (e) {
        console.error('[cup] 初始化失败:', e);
    }
})();
