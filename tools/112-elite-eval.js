// 由 tools/111-elite-power-eval.html 改造 | 跑张无忌/韦一笑/小昭姊/小昭妹 1-7关×N场（关卡由 102 复选框勾选，已含第7关）
import { runParallel } from './117-shared-worker-runner.js';
import { NATURAL_ELITES, SOLO_ELITES as SOLO_ELITE_NAMES, BOSS_ELITES as BOSS_ELITE_NAMES, WEAK_ELITES, ENEMY_VARIANTS } from './127-tool-registry.js';

export const VER = 'tools/112-elite-eval.js V3.2.0';

// 名单统一由 127-tool-registry.js 提供（自然 6 人 / 强精英 5 人 / Boss 1 人 / 弱精英 4 人 / 敌方变体）
// 本文件只做形态适配：127 存字符串原始形态，112 各处用 { name } 对象数组
const configs = NATURAL_ELITES.map(name => ({ name }));
const SOLO_ELITES = SOLO_ELITE_NAMES.map(name => ({ name }));
const BOSS_ELITES = BOSS_ELITE_NAMES.map(name => ({ name }));
const VARIANTS = ENEMY_VARIANTS;
const WEAK_ALLY = WEAK_ELITES.filter(w => w.side === 'ally');
const WEAK_ENEMY = WEAK_ELITES.filter(w => w.side === 'enemy');

const startBtn = document.getElementById('eliteStartBtn');
const runsInput = document.getElementById('eliteRunsInput');
const progressEl = document.getElementById('eliteProgress');
const resultEl = document.getElementById('eliteResult');
const soloBtn = document.getElementById('eliteSoloBtn');       // 2026-10-08 单英雄胜率（强精英）
const soloProgressEl = document.getElementById('eliteSoloProgress');
const soloResultEl = document.getElementById('eliteSoloResult');
const bossBtn = document.getElementById('eliteBossBtn');       // 2026-10-21 Boss·张无忌（M115）
const bossProgressEl = document.getElementById('eliteBossProgress');
const bossResultEl = document.getElementById('eliteBossResult');
const noEliteBtn = document.getElementById('eliteNoEliteBtn'); // 2026-10-09 无精英基线
const noEliteProgressEl = document.getElementById('eliteNoEliteProgress');
const noEliteResultEl = document.getElementById('eliteNoEliteResult');
const weakBtn = document.getElementById('eliteWeakBtn');        // 2026-10-16 弱精英评测
const weakProgressEl = document.getElementById('eliteWeakProgress');
const weakResultEl = document.getElementById('eliteWeakResult');
const soloRunsInput = document.getElementById('eliteSoloRunsInput'); // 2026-10-09 单核表（强精英/Boss/无精英）专用场数（默认 400）：与普通表分开，免得忘改 1200 一跑就是 5 倍时长

const CHUNK = 50; // 每片局数：细粒度分片（2026-10-16 从 300 收窄）——填满线程池无尾部空转；种子用 startIndex 口径，分片粗细不改采样

// ============ 2026-10-19 V2.9.0 结果快照：跑完自动存 + 手动补存，可载入回看 ============
const SNAP_KEY = 'ming_elite_eval_snaps';
const SNAP_LIMIT = 10;                                     // 最多留 10 条历史，超出丢最旧
const TABLE_LABEL = { elite: '主表·自然出场', solo: '强精英', boss: 'Boss·张无忌', none: '无精英基线', weak: '弱精英' };
const snapSelect = document.getElementById('eliteSnapSelect');
const snapSaveBtn = document.getElementById('eliteSaveSnapBtn');
const snapLoadBtn = document.getElementById('eliteLoadSnapBtn');
const snapDropBtn = document.getElementById('eliteDropSnapBtn');
const snapStatusEl = document.getElementById('eliteSnapStatus');
// 本次跑出的表（未存盘前只活在内存）：{ stages, runs, byStage }
let latest = { elite: null, solo: null, boss: null, none: null, weak: null };

const readSnaps = () => { try { return JSON.parse(localStorage.getItem(SNAP_KEY) || '[]'); } catch (e) { return []; } };
const writeSnaps = arr => { try { localStorage.setItem(SNAP_KEY, JSON.stringify(arr)); return null; } catch (e) { return e; } };

function snapLabel(s) {
    const d = new Date(s.ts), p2 = n => String(n).padStart(2, '0');
    const kinds = Object.keys(s.parts);
    const stages = s.parts[kinds[0]].stages.join(',');
    return `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}｜关${stages}｜${kinds.map(k => TABLE_LABEL[k]).join('+')}`;
}

function refreshSnapSelect(keepId) {
    const snaps = readSnaps();
    snapSelect.innerHTML = snaps.length
        ? snaps.map(s => `<option value="${s.id}">${snapLabel(s)}</option>`).join('')
        : '<option value="">（暂无历史：跑完任意一张表会自动存）</option>';
    if (keepId && snaps.some(s => s.id === keepId)) snapSelect.value = keepId;
}

// 存一条快照：keys = 要存的表（跑完自动存「刚跑完那一张」；手动按钮存当前内存里全部表）
function saveSnap(keys) {
    const parts = {};
    for (const k of keys) {
        if (!latest[k]) continue;
        // 深拷再存：byStage 是渲染用的活对象，直接引用会跟后续重跑共享
        parts[k] = { stages: [...latest[k].stages], runs: latest[k].runs, byStage: JSON.parse(JSON.stringify(latest[k].byStage)) };
        // V3.2.0：主表额外带上「明教英雄个体胜率」（126 规则八英雄层面的数据源；其余表没有该字段）
        if (latest[k].hero) parts[k].hero = JSON.parse(JSON.stringify(latest[k].hero));
    }
    if (Object.keys(parts).length === 0) return { ok: false, msg: '⚠️ 还没跑过任何表，无可存' };
    const snaps = readSnaps();
    const rec = { id: 'snap_' + Date.now(), ts: Date.now(), parts };
    snaps.unshift(rec);                                    // 新的排最前
    if (snaps.length > SNAP_LIMIT) snaps.length = SNAP_LIMIT;
    const err = writeSnaps(snaps);
    if (err) return { ok: false, msg: `⚠️ 存盘失败（${(err && err.name) || err}）——本地存储配额已满，先「🗑 清空历史」再存` };
    refreshSnapSelect(rec.id);
    return { ok: true, msg: `✅ 已存快照（${Object.keys(parts).length} 张表），现存 ${snaps.length} 条历史` };
}

snapSaveBtn.addEventListener('click', () => {
    snapStatusEl.textContent = saveSnap(['elite', 'solo', 'boss', 'none', 'weak']).msg;
});

snapLoadBtn.addEventListener('click', () => {
    const rec = readSnaps().find(s => s.id === snapSelect.value);
    if (!rec) { snapStatusEl.textContent = '⚠️ 没选中历史快照'; return; }
    const p = rec.parts;
    if (p.elite) { latest.elite = p.elite; renderResults(p.elite.byStage, p.elite.stages); progressEl.textContent = `📂 已载入历史快照 ${snapLabel(rec)}`; }
    if (p.solo) { latest.solo = p.solo; renderSoloResults(p.solo.byStage, p.solo.stages, SOLO_ELITES, soloResultEl, SOLO_NOTE); soloProgressEl.textContent = `📂 已载入历史快照 ${snapLabel(rec)}`; }
    if (p.boss) { latest.boss = p.boss; renderSoloResults(p.boss.byStage, p.boss.stages, BOSS_ELITES, bossResultEl, BOSS_NOTE); bossProgressEl.textContent = `📂 已载入历史快照 ${snapLabel(rec)}`; }
    if (p.none) { latest.none = p.none; renderNoEliteResults(p.none.byStage, p.none.stages); noEliteProgressEl.textContent = `📂 已载入历史快照 ${snapLabel(rec)}`; }
    if (p.weak) { latest.weak = p.weak; renderWeakResults(p.weak.byStage, p.weak.stages); weakProgressEl.textContent = `📂 已载入历史快照 ${snapLabel(rec)}`; }
    snapStatusEl.textContent = `📂 已载入 ${snapLabel(rec)}`;
});

snapDropBtn.addEventListener('click', () => {
    if (!confirm('确认删除全部历史快照？只删存盘的历史，不影响页面上当前的表')) return;
    localStorage.removeItem(SNAP_KEY);
    refreshSnapSelect();
    snapStatusEl.textContent = '🗑 历史已清空';
});

refreshSnapSelect();


startBtn.addEventListener('click', async () => {
    const stages = Array.from(document.querySelectorAll('.elite-stage-check:checked')).map(cb => parseInt(cb.value));
    const RUNS = parseInt(runsInput.value) || 1200;
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
            jobs.push({ stage, seed: masterSeed + stage * 131, startIndex: c * CHUNK, runs, label: `第${stage}关#${c + 1}` });
        }
    }

    try {
        await runParallel({
            jobs,
            kind: 'elite',
            nextJobMsg: (job, id) => ({ jobId: id, kind: 'elite', stage: job.stage, seed: job.seed, startIndex: job.startIndex || 0, runs: job.runs }),
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
                latest.elite = { stages, runs: RUNS, byStage, hero: buildHeroRates(byStage, stages) };
                renderResults(byStage, stages);
                progressEl.textContent = `✅ 全部完成，总耗时 ${((performance.now() - startT) / 1000).toFixed(1)}s`;
                snapStatusEl.textContent = saveSnap(['elite']).msg;   // V2.9.0 跑完自动存（不必手点）
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

// ============ 2026-10-08 单英雄胜率：强精英逐一单挑（2026-10-21 拆出 Boss 表） ============
// 口径：force 单精英（29 V7.5.16 起各路 force 全抑制随机轮盘=真·单精英局）、海克斯开、
//       胜=明教。与普通评测的区别：普通表是「自然出场归因」（同场多精英），这张表是「控制变量单挑」。
//       寒离飒走 29 V7.6.1 的 forceHanLiSa（与她升强精英后的通道一致），单核口径全表统一。
const SOLO_NOTE = '强精英单挑 = force 该精英单核（抑制随机轮盘、海克斯开、胜=明教）。与上方「自然出场归因」表互补：这里看单核带队能力，上面看真实出场表现。';
const BOSS_NOTE = 'Boss·张无忌 = force 张无忌单核（M115 boss 档、抑制随机轮盘、海克斯开、胜=明教）。单独一表，避免与 M107 强精英混在同一把尺子上比较。';

async function runSoloGroup(list, ui) {
    const stages = Array.from(document.querySelectorAll('.elite-stage-check:checked')).map(cb => parseInt(cb.value));
    const RUNS = parseInt(soloRunsInput.value) || 400;   // 单英雄表专用场数（默认 400，与普通表分开）
    if (stages.length === 0) { alert('请至少选择一个关卡'); return; }

    ui.btn.disabled = true;
    ui.progressEl.textContent = `开始${ui.title}评测...`;
    ui.resultEl.innerHTML = '<div class="elite-empty">运行中...</div>';

    const byStage = {}; // stage -> variant -> 精英名 -> {runs,wins,sumSurv,sumDmg,sumTaken}
    for (const st of stages) {
        byStage[st] = {};
        for (const v of VARIANTS) {
            byStage[st][v] = {};
            for (const cfg of list) byStage[st][v][cfg.name] = { runs: 0, wins: 0, sumSurv: 0, sumDmg: 0, sumTaken: 0 };
        }
    }
    const startT = performance.now();
    const masterSeed = Date.now();

    // 每精英每关拆片派发（种子再错开 7717*精英序号，互不重叠）
    const jobs = [];
    let eliteIdx = 0;
    for (const cfg of list) {
        for (const stage of stages) {
            const chunks = Math.ceil(RUNS / CHUNK);
            for (let c = 0; c < chunks; c++) {
                const runs = Math.min(CHUNK, RUNS - c * CHUNK);
                if (runs <= 0) continue;
                jobs.push({ stage, elite: cfg.name, seed: masterSeed + stage * 131 + eliteIdx * 7717, startIndex: c * CHUNK, runs, label: `${cfg.name}·第${stage}关#${c + 1}` });
            }
        }
        eliteIdx++;
    }

    try {
        await runParallel({
            jobs,
            kind: 'soloElite',
            nextJobMsg: (job, id) => ({ jobId: id, kind: 'soloElite', stage: job.stage, seed: job.seed, startIndex: job.startIndex || 0, runs: job.runs, elite: job.elite }),
            onJobDone: (finished, total, job, part) => {
                // part = { 变体名: {runs,wins,...} }（单精英局只落一个桶，桶名 = 本局敌方是谁）
                for (const [variant, d] of Object.entries(part && part.variants || {})) {
                    const slot = byStage[job.stage] && byStage[job.stage][variant];
                    const a = slot && slot[job.elite];
                    if (!a) continue;
                    a.runs += d.runs; a.wins += d.wins; a.sumSurv += d.sumSurv; a.sumDmg += d.sumDmg; a.sumTaken += d.sumTaken;
                }
                ui.progressEl.textContent = `${job.label} 完成 (${finished}/${total}，已用 ${((performance.now() - startT) / 1000).toFixed(1)}s)`;
            },
            onAllDone: () => {
                latest[ui.key] = { stages, runs: RUNS, byStage };
                renderSoloResults(byStage, stages, list, ui.resultEl, ui.note);
                ui.progressEl.textContent = `✅ ${ui.title}评测完成，总耗时 ${((performance.now() - startT) / 1000).toFixed(1)}s`;
                snapStatusEl.textContent = saveSnap([ui.key]).msg;    // V2.9.0 跑完自动存（不必手点）
            }
        });
    } catch (e) {
        console.error(`[elite-${ui.key}] ${ui.title}评测异常:`, e);
        ui.resultEl.innerHTML = `<div class="elite-empty">出错：${e.message}<br>完整堆栈已输出到 F12 控制台</div>`;
        ui.progressEl.textContent = `❌ ${ui.title}评测异常`;
    } finally {
        ui.btn.disabled = false;
    }
}

soloBtn.addEventListener('click', () => runSoloGroup(SOLO_ELITES, {
    btn: soloBtn, progressEl: soloProgressEl, resultEl: soloResultEl, key: 'solo', title: '强精英', note: SOLO_NOTE
}));
bossBtn.addEventListener('click', () => runSoloGroup(BOSS_ELITES, {
    btn: bossBtn, progressEl: bossProgressEl, resultEl: bossResultEl, key: 'boss', title: 'Boss', note: BOSS_NOTE
}));

function renderSoloResults(byStage, stages, list, resultEl, note) {
    let html = '<table class="elite-table elite-table-fit"><colgroup><col style="width:64px">';
    for (const cfg of list) html += '<col>';
    html += '</colgroup><tr><th>关卡</th>';
    for (const cfg of list) html += `<th class="elite-th">${cfg.name}</th>`;
    html += '</tr>';
    for (const st of stages) {
        // 按变体拆行（V2.4.2）：第3关拆「·胖远桥」「·宋青书」两行，其余关单行；无数据的变体不出行
        for (const v of VARIANTS) {
            const slot = byStage[st] && byStage[st][v];
            const hasData = slot && list.some(cfg => slot[cfg.name] && slot[cfg.name].runs > 0);
            if (!hasData) continue;
            const label = v === '标准' ? `第${st}关` : `第${st}关·${v}`;
            html += `<tr><td class="elite-stage">${label}</td>`;
            for (const cfg of list) html += soloCellHtml(slot[cfg.name]);
            html += '</tr>';
        }
    }
    // 总评行（2026-10-08 补）：跨关累加，口径与上方自然表的总评一致
    html += '<tr><td class="elite-stage">总评</td>';
    for (const cfg of list) html += soloCellHtml(soloTotalsOf(cfg, byStage, stages));
    html += '</tr>';
    html += '</table>';
    html += `<div style="font-size:11px;color:#999;margin-top:6px;">${note}</div>`;
    resultEl.innerHTML = html;
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
            jobs.push({ stage, seed: masterSeed + stage * 131, startIndex: c * CHUNK, runs, label: `第${stage}关#${c + 1}` });
        }
    }

    try {
        await runParallel({
            jobs,
            kind: 'noElite',
            nextJobMsg: (job, id) => ({ jobId: id, kind: 'noElite', stage: job.stage, seed: job.seed, startIndex: job.startIndex || 0, runs: job.runs }),
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
                latest.none = { stages, runs: RUNS, byStage };
                renderNoEliteResults(byStage, stages);
                noEliteProgressEl.textContent = `✅ 无精英基线完成，总耗时 ${((performance.now() - startT) / 1000).toFixed(1)}s`;
                snapStatusEl.textContent = saveSnap(['none']).msg;    // V2.9.0 跑完自动存（不必手点）
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

// ============ 2026-10-16 V2.8.0 弱精英评测：单弱精英强制上场 vs 自然配对对照 ============
// 口径（V3.1.0 路C，老板拍板）：明教侧 = 116 建队完成后「确定性替身换名」（两臂建队随机数逐数一致、
//       站位逐位全同，Δ=纯精英贡献）；六大派侧 = M104 数字空位具名锁定（同「只换名」形态）；
//       同一关同一变体配 natural 臂（同种子）作对照，表内直接出 Δ。胜 = 明教。
weakBtn.addEventListener('click', async () => {
    const stages = Array.from(document.querySelectorAll('.elite-stage-check:checked')).map(cb => parseInt(cb.value));
    const RUNS = parseInt(soloRunsInput.value) || 400;
    if (stages.length === 0) { alert('请至少选择一个关卡'); return; }

    weakBtn.disabled = true;
    weakProgressEl.textContent = '开始弱精英评测...';
    weakResultEl.innerHTML = '<div class="elite-empty">运行中...</div>';

    // byStage[st][variant][key]：key = '__natural'（自然对照臂）或 弱精英名
    // V1.13.1：natural 桶按名字带 clean[name]（该局两侧都没出现这个弱精英的统计）
    const newAgg = () => ({ runs: 0, wins: 0, sumSurv: 0, sumDmg: 0, sumTaken: 0, clean: {} });
    const byStage = {};
    for (const st of stages) {
        byStage[st] = {};
        for (const v of VARIANTS) {
            byStage[st][v] = { __natural: newAgg() };
            for (const w of WEAK_ELITES) byStage[st][v][w.name] = newAgg();
        }
    }
    const startT = performance.now();
    const masterSeed = Date.now();

    // 自然臂 + 4 精英臂共用同一 (stage,chunk) seed：配对差才干净
    const jobs = [];
    for (const stage of stages) {
        const chunks = Math.ceil(RUNS / CHUNK);
        for (let c = 0; c < chunks; c++) {
            const runs = Math.min(CHUNK, RUNS - c * CHUNK);
            if (runs <= 0) continue;
            const seed = masterSeed + stage * 131;
            const startIndex = c * CHUNK;
            jobs.push({ stage, seed, startIndex, runs, arm: 'natural', label: `第${stage}关#${c + 1}·自然对照` });
            for (const w of WEAK_ELITES) {
                jobs.push({ stage, seed, startIndex, runs, elite: w.name, side: w.side, label: `第${stage}关#${c + 1}·${w.name}` });
            }
        }
    }

    try {
        await runParallel({
            jobs,
            kind: 'weakElite',
            nextJobMsg: (job, id) => ({ jobId: id, kind: 'weakElite', stage: job.stage, seed: job.seed, startIndex: job.startIndex || 0, runs: job.runs, elite: job.elite, side: job.side, arm: job.arm || 'elite' }),
            onJobDone: (finished, total, job, part) => {
                const key = (part && part.arm === 'natural') ? '__natural' : job.elite;
                for (const [variant, d] of Object.entries((part && part.variants) || {})) {
                    const slot = byStage[job.stage] && byStage[job.stage][variant];
                    const a = slot && slot[key];
                    if (!a) continue;
                    a.runs += d.runs; a.wins += d.wins;
                    a.sumSurv += d.sumSurv; a.sumDmg += d.sumDmg; a.sumTaken += d.sumTaken;
                    for (const [nm, c] of Object.entries(d.clean || {})) {
                        const t = a.clean[nm] || (a.clean[nm] = { runs: 0, wins: 0 });
                        t.runs += c.runs; t.wins += c.wins;
                    }
                }
                weakProgressEl.textContent = `${job.label} 完成 (${finished}/${total}，已用 ${((performance.now() - startT) / 1000).toFixed(1)}s)`;
            },
            onAllDone: () => {
                latest.weak = { stages, runs: RUNS, byStage };
                renderWeakResults(byStage, stages);
                weakProgressEl.textContent = `✅ 弱精英评测完成，总耗时 ${((performance.now() - startT) / 1000).toFixed(1)}s`;
                snapStatusEl.textContent = saveSnap(['weak']).msg;    // V2.9.0 跑完自动存（不必手点）
            }
        });
    } catch (e) {
        console.error('[elite-weak] 弱精英评测异常:', e);
        weakResultEl.innerHTML = `<div class="elite-empty">出错：${e.message}<br>完整堆栈已输出到 F12 控制台</div>`;
        weakProgressEl.textContent = '❌ 弱精英评测异常';
    } finally {
        weakBtn.disabled = false;
    }
});

function renderWeakResults(byStage, stages) {
    const sub = (title, list, note) => {
        const anyData = stages.some(st => VARIANTS.some(v => list.some(w => byStage[st] && byStage[st][v] && byStage[st][v][w.name] && byStage[st][v][w.name].runs > 0)));
        if (!anyData) return `<div style="font-weight:bold;margin:14px 0 6px">${title}</div><div class="elite-empty">本次该侧全部未上场，无数据</div>`;
        let html = `<div style="font-weight:bold;margin:14px 0 6px">${title}</div>`;
        html += '<table class="elite-table elite-table-fit"><colgroup><col style="width:120px">';
        for (const w of list) html += '<col>';
        html += '</colgroup><tr><th>关卡</th>';
        for (const w of list) html += `<th class="elite-th">${w.name}</th>`;
        html += '</tr>';
        for (const st of stages) {
            for (const v of VARIANTS) {              // 按敌方变体拆行（第3关拆「·胖远桥」「·宋青书」）
                const slot = byStage[st] && byStage[st][v];
                if (!slot) continue;
                if (!list.some(w => slot[w.name] && slot[w.name].runs > 0)) continue;
                const label = v === '标准' ? `第${st}关` : `第${st}关·${v}`;
                html += `<tr><td class="elite-stage">${label}</td>`;
                for (const w of list) html += weakCellHtml(slot[w.name], cleanBase(slot.__natural, w.name));
                html += '</tr>';
            }
        }
        html += '<tr><td class="elite-stage">总评</td>';
        for (const w of list) {
            const t = weakArmTotals(w.name, byStage, stages);   // Δ 只取该精英真有数据的关/变体上的自然对照，避免口径错位
            html += weakCellHtml(t.t, t.baseRate);
        }
        html += '</tr></table>';
        html += `<div style="font-size:11px;color:#999;margin-top:6px;">${note}</div>`;
        return html;
    };
    let html = '';
    html += sub('🐦 明教弱精英（建队后换掉一个普通位，强精英轮盘照常）', WEAK_ALLY,
        'Δ = 该弱精英臂胜率 − 同关同变体「自然对照」臂（同种子）。V3.1.0 起换人发生在建队完成之后：两臂站位逐位全同，Δ 不含站位噪音，只剩精英本人 vs 被换的普通位。Δ>0 = 该弱精英给明教带来增益。「自然出现该精英」的局两臂同剔，样本逐场对应。');
    html += sub('🗡 六大派弱精英（锁定敌方 M104 数字空位）', WEAK_ENEMY,
        'Δ = 锁定该弱精英后明教胜率 − 自然对照。Δ<0 = 更难打（他更强、对明教威胁更大）。第3关为固定变体阵容、无 M104 空位，故该关不出行。自然对照已剔除「本局自然出现该精英」的局，故其场次略少于精英臂。');
    weakResultEl.innerHTML = html;
}

// 弱精英表单元格：胜率 + Δ（相对自然对照）+ 场次/输出/承伤/存活
function weakCellHtml(d, baseRate) {
    if (!d || !d.runs) return '<td class="elite-cell">N/A</td>';
    const rate = d.wins / d.runs * 100;
    const color = rate >= 50 ? '#4caf50' : rate >= 25 ? '#ffd700' : '#ff5252';
    const surv = (d.sumSurv / d.runs * 100).toFixed(1);
    const thin = d.runs < 200 ? ' <span style="color:#ff9800;">(样本少)</span>' : '';
    let deltaHtml = '<div class="cell-sub">Δ —（无对照）</div>';
    if (baseRate != null) {
        const dv = rate - baseRate;
        const dc = dv > 0.05 ? '#4caf50' : dv < -0.05 ? '#ff5252' : '#888';
        deltaHtml = `<div class="cell-sub" style="color:${dc}">Δ ${dv >= 0 ? '+' : ''}${dv.toFixed(1)}</div>`;
    }
    return `<td class="elite-cell">
        <div class="cell-rate" style="color:${color}">胜率 ${rate.toFixed(1)}%</div>
        ${deltaHtml}
        <div class="cell-sub">${d.runs} 场${thin}</div>
        <div class="cell-sub">输出 ${Math.floor(d.sumDmg / d.runs)} 承伤 ${Math.floor(d.sumTaken / d.runs)}</div>
        <div class="cell-sub">存活 ${surv}%</div></td>`;
}

// 弱精英表基准取用（V1.13.1 干净对照）：只剔「本局自然出现了该弱精英」的局，其他弱精英保持自然分布
function cleanAgg(nb, name) {
    return nb && nb.clean ? nb.clean[name] : null;
}
function cleanBase(nb, name) {
    const c = cleanAgg(nb, name);
    return c && c.runs > 0 ? c.wins / c.runs * 100 : null;
}

// 某弱精英跨关跨变体累加 + 只取它真有数据的关/变体上的自然对照（总评行用）
function weakArmTotals(name, byStage, stages) {
    const t = { runs: 0, wins: 0, sumSurv: 0, sumDmg: 0, sumTaken: 0 };
    let nRuns = 0, nWins = 0;
    for (const st of stages) {
        for (const v of VARIANTS) {
            const slot = byStage[st] && byStage[st][v];
            const d = slot && slot[name];
            if (!d || !d.runs) continue;
            t.runs += d.runs; t.wins += d.wins; t.sumSurv += d.sumSurv; t.sumDmg += d.sumDmg; t.sumTaken += d.sumTaken;
            const nb = cleanAgg(slot.__natural, name);
            if (nb && nb.runs) { nRuns += nb.runs; nWins += nb.wins; }
        }
    }
    return { t, baseRate: nRuns > 0 ? nWins / nRuns * 100 : null };
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
    html += '<div style="font-size:11px;color:#999;margin-top:6px;">实战评分 = 胜率×70% + 存活率×30%，横向比同列六名精英、可跨关看；输出/承伤不计入评分。与主代码的「战力」（组队预算 power）无关。样本为自然样本（各精英不同），只作参考。</div>';
    resultEl.innerHTML = html;
}

// 明教英雄个体胜率（V3.2.0）：126 规则八「英雄层面」的模拟侧数据源。
// 语义 = 「该英雄在场时明教整体胜率」——与 52 生涯记录的 heroWins/appear 同口径，可逐英雄同名对照。
// 与主表 byStage 同源聚合（复用 totalsOf），不额外跑批；runs=在场局数，wins=在场且明教胜的局数。
function buildHeroRates(byStage, stages) {
    const out = {};
    for (const cfg of configs) {
        const t = totalsOf(cfg, byStage, stages);
        if (!t.runs) continue;
        out[cfg.name] = { runs: t.runs, wins: t.wins, rate: t.wins / t.runs };
    }
    return out;
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
