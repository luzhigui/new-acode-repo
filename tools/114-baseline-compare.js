// tools/114-baseline-compare.js - 光明顶5v5 平衡基线对比（融合进 102 工具箱 tab）
// V1.0.0 | 同种子生成同一套阵容，A/B 两组精英配置各跑一遍；逐关对照 胜率/输出/承伤/存活 差异
import { createRoundStepper } from '../core/11battle-round.js';
import { initBattleTeams } from '../modules/29battle-init.js';
import { eventBus } from '../infra/50-event-bus.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import { GlobalStore } from '../infra/54-global-store.js';
import '../modules/25elite-imperial.js';
import '../modules/26elite-sixsects.js';
import '../modules/27elite-mingjiao.js';

// 角色配置表：flag / 标准位 / 角色
const ROLE_CFG = {
    '张无忌': { flag: 'isZhang', role: '远程', stdPos: 5 },
    '韦一笑': { flag: 'isWei', role: '飞行', stdPos: 6 },
    '小昭·姊': { flag: 'isXiaoZhaoSister', role: '远程', stdPos: 4 },
    '小昭·妹': { flag: 'isXiaoZhaoBrother', role: '远程', stdPos: 4 }
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
    const totalRuns = stages.length * RUNS;
    let globalDone = 0;

    try {
        for (const stage of stages) {
            let vA = 0, wA = 0, dA = 0, tkA = 0, sA = 0;
            let vB = 0, wB = 0, dB = 0, tkB = 0, sB = 0;
            for (let run = 0; run < RUNS; run++) {
                eventBus.clearAll();
                // 清残留的强制精英开关（index.html 与评测页同源共享，不清会污染阵容生成）
                GlobalStore.set('forceZhang', null);
                GlobalStore.set('forceWei', null);
                GlobalStore.set('forceXiaoZhao', null);
                localStorage.removeItem('_forceZhang');
                localStorage.removeItem('_forceWei');
                localStorage.removeItem('_forceXiaoZhao');
                GlobalStore.set('currentBattleState', null);
                GlobalStore.flushBattleEvents();

                const seedBase = Date.now() + run * 7919 + stage * 131;
                const initRng = new SeededRNG(seedBase);
                const { allyTeam, enemyTeam } = initBattleTeams(stage, initRng);

                // 同一阵容克隆两份，分别套用 A/B 配置（替换种子相同 → 差异仅来自配置）
                const teamA = allyTeam.map(u => u.clone());
                const teamB = allyTeam.map(u => u.clone());
                const euA = applyConfig(teamA, cfgA, seedBase + 31);
                const euB = applyConfig(teamB, cfgB, seedBase + 31);
                if (!euA || !euB) continue;

                GlobalStore.set('battleHasZhang', teamA.some(u => u.isZhang));
                const resA = await runBattle(teamA, enemyTeam, seedBase);
                GlobalStore.set('battleHasZhang', teamB.some(u => u.isZhang));
                const resB = await runBattle(teamB, enemyTeam, seedBase);

                if (resA.winner) {
                    vA++; if (resA.winner === '明教') wA++;
                    const e = (resA.ally || []).find(u => u[cfgA.flag]);
                    if (e) { dA += e.dmgDealt || 0; tkA += e.dmgTaken || 0; if (e.alive) sA++; }
                }
                if (resB.winner) {
                    vB++; if (resB.winner === '明教') wB++;
                    const e = (resB.ally || []).find(u => u[cfgB.flag]);
                    if (e) { dB += e.dmgDealt || 0; tkB += e.dmgTaken || 0; if (e.alive) sB++; }
                }
            }
            rows[stage] = { vA, wA, dA, tkA, sA, vB, wB, dB, tkB, sB };
            globalDone += RUNS;
            progressEl.textContent = `第${stage}关 完成 (${globalDone}/${totalRuns})`;
            await new Promise(res => setTimeout(res, 20));
        }
        renderResult(rows, stages, cfgA, cfgB);
        progressEl.textContent = '✅ 全部完成';
    } catch (e) {
        resultEl.innerHTML = `<div class="elite-empty">出错：${e.message}</div>`;
        progressEl.textContent = '❌ 对比异常';
    } finally {
        startBtn.disabled = false;
    }
});

// 套用精英配置到阵容的「槽位」：优先原生同 flag 精英，否则替换一名普通兵到标准位
function applyConfig(team, cfg, seed) {
    let eu = team.find(u => u[cfg.flag]);
    if (!eu) {
        const candidates = team.filter(u =>
            !u.isZhang && !u.isWei && !u.isXiaoZhaoSister && !u.isXiaoZhaoBrother
        );
        if (!candidates.length) return null;
        eu = candidates.find(u => u.pos === cfg.stdPos) || candidates[0];
    }
    eu.name = cfg.name;
    eu.role = cfg.role;
    eu.m = cfg.m;
    // 清掉其余精英标志，确保槽位唯一
    eu.isZhang = eu.isWei = eu.isXiaoZhaoSister = eu.isXiaoZhaoBrother = false;
    eu[cfg.flag] = true;
    if (cfg.flag === 'isXiaoZhaoSister' || cfg.flag === 'isXiaoZhaoBrother') {
        eu.initXiaoZhao();
    } else {
        eu.init(new SeededRNG(seed));
    }
    eu.applyBonus();
    eu._baseMaxHp = eu.maxHp;
    eu._baseAtk = eu.atk;
    eu._baseDef = eu.def;
    eu.pos = cfg.stdPos;
    return eu;
}

// 跑一场完整战斗（≤35 回合），返回 { winner, ally }
async function runBattle(team, enemyTemplate, seed) {
    const ally = team.map(u => u.clone());
    const enemy = enemyTemplate.map(u => u.clone());
    let state = {
        ally: ally.map(u => u.clone()),
        enemy: enemy.map(u => u.clone()),
        round: 1,
        activeBuffs: [],
        allAllies: ally.map(u => u.clone()),
        _rng: new SeededRNG(seed)
    };
    let finalWinner = null, finalAlly = null;
    for (let r = 1; r <= 35; r++) {
        const stepper = createRoundStepper(state);
        let lastStep = null;
        for await (const step of stepper) {
            lastStep = step;
            if (step.winner) break;
        }
        if (!lastStep) break;
        if (lastStep.winner) {
            finalWinner = lastStep.winner;
            finalAlly = lastStep.ally;
            break;
        }
        state.ally = lastStep.ally;
        state.enemy = lastStep.enemy;
        if (lastStep.ally._allAllies || state.allAllies) {
            const baseAllies = lastStep.ally._allAllies || state.allAllies;
            state.allAllies = baseAllies.map(full => {
                const cur = lastStep.ally.find(a => a.uid === full.uid);
                if (cur) {
                    full.hp = cur.hp; full.maxHp = cur.maxHp; full.alive = cur.alive;
                    full.atk = cur.atk; full.def = cur.def;
                    if (cur.state._isDead !== undefined) full.state._isDead = cur.state._isDead;
                }
                return full;
            });
        }
        state.activeBuffs = (lastStep.ally._activeBuffs || state.activeBuffs || [])
            .filter(b => b && b.remaining > 0)
            .map(b => ({ ...b, remaining: b.remaining - 1 }))
            .filter(b => b.remaining > 0);
        state.round = r + 1;
    }
    return { winner: finalWinner, ally: finalAlly };
}

// 双列对照表：A/B 胜率并排，胜差按方向着色；末行总评
function renderResult(rows, stages, cfgA, cfgB) {
    let twA = 0, tvA = 0, tdA = 0, ttA = 0, tsA = 0;
    let twB = 0, tvB = 0, tdB = 0, ttB = 0, tsB = 0;

    let html = `<table class="elite-table"><tr>
        <th>关卡</th>
        <th>${cfgA.name} 胜率</th><th>${cfgB.name} 胜率</th><th>胜差(B−A)</th>
        <th>${cfgA.name} 输出</th><th>${cfgB.name} 输出</th>
        <th>${cfgA.name} 承伤</th><th>${cfgB.name} 承伤</th>
        <th>${cfgA.name} 存活</th><th>${cfgB.name} 存活</th>
    </tr>`;

    for (const st of stages) {
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