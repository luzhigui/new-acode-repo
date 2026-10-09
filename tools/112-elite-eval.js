// V2.5.1 | 预估 23400 bytes | 2026-10-09 单英雄/无精英两张表改用专用场数输入（默认 600，与普通表分开）：
//          默认 1800 对「5 倍工作量」的单英雄表太久，用户懒得每次手改；普通表仍用「每关总场次」
// V2.5.0 | 预估 22700 bytes | 2026-10-09 新增「🛡 无精英基线」按钮：明教侧一个精英都不出的胜率（拒绝采样凑局，
//          依赖 116 V1.7.0 kind:'noElite'）——作精英价值对照；表格按敌方变体拆行、含总评，不拖慢另两张表
// V2.4.2 | 预估 16700 bytes | 2026-10-08 单英雄表按敌方变体拆行：第3关拆「·胖远桥」「·宋青书」两行（与上方自然表同款口径，
//          依赖 116 V1.6.1）；其余关落「标准」桶单行，总评跨关跨变体累加
// V2.4.1 | 预估 15500 bytes | 2026-10-08 单英雄表补「总评」行：跨关累加五精英的胜率/场次/存活
//          （口径与上方自然表的总评一致）；此前只有逐关行，跑完看不到汇总，与上表不对称
// V2.4.0 | 2026-10-08 新增「⚔ 单英雄胜率」按钮：五精英逐一 force 单精英跑选中关卡（worker kind:soloElite，
//          依赖 29 V7.5.16 四路 force 轮盘互锁）；结果渲染进独立容器，与普通评测表互不覆盖。
//          首跑参考数字（第2关 N=300 node 探针）：谢逊 42.7% > 张无忌 39.7% > 姊 26.0% > 妹 16.0% > 韦一笑 7.0%
// 由 tools/111-elite-power-eval.html 改造 | 跑张无忌/韦一笑/小昭姊/小昭妹 1-7关×N场（关卡由 102 复选框勾选，已含第7关）
// V2.3.1 | 预估 9200 bytes | 2026-10-04 「战力分」改名「实战评分」：主代码的「战力」(power) 是
//          开战前的组队预算表（roster.elitePower / normalPower，仅 modules/29 用来凑明教阵容），
//          与这里的战后实测分不是一回事，改名避撞词。算法不变 = 胜率 × 70% + 存活率 × 30%，
//          横向比同列五人；输出/承伤不计入（姐姐是附身支援位，计进去等于拿两把错的尺子量她）
import { runParallel } from './117-shared-worker-runner.js';

export const VER = 'tools/112-elite-eval.js V2.5.1';

const configs = [
    { name: '张无忌' },
    { name: '韦一笑' },
    { name: '小昭·姊' },
    { name: '小昭·妹' },
    { name: '金毛狮王谢逊' }
];

// 敌方阵容变体（行拆分维度）：第3关在胖远桥/宋青书两套阵容间轮换，按"本局敌方是谁"拆行统计
// 2026-09-24 定稿：胖远桥/宋青书是行不是列——用户要看的是"遇到谁时的整体胜率"，不是把他俩当出场角色
const VARIANTS = ['胖远桥', '宋青书', '标准'];

const startBtn = document.getElementById('eliteStartBtn');
const runsInput = document.getElementById('eliteRunsInput');
const progressEl = document.getElementById('eliteProgress');
const resultEl = document.getElementById('eliteResult');
const soloBtn = document.getElementById('eliteSoloBtn');       // 2026-10-08 单英雄胜率
const soloProgressEl = document.getElementById('eliteSoloProgress');
const soloResultEl = document.getElementById('eliteSoloResult');
const noEliteBtn = document.getElementById('eliteNoEliteBtn'); // 2026-10-09 无精英基线
const noEliteProgressEl = document.getElementById('eliteNoEliteProgress');
const noEliteResultEl = document.getElementById('eliteNoEliteResult');
const soloRunsInput = document.getElementById('eliteSoloRunsInput'); // 2026-10-09 单英雄/无精英专用场数（默认 600）：与普通表分开，免得忘改 1800 一跑就是 5 倍时长

const CHUNK = 300; // 每片局数：把每关拆成多片派发，负载均衡

startBtn.addEventListener('click', async () => {
    const stages = Array.from(document.querySelectorAll('.elite-stage-check:checked')).map(cb => parseInt(cb.value));
    const RUNS = parseInt(runsInput.value) || 1800;
    if (stages.length === 0) { alert('请至少选择一个关卡'); return; }

    startBtn.disabled = true;
    progressEl.textContent = '开始评测...';
    resultEl.innerHTML = '<div class="elite-empty">运行中...</div>';

    const byStage = {}; // stage -> variant -> { 张无忌:{runs,wins,...}, ... }
    for (const st of stages) {
        byStage[st] = {};
        for (const v of VARIANTS) {
            byStage[st][v] = {};
            for (const cfg of configs) byStage[st][v][cfg.name] = { runs: 0, wins: 0, sumDmg: 0, sumTaken: 0, sumSurv: 0 };
        }
    }
    const startT = performance.now();

    // 种子公式：masterSeed + stage*131 + 片序号*100003，各片不重叠
    const masterSeed = Date.now();
    const jobs = [];
    for (const stage of stages) {
        const chunks = Math.ceil(RUNS / CHUNK);
        for (let c = 0; c < chunks; c++) {
            const runs = Math.min(CHUNK, RUNS - c * CHUNK);
            if (runs <= 0) continue;
            jobs.push({ stage, seed: masterSeed + stage * 131 + c * 100003, runs, label: `第${stage}关#${c + 1}` });
        }
    }

    try {
        await runParallel({
            jobs,
            kind: 'elite',
            nextJobMsg: (job, id) => ({ jobId: id, kind: 'elite', stage: job.stage, seed: job.seed, runs: job.runs }),
            onJobDone: (finished, total, job, part) => {
                // part = { 变体名: { 角色名: {runs,wins,...} } }
                for (const [variant, roles] of Object.entries(part || {})) {
                    const slot = byStage[job.stage] && byStage[job.stage][variant];
                    if (!slot) continue;
                    for (const [name, d] of Object.entries(roles || {})) {
                        const a = slot[name];
                        if (!a) continue;
                        a.runs += d.runs; a.wins += d.wins;
                        a.sumDmg += d.sumDmg; a.sumTaken += d.sumTaken; a.sumSurv += d.sumSurv;
                    }
                }
                progressEl.textContent = `第${job.stage}关 完成 (${finished}/${total}，已用 ${((performance.now() - startT) / 1000).toFixed(1)}s)`;
            },
            onAllDone: () => {
                renderResults(byStage, stages);
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

// ============ 2026-10-08 单英雄胜率：五精英逐一单挑选中关卡 ============
// 口径：force 单精英（29 V7.5.16 起四路 force 全抑制随机轮盘=真·单英雄局）、海克斯开、
//       胜=明教。与普通评测的区别：普通表是「自然出场归因」（同场多精英），这张表是「控制变量单挑」。
soloBtn.addEventListener('click', async () => {
    const stages = Array.from(document.querySelectorAll('.elite-stage-check:checked')).map(cb => parseInt(cb.value));
    const RUNS = parseInt(soloRunsInput.value) || 600;   // 单英雄表专用场数（默认 600，与普通表分开）
    if (stages.length === 0) { alert('请至少选择一个关卡'); return; }

    soloBtn.disabled = true;
    soloProgressEl.textContent = '开始单英雄评测...';
    soloResultEl.innerHTML = '<div class="elite-empty">运行中...</div>';

    const byStage = {}; // stage -> variant -> 精英名 -> {runs,wins,sumSurv,sumDmg,sumTaken}
    for (const st of stages) {
        byStage[st] = {};
        for (const v of VARIANTS) {
            byStage[st][v] = {};
            for (const cfg of configs) byStage[st][v][cfg.name] = { runs: 0, wins: 0, sumSurv: 0, sumDmg: 0, sumTaken: 0 };
        }
    }
    const startT = performance.now();
    const masterSeed = Date.now();

    // 每精英每关拆片派发（种子再错开 7717*精英序号，互不重叠）
    const jobs = [];
    let eliteIdx = 0;
    for (const cfg of configs) {
        for (const stage of stages) {
            const chunks = Math.ceil(RUNS / CHUNK);
            for (let c = 0; c < chunks; c++) {
                const runs = Math.min(CHUNK, RUNS - c * CHUNK);
                if (runs <= 0) continue;
                jobs.push({ stage, elite: cfg.name, seed: masterSeed + stage * 131 + eliteIdx * 7717 + c * 100003, runs, label: `${cfg.name}·第${stage}关#${c + 1}` });
            }
        }
        eliteIdx++;
    }

    try {
        await runParallel({
            jobs,
            kind: 'soloElite',
            nextJobMsg: (job, id) => ({ jobId: id, kind: 'soloElite', stage: job.stage, seed: job.seed, runs: job.runs, elite: job.elite }),
            onJobDone: (finished, total, job, part) => {
                // part = { 变体名: {runs,wins,...} }（单精英局只落一个桶，桶名 = 本局敌方是谁）
                for (const [variant, d] of Object.entries(part && part.variants || {})) {
                    const slot = byStage[job.stage] && byStage[job.stage][variant];
                    const a = slot && slot[job.elite];
                    if (!a) continue;
                    a.runs += d.runs; a.wins += d.wins; a.sumSurv += d.sumSurv; a.sumDmg += d.sumDmg; a.sumTaken += d.sumTaken;
                }
                soloProgressEl.textContent = `${job.label} 完成 (${finished}/${total}，已用 ${((performance.now() - startT) / 1000).toFixed(1)}s)`;
            },
            onAllDone: () => {
                renderSoloResults(byStage, stages);
                soloProgressEl.textContent = `✅ 单英雄评测完成，总耗时 ${((performance.now() - startT) / 1000).toFixed(1)}s`;
            }
        });
    } catch (e) {
        console.error('[elite-solo] 单英雄评测异常:', e);
        soloResultEl.innerHTML = `<div class="elite-empty">出错：${e.message}<br>完整堆栈已输出到 F12 控制台</div>`;
        soloProgressEl.textContent = '❌ 单英雄评测异常';
    } finally {
        soloBtn.disabled = false;
    }
});

function renderSoloResults(byStage, stages) {
    let html = '<table class="elite-table elite-table-fit"><colgroup><col style="width:64px">';
    for (const cfg of configs) html += '<col>';
    html += '</colgroup><tr><th>关卡</th>';
    for (const cfg of configs) html += `<th class="elite-th">${cfg.name}</th>`;
    html += '</tr>';
    for (const st of stages) {
        // 按变体拆行（V2.4.2）：第3关拆「·胖远桥」「·宋青书」两行，其余关单行；无数据的变体不出行
        for (const v of VARIANTS) {
            const slot = byStage[st] && byStage[st][v];
            const hasData = slot && configs.some(cfg => slot[cfg.name] && slot[cfg.name].runs > 0);
            if (!hasData) continue;
            const label = v === '标准' ? `第${st}关` : `第${st}关·${v}`;
            html += `<tr><td class="elite-stage">${label}</td>`;
            for (const cfg of configs) html += soloCellHtml(slot[cfg.name]);
            html += '</tr>';
        }
    }
    // 总评行（2026-10-08 补）：跨关累加五精英，口径与上方自然表的总评一致
    html += '<tr><td class="elite-stage">总评</td>';
    for (const cfg of configs) html += soloCellHtml(soloTotalsOf(cfg, byStage, stages));
    html += '</tr>';
    html += '</table>';
    html += '<div style="font-size:11px;color:#999;margin-top:6px;">单英雄胜率 = force 该精英单挑（抑制随机轮盘、海克斯开、胜=明教）。控制变量口径，与上方「自然出场归因」表互补：这里看单核带队能力，上面看真实出场表现。</div>';
    soloResultEl.innerHTML = html;
}

// 单英雄表单元格：胜率/场次/存活（逐关行与总评行共用）
function soloCellHtml(d) {
    if (!d || !d.runs) return '<td class="elite-cell">N/A</td>';
    const rate = (d.wins / d.runs * 100).toFixed(1);
    const r = parseFloat(rate);
    const color = r >= 50 ? '#4caf50' : r >= 25 ? '#ffd700' : '#ff5252';
    const surv = (d.sumSurv / d.runs * 100).toFixed(1);
    const thin = d.runs < 200 ? ' <span style="color:#ff9800;">(样本少)</span>' : '';
    return `<td class="elite-cell">
        <div class="cell-rate" style="color:${color}">胜率 ${rate}%</div>
        <div class="cell-sub">${d.runs} 场${thin}</div>
        <div class="cell-sub">存活 ${surv}%</div></td>`;
}

// 跨关跨变体累加某精英（单英雄表总评行用）
function soloTotalsOf(cfg, byStage, stages) {
    let runs = 0, wins = 0, sumSurv = 0;
    for (const st of stages) {
        for (const v of VARIANTS) {
            const d = byStage[st] && byStage[st][v] && byStage[st][v][cfg.name];
            if (!d) continue;
            runs += d.runs; wins += d.wins; sumSurv += d.sumSurv;
        }
    }
    return { runs, wins, sumSurv };
}

// ============ 2026-10-09 无精英基线：明教侧一个精英都不出 ============
// 口径：不设任何 force 标志，由 worker（116 kind:'noElite'）重掷初始阵容凑出无精英局；
//       海克斯开、胜 = 明教。作「精英价值」对照组——与上方两张表同关比，差额即精英的胜率增益。
noEliteBtn.addEventListener('click', async () => {
    const stages = Array.from(document.querySelectorAll('.elite-stage-check:checked')).map(cb => parseInt(cb.value));
    const RUNS = parseInt(soloRunsInput.value) || 600;   // 与单英雄表共用「单英雄/无精英场数」（对照组样本量一致）
    if (stages.length === 0) { alert('请至少选择一个关卡'); return; }

    noEliteBtn.disabled = true;
    noEliteProgressEl.textContent = '开始无精英基线评测...';
    noEliteResultEl.innerHTML = '<div class="elite-empty">运行中...</div>';

    const byStage = {}; // stage -> variant -> {runs,wins,sumSurv}
    for (const st of stages) {
        byStage[st] = {};
        for (const v of VARIANTS) byStage[st][v] = { runs: 0, wins: 0, sumSurv: 0 };
    }
    const startT = performance.now();
    const masterSeed = Date.now();

    const jobs = [];
    for (const stage of stages) {
        const chunks = Math.ceil(RUNS / CHUNK);
        for (let c = 0; c < chunks; c++) {
            const runs = Math.min(CHUNK, RUNS - c * CHUNK);
            if (runs <= 0) continue;
            jobs.push({ stage, seed: masterSeed + stage * 131 + c * 100003, runs, label: `第${stage}关#${c + 1}` });
        }
    }

    try {
        await runParallel({
            jobs,
            kind: 'noElite',
            nextJobMsg: (job, id) => ({ jobId: id, kind: 'noElite', stage: job.stage, seed: job.seed, runs: job.runs }),
            onJobDone: (finished, total, job, part) => {
                // part = { 变体名: {runs,wins,sumSurv} }（无精英局同样按敌方变体分桶）
                for (const [variant, d] of Object.entries((part && part.variants) || {})) {
                    const a = byStage[job.stage] && byStage[job.stage][variant];
                    if (!a) continue;
                    a.runs += d.runs; a.wins += d.wins; a.sumSurv += d.sumSurv;
                }
                noEliteProgressEl.textContent = `第${job.stage}关 完成 (${finished}/${total}，已用 ${((performance.now() - startT) / 1000).toFixed(1)}s)`;
            },
            onAllDone: () => {
                renderNoEliteResults(byStage, stages);
                noEliteProgressEl.textContent = `✅ 无精英基线完成，总耗时 ${((performance.now() - startT) / 1000).toFixed(1)}s`;
            }
        });
    } catch (e) {
        console.error('[elite-noelite] 无精英基线异常:', e);
        noEliteResultEl.innerHTML = `<div class="elite-empty">出错：${e.message}<br>完整堆栈已输出到 F12 控制台</div>`;
        noEliteProgressEl.textContent = '❌ 无精英基线异常';
    } finally {
        noEliteBtn.disabled = false;
    }
});

function renderNoEliteResults(byStage, stages) {
    let html = '<table class="elite-table elite-table-fit"><colgroup><col style="width:120px"><col><col></colgroup><tr><th>关卡</th><th class="elite-th">胜率 / 场次</th><th class="elite-th">平均存活</th></tr>';
    for (const st of stages) {
        for (const v of VARIANTS) {            // 按敌方变体拆行（第3关拆「·胖远桥」「·宋青书」）
            const d = byStage[st] && byStage[st][v];
            if (!d || !d.runs) continue;
            const label = v === '标准' ? `第${st}关` : `第${st}关·${v}`;
            html += noEliteRowHtml(label, d);
        }
    }
    html += noEliteRowHtml('总评', noEliteTotalsOf(byStage, stages));
    html += '</table>';
    html += '<div style="font-size:11px;color:#999;margin-top:6px;">无精英基线 = 明教侧一个精英都不出（重掷阵容凑无精英局；海克斯开、胜=明教）。作精英价值对照：与上面两张表同关比，差额就是精英带来的胜率增益。无精英局没有「主英雄」，第三列改记全队平均存活人数。</div>';
    noEliteResultEl.innerHTML = html;
}

// 无精英表一行：胜率/场次 + 全队平均存活人数（无精英时"存活率"没意义，改看剩几人）
function noEliteRowHtml(label, d) {
    if (!d || !d.runs) return `<tr><td class="elite-stage">${label}</td><td class="elite-cell">N/A</td><td class="elite-cell">N/A</td></tr>`;
    const rate = (d.wins / d.runs * 100).toFixed(1);
    const r = parseFloat(rate);
    const color = r >= 50 ? '#4caf50' : r >= 25 ? '#ffd700' : '#ff5252';
    const thin = d.runs < 200 ? ' <span style="color:#ff9800;">(样本少)</span>' : '';
    return `<tr><td class="elite-stage">${label}</td>
        <td class="elite-cell"><div class="cell-rate" style="color:${color}">胜率 ${rate}%</div><div class="cell-sub">${d.runs} 场${thin}</div></td>
        <td class="elite-cell"><div class="cell-rate">${(d.sumSurv / d.runs).toFixed(2)} 人</div><div class="cell-sub">全队 5 人</div></td></tr>`;
}

// 跨关跨变体累加（无精英表总评行用）
function noEliteTotalsOf(byStage, stages) {
    let runs = 0, wins = 0, sumSurv = 0;
    for (const st of stages) {
        for (const v of VARIANTS) {
            const d = byStage[st] && byStage[st][v];
            if (!d) continue;
            runs += d.runs; wins += d.wins; sumSurv += d.sumSurv;
        }
    }
    return { runs, wins, sumSurv };
}

function renderResults(byStage, stages) {
    let html = '<table class="elite-table elite-table-fit"><colgroup><col style="width:64px">';
    for (const cfg of configs) html += '<col>';
    html += '</colgroup><tr><th>关卡</th>';
    for (const cfg of configs) html += `<th class="elite-th">${cfg.name}</th>`;
    html += '</tr>';

    for (const st of stages) {
        // 按变体拆行：有数据的变体各占一行（第3关 → 「·胖远桥」「·宋青书」两行；其余关单行）
        for (const v of VARIANTS) {
            const bucket = byStage[st] && byStage[st][v];
            const hasData = bucket && Object.values(bucket).some(d => d.runs > 0);
            if (!hasData) continue;
            const label = v === '标准' ? `第${st}关` : `第${st}关·${v}`;
            html += `<tr><td class="elite-stage">${label}</td>`;
            for (const cfg of configs) {
                html += cellHtml(bucket[cfg.name]);
            }
            html += '</tr>';
        }
    }

    // 总评行：跨关跨变体累加
    html += '<tr><td class="elite-stage">总评</td>';
    for (const cfg of configs) {
        html += cellHtml(totalsOf(cfg, byStage, stages));
    }
    html += '</tr>';

    // 实战评分行（只在总评行下方）：胜率 70% + 存活 30%（此分与主代码的「战力」power 无关，勿混）
    // 输出/承伤不计入：姐姐是附身支援位，输出与承伤天生低，计进去等于拿两把错的尺子量她
    const scored = configs.map(cfg => {
        const t = totalsOf(cfg, byStage, stages);
        const score = t.runs ? (t.wins / t.runs * 0.7 + t.sumSurv / t.runs * 0.3) * 100 : NaN;
        return { cfg, score };
    });
    const ranked = scored.filter(s => !isNaN(s.score)).sort((a, b) => b.score - a.score);
    ranked.forEach((s, i) => { s.rank = i + 1; });
    const avgScore = ranked.length ? ranked.reduce((a, s) => a + s.score, 0) / ranked.length : NaN;
    html += `<tr><td class="elite-stage">实战评分<div class="cell-sub">均值 ${isNaN(avgScore) ? '-' : avgScore.toFixed(1)}</div></td>`;
    for (const s of scored) {
        if (isNaN(s.score)) { html += '<td class="elite-cell">N/A</td>'; continue; }
        const color = s.rank === 1 ? '#ffd700' : (s.rank === ranked.length ? '#ff5252' : '#4caf50');
        html += `<td class="elite-cell">
        <div class="cell-rate" style="color:${color}">${s.score.toFixed(1)} 分</div>
        <div class="cell-sub">第 ${s.rank} / ${ranked.length} 名</div>
        <div class="cell-sub">胜率 70% ＋ 存活 30%</div></td>`;
    }
    html += '</tr></table>';
    html += '<div style="font-size:11px;color:#999;margin-top:6px;">实战评分 = 胜率×70% + 存活率×30%，横向比同列五人、可跨关看；输出/承伤不计入评分。与主代码的「战力」（组队预算 power）无关。样本为自然样本（各精英不同），只作参考。</div>';
    resultEl.innerHTML = html;
}

// 跨关跨变体累加某人数据（总评行与实战评分行共用）
function totalsOf(cfg, byStage, stages) {
    let tw = 0, tr = 0, td = 0, tt = 0, ts = 0;
    for (const st of stages) {
        for (const v of VARIANTS) {
            const d = byStage[st] && byStage[st][v] && byStage[st][v][cfg.name];
            if (!d) continue;
            tw += d.wins; tr += d.runs; td += d.sumDmg; tt += d.sumTaken; ts += d.sumSurv;
        }
    }
    return { runs: tr, wins: tw, sumDmg: td, sumTaken: tt, sumSurv: ts };
}

// 单元格：胜率/输出/承伤/存活 + 样本量（自然样本，各精英不同，样本太少会提示）
function cellHtml(d) {
    if (!d || !d.runs) return '<td class="elite-cell">N/A</td>';
    const rate = (d.wins / d.runs * 100).toFixed(1) + '%';
    const r = parseFloat(rate);
    let color = '#888';
    if (!isNaN(r)) color = r >= 50 ? '#4caf50' : r >= 25 ? '#ffd700' : '#ff5252';
    const avgDmg = Math.floor(d.sumDmg / d.runs);
    const avgTaken = Math.floor(d.sumTaken / d.runs);
    const surv = (d.sumSurv / d.runs * 100).toFixed(1) + '%';
    const thin = d.runs < 200 ? ' <span style="color:#ff9800;">(样本少)</span>' : '';
    return `<td class="elite-cell">
        <div class="cell-rate" style="color:${color}">胜率 ${rate}</div>
        <div class="cell-sub">${d.runs} 场${thin}</div>
        <div class="cell-sub">输出 ${avgDmg}</div>
        <div class="cell-sub">承伤 ${avgTaken}</div>
        <div class="cell-sub">存活 ${surv}</div></td>`;
}
