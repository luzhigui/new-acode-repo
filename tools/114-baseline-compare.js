// V1.1.0 | 战斗逻辑全迁 116 通用 Worker 并行执行（kind='baseline'），117 派发器逐关回报，完成显示总耗时
// 口径不变：同种子生成同一套阵容，A/B 两组精英配置各跑一遍；逐关对照 胜率/输出/承伤/存活 差异
import { ROLE_TYPES } from '../infra/56-battle-enums.js';
import { runParallel } from './117-shared-worker-runner.js';

// 角色配置表：flag / 标准位 / 角色
const ROLE_CFG = {
    '张无忌': { flag: 'isZhang', role: ROLE_TYPES.RANGED, stdPos: 5 },
    '韦一笑': { flag: 'isWei', role: ROLE_TYPES.FLYER, stdPos: 6 },
    '小昭·姊': { flag: 'isXiaoZhaoSister', role: ROLE_TYPES.RANGED, stdPos: 4 },
    '小昭·妹': { flag: 'isXiaoZhaoBrother', role: ROLE_TYPES.RANGED, stdPos: 4 }
};

const startBtn = document.getElementById('bcStartBtn');
const roleAEl = document.getElementById('bcRoleA');
const roleBEl = document.getElementById('bcRoleB');
const mAEl = document.getElementById('bcMA');
const mBEl = document.getElementById('bcMB');
const runsInput = document.getElementById('bcRunsInput');
const progressEl = document.getElementById('bcProgress');
const resultEl = document.getElementById('bcResult');

startBtn.addEventListener('click', async () => {
    const cfgA = { name: roleAEl.value, m: parseInt(mAEl.value) || 115 };
    const cfgB = { name: roleBEl.value, m: parseInt(mBEl.value) || 107 };
    Object.assign(cfgA, ROLE_CFG[cfgA.name]);
    Object.assign(cfgB, ROLE_CFG[cfgB.name]);
    const stages = Array.from(document.querySelectorAll('.bc-stage-check:checked')).map(cb => parseInt(cb.value));
    const RUNS = parseInt(runsInput.value) || 20;
    if (stages.length === 0) { alert('请至少选择一个关卡'); return; }

    startBtn.disabled = true;
    progressEl.textContent = '开始对比...';
    resultEl.innerHTML = '<div class="elite-empty">运行中...</div>';

    const rows = {}; // stage -> {vA,wA,dA,tkA,sA, vB,wB,dB,tkB,sB}
    const startT = performance.now();

    // 每关一个 job，worker 内完成 A/B 各 RUNS 场（种子公式与原主线程一致：Date.now() + run*7919 + stage*131）
    const masterSeed = Date.now();
    const jobs = stages.map(stage => ({ stage, seed: masterSeed + stage * 131, runs: RUNS, label: `第${stage}关` }));

    try {
        await runParallel({
            jobs,
            kind: 'baseline',
            nextJobMsg: (job, id) => ({ jobId: id, kind: 'baseline', stage: job.stage, seed: job.seed, runs: job.runs, cfgA, cfgB }),
            onJobDone: (finished, total, job, r) => {
                rows[job.stage] = r;
                progressEl.textContent = `第${job.stage}关 完成 (${finished}/${total}，已用 ${((performance.now() - startT) / 1000).toFixed(1)}s)`;
            },
            onAllDone: () => {
                renderResult(rows, stages, cfgA, cfgB);
                progressEl.textContent = `✅ 全部完成，总耗时 ${((performance.now() - startT) / 1000).toFixed(1)}s`;
            }
        });
    } catch (e) {
        console.error('[baseline-compare] 对比异常（并行）:', e);
        resultEl.innerHTML = `<div class="elite-empty">出错：${e.message}<br>完整堆栈已输出到 F12 控制台</div>`;
        progressEl.textContent = '❌ 对比异常';
    } finally {
        startBtn.disabled = false;
    }
});

// 双列对照表：A/B 胜率并排，胜差按方向着色；末行总评
function renderResult(rows, stages, cfgA, cfgB) {
    const allStages = stages.filter(st => rows[st]);
    let twA = 0, tvA = 0, tdA = 0, ttA = 0, tsA = 0;
    let twB = 0, tvB = 0, tdB = 0, ttB = 0, tsB = 0;

    let html = `<table class="elite-table"><tr>
        <th>关卡</th>
        <th>${cfgA.name} 胜率</th><th>${cfgB.name} 胜率</th><th>胜差(B−A)</th>
        <th>${cfgA.name} 输出</th><th>${cfgB.name} 输出</th>
        <th>${cfgA.name} 承伤</th><th>${cfgB.name} 承伤</th>
        <th>${cfgA.name} 存活</th><th>${cfgB.name} 存活</th>
    </tr>`;

    for (const st of allStages) {
        const d = rows[st];
        twA += d.wA; tvA += d.vA; tdA += d.dA; ttA += d.tkA; tsA += d.sA;
        twB += d.wB; tvB += d.vB; tdB += d.dB; ttB += d.tkB; tsB += d.sB;

        const rateA = d.vA ? d.wA / d.vA * 100 : null;
        const rateB = d.vB ? d.wB / d.vB * 100 : null;
        const diff = (rateA != null && rateB != null) ? rateB - rateA : null;
        const diffHtml = diff == null ? '-' :
            `<span style="color:${diff >= 5 ? '#4caf50' : diff <= -5 ? '#ff5252' : '#888'};font-weight:bold;">${diff >= 0 ? '+' : ''}${diff.toFixed(1)}</span>`;

        html += `<tr>
            <td class="elite-stage">第${st}关</td>
            <td style="color:${rateColor(rateA)};font-weight:bold;">${fmtRate(rateA)}</td>
            <td style="color:${rateColor(rateB)};font-weight:bold;">${fmtRate(rateB)}</td>
            <td>${diffHtml}</td>
            <td>${d.vA ? Math.floor(d.dA / d.vA) : '-'}</td>
            <td>${d.vB ? Math.floor(d.dB / d.vB) : '-'}</td>
            <td>${d.vA ? Math.floor(d.tkA / d.vA) : '-'}</td>
            <td>${d.vB ? Math.floor(d.tkB / d.vB) : '-'}</td>
            <td>${d.vA ? (d.sA / d.vA * 100).toFixed(0) + '%' : '-'}</td>
            <td>${d.vB ? (d.sB / d.vB * 100).toFixed(0) + '%' : '-'}</td>
        </tr>`;
    }

    const rateA = tvA ? twA / tvA * 100 : null;
    const rateB = tvB ? twB / tvB * 100 : null;
    const diff = (rateA != null && rateB != null) ? rateB - rateA : null;
    const diffHtml = diff == null ? '-' :
        `<span style="color:${diff >= 5 ? '#4caf50' : diff <= -5 ? '#ff5252' : '#888'};font-weight:bold;">${diff >= 0 ? '+' : ''}${diff.toFixed(1)}</span>`;

    html += `<tr>
        <td class="elite-stage">总评</td>
        <td style="color:${rateColor(rateA)};font-weight:bold;">${fmtRate(rateA)}</td>
        <td style="color:${rateColor(rateB)};font-weight:bold;">${fmtRate(rateB)}</td>
        <td>${diffHtml}</td>
        <td>${tvA ? Math.floor(tdA / tvA) : '-'}</td>
        <td>${tvB ? Math.floor(tdB / tvB) : '-'}</td>
        <td>${tvA ? Math.floor(ttA / tvA) : '-'}</td>
        <td>${tvB ? Math.floor(ttB / tvB) : '-'}</td>
        <td>${tvA ? (tsA / tvA * 100).toFixed(0) + '%' : '-'}</td>
        <td>${tvB ? (tsB / tvB * 100).toFixed(0) + '%' : '-'}</td>
    </tr></table>`;

    html += `<p style="color:#888;font-size:11px;margin-top:8px;">胜差 = B 胜率 − A 胜率；≥+5 绿色（B 更优）、≤−5 红色（A 更优）。A/B 共享同一阵容种子与战斗种子，差异仅来自配置。</p>`;
    resultEl.innerHTML = html;
}

function rateColor(r) {
    if (r == null) return '#888';
    return r >= 50 ? '#4caf50' : r >= 25 ? '#ffd700' : '#ff5252';
}
function fmtRate(r) {
    return r == null ? 'N/A' : r.toFixed(1) + '%';
}