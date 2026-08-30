// tools/112-elite-eval.js - 光明顶5v5 明教精英战力评测（融合进 102 工具箱 tab）
// 由 tools/111-elite-power-eval.html 改造 | 跑张无忌/韦一笑/小昭姊/小昭妹 6关×N场
// V2.1.0 | 战斗逻辑全迁 116 通用 Worker 并行执行（kind='elite'），117 派发器聚合，完成显示总耗时
import { ROLE_TYPES } from '../infra/56-battle-enums.js';
import { runParallel } from './117-shared-worker-runner.js';

const configs = [
    { name: '张无忌', flag: 'isZhang', role: ROLE_TYPES.RANGED, m: 115 },
    { name: '韦一笑', flag: 'isWei', role: ROLE_TYPES.FLYER, m: 107 },
    { name: '小昭·姊', flag: 'isXiaoZhaoSister', role: ROLE_TYPES.RANGED, m: 107 },
    { name: '小昭·妹', flag: 'isXiaoZhaoBrother', role: ROLE_TYPES.RANGED, m: 107 }
];

const startBtn = document.getElementById('eliteStartBtn');
const runsInput = document.getElementById('eliteRunsInput');
const progressEl = document.getElementById('eliteProgress');
const resultEl = document.getElementById('eliteResult');

startBtn.addEventListener('click', async () => {
    const stages = Array.from(document.querySelectorAll('.elite-stage-check:checked')).map(cb => parseInt(cb.value));
    const RUNS = parseInt(runsInput.value) || 20;
    if (stages.length === 0) { alert('请至少选择一个关卡'); return; }

    startBtn.disabled = true;
    progressEl.textContent = '开始评测...';
    resultEl.innerHTML = '<div class="elite-empty">运行中...</div>';

    const results = {};
    for (const cfg of configs) {
        results[cfg.name] = {};
        for (const stage of stages) results[cfg.name][stage] = null;
    }
    const startT = performance.now();

    // 种子公式与原主线程一致：Date.now() + run*7919 + stage*131 → jobSeed = masterSeed + stage*131（run 偏移在 worker 内补）
    const masterSeed = Date.now();
    const jobs = [];
    for (const cfg of configs) {
        for (const stage of stages) {
            jobs.push({ cfg, stage, seed: masterSeed + stage * 131, runs: RUNS, label: `${cfg.name}@第${stage}关` });
        }
    }

    try {
        await runParallel({
            jobs,
            kind: 'elite',
            nextJobMsg: (job, id) => ({ jobId: id, kind: 'elite', cfg: job.cfg, stage: job.stage, seed: job.seed, runs: job.runs }),
            onJobDone: (finished, total, job, d) => {
                results[job.cfg.name][job.stage] = {
                    wins: d.wins,
                    total: d.validRuns,
                    validRuns: d.validRuns,
                    rate: d.validRuns > 0 ? (d.wins / d.validRuns * 100).toFixed(1) + '%' : 'N/A',
                    avgDmg: d.validRuns > 0 ? Math.floor(d.sumDmg / d.validRuns) : 0,
                    avgTaken: d.validRuns > 0 ? Math.floor(d.sumTaken / d.validRuns) : 0,
                    survRate: d.validRuns > 0 ? (d.sumSurv / d.validRuns * 100).toFixed(1) + '%' : 'N/A'
                };
                progressEl.textContent = `${job.cfg.name} 第${job.stage}关 完成 (${finished}/${total}，已用 ${((performance.now() - startT) / 1000).toFixed(1)}s)`;
            },
            onAllDone: () => {
                renderResults(results, stages, RUNS);
                progressEl.textContent = `✅ 全部完成，总耗时 ${((performance.now() - startT) / 1000).toFixed(1)}s`;
            }
        });
    } catch (e) {
        console.error('[elite-eval] 评测异常（并行）:', e);
        resultEl.innerHTML = `<div class="elite-empty">出错：${e.message}<br>完整堆栈已输出到 F12 控制台</div>`;
        progressEl.textContent = '❌ 评测异常';
    } finally {
        startBtn.disabled = false;
    }
});

function renderResults(results, stages, runs) {
    // 转置表：行 = 关卡，列 = 精英；每格堆叠该关 胜率/输出/承伤/存活，胜率按高低着色
    let html = '<table class="elite-table"><tr><th>关卡</th>';
    for (const cfg of configs) html += `<th class="elite-th">${cfg.name}</th>`;
    html += '</tr>';

    for (const st of stages) {
        html += `<tr><td class="elite-stage">第${st}关</td>`;
        for (const cfg of configs) {
            const d = results[cfg.name][st];
            if (d && d.validRuns > 0) {
                html += cellHtml(d.rate, d.avgDmg, d.avgTaken, d.survRate);
            } else {
                html += '<td class="elite-cell">N/A</td>';
            }
        }
        html += '</tr>';
    }

    // 底部总评行：各精英跨关卡汇总
    html += '<tr><td class="elite-stage">总评</td>';
    for (const cfg of configs) {
        const sd = results[cfg.name];
        let tw = 0, tr = 0, totalDmg = 0, totalTaken = 0, totalSurv = 0;
        for (const st of stages) {
            const d = sd[st];
            if (d && d.validRuns > 0) {
                tw += d.wins; tr += d.total;
                totalDmg += d.avgDmg * d.validRuns;
                totalTaken += d.avgTaken * d.validRuns;
                totalSurv += (parseFloat(d.survRate) / 100) * d.validRuns;
            }
        }
        if (tr > 0) {
            html += cellHtml((tw / tr * 100).toFixed(1) + '%', Math.floor(totalDmg / tr), Math.floor(totalTaken / tr), (totalSurv / tr * 100).toFixed(1) + '%');
        } else {
            html += '<td class="elite-cell">N/A</td>';
        }
    }
    html += '</tr></table>';
    resultEl.innerHTML = html;
}

// 单个精英单元格：堆叠 胜率/输出/承伤/存活，胜率按高低着色
function cellHtml(rate, dmg, taken, surv) {
    const r = parseFloat(rate);
    let color = '#888';
    if (!isNaN(r)) color = r >= 50 ? '#4caf50' : r >= 25 ? '#ffd700' : '#ff5252';
    return `<td class="elite-cell">
        <div class="cell-rate" style="color:${color}">胜率 ${rate}</div>
        <div class="cell-sub">输出 ${dmg}</div>
        <div class="cell-sub">承伤 ${taken}</div>
        <div class="cell-sub">存活 ${surv}</div></td>`;
}