// tools/115-lineup-search.js - 光明顶5v5 阵容搜索器（融合进 102 工具箱 tab）
// V1.0.0 | 按条件批量采样 initBattleTeams，统计精英出场组合/固定站位/普通兵出现频率与站位分布
import { initBattleTeams } from '../modules/29battle-init.js';
import { eventBus } from '../infra/50-event-bus.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import { GlobalStore } from '../infra/54-global-store.js';
import '../modules/25elite-imperial.js';
import '../modules/26elite-sixsects.js';
import '../modules/27elite-mingjiao.js';

const startBtn = document.getElementById('lsStartBtn');
const runsInput = document.getElementById('lsRunsInput');
const stageSelect = document.getElementById('lsStageSelect');
const forceZhangCb = document.getElementById('lsForceZhang');
const forceWeiCb = document.getElementById('lsForceWei');
const progressEl = document.getElementById('lsProgress');
const resultEl = document.getElementById('lsResult');

startBtn.addEventListener('click', async () => {
    const RUNS = parseInt(runsInput.value) || 200;
    const stage = parseInt(stageSelect.value) || 1;
    const fz = forceZhangCb.checked;
    const fw = forceWeiCb.checked;

    startBtn.disabled = true;
    progressEl.textContent = '开始采样...';
    resultEl.innerHTML = '<div class="elite-empty">运行中...</div>';

    const stats = {
        eliteCount: { 0: 0, 1: 0, 2: 0, 3: 0 },
        combos: {},      // '张'/'韦'/'昭姊'/'昭妹'/'张+韦'... -> 次数
        elite: {},       // 精英名 -> { count, stdOk, stdPos }
        normals: {}      // 普通兵名 -> { count, pos: {1:n,...} }
    };

    try {
        for (let run = 0; run < RUNS; run++) {
            eventBus.clearAll();
            // 强制精英开关只在本次勾选时生效（GlobalStore 与 index 同源共享，先清残留再按需设置）
            GlobalStore.set('forceZhang', fz ? true : null);
            GlobalStore.set('forceWei', fw ? true : null);
            GlobalStore.set('forceXiaoZhao', null);
            localStorage.removeItem('_forceZhang');
            localStorage.removeItem('_forceWei');
            localStorage.removeItem('_forceXiaoZhao');
            GlobalStore.set('currentBattleState', null);
            GlobalStore.flushBattleEvents();
            // 状态已并入 unit.state，随对局对象 GC，无需清理（18-elite-state 已废弃）

            const rng = new SeededRNG(Date.now() + run * 7919 + stage * 131);
            const { allyTeam } = initBattleTeams(stage, rng);

            const elites = allyTeam.filter(u => u.isZhang || u.isWei || u.isXiaoZhaoSister || u.isXiaoZhaoBrother);
            stats.eliteCount[elites.length]++;
            const combo = elites.map(e => e.isZhang ? '张' : e.isWei ? '韦' : (e.isXiaoZhaoSister ? '昭姊' : '昭妹'))
                .sort().join('+') || '无';
            stats.combos[combo] = (stats.combos[combo] || 0) + 1;

            for (const e of elites) {
                const tag = e.isZhang ? '张无忌' : e.isWei ? '韦一笑' : e.name; // 小昭·姊/小昭·妹
                const d = stats.elite[tag] || (stats.elite[tag] = {
                    count: 0, stdOk: 0, stdPos: e.isZhang ? 5 : e.isWei ? 6 : 4
                });
                d.count++;
                if (e.pos === d.stdPos) d.stdOk++;
            }

            for (const u of allyTeam) {
                if (u.isZhang || u.isWei || u.isXiaoZhaoSister || u.isXiaoZhaoBrother) continue;
                const d = stats.normals[u.name] || (stats.normals[u.name] = { count: 0, pos: {} });
                d.count++;
                d.pos[u.pos] = (d.pos[u.pos] || 0) + 1;
            }

            if (run % 20 === 0 || run === RUNS - 1) {
                progressEl.textContent = `采样中 ${run + 1}/${RUNS}`;
                await new Promise(res => setTimeout(res, 5));
            }
        }
        renderResult(stats, RUNS, stage, fz, fw);
        progressEl.textContent = '✅ 采样完成';
    } catch (e) {
        resultEl.innerHTML = `<div class="elite-empty">出错：${e.message}</div>`;
        progressEl.textContent = '❌ 采样异常';
    } finally {
        startBtn.disabled = false;
    }
});

function renderResult(stats, runs, stage, fz, fw) {
    const pct = n => (n / runs * 100).toFixed(1) + '%';
    const flag = `${fz ? ' · 强制张无忌' : ''}${fw ? ' · 强制韦一笑' : ''}`;

    let html = `<div class="hex-log-verdict">采样 ${runs} 场 · 第${stage}关${flag}</div>`;

    // 精英数量分布
    html += `<h3 style="color:#ffd700;margin:12px 0 6px;">精英数量分布（理论：0个20% / 1个60% / 2个15% / 3个5%）</h3>
    <table class="elite-table"><tr><th>0 个</th><th>1 个</th><th>2 个</th><th>3 个</th></tr><tr>
        <td>${stats.eliteCount[0]}（${pct(stats.eliteCount[0])}）</td>
        <td>${stats.eliteCount[1]}（${pct(stats.eliteCount[1])}）</td>
        <td>${stats.eliteCount[2]}（${pct(stats.eliteCount[2])}）</td>
        <td>${stats.eliteCount[3]}（${pct(stats.eliteCount[3])}）</td>
    </tr></table>`;

    // 组合频率
    const combos = Object.entries(stats.combos).sort((a, b) => b[1] - a[1]);
    html += `<h3 style="color:#ffd700;margin:12px 0 6px;">精英出场组合</h3>
    <table class="elite-table"><tr><th>组合</th><th>次数</th><th>占比</th></tr>`;
    for (const [combo, n] of combos) {
        html += `<tr><td>${combo || '无精英'}</td><td>${n}</td><td>${pct(n)}</td></tr>`;
    }
    html += '</table>';

    // 精英出场与固定站位验证
    const elites = Object.entries(stats.elite).sort((a, b) => b[1].count - a[1].count);
    html += `<h3 style="color:#ffd700;margin:12px 0 6px;">精英出场与固定站位</h3>
    <table class="elite-table"><tr><th>精英</th><th>出场</th><th>出场率</th><th>标准位正确</th></tr>`;
    for (const [name, d] of elites) {
        const okRate = d.count > 0 ? (d.stdOk / d.count * 100).toFixed(0) + '%' : '-';
        const color = d.stdOk === d.count ? '#4caf50' : '#ffd700';
        html += `<tr><td class="elite-stage">${name}</td><td>${d.count}</td><td>${pct(d.count)}</td>
            <td style="color:${color};font-weight:bold;">${d.stdOk}/${d.count}（P${d.stdPos} · ${okRate}）</td></tr>`;
    }
    html += '</table>';

    // 明教普通兵频率与站位分布
    const normals = Object.entries(stats.normals).sort((a, b) => b[1].count - a[1].count);
    html += `<h3 style="color:#ffd700;margin:12px 0 6px;">明教普通兵出现频率与站位分布（P1–P9）</h3>
    <table class="elite-table"><tr><th>单位</th><th>出场</th><th>占比</th><th>站位分布</th></tr>`;
    for (const [name, d] of normals) {
        const posTxt = Object.entries(d.pos).sort((a, b) => a[0] - b[0])
            .map(([p, c]) => `P${p}:${c}（${pct(c)}）`).join('  ');
        html += `<tr><td class="elite-stage">${name}</td><td>${d.count}</td><td>${pct(d.count)}</td>
            <td style="text-align:left;font-size:11px;color:#bbb;">${posTxt}</td></tr>`;
    }
    html += '</table>';
    resultEl.innerHTML = html;
}
