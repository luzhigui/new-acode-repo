// tests/36runtime-sampler.js - 光明顶5v5 运行时采样器
// V4.0.0 | 2026-06-29 09:29
export const VER = 'tests/36runtime-sampler.js V4.0.0';

import { createHealthRules } from './29health-rules.js';
import { generateSnapshot } from '../tools/27auto-battle-utils.js';
import { runBattle } from '../core/07battle-engine-5v5-test.js';

export async function runRuntimeSample(ctx, maxRounds = 2) {
    const stage = ctx.currentStage || 1;
    const snap = generateSnapshot(stage);

    const activeBuffs = ctx.activeBuffs || [];
    snap.ally._activeBuffs = activeBuffs.filter(b => b.target === 'ally' || !b.target);
    snap.enemy._activeBuffs = activeBuffs.filter(b => b.target === 'enemy');

    let battleResult;
    try {
        battleResult = runBattle(snap, activeBuffs);
    } catch (e) {
        return {
            passed: false,
            failures: [{ name: '战斗引擎崩溃', fix: e.message }],
            summary: '战斗引擎运行异常'
        };
    }

    const fakeCtx = {
        UI: {
            allyTeam: battleResult.ally || snap.ally,
            enemyTeam: battleResult.enemy || snap.enemy,
            currentResult: battleResult,
            round: battleResult.rounds || 0
        },
        currentStage: stage,
        activeBuffs: activeBuffs,
        currentDoubleStrikeUid: null
    };

    const allRules = createHealthRules(window, document);
    const runtimeGroups = ['❤️ 血条与属性', '🔗 数据', '⚙️ 引擎', '✨ Buff 系统'];
    const rules = allRules.filter(r => runtimeGroups.includes(r.group));

    const failures = [];
    for (const rule of rules) {
        try {
            const originalGetCtx = window._getPlayerContext;
            window._getPlayerContext = () => fakeCtx;
            const result = await rule.test();
            window._getPlayerContext = originalGetCtx;
            if (result === false) {
                failures.push({
                    name: rule.name,
                    group: rule.group,
                    fix: rule.fix
                });
            }
        } catch (e) {
            failures.push({
                name: rule.name,
                group: rule.group,
                error: e.message
            });
        }
    }

    return {
        passed: failures.length === 0,
        failures,
        summary: `采样完成 (${battleResult.rounds} 回合)，检测 ${rules.length} 条规则`
    };
}