// tests/health-rules/263-butterfly-window-no-action.js | 2026-11-08（体检总框架 D6·召唤物/附身/占格）
// 附身窗口内的伤害归属：小昭·姊附身后 _acted=true + _untargetable=true，攻防血加成转给宿主，
//   所以她本人不得当回合出手、也不得被选为攻击目标 —— 一旦出现，说明有一笔结算被记到了她名下，
//   面板「输出/承伤」与战斗日志就会分家（她输出 6 / 承伤 102 属于窗口外正常回合，不是本规则目标）。
// 判据：窗口 (ATTACH → RETURN/HOST_DEAD) 区间的每条 ATTACK，attacker/target 的 uid 都不得等于 sisterUid。
// 实测（156 场）：356 个窗口内 0 次出手 / 0 次被选（0 误报 → 直接升硬判据）。
// 未关闭的窗口按「到本场结束」算；这类窗口另由 262 报红，本规则重复报不冲突（两个角度都该红）。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const rule263 = {
    group: '附身窗口',
    name: '附身窗口内小昭不参战(回归)',
    test: function (ctx) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

        const fails = [];
        const open = new Map();   // sisterUid -> { index, round }
        let windows = 0;
        const CLOSERS = [FACT_TYPES.BUTTERFLY_RETURN, FACT_TYPES.BUTTERFLY_HOST_DEAD];

        // 窗口内违规统计：窗口一开就把后续每条 ATTACK 对一遍，关窗时结算
        const scanRange = (start, end, sisterUid, round) => {
            for (let k = start + 1; k < end; k++) {
                const g = facts[k];
                if (!g || g.factType !== FACT_TYPES.ATTACK) continue;
                const d = g.data || {};
                if (d.attacker && d.attacker.uid === sisterUid) {
                    fails.push(`附身窗口内（第${round}回合起）小昭仍出手，位置在第${k}条`);
                }
                if (d.target && d.target.uid === sisterUid) {
                    fails.push(`附身窗口内（第${round}回合起）小昭仍被选为攻击目标`);
                }
            }
        };

        let round = 0;
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f) continue;
            if (f.factType === FACT_TYPES.ROUND_START) {
                round = (f.data && typeof f.data.round === 'number') ? f.data.round : round + 1;
                continue;
            }
            if (f.factType === FACT_TYPES.BUTTERFLY_ATTACH) {
                const d = f.data || {};
                windows++;
                open.set(d.sisterUid, { index: i, round: round });
                continue;
            }
            if (!CLOSERS.includes(f.factType)) continue;
            const d = f.data || {};
            const w = open.get(d.sisterUid);
            if (!w) continue;
            scanRange(w.index, i, d.sisterUid, w.round);
            open.delete(d.sisterUid);
        }
        for (const [key, w] of open) scanRange(w.index, facts.length, key, w.round);
        if (windows === 0) return 'skip';

        const observe = `附身窗口 ${windows} 个，窗口内以她名义产生的攻击结算 ${fails.length} 条`;
        if (fails.length) return { fail: true, msg: fails.slice(0, 3).join('；') };
        return { fail: false, observe: observe };
    }
};
