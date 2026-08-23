// tools/112-elite-eval.js - 光明顶5v5 明教精英战力评测（融合进 102 工具箱 tab）
// 由 tools/111-elite-power-eval.html 改造 | 跑张无忌/韦一笑/小昭姊/小昭妹 6关×N场
import { createRoundStepper } from '../core/11battle-round.js';
import { initBattleTeams } from '../modules/29battle-init.js';
import { eventBus } from '../infra/50-event-bus.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import { GlobalStore } from '../infra/54-global-store.js';
import '../modules/25elite-imperial.js';
import '../modules/26elite-sixsects.js';
import '../modules/27elite-mingjiao.js';

const configs = [
    { name: '张无忌', flag: 'isZhang', role: '远程', m: 115 },
    { name: '韦一笑', flag: 'isWei', role: '飞行', m: 107 },
    { name: '小昭·姊', flag: 'isXiaoZhaoSister', role: '远程', m: 107 },
    { name: '小昭·妹', flag: 'isXiaoZhaoBrother', role: '远程', m: 107 }
];

const startBtn = document.getElementById('eliteStartBtn');
const runsInput = document.getElementById('eliteRunsInput');
const progressEl = document.getElementById('eliteProgress');
const resultEl = document.getElementById('eliteResult');

startBtn.addEventListener('click', async () => {
    const stages = Array.from(document.querySelectorAll('.elite-stage-check:checked')).map(cb => parseInt(cb.value));
    const RUNS = parseInt(runsInput.value) || 20;
    if (stages.length === 0) { alert('请至少选择一个关卡'); return; }

    startBtn.disabled = true;
    progressEl.textContent = '开始评测...';
    resultEl.innerHTML = '<div class="elite-empty">运行中...</div>';

    const results = {};
    const totalCombos = configs.length * stages.length * RUNS;
    let globalDone = 0;
    let runCtx = {}; // 诊断：记录当前运行位置，异常时随堆栈输出

    try {
        for (const cfg of configs) {
            results[cfg.name] = {};
            let stageResults = {};

            for (const stage of stages) {
                let wins = 0, sumDmg = 0, sumTaken = 0, sumSurv = 0;
                let validRuns = 0;

                for (let run = 0; run < RUNS; run++) {
                    runCtx = { elite: cfg.name, stage, run: run + 1 };
                    eventBus.clearAll();
                    // 清残留的强制精英开关（index.html 按钮只写 localStorage、由游戏页消费删除；评测页同源共享，
                    // 不清会污染阵容生成，导致某精英局局变替身）
                    GlobalStore.set('forceZhang', null);
                    GlobalStore.set('forceWei', null);
                    GlobalStore.set('forceXiaoZhao', null);
                    localStorage.removeItem('_forceZhang');
                    localStorage.removeItem('_forceWei');
                    localStorage.removeItem('_forceXiaoZhao');
                    GlobalStore.set('currentBattleState', null);
                    GlobalStore.flushBattleEvents();

                    let UI = { allyTeam: [], enemyTeam: [], currentResult: null, round: 0, lastSnapshot: null };
                    let snapshot = { ally: [], enemy: [] };
                    // 无 DOM 初始化（doInitBattle 会写 labelEnemy/labelAlly，工具箱页无此节点）
                    // 种子必须带 run/stage 偏移：run 循环内无 await、执行极快，裸 Date.now() 会在同毫秒
                    // 内被多场共享 → 40 场生成同一套阵容，弱阵容时整关胜率塌成 0%（偶发波动主源）
                    const initRng = new SeededRNG(Date.now() + run * 7919 + stage * 131);
                    const { allyTeam, enemyTeam } = initBattleTeams(stage, initRng);
                    snapshot.ally = allyTeam.map(u => Object.freeze(u.clone()));
                    snapshot.enemy = enemyTeam.map(u => Object.freeze(u.clone()));
                    UI.allyTeam = allyTeam.map(u => u.clone());
                    UI.enemyTeam = enemyTeam.map(u => u.clone());
                    UI.currentResult = null;
                    UI.round = 0;
                    GlobalStore.set('battleHasZhang', allyTeam.some(u => u.isZhang));
                    window._lastBattleSeed = initRng.getState();
                    snapshot._rngSeed = initRng.getState();
                    let ally = UI.allyTeam;

                    let eu = ally.find(u => u[cfg.flag]);
                    if (!eu) {
                        const candidates = ally.filter(u =>
                            !u.isZhang && !u.isWei && !u.isXiaoZhaoSister && !u.isXiaoZhaoBrother
                        );
                        if (!candidates.length) continue;
                        // 精英标准站位（与 modules/29battle-init.js 一致：张无忌5/韦一笑6/小昭4）
                        const stdPos = cfg.name === '张无忌' ? 5 : cfg.name === '韦一笑' ? 6 : 4;
                        // 优先替换本就站在标准位上的普通兵（真实顶替）；否则任选普通兵
                        let victim = candidates.find(u => u.pos === stdPos) || candidates[0];
                        victim.name = cfg.name;
                        victim.role = cfg.role;
                        victim.m = cfg.m;
                        victim[cfg.flag] = true;
                        if (cfg.flag === 'isXiaoZhaoSister' || cfg.flag === 'isXiaoZhaoBrother') {
                            victim.initXiaoZhao();
                        } else {
                            victim.init(new SeededRNG(Date.now() + run * 31 + stage * 7));
                        }
                        victim.applyBonus();
                        victim._baseMaxHp = victim.maxHp;
                        victim._baseAtk = victim.atk;
                        victim._baseDef = victim.def;
                        victim.pos = stdPos; // 精英站自己的标准位
                        eu = victim;
                    }

                    let state = {
                        ally: ally.map(u => u.clone()),
                        enemy: (UI.enemyTeam || []).map(u => u.clone()),
                        round: 1,
                        activeBuffs: [],
                        allAllies: ally.map(u => u.clone()),
                        _rng: new SeededRNG(Date.now() + run * 7919 + stage * 131)
                    };

                    let finalWinner = null;
                    let finalAlly = null;
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
                            .map(b => ({...b, remaining: b.remaining - 1}))
                            .filter(b => b.remaining > 0);
                        state.round = r + 1;
                    }

                    if (!finalWinner) continue;
                    validRuns++;

                    if (finalWinner === '明教') wins++;
                    const euFinal = (finalAlly || []).find(u => u[cfg.flag]);
                    if (euFinal) {
                        sumDmg += euFinal.dmgDealt || 0;
                        sumTaken += euFinal.dmgTaken || 0;
                        if (euFinal.alive) sumSurv++;
                    }
                }

                globalDone += RUNS;
                stageResults[stage] = {
                    wins,
                    total: validRuns,
                    validRuns,
                    rate: validRuns > 0 ? (wins / validRuns * 100).toFixed(1) + '%' : 'N/A',
                    avgDmg: validRuns > 0 ? Math.floor(sumDmg / validRuns) : 0,
                    avgTaken: validRuns > 0 ? Math.floor(sumTaken / validRuns) : 0,
                    survRate: validRuns > 0 ? (sumSurv / validRuns * 100).toFixed(1) + '%' : 'N/A'
                };
                progressEl.textContent = `${cfg.name} 第${stage}关 完成 (${globalDone}/${totalCombos})`;
                await new Promise(res => setTimeout(res, 20));
            }

            results[cfg.name] = stageResults;
        }

        renderResults(results, stages, RUNS);
        progressEl.textContent = '✅ 全部完成';
    } catch (e) {
        console.error('[elite-eval] 评测异常 @', JSON.stringify(runCtx), '\n完整堆栈：', e);
        resultEl.innerHTML = `<div class="elite-empty">出错：${e.message}<br>位置：${runCtx.elite || '?'} 第${runCtx.stage || '?'}关 第${runCtx.run || '?'}场<br>完整堆栈已输出到 F12 控制台</div>`;
        progressEl.textContent = '❌ 评测异常';
    } finally {
        startBtn.disabled = false;
    }
});

function renderResults(results, stages, runs) {
    // 转置表：行 = 关卡，列 = 精英；每格堆叠该关 胜率/输出/承伤/存活，胜率按高低着色
    let html = '<table class="elite-table"><tr><th>关卡</th>';
    for (const cfg of configs) html += `<th class="elite-th">${cfg.name}</th>`;
    html += '</tr>';

    for (const st of stages) {
        html += `<tr><td class="elite-stage">第${st}关</td>`;
        for (const cfg of configs) {
            const d = results[cfg.name][st];
            if (d && d.validRuns > 0) {
                html += cellHtml(d.rate, d.avgDmg, d.avgTaken, d.survRate);
            } else {
                html += '<td class="elite-cell">N/A</td>';
            }
        }
        html += '</tr>';
    }

    // 底部总评行：各精英跨关卡汇总
    html += '<tr><td class="elite-stage">总评</td>';
    for (const cfg of configs) {
        const sd = results[cfg.name];
        let tw = 0, tr = 0, totalDmg = 0, totalTaken = 0, totalSurv = 0;
        for (const st of stages) {
            const d = sd[st];
            if (d && d.validRuns > 0) {
                tw += d.wins; tr += d.total;
                totalDmg += d.avgDmg * d.validRuns;
                totalTaken += d.avgTaken * d.validRuns;
                totalSurv += (parseFloat(d.survRate) / 100) * d.validRuns;
            }
        }
        if (tr > 0) {
            html += cellHtml((tw / tr * 100).toFixed(1) + '%', Math.floor(totalDmg / tr), Math.floor(totalTaken / tr), (totalSurv / tr * 100).toFixed(1) + '%');
        } else {
            html += '<td class="elite-cell">N/A</td>';
        }
    }
    html += '</tr></table>';
    resultEl.innerHTML = html;
}

// 单个精英单元格：堆叠 胜率/输出/承伤/存活，胜率按高低着色
function cellHtml(rate, dmg, taken, surv) {
    const r = parseFloat(rate);
    let color = '#888';
    if (!isNaN(r)) color = r >= 50 ? '#4caf50' : r >= 25 ? '#ffd700' : '#ff5252';
    return `<td class="elite-cell">
        <div class="cell-rate" style="color:${color}">胜率 ${rate}</div>
        <div class="cell-sub">输出 ${dmg}</div>
        <div class="cell-sub">承伤 ${taken}</div>
        <div class="cell-sub">存活 ${surv}</div></td>`;
}
