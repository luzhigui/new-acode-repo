// tests/health-rules/283-post-death-action.js | 2026-11-08（第 283 轮·存活胜负与结算链域）
// 「最后一个死的人算不算出手」——死后出手检测。
//
// 判据：同一 uid 一旦落到 UNIT_DEATH（core/213 resolveDeaths 统一出口），在其下一次「复活公告」
//   （SKILL_ANNOUNCE/圣火不熄）之前，不得再出现任何以它出手的攻击 fact。
//   · 同帧（自己这刀伤害已发、随后被反伤/连击补刀打死）与跨回合都算，只要中间没有复活公告。
//   · 只判「出手」这一种：死亡本身、死亡触发类被动公告、他人结算都不算出手。
// 数据依赖：UNIT_DEATH（uid/name/camp）与 ATTACK（attacker.uid）都在 fact 流里，不需要主代码配合。
// 基线口径：先量再立规——156 场实测 0 反例才保持硬判。
export const VER = 'tests/health-rules/283-post-death-action.js V1.0.0';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const rule283 = {
    group: '行动与目标回归',
    name: '死后不得再出手(回归)',
    test: function (ctx) {
        const fs = (ctx && Array.isArray(ctx.facts)) ? ctx.facts : [];
        if (!fs.length) return 'skip';

        const dead = new Map();   // uid -> { idx, name, camp }
        const errs = [];
        let actions = 0;

        for (let i = 0; i < fs.length; i++) {
            const f = fs[i];
            if (!f || !f.factType) continue;
            const d = f.data || {};

            if (f.factType === FACT_TYPES.UNIT_DEATH) {
                if (d.uid != null) dead.set(d.uid, { idx: i, name: d.name || d.uid, camp: d.camp });
                continue;
            }
            if (f.factType === FACT_TYPES.SKILL_ANNOUNCE) {
                // 复活公告 = 死亡状态解除
                if (d.skillName === '圣火不熄' && d.unitUid != null) dead.delete(d.unitUid);
                continue;
            }
            if (f.factType !== FACT_TYPES.ATTACK) continue;

            const a = d.attacker;
            if (!a || a.uid == null) continue;
            actions++;
            const dth = dead.get(a.uid);
            if (dth) {
                errs.push(`死后不得再出手：${a.name || a.uid} 死亡登记@${dth.idx} 之后仍出手@${i}（中间无复活公告）`);
                if (errs.length >= 4) break;
            }
        }

        if (actions === 0) return 'skip';
        if (errs.length) return { fail: true, msg: errs.join('；') };
        return { fail: false, msg: '死后出手 0 例（攻击 fact ' + actions + ' 条）' };
    }
};
