// tests/health-rules/241-round-entry-duplicate.js
// 体检规则：同一单位、同一来源、同一属性，不该同时存在两条 ttl='round' 词条
//
// 为什么要有这条：
//   round 词条每回合开头「先清（removeModsByTTL 'round'）再重挂」，所以同一来源同一属性
//   在同一时刻只允许一条。出现两条 = 上一回合的词条没被清掉、新回合又挂了一条，数值直接翻倍。
//
// 取证（2026-11-08，39 场：种子 1~8 × 关卡 1/3/5/7 + 7 场定向）：
//   仅 1 例：seed=3 关卡3 明教弟子3（u2081）。该单位第 6 回合阵亡、第 7 回合被「圣火不熄」原地复活；
//   核心根因（主代码）：round 开始清理只对活着的单位执行（core/210-battle-round.js
//   `if (u.alive) removeModsByTTL(u, 'round')`），阵亡单位的上回合词条（空列光环 atk +2 ×2 条）
//   留到复活后与新挂词条叠加 → 复活当回合攻/防虚增。
//   39 场里其余所有 round 组（圣火令/众志成城/摄魂/光环/承载/固守）均只有 1 条，0 误报，升硬判据。
//   该根因已登记 tests/known-transfers.md，等主代码在复活时补一次 round 清理；规则保持硬红。

export const VER = 'tests/health-rules/241-round-entry-duplicate.js V1.0.0';

export const rule241 = {
    group: '属性与加成账本',
    name: '回合词条同源重复(复活残留)(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE) {
        const units = [...(afterA || []), ...(afterE || [])];
        if (!units.some(u => u && u._mods)) return 'skip';
        const bad = [];
        let scanned = 0;
        for (const u of units) {
            if (!u || !u._mods) continue;
            scanned++;
            const cnt = new Map();
            for (const stat of Object.keys(u._mods)) {
                for (const m of (u._mods[stat] || [])) {
                    if (!m || m.ttl !== 'round') continue;
                    const k = m.group + '|' + (m.source || '?') + '|' + stat;
                    const rec = cnt.get(k) || { n: 0, v: 0 };
                    rec.n++; rec.v += (m.value || 0);
                    cnt.set(k, rec);
                }
            }
            for (const [k, rec] of cnt) {
                if (rec.n > 1) {
                    const [group, source, stat] = k.split('|');
                    bad.push((u.name || u.uid) + (u.alive ? '' : '(已阵亡)') + ' ' + group + '/' + source + '/' + stat + ' ×' + rec.n + ' 合计' + rec.v);
                }
            }
        }
        if (bad.length) {
            return { fail: true, msg: '回合词条同源重复：' + bad.slice(0, 3).join('；') + (bad.length > 3 ? '（共 ' + bad.length + ' 条）' : '') + ' | 疑因阵亡跳过 round 清理、复活后叠加（待主代码修）' };
        }
        return { fail: false, msg: '回合词条无同源重复：扫描 ' + scanned + ' 个单位，round 词条每来源每属性最多 1 条' };
    }
};
