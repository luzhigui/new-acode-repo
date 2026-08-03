// 精英战力评测 — 控制台版
// 用法：浏览器控制台粘贴执行，自动跑指定关卡×20场

(async function() {
    const { createRoundStepper } = await import('./core/48battle-round.js');
    const { doInitBattle } = await import('./ui/41main-battle.js');
    const { eventBus } = await import('./core/00-event-bus.js');

    const configs = [
        { name: '张无忌', flag: 'isZhang', role: '远程', m: 115 },
        { name: '韦一笑', flag: 'isWei', role: '飞行', m: 107 },
        { name: '小昭·姊', flag: 'isXiaoZhaoSister', role: '远程', m: 107 },
        { name: '小昭·妹', flag: 'isXiaoZhaoBrother', role: '远程', m: 107 }
    ];

    const STAGES = [1, 2, 3, 4, 5, 6];
    const RUNS = 20;
    const results = {};
    const totalCombos = configs.length * STAGES.length * RUNS;
    let globalDone = 0;

    for (const cfg of configs) {
        results[cfg.name] = {};
        let stageResults = {};

        for (const stage of STAGES) {
            let wins = 0, sumDmg = 0, sumTaken = 0, sumSurv = 0;
            let validRuns = 0;

            for (let run = 0; run < RUNS; run++) {
                // 重置事件总线
                eventBus.clearAll();

                // 1. 生成阵容
                let UI = { allyTeam: [], enemyTeam: [], currentResult: null, round: 0, lastSnapshot: null };
                let snapshot = { ally: [], enemy: [] };
                doInitBattle(stage, UI, snapshot, [], -1, null);
                let ally = UI.allyTeam;

                // 2. 确保精英在阵容中
                let eu = ally.find(u => u[cfg.flag]);
                if (!eu) {
                    const victim = ally.find(u =>
                        !u.isZhang && !u.isWei && !u.isXiaoZhaoSister && !u.isXiaoZhaoBrother
                    );
                    if (!victim) continue; // 无可用替换目标
                    victim.name = cfg.name;
                    victim.role = cfg.role;
                    victim.m = cfg.m;
                    victim[cfg.flag] = true;
                    // 小昭特殊：区分姐/妹时初始化小昭属性
                    if (cfg.flag === 'isXiaoZhaoSister' || cfg.flag === 'isXiaoZhaoBrother') {
                        victim.initXiaoZhao();
                    } else {
                        victim.init();
                    }
                    victim.applyBonus();
                    victim._baseMaxHp = victim.maxHp;
                    victim._baseAtk = victim.atk;
                    victim._baseDef = victim.def;
                    eu = victim;
                }

                // 3. 初始化战斗状态
                let state = {
                    ally: ally.map(u => u.clone()),
                    enemy: (UI.enemyTeam || []).map(u => u.clone()),
                    round: 1,
                    activeBuffs: [],
                    allAllies: ally.map(u => u.clone())
                };

                // 4. 多回合循环
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

                    // 更新下一回合状态
                    state.ally = lastStep.ally;
                    state.enemy = lastStep.enemy;
                    state.activeBuffs = (lastStep.ally._activeBuffs || [])
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
            console.log(`${cfg.name} 第${stage}关 完成 (${globalDone}/${totalCombos})`);
        }

        // 汇总
        let tw = 0, tr = 0;
        console.log(`\n--- ${cfg.name} ---`);
        for (const [st, d] of Object.entries(stageResults)) {
            console.log(`  第${st}关: 胜${d.wins}/${d.total}(${d.rate}) | 均输出${d.avgDmg} 承伤${d.avgTaken} 存活${d.survRate} | 有效场次${d.validRuns}`);
            tw += d.wins;
            tr += d.total;
        }
        console.log(`  总胜率: ${tr > 0 ? (tw / tr * 100).toFixed(1) : 'N/A'}% (${tw}/${tr})`);
        results[cfg.name] = stageResults;
    }

    console.log('\n========== 精英战力评测 ==========');
    for (const [name, sd] of Object.entries(results)) {
        let tw = 0, tr = 0;
        console.log(`\n--- ${name} ---`);
        for (const [st, d] of Object.entries(sd)) {
            console.log(`  第${st}关: ${d.rate} | 均输出${d.avgDmg} 承伤${d.avgTaken} 存活${d.survRate}`);
            tw += d.wins;
            tr += d.total;
        }
        console.log(`  总胜率: ${(tw / tr * 100).toFixed(1)}% (${tw}/${tr})`);
    }
    console.log('=====================================');
})();