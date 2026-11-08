// tests/health-rules/239-qiankun-decl-vs-ledger.js
// 体检规则：小昭·姊「乾坤衍生」的声明加攻 == 账本 qianKunDerived 实际落地加攻
//
// 机制（2026-11-08 取证）：
//   atkGain = max(1, floor(def / (defToAtk * 100)))，defToAtk:0.12 → floor(def/12)；
//   每命中一次就按该式给「受益单位」加攻：ttl='permanent'，无单次上限、无每回合次数上限、
//   无衰减、无清理点。张无忌活着时完全不触发（小昭·姊走附身路线）。
//   声明口 = QIAN_KUN_DERIVED 事实（atkTargetUid / atkGain），落地口 = unit._mods.atk 里
//   group='qianKunDerived' 的 add 词条。两边必须同源，否则战报写的加攻不是结算里生效的加攻。
//
// 判据来源（2026-11-08，39 场：种子 1~8 × 关卡 1/3/5/7 + 7 场定向姊妹/韦一笑）：
//   17 场触发、共 267 次、声明合计 +545 攻；逐 uid 对账 0 差异 —— 0 误报，升硬判据。
//
// 本规则只判「声明 == 落地」，不判断数值是否合理；上限/衰减/清理点归主代码待定夺（见 240 观测）。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const VER = 'tests/health-rules/239-qiankun-decl-vs-ledger.js V1.0.0';

export const rule239 = {
    group: '属性与加成账本',
    name: '乾坤衍生声明与账本落地同源(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = facts || (ctx && ctx.facts) || [];
        const units = [...(afterA || []), ...(afterE || [])];
        if (!units.some(u => u && u._mods)) return 'skip';

        const decl = new Map(); // 受益 uid -> 声明加攻合计
        let count = 0;
        for (const f of fs) {
            if (!f || f.factType !== FACT_TYPES.QIAN_KUN_DERIVED || !f.data) continue;
            const d = f.data;
            if (!d.atkTargetUid) continue;
            count++;
            decl.set(String(d.atkTargetUid), (decl.get(String(d.atkTargetUid)) || 0) + (typeof d.atkGain === 'number' ? d.atkGain : 0));
        }

        const led = new Map(); // 受益 uid -> 账本加攻合计
        for (const u of units) {
            if (!u || !u._mods) continue;
            for (const m of (u._mods['atk'] || [])) {
                if (!m || m.group !== 'qianKunDerived' || m.op !== 'add') continue;
                led.set(String(u.uid), (led.get(String(u.uid)) || 0) + (m.value || 0));
            }
        }

        if (!count && !led.size) return 'skip';
        const bad = [];
        for (const k of new Set([...decl.keys(), ...led.keys()])) {
            const d = decl.get(k) || 0, l = led.get(k) || 0;
            if (Math.abs(d - l) > 1e-6) bad.push(k + ' 声明' + d + ' vs 账本' + l);
        }
        if (bad.length) {
            return { fail: true, msg: '乾坤衍生声明与账本不同源：' + bad.slice(0, 3).join('；') + (bad.length > 3 ? '（共 ' + bad.length + ' 条）' : '') };
        }
        return { fail: false, msg: '乾坤衍生声明与账本同源：' + count + ' 次触发、' + decl.size + ' 名受益者，0 差异' };
    }
};
