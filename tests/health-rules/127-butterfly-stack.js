// 回归规则：姐姐附身属性叠加 — 修复后基于 _baseAtk/_baseDef 转移，不重复计算 Buff
// 复发信号：附身转移值 atkTransfer/defTransfer != 方向对应基础值份额（含 Buff 加成，回退到直接操作 atk/def）
// 对应已修 Bug：姐姐附身属性叠加（直接操作 atk/def 导致 Buff 重复计算）
//
// 判据口径（V6.1.13，2026-11-08）：引擎 `modules/322-elite-mingjiao-xiaozhao-sister.js` L236-238 明写
//   「引擎一律实数，0.5 比例配奇数面板不再丢 0.5，取整只在显示层」——转移值就是 `_baseDef * 0.5` 的实数。
//   旧版按显示文案解析「防+13/防+14」再 floor 比对，判据过期（奇数面板 13.5 显示取整成 14 → 必假红）。
//   现改为直接读 BUTTERFLY_ATTACH fact 里的实数 atkTransfer/defTransfer，与实数份额比对，容差 1e-6（浮点误差）。
import { getSkillParams } from '../../core/201-config-5v5-test.js';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';

export const VER = 'tests/health-rules/127-butterfly-stack.js V6.1.13';

// 浮点误差容差：纯实数乘法（基数 × 0.5 这类比例），不做任何取整
const EPS = 1e-6;

export const rule74 = {
    group: '精英技能回归',
    name: '姐姐附身叠加(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, factsArg) {
        const facts = Array.isArray(factsArg) ? factsArg : ((ctx && Array.isArray(ctx.facts)) ? ctx.facts : []);
        if (facts.length === 0) return 'skip';

        // 比例从 content 读：与引擎 modules/322 executeAttach 同源（单一真源，content 调参本规则自动跟随）。
        var bp = getSkillParams('小昭', 'butterflyAttach');
        if (!bp || typeof bp.atkRatioRight !== 'number' || typeof bp.defRatioLeft !== 'number') return 'skip';

        var attaches = [];
        for (var k = 0; k < facts.length; k++) {
            var f = facts[k];
            if (f && f.factType === FACT_TYPES.BUTTERFLY_ATTACH) attaches.push(f.data || {});
        }
        if (attaches.length === 0) return 'skip';

        // 姐姐基础值（before 优先，附身发生在战斗开始）；_baseAtk/_baseDef 在 unit.state 下。
        var allBefore = (beforeA || []).concat(beforeE || []);
        var allAfter = (afterA || []).concat(afterE || []);
        var checked = 0;
        for (var n = 0; n < attaches.length; n++) {
            var a = attaches[n];
            var uid = a.sisterUid;
            var sister = null;
            for (var i = 0; i < allBefore.length; i++) {
                var u = allBefore[i];
                if (u && u.isXiaoZhaoSister && (uid === undefined || u.uid === uid)) { sister = u; break; }
            }
            if (!sister) {
                for (var i2 = 0; i2 < allAfter.length; i2++) {
                    var u2 = allAfter[i2];
                    if (u2 && u2.isXiaoZhaoSister && (uid === undefined || u2.uid === uid)) { sister = u2; break; }
                }
            }
            if (!sister) continue;
            var st = sister.state || {};
            var baseAtk = st._baseAtk, baseDef = st._baseDef;
            if (typeof baseAtk !== 'number' || typeof baseDef !== 'number') continue;
            if (typeof a.atkTransfer !== 'number' || typeof a.defTransfer !== 'number') {
                return { fail: true, msg: '附身 fact 缺实数转移值 atkTransfer/defTransfer，无法数值对账' };
            }
            checked++;

            var dirLeft = a.flyDirection === 'left';
            if (dirLeft) {
                // 左向：只转防，攻应为 0
                var expDef = baseDef * bp.defRatioLeft;
                if (Math.abs(a.defTransfer - expDef) > EPS) {
                    return { fail: true, msg: '复发：左向附身防转移值' + a.defTransfer + ' != _baseDef*' + bp.defRatioLeft + '=' + expDef + '，可能直接操作 def 导致 Buff 重复计算' };
                }
                if (Math.abs(a.atkTransfer) > EPS) {
                    return { fail: true, msg: '复发：左向附身攻转移值' + a.atkTransfer + ' 应为0（左向只转防），疑似含 Buff 加成' };
                }
            } else {
                // 右向：只转攻，防应为 0
                var expAtk = baseAtk * bp.atkRatioRight;
                if (Math.abs(a.atkTransfer - expAtk) > EPS) {
                    return { fail: true, msg: '复发：右向附身攻转移值' + a.atkTransfer + ' != _baseAtk*' + bp.atkRatioRight + '=' + expAtk + '，可能直接操作 atk 导致 Buff 重复计算' };
                }
                if (Math.abs(a.defTransfer) > EPS) {
                    return { fail: true, msg: '复发：右向附身防转移值' + a.defTransfer + ' 应为0（右向只转攻），疑似含 Buff 加成' };
                }
            }
        }
        if (checked === 0) return 'skip';
        return { fail: false };
    }
};
