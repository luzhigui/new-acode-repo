// V2.1.0 | 战斗逻辑全迁 116 通用 Worker 并行执行（kind='stats'），117 派发器逐关回报，完成显示总耗时
// 口径不变：承伤=来袭全额（含防御减免/溢出/免疫吸收/格挡，回血不冲减）、治疗=产出侧记账
import { runParallel } from './117-shared-worker-runner.js';

const startBtn = document.getElementById('scStartBtn');
const runsInput = document.getElementById('scRunsInput');
const progressEl = document.getElementById('scProgress');
const resultEl = document.getElementById('scResult');

startBtn.addEventListener('click', async () => {
    const stages = Array.from(document.querySelectorAll('.sc-stage-check:checked')).map(cb => parseInt(cb.value));
    const RUNS = parseInt(runsInput.value) || 20;
    if (stages.length === 0) { alert('请至少选择一个关卡'); return; }

    startBtn.disabled = true;
    progressEl.textContent = '开始体检...';
    resultEl.innerHTML = '<div class="elite-empty">运行中...</div>';

    // 汇总：key = camp-name，跨场累加，渲染时取均值
    const agg = {};
    const startT = performance.now();

    // 每关一个 job，worker 内已完成本关 RUNS 场自聚合（种子公式与原主线程一致：Date.now() + run*7919 + stage*131）
    const masterSeed = Date.now();
    const jobs = stages.map(stage => ({ stage, seed: masterSeed + stage * 131, runs: RUNS, label: `第${stage}关` }));

    try {
        await runParallel({
            jobs,
            kind: 'stats',
            nextJobMsg: (job, id) => ({ jobId: id, kind: 'stats', stage: job.stage, seed: job.seed, runs: job.runs }),
            onJobDone: (finished, total, job, part) => {
                for (const [key, d] of Object.entries(part)) {
                    const t = agg[key] || (agg[key] = { battles: 0, dmgTaken: 0, battleDmg: 0, reallocDmg: 0, healDone: 0, battleHeal: 0, reallocHeal: 0, dmgDealt: 0 });
                    t.battles += d.battles;
                    t.dmgTaken += d.dmgTaken;
                    t.battleDmg += d.battleDmg;
                    t.reallocDmg += d.reallocDmg;
                    t.healDone += d.healDone;
                    t.battleHeal += d.battleHeal;
                    t.reallocHeal += d.reallocHeal;
                    t.dmgDealt += d.dmgDealt;
                }
                progressEl.textContent = `体检中 ${finished}/${total}（已用 ${((performance.now() - startT) / 1000).toFixed(1)}s）`;
            },
            onAllDone: () => {
                renderResult(agg, stages, RUNS);
                progressEl.textContent = `✅ 体检完成，总耗时 ${((performance.now() - startT) / 1000).toFixed(1)}s`;
            }
        });
    } catch (e) {
        console.error('[stats-check] 体检异常（并行）:', e);
        resultEl.innerHTML = `<div class="elite-empty">出错：${e.message}<br>完整堆栈已输出到 F12 控制台</div>`;
        progressEl.textContent = '❌ 体检异常';
    } finally {
        startBtn.disabled = false;
    }
});

function avg(v, n) { return n > 0 ? Math.round(v / n) : 0; }

function renderResult(agg, stages, runs) {
    const rows = Object.entries(agg).sort((a, b) => b[1].dmgTaken - a[1].dmgTaken);

    // 顶层守恒：每笔伤害同时记 target.dmgTaken 与 source.dmgDealt；新口径下都按"来袭全额"双边记账，守恒关系仍成立
    let sumTaken = 0, sumDealt = 0;
    for (const [, d] of rows) { sumTaken += d.dmgTaken; sumDealt += d.dmgDealt; }
    const diff = sumTaken - sumDealt;
    const verdict = Math.abs(diff) <= Math.max(1, rows.length)  // 单步舍入合计允差
        ? `守恒 ✓：全体 dmgTaken(${sumTaken}) ≈ dmgDealt(${sumDealt})，每笔伤害双边记账平衡。`
        : `守恒 ✗：全体 dmgTaken(${sumTaken}) ≠ dmgDealt(${sumDealt})，差 ${diff}（相对占比 ${(Math.abs(diff)/Math.max(1,sumTaken)*100).toFixed(2)}%）—— 存在漏记/重复记。`;

    let html = `<div class="hex-log-verdict">${verdict}</div>
    <p style="color:#888;font-size:11px;margin:8px 0;">
      新口径：记账承伤=来袭全额（含防御挡刀/免疫吸收/溢出，回血不冲减）；记账治疗=产出侧（奶妈记，被治疗方净回血不再对齐）。<br>
      hp 净扣血/净回血：maxHp 不变时的真实 hp 变化。<b style="color:#ff8a80;">重分配列</b>：血量重分配（附身/飞回/carry/苦练）污染，>0 即异常。<br>
      差额：承伤侧=记账承伤 − 净扣血 − 重分配承伤（=防御挡刀+吸收+溢出，正常）；治疗侧=记账治疗（产出侧） − 净回血 − 重分配治疗（=满血溢出+直接记产出，正常）。<br>
      数值为场均（共 ${stages.length} 关 × ${runs} 场）。
    </p>
    <table class="elite-table"><tr>
        <th>单位</th><th>场次</th>
        <th>hp 净扣血</th><th style="background:#5c2a2a;">重分配承伤</th><th>记账承伤</th><th>承伤差额</th>
        <th>hp 净回血</th><th style="background:#5c2a2a;">重分配治疗</th><th>记账治疗</th><th>治疗差额</th>
        <th>记账输出</th><th>判定</th>
    </tr>`;

    for (const [key, d] of rows) {
        const dmgGap = d.dmgTaken - d.battleDmg - d.reallocDmg;   // 新口径：防御挡刀+吸收+溢出，正常
        const healGap = d.healDone - d.battleHeal - d.reallocHeal; // 新口径：产出侧 vs 接收侧差（满血溢出/直接记产出），正常
        const polluted = d.reallocDmg > 0.5 || d.reallocHeal > 0.5;
        let verdictTxt = '✓ 正常';
        if (polluted) verdictTxt = '⚠ 重分配污染';
        const vColor = polluted ? '#ff5252' : '#4caf50';
        const reallocDmgBg = d.reallocDmg > 0.5 ? 'background:#5c2a2a;color:#ff8a80;' : '';
        const reallocHealBg = d.reallocHeal > 0.5 ? 'background:#5c2a2a;color:#ff8a80;' : '';
        const gapColor = '#ffa726';
        html += `<tr>
            <td style="text-align:left;white-space:nowrap;">${key}</td>
            <td>${d.battles}</td>
            <td>${avg(d.battleDmg, d.battles)}</td>
            <td style="${reallocDmgBg}">${avg(d.reallocDmg, d.battles)}</td>
            <td style="font-weight:bold;">${avg(d.dmgTaken, d.battles)}</td>
            <td style="color:${gapColor};">+${avg(dmgGap, d.battles)}</td>
            <td>${avg(d.battleHeal, d.battles)}</td>
            <td style="${reallocHealBg}">${avg(d.reallocHeal, d.battles)}</td>
            <td style="font-weight:bold;">${avg(d.healDone, d.battles)}</td>
            <td style="color:${gapColor};">${healGap >= 0 ? '+' : ''}${avg(healGap, d.battles)}</td>
            <td>${avg(d.dmgDealt, d.battles)}</td>
            <td style="color:${vColor};font-weight:bold;">${verdictTxt}</td>
        </tr>`;
    }
    html += '</table>';
    resultEl.innerHTML = html;
}