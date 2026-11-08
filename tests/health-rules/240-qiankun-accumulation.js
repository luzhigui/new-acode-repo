// tests/health-rules/240-qiankun-accumulation.js
// 体检观测项：量化「乾坤衍生」单场累积曲线（只报数字，不判红、不设上限）
//
// 为什么只观测：
//   现行实现 ttl='permanent'，无单次上限、无每回合次数上限、无衰减、无清理点；
//   上限/衰减归主代码待定夺，体检侧不替主代码定规矩，只把「一场能叠到多少」量出来。
//   一旦主代码定了上限，再按新口径升判据。
//
// 判据来源（2026-11-08，39 场：种子 1~8 × 关卡 1/3/5/7 + 7 场定向姊妹/韦一笑）：
//   17 场触发、共 267 次、+545 攻；单场最多 55 次 / +106 攻（seed=8 关卡4 强制小昭·姊）；
//   单一受益者最多 15 次；受益者含 周颠（seed=3 关卡5：22 次 / 该场总 +83 攻）、
//   张无忌系明教弟子、反伤弟子与小昭·姊本人。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const VER = 'tests/health-rules/240-qiankun-accumulation.js V1.0.0';

export const rule240 = {
    group: '属性与加成账本',
    name: '乾坤衍生累积曲线量化(观测)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        const fs = facts || (ctx && ctx.facts) || [];
        let count = 0, total = 0, maxOne = 0, roundNo = 0;
        const byTarget = new Map(); // 名字 -> {n, atk}
        const rounds = new Set();
        for (const f of fs) {
            if (!f || !f.factType) continue;
            if (f.factType === FACT_TYPES.ROUND_START) {
                roundNo = (f.data && f.data.round) || roundNo + 1;
                continue;
            }
            if (f.factType !== FACT_TYPES.QIAN_KUN_DERIVED || !f.data) continue;
            const g = typeof f.data.atkGain === 'number' ? f.data.atkGain : 0;
            const name = f.data.atkTargetName || f.data.atkTargetUid || '?';
            count++; total += g; maxOne = Math.max(maxOne, g);
            rounds.add(roundNo);
            const rec = byTarget.get(name) || { n: 0, atk: 0 };
            rec.n++; rec.atk += g;
            byTarget.set(name, rec);
        }
        if (!count) return 'skip';
        const top = [...byTarget.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 2)
            .map(([n, v]) => n + ' ' + v.n + ' 次/' + v.atk + ' 攻').join('、');
        const msg = '乾坤衍生累积：本场 ' + count + ' 次 / +' + total + ' 攻；单次最大 +' + maxOne +
            '；受益 ' + byTarget.size + ' 人（' + top + '）；跨 ' + rounds.size + ' 回合。' +
            '无单次上限、无每回合上限、无衰减、无清理点（待主代码定夺，仅量化不判红）';
        return { fail: false, observe: msg };
    }
};
