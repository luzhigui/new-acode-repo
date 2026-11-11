// tools/846-weak-elite-eval.js —— 弱精英评测（工具箱独立页签）：单弱精英强制上场 vs 同种子自然对照臂，直接出胜率 Δ
// ~18 KB
export const VER = 'tools/846-weak-elite-eval.js V1.0.0';
// V1.0.0 | 2026-11-11 从 812-elite-eval.js（V3.8.0）拆出：弱精英评测独立成工具箱「🐦 弱精英评测」页签。
//   算法 / 口径 / Δ 算法 / 渲染结构 1:1 搬迁（812 的 V1.13.1 干净对照、V3.1.0 建队后换人、V3.4.0 拆行口径全部保留）；
//   UI 元素 id 全部换新（#weakElite*、.weak-elite-stage-check），避免与 812 抢元素；
//   跑完写 localStorage['ming_elite_eval_snaps'] 一条只含 parts.weak 的快照，826 平衡告警照旧可读（它按表类型跨快照取最新一条）。

import { runParallel } from './817-shared-worker-runner.js';
import { WEAK_ELITES, ENEMY_VARIANTS, STATS_TH } from './827-tool-registry.js';
import { VER as ENGINE_VER } from '../core/201-config-5v5-test.js';

// 名单统一由 827-tool-registry.js 提供（弱精英 5 人 / 敌方变体），本文件只做形态适配
const VARIANTS = ENEMY_VARIANTS;
// 拆行口径（同 812 V3.4.0）：content 里只有第 3 关配了 squadVariants，所以「关卡变体」只属于第 3 关。
//   其它关出现的同名精英来自六大派额外混入（M107/M100 档）或关卡固定阵容，不属于变体，不单列成行。
const VARIANT_STAGE = 3;
// 跨变体合并（数值字段累加；弱精英表的 clean 子表逐名累加）
function mergeAgg(dst, d) {
    if (!d) return dst;
    for (const [k, v] of Object.entries(d)) {
        if (k === 'clean') {
            dst.clean = dst.clean || {};
            for (const [nm, c] of Object.entries(v || {})) {
                const t = dst.clean[nm] || (dst.clean[nm] = { runs: 0, wins: 0, draws: 0 });
                t.runs += c.runs || 0; t.wins += c.wins || 0; t.draws += c.draws || 0;
            }
        } else if (typeof v === 'number') {
            dst[k] = (dst[k] || 0) + v;
        }
    }
    return dst;
}
// 该关要渲染的行：第 3 关 → 变体各一行；其余关 → 单行（全部桶合并）
//   桶有两种形态：主表/单英雄表是 { 名字: agg }，无精英表直接是 agg —— 逐键按类型合并，两种都吃得下
function rowsOfStage(st, byStage) {
    const same = byStage[st] || {};
    if (Number(st) === VARIANT_STAGE) return VARIANTS.map(v => ({ variant: v, bucket: same[v] }));
    const merged = {};
    for (const v of VARIANTS) {
        const slot = same[v];
        if (!slot) continue;
        for (const [k, val] of Object.entries(slot)) {
            if (val && typeof val === 'object') merged[k] = mergeAgg(merged[k] || {}, val);
            else if (typeof val === 'number') merged[k] = (merged[k] || 0) + val;
        }
    }
    return [{ variant: '标准', bucket: merged }];
}

const WEAK_ALLY = WEAK_ELITES.filter(w => w.side === 'ally');
const WEAK_ENEMY = WEAK_ELITES.filter(w => w.side === 'enemy');

const startBtn = document.getElementById('weakEliteStartBtn');
const runsInput = document.getElementById('weakEliteRunsInput');
const seedInput = document.getElementById('weakEliteSeedInput');
const enemyHexChk = document.getElementById('weakEliteEnemyHex');
const progressEl = document.getElementById('weakEliteProgress');
const resultEl = document.getElementById('weakEliteResult');
const snapStatusEl = document.getElementById('weakEliteSnapStatus');

const CHUNK = 50; // 每片局数：细粒度分片（同 812）——填满线程池无尾部空转；种子用 startIndex 口径，分片粗细不改采样

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

// 存一条只含 weak 的快照：结构与 812 的表级记录一致（stages/runs/byStage/ts/seed/ver），826 直接读 parts.weak
function saveWeakSnap(table) {
    const snaps = readSnaps();
    const rec = {
        id: 'snap_' + Date.now(),
        ts: Date.now(),
        parts: {
            weak: {
                stages: [...table.stages], runs: table.runs,
                byStage: JSON.parse(JSON.stringify(table.byStage)),
                ts: table.ts || null, seed: table.seed ?? null, ver: table.ver || ''
            }
        }
    };
    snaps.unshift(rec);                                    // 新的排最前
    if (snaps.length > SNAP_LIMIT) snaps.length = SNAP_LIMIT;
    try {
        localStorage.setItem(SNAP_KEY, JSON.stringify(snaps));
    } catch (e) {
        return { ok: false, msg: `⚠️ 存盘失败（${(e && e.name) || e}）——本地存储配额已满，先到「⚔️ 精英战力评测」页签点「🗑 清空历史」再跑` };
    }
    return { ok: true, msg: `✅ 已存弱精英快照（1 张表），现存 ${snaps.length} 条「精英评测」历史` };
}

// ============ 弱精英评测：单弱精英强制上场 vs 自然配对对照 ============
// 口径（V3.1.0 路C，老板拍板）：明教侧 = 116 建队完成后「确定性替身换名」（两臂建队随机数逐数一致、
//       站位逐位全同，Δ=纯精英贡献）；六大派侧 = M104 数字空位具名锁定（同「只换名」形态）；
//       同一关同一变体配 natural 臂（同种子）作对照，表内直接出 Δ。胜 = 明教。
async function runWeakEval() {
    const stages = Array.from(document.querySelectorAll('.weak-elite-stage-check:checked')).map(cb => parseInt(cb.value));
    const RUNS = parseInt(runsInput && runsInput.value) || 400;
    if (stages.length === 0) { alert('请至少选择一个关卡'); return; }

    startBtn.disabled = true;
    progressEl.textContent = '开始弱精英评测...';
    resultEl.innerHTML = '<div class="elite-empty">运行中...</div>';

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
    const masterSeed = readSeed();

    // 自然臂 + 5 精英臂共用同一 (stage,chunk) seed：配对差才干净
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
            nextJobMsg: (job, id) => ({ jobId: id, kind: 'weakElite', stage: job.stage, seed: job.seed, startIndex: job.startIndex || 0, runs: job.runs, elite: job.elite, side: job.side, arm: job.arm || 'elite', enemyHex: enemyHexOn() }),
            onJobDone: (finished, total, job, part) => {
                const key = (part && part.arm === 'natural') ? '__natural' : job.elite;
                for (const [variant, d] of Object.entries((part && part.variants) || {})) {
                    const slot = byStage[job.stage] && byStage[job.stage][variant];
                    const a = slot && slot[key];
                    if (!a) continue;
                    a.runs += d.runs; a.wins += d.wins; a.draws = (a.draws || 0) + (d.draws || 0);
                    a.sumSurv += d.sumSurv; a.sumDmg += d.sumDmg; a.sumTaken += d.sumTaken;
                    for (const [nm, c] of Object.entries(d.clean || {})) {
                        const t = a.clean[nm] || (a.clean[nm] = { runs: 0, wins: 0, draws: 0 });
                        t.runs += c.runs; t.wins += c.wins; t.draws += c.draws || 0;
                    }
                }
                progressEl.textContent = `${job.label} 完成 (${finished}/${total}，已用 ${((performance.now() - startT) / 1000).toFixed(1)}s)`;
            },
            onAllDone: () => {
                const table = { stages, runs: RUNS, byStage, ...batchMeta(masterSeed) };
                renderWeakResults(table.byStage, table.stages, table);
                progressEl.textContent = `✅ 弱精英评测完成，总耗时 ${((performance.now() - startT) / 1000).toFixed(1)}s`;
                snapStatusEl.textContent = saveWeakSnap(table).msg;    // 跑完自动存（不必手点）
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

function renderWeakResults(byStage, stages, meta) {
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
            for (const { variant: v, bucket: slot } of rowsOfStage(st, byStage)) {   // 拆行口径同主表（V3.4.0）
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
    let html = metaLine(meta);
    html += sub('🐦 明教弱精英（建队后换掉一个普通位，强精英轮盘照常）', WEAK_ALLY,
        'Δ = 该弱精英臂胜率 − 同关同变体「自然对照」臂（同种子）。V3.1.0 起换人发生在建队完成之后：两臂站位逐位全同，Δ 不含站位噪音，只剩精英本人 vs 被换的普通位。Δ>0 = 该弱精英给明教带来增益。「自然出现该精英」的局两臂同剔，样本逐场对应。');
    html += sub('🗡 六大派弱精英（锁定敌方 M104 数字空位）', WEAK_ENEMY,
        'Δ = 锁定该弱精英后明教胜率 − 自然对照。Δ<0 = 更难打（他更强、对明教威胁更大）。第3关为固定变体阵容、无 M104 空位，故该关不出行。自然对照已剔除「本局自然出现该精英」的局，故其场次略少于精英臂。');
    resultEl.innerHTML = html;
    attachCopyBtn(resultEl);
}

// 弱精英表单元格：胜率 + Δ（相对自然对照）+ 场次/输出/承伤/存活
function weakCellHtml(d, baseRate) {
    if (!d || !d.runs) return '<td class="elite-cell">N/A</td>';
    const rate = d.wins / d.runs * 100;
    const color = rate >= 50 ? '#4caf50' : rate >= 25 ? '#ffd700' : '#ff5252';
    const surv = (d.sumSurv / d.runs * 100).toFixed(1);
    const thin = d.runs < STATS_TH.THIN_SAMPLE ? ' <span style="color:#ff9800;">(样本少)</span>' : '';
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
        ${drawSub(d)}
        <div class="cell-sub">输出 ${Math.floor(d.sumDmg / d.runs)} 承伤 ${Math.floor(d.sumTaken / d.runs)}</div>
        <div class="cell-sub">存活 ${surv}%</div></td>`;
}

// 平局标注：平局计入场次与胜率分母（胜 = winner==='明教'），与 813/852 同一口径
function drawSub(d) {
    const n = (d && d.draws) || 0;
    return n > 0 ? `<div class="cell-sub" style="color:#9e9e9e;">平局 ${n}</div>` : '';
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
    const t = { runs: 0, wins: 0, draws: 0, sumSurv: 0, sumDmg: 0, sumTaken: 0 };
    let nRuns = 0, nWins = 0;
    for (const st of stages) {
        for (const v of VARIANTS) {
            const slot = byStage[st] && byStage[st][v];
            const d = slot && slot[name];
            if (!d || !d.runs) continue;
            t.runs += d.runs; t.wins += d.wins; t.draws += d.draws || 0; t.sumSurv += d.sumSurv; t.sumDmg += d.sumDmg; t.sumTaken += d.sumTaken;
            const nb = cleanAgg(slot.__natural, name);
            if (nb && nb.runs) { nRuns += nb.runs; nWins += nb.wins; }
        }
    }
    return { t, baseRate: nRuns > 0 ? nWins / nRuns * 100 : null };
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
if (startBtn && runsInput && progressEl && resultEl) {
    startBtn.addEventListener('click', runWeakEval);
}
