// tools/846-weak-elite-eval.js —— 弱精英评测（工具箱「🐦 弱精英评测」页签）：全档位具名单位同种子直接 A/B 替换，出胜率 Δ
// ~14 KB
export const VER = 'tools/846-weak-elite-eval.js V1.1.0';
// V1.0.0 | 2026-11-11 从 812-elite-eval.js（V3.8.0）拆出：弱精英评测独立成工具箱「🐦 弱精英评测」页签，
//   UI 元素 id 全部换新（#weakElite*、.weak-elite-stage-check），跑完写 localStorage['ming_elite_eval_snaps'] 一条只含 parts.weak 的快照。
// V1.1.0 | 2026-11-11 名单与跑批换成 839-reflect-eval.html 那套：
//   ① 候选改成运行时从 game.characters 动态收集 M104/M100/M97 全部具名单位（named===true），side 由 camp 派生——
//      替掉 827 的固定 5 人硬名单；页签新增「候选单位」勾选区（默认全选，#weakEliteCandRow）；
//   ② worker kind 由旧的配对臂 kind 换成 'unitAB'（816 V1.23.0）：同种子跑自然局 + 换入局逐场配对，
//      候选自然已在场场次两臂同弃，产出翻盘↑/↓ 与 95% 噪声带；
//   ③ 呈现仍用 802 的 elite-table / elite-cell / elite-stage 类（明教侧 / 六大派侧两张子表）；
//   ④ 默认场次 400 → 100；快照仍写 parts.weak 一条（结构与 826 读取口径一致，第 3 关变体合并进「标准」桶）。

import { runParallel } from './817-shared-worker-runner.js';
import { loadGameData, loadHexEnhanceData, VER as ENGINE_VER } from '../core/201-config-5v5-test.js';

const M_TIERS = [104, 100, 97];
const CHUNK = 50; // 每片局数：细粒度分片——填满线程池无尾部空转；种子用 startIndex 口径，分片粗细不改采样

const startBtn = document.getElementById('weakEliteStartBtn');
const runsInput = document.getElementById('weakEliteRunsInput');
const seedInput = document.getElementById('weakEliteSeedInput');
const enemyHexChk = document.getElementById('weakEliteEnemyHex');
const progressEl = document.getElementById('weakEliteProgress');
const resultEl = document.getElementById('weakEliteResult');
const snapStatusEl = document.getElementById('weakEliteSnapStatus');
const candRowEl = document.getElementById('weakEliteCandRow');

let game = null;

// ============ 快照：跑完自动写一条只含弱精英表的快照（826 平衡告警按表类型跨快照取最新一条） ============
const SNAP_KEY = 'ming_elite_eval_snaps';
const SNAP_LIMIT = 10;                                     // 与 812 共用同一个存储、同一个上限
const TOOL_VER = VER.replace(/^tools\/846-weak-elite-eval\.js\s*/, '');
const ENGINE_VER_TXT = ENGINE_VER.replace(/^core\/201-config-5v5-test\.js\s*/, '');
const batchMeta = seed => ({ ts: Date.now(), seed, ver: `${TOOL_VER}｜引擎 ${ENGINE_VER_TXT}` });

// 双海克斯开关：本页签的 #weakEliteEnemyHex（缺失 = 不勾）
const enemyHexOn = () => !!(enemyHexChk && enemyHexChk.checked);

// 种子可复现：输入框填上次的 masterSeed 即按同样随机流重跑；留空才用 Date.now()
function readSeed() {
    const v = seedInput ? parseInt(seedInput.value, 10) : NaN;
    return Number.isFinite(v) && v > 0 ? v : Date.now();
}

// 结果区顶部显示本批次 seed / 版本 / 完成时间（旧数据没有就标「未记录」，不伪造）
function metaLine(m) {
    if (!m) return '';
    if (m.seed == null) return '<p style="color:#888;font-size:11px;margin:2px 0 6px">种子/版本未记录（旧数据）</p>';
    const d = new Date(m.ts || Date.now()), p2 = n => String(n).padStart(2, '0');
    return `<p style="color:#888;font-size:11px;margin:2px 0 6px">种子 masterSeed=<b style="color:#ffd700">${m.seed}</b>｜版本 ${m.ver || '未记录'}`
        + `｜完成 ${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}</p>`;
}

const readSnaps = () => { try { return JSON.parse(localStorage.getItem(SNAP_KEY) || '[]'); } catch (e) { return []; } };

// 826 读的口径是 byStage[st][variant][名字]：桶里 __natural = 自然臂合计、名字 = 换入臂。
//   unitAB 无变体拆桶（第 3 关变体已合并），统一写进「标准」桶，字段名仍按 826 的 runs/wins。
function snapshotPart(stages, runs, byStage, meta) {
    const part = { stages: [...stages], runs, byStage: {}, ts: meta.ts, seed: meta.seed, ver: meta.ver };
    for (const st of stages) {
        const slot = { __natural: { runs: 0, wins: 0 } };
        for (const [name, a] of Object.entries(byStage[st] || {})) {
            if (!a || !a.runs) continue;
            slot[name] = { runs: a.runs, wins: a.forceWins };
            slot.__natural.runs += a.runs;
            slot.__natural.wins += a.natWins;
        }
        part.byStage[st] = { '标准': slot };
    }
    return part;
}

// 存一条只含 weak 的快照：结构与 812 的表级记录一致（stages/runs/byStage/ts/seed/ver），826 直接读 parts.weak
function saveWeakSnap(part) {
    const snaps = readSnaps();
    const rec = { id: 'snap_' + Date.now(), ts: Date.now(), parts: { weak: part } };
    snaps.unshift(rec);                                    // 新的排最前
    if (snaps.length > SNAP_LIMIT) snaps.length = SNAP_LIMIT;
    try {
        localStorage.setItem(SNAP_KEY, JSON.stringify(snaps));
    } catch (e) {
        return { ok: false, msg: `⚠️ 存盘失败（${(e && e.name) || e}）——本地存储配额已满，先到「⚔️ 精英战力评测」页签点「🗑 清空历史」再跑` };
    }
    return { ok: true, msg: `✅ 已存弱精英快照（1 张表），现存 ${snaps.length} 条「精英评测」历史` };
}

// ============ 候选单位：运行时从游戏数据收集 M104/M100/M97 全部具名单位（同 839 collectCands） ============
function collectCands() {
    const out = [];
    for (const [n, c] of Object.entries((game && game.characters) || {})) {
        if (!M_TIERS.includes(c.m) || c.named !== true) continue;
        out.push({ name: n, camp: c.camp, m: c.m, side: c.camp === '明教' ? 'ally' : 'enemy' });
    }
    return out;
}
function renderCands() {
    if (!candRowEl) return;
    const cands = collectCands();
    candRowEl.innerHTML = cands.length
        ? '<span style="color:#aaa;font-size:12px;">候选：</span>'
          + cands.map(c => `<label><input type="checkbox" class="weak-elite-cand-check" value="${c.name}" checked>${c.name}（${c.camp} M${c.m}）</label>`).join('')
        : '<span style="color:#888;font-size:12px;">没有匹配候选（M104/M100/M97 具名单位）</span>';
}

// 启动：加载游戏数据后渲染候选；元素缺失则整块不启动（不注册监听、不抛错）
async function boot() {
    if (!startBtn || !candRowEl) return;
    try {
        await loadHexEnhanceData();
        game = await loadGameData();
        renderCands();
    } catch (e) {
        candRowEl.innerHTML = `<span style="color:#ff5252;font-size:12px;">候选名单加载失败：${(e && e.message) || e}</span>`;
    }
}

// ============ 弱精英评测：同种子直接 A/B（自然局 vs 换入局，逐场配对） ============
// 口径（同 839 V3.1.0 / 816 kind:'unitAB'）：自然局 = 建队流原样；换入局 = 同种子重建阵容后把该侧一名普通成员
//   换成候选（站位继承、独立 rng 初始化），逐场配对。候选自然已在场的场次两臂同弃；
//   Δ = (换入胜 − 自然胜)/配对场；翻盘↑/↓ = 输→赢 / 赢→输 场数。胜 = 明教。
async function runWeakEval() {
    const stages = Array.from(document.querySelectorAll('.weak-elite-stage-check:checked')).map(cb => parseInt(cb.value));
    if (stages.length === 0) { alert('请至少选择一个关卡'); return; }
    const cands = collectCands();
    const checked = new Set(Array.from(document.querySelectorAll('.weak-elite-cand-check:checked')).map(cb => cb.value));
    const units = cands.filter(c => checked.has(c.name));
    if (!units.length) { alert('请至少勾选一个候选单位'); return; }

    const RUNS = parseInt(runsInput && runsInput.value, 10) || 100;
    const enemyHex = enemyHexOn();
    const startT = performance.now();
    const masterSeed = readSeed();

    startBtn.disabled = true;
    resultEl.innerHTML = '<div class="elite-empty">运行中...</div>';
    progressEl.textContent = `准备开跑：${stages.length} 关 × ${RUNS} 场 × ${units.length} 候选 × 2 局/场（自然+换入）…`;

    // byStage[st][名字] = 该单位在该关的配对累加器（同 816 runUnitABJob 返回口径）
    const newAgg = () => ({ runs: 0, natWins: 0, forceWins: 0, flipWin: 0, flipLose: 0, sumDmg: 0, sumTaken: 0, sumSurv: 0, sumRebound: 0 });
    const byStage = {};
    for (const st of stages) {
        byStage[st] = {};
        for (const u of units) byStage[st][u.name] = newAgg();
    }

    // 每关每个分片一个 seed，该分片内所有候选共用——同种子逐场配对才干净
    const jobs = [];
    for (const stage of stages) {
        const chunks = Math.ceil(RUNS / CHUNK);
        for (let c = 0; c < chunks; c++) {
            const n = Math.min(CHUNK, RUNS - c * CHUNK);
            if (n <= 0) continue;
            const seed = masterSeed + stage * 131;
            for (const u of units) jobs.push({ stage, seed, startIndex: c * CHUNK, runs: n, elite: u.name, side: u.side, label: `第${stage}关#${c + 1}·${u.name}` });
        }
    }

    try {
        await runParallel({
            jobs,
            kind: 'unitAB',
            nextJobMsg: (job, id) => ({ jobId: id, kind: 'unitAB', stage: job.stage, seed: job.seed, startIndex: job.startIndex, runs: job.runs, elite: job.elite, side: job.side, enemyHex }),
            onJobDone: (finished, total, job, part) => {
                const slot = byStage[job.stage] && byStage[job.stage][job.elite];
                if (slot) for (const k of Object.keys(slot)) slot[k] += Number((part && part[k]) || 0);
                progressEl.textContent = `${job.label} 完成 (${finished}/${total}，已用 ${((performance.now() - startT) / 1000).toFixed(1)}s)`;
            },
            onAllDone: () => {
                const meta = batchMeta(masterSeed);
                renderWeakResults(byStage, units, stages, { ...meta, runs: RUNS, enemyHex });
                progressEl.textContent = `✅ 弱精英评测完成，总耗时 ${((performance.now() - startT) / 1000).toFixed(1)}s`;
                if (snapStatusEl) snapStatusEl.textContent = saveWeakSnap(snapshotPart(stages, RUNS, byStage, meta)).msg;    // 跑完自动存（不必手点）
            }
        });
    } catch (e) {
        console.error('[weak-elite-eval] 弱精英评测异常:', e);
        resultEl.innerHTML = `<div class="elite-empty">出错：${e.message}<br>完整堆栈已输出到 F12 控制台</div>`;
        progressEl.textContent = '❌ 弱精英评测异常';
    } finally {
        startBtn.disabled = false;
    }
}

// ============ 结果渲染：明教侧 / 六大派侧两张子表，DOM 与样式沿用 elite-table 系列 ============
// 单元格式（同 839 语义）：单关 = Δ + 换入胜率；总行 = Δ + 噪声带/配对场
const gainOf = (d, side) => side === 'ally' ? d : -d;                      // 统一成「对己方阵营的增益」再判色
const marginOf = e => e.runs ? 2 * Math.sqrt(e.flipWin + e.flipLose) / e.runs * 100 : 0;
const deltaColor = (d, side, margin) => Math.abs(gainOf(d, side)) <= margin ? '#888' : (gainOf(d, side) >= 0 ? '#4caf50' : '#ff5252');

function deltaOf(stAgg, name) {
    const e = stAgg && stAgg[name];
    if (!e || !e.runs) return null;
    const d = (e.forceWins - e.natWins) / e.runs * 100;
    return { d, wr: e.forceWins / e.runs * 100, runs: e.runs, flipWin: e.flipWin, flipLose: e.flipLose, margin: marginOf(e) };
}

function renderWeakResults(byStage, units, stages, meta) {
    const num = (v, f) => v == null ? '—' : f(v);
    const fmtD = d => `${d >= 0 ? '+' : ''}${d.toFixed(1)}`;

    const sideBlock = (title, list, note) => {
        let html = `<div style="font-weight:bold;margin:14px 0 6px">${title}</div>`;
        if (!list.length) return html + '<div class="elite-empty">本次未勾选该侧候选</div>';
        const rows = list.map(u => {
            const cells = stages.map(st => deltaOf(byStage[st], u.name));
            const t = { runs: 0, natWins: 0, forceWins: 0, flipWin: 0, flipLose: 0, sumDmg: 0, sumTaken: 0, sumSurv: 0, sumRebound: 0 };
            for (const st of stages) {
                const a = byStage[st] && byStage[st][u.name];
                if (a) for (const k of Object.keys(t)) t[k] += a[k];
            }
            const totD = t.runs ? (t.forceWins - t.natWins) / t.runs * 100 : null;
            return { u, cells, t, totD };
        }).sort((a, b) => {
            const av = a.u.side === 'ally' ? 1 : -1;   // 按「对己方阵营的增益」排序
            return (b.totD == null ? -999 : av * b.totD) - (a.totD == null ? -999 : av * a.totD);
        });

        html += '<table class="elite-table elite-table-fit"><tr><th class="elite-th">单位</th><th class="elite-th">阵营/M</th>';
        for (const st of stages) html += `<th class="elite-th">第${st}关 Δ·换入胜率</th>`;
        html += '<th class="elite-th">总Δ·噪声带</th><th class="elite-th">翻盘↑</th><th class="elite-th">翻盘↓</th>'
            + '<th class="elite-th">输出/场</th><th class="elite-th">承伤/场</th><th class="elite-th">存活率</th><th class="elite-th">反伤/场</th></tr>';

        for (const { u, cells, t, totD } of rows) {
            const m = marginOf(t);
            html += `<tr><td class="elite-stage">${u.name}</td><td class="cell-sub">${u.camp} M${u.m}</td>`;
            for (const c of cells) {
                html += c
                    ? `<td class="elite-cell"><div class="cell-rate" style="color:${deltaColor(c.d, u.side, c.margin)}">Δ ${fmtD(c.d)}</div><div class="cell-sub">胜率 ${c.wr.toFixed(0)}%</div></td>`
                    : '<td class="elite-cell">—</td>';
            }
            const totStyle = totD == null ? 'color:#888' : `color:${deltaColor(totD, u.side, m)}`;
            html += `<td class="elite-cell"><div class="cell-rate" style="${totStyle}">${totD == null ? '—' : 'Δ ' + fmtD(totD)}</div>`
                + `<div class="cell-sub">±${m.toFixed(1)} · ${t.runs} 配对场</div></td>`;
            html += `<td class="elite-cell">${num(t.runs ? t.flipWin / t.runs * 100 : null, v => v.toFixed(1))}</td>`
                + `<td class="elite-cell">${num(t.runs ? t.flipLose / t.runs * 100 : null, v => v.toFixed(1))}</td>`
                + `<td class="elite-cell">${num(t.runs ? t.sumDmg / t.runs : null, v => Math.round(v))}</td>`
                + `<td class="elite-cell">${num(t.runs ? t.sumTaken / t.runs : null, v => Math.round(v))}</td>`
                + `<td class="elite-cell">${num(t.runs ? t.sumSurv / t.runs * 100 : null, v => v.toFixed(1) + '%')}</td>`
                + `<td class="elite-cell">${num(t.runs ? t.sumRebound / t.runs : null, v => v.toFixed(1))}</td></tr>`;
        }
        html += '</table>';
        html += `<div style="font-size:11px;color:#999;margin-top:6px;">${note}</div>`;
        return html;
    };

    const ally = units.filter(u => u.side === 'ally');
    const enemy = units.filter(u => u.side === 'enemy');
    let html = metaLine(meta);
    html += sideBlock(`🐦 明教侧具名单位（M${M_TIERS.join('/M')}，选 ${ally.length} 个）`, ally,
        'Δ = 换入局明教胜率 − 自然局胜率（同种子逐场配对）。Δ>0 = 该单位给明教带来增益。候选自然已在该侧的场次两臂同弃（常客有效配对场偏少）。着色按己方增益：绿 = 帮自己阵营，灰 = |Δ|≤±95% 噪声带。');
    html += sideBlock(`🗡 六大派侧具名单位（M${M_TIERS.join('/M')}，选 ${enemy.length} 个）`, enemy,
        '替换对象 = 该侧非具名普通成员（唯一前排受保护）。Δ<0 = 明教更难打（敌方变强）；着色同样按「对己方阵营的增益」（此处绿色 = 更压明教）。翻盘↑/↓ 为每 100 配对场的输→赢 / 赢→输 场数。');
    html += `<div style="font-size:11px;color:#999;margin-top:8px;">seed=${meta.seed} · ${meta.enemyHex ? '双' : '单'}海克斯 · 每关目标 ${meta.runs == null ? '?' : meta.runs} 场（见各表「配对场」）。单关列噪声大，跨关结论看总Δ。</div>`;
    resultEl.innerHTML = html;
    attachCopyBtn(resultEl);
}

// ============ 复制结果表（同 812） ============
function fallbackCopyElite(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
}
function attachCopyBtn(host) {
    if (!host) return;
    const old = host.querySelector('.elite-copy');
    if (old) old.remove();
    if (!host.querySelector('table')) return;
    const btn = document.createElement('button');
    btn.className = 'elite-copy';
    btn.textContent = '📋 复制这张表';
    btn.style.cssText = 'display:block;margin:8px 0 4px;background:#4fc3f7;color:#1a1a2e;border:0;border-radius:6px;padding:6px 12px;font-weight:bold;cursor:pointer;font-family:monospace;font-size:12px';
    btn.addEventListener('click', async () => {
        const md = [...host.querySelectorAll('table')].map(tbl =>
            [...tbl.querySelectorAll('tr')].map((tr, i) => {
                const cells = [...tr.children].map(td => (td.textContent || '').trim().replace(/\s+/g, ' ').replace(/\|/g, '\\|') || ' ');
                let line = '| ' + cells.join(' | ') + ' |';
                if (i === 0) line += '\n| ' + cells.map(() => '---').join(' | ') + ' |';
                return line;
            }).join('\n')
        ).join('\n\n');
        let ok = true;
        try { await navigator.clipboard.writeText(md); } catch (e) { ok = fallbackCopyElite(md); }
        btn.textContent = ok ? '✅ 已复制' : '复制失败';
        setTimeout(() => { btn.textContent = '📋 复制这张表'; }, 1200);
    });
    host.appendChild(btn);
}

// 页签未挂载（元素缺失）时整块不启动：不注册监听、不抛错
if (startBtn && runsInput && progressEl && resultEl && candRowEl) {
    startBtn.addEventListener('click', runWeakEval);
    boot();
}
