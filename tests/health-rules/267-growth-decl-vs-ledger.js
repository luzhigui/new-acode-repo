// tests/health-rules/267-growth-decl-vs-ledger.js
// 体检规则：成长类「声明 vs 账本」同源对账（谁长了、长多少、落在哪个字段）
//
// 为什么要有这条：
//   每条成长机制都同时做两件事：① addMod 落账（引擎真值）；② push 一条声明 fact（战报/飘字看得到的数字）。
//   两处各算一次时最容易出现「面板看着长了但账本没落」或「账本长了但战报数字是另一套」的分裂。
//   这里把两组数据按 (单位, group, 字段) 求和对比：
//     · 声明侧：RANGED_GROWTH / METEOR_SPLASH_GROWTH / RAGE_ON_HIT / LION_GROW / LION_INSPIRE / KU_LIAN
//     · 账本侧：终局 _mods[stat] 里 group 同名、op='add' 的条目合计
//
// 口径（先量再立规）：
//   · 只核终局仍在队伍数组里的单位（拒马消散等被 splice 出队的单位没有终局账本，声明只计数不判红）；
//   · 只能按 uid 定位的（LION_GROW / LION_INSPIRE）用 uid；其余 fact 只有 unitName，按名字聚合（同名按合计比对）；
//   · 差值容差 1e-6（浮点成长值）。
//
// 实测（2026-11-08，48 场：种子 1~8 × 关卡 1~6）：0 差异、0 红；涉及 rangedGrowth / rageOnHit / lionGrow 等。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const VER = 'tests/health-rules/267-growth-decl-vs-ledger.js V1.0.0';

const EPS = 1e-6;
// fact 自带 uid 的成长组（幼狮/振奋）；其余组 fact 只有 unitName，统一用名字键空间比对
const UID_GROUPS = new Set(['lionGrow', 'lionInspire']);

// fact 解析器：返回 [{ uid?, name?, field, value }]，一条 fact 可产出多条声明
const DECLS = [
    {
        group: 'rangedGrowth', fact: FACT_TYPES.RANGED_GROWTH,
        pick: d => [{ name: d.unitName, field: 'atk', value: d.growth }]
    },
    {
        group: 'meteorSplashGrowth', fact: FACT_TYPES.METEOR_SPLASH_GROWTH,
        pick: d => [{ name: d.unitName, field: 'atk', value: d.growth }]
    },
    {
        group: 'rageOnHit', fact: FACT_TYPES.RAGE_ON_HIT,
        pick: d => [{ name: d.unitName, field: 'atk', value: d.atkDelta }]
    },
    {
        group: 'lionGrow', fact: FACT_TYPES.LION_GROW,
        pick: d => [
            { uid: d.unitUid, name: d.unitName, field: 'atk', value: d.atkDelta },
            { uid: d.unitUid, name: d.unitName, field: 'def', value: d.defDelta },
            { uid: d.unitUid, name: d.unitName, field: 'maxHp', value: d.maxHpDelta }
        ]
    },
    {
        group: 'lionInspire', fact: FACT_TYPES.LION_INSPIRE,
        pick: d => (d.targets || []).map(t => ({ uid: t.uid || t.unitUid, name: t.unitName, field: 'atk', value: t.atkDelta }))
    },
    {
        group: 'kuLian', fact: FACT_TYPES.KU_LIAN,
        pick: d => (d.targets || []).flatMap(t => [
            { name: t.unitName, field: 'atk', value: t.atkDelta },
            { name: t.unitName, field: 'def', value: t.defDelta },
            { name: t.unitName, field: 'maxHp', value: t.maxHpDelta }
        ])
    }
];

export const rule267 = {
    group: '属性与加成账本',
    name: '成长声明与账本同源(加成账本)(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const tail = [...(afterA || []), ...(afterE || [])];
        if (!tail.some(u => u && u._mods)) return 'skip';
        const presentUids = new Set(tail.filter(u => u && u.uid).map(u => u.uid));
        const presentNames = new Set(tail.filter(u => u && u.name).map(u => u.name));

        // 账本侧：按各组成长 fact 的键空间聚合（uid 组用 uid，其余用名字）
        const led = new Map();
        for (const u of tail) {
            if (!u || !u._mods) continue;
            for (const stat of ['atk', 'def', 'maxHp']) {
                for (const m of (u._mods[stat] || [])) {
                    if (!m || m.op === 'mul' || typeof m.value !== 'number' || !isFinite(m.value)) continue;
                    const who = UID_GROUPS.has(m.group) ? u.uid : u.name;
                    if (who == null) continue;
                    const k = who + '|' + m.group + '|' + stat;
                    led.set(k, (led.get(k) || 0) + m.value);
                }
            }
        }

        const decl = new Map();           // 与账本同一键空间
        const names = new Map();          // uid -> name，用于失败消息可读
        let offRoster = 0, hitFacts = 0;
        for (const f of (facts || [])) {
            if (!f || !f.data) continue;
            const spec = DECLS.find(s => s.fact === f.factType);
            if (!spec) continue;
            hitFacts++;
            const byUid = UID_GROUPS.has(spec.group);
            let rows;
            try { rows = spec.pick(f.data) || []; } catch (e) { rows = []; }
            for (const r of rows) {
                if (typeof r.value !== 'number' || !isFinite(r.value)) continue;
                const who = byUid ? r.uid : r.name;
                if (who == null) continue;
                const onRoster = byUid ? presentUids.has(who) : presentNames.has(who);
                if (!onRoster) { offRoster++; continue; }
                if (r.uid != null && r.name) names.set(r.uid, r.name);
                const k = who + '|' + spec.group + '|' + r.field;
                decl.set(k, (decl.get(k) || 0) + r.value);
            }
        }
        if (!hitFacts) return 'skip';

        const bad = [];
        for (const [k, d] of decl) {
            const l = led.get(k) || 0;
            if (Math.abs(d - l) > EPS) {
                const [who, group, field] = k.split('|');
                bad.push((names.get(who) || who) + '/' + group + '/' + field + ' 声明' + d + ' vs 账本' + l);
            }
        }
        // 反向：账本有成长条目但没有任何声明（「只落账不报」）
        for (const [k, l] of led) {
            const [, group] = k.split('|');
            if (!DECLS.some(s => s.group === group)) continue;
            if (!decl.has(k)) {
                const [who, g, field] = k.split('|');
                bad.push((names.get(who) || who) + '/' + g + '/' + field + ' 账本' + l + ' 但无声明');
            }
        }

        if (bad.length) {
            return { fail: true, msg: '成长声明与账本不同源：' + bad.slice(0, 3).join('；') + (bad.length > 3 ? '（共 ' + bad.length + ' 条）' : '') };
        }
        return {
            fail: false,
            msg: '成长声明与账本同源：声明 ' + decl.size + ' 组 / 账本 ' + led.size + ' 组，0 差异'
                + (offRoster ? '；离场单位声明 ' + offRoster + ' 条不判' : '')
        };
    }
};
