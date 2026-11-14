// tools/848-template-power-panel.js —— 工具箱「⚔ 模板战力」页签（前端）
// 与 847-template-power.mjs（node CLI）同口径：A 池靶子 × B 池骨架，被测单位替换同职业位，统计被测方胜率。
// 跑批复用 816 worker 的 kind:'templateAB'；模板名单读 ./847-templates.json。
export const VER = 'tools/848-template-power-panel.js V1.0.0';

import { runParallel } from './817-shared-worker-runner.js';
import { loadGameData, getGameData } from '../core/201-config-5v5-test.js';

const startBtn = document.getElementById('tpStartBtn');
const runsInput = document.getElementById('tpRuns');
const progressEl = document.getElementById('tpProgress');
const poolsEl = document.getElementById('tpPools');
const resultEl = document.getElementById('tpResult');
const csvBtn = document.getElementById('tpCsvBtn');
if (!startBtn) { /* 页面无该页签时静默 */ }

let TPL = null;
let lastTable = [];

const isFront = r => r === '防战' || r === '战士';

function roleOf(name) {
    const ch = getGameData()?.characters?.[name];
    if (!ch) return null;
    if (ch.role) return ch.role;
    for (const r of ['防战', '战士', '远程', '飞行', '标枪']) {
        if ((ch.tags || []).includes(r)) return r;
    }
    return null;
}
function candSpec(raw) {
    const o = typeof raw === 'string' ? { name: raw } : raw;
    return {
        name: o.name,
        role: o.role || roleOf(o.name),
        kind: o.kind || 'dps',
        pos: o.pos || null
    };
}

function renderPools() {
    const card = (title, cls, items) => `
        <div class="file-group open" style="margin-bottom:8px;">
            <div class="group-header"><span class="group-name">${title}</span><span class="group-count">${items.length} 个</span></div>
            <div class="group-files">${items.map(v => `<label class="file-item"><input type="checkbox" class="${cls}" value="${v.val}" checked>${v.label}</label>`).join('')}</div>
        </div>`;
    const aItems = TPL.a.map(a => ({ val: a.id, label: `${a.id}（${a.camp}/${a.tier}）` }));
    const bItems = TPL.b.map(b => ({ val: b.id, label: `${b.id}（${b.camp}）` }));
    const cItems = TPL.candidates.map((c, i) => {
        const s = candSpec(c);
        return { val: i, label: `${s.name}（${s.role || '无职业'}）` };
    });
    poolsEl.innerHTML = card('🎯 A 池（靶子）', 'tp-a', aItems) + card('🧱 B 池（骨架）', 'tp-b', bItems) + card('👤 被测单位', 'tp-c', cItems);
}

function selected(cls) {
    return [...poolsEl.querySelectorAll(`.${cls}:checked`)].map(el => el.value);
}

startBtn?.addEventListener('click', async () => {
    if (!TPL) return;
    const RUNS = Math.max(5, Math.min(500, parseInt(runsInput.value, 10) || 30));
    const aSel = selected('tp-a'), bSel = selected('tp-b'), cSel = selected('tp-c').map(i => candSpec(TPL.candidates[+i]));
    if (!aSel.length || !bSel.length || !cSel.length) { progressEl.textContent = '请至少勾选一套 A、一套 B、一个被测单位'; return; }

    const A = TPL.a.filter(a => aSel.includes(a.id));
    const B = TPL.b.filter(b => bSel.includes(b.id));
    const chars = getGameData().characters;
    const jobs = [];

    // 基线：不替换（用于判断靶子档位）
    for (const b of B) for (const a of A.filter(x => x.camp !== b.camp)) {
        jobs.push({ kind: 'base', a, b, cand: null, runs: RUNS, key: `__base|${b.id}|${a.id}`, label: `基线 ${b.id} vs ${a.id}` });
    }
    for (const c of cSel) {
        if (!c.role) continue;
        const camp = chars[c.name]?.camp;
        for (const b of B.filter(x => x.camp === camp && (!x.kinds || x.kinds.includes(c.kind)))) {
            for (const a of A.filter(x => x.camp !== camp)) {
                jobs.push({ kind: 'cand', a, b, cand: c, runs: RUNS, key: `${c.name}|${a.id}`, label: `${c.name} vs ${a.id}` });
            }
        }
    }
    if (!jobs.length) { progressEl.textContent = '没有匹配的组合（检查阵营：被测单位要与 B 同阵营、与 A 不同阵营）'; return; }

    const acc = new Map();
    const t0 = performance.now();
    startBtn.disabled = true;
    progressEl.textContent = `准备 ${jobs.length} 个任务…`;

    try {
        await runParallel({
            jobs,
            kind: 'templateAB',
            nextJobMsg: (job, id) => ({
                jobId: id, kind: 'templateAB',
                aUnits: job.a.units, bUnits: job.b.units, cand: job.cand,
                runs: job.runs, startIndex: 0
            }),
            onJobDone: (finished, total, job, part) => {
                const cur = acc.get(job.key) || { wins: 0, runs: 0 };
                cur.wins += Number(part?.wins || 0);
                cur.runs += Number(part?.runs || 0);
                acc.set(job.key, cur);
                progressEl.textContent = `${job.label} 完成 (${finished}/${total}，已用 ${((performance.now() - t0) / 1000).toFixed(1)}s)`;
            },
            onAllDone: () => renderAll(jobs, acc)
        });
        progressEl.textContent = `✅ 完成，总耗时 ${((performance.now() - t0) / 1000).toFixed(1)}s`;
    } catch (e) {
        console.error('[template-power] 异常:', e);
        progressEl.textContent = '出错：' + e.message;
        resultEl.innerHTML = `<div class="elite-empty">出错：${e.message}<br>完整堆栈见 F12</div>`;
    } finally {
        startBtn.disabled = false;
    }
});

function pct(w, n) { return n ? (w / n * 100).toFixed(0) + '%' : '-'; }

function renderAll(jobs, acc) {
    // 基线
    const baseRows = jobs.filter(j => j.kind === 'base');
    const baseHtml = baseRows.length ? `
        <p style="color:#ffd700;font-weight:bold;margin:14px 0 6px;">基线（纯骨架不替换）</p>
        <div style="color:#ccc;font-size:12px;line-height:1.8;">
        ${baseRows.map(j => {
            const v = acc.get(j.key) || { wins: 0, runs: 0 };
            return `${j.b.id} vs ${j.a.id}：<b style="color:#4fc3f7">${pct(v.wins, v.runs)}</b>（${v.runs} 场）`;
        }).join('<br>')}
        </div>` : '';

    const candJobs = jobs.filter(j => j.kind === 'cand');
    const groups = ['明教', '六大派'];
    const tableRows = [];
    let html = baseHtml;

    for (const camp of groups) {
        const names = [...new Set(candJobs.filter(j => getGameData().characters[j.cand.name]?.camp === camp).map(j => j.cand.name))];
        if (!names.length) continue;
        const aids = [...new Set(candJobs.filter(j => getGameData().characters[j.cand.name]?.camp === camp).map(j => j.a.id))];
        html += `<p style="color:#ffd700;font-weight:bold;margin:16px 0 6px;">${camp}单位（打${camp === '明教' ? '六大派' : '明教'}靶）</p>`;
        html += `<table class="elite-table"><thead><tr><th>单位</th><th>职业</th>${aids.map(i => `<th>${i}</th>`).join('')}<th>平均</th></tr></thead><tbody>`;
        const rows = names.map(name => {
            const role = candJobs.find(j => j.cand.name === name)?.cand.role || '-';
            const wins = [], tot = [];
            const cells = aids.map(aid => {
                const v = acc.get(`${name}|${aid}`) || { wins: 0, runs: 0 };
                wins.push(v.wins); tot.push(v.runs);
                const p = v.runs ? v.wins / v.runs : null;
                const color = p === null ? '#888' : (p >= 0.6 ? '#4caf50' : p <= 0.4 ? '#f44336' : '#ffd700');
                return `<td style="color:${color}">${pct(v.wins, v.runs)}</td>`;
            });
            const sw = wins.reduce((a, b) => a + b, 0), st = tot.reduce((a, b) => a + b, 0);
            const avg = pct(sw, st);
            tableRows.push([camp, name, role, ...aids.map((aid, i) => pct(wins[i], tot[i])), avg.replace('%', '')]);
            return `<tr><td>${name}</td><td>${role}</td>${cells.join('')}<td><b>${avg}</b></td></tr>`;
        });
        rows.sort((a, b) => 0); // 保持模板顺序，排序交给人工看数值
        html += rows.join('') + '</tbody></table>';
    }
    resultEl.innerHTML = html;
    lastTable = tableRows;
}

csvBtn?.addEventListener('click', () => {
    if (!lastTable.length) { progressEl.textContent = '还没有结果可导出'; return; }
    const head = ['阵营', '单位', '职业', '靶子', '胜率'];
    const lines = [head.join(',')];
    for (const r of lastTable) {
        for (let i = 3; i < r.length - 1; i++) lines.push([r[0], r[1], r[2], r[3 + (i - 3)], r[i]].join(','));
    }
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `847-power-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
});

// 启动
(async () => {
    try {
        await loadGameData();
        TPL = await (await fetch('./847-templates.json')).json();
        renderPools();
    } catch (e) {
        console.error('[template-power] 初始化失败:', e);
    }
})();
