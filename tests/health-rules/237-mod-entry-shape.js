// tests/health-rules/237-mod-entry-shape.js
// 体检规则：加成词条形态自洽（属性账本里每一条都必须带齐「谁能清、怎么算、归哪组」）
//
// 为什么要有这条：
//   clearRoundEntries / removeModsByTTL 只按 ttl 过滤；addMod 少传 ttl = 这条词条既不属于
//   permanent 也不属于 round/attached，任何清理点都碰不到它，等于永久漂在账本上。
//   同理 op/group/source/value 缺一，账本就再也对不上「声明 ↔ 落地」这一层。
//
// 判据来源（2026-11-08，39 场：种子 1~8 × 关卡 1/3/5/7 + 7 场定向姊妹/韦一笑）：
//   命中 20 条，全部是 modules/328-elite-mingjiao-yintianzheng.js 两处 addMod 少传 ttl：
//   laoDangYiZhuang（老当益壮，殷天正 L92/L93）与 yingWangWeiYa（鹰王威压，空性/空见/灭绝/
//   何太冲/宋青书 L34/L35）。其余 ttl/op/group/source/value
//   全部合法 —— 0 误报，升硬判据。两处真问题已登记 tests/known-transfers.md，等主代码补 ttl；
//   本规则保持硬红，直到主代码修好（不许为维绿加白名单）。

// 第 203 轮：属性键清单收口为唯一来源（原为本地手抄 const STATS = [...]）
import { STAT_MOD_KEYS as STATS, MOD_TTLS as TTLS } from '../_lib/static-truth-slice.mjs';

// V1.0.2 | 2026-11-10 夜间第 204 轮：「一事一源」收口第三批——TTLS 三档改从公共件 import（原为本地手抄），取值与顺序一字未改，判据未动。
export const VER = 'tests/health-rules/237-mod-entry-shape.js V1.0.2';

const OPS = ['add', 'mul'];

export const rule237 = {
    group: '属性与加成账本',
    name: '词条形态合法性(加成账本)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE) {
        const units = [...(afterA || []), ...(afterE || [])];
        let scanned = 0, entries = 0, bad = [];
        for (const u of units) {
            if (!u || !u._mods || typeof u._mods !== 'object') continue;
            scanned++;
            for (const stat of Object.keys(u._mods)) {
                if (!STATS.includes(stat)) bad.push((u.name || u.uid) + ' 词条落在未登记属性 ' + stat);
                const list = u._mods[stat] || [];
                for (const m of list) {
                    if (!m) { bad.push((u.name || u.uid) + ' ' + stat + ' 空词条'); continue; }
                    entries++;
                    const miss = [];
                    if (!TTLS.includes(m.ttl)) miss.push('ttl=' + String(m.ttl));
                    if (!OPS.includes(m.op)) miss.push('op=' + String(m.op));
                    if (!m.group) miss.push('group空');
                    if (!m.source) miss.push('source空');
                    if (typeof m.value !== 'number' || !isFinite(m.value)) miss.push('value=' + String(m.value));
                    if (miss.length) bad.push((u.name || u.uid) + ' ' + stat + ' group=' + (m.group || '?') + ' ' + miss.join(','));
                }
            }
        }
        if (!scanned) return 'skip';
        if (bad.length) {
            return { fail: true, msg: '加成词条形态违规：' + bad.slice(0, 3).join('；') + (bad.length > 3 ? '（共 ' + bad.length + ' 条）' : '') };
        }
        return { fail: false, msg: '加成词条形态成立：扫描 ' + scanned + ' 个单位、' + entries + ' 条词条，ttl/op/group/source/value 全部合法' };
    }
};
