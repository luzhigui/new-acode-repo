// 回归规则：吸血上限提升数值（WEI_LEECH fact 的 maxHpDelta / newMaxHp）
// 机制源（core/16effect-handlers.js L119-141 LEECH 处理器）：每次吸血把"当前上限→目标上限"增量词条化加
//   永久 maxHp；增量 delta = decl.maxHp - cur（>0 才加），回写 factData.maxHpDelta（core/16 L133）；
//   fact 另带 newMaxHp（绝对目标上限，Math.floor，core/15 L276）。
// 此前该 group 只有对照器（stat-decl LEECH_MAXHP）盯"声明 maxHpDelta==实际 addMod 增量"，规则侧看不到
//   （WEI_LEECH 是数值声明 fact，renderFn 在渲染侧）。2026-10-08 Step 0 后规则能读原始 fact，本规则补
//   "事实本身良好 + 同单位跨次 newMaxHp 单调"层，与对照器互补（对标 162 属性变更的 gross-error 定位）。
// 为什么值得盯（真实回归，非对照器能替）：对照器只验"声明 maxHpDelta==实际 addMod 增量"，本规则验
//   "fact 自身没算坏 + 上限不会倒退/漏写"——即 maxHpDelta 被改坏成 NaN/负、newMaxHp 非整数、或上限被错误回写。
// 复活信号：
//   1) maxHpDelta 非有限数 / <0 → 增量算坏（取整/漏值，会污染永久词条）
//   2) newMaxHp 非有限数 / 非整数 / ≤0 → 目标上限算坏
//   3) 同单位相邻两次吸血：本击 newMaxHp 上升却 maxHpDelta<=0 → 增量漏写
//      （不查"newMaxHp 倒退"：游戏有降上限 debuff，两次吸血间上限会被合法削低，对照器偏差恒 0 已证非 bug）
// 误报规避：本场无 WEI_LEECH fact 直接 skip；同单位相邻比对只在确有前序事实时进行；韦一笑为唯一 emit 方。
export const VER = 'tests/health-rules/164-leech-maxhp.js V1.0.0';
import { FACT_TYPES } from '../../infra/56-battle-enums.js';

export const rule111 = {
    group: '数值回归',
    name: '吸血上限提升数值(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!Array.isArray(facts) || facts.length === 0) return 'skip';
        const seqByUid = Object.create(null);
        let checked = 0;
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || f.factType !== FACT_TYPES.WEI_LEECH) continue;
            const d = f.data || {};

            // 判据1：增量有限且非负
            if (typeof d.maxHpDelta !== 'number' || !isFinite(d.maxHpDelta) || d.maxHpDelta < 0) {
                return { fail: true, msg: '复发：吸血上限 maxHpDelta=' + d.maxHpDelta + '（应为非负有限数）' };
            }
            // 判据2：目标上限为有限正整数
            if (typeof d.newMaxHp !== 'number' || !isFinite(d.newMaxHp) || !Number.isInteger(d.newMaxHp) || d.newMaxHp <= 0) {
                return { fail: true, msg: '复发：吸血上限 newMaxHp=' + d.newMaxHp + '（应为正整数目标上限）' };
            }
            // 判据3：同单位相邻漏写（韦一笑为唯一 emit 方）。
            //   ⚠️ 不查"newMaxHp 倒退"：游戏存在降低最大生命机制（削减/降上限 debuff），两次吸血之间
            //     单位上限会被合法削低，newMaxHp 下降是真实现象（对照器 stat-decl LEECH_MAXHP 偏差恒 0 已证数值无误）。
            //     唯一不可能为假的矛盾 = 本击上限上升（newMaxHp>前序）却 maxHpDelta<=0（增量漏写）：
            //     因 delta = 本击 newMaxHp_raw − 本击前 cur，而 cur ≤ 前序 newMaxHp（上限只降不升除非本击），
            //     故 newMaxHp>前序 ⇒ delta>0 ⇒ maxHpDelta>0，二者矛盾即漏写。
            const uid = d.unitUid || d.unitName || null;
            if (uid) {
                const prev = seqByUid[uid];
                if (prev && d.newMaxHp > prev.newMaxHp && d.maxHpDelta <= 0) {
                    return { fail: true, msg: '复发：吸血上限 newMaxHp 上升(' + prev.newMaxHp + '→' + d.newMaxHp
                        + ') 但 maxHpDelta=' + d.maxHpDelta + '（增量漏写）' };
                }
                seqByUid[uid] = { newMaxHp: d.newMaxHp, maxHpDelta: d.maxHpDelta };
            }
            checked++;
        }
        if (checked === 0) return 'skip';
        return { fail: false };
    }
};
