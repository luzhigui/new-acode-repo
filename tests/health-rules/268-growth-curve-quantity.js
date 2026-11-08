// tests/health-rules/268-growth-curve-quantity.js
// 体检规则：成长曲线量化（每回合 / 每次击杀 / 每次受击）——观察项，只报数字不判红
//
// 为什么要有这条：
//   成长类机制（飞行猎杀、幼狮成长、振奋、莽撞受击、远程成长、流星溅射、苦练、精通…）会随战斗进程
//   累积词条。规则 267 只核「声明与账本同源」，本规则回答「到底长了多少次、长成什么形状、给了谁」，
//   为「要不要给成长设上限」这类主代码待定项提供真实回放数据（本规则不自作主张设限）。
//
// 分类口径（按机制语义，非拍脑袋）：
//   · 每次击杀：flyerKill（飞行·猎杀）
//   · 每次受击：rageOnHit（胖远桥·莽撞）
//   · 每回合/周期性：lionGrow（幼狮成长，回合开始）、lionInspire（振奋）、spiderMastery（精通）、
//     kuLian（苦练）、endlessBreath（生生不息）、duanChuiGrow（断锤三式，每次出手）
//   · 每次命中/溅射：rangedGrowth、meteorSplashGrowth
//
// 实测（2026-11-08，48 场）：逐条打印各成长来源的次数 / 总量 / 峰值 / 受益单位，无红。
export const VER = 'tests/health-rules/268-growth-curve-quantity.js V1.0.0';

const CATS = [
    { group: 'flyerKill', label: '每次击杀' },
    { group: 'rageOnHit', label: '每次受击' },
    { group: 'lionGrow', label: '幼狮成长' },
    { group: 'lionInspire', label: '振奋' },
    { group: 'spiderMastery', label: '精通' },
    { group: 'kuLian', label: '苦练' },
    { group: 'endlessBreath', label: '生生不息' },
    { group: 'duanChuiGrow', label: '断锤三式' },
    { group: 'rangedGrowth', label: '每次命中' },
    { group: 'meteorSplashGrowth', label: '流星溅射' },
    { group: 'absorbGain', label: '吸星大法' },
    { group: 'leechMaxHp', label: '吸血上限' },
    { group: 'weiLeech', label: '韦一笑吸血' }
];

export const rule268 = {
    group: '属性与加成账本',
    name: '成长曲线量化(加成账本)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE) {
        const tail = [...(afterA || []), ...(afterE || [])];
        const groups = new Set(CATS.map(c => c.group));
        const byGroup = new Map();   // group -> { count, sum, peak, units:Set, nonPos:[] }
        for (const u of tail) {
            if (!u || !u._mods) continue;
            for (const stat of ['atk', 'def', 'maxHp']) {
                for (const m of (u._mods[stat] || [])) {
                    if (!m || !groups.has(m.group) || m.op === 'mul') continue;
                    if (typeof m.value !== 'number' || !isFinite(m.value)) continue;
                    let row = byGroup.get(m.group);
                    if (!row) { row = { count: 0, sum: 0, peak: 0, units: new Set(), stats: new Set(), nonPos: [] }; byGroup.set(m.group, row); }
                    row.count++;
                    row.sum += m.value;
                    row.units.add(u.name || u.uid);
                    row.stats.add(stat);
                    if (Math.abs(m.value) > Math.abs(row.peak)) row.peak = m.value;
                    if (m.value <= 0) row.nonPos.push((u.name || u.uid) + '/' + stat + '=' + m.value);
                }
            }
        }
        const parts = [];
        const odd = [];
        for (const c of CATS) {
            const r = byGroup.get(c.group);
            if (!r) continue;
            parts.push(c.label + '(' + c.group + ')：' + r.count + ' 次 / 合计' + +r.sum.toFixed(3)
                + ' / 单条峰值' + r.peak + ' / ' + r.units.size + ' 人 / 字段' + [...r.stats].join(','));
            if (r.nonPos.length) odd.push(r.nonPos.slice(0, 2).join(','));
        }
        if (!parts.length) return 'skip';
        return {
            fail: false,
            observe: '成长曲线：' + parts.join('；') + (odd.length ? '；⚠️ 非正成长条目：' + odd.join('；') + '（只记录，未判红）' : '')
        };
    }
};
