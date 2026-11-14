// 由 tools/111-elite-power-eval.html 改造 | 跑张无忌/韦一笑/小昭姊/小昭妹 1-7关×N场（关卡由 102 复选框勾选，已含第7关）
import { runParallel } from './817-shared-worker-runner.js';
import { NATURAL_ELITES, SOLO_ELITES as SOLO_ELITE_NAMES, BOSS_ELITES as BOSS_ELITE_NAMES, ENEMY_VARIANTS, STATS_TH } from './827-tool-registry.js';
import { VER as ENGINE_VER } from '../core/201-config-5v5-test.js';

export const VER = 'tools/812-elite-eval.js V3.11.0';
// V3.11.0 | 2026-11-14 修「开始评测/强精英点了没反应、刷新也没用、必须清空历史」：
//   顶层 autoRestoreLatest / refreshSnapSelect 未做异常保护，坏快照一抛错就打断模块执行，
//   后续监听（第 232 行起）全部没挂上；「🗑 清空历史」注册在前所以还能用，清完才恢复。
//   现改为两步都 try/catch + snapLabel 对缺 stages / 空 part 做护栏。
// V3.10.0 | 2026-11-12 打开页面自动显示上次结果：载入逻辑抽成 applySnap()，页面初始化时直接渲染
//   最近一条可渲染快照（不必手动选历史、不必重跑）；顺带把下拉选中项同步到该条。
// V3.9.0 | 2026-11-11 弱精英评测拆到 tools/846-weak-elite-eval.js 独立页签（802「🐦 弱精英评测」）：
//   本文件的 weak 表 / 监听 / 渲染 / 快照分支全部移除，只留主表 + 强精英 + Boss + 无精英四张表；
//   旧快照里仍可能带 parts.weak，载入时安静跳过；历史快照下拉只列含本工具可渲染表的条目
//   （弱精英快照仍写同一 localStorage，826 平衡告警照旧读取）。
// V3.8.0 | 2026-11-08 平局进表（口径统一）：816 批处理 job 不再丢平局场次，四张表每格多一行「平局 N」，
//   胜率分母 = 总场次（含平局），与 813 承伤对账、852 生涯日志一致；旧快照无 draws 字段按 0 显示。
// V3.7.0 | 2026-11-08 快照跨版本混榜显式告警：同一条快照里各表来自不同版本（或旧表没记版本）时，
//   下拉标签与载入提示都出「⚠️版本不一致」，不再只把版本号拼在一起让人自己比。
// V3.6.0 | 2026-11-08 可复现：新增「种子」输入框（留空=Date.now()），填上次结果的 masterSeed 即按同样随机流重跑；
//   四张表结果区顶部显示 masterSeed / 版本 / 完成时间（旧快照显示「未记录」）。
// V3.5.0 | 2026-11-08 快照带批次元数据：每张表记录自己的完成时间 ts、种子 seed、版本（本工具 + 引擎配置），
//   手动保存多张表时不再把不同批次统一盖成同一个时间点；标签里不同批次显式标「⚠️多批次」并给出时间范围与 seed。
//   旧快照没有这些字段时显示「时间/seed 未记录」，不伪造。
// V3.4.0 | 2026-11-08 拆行口径回到「只有第 3 关有变体」：此前每关都按敌方阵容反推「·胖远桥 / ·宋青书」行，
//   引擎的六大派额外混入在 4~7 关刷出这两个名字时，表里就多出「第4关·胖远桥」这类行，看着像跨关变体。
//   实测这两个名字的出场只有两条来源：① 第 3 关 squadVariants（真变体）② 4~7 关额外混入（不是变体）。
//   现改为：仅第 3 关拆变体两行，其余关一律单行（把该关所有桶合并后再算）。引擎、116 分桶、827 名单均不动。
// V3.3.0 | 2026-10-31 双海克斯：工具栏新增「双海克斯（六大派也选）」复选框（102 的 #eliteEnemyHex），
//   勾选后五类 job 全部透传 enemyHex，116 用 core/206-battle-runner V1.3.0 的 enemyHexPicker 让六大派也自动选。
//   不勾 = 旧口径（只有明教选），历史基线可继续对比。

// 双海克斯开关：802-toolkit.html 的 #eliteEnemyHex（缺失元素 = 不勾，向后兼容无 UI 的调用）
const enemyHexOn = () => !!(document.getElementById('eliteEnemyHex') && document.getElementById('eliteEnemyHex').checked);

// 名单统一由 827-tool-registry.js 提供（自然 6 人 / 强精英 5 人 / Boss 1 人 / 弱精英 4 人 / 敌方变体）
// 本文件只做形态适配：127 存字符串原始形态，112 各处用 { name } 对象数组
const configs = NATURAL_ELITES.map(name => ({ name }));
const SOLO_ELITES = SOLO_ELITE_NAMES.map(name => ({ name }));
const BOSS_ELITES = BOSS_ELITE_NAMES.map(name => ({ name }));
const VARIANTS = ENEMY_VARIANTS;
// 拆行口径（V3.4.0）：content 里只有第 3 关配了 squadVariants，所以「关卡变体」只属于第 3 关。
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
const soloRunsInput = document.getElementById('eliteSoloRunsInput'); // 2026-10-09 单核表（强精英/Boss/无精英）专用场数（默认 400）：与普通表分开，免得忘改 1200 一跑就是 5 倍时长

const CHUNK = 50; // 每片局数：细粒度分片（2026-10-16 从 300 收窄）——填满线程池无尾部空转；种子用 startIndex 口径，分片粗细不改采样

// ============ 2026-10-19 V2.9.0 结果快照：跑完自动存 + 手动补存，可载入回看 ============
const SNAP_KEY = 'ming_elite_eval_snaps';
const SNAP_LIMIT = 10;                                     // 最多留 10 条历史，超出丢最旧
const TABLE_LABEL = { elite: '主表·自然出场', solo: '强精英', boss: 'Boss·张无忌', none: '无精英基线' };
const snapSelect = document.getElementById('eliteSnapSelect');
const snapSaveBtn = document.getElementById('eliteSaveSnapBtn');
const snapLoadBtn = document.getElementById('eliteLoadSnapBtn');
const snapDropBtn = document.getElementById('eliteDropSnapBtn');
const snapStatusEl = document.getElementById('eliteSnapStatus');
// 本次跑出的表（未存盘前只活在内存）：{ stages, runs, byStage, ts, seed, ver }
let latest = { elite: null, solo: null, boss: null, none: null };

// V3.5.0 批次元数据：每张表各自记完成时间 / 种子 / 版本，不再由快照统一盖一个 ts
const TOOL_VER = VER.replace(/^tools\/812-elite-eval\.js\s*/, '');
const ENGINE_VER_TXT = ENGINE_VER.replace(/^core\/201-config-5v5-test\.js\s*/, '');
const batchMeta = seed => ({ ts: Date.now(), seed, ver: `${TOOL_VER}｜引擎 ${ENGINE_VER_TXT}` });

// V3.6.0：种子可复现——输入框填上次的 masterSeed 即按同样随机流重跑；留空才用 Date.now()
function readSeed() {
    const el = document.getElementById('eliteSeedInput');
    const v = el ? parseInt(el.value, 10) : NaN;
    return Number.isFinite(v) && v > 0 ? v : Date.now();
}
// 结果区顶部显示本批次 seed / 版本 / 完成时间（旧快照没有就标「未记录」，不伪造）
function metaLine(m) {
    if (!m) return '';
    if (m.seed == null) return '<p style="color:#888;font-size:11px;margin:2px 0 6px">种子/版本未记录（旧数据）</p>';
    const d = new Date(m.ts || Date.now()), p2 = n => String(n).padStart(2, '0');
    return `<p style="color:#888;font-size:11px;margin:2px 0 6px">种子 masterSeed=<b style="color:#ffd700">${m.seed}</b>｜版本 ${m.ver || '未记录'}`
        + `｜完成 ${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}</p>`;
}

const readSnaps = () => { try { return JSON.parse(localStorage.getItem(SNAP_KEY) || '[]'); } catch (e) { return []; } };
const writeSnaps = arr => { try { localStorage.setItem(SNAP_KEY, JSON.stringify(arr)); return null; } catch (e) { return e; } };

// V3.7.0：快照是否跨版本混榜——各表版本不统一，或有的旧表根本没记版本，都算混杂。
//   只把版本号拼在一起（vers.join(' / ')）读者看不出问题，必须显式告警。
function snapVerMixed(s) {
    // V3.9.0：只比本工具可渲染的四种表——旧快照里的 parts.weak 属于 846 的口径，不计入混榜判断
    const kinds = Object.keys(s.parts).filter(k => TABLE_LABEL[k] && s.parts[k]);
    const vers = [...new Set(kinds.map(k => s.parts[k].ver).filter(Boolean))];
    return vers.length > 1 || (vers.length > 0 && vers.length < kinds.length);
}

function snapLabel(s) {
    const d = new Date(s.ts), p2 = n => String(n).padStart(2, '0');
    const fmt = t => { const x = new Date(t); return `${p2(x.getMonth() + 1)}-${p2(x.getDate())} ${p2(x.getHours())}:${p2(x.getMinutes())}`; };
    // V3.11.0 护栏：坏快照（缺 stages / 空 part）不能让标签函数抛错——它在模块顶层被调用，
    //   一抛就打断后续监听注册，表现为「按钮点了没反应、刷新也没用、清空历史才好」。
    const parts = s.parts || {};
    const kinds = Object.keys(parts);
    const first = kinds.map(k => parts[k]).find(p => p && Array.isArray(p.stages));
    const stages = first ? first.stages.join(',') : '?';
    // V3.5.0：表级批次元数据（旧快照没有 → 显示未记录，不拿快照 ts 冒充）
    const times = [...new Set(kinds.map(k => parts[k] && parts[k].ts).filter(v => v != null))].sort((a, b) => a - b);
    const seeds = [...new Set(kinds.map(k => parts[k] && parts[k].seed).filter(v => v != null))];
    const vers = [...new Set(kinds.map(k => parts[k] && parts[k].ver).filter(Boolean))];
    let meta = times.length === 0 ? '｜时间/seed 未记录'
        : (times.length > 1 ? `｜⚠️多批次 ${fmt(times[0])} ~ ${fmt(times[times.length - 1])}` : `｜${fmt(times[0])}`);
    if (seeds.length) meta += `｜seed ${seeds.join('/')}`;
    if (vers.length) meta += `｜${vers.join(' / ')}`;
    if (snapVerMixed(s)) meta += '｜⚠️版本不一致（跨版本混榜，胜率不可直接比较）';
    return `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}｜关${stages}｜${kinds.map(k => TABLE_LABEL[k]).filter(Boolean).join('+')}${meta}`;
}

function refreshSnapSelect(keepId) {
    // V3.9.0：只列含本工具能渲染的表（弱精英快照只存 parts.weak，由 846 页签负责，这里不列以免出现空标签）
    const snaps = readSnaps().filter(s => s && s.parts && Object.keys(s.parts).some(k => TABLE_LABEL[k]));
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
        // V3.5.0：批次元数据跟着各自那张表走，手动一次存多张也不会被压成同一个时间点
        parts[k] = {
            stages: [...latest[k].stages], runs: latest[k].runs,
            byStage: JSON.parse(JSON.stringify(latest[k].byStage)),
            ts: latest[k].ts || null, seed: latest[k].seed ?? null, ver: latest[k].ver || ''
        };
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
    snapStatusEl.textContent = saveSnap(['elite', 'solo', 'boss', 'none']).msg;
});

// 载入一条快照到页面（按钮和「打开页面自动恢复」共用）
function applySnap(rec, auto) {
    if (!rec) return false;
    const p = rec.parts;
    // V3.7.0：载入时若这份快照跨版本混榜，提示条里明说，避免拿混版本的表直接横比
    const label = snapLabel(rec) + (snapVerMixed(rec) ? '｜⚠️版本不一致，跨版本胜率不能直接比' : '');
    let loaded = 0;
    if (p.elite) { latest.elite = p.elite; renderResults(p.elite.byStage, p.elite.stages); progressEl.textContent = `${auto ? '📂 上次结果' : '📂 已载入历史快照'} ${label}`; loaded++; }
    if (p.solo) { latest.solo = p.solo; renderSoloResults(p.solo.byStage, p.solo.stages, SOLO_ELITES, soloResultEl, SOLO_NOTE, p.solo); soloProgressEl.textContent = `${auto ? '📂 上次结果' : '📂 已载入历史快照'} ${label}`; loaded++; }
    if (p.boss) { latest.boss = p.boss; renderSoloResults(p.boss.byStage, p.boss.stages, BOSS_ELITES, bossResultEl, BOSS_NOTE, p.boss); bossProgressEl.textContent = `${auto ? '📂 上次结果' : '📂 已载入历史快照'} ${label}`; loaded++; }
    if (p.none) { latest.none = p.none; renderNoEliteResults(p.none.byStage, p.none.stages); noEliteProgressEl.textContent = `${auto ? '📂 上次结果' : '📂 已载入历史快照'} ${label}`; loaded++; }
    // V3.9.0：旧快照里可能带 parts.weak（弱精英已拆到 846），这里直接跳过，不报错
    snapStatusEl.textContent = auto ? `📂 已自动显示上次结果 ${label}（想刷新就重新跑）` : `📂 已载入 ${label}`;
    return loaded > 0;
}

snapLoadBtn.addEventListener('click', () => {
    const rec = readSnaps().find(s => s.id === snapSelect.value);
    if (!rec) { snapStatusEl.textContent = '⚠️ 没选中历史快照'; return; }
    applySnap(rec, false);
});

snapDropBtn.addEventListener('click', () => {
    if (!confirm('确认删除全部历史快照？只删存盘的历史，不影响页面上当前的表')) return;
    localStorage.removeItem(SNAP_KEY);
    refreshSnapSelect();
    snapStatusEl.textContent = '🗑 历史已清空';
});

// V3.11.0：模块顶层的「历史下拉 + 自动恢复」全部关进 try/catch。这两步在监听注册之前执行，
//   历史里只要有一条坏快照（缺 stages / 空 part / 旧格式）就会抛错打断整个模块：
//   → 「▶ 开始评测」「⚔ 强精英」监听根本没挂上（点了没反应，刷新读到同一条坏快照还是没反应），
//   → 而「🗑 清空历史」注册在前仍然可用，所以表现为「必须清空历史才能点」。
//   与内存大小无关；内存占大只是让坏快照更容易产生。
try {
    refreshSnapSelect();
} catch (e) {
    console.error('[elite-eval] 历史下拉渲染失败（已跳过，不影响跑批）:', e);
}

// 打开页面自动恢复：默认把最近一条「本工具能渲染」的快照摆出来，不用手动选历史、不用重跑
(function autoRestoreLatest() {
    try {
        const snaps = readSnaps().filter(s => s && s.parts && Object.keys(s.parts).some(k => TABLE_LABEL[k]));
        if (!snaps.length) return;
        const newest = snaps.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
        if (applySnap(newest, true)) snapSelect.value = newest.id;
    } catch (e) {
        console.error('[elite-eval] 自动载入上次结果失败（已跳过，按钮照常可用）:', e);
        snapStatusEl.textContent = `⚠️ 上次结果载入失败，已跳过（可点「🗑 清空历史」重来）：${(e && e.message) || e}`;
    }
})();


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
    const masterSeed = readSeed();
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
            nextJobMsg: (job, id) => ({ jobId: id, kind: 'elite', stage: job.stage, seed: job.seed, startIndex: job.startIndex || 0, runs: job.runs, enemyHex: enemyHexOn() }),
            onJobDone: (finished, total, job, part) => {
                // part = { 变体名: { 角色名: {runs,wins,...} } }
                for (const [variant, roles] of Object.entries(part || {})) {
                    const slot = byStage[job.stage] && byStage[job.stage][variant];
                    if (!slot) continue;
                    for (const [name, d] of Object.entries(roles || {})) {
                        const a = slot[name];
                        if (!a) continue;
                        a.runs += d.runs; a.wins += d.wins; a.draws = (a.draws || 0) + (d.draws || 0);
                        a.sumDmg += d.sumDmg; a.sumTaken += d.sumTaken; a.sumSurv += d.sumSurv;
                    }
                }
                progressEl.textContent = `第${job.stage}关 完成 (${finished}/${total}，已用 ${((performance.now() - startT) / 1000).toFixed(1)}s)`;
            },
            onAllDone: () => {
                latest.elite = { stages, runs: RUNS, byStage, hero: buildHeroRates(byStage, stages), ...batchMeta(masterSeed) };
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
    const masterSeed = readSeed();

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
            nextJobMsg: (job, id) => ({ jobId: id, kind: 'soloElite', stage: job.stage, seed: job.seed, startIndex: job.startIndex || 0, runs: job.runs, elite: job.elite, enemyHex: enemyHexOn() }),
            onJobDone: (finished, total, job, part) => {
                // part = { 变体名: {runs,wins,...} }（单精英局只落一个桶，桶名 = 本局敌方是谁）
                for (const [variant, d] of Object.entries(part && part.variants || {})) {
                    const slot = byStage[job.stage] && byStage[job.stage][variant];
                    const a = slot && slot[job.elite];
                    if (!a) continue;
                    a.runs += d.runs; a.wins += d.wins; a.draws = (a.draws || 0) + (d.draws || 0); a.sumSurv += d.sumSurv; a.sumDmg += d.sumDmg; a.sumTaken += d.sumTaken;
                }
                ui.progressEl.textContent = `${job.label} 完成 (${finished}/${total}，已用 ${((performance.now() - startT) / 1000).toFixed(1)}s)`;
            },
            onAllDone: () => {
                latest[ui.key] = { stages, runs: RUNS, byStage, ...batchMeta(masterSeed) };
                renderSoloResults(byStage, stages, list, ui.resultEl, ui.note, latest[ui.key]);
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

function renderSoloResults(byStage, stages, list, resultEl, note, meta) {
    let html = metaLine(meta) + '<table class="elite-table elite-table-fit"><colgroup><col style="width:64px">';
    for (const cfg of list) html += '<col>';
    html += '</colgroup><tr><th>关卡</th>';
    for (const cfg of list) html += `<th class="elite-th">${cfg.name}</th>`;
    html += '</tr>';
    for (const st of stages) {
        // 拆行口径同主表（V3.4.0）：只有第 3 关拆变体行，其余关单行
        for (const { variant: v, bucket: slot } of rowsOfStage(st, byStage)) {
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
    attachCopyBtn(resultEl);
}

// V3.8.0：平局标注。平局计入场次与胜率分母（胜 = winner==='明教'），与 813 承伤对账、852 生涯日志同一口径；
//   816 各批处理 job 已同步补 draws 计数，旧快照没有该字段时按 0 处理。
function drawSub(d) {
    const n = (d && d.draws) || 0;
    return n > 0 ? `<div class="cell-sub" style="color:#9e9e9e;">平局 ${n}</div>` : '';
}

// 单英雄表单元格：胜率/场次/存活（逐关行与总评行共用）
function soloCellHtml(d) {
    if (!d || !d.runs) return '<td class="elite-cell">N/A</td>';
    const rate = (d.wins / d.runs * 100).toFixed(1);
    const r = parseFloat(rate);
    const color = r >= 50 ? '#4caf50' : r >= 25 ? '#ffd700' : '#ff5252';
    const surv = (d.sumSurv / d.runs * 100).toFixed(1);
    const thin = d.runs < STATS_TH.THIN_SAMPLE ? ' <span style="color:#ff9800;">(样本少)</span>' : '';
    return `<td class="elite-cell">
        <div class="cell-rate" style="color:${color}">胜率 ${rate}%</div>
        <div class="cell-sub">${d.runs} 场${thin}</div>
        ${drawSub(d)}
        <div class="cell-sub">存活 ${surv}%</div></td>`;
}

// 跨关跨变体累加某精英（单英雄表总评行用）
function soloTotalsOf(cfg, byStage, stages) {
    let runs = 0, wins = 0, draws = 0, sumSurv = 0;
    for (const st of stages) {
        for (const v of VARIANTS) {
            const d = byStage[st] && byStage[st][v] && byStage[st][v][cfg.name];
            if (!d) continue;
            runs += d.runs; wins += d.wins; draws += d.draws || 0; sumSurv += d.sumSurv;
        }
    }
    return { runs, wins, draws, sumSurv };
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
    const masterSeed = readSeed();

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
            nextJobMsg: (job, id) => ({ jobId: id, kind: 'noElite', stage: job.stage, seed: job.seed, startIndex: job.startIndex || 0, runs: job.runs, enemyHex: enemyHexOn() }),
            onJobDone: (finished, total, job, part) => {
                // part = { 变体名: {runs,wins,sumSurv} }（无精英局同样按敌方变体分桶）
                for (const [variant, d] of Object.entries((part && part.variants) || {})) {
                    const a = byStage[job.stage] && byStage[job.stage][variant];
                    if (!a) continue;
                    a.runs += d.runs; a.wins += d.wins; a.draws = (a.draws || 0) + (d.draws || 0); a.sumSurv += d.sumSurv;
                }
                noEliteProgressEl.textContent = `第${job.stage}关 完成 (${finished}/${total}，已用 ${((performance.now() - startT) / 1000).toFixed(1)}s)`;
            },
            onAllDone: () => {
                latest.none = { stages, runs: RUNS, byStage, ...batchMeta(masterSeed) };
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
    let html = metaLine(latest.none) + '<table class="elite-table elite-table-fit"><colgroup><col style="width:120px"><col><col></colgroup><tr><th>关卡</th><th class="elite-th">胜率 / 场次</th><th class="elite-th">平均存活</th></tr>';
    for (const st of stages) {
        for (const { variant: v, bucket: d } of rowsOfStage(st, byStage)) {   // 拆行口径同主表（V3.4.0）
            if (!d || !d.runs) continue;
            const label = v === '标准' ? `第${st}关` : `第${st}关·${v}`;
            html += noEliteRowHtml(label, d);
        }
    }
    html += noEliteRowHtml('总评', noEliteTotalsOf(byStage, stages));
    html += '</table>';
    html += '<div style="font-size:11px;color:#999;margin-top:6px;">无精英基线 = 明教侧一个精英都不出（重掷阵容凑无精英局；海克斯开、胜=明教）。作精英价值对照：与上面两张表同关比，差额就是精英带来的胜率增益。无精英局没有「主英雄」，第三列改记全队平均存活人数。</div>';
    noEliteResultEl.innerHTML = html;
    attachCopyBtn(noEliteResultEl);
}

// 无精英表一行：胜率/场次 + 全队平均存活人数（无精英时"存活率"没意义，改看剩几人）
function noEliteRowHtml(label, d) {
    if (!d || !d.runs) return `<tr><td class="elite-stage">${label}</td><td class="elite-cell">N/A</td><td class="elite-cell">N/A</td></tr>`;
    const rate = (d.wins / d.runs * 100).toFixed(1);
    const r = parseFloat(rate);
    const color = r >= 50 ? '#4caf50' : r >= 25 ? '#ffd700' : '#ff5252';
    const thin = d.runs < STATS_TH.THIN_SAMPLE ? ' <span style="color:#ff9800;">(样本少)</span>' : '';
    return `<tr><td class="elite-stage">${label}</td>
        <td class="elite-cell"><div class="cell-rate" style="color:${color}">胜率 ${rate}%</div><div class="cell-sub">${d.runs} 场${thin}</div>${drawSub(d)}</td>
        <td class="elite-cell"><div class="cell-rate">${(d.sumSurv / d.runs).toFixed(2)} 人</div><div class="cell-sub">全队 5 人</div></td></tr>`;
}

// 跨关跨变体累加（无精英表总评行用）
function noEliteTotalsOf(byStage, stages) {
    let runs = 0, wins = 0, draws = 0, sumSurv = 0;
    for (const st of stages) {
        for (const v of VARIANTS) {
            const d = byStage[st] && byStage[st][v];
            if (!d) continue;
            runs += d.runs; wins += d.wins; draws += d.draws || 0; sumSurv += d.sumSurv;
        }
    }
    return { runs, wins, draws, sumSurv };
}

function renderResults(byStage, stages) {
    let html = metaLine(latest.elite) + '<table class="elite-table elite-table-fit"><colgroup><col style="width:64px">';
    for (const cfg of configs) html += '<col>';
    html += '</colgroup><tr><th>关卡</th>';
    for (const cfg of configs) html += `<th class="elite-th">${cfg.name}</th>`;
    html += '</tr>';

    for (const st of stages) {
        // 拆行口径（V3.4.0）：只有第 3 关有阵容变体 → 拆「·胖远桥」「·宋青书」两行；其余关单行
        for (const { variant: v, bucket } of rowsOfStage(st, byStage)) {
            const hasData = bucket && Object.values(bucket).some(d => d && d.runs > 0);
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
    attachCopyBtn(resultEl);
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
    let tw = 0, tr = 0, td = 0, tt = 0, ts = 0, dr = 0;
    for (const st of stages) {
        for (const v of VARIANTS) {
            const d = byStage[st] && byStage[st][v] && byStage[st][v][cfg.name];
            if (!d) continue;
            tw += d.wins; tr += d.runs; td += d.sumDmg; tt += d.sumTaken; ts += d.sumSurv; dr += d.draws || 0;
        }
    }
    return { runs: tr, wins: tw, draws: dr, sumDmg: td, sumTaken: tt, sumSurv: ts };
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
    const thin = d.runs < STATS_TH.THIN_SAMPLE ? ' <span style="color:#ff9800;">(样本少)</span>' : '';
    return `<td class="elite-cell">
        <div class="cell-rate" style="color:${color}">胜率 ${rate}</div>
        <div class="cell-sub">${d.runs} 场${thin}</div>
        ${drawSub(d)}
        <div class="cell-sub">输出 ${avgDmg}</div>
        <div class="cell-sub">承伤 ${avgTaken}</div>
        <div class="cell-sub">存活 ${surv}</div></td>`;
}

// ============ V3.3.0：复制结果表（此前 112 有表却 0 导出，与 108 同类缺口） ============
function fallbackCopyElite(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
}
function attachCopyBtn(resultEl) {
    if (!resultEl) return;
    const old = resultEl.querySelector('.elite-copy');
    if (old) old.remove();
    if (!resultEl.querySelector('table')) return;
    const btn = document.createElement('button');
    btn.className = 'elite-copy';
    btn.textContent = '📋 复制这张表';
    btn.style.cssText = 'display:block;margin:8px 0 4px;background:#4fc3f7;color:#1a1a2e;border:0;border-radius:6px;padding:6px 12px;font-weight:bold;cursor:pointer;font-family:monospace;font-size:12px';
    btn.addEventListener('click', async () => {
        const md = [...resultEl.querySelectorAll('table')].map(tbl =>
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
    resultEl.appendChild(btn);
}
