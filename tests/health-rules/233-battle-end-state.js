// tests/health-rules/233-battle-end-state.js
// 体检规则：胜负终局形态一致性（一方全灭即结束 / 平局口径 / 结束后不再跑回合结算）
//
// 判据来源：core/210 —— 每次结算后检查双方存活，任一方 0 活人即置 winner 并**立即 return**，
//   不再跑后面的收尾；但「回合最后一手才全灭」时会走 finalizeRoundEnd，在那里判胜并落最后一条 roundEnd。
//   所以终局形态只有三种合法解：① 一方 0 活人；② MAX_ROUND 平局；③「不争」noContend 提前宣告。
//   156 场实测：三种之外的形态 0 例（同归于尽 0 例、双方都有活人却提前停战 0 例）。
//
// 判据（全部 0 误报，才升硬判）：
//   ① 双方都有活人收场 ⇒ 只能是「打满 MAX_ROUND 且最后一条 fact 是 round=MAX_ROUND 的 roundEnd」或 noContend；
//      否则 = 战斗在没人全灭的情况下停了（胜负没判出来）；
//   ② 双方都是 0 活人（同归于尽）⇒ 红：引擎判胜只认「一方 0 活」（teamAliveOrPending），没有同归于尽的出口。
// ★ 不再判「最后一回合不得有 roundEnd」：实测 seed=1/stage=1 等场次是回合最后一手才全灭，
//   finalizeRoundEnd 合法地判胜并落 roundEnd（core/210 L677-694），硬判必误报。
export const VER = 'tests/health-rules/233-battle-end-state.js V1.0.0';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';
import { CONFIG } from '../../core/201-config-5v5-test.js';

const MAX_ROUND = () => (typeof CONFIG.MAX_ROUND === 'number' ? CONFIG.MAX_ROUND : 35);

function aliveCount(units) {
    let n = 0;
    for (const u of units || []) if (u && u.alive) n++;
    return n;
}

export const rule233 = {
    group: '行动与目标回归',
    name: '胜负终局形态一致性(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = facts || [];
        if (!fs.length) return 'skip';
        if (!Array.isArray(afterA) || !Array.isArray(afterE)) return 'skip';

        const aliveA = aliveCount(afterA), aliveE = aliveCount(afterE);
        if (aliveA + aliveE === 0 && (!afterA.length && !afterE.length)) return 'skip';

        // 回合结构与最后一条 fact
        let lastRound = 0, lastRoundFrom = -1;
        let hasNoContend = false;
        for (let i = 0; i < fs.length; i++) {
            const f = fs[i];
            if (!f || !f.factType) continue;
            if (f.factType === FACT_TYPES.ROUND_START) {
                lastRound = (f.data && typeof f.data.round === 'number') ? f.data.round : lastRound + 1;
                lastRoundFrom = i;
            } else if (f.factType === FACT_TYPES.NO_CONTEND) {
                hasNoContend = true;
            }
        }
        if (lastRoundFrom < 0) return 'skip';   // 没有回合结构（非战斗日志）
        const last = fs[fs.length - 1] || {};
        const lastIsFinalRoundEnd = last.factType === FACT_TYPES.ROUND_END
            && last.data && last.data.round === MAX_ROUND();

        // ① 双方都有人活着收场
        if (aliveA > 0 && aliveE > 0) {
            if (!lastIsFinalRoundEnd && !hasNoContend) {
                return {
                    fail: true,
                    msg: '双方都有活人收场，却没打满 ' + MAX_ROUND() + ' 回合、也没有「不争」宣告：'
                        + '最后一条是 ' + (last.factType || '?') + '（回合 ' + lastRound + '）。胜负判定漏判/提前停战'
                };
            }
        }

        // ② 同归于尽
        if (aliveA === 0 && aliveE === 0) {
            return { fail: true, msg: '双方同时 0 活人收场（同归于尽）：引擎判胜只认「一方 0 活」，没有同归于尽的合法出口' };
        }

        // ③ 已删除（回合末判胜会合法落 roundEnd，见文件头 ★）

        return {
            fail: false,
            msg: '终局形态成立：己方存活 ' + aliveA + ' / 敌方存活 ' + aliveE
                + '（' + (hasNoContend ? '不争宣告' : lastIsFinalRoundEnd ? '打满 ' + MAX_ROUND() + ' 回合平局' : '一方全灭') + '）'
        };
    }
};
