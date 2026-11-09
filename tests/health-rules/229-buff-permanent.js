// tests/health-rules/229-buff-permanent.js | 2026-11-08（第 229 轮）
// 妹永久海克斯（u.state._permanentBuffs）此前只在 unit.state，引擎 BUFF_SUMMARY 只遍历团队
//   activeBuffs ⇒ fact 通道看不到，无法验「整局仍在」。回放器 rules-replay V6.13.0 起每回合补一条
//   带 permanent:true 的摘要（同回合团队摘要已有同 key 时跳过，避免 227 判「剩余回升」）。
// 本规则验证：
//   ① 永久副本只挂明教、remaining 恒为 MAX_ROUND（不是 4，也不是 Infinity）；
//   ② 一旦某 key 出现永久副本，从首次出现到该 key 最后一次出现的每一回合都必须有摘要
//      （团队摘要同 key 也算「持有」）—— 中途丢副本即 229 报红。
// 无永久摘要（无妹/无 NOBUFFS/该场没选到海克斯）→ skip，不制造假绿也不制造假红。
//
// ★ 2026-11-08 修假绿 + 修两处误判面（本规则此前恒不红，三个 bug 叠在一起）：
//   ① 失败时返回普通字符串，而回放器只认 'skip'，其余一律算通过 ⇒ 假绿 156 场。改 {fail:true}。
//   ② 判据面过宽：引擎团队 buff（holyFlame 等）也带 permanent:true、remaining 逐回合递减（那是 227
//      的地盘）。判据① 收窄为「回合结束符之后补发的摘要」（appendPermanentSummaries 的位置特征）。
//   ③ 阵营字面量写死 'ALLY'，而 CAMP_TYPES.ALLY === 'ally' ⇒ 所有明教摘要都被判成「挂到敌方」。
//      改用 CAMP_TYPES.ALLY（铁律：阵营不许裸字符串）。
//   修后全量回放 pass=9 / fail=0 / skip=147；自检可证仍能红（挂敌方/剩余非 MAX/中途消失）能 skip。
import { FACT_TYPES, CAMP_TYPES } from '../../infra/106-battle-enums.js';
import { CONFIG } from '../../core/201-config-5v5-test.js';

const MAX_R = () => (typeof CONFIG.MAX_ROUND === 'number' ? CONFIG.MAX_ROUND : 35);

export const rule229 = {
    group: 'buff生命周期',
    name: '妹永久海克斯整局不消失(回放建模)',
    test: function (ctx) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

        let round = 0;
        let afterRoundEnd = false;   // 回合结束符之后 = 回放器补发摘要的位置
        const rounds = {};     // camp|key -> Set(round)
        const permanent = {};  // camp|key -> true（出现过后补发的永久副本）
        const fails = [];
        let permanentN = 0;

        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || typeof f !== 'object') continue;
            if (f.factType === FACT_TYPES.ROUND_START) {
                round = (f.data && typeof f.data.round === 'number') ? f.data.round : round + 1;
                afterRoundEnd = false;
                continue;
            }
            if (f.factType === FACT_TYPES.ROUND_END) { afterRoundEnd = true; continue; }
            if (f.factType !== FACT_TYPES.BUFF_SUMMARY) continue;
            const b = f.data && f.data.buff;
            if (!b || typeof b.key !== 'string' || b.key === '') continue;
            const camp = b.target || CAMP_TYPES.ALLY;
            const id = camp + '|' + b.key;
            if (!rounds[id]) rounds[id] = new Set();
            rounds[id].add(round);
            // 团队 buff 也可能带 permanent:true（content 整局配置），不在本规则判据①范围内
            if (b.permanent !== true || !afterRoundEnd) continue;
            permanentN++;
            permanent[id] = true;
            if (camp !== CAMP_TYPES.ALLY) fails.push(`妹永久海克斯：${b.key} 永久副本挂到 ${camp}（真路径只给明教妹）`);
            if (b.remaining !== MAX_R()) fails.push(`妹永久海克斯：${b.key} 永久副本剩余=${String(b.remaining)}，应恒为 MAX_ROUND(${MAX_R()})`);
        }

        if (permanentN === 0) return 'skip';
        for (const id in permanent) {
            const set = rounds[id];
            const arr = [...set].sort((a, b) => a - b);
            for (let r = arr[0]; r <= arr[arr.length - 1]; r++) {
                if (!set.has(r)) {
                    fails.push(`妹永久海克斯：${id} 第${r}回合没有任何摘要（永久副本中途消失）`);
                    if (fails.length >= 6) break;
                }
            }
        }
        if (fails.length) return { fail: true, msg: `妹永久海克斯整局不消失：${fails[0]}（共 ${fails.length} 条）` };
        return 'pass';
    }
};
