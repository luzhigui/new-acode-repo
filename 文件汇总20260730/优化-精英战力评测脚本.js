// 精英战力评测 — 后台版 V5（多回合循环，直到战斗结束）
// 用法：在浏览器控制台粘贴执行，自动跑 6 关 × 20 场，输出各精英带队胜率/输出/承伤/存活率

(async function() {
    const { createRoundStepper } = await import('./core/48battle-round.js');
    const { doInitBattle } = await import('./ui/41main-battle.js');

    const configs = [
        { name: '张无忌', flag: 'isZhang', role: '远程', m: 115 },
        { name: '韦一笑', flag: 'isWei', role: '飞行', m: 107 },
        { name: '小昭·姊', flag: 'isXiaoZhaoSister', role: '远程', m: 107 },
        { name: '小昭·妹', flag: 'isXiaoZhaoBrother', role: '远程', m: 107 }
    ];

    const RUNS = 20;
    const results = {};

    for (const cfg of configs) {
        results[cfg.name] = {};
        const totalBattles = 6 * RUNS;
        let completed = 0;

        for (let stage = 1; stage <= 6; stage++) {
            let wins = 0, sumDmg = 0, sumTaken = 0, sumSurv = 0;
            let validRuns = 0;

            while (validRuns < RUNS) {
                // 1. 生成阵容
                let UI = { allyTeam: [], enemyTeam: [], currentResult: null, round: 0 };
                let snapshot = { ally: [], enemy: [] };
                doInitBattle(stage, UI, snapshot, [], -1, null);

                // 2. 确保精英在阵容中
                let ally = UI.allyTeam;
                let eu = ally.find(u => u[cfg.flag]);
                if (!eu) {
                    const victim = ally.find(u =>
                        !u.isZhang && !u.isWei && !u.isXiaoZhaoSister && !u.isXiaoZhaoBrother
                    );
                    if (!victim) continue;
                    victim.name = cfg.name;
                    victim.role = cfg.role;
                    victim.m = cfg.m;
                    victim[cfg.flag] = true;
                    victim.init();
                    victim.applyBonus();
                    eu = victim;
                }

                // 3. 多回合战斗循环
                let state = {
                    ally: ally.map(u => u.clone()),
                    enemy: (UI.enemyTeam || []).map(u => u.clone()),
                    round: 1,
                    activeBuffs: []
                };
                let finalWinner = null;
                let finalAlly = null;

                while (!finalWinner && state.round <= 35) {
                    const stepper = createRoundStepper(state);
                    let lastStep = null;
                    for await (const step of stepper) {
                        lastStep = step;
                    }
                    if (!lastStep) break;

                    if (lastStep.winner) {
                        finalWinner = lastStep.winner;
                        finalAlly = lastStep.ally;
                    } else {
                        // 准备下一回合
                        state.ally = lastStep.ally;
                        state.enemy = lastStep.enemy;
                        state.activeBuffs = (lastStep.ally._activeBuffs || []).filter(b => b.remaining > 0);
                        state.round++;
                    }
                }

                if (!finalWinner) continue;

                // 4. 统计
                if (finalWinner === '明教') wins++;
                const euFinal = (finalAlly || []).find(u => u[cfg.flag]);
                if (euFinal) {
                    sumDmg += euFinal.dmgDealt || 0;
                    sumTaken += euFinal.dmgTaken || 0;
                    if (euFinal.alive) sumSurv++;
                }
                validRuns++;
                completed++;
            }

            results[cfg.name][stage] = {
                wins,
                total: RUNS,
                rate: (wins / RUNS * 100).toFixed(1) + '%',
                avgDmg: Math.floor(sumDmg / RUNS),
                avgTaken: Math.floor(sumTaken / RUNS),
                survRate: (sumSurv / RUNS * 100).toFixed(1) + '%'
            };
            console.log(`${cfg.name} 第${stage}关 完成 (${completed}/${totalBattles})`);
        }
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
