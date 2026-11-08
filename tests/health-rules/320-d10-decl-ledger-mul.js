// tests/health-rules/320-d10-decl-ledger-mul.js
// 体检规则：乘率声明 ↔ 账本 双向同源（词条装备与套装域 D14）
//
// 为什么要有这条：
//   228 判「声明值 == 配置」，319 判「账本值 == 配置」——两条都绿仍可能「声明按 0.25、
//   账本挂 0.40」（两处各算一套），或反过来「账本挂了但战报没声明」（玩家看不到加成来源）。
//   本条把两侧按 (uid, field, group) 逐键双向对账：
//     A. 同键同值：账本每条乘率词条都必须等于该键最后一次声明的 ratio；
//     B. 不重复挂：同键账本条数 > 1 = 同一加成被算两遍（老病灶）；
//     C. 不漏落账：最后一回合仍声明的键，终局账本必须还在（清账/失败不回滚会露馅）。
//
// 覆盖 fact（来源 core/215-buff-effects.js push*Fact + core/204 施加入参同值）：
//   HOLY_FLAME_APPLY→holyFlame / SOUL_DRAIN_APPLY→soulDrain /
//   LAST_STAND_APPLY→lastStand / UNITY_APPLY→unity
// 误报规避：
//   - 没有 facts 通道（纯浏览器快照）直接 skip；
//   - 只在「有映射声明」或「有映射账本」时判，其余 group 不碰（妹背水/坚盾归 321/322）；
//   - 反向（C）只对最后一回合的声明判，且该 uid 必须还在终局名单里（中途阵亡并出列的不追）。
export const VER = 'tests/health-rules/320-d10-decl-ledger-mul.js V1.0.0';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

const EPS = 1e-9;
const MAP = {
    [FACT_TYPES.HOLY_FLAME_APPLY]: 'holyFlame',
    [FACT_TYPES.SOUL_DRAIN_APPLY]: 'soulDrain',
    [FACT_TYPES.LAST_STAND_APPLY]: 'lastStand',
    [FACT_TYPES.UNITY_APPLY]: 'unity'
};
const near = (a, b) => typeof a === 'number' && isFinite(a) && Math.abs(a - b) <= EPS;

export const rule320 = {
    group: '词条装备与套装',
    name: '乘率声明与账本双向同源',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE) {
        const facts = ctx && Array.isArray(ctx.facts) ? ctx.facts : [];
        if (facts.length === 0) return 'skip';
        const tail = [...(afterA || []), ...(afterE || [])];

        let round = 0;
        let lastRound = 0;
        const decl = {};      // uid|field|group -> { ratio, round }
        const declN = {};
        let mappedN = 0;
        for (const f of facts) {
            if (!f || typeof f !== 'object') continue;
            if (f.factType === FACT_TYPES.ROUND_START) {
                round = (f.data && typeof f.data.round === 'number') ? f.data.round : round + 1;
                lastRound = round;
                continue;
            }
            const g = MAP[f.factType];
            if (!g) continue;
            const d = f.data || {};
            if (d.unitUid == null || d.unitUid === '') continue;
            if (d.op !== 'mul' || typeof d.ratio !== 'number' || !isFinite(d.ratio)) continue;
            const k = `${d.unitUid}|${d.field}|${g}`;
            decl[k] = { ratio: d.ratio, round };
            declN[k] = (declN[k] || 0) + 1;
            mappedN++;
        }

        const led = {};       // uid|field|group -> [value]
        const uids = new Set();
        let ledN = 0;
        for (const u of tail) {
            if (!u || !u._mods || typeof u._mods !== 'object') continue;
            if (u.uid != null) uids.add(u.uid);
            for (const stat of ['atk', 'def', 'maxHp']) {
                for (const m of (u._mods[stat] || [])) {
                    if (!m || m.op !== 'mul' || typeof m.value !== 'number' || !isFinite(m.value)) continue;
                    const known = Object.values(MAP).includes(m.group);
                    if (!known) continue;
                    const k = `${u.uid}|${stat}|${m.group}`;
                    if (!led[k]) led[k] = [];
                    led[k].push(m.value);
                    ledN++;
                }
            }
        }
        if (mappedN === 0 && ledN === 0) return 'skip';

        const bad = [];
        // A + B：账本侧
        for (const k of Object.keys(led)) {
            const vals = led[k];
            const p = k.split('|');
            if (vals.length > 1) {
                bad.push(`${p[0]} ${p[2]}.${p[1]} 账本挂 ${vals.length} 条乘率（同键重复，数值双算）`);
            }
            const d = decl[k];
            if (!d) continue;                       // 该键无声明：归一次性机制，不判（防误报）
            for (const v of vals) {
                if (!near(v, d.ratio)) {
                    bad.push(`${p[0]} ${p[2]}.${p[1]} 声明 ${d.ratio} vs 账本 ${v}（两处各算一套）`);
                }
            }
        }
        // C：最后一回合的声明必须落地
        for (const k of Object.keys(decl)) {
            const p = k.split('|');
            const uid = p[0];
            if (!uids.has(uid) && !uids.has(Number(uid))) continue;   // uid 已不在终局名单，不追
            if (decl[k].round !== lastRound) continue;
            if (!led[k] || led[k].length === 0) {
                bad.push(`${uid} ${p[2]}.${p[1]} 末回合有声明但账本无词条（漏落账）`);
            }
        }

        if (bad.length) {
            return { fail: true, msg: '乘率声明/账本不同源：' + bad.slice(0, 4).join('；') + (bad.length > 4 ? `（共 ${bad.length} 条）` : '') };
        }
        return { fail: false, msg: `乘率声明与账本双向对齐：声明 ${mappedN} 条、账本 ${ledN} 条` };
    }
};
