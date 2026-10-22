// 回归规则：吸血上限提升数值（WEI_LEECH fact 的 maxHpDelta / newMaxHp）
// 机制源（core/16effect-handlers.js L119-141 LEECH 处理器）：每次吸血把"当前上限→目标上限"增量词条化加
//   永久 maxHp；增量 delta = decl.maxHp - cur（>0 才加），回写 factData.maxHpDelta（core/16 L133）；
//   fact 另带 newMaxHp（绝对目标上限，Math.floor，core/15 L243）。
// 此前该 group 只有对照器（stat-decl LEECH_MAXHP）盯"声明 maxHpDelta==实际 addMod 增量"，规则侧看不到
//   （WEI_LEECH 是数值声明 fact，renderFn 在渲染侧）。2026-10-08 Step 0 后规则能读原始 fact，本规则补
//   "事实本身良好 + 同单位跨次 newMaxHp 单调"层，与对照器互补（对标 162 属性变更的 gross-error 定位）。
// 为什么值得盯（真实回归，非对照器能替）：对照器只验"声明 maxHpDelta==实际 addMod 增量"，本规则验
//   "fact 自身没算坏 + 上限不会倒退/漏写"——即 maxHpDelta 被改坏成 NaN/负、newMaxHp 非整数、或上限被错误回写。
// 复位信号：
//   1) maxHpDelta 非有限数 / <0 → 增量算坏（取整/漏值，会污染永久词条）
//   2) newMaxHp 非有限数 / 非整数 / ≤0 → 目标上限算坏
//   3) 同单位相邻两次吸血：本击 newMaxHp 上升却 maxHpDelta<=0 → 增量漏写
//      （不查"newMaxHp 倒退"：游戏有降上限 debuff，两次吸血间上限会被合法削低）
//   4)（V1.1.0 新增）heal > 0 ⇒ maxHpDelta 必须 === heal：core/15 的 decl.maxHp = unit.maxHp + heal，
//      core/16 的 delta = decl.maxHp − cur ⇒ 无第三方改上限时 delta === heal，不等即"上限抬错量"。
//
// ★ V1.1.0（2026-10-23 第 122 轮）——判据3 的**跨通道归因误报**已修：
//   韦一笑有**两条**独立抬上限通道，V1.0.0 只按 WEI_LEECH（命中吸血）一条串基线：
//     A) 命中吸血 WEI_LEECH      （core/15 → core/16 LEECH 处理器）
//     B) 闪避反击吸血 WEI_DODGE_LEECH（core/12 L491，独立 addMod group 'weiLeech'）
//   实证（seed=7 stage=2）：r13 weiLeech{heal:0,newMaxHp:25,maxHpDelta:0} → r14 weiDodgeLeech{heal:1,
//   newMaxHp:26,maxHpDelta:1} → r14 weiLeech{heal:0,newMaxHp:26,maxHpDelta:0}。上限 25→26 是 **B 通道**
//   抬的，V1.0.0 却拿 A 通道的两次 newMaxHp（25→26）做差，判 A 通道"增量漏写 0" ⇒ 假红 5 场。
//   修法（收紧归因、不放宽）：基线改为**两通道共同维护**，且"漏写"只在**前一击基线同属命中通道**时才成立——
//   期间被闪避通道抬过上限属合法解释；另新增判据4（heal>0 ⇒ maxHpDelta===heal）把覆盖面补回来
//   （这条能抓"上限抬多/抬少"，V1.0.0 完全没验）。
// 误报规避：本场无 WEI_LEECH fact 直接 skip；同单位相邻比对只在确有前序事实时进行；韦一笑为唯一 emit 方。
export const VER = 'tests/health-rules/164-leech-maxhp.js V1.1.0';
import { FACT_TYPES } from '../../infra/56-battle-enums.js';

export const rule111 = {
    group: '数值回归',
    name: '吸血上限提升数值(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!Array.isArray(facts) || facts.length === 0) return 'skip';
        // 基线按「单位 + 抬上限通道」维护：chanHit = 命中吸血通道最后一次写入，chanDodge = 闪避反击通道
        const seqByUid = Object.create(null);
        let checked = 0;
        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f) continue;
            const t = f.factType;
            const d = f.data || {};

            // —— 通道 B：闪避反击吸血也抬永久上限（core/12 L491 addMod group 'weiLeech'）——
            //   它同样写 newMaxHp / maxHpDelta，必须参与基线维护，否则会被判据3 误算成命中通道的"漏写"。
            if (t === FACT_TYPES.WEI_DODGE_LEECH) {
                const buid = d.unitUid || d.unitName || null;
                if (buid && typeof d.newMaxHp === 'number' && isFinite(d.newMaxHp)) {
                    const prevB = seqByUid[buid];
                    // 闪避通道自身也验一次恒等（heal>0 ⇒ 增量 === heal），与判据4 同口径
                    if (typeof d.heal === 'number' && d.heal > 0 && typeof d.maxHpDelta === 'number'
                        && d.maxHpDelta !== d.heal) {
                        return { fail: true, msg: '复发：闪避反击吸血 +' + d.heal + ' 但上限增量 maxHpDelta='
                            + d.maxHpDelta + '（应等量抬升；不等说明上限抬多/抬少）' };
                    }
                    seqByUid[buid] = { newMaxHp: d.newMaxHp, maxHpDelta: d.maxHpDelta, chan: 'dodge' };
                    if (prevB && d.newMaxHp < prevB.newMaxHp) {
                        // 上限被削低是合法机制，只更新基线不报
                        seqByUid[buid] = { newMaxHp: d.newMaxHp, maxHpDelta: d.maxHpDelta, chan: 'dodge' };
                    }
                }
                continue;
            }

            if (t !== FACT_TYPES.WEI_LEECH) continue;

            // 判据1：增量有限且非负
            if (typeof d.maxHpDelta !== 'number' || !isFinite(d.maxHpDelta) || d.maxHpDelta < 0) {
                return { fail: true, msg: '复发：吸血上限 maxHpDelta=' + d.maxHpDelta + '（应为非负有限数）' };
            }
            // 判据2：目标上限为有限正整数
            if (typeof d.newMaxHp !== 'number' || !isFinite(d.newMaxHp) || !Number.isInteger(d.newMaxHp) || d.newMaxHp <= 0) {
                return { fail: true, msg: '复发：吸血上限 newMaxHp=' + d.newMaxHp + '（应为正整数目标上限）' };
            }
            // 判据4（V1.1.0）：上限抬升量必须等于本次落地吸血量 heal
            //   core/15 L243 decl.maxHp = unit.maxHp + heal；core/16 L124 delta = decl.maxHp − cur
            //   ⇒ 无第三方改上限时 delta === heal。不等 = 上限抬多/抬少（或增量字段被别处覆盖）。
            if (typeof d.heal === 'number' && d.heal > 0 && d.maxHpDelta !== d.heal) {
                return { fail: true, msg: '复发：吸血上限 heal=+' + d.heal + ' 但 maxHpDelta=' + d.maxHpDelta
                    + '（core/15 decl.maxHp=maxHp+heal、core/16 delta=decl.maxHp−cur，二者应相等；'
                    + '不等说明上限抬多/抬少或增量被第三方污染）' };
            }
            // 判据3：同单位相邻漏写（韦一笑为唯一 emit 方）。
            //   ⚠️ 不查"newMaxHp 倒退"：游戏存在降低最大生命机制（削减/降上限 debuff），两次吸血之间
            //     单位上限会被合法削低，newMaxHp 下降是真实现象（对照器 stat-decl LEECH_MAXHP 偏差恒 0 已证数值无误）。
            //     唯一不可能为假的矛盾 = 本击上限上升（newMaxHp>前序）却 maxHpDelta<=0（增量漏写）：
            //     因 delta = 本击 newMaxHp_raw − 本击前 cur，而 cur ≤ 前序 newMaxHp（上限只降不升除非本击），
            //     故 newMaxHp>前序 ⇒ delta>0 ⇒ maxHpDelta>0，二者矛盾即漏写。
            //   ★ 前提修补（V1.1.0）："上限只降不升除非本击"只在**同一通道**内成立。闪避反击通道
            //     （WEI_DODGE_LEECH）会独立抬上限，若前序基线由它写入，本击的上升就有合法解释 ⇒ 不判漏写。
            const uid = d.unitUid || d.unitName || null;
            if (uid) {
                const prev = seqByUid[uid];
                if (prev && prev.chan === 'hit' && d.newMaxHp > prev.newMaxHp && d.maxHpDelta <= 0) {
                    return { fail: true, msg: '复发：吸血上限 newMaxHp 上升(' + prev.newMaxHp + '→' + d.newMaxHp
                        + ') 但 maxHpDelta=' + d.maxHpDelta + '（同一命中通道内增量漏写）' };
                }
                seqByUid[uid] = { newMaxHp: d.newMaxHp, maxHpDelta: d.maxHpDelta, chan: 'hit' };
            }
            checked++;
        }
        if (checked === 0) return 'skip';
        return { fail: false };
    }
};
