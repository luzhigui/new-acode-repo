// tests/health-rules/242-stat-closure.js
// 体检规则：属性头尾闭环（开战初值 == getStat；终局 getStat == 基准+词条重算）
//
// 为什么要有这条（对账口径）：
//   战斗里所有属性都走 getStat = max(0, (基准 + Σadd) × (1 + Σmul))。
//   如果账本少条/多条/某条 value 非数，或基准被别的路径悄悄改掉，头尾两端都会露馅：
//   ① 开战无词条时，面板初值必须等于 getStat；
//   ② 终局必须能用「终局基准 + 全部 add 词条 + 全部 mul 词条」原样重算回来。
//   这条就是「初始值 + 所有加成 − 所有减益 == 最终值」的逐单位机器对账（乘率按公式还原，
//   不把 ×1.25 硬拆成加减法）。
//
// 判据来源（2026-11-08，39 场：种子 1~8 × 关卡 1/3/5/7 + 7 场定向）：
//   初值 0 差异；终局重算 0 差异（未加 max(0) 前有 3 条负值，属 getStat 自带的 0 下限，
//   按同口径加下限后归零）。0 误报，升硬判据。
import { getStat } from '../../core/214-battle-shared.js';
// 第 203 轮：属性键清单收口为唯一来源（原为本地手抄 const STATS = [...]）
import { STAT_MOD_KEYS as STATS } from '../_lib/static-truth-slice.mjs';

export const VER = 'tests/health-rules/242-stat-closure.js V1.0.1';

const BASE_KEY = { atk: '_baseAtk', def: '_baseDef', maxHp: '_baseMaxHp' };

export const rule242 = {
    group: '属性与加成账本',
    name: '头尾属性闭环(加成账本)(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE) {
        const head = [...(beforeA || []), ...(beforeE || [])];
        const tail = [...(afterA || []), ...(afterE || [])];
        if (!tail.some(u => u && u._mods)) return 'skip';

        const bad = [];
        let headUnits = 0, tailUnits = 0, entries = 0;
        for (const u of head) {
            if (!u) continue;
            headUnits++;
            for (const stat of STATS) {
                if (typeof u[stat] !== 'number') continue;
                const calc = getStat(u, stat);
                if (!isFinite(calc) || Math.abs(u[stat] - calc) > 1e-6) {
                    bad.push('初值 ' + (u.name || u.uid) + ' ' + stat + ' 面板' + u[stat] + ' vs getStat' + calc);
                }
            }
        }
        for (const u of tail) {
            if (!u || !u._mods) continue;
            tailUnits++;
            for (const stat of STATS) {
                const base = (u.state && u.state[BASE_KEY[stat]] != null) ? u.state[BASE_KEY[stat]] : null;
                if (base == null || typeof base !== 'number') continue;
                let add = 0, mul = 0;
                for (const m of (u._mods[stat] || [])) {
                    if (!m) continue;
                    entries++;
                    if (typeof m.value !== 'number' || !isFinite(m.value)) { add = NaN; break; }
                    if (m.op === 'mul') mul += m.value; else add += m.value;
                }
                const calc = Math.max(0, (base + add) * (1 + mul));
                const g = getStat(u, stat);
                if (!isFinite(calc) || !isFinite(g) || Math.abs(calc - g) > 1e-6) {
                    bad.push('终局 ' + (u.name || u.uid) + ' ' + stat + ' 重算' + calc + ' vs getStat' + g + '（基准' + base + '/加' + add + '/乘' + mul + '）');
                }
            }
        }
        if (bad.length) {
            return { fail: true, msg: '属性头尾不闭环：' + bad.slice(0, 3).join('；') + (bad.length > 3 ? '（共 ' + bad.length + ' 条）' : '') };
        }
        return { fail: false, msg: '属性头尾闭环：初值 ' + headUnits + ' 单位、终局 ' + tailUnits + ' 单位 / ' + entries + ' 条词条，重算与 getStat 0 差异' };
    }
};
