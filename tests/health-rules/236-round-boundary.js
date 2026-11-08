// tests/health-rules/236-round-boundary.js
// 体检规则：回合末结算链的位置与跨回合衔接（原始 fact 视角）
//
// 为什么再补一条（与 131/181 的分工）：
//   131 读的是**渲染文本**（"第N回合结束"）判重复，181 判**序号连续 + 开始/结束配对**；
//   两者都不管结束符在回合内的位置、也不管两个回合之间夹没夹东西。回合结算（finalizeRoundEnd）一旦
//   漏到最后一条之前，就会出现「结束符之后还有伤害行」的错账，渲染文本上看不出来。
//   140 场实测：roundEnd 全部是本回合最后一条引擎 fact（0 例越位）、结束符与下一 roundStart 之间 0 条引擎 fact。
//
// 判据（全部 0 误报）：
//   ① 同一回合内 roundEnd 最多一条（原始 fact 视角，不依赖渲染文案）；
//   ② roundEnd 必须是本回合最后一条**引擎** fact（回合结算全跑完才落结束符）；
//   ③ roundEnd 之后若还有 fact，只能是下一回合的 roundStart；两回合之间不许夹任何结算/行动行。
// ★ 唯一豁免：BUFF_SUMMARY。回放器 V6.13.0 的 appendPermanentSummaries 会把妹妹 _permanentBuffs
//   每回合补一条摘要挂在回合末尾（rules-replay.mjs L340-368），这是回放侧建模、不是引擎行为；
//   实测 9 场在 roundEnd 之后各有 1 条该摘要，不豁免会整批误报。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

const HARNESS_TAIL = FACT_TYPES.BUFF_SUMMARY;
export const VER = 'tests/health-rules/236-round-boundary.js V1.0.1';

export const rule236 = {
    group: '行动与目标回归',
    name: '回合末结算链与边界衔接(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = facts || [];
        if (!fs.length) return 'skip';

        const starts = [];
        for (let i = 0; i < fs.length; i++) {
            if (fs[i] && fs[i].factType === FACT_TYPES.ROUND_START) starts.push(i);
        }
        if (!starts.length) return 'skip';

        const errs = [];
        let ends = 0;

        for (let k = 0; k < starts.length; k++) {
            const from = starts[k];
            const to = (k + 1 < starts.length) ? starts[k + 1] : fs.length;
            const round = (fs[from].data && typeof fs[from].data.round === 'number') ? fs[from].data.round : k + 1;

            const endIdx = [];
            for (let i = from; i < to; i++) {
                if (fs[i] && fs[i].factType === FACT_TYPES.ROUND_END) endIdx.push(i);
            }
            if (endIdx.length === 0) continue;      // 最后一回合允许没有结束符（胜负中途判出，见 181）
            ends++;
            if (endIdx.length > 1) {
                errs.push('第' + round + '回合出现 ' + endIdx.length + ' 条回合结束符（@' + endIdx.join(',') + '）');
            }
            const lastEnd = endIdx[endIdx.length - 1];
            // ② 结束符之后只允许回放侧补发的永久摘要（非摘要 = 结束符越位或回合间夹层，同一处只报一次）
            for (let i = lastEnd + 1; i < to; i++) {
                const t = fs[i] && fs[i].factType;
                if (t === FACT_TYPES.ROUND_START) break;
                if (t === HARNESS_TAIL) continue;
                errs.push('第' + round + '回合的结束符不是最后一条：@' + lastEnd + ' 之后还有 ' + t + '@' + i);
                break;
            }
        }

        if (errs.length) {
            return { fail: true, msg: errs.slice(0, 3).join('；') + (errs.length > 3 ? '（共 ' + errs.length + ' 处）' : '') };
        }
        return { fail: false, msg: '回合末边界成立：检查 ' + starts.length + ' 个回合、' + ends + ' 条结束符，全部落在本回合末尾且与下回合无缝衔接' };
    }
};
