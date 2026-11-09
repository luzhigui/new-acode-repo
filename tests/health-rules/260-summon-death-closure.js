// tests/health-rules/260-summon-death-closure.js | 2026-11-08（体检总框架 D6·召唤物/附身/占格）
// 召唤物死亡闭环：一只召唤物被攻击打死（ATTACK 的 dmgResult.dead=true）之后，
//   不得再以该 uid 出现在任何 fact —— 出手 / 被选 / 被激励 / 被治疗 / 成长。
//   中途「假死復活」或 uid 复用都会被这一条抓住。
// 实测（156 场）：525 只召唤物里 361 只阵亡，阵亡后出手/被选/被激励/被治疗/成长 **0 次** → 判据 0 误报。
// 已知缺口（登记 known-transfers）：主代码没有独立的「召唤物阵亡」fact，死亡只能由攻击 dead 推断；
//   被非攻击来源清场（如消散类）时本规则看不到，故不把「必须有一条死亡 fact」写成硬判据。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const rule260 = {
    group: '召唤物生命周期',
    name: '召唤物阵亡后不再参与结算(回归)',
    test: function (ctx) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

        const summons = new Map();   // uid -> summonName
        for (const f of facts) {
            if (!f || f.factType !== FACT_TYPES.SUMMON_UNIT) continue;
            const d = f.data || {};
            if (typeof d.summonUid === 'string' && d.summonUid !== '') summons.set(d.summonUid, d.summonName || '召唤物');
        }
        if (summons.size === 0) return 'skip';

        const deadAt = new Map();    // uid -> 第一条判死 fact 下标
        const fails = [];
        let died = 0;
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f) continue;
            const d = f.data || {};
            if (f.factType === FACT_TYPES.ATTACK) {
                const tgt = d.target && d.target.uid;
                if (typeof tgt === 'string' && summons.has(tgt) && d.dmgResult && d.dmgResult.dead === true && !deadAt.has(tgt)) {
                    deadAt.set(tgt, i);
                    died++;
                }
                const atk = d.attacker && d.attacker.uid;
                if (typeof atk === 'string' && deadAt.has(atk) && deadAt.get(atk) < i) {
                    fails.push(`召唤物阵亡后仍出手：${summons.get(atk)}（第${i}条攻击）`);
                }
                if (typeof tgt === 'string' && deadAt.has(tgt) && deadAt.get(tgt) < i) {
                    fails.push(`召唤物阵亡后仍被选为目标：${summons.get(tgt)}`);
                }
                continue;
            }
            if (f.factType === FACT_TYPES.LION_GROW) {
                const u = d.unitUid;
                if (typeof u === 'string' && deadAt.has(u)) fails.push(`召唤物阵亡后仍成长：${summons.get(u)}`);
                continue;
            }
            if (f.factType === FACT_TYPES.LION_INSPIRE && Array.isArray(d.targets)) {
                for (const t of d.targets) {
                    const u = t && t.uid;
                    if (typeof u === 'string' && deadAt.has(u)) fails.push(`召唤物阵亡后仍被激励：${summons.get(u)}`);
                }
                continue;
            }
            if (f.factType === FACT_TYPES.HEAL) {
                const u = d.unitUid;
                if (typeof u === 'string' && deadAt.has(u)) fails.push(`召唤物阵亡后仍被治疗：${summons.get(u)}`);
            }
        }
        if (died === 0) return 'skip';

        const observe = `${summons.size} 只召唤物中 ${died} 只阵亡，阵亡后违规引用 ${fails.length} 次`;
        if (fails.length) return { fail: true, msg: `召唤物阵亡后仍参与结算：${fails[0]}（共 ${fails.length} 次）` };
        return { fail: false, observe: observe };
    }
};
