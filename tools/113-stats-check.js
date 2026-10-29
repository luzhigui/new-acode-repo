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

    // 只校负差额：差额 < 0 表示真实 hp 变化比记账多 = 漏记。
    // 正差额（格挡/免疫/溢出/闪避/反弹只记承伤侧、治疗记产出侧）是口径设计使然，不告警。
    // 全局 dmgTaken 与 dmgDealt 天生不等，不再做守恒校验。
    let badDmg = 0, badHeal = 0;
    for (const [, d] of rows) {
        if (d.dmgTaken - d.battleDmg - d.reallocDmg < -1) badDmg++;
        if (d.healDone - d.battleHeal - d.reallocHeal < -1) badHeal++;
    }
    const verdict = (badDmg + badHeal) === 0
        ? `校核 ✓：${rows.length} 个单位均无负差额，记账未少于真实 hp 变化。`
        : `校核 ✗：${badDmg} 个单位承伤负差额、${badHeal} 个单位治疗负差额 —— 有真实 hp 变化未进记账，需查。`;

    let html = `<div class="hex-log-verdict">${verdict}</div>
    <p style="color:#888;font-size:11px;margin:8px 0;">
      记账口径：承伤=来袭全额（含防御挡刀/免疫吸收/溢出，回血不冲减）；治疗=产出侧（奶妈记，被治疗方净回血不再对齐）。<br>
      全局 dmgTaken 与 dmgDealt <span style="color:#ffa726;">本就不同</span>（承伤记全额、输出记实伤，闪避/反弹只记承伤侧），不做守恒校验。<br>
      hp 净扣血/净回血：maxHp 不变时的真实 hp 变化。<span style="color:#8ab4f8;">重分配列</span>：附身/飞回/carry/苦练造成的血量重分配，属正常机制。<br>
      判定只看<span style="color:#ff5252;">负差额</span>：承伤差额=记账承伤 − 净扣血 − 重分配承伤，为负 = 漏记；治疗侧同理。正差额正常（格挡/免疫/溢出/满血溢出）。<br>
      数值为场均（共 ${stages.length} 关 × ${runs} 场）。
    </p>
    <table class="elite-table"><tr>
        <th>单位</th><th>场次</th>
        <th>hp 净扣血</th><th>重分配承伤</th><th>记账承伤</th><th>承伤差额</th>
        <th>hp 净回血</th><th>重分配治疗</th><th>记账治疗</th><th>治疗差额</th>
        <th>记账输出</th><th>判定</th>
    </tr>`;

    for (const [key, d] of rows) {
        const dmgGap = d.dmgTaken - d.battleDmg - d.reallocDmg;    // 负 = 漏记
        const healGap = d.healDone - d.battleHeal - d.reallocHeal; // 负 = 漏记
        const dmgGapAvg = avg(dmgGap, d.battles);
        const healGapAvg = avg(healGap, d.battles);
        const negDmg = dmgGap < -1;
        const negHeal = healGap < -1;
        let verdictTxt = '✓ 正常';
        if (negDmg && negHeal) verdictTxt = '⚠ 承伤+治疗漏记';
        else if (negDmg) verdictTxt = '⚠ 承伤漏记';
        else if (negHeal) verdictTxt = '⚠ 治疗漏记';
        const vColor = (negDmg || negHeal) ? '#ff5252' : '#4caf50';
        const reallocStyle = 'color:#8ab4f8;';   // 重分配=正常机制，只展示不判红
        html += `<tr>
            <td style="text-align:left;white-space:nowrap;">${key}</td>
            <td>${d.battles}</td>
            <td>${avg(d.battleDmg, d.battles)}</td>
            <td style="${reallocStyle}">${avg(d.reallocDmg, d.battles)}</td>
            <td style="font-weight:bold;">${avg(d.dmgTaken, d.battles)}</td>
            <td style="color:${negDmg ? '#ff5252' : '#ffa726'};">${dmgGapAvg >= 0 ? '+' : ''}${dmgGapAvg}</td>
            <td>${avg(d.battleHeal, d.battles)}</td>
            <td style="${reallocStyle}">${avg(d.reallocHeal, d.battles)}</td>
            <td style="font-weight:bold;">${avg(d.healDone, d.battles)}</td>
            <td style="color:${negHeal ? '#ff5252' : '#ffa726'};">${healGapAvg >= 0 ? '+' : ''}${healGapAvg}</td>
            <td>${avg(d.dmgDealt, d.battles)}</td>
            <td style="color:${vColor};font-weight:bold;">${verdictTxt}</td>
        </tr>`;
    }
    html += '</table>';
    resultEl.innerHTML = html;
}