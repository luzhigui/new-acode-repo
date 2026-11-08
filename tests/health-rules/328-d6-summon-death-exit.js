// tests/health-rules/328-d6-summon-death-exit.js | 2026-11-08（体检总框架 D6·召唤物与附身窗口）
// 召唤物 / 拒马阵亡必须只在 resolveDeaths（core/10 统一出口）落一条 UNIT_DEATH：
//   ① 被攻击打死（ATTACK 的 dmgResult.dead=true）的召唤物 / 拒马，必须有且只有一条对应 UNIT_DEATH；
//      一条都没有 = 死亡没走统一出口（散落出口），两条及以上 = 重复落账（复活/补账撞车）；
//   ② 召唤物不得出现「复活前补账（待死未结算）」那条 UNIT_DEATH——圣火不熄名额明确排除 isSummon，
//      该出口只服务真角色；召唤物若命中，说明有第二个死亡出口提前写账；
//   ③ SUMMON_DEAD 契约说明：当前枚举里没有独立「召唤物阵亡」fact（known-transfers「待用户定夺·召唤物阵亡无独立 fact」行），
//      本条不臆造 SUMMON_DEAD，只把 UNIT_DEATH 当唯一出口做对账；将来真加 SUMMON_DEAD，
//      必须仍由 resolveDeaths 同一处发射，不得另开出口。
// 实测（156 场）：525 只召唤物 / 361 只阵亡，UNIT_DEATH 对账 0 违规。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const rule328 = {
    group: '召唤契约',
    name: '召唤物阵亡单一出口对账(回归)',
    test: function (ctx) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

        const summonNames = new Map();   // uid -> name（召唤物）
        const horseNames = new Map();    // uid -> name（拒马）
        for (const f of facts) {
            const d = (f && f.data) || {};
            if (!f) continue;
            if (f.factType === FACT_TYPES.SUMMON_UNIT && typeof d.summonUid === 'string' && d.summonUid !== '') {
                summonNames.set(d.summonUid, d.summonName || '召唤物');
            } else if ((f.factType === FACT_TYPES.HORSE_SUMMON || f.factType === FACT_TYPES.XIAO_ZHAO_HORSE)
                && typeof d.horseUid === 'string' && d.horseUid !== '') {
                horseNames.set(d.horseUid, d.horseName || '拒马');
            }
        }
        if (summonNames.size === 0 && horseNames.size === 0) return 'skip';
        const watched = new Map([...horseNames, ...summonNames]);

        const killAt = new Map();        // uid -> 第一条「被打死」攻击下标
        const deaths = new Map();        // uid -> [UNIT_DEATH 下标]
        const fails = [];
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f) continue;
            const d = f.data || {};
            if (f.factType === FACT_TYPES.ATTACK) {
                const tgt = d.target && d.target.uid;
                if (typeof tgt === 'string' && watched.has(tgt)
                    && d.dmgResult && d.dmgResult.dead === true && !killAt.has(tgt)) {
                    killAt.set(tgt, i);
                }
                continue;
            }
            if (f.factType === FACT_TYPES.UNIT_DEATH && typeof d.uid === 'string' && watched.has(d.uid)) {
                if (!deaths.has(d.uid)) deaths.set(d.uid, []);
                deaths.get(d.uid).push({ index: i, reason: d.reason || '' });
            }
        }

        let killed = 0, accounted = 0, preAccounted = 0;
        for (const [uid, name] of watched) {
            const list = deaths.get(uid) || [];
            if (killAt.has(uid)) {
                killed++;
                if (list.length === 0) {
                    fails.push(`${name}(${uid}) 被打死后没有 UNIT_DEATH（死亡未走 resolveDeaths 统一出口）`);
                } else {
                    accounted++;
                    if (list.length > 1) fails.push(`${name}(${uid}) UNIT_DEATH 重复落账 ${list.length} 条`);
                }
                if (list.length && list[0].index < killAt.get(uid)) {
                    fails.push(`${name}(${uid}) UNIT_DEATH 早于判死攻击（第二出口提前落账）`);
                }
            } else if (list.length > 1) {
                fails.push(`${name}(${uid}) 未被打死却有多条 UNIT_DEATH（重复落账 ${list.length} 条）`);
            }
            if (list.some(x => x.reason.indexOf('复活前补账') !== -1)) {
                preAccounted++;
                fails.push(`${name}(${uid}) 走了「复活前补账」出口（该出口只服务真角色，召唤物/拒马不该命中）`);
            }
        }
        if (killed === 0 && deaths.size === 0) return 'skip';

        const observe = `召唤/拒马 ${watched.size} 只，被打死 ${killed} 只，UNIT_DEATH 对账 ${accounted} 只，异常出口 ${preAccounted} 只，违规 ${fails.length} 条`;
        if (fails.length) return { fail: true, msg: fails.slice(0, 3).join('；') };
        return { fail: false, observe: observe };
    }
};
