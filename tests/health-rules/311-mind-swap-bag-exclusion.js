// 回归规则：袋中单位不得出现在惑心换位 swaps[]（core/215 shuffleThreeSlots 候选池必须排除 isInBag）。
// 机制源：
//   - modules/325 putInBag 只给目标上 state._untargetable/_stunned；alive=true、无 _pendingDeath、
//     无 _ctrlImmune，仍是「合法」换位候选，但 core/203 L44 明定装袋期间不可位移（与飞天同口径当墙）。
//   - 「装谁」记在施法者 state._inBag.targetUid 上（不是目标身上），故判据必须 isInBag(全场, unit)。
//   - core/215 applyMindControlCore 三条路径同走一个 shuffleThreeSlots：敌方侧换位、己方侧换位、
//     core/210 张三丰 PASS 旁路（不走 eventBus，直接调 applyMindControl_Normal/Sister）。
//   - 出账口：FACT_TYPES.MIND_CONTROL_SWAP 的 data.swaps[] = [{uid,name,fromPos,toPos,...}]。
// 判据（按 fact 发射顺序滚动跟踪袋子）：
//   ① 见 SKILL_ANNOUNCE skillName='布袋' 且 note 含「装进布袋」→ 目标 uid/name 入袋中集合；
//      见 note 含「放出来」（布袋放生/布袋憋死）→ 出集合（跨回合袋也要跟着状态走）。
//   ② 随后每条 MIND_CONTROL_SWAP：任一 swaps[i].uid 命中袋中集合（uid 缺失时回退 name）⇒ 判红。
//   ③ 袋中集合按 uid 为主、name 为辅；同名多个单位按「宁漏勿误」处理（放出即按名撤出）。
// 误报规避：本场既无装袋播报又无惑心换位 → skip；只有其一 → skip（无对照窗口，不凭空判红）。
//   note 取不到目标名、swap 项无 uid 也无 name → 跳过该项，不把解析失败当违规。
// 有牙：把 core/215 的 !isInBag(allUnits, u) 去掉 → 旧代码会把袋中单位洗进 swaps[] → 本规则判红；
//   定向实证见 tests/mind-swap-bag-case.mjs（同一套 fact 喂规则，开/关排除各跑一遍）。
export const VER = 'tests/health-rules/311-mind-swap-bag-exclusion.js V1.0.0';
// V1.0.0（2026-11-17）：新建——袋中单位不得进惑心换位候选池（三条路径全覆盖）。
import { FACT_TYPES } from '../../infra/106-battle-enums.js';
import { plain } from '../122health-utils.js';

// 从布袋播报解析目标：floatUid = putInBag/releaseBag 传入的 target.uid（pushSkillAnnounce 的 extra 原样带回）
function bagTargetOf(f) {
    const d = f && f.data;
    if (!d) return null;
    const note = plain(d.note || '');
    let m = note.match(/把\s*(\S+?)\s*装进布袋/);
    let phase = 'in';
    if (!m) {
        m = note.match(/把\s*(\S+?)\s*放出来/);
        phase = 'out';
    }
    if (!m) return null;
    return { uid: (d.floatUid != null ? d.floatUid : null), name: m[1], phase };
}

export const rule311 = {
    group: '技能效果回归',
    name: '惑心换位排除袋中单位(回归)',
    test: function (ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!Array.isArray(facts) || facts.length === 0) return 'skip';
        const baggedUids = new Set();
        const baggedNames = new Set();
        let sawBagIn = false, sawSwap = false;

        for (let i = 0; i < facts.length; i++) {
            const f = facts[i];
            if (!f || !f.data) continue;

            // ① 袋子开关：在同一条 fact 流上按发射顺序滚动，跨回合袋保持
            if (f.factType === FACT_TYPES.SKILL_ANNOUNCE && f.data.skillName === '布袋') {
                const t = bagTargetOf(f);
                if (!t) continue;
                if (t.phase === 'in') {
                    sawBagIn = true;
                    if (t.uid != null) baggedUids.add(t.uid);
                    if (t.name) baggedNames.add(t.name);
                } else {
                    if (t.uid != null) baggedUids.delete(t.uid);
                    if (t.name) baggedNames.delete(t.name);
                }
                continue;
            }

            // ② 换位出账：swaps[] 中任一单位在该时刻处于袋中 ⇒ 违规
            if (f.factType === FACT_TYPES.MIND_CONTROL_SWAP) {
                const swaps = Array.isArray(f.data.swaps) ? f.data.swaps : [];
                if (swaps.length === 0) continue;
                sawSwap = true;
                for (let k = 0; k < swaps.length; k++) {
                    const s = swaps[k];
                    if (!s) continue;
                    const hitUid = s.uid != null && baggedUids.has(s.uid);
                    const hitName = !hitUid && !!s.name && baggedNames.has(s.name);
                    if (hitUid || hitName) {
                        return {
                            fail: true,
                            msg: '复发：袋中单位 ' + (s.name || s.uid) + ' 出现在 mindControlSwap.swaps[]'
                                + '（装袋期间不可位移；core/215 shuffleThreeSlots 候选池漏 isInBag 过滤，'
                                + '敌方侧/己方侧/张三丰 PASS 旁路同走该候选池）'
                        };
                    }
                }
            }
        }
        if (!sawBagIn || !sawSwap) return 'skip';
        return { fail: false };
    }
};
