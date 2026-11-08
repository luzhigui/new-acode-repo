// tests/health-rules/261-horse-slot-lifecycle.js | 2026-11-08（体检总框架 D6·召唤物/附身/占格）
// 拒马（巨马阵）占格生命周期：
//   ① 落位声明必带 horseUid（非空）+ 落点 1~9 整数，同一 uid 不得重复出现；
//      落位声明有两种：HORSE_SUMMON（巨马阵每回合刷新）与 XIAO_ZHAO_HORSE（小昭·哥概率强刷），两者都算；
//   ② HORSE_DESTROY 必带 horseUid，且必须对得上本场一条落位声明（消散了谁不能说不清）；
//   ③ 同一 horseUid 最多成功消散一次（成功两次 = 已移除的格子又被回收一次，占位账目会错）；
//   ④ 成功消散之后不得再以该 uid 出手/被选（消散≠死亡，但也不能继续参战）。
// 「同阵营同一格两个活人」已由 rules-replay 的逐步不变量 pos 唯一负责，本规则不重复造判据。
// 观察项：整局从未消散的拒马数（姊强化 noDestroy 的永久占格就是这类，已知待查项）。
// 实测（156 场）：落位 296 次（HORSE_SUMMON 278 + 小昭·哥 XIAO_ZHAO_HORSE 18）/ 消散判定 355 次（115 成功），
//   成功重复 0、消散后参战 0。XIAO_ZHAO_HORSE 的整条链是通的：契约 infra/107 登记 renderFn/translateFn →
//   render/412 `renderXiaoZhaoHorseFact`（L147，注册在 L249）负责「出现」行，消散走 `renderHorseDestroyFact`，
//   两条都带 pos，播放层会把文本追加进战报。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const rule261 = {
    group: '占格与拒马',
    name: '拒马占格生命周期闭环(回归)',
    test: function (ctx) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

        const fails = [];
        const summoned = new Map();   // horseUid -> 序号
        const successAt = new Map();  // horseUid -> 成功消散下标
        let summonN = 0, destroyN = 0, successN = 0, doubleSuccess = 0, zhaoHorseN = 0;
        let round = 0;

        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f) continue;
            if (f.factType === FACT_TYPES.ROUND_START) {
                round = (f.data && typeof f.data.round === 'number') ? f.data.round : round + 1;
                continue;
            }
            if (f.factType === FACT_TYPES.HORSE_SUMMON || f.factType === FACT_TYPES.XIAO_ZHAO_HORSE) {
                const d = f.data || {};
                summonN++;
                if (f.factType === FACT_TYPES.XIAO_ZHAO_HORSE) zhaoHorseN++;
                if (typeof d.horseUid !== 'string' || d.horseUid === '') {
                    fails.push(`第${round}回合拒马落位缺 horseUid（${f.factType}）`);
                } else if (summoned.has(d.horseUid)) {
                    fails.push(`拒马 uid 重复落位：${d.horseUid}`);
                } else {
                    summoned.set(d.horseUid, i);
                }
                if (!(typeof d.pos === 'number' && Number.isInteger(d.pos) && d.pos >= 1 && d.pos <= 9)) {
                    fails.push(`拒马落点 pos=${String(d.pos)}（合法 1~9 整数）`);
                }
                continue;
            }
            if (f.factType === FACT_TYPES.HORSE_DESTROY) {
                const d = f.data || {};
                destroyN++;
                if (typeof d.horseUid !== 'string' || d.horseUid === '') {
                    fails.push(`第${round}回合拒马消散缺 horseUid（success=${String(d.success)}）`);
                    continue;
                }
                if (summonN > 0 && !summoned.has(d.horseUid)) {
                    fails.push(`第${round}回合消散的拒马 ${d.horseUid} 对不上任何一次落位`);
                }
                if (d.success === true) {
                    successN++;
                    if (successAt.has(d.horseUid)) {
                        doubleSuccess++;
                        fails.push(`拒马 ${d.horseUid} 成功消散两次（第${round}回合再消散）`);
                    } else {
                        successAt.set(d.horseUid, i);
                    }
                }
                continue;
            }
            if (f.factType === FACT_TYPES.ATTACK) {
                const d = f.data || {};
                const atk = d.attacker && d.attacker.uid;
                const tgt = d.target && d.target.uid;
                if (typeof atk === 'string' && successAt.has(atk)) fails.push(`拒马 ${atk} 消散后仍出手`);
                if (typeof tgt === 'string' && successAt.has(tgt)) fails.push(`拒马 ${tgt} 消散后仍被选为目标`);
            }
        }
        if (summonN === 0 && destroyN === 0) return 'skip';

        const permanents = [...summoned.keys()].filter(u => !successAt.has(u)).length;
        const observe = `拒马落位 ${summonN} 只（其中小昭·哥强刷 ${zhaoHorseN}），消散判定 ${destroyN} 次（成功 ${successN}），整局未消散 ${permanents} 只`;
        if (fails.length) return { fail: true, msg: fails.slice(0, 3).join('；') };
        return { fail: false, observe: observe };
    }
};
