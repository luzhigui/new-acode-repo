// tests/health-rules/232-revive-action-quota.js
// 体检规则：复活当回合的出手额度（同回合「死 → 活 → 打」结算顺序自洽）
//
// 为什么单列一条（与 184 的分工）：
//   184 明确「复活后同回合出几次不设上限」，只判「阵亡未复活后不得出手 / 不得收 PASS」。
//   但「复活即可动」是补一手行动权，不是无限续杯：同一回合被反复补手 = 行动权重复发放，
//   战报上只是多几行伤害，肉眼完全看不出。140 场实测 41 次复活，复活后本回合出手数分布：
//     0 手 12 次 / 1 手 27 次 / 2 次 2 次。故判据取「>2 手即红」，落在实测包络上，不放宽也不收窄。
//
// 判据（实测 0 误报）：
//   ① 复活公告之后、本回合结束（下一条 roundStart）之前，该 uid 的 ATTACK fact 数 > 2 → 红；
//   ② 同一回合同一 uid 出现两次复活公告 → 红（同回合不可能死两次再各复活一次；实测 0 例）。
// 不判「复活后收 PASS」：实测 3 例合法（同归于尽复活后补一条 isBlock 的 PASS，见 183 注），硬判必误报。
export const VER = 'tests/health-rules/232-revive-action-quota.js V1.0.0';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

const MAX_ACTIONS_PER_TURN = 2;   // 实测包络 0~2；>2 = 行动权重复发放

export const rule232 = {
    group: '行动与目标回归',
    name: '复活当回合出手额度(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = facts || [];
        if (!fs.length) return 'skip';

        let round = 0;
        let revivedInRound = new Map();   // uid -> 本回合是否已复活
        const errs = [];
        let revives = 0;

        for (let i = 0; i < fs.length; i++) {
            const f = fs[i];
            if (!f || !f.factType) continue;
            const d = f.data || {};

            if (f.factType === FACT_TYPES.ROUND_START) {
                round = (typeof d.round === 'number') ? d.round : round + 1;
                revivedInRound = new Map();
                continue;
            }
            if (f.factType !== FACT_TYPES.SKILL_ANNOUNCE || d.skillName !== '圣火不熄' || d.unitUid == null) continue;

            revives++;
            const uid = d.unitUid;
            const label = d.unitName || uid;
            if (revivedInRound.get(uid)) {
                errs.push('第' + round + '回合：' + label + ' 同回合出现两次复活公告（行动权重复发放）');
            }
            revivedInRound.set(uid, true);

            // 本回合内（到下一条 roundStart 之前）该 uid 的出手数
            let acts = 0;
            for (let j = i + 1; j < fs.length; j++) {
                const g = fs[j];
                if (!g || !g.factType) continue;
                if (g.factType === FACT_TYPES.ROUND_START) break;
                if (g.factType === FACT_TYPES.ATTACK && g.data && g.data.attacker && g.data.attacker.uid === uid) acts++;
            }
            if (acts > MAX_ACTIONS_PER_TURN) {
                errs.push('第' + round + '回合：' + label + ' 复活后仍出手 ' + acts + ' 次，超实测包络上限 '
                    + MAX_ACTIONS_PER_TURN + '（复活只补一手行动权，不是续杯）');
            }
        }

        if (revives === 0) return 'skip';
        if (errs.length) return { fail: true, msg: errs.slice(0, 3).join('；') + (errs.length > 3 ? '（共 ' + errs.length + ' 处）' : '') };
        return { fail: false, msg: '复活当回合出手额度成立：复活 ' + revives + ' 次，无 >' + MAX_ACTIONS_PER_TURN + ' 手、无同回合二次复活' };
    }
};
