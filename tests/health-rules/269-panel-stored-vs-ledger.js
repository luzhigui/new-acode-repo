// tests/health-rules/269-panel-stored-vs-ledger.js
// 体检规则：面板存值 / 基准值 / 账本一致（抓「面板看着变了但 buff 账上没有」）
//
// 数据模型（口径，勿改）：
//   · unit.atk / unit.def 是**基准值**（= state._baseAtk / _baseDef），不是生效值；
//     UI 想显示生效值必须走 getStat。所以「存值 == 基准」是硬约束，存值被别处直写就是绕过账本。
//   · unit.maxHp 是**生效值**（refreshMaxHp 会把 getStat 写回），所以「存值 == getStat」是硬约束。
//   这三条一起构成「面板重算与快照一致性」：任何绕过 addMod 直接改属性、或忘了 refreshMaxHp 的改动，
//   都会在这里露馅 —— 面板数字变了但账本没有对应词条。
//
// 实测（2026-11-08，48 场：种子 1~8 × 关卡 1~6）：0 差异、0 红（此前「818 条 stored-vs-getStat 差异」
// 是拿 atk/def 当生效值比，属口径错误，已按本文件口径修正，未再作为判据）。
import { getStat } from '../../core/214-battle-shared.js';

export const VER = 'tests/health-rules/269-panel-stored-vs-ledger.js V1.0.0';

const EPS = 1e-6;

export const rule269 = {
    group: '属性与加成账本',
    name: '面板存值与账本一致(加成账本)(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE) {
        const tail = [...(afterA || []), ...(afterE || [])];
        if (!tail.some(u => u && u._mods)) return 'skip';
        const bad = [];
        let checked = 0;
        for (const u of tail) {
            if (!u || !u._mods) continue;
            const st = u.state || {};
            checked++;
            if (typeof st._baseAtk === 'number' && typeof u.atk === 'number' && Math.abs(u.atk - st._baseAtk) > EPS) {
                bad.push((u.name || u.uid) + ' atk 存值' + u.atk + ' != 基准' + st._baseAtk + '（疑似绕过账本直写）');
            }
            if (typeof st._baseDef === 'number' && typeof u.def === 'number' && Math.abs(u.def - st._baseDef) > EPS) {
                bad.push((u.name || u.uid) + ' def 存值' + u.def + ' != 基准' + st._baseDef + '（疑似绕过账本直写）');
            }
            if (typeof st._baseMaxHp === 'number' && typeof u.maxHp === 'number') {
                const eff = getStat(u, 'maxHp');
                if (!isFinite(eff) || Math.abs(u.maxHp - eff) > EPS) {
                    bad.push((u.name || u.uid) + ' maxHp 存值' + u.maxHp + ' != getStat' + eff + '（面板上限没跟账本重算）');
                }
            }
        }
        if (bad.length) {
            return { fail: true, msg: '面板存值与账本分裂：' + bad.slice(0, 3).join('；') + (bad.length > 3 ? '（共 ' + bad.length + ' 条）' : '') };
        }
        return { fail: false, msg: '面板存值与账本一致：' + checked + ' 单位，atk/def 存值==基准、maxHp 存值==getStat，0 差异' };
    }
};
