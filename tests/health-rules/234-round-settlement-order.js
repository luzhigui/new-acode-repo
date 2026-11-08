// tests/health-rules/234-round-settlement-order.js
// 体检规则：回合开始结算链顺序（roundStart → DOT/摘要 → 首次出手）
//
// 引擎口径（core/210 clearRoundEntries → ON_ROUND_START 结算 → logBuffSummary → 单位行动）：
//   回合前导必须按固定顺序入账，否则 DOT 会在「已经打完才补扣毒」这种时序下静默错账。
//   140 场 / 约 1000+ 回合实测：回合首条必为 roundStart（0 例）、xuanmingDot 216 次全部早于
//   首次出手与 buffSummary（0 例）、buffSummary 全部早于首次出手（0 例）、零摘要回合 0 个。
//
// 判据（全部 0 误报）：
//   ① 战报第一条 fact 必须是 roundStart；
//   ② 每回合至少一条 buffSummary（回合摘要属于结算链，缺席 = 结算链断了一节）；
//   ③ 该回合的 xuanmingDot 必须早于 buffSummary、且早于本回合首次出手；
//   ④ buffSummary 必须早于本回合首次出手。
// 不判 endlessBreath / 各类回血的位置：实测 557 次「生生不息」类回血落在首次出手之后（单位自己行动时结算），
//   属合法形态，硬判必误报（见 142/154 的机制口径）。
export const VER = 'tests/health-rules/234-round-settlement-order.js V1.0.0';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

const ACTION_TYPES = [FACT_TYPES.ATTACK, FACT_TYPES.MISS, FACT_TYPES.DODGE, FACT_TYPES.IMMUNE, FACT_TYPES.PASS];

export const rule234 = {
    group: '行动与目标回归',
    name: '回合开始结算链顺序(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = facts || [];
        if (!fs.length) return 'skip';

        const starts = [];
        for (let i = 0; i < fs.length; i++) {
            if (fs[i] && fs[i].factType === FACT_TYPES.ROUND_START) starts.push(i);
        }
        if (!starts.length) return 'skip';
        if (starts[0] !== 0) {
            return { fail: true, msg: '战报第一条 fact 不是 roundStart（' + (fs[0].factType || '?') + ' @0）：回合开始前就有结算落账' };
        }

        const errs = [];
        let rounds = 0, dotN = 0, summaryN = 0;

        for (let k = 0; k < starts.length; k++) {
            const from = starts[k];
            const to = (k + 1 < starts.length) ? starts[k + 1] : fs.length;
            const round = (fs[from].data && typeof fs[from].data.round === 'number') ? fs[from].data.round : k + 1;
            rounds++;

            let firstAction = -1, firstSummary = -1;
            const dots = [];
            let summaries = 0;
            for (let i = from; i < to; i++) {
                const t = fs[i] && fs[i].factType;
                if (firstAction < 0 && ACTION_TYPES.indexOf(t) >= 0) firstAction = i;
                if (t === FACT_TYPES.BUFF_SUMMARY) { summaries++; summaryN++; if (firstSummary < 0) firstSummary = i; }
                if (t === FACT_TYPES.XUAN_MING_DOT) { dots.push(i); dotN++; }
            }

            if (summaries === 0) {
                errs.push('第' + round + '回合没有任何 buffSummary（结算链缺回合摘要）');
                continue;
            }
            for (const di of dots) {
                if (firstSummary >= 0 && di > firstSummary) {
                    errs.push('第' + round + '回合：DOT@' + di + ' 晚于 buffSummary@' + firstSummary + '（毒应在摘要前结算）');
                }
                if (firstAction >= 0 && di > firstAction) {
                    errs.push('第' + round + '回合：DOT@' + di + ' 晚于首次出手@' + firstAction + '（打完才补扣毒）');
                }
            }
            if (firstAction >= 0 && firstSummary > firstAction) {
                errs.push('第' + round + '回合：buffSummary@' + firstSummary + ' 晚于首次出手@' + firstAction + '（摘要混进出手段）');
            }
        }

        if (errs.length) {
            return { fail: true, msg: errs.slice(0, 3).join('；') + (errs.length > 3 ? '（共 ' + errs.length + ' 处）' : '') };
        }
        return {
            fail: false,
            msg: '回合开始结算链顺序成立：' + rounds + ' 回合 / 摘要 ' + summaryN + ' 条 / DOT ' + dotN + ' 次，全部在首次出手前'
        };
    }
};
