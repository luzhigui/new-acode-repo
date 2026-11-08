// tests/health-rules/270-ttl-expiry-closure.js
// 体检规则：词条过期闭包盘点（观察项，只报数字不判红）
//
// 为什么要有这条：
//   词条按 ttl 三档清理：permanent 永不过期、round 每回合开头由 core/210 的 removeModsByTTL 清掉、
//   attached 随宿主生命周期。清理点只对存活单位执行（core/210:56 的 if (u.alive)），所以阵亡单位终局
//   残留 round 条目是已知风险点（复活残留当事例见规则 241 + known-transfers）。
//   本规则量化终局 ttl 分布与残留规模，给「清理点要不要改成不论生死都清」提供数据；不判红（避免与 241 重复）。
//
// 实测（2026-11-08，48 场）：permanent 占绝大多数；阵亡单位残留 round 条目只在「阵亡当回合的挂载」出现。
export const VER = 'tests/health-rules/270-ttl-expiry-closure.js V1.0.0';

const TTLS = ['permanent', 'round', 'attached'];

export const rule270 = {
    group: '属性与加成账本',
    name: '词条过期闭包盘点(加成账本)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE) {
        const tail = [...(afterA || []), ...(afterE || [])];
        if (!tail.some(u => u && u._mods)) return 'skip';
        const counts = { permanent: 0, round: 0, attached: 0, other: 0 };
        const deadRound = new Map();   // 单位名 -> 残留 round 条数
        const aliveRoundUnits = new Set();
        let alive = 0, dead = 0;
        for (const u of tail) {
            if (!u || !u._mods) continue;
            if (u.alive) alive++; else dead++;
            for (const stat of ['atk', 'def', 'maxHp']) {
                for (const m of (u._mods[stat] || [])) {
                    if (!m) continue;
                    if (TTLS.includes(m.ttl)) counts[m.ttl]++;
                    else counts.other++;
                    if (m.ttl === 'round') {
                        if (u.alive) aliveRoundUnits.add(u.name || u.uid);
                        else deadRound.set(u.name || u.uid, (deadRound.get(u.name || u.uid) || 0) + 1);
                    }
                }
            }
        }
        const deadList = [...deadRound.entries()].slice(0, 3).map(e => e[0] + '×' + e[1]).join('、');
        return {
            fail: false,
            observe: '词条过期闭包：存活 ' + alive + ' / 阵亡 ' + dead + ' 单位；ttl 分布 permanent=' + counts.permanent
                + '、round=' + counts.round + '、attached=' + counts.attached + (counts.other ? '、非法=' + counts.other : '')
                + '；round 条目落在存活单位 ' + aliveRoundUnits.size + ' 人'
                + (deadRound.size ? '；⚠️ 阵亡单位残留 round ' + deadRound.size + ' 人（' + deadList + '），清理点只清存活（core/210:56）' : '')
        };
    }
};
