// tests/health-rules/264-lion-grow-timing.js | 2026-11-08（体检总框架 D6·召唤物/附身/占格）
// 召唤物属性继承的**时机**（数值本身由 161 幼狮成长数值 负责，本规则不重复）：
//   ① 成长必须晚于召唤：LION_GROW 所在回合 ≥ 召唤回合 + 1（同回合长大 = 时序错，
//      主代码 modules/326 刻意把 LION_GROW 排在召唤之前，就是为了防这个）；
//   ② 同一只幼狮只成长一次（uid 不得二次成长，否则永久词条叠两遍）；
//   ③ 成长 uid 必须对得上本场一条 SUMMON_UNIT（凭空长大的 uid = 归属丢失）；
//   ④ 形态与落点一致：pos ≤ frontMax 成「雄狮」、其余成「母狮」——frontMax 取 content 真值
//      （金毛狮王谢逊 skills.summonLion.grow.frontMax = 6），不在此处写死。
// 实测（156 场）：88 次成长，间隔 1 回合 79 次 / 2 回合 7 次 / 3 回合 2 次；同回合 0 次、二次成长 0 次。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';
import { getSkillParams } from '../../core/201-config-5v5-test.js';

export const rule264 = {
    group: '召唤物生命周期',
    name: '幼狮成长时机与形态口径(回归)',
    test: function (ctx) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

        let grow = null;
        try { grow = getSkillParams('金毛狮王谢逊', 'summonLion'); } catch (e) { grow = null; }
        const gcfg = (grow && grow.grow) || {};
        const frontMax = typeof gcfg.frontMax === 'number' ? gcfg.frontMax : 6;
        const frontName = (gcfg.front && gcfg.front.name) || '雄狮';
        const backName = (gcfg.back && gcfg.back.name) || '母狮';

        // 召唤回合表：uid -> 回合
        let round = 0;
        const summonRound = new Map();
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f) continue;
            if (f.factType === FACT_TYPES.ROUND_START) {
                round = (f.data && typeof f.data.round === 'number') ? f.data.round : round + 1;
                continue;
            }
            if (f.factType !== FACT_TYPES.SUMMON_UNIT) continue;
            const d = f.data || {};
            if (typeof d.summonUid === 'string' && d.summonUid !== '' && !summonRound.has(d.summonUid)) {
                summonRound.set(d.summonUid, round);
            }
        }
        if (summonRound.size === 0) return 'skip';

        const fails = [];
        const grown = new Set();
        let growN = 0;
        round = 0;
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f) continue;
            if (f.factType === FACT_TYPES.ROUND_START) {
                round = (f.data && typeof f.data.round === 'number') ? f.data.round : round + 1;
                continue;
            }
            if (f.factType !== FACT_TYPES.LION_GROW) continue;
            const d = f.data || {};
            growN++;
            const uid = d.unitUid;
            if (typeof uid !== 'string' || uid === '') {
                fails.push(`幼狮成长时机：第${round}回合成长缺 unitUid`);
                continue;
            }
            if (!summonRound.has(uid)) {
                fails.push(`幼狮成长时机：第${round}回合成长的 uid ${uid} 对不上任何一次召唤`);
                continue;
            }
            if (round < summonRound.get(uid) + 1) {
                fails.push(`幼狮成长时机：第${round}回合成长早于召唤下一回合（同回合/倒序，uid=${uid}）`);
            }
            if (grown.has(uid)) fails.push(`幼狮成长时机：幼狮 ${uid} 成长两次`);
            grown.add(uid);
            if (typeof d.pos === 'number' && Number.isInteger(d.pos)) {
                const expect = d.pos <= frontMax ? frontName : backName;
                if (d.name !== expect) {
                    fails.push(`幼狮成长时机：第${round}回合落点 ${d.pos} 号位应成${expect}，实际${String(d.name)}`);
                }
            }
        }
        if (growN === 0) return 'skip';

        const observe = `成长 ${growN} 次，形态口径 frontMax=${frontMax}（${frontName}/${backName}）`;
        if (fails.length) return { fail: true, msg: `幼狮成长时机与形态口径：${fails[0].slice('幼狮成长时机：'.length)}（共 ${fails.length} 条）` };
        return { fail: false, observe: observe };
    }
};
