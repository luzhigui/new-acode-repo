// tools/851-elite-bench.js —— 工具箱「⚔ 精英评级」页签（唯一入口，2026-11-19 上线）
//
// 目标（老板定）：所有精英（明教 + 六大派）放进同一把尺子，跑一次出一张单榜，谁强谁弱看数字。
//
// 机制：
//   ① 采样：复刻交叉赛的完全二部图——明教每个被测 × 六大派每个被测各打 N 场。
//      明教被测换进固定明教骨架（6 普通兵），六大派被测换进固定六大派骨架，双方同时换 → 一对一交手。
//      worker 复用 816 kind:'templateAB'（返回明教视角 wins/draws/runs）。
//   ② 拟合：Bradley-Terry（Elo 的数学原型）解最大似然，平局按半胜计。
//      二部图天然连通（每个明教单位都打全部六大派单位），同阵营内部强弱通过共同对手间接可比。
//   ③ 归一：全体精英几何平均 = 1 → 强度分 =(对「平均精英」期望胜率 − 50%)×100。
//      1 分 = 对平均对手胜率 +1 个百分点，全体平均 = 0，跨版本可比（名单稳定时）。
//   ④ 区间：对每对胜负做 200 次二项重采样（bootstrap），给 95% 区间。
//      区间重叠 = 分不出高低（该加样本），不重叠 = 差距是真的。
//   ⑤ 存档：localStorage 'elite_bench_v1'，重跑后自动算「与上次 Δ」，改数值立刻看出谁涨谁跌。
//
// 与已删三个旧工具的关系：模板战力（靶子饱和、不能排序）、交叉积分赛（积分受对手强弱污染）、
//   关卡精英评分（只反映七关场景）都被本榜取代；2026-11-19 用户拍板全删。
export const VER = 'tools/851-elite-bench.js V1.0.0';

import { runParallel } from './817-shared-worker-runner.js';
import { loadGameData, getGameData } from '../core/201-config-5v5-test.js';

const startBtn = document.getElementById('ebStartBtn');
const runsInput = document.getElementById('ebRuns');
const progressEl = document.getElementById('ebProgress');
const resultEl = document.getElementById('ebResult');
const copyBtn = document.getElementById('ebCopyBtn');
const candEl = document.getElementById('ebCands');

// 固定骨架（全普通兵，队友永远同一批；与 850 的 A-均衡 / 847 的 S-中 同源）
const MING_SKEL = [
    { name: '颜垣', role: '防战', pos: 1 },
    { name: '范遥', role: '战士', pos: 2 },
    { name: '吴劲草', role: '战士', pos: 3 },
    { name: '冷谦', role: '战士', pos: 4 },
    { name: '明教洪午', role: '远程', pos: 7 },
    { name: '明教岳山', role: '远程', pos: 8 }
];
const SECT_SKEL = [
    { name: '空闻', role: '防战', pos: 1 },
    { name: '空智', role: '战士', pos: 2 },
    { name: '清虚', role: '战士', pos: 3 },
    { name: '清风', role: '战士', pos: 4 },
    { name: '明月', role: '远程', pos: 7 },
    { name: '静玄', role: '远程', pos: 8 }
];

const STORE_KEY = 'elite_bench_v1';
const ROLES = ['防战', '战士', '远程', '飞行', '标枪'];
const front = r => r === '防战' || r === '战士';

let lastRows = [];
let lastText = '';

function roleOf(name) {
    const chars = getGameData()?.characters || {};
    const ch = chars[name] || chars[String(name).split('·')[0]];
    if (!ch) return null;
    if (ch.role) return ch.role;
    for (const r of ROLES) if ((ch.tags || []).includes(r)) return r;
    return null;
}

// 全部精英 = 有技能的单位（明教 + 六大派），按 M 值分档展示。
//   2026-11-19 三条口径（老板提的）：
//   ① 玄冥二老合并成一个评价单位（连体、同进同出）：采样时两人同时进六大派骨架（占 2 个实体）。
//   ② 小昭拆姐妹两档（主游戏 forceXiaoZhao 形态）：姐姐固定职业、妹妹职业随机。
//   ③ 无职业标签的具名精英（素问/说不得等 tags 里没有职业）也要进榜：
//      优先取关卡阵容里官方给过的职业（第3关变体 俞莲舟=防战 / 张松溪=远程），
//      查不到的主游戏本来就是随机四选一——榜里同样每场随机掷职业（randomRole），不按战士计。
function roleFromEncounters(name) {
    const enc = getGameData()?.encounters || {};
    const lists = Object.values(enc.enemySquads || {});
    for (const arr of Object.values(enc.squadVariants || {})) for (const v of arr) lists.push(v?.squad || []);
    for (const list of lists) {
        const hit = (list || []).find(it => it && it.name === name && it.role);
        if (hit) return hit.role;
    }
    return null;
}

function collectCands() {
    const out = [];
    const chars = getGameData()?.characters || {};
    for (const [n, c] of Object.entries(chars)) {
        if (c.camp !== '明教' && c.camp !== '六大派') continue;
        if (Object.keys(c.skills || {}).length === 0) continue;
        const role = c.role || ROLES.find(r => (c.tags || []).includes(r)) || null;
        if (n === '鹤笔翁') continue;
        if (n === '鹿杖客') {
            out.push({
                name: '玄冥二老', camp: c.camp, m: c.m || 0, role: '远程',
                members: [{ name: '鹿杖客', role: '远程' }, { name: '鹤笔翁', role: '飞行' }],
                note: '连体，两人同场'
            });
            continue;
        }
        if (n === '小昭') {
            out.push({ name: '小昭·姊', base: '小昭', camp: c.camp, m: c.m || 0, role: role || '远程', forceXiaoZhao: 'sister' });
            out.push({ name: '小昭·妹', base: '小昭', camp: c.camp, m: c.m || 0, role: role || '远程', forceXiaoZhao: 'brother', note: '职业随机' });
            continue;
        }
        const inferred = role || roleFromEncounters(n);
        out.push({
            name: n, camp: c.camp, m: c.m || 0,
            role: inferred || null,
            randomRole: !inferred,
            note: inferred ? '' : '职业随机（每场四选一）'
        });
    }
    return out.sort((a, b) => b.m - a.m || a.name.localeCompare(b.name, 'zh'));
}

// 同阵营同职业、无技能的普通兵（用于把骨架里与被测同名的位洗净）
const genericCache = new Map();
function pickGeneric(camp, role) {
    const key = camp + '|' + role;
    if (genericCache.has(key)) return genericCache.get(key);
    const chars = getGameData()?.characters || {};
    let best = null;
    for (const [n, c] of Object.entries(chars)) {
        if (c.camp !== camp) continue;
        if (Object.keys(c.skills || {}).length !== 0) continue;
        const r = c.role || ROLES.find(x => (c.tags || []).includes(x));
        if (r !== role) continue;
        const m = c.m || 0;
        if (!best || m < best.m) best = { name: n, m };
    }
    const v = best ? best.name : null;
    genericCache.set(key, v);
    return v;
}

// 骨架净化：若被测单位本就在骨架里，先把该位换成同职业普通兵，
//   否则「换入 = 阵容不变」会让该单位强度被拉向骨架基线（假 0 分）。
function sanitize(skel, camp, candName) {
    return skel.map(u => {
        if (u.name !== candName) return { ...u };
        const g = pickGeneric(camp, u.role);
        return g ? { name: g, role: u.role, pos: u.pos } : { ...u };
    });
}

// 一次换入多个成员（玄冥二老连体：鹿+鹤同时进骨架，各占一个实体位）
function composeMany(skel, camp, members) {
    let arr = skel.map(u => ({ ...u }));
    for (const mem of members) arr = sanitize(arr, camp, mem.name);
    const used = new Set();
    for (const mem of members) {
        let i = arr.findIndex(u => !used.has(u.pos) && u.role === mem.role);
        if (i < 0) i = arr.findIndex(u => !used.has(u.pos) && front(u.role) === front(mem.role));
        if (i < 0) i = arr.findIndex(u => !used.has(u.pos));
        if (i < 0) continue;
        used.add(arr[i].pos);
        arr[i] = { name: mem.name, role: mem.role, pos: arr[i].pos };
    }
    return arr;
}

// 换入被测：同职业优先，退到同站位类（前排/后排），再退末位
//   无职业单位（randomRole）：站位固定末位，职业留给 worker 每场随机掷
function compose(skel, camp, cand) {
    const arr = sanitize(skel, camp, cand.name);
    let i = cand.role ? arr.findIndex(u => u.role === cand.role) : -1;
    if (i < 0 && cand.role) i = arr.findIndex(u => front(u.role) === front(cand.role));
    if (i < 0) i = arr.length - 1;
    arr[i] = cand.randomRole
        ? { name: cand.name, role: null, randomRole: true, pos: arr[i].pos }
        : { name: cand.name, role: cand.role, pos: arr[i].pos };
    return arr;
}

function renderCands() {
    if (!candEl) return;
    const cands = collectCands();
    if (!cands.length) { candEl.innerHTML = '<span style="color:#888;font-size:12px;">没有匹配候选（带技能的精英）</span>'; return; }
    const tiers = [...new Set(cands.map(c => c.m))].sort((a, b) => b - a);
    candEl.innerHTML = tiers.map(m => {
        const list = cands.filter(c => c.m === m);
        return `<div class="eb-cand-group" data-m="${m}">`
            + `<span class="eb-tier">M${m}（${list.length}）</span>`
            + '<button type="button" class="eb-all" data-act="all">全选</button>'
            + '<button type="button" class="eb-all" data-act="none">全不选</button>'
            + list.map(c => `<label><input type="checkbox" class="eb-cand" value="${c.name}" checked>${c.name}`
                + (c.note ? `<span style="color:#666">（${c.note}）</span>` : '')
                + `<span style="color:#777">·${c.camp === '明教' ? '明' : '派'}</span></label>`).join('')
            + '</div>';
    }).join('');
    candEl.querySelectorAll('.eb-all').forEach(btn => btn.addEventListener('click', () => {
        const on = btn.dataset.act === 'all';
        btn.closest('.eb-cand-group').querySelectorAll('.eb-cand').forEach(cb => { cb.checked = on; });
    }));
}

// ============ Bradley-Terry 拟合 ============
// pairs: [{ i, j, w, n }]  i = 明教单位，j = 六大派单位，w = 明教胜 + 0.5×平局，n = 总场
// 返回 Map<name, s>，几何平均 = 1
function fitBT(pairs, ids, iters) {
    const s = new Map(ids.map(id => [id, 1]));
    for (let it = 0; it < iters; it++) {
        const num = new Map(ids.map(id => [id, 0]));
        const den = new Map(ids.map(id => [id, 0]));
        for (const p of pairs) {
            const si = s.get(p.i), sj = s.get(p.j);
            const d = si + sj;
            num.set(p.i, num.get(p.i) + p.w);
            num.set(p.j, num.get(p.j) + (p.n - p.w));
            den.set(p.i, den.get(p.i) + p.n / d);
            den.set(p.j, den.get(p.j) + p.n / d);
        }
        for (const id of ids) {
            const v = num.get(id) / den.get(id);
            s.set(id, Number.isFinite(v) && v > 0 ? v : 1e-9);
        }
        const g = Math.exp(ids.reduce((a, id) => a + Math.log(s.get(id)), 0) / ids.length);
        for (const id of ids) s.set(id, s.get(id) / g);
    }
    return s;
}

// 强度分 = (对平均对手期望胜率 − 50%) × 100，单位：胜率百分点
const toScore = si => (si / (si + 1) - 0.5) * 100;

// 二项重采样（正态近似，n 足够大）
function resample(w, n) {
    const p = w / n;
    const sd = Math.sqrt(Math.max(p * (1 - p), 1e-6) / n);
    const z = Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());
    return Math.min(n, Math.max(0, (p + z * sd) * n));
}

function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; }
}
function saveStore(rows, meta) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ ts: Date.now(), meta, rows })); } catch (e) {}
}

const fmt = v => (v >= 0 ? '+' : '') + v.toFixed(1);

async function run() {
    const chars = getGameData()?.characters || {};
    const picked = candEl ? [...candEl.querySelectorAll('.eb-cand:checked')].map(el => el.value) : [];
    const all = collectCands().filter(c => picked.includes(c.name));
    const ming = all.filter(c => c.camp === '明教');
    const six = all.filter(c => c.camp === '六大派');
    if (!ming.length || !six.length) { progressEl.textContent = '至少各选一个明教 / 六大派单位'; return; }

    const RUNS = Math.max(10, Math.min(300, parseInt(runsInput.value, 10) || 60));
    const jobs = [];
    for (const m of ming) for (const s of six) {
        jobs.push({
            key: m.name + '|' + s.name,
            m, s,
            // 六大派侧预先换好（worker 只认一个 cand，换的是 bUnits 明教侧）；
            //   玄冥二老走 composeMany：鹿+鹤同时进骨架（占 2 个实体位）
            aUnits: s.members ? composeMany(SECT_SKEL, '六大派', s.members) : compose(SECT_SKEL, '六大派', s),
            // 明教侧只净化同名片，换入交给 worker 的 cand（与 849 同口径）
            bUnits: sanitize(MING_SKEL, '明教', m.base || m.name),
            cand: { name: m.base || m.name, role: m.role },
            forceXiaoZhao: m.forceXiaoZhao || null,
            runs: RUNS
        });
    }
    progressEl.textContent = `准备 ${jobs.length} 对 × ${RUNS} 场 = ${jobs.length * RUNS} 场…`;
    startBtn.disabled = true;
    const t0 = performance.now();

    const acc = new Map();
    try {
        await runParallel({
            jobs,
            kind: 'templateAB',
            nextJobMsg: (job, id) => ({
                jobId: id, kind: 'templateAB',
                aUnits: job.aUnits, bUnits: job.bUnits,
                cand: job.cand,
                forceXiaoZhao: job.forceXiaoZhao,
                runs: job.runs, startIndex: 0
            }),
            onJobDone: (done, total, job, part) => {
                const cur = acc.get(job.key) || { wins: 0, draws: 0, runs: 0 };
                cur.wins += Number(part?.wins || 0);
                cur.draws += Number(part?.draws || 0);
                cur.runs += Number(part?.runs || 0);
                acc.set(job.key, cur);
                if (done % 10 === 0 || done === total) {
                    progressEl.textContent = `跑批 ${done}/${total} 对（${Math.round((performance.now() - t0) / 1000)}s）…`;
                }
            }
        });
    } catch (e) {
        progressEl.textContent = '跑批中断：' + (e?.message || e);
        startBtn.disabled = false;
        return;
    }

    // 平滑（Laplace 半分）防全胜/全负分离
    const pairs = [];
    for (const m of ming) for (const s of six) {
        const r = acc.get(m.name + '|' + s.name);
        if (!r || !r.runs) continue;
        pairs.push({
            i: m.name, j: s.name,
            n: r.runs + 1,
            w: r.wins + 0.5 * r.draws + 0.5
        });
    }
    const ids = all.map(c => c.name);
    const meta = new Map(all.map(c => [c.name, c]));

    const s0 = fitBT(pairs, ids, 300);
    const score = new Map(ids.map(id => [id, toScore(s0.get(id))]));

    // bootstrap 200 次
    const boots = new Map(ids.map(id => [id, []]));
    for (let b = 0; b < 200; b++) {
        const rs = pairs.map(p => ({ i: p.i, j: p.j, n: p.n, w: resample(p.w, p.n) }));
        const sb = fitBT(rs, ids, 120);
        for (const id of ids) boots.get(id).push(toScore(sb.get(id)));
    }
    const lo = new Map(), hi = new Map();
    for (const id of ids) {
        const arr = boots.get(id).sort((a, b) => a - b);
        lo.set(id, arr[Math.floor(arr.length * 0.025)]);
        hi.set(id, arr[Math.floor(arr.length * 0.975)]);
    }

    // 与上次存档对比
    const prev = loadStore();
    const prevMap = new Map((prev?.rows || []).map(r => [r.name, r.score]));

    const rows = all.map(c => {
        // 该单位参与的对战：明教单位 = 与每个六大派的对局；六大派同理
        let w = 0, d = 0, n = 0;
        if (c.camp === '明教') {
            for (const x of six) { const v = acc.get(c.name + '|' + x.name); if (v) { w += v.wins; d += v.draws; n += v.runs; } }
        } else {
            for (const x of ming) { const v = acc.get(x.name + '|' + c.name); if (v) { w += v.wins; d += v.draws; n += v.runs; } }
        }
        return {
            name: c.name, camp: c.camp, m: c.m, role: c.role,
            score: score.get(c.name),
            lo: lo.get(c.name), hi: hi.get(c.name),
            wins: w, draws: d, runs: n,
            prev: prevMap.has(c.name) ? prevMap.get(c.name) : null
        };
    }).sort((a, b) => b.score - a.score);

    saveStore(rows, { runs: RUNS, ming: ming.length, six: six.length, ms: Math.round(performance.now() - t0) });
    render(rows, { runs: RUNS, total: pairs.length * RUNS, ms: Math.round(performance.now() - t0) });
    startBtn.disabled = false;
}

function render(rows, meta) {
    lastRows = rows;
    const campTag = r => r.camp === '明教'
        ? '<span style="color:#ffd700">明</span>'
        : '<span style="color:#4fc3f7">派</span>';
    const delta = r => r.prev == null ? '—' : `<span style="color:${r.score >= r.prev ? '#4caf50' : '#f44336'}">${fmt(r.score - r.prev)}</span>`;
    const overlap = (a, b) => !(a.hi < b.lo || b.hi < a.lo);

    let html = `<p style="color:#888;font-size:12px;line-height:1.6;margin:0 0 10px">`
        + `强度分 =(对「平均精英」期望胜率 − 50%)×100，单位：胜率百分点，全体平均 = 0。<br>`
        + `样本：${rows.filter(r => r.camp === '明教').length} 明教 × ${rows.filter(r => r.camp === '六大派').length} 六大派，每对 ${meta.runs} 场，共 ${meta.total} 场，耗时 ${Math.round(meta.ms / 1000)}s。<br>`
        + `区间重叠 = 分不出高低（样本不够），不重叠 = 差距是真的。Δ = 与上次存档对比。</p>`;
    html += '<table class="elite-table"><thead><tr>'
        + '<th>#</th><th>单位</th><th>营</th><th>M</th><th>职业</th>'
        + '<th>强度分</th><th>95% 区间</th><th>Δ 上次</th><th>胜-平-负</th><th>场次</th>'
        + '</tr></thead><tbody>';
    rows.forEach((r, i) => {
        const bg = r.camp === '明教' ? 'rgba(255,215,0,.05)' : 'rgba(79,195,247,.05)';
        html += `<tr style="background:${bg}">`
            + `<td>${i + 1}</td><td><b>${r.name}</b></td><td>${campTag(r)}</td><td>${r.m || '—'}</td><td>${r.role || '随机'}</td>`
            + `<td style="color:${r.score >= 0 ? '#4caf50' : '#f44336'};font-weight:bold">${fmt(r.score)}</td>`
            + `<td style="color:#888">${fmt(r.lo)} ~ ${fmt(r.hi)}</td>`
            + `<td>${delta(r)}</td>`
            + `<td>${r.wins}-${r.draws}-${r.runs - r.wins - r.draws}</td>`
            + `<td>${r.runs}</td></tr>`;
    });
    html += '</tbody></table>';

    // 相邻单位区间是否可分，给一句结论
    const strong = rows[0], weak = rows[rows.length - 1];
    if (strong && weak) {
        const sep = overlap(strong, weak) ? '最强与最弱区间仍重叠，样本不足' : `最强（${strong.name} ${fmt(strong.score)}）与最弱（${weak.name} ${fmt(weak.score)}）差距显著`;
        html += `<p style="color:#aaa;font-size:12px;margin-top:10px">${sep}；极差 ${(strong.score - weak.score).toFixed(1)} 点。</p>`;
    }
    resultEl.innerHTML = html;

    const L = [['#', '单位', '阵营', 'M', '职业', '强度分', 'lo', 'hi', 'Δ上次', '胜', '平', '负', '场次'].join('\t')];
    rows.forEach((r, i) => L.push([i + 1, r.name, r.camp, r.m || '', r.role || '随机', r.score.toFixed(1), r.lo.toFixed(1), r.hi.toFixed(1),
        r.prev == null ? '' : (r.score - r.prev).toFixed(1), r.wins, r.draws, r.runs - r.wins - r.draws, r.runs].join('\t')));
    lastText = L.join('\n');
}

startBtn?.addEventListener('click', run);
copyBtn?.addEventListener('click', async () => {
    if (!lastText) return;
    try { await navigator.clipboard.writeText(lastText); copyBtn.textContent = '已复制'; }
    catch (e) { copyBtn.textContent = '复制失败'; }
    setTimeout(() => { copyBtn.textContent = '复制榜单'; }, 1500);
});

// 启动：载入游戏数据 → 渲染候选 + 上次存档
(async () => {
    if (!startBtn) return;
    try { await loadGameData(); } catch (e) { progressEl.textContent = '游戏数据加载失败：' + (e?.message || e); return; }
    renderCands();
    const prev = loadStore();
    if (prev?.rows?.length) {
        render(prev.rows, { runs: prev.meta?.runs || 0, total: prev.meta?.runs * prev.meta?.ming * prev.meta?.six || 0, ms: prev.meta?.ms || 0 });
        progressEl.textContent = `已载入上次榜单（${new Date(prev.ts).toLocaleString('zh-CN', { hour12: false })}）`;
    }
})();
