// tests/health-rules/229-buff-permanent.js | 2026-11-08（第 229 轮）
// 妹永久海克斯（u.state._permanentBuffs）此前只在 unit.state，引擎 BUFF_SUMMARY 只遍历团队
//   activeBuffs ⇒ fact 通道看不到，无法验「整局仍在」。回放器 rules-replay V6.13.0 起每回合补一条
//   带 permanent:true 的摘要（同回合团队摘要已有同 key 时跳过，避免 227 判「剩余回升」）。
// 本规则验证：
//   ① 永久副本只挂明教、remaining 恒为 MAX_ROUND（不是 4，也不是 Infinity）；
//   ② 一旦某 key 出现永久副本，从首次出现到该 key 最后一次出现的每一回合都必须有摘要
//      （团队摘要同 key 也算「持有」）—— 中途丢副本即 229 报红。
// 无永久摘要（无妹/无 NOBUFFS/该场没选到海克斯）→ skip，不制造假绿也不制造假红。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';
import { CONFIG } from '../../core/201-config-5v5-test.js';

const MAX_R = () => (typeof CONFIG.MAX_ROUND === 'number' ? CONFIG.MAX_ROUND : 35);

export const rule229 = {
    group: 'buff生命周期',
    name: '妹永久海克斯整局不消失(回放建模)',
    test: function (ctx) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';

        let round = 0;
        const rounds = {};     // camp|key -> Set(round)
        const permanent = {};  // camp|key -> true（至少出现过一次永久摘要）
        const fails = [];
        let permanentN = 0;

        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || typeof f !== 'object') continue;
            if (f.factType === FACT_TYPES.ROUND_START) {
                round = (f.data && typeof f.data.round === 'number') ? f.data.round : round + 1;
                continue;
            }
            if (f.factType !== FACT_TYPES.BUFF_SUMMARY) continue;
            const b = f.data && f.data.buff;
            if (!b || typeof b.key !== 'string' || b.key === '') continue;
            const camp = b.target || 'ALLY';
            const id = camp + '|' + b.key;
            if (!rounds[id]) rounds[id] = new Set();
            rounds[id].add(round);
            if (b.permanent !== true) continue;
            permanentN++;
            permanent[id] = true;
            if (camp !== 'ALLY') fails.push(`${b.key} 永久副本挂到 ${camp}（真路径只给明教妹）`);
            if (b.remaining !== MAX_R()) fails.push(`${b.key} 永久副本剩余=${String(b.remaining)}，应恒为 MAX_ROUND(${MAX_R()})`);
        }

        if (permanentN === 0) return 'skip';
        for (const id in permanent) {
            const set = rounds[id];
            const arr = [...set].sort((a, b) => a - b);
            for (let r = arr[0]; r <= arr[arr.length - 1]; r++) {
                if (!set.has(r)) {
                    fails.push(`${id} 第${r}回合没有任何摘要（永久副本中途消失）`);
                    if (fails.length >= 6) break;
                }
            }
        }
        if (fails.length) return fails.slice(0, 6).join('；');
        return 'pass';
    }
};
