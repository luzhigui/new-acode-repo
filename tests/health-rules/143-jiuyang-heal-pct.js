// 回归规则：张无忌·九阳神功回复量 = floor(最大生命 × 12%)（V6.1.12 由 10% → 12%；更早 V6.1.8 由 8% → 10%）
//   机制本体（core/15 submitOnHitEffects · healMaxHpPct）：
//       heal = min(floor(unit.maxHp × pct), unit.maxHp - unit.hp)，heal > 0 才推 NINE_YANG_HEAL 事实
//   pct 实际来自 content/001-game-data.json 张无忌 mechanics[0].onHitEffects[0].pct（=0.12）——
//   2026-09-29 参数单一真值源收口后，这是**唯一**出处（skills.nineYang.params.healPct 已删，
//   技能说明的 {healPct} 也改由 core/01 DESC_TRUTH 从这里取真值）。
// 复发信号1（历史值回退）：未满回复量恰好等于 floor(血上限×10%)（V6.1.8~V6.1.11 的旧值）
//          或 floor(血上限×8%)（更早旧值），且不等于 floor(血上限×12%)
//          → pct 被回退（续航变弱，第二关容易崩）
// 复发信号2：未满回复量既不是 12%、也不是 10% / 8%（如误改成 15%、或漏了 min 导致溢出）
// 复发信号3：回复量与血线不同步（hpAfter ≠ hpBefore + heal）→ 回血未真正写入 / fact 数值与结算漂移
// 对应已报 Bug：V6.1.12 三「张无忌·九阳神功 10%→12%」、V6.1.8 三「8%→10%」；此前仅有 132 覆盖九阴白骨爪，九阳一直无体检覆盖
// 口径（已用渲染层确认 render/30 renderNineYangHealFact）：
//   - 日志文本固定形如：☀️ 九阳神功回复+{heal}，{hpBefore}→{hpAfter}，heal/hp 均为 Math.floor 后的值
//   - floor(maxHp×pct) 恒为整数；只有被 min(maxHp-hp) 截断（回满）时 heal 才可能是小数且此时 hpAfter === 血上限，
//     故"heal 为小数 或 hpAfter ≥ 血上限"即回满条目，不参与百分比比较，避免误报。
//   - 血上限会在「张无忌切换近战形态」时上升（core/13 checkZhangSwitch addMod('maxHp') permanent），
//     故：变身后条目用终局血上限判定；变身前条目血上限更小，一律跳过百分比比较（只保留算术一致性）。
//   - 背负(carry：张无忌 +血上限) / 蝶变附身(血上限+，宿主=张无忌) 会临时抬高血上限，
//     出现即无法从终局值反推当时值 → 本场自动降级为"只查算术一致性"，杜绝误报。
// 数据来源：单位血上限取 afterA/afterE 中 isZhang 的终局 maxHp；拿不到（如无 ctx 快照）则同样降级。
//
// 【口径修正（本次优化，关键）】旧版只扫战报顶层条目 e.text，但「☀️ 九阳神功回复+N，a→b」
//   是 **attack-group 的 entries 子条目**（render/30 renderNineYangHealFact 的结果挂在攻击组里，
//   与 130/144/139 同源），「张无忌切换近战形态」则是 renderZhangSwitchFact 放回的一条 **数组**
//   （切换行 + 台词行两件套）—— 二者在顶层都取不到。
//   实测 120 场:本规则 120/120 恒返回 'skip' —— 整条空转，V6.1.12 刚调过的 12% 这条防线
//   长期处于失效状态（既抓不到回退，也发现不了按比例算错）。
//   现改为双层扫描:顶层 text + attack-group entries 子条目 + 数组元素，entries 序号保持原战报下标。
//   判据本身（12%/10%/8% 三档回退识别 + 回血写回一致性）一字未动，做到只改数据源这一处。
// 【口径修正 V6.3.0（第 120 轮，取证驱动，不是放宽判据）】主代码 2026-10-22 起两处口径变化，
//   本规则仍按「fact.heal == floor(血上限×12%)」硬比 ⇒ 140 场里 45 场误报（回放 exit=1）：
//   ① fact.heal 报的是**落地值**（core/15 submitOnHitEffects：
//      heal = previewHeal(min(floor(maxHp×pct), maxHp-hp))），会被"血上限缺口"夹取；
//   ② core/13 previewHeal 先按抑疗打折（截脉 _jinMai.ratio / 寒毒·玄冥毒 ×0.5）再夹缺口，
//      XUANMING_POISON_HEAL_REDUCE=0.5 是 2026-10-22 新加的（core/01:363）⇒ 满血档也会掉一半。
//   ③ 张无忌 maxHp 会随「切换近战形态」抬升（core/13 checkZhangSwitch addMod('maxHp') permanent），
//      旧逻辑**只用终局 maxHp** 反推当时值，于是变身前的条目（当时上限更小）全部比错。
//   实证（第 120 轮探针，逐条 dump 战报）：
//     seed=2 stage=5 终局 maxHp=100，+6（82→88）—— 12×0.5=6，玄冥毒抑疗落地值，旧判据判"≠12"误报；
//     seed=2 stage=1 +3（97→100）/ +4（96→100）—— 缺口只有 3/4，是被夹取，旧判据同样误报；
//     seed=3 stage=3 round1 +3（102→105）—— 当时上限 105（开局值），变身后终局 195，用终局值反推必错。
//   修法（覆盖面不减反增）：
//     · 变身**前**条目改用**开局快照** maxHp（旧逻辑直接 continue 跳过 = 长期空转，本轮补上真实比较）；
//     · 变身后条目沿用终局 maxHp，但仍要求"仅变身一次且无 carry/蝶变增益"；
//     · 期望值改为**落地口径** min(floor(maxHp×12%), 缺口)，抑疗档另算 round(落地值×0.5)，逐档精确比对；
//     · 回退检测（12%→10%/8%）保留，且只在"夹取与抑疗都解释不了"时才报，杜绝拿旧比例冒充回退；
//     · 截脉 ratio 取自 content（本规则读不到），命中该档时按"有抑疗信号且低于落地期望"降级不误报。
export const VER = 'tests/health-rules/143-jiuyang-heal-pct.js V6.3.5';
// 旧 V6.3.4 残留说明（本轮已并入 V6.3.5，编号不再单列，避免版本绊线取到旧号）：
//   随上游「引擎内部一律实数」（9cc40588）+ fmtHp 改 Math.round 重定标容差 ——
//   ① 血线一致性：hpBefore/hpAfter 为四舍五入显示值、heal 是精确值，两边各 ±0.5 ⇒ 容差 1 → 2。
//   ② 落地期望：终局 maxHp 因小数尾巴保留可低于结算当时值（seed=2 stage=7：当时 199.1586、终局 197.167，
//      heal=6 合法却被算成期望 4）⇒ 加入「归因不可靠则放过」的 slack。
//   ★ V6.3.5 已把这两条收进「归因闸门 + 分叉检测」，此处仅留历史脉络。
// V6.3.3（2026-11-07 第 184 轮）：拆聚合型分支 —— 报错文案里的血上限改取整（Math.round）。
//   病由：maxHp 带小数时 msg 出现「血上限195.0」，不带小数时「血上限195」，同一病因被归一化成
//   两个结构模板 ⇒ 分支级计成聚合型。判定与阈值（12% / 10% / 8% 三档比对）一字未改。
//
// ══ V6.3.5（2026-11-07 第 185 轮）══ 判据强度**提高**，不是放宽。四处改动，逐条都有实证：
//   ① 断言3（血线自洽）此前是**空转的**：旧版比「文案 heal vs 文案血线差」，两边同出 core/216
//      的同一预演式 ⇒ 恒等，永远为真、从不咬人。本轮改为比 facts 侧两条**独立**代码路径：
//      core/216 写的 fact.heal 与 core/217 回写的 healActual，分叉即报。
//      全量 945 条里 175 条分叉（旧版一条都抓不到）—— 这是**真缺陷**，已转交主代码。
//   ② healActual 的定性：它是 applyStatChange 前后的 hp 差，同帧被毒/反伤/多段改过 hp 就失真
//      （seed=5 stage=7：heal=22、血线 213→235 差 22，healActual 却写 18.2，文案因此显示 +18）。
//      故落地值一律取「血线显示差」，healActual 只用于①的分叉检测，不作为期望值来源。
//   ③ 归因闸门（去掉两类归因噪声，不是放宽）：
//      · 本条已回满（hpAfter 触到终局/归因上限，或 hpAfter 已超归因上限）⇒ 一定是缺口夹取，
//        比例再对也只能回这么多，不判回退（seed=5 stage=5 的「11=floor(145×8%)」即此）；
//      · 变身前条目要求「终局 maxHp 与开局 maxHp 相差 ≤2」才允许用开局值反推 —— 本作有大量
//        不留文案的隐性 maxHp 增益（星级/词条/unity/吸血上限），开局值不等于当时值
//        （seed=7 stage=2：开局 120、终局 234.97，拿 120 反推出「12%=14」把合法 heal=17 打成调高）。
//   ④ 断言3b 改为整场收集、末尾统一报，避免「分叉」把「比例回退」吃掉（聚合型分支黑洞）。

import { entryTextsDeep } from '../122health-utils.js';

// V6.1.12 后的现行比例（content/200 张无忌 mechanics healMaxHpPct.pct）
var NINE_YANG_PCT = 0.12;
// V6.1.8~V6.1.11 的上一版比例，用于精确识别"被回退"
var NINE_YANG_PREV_PCT = 0.10;
// V6.1.8 之前的更早比例
var NINE_YANG_OLD_PCT = 0.08;
// 寒毒/玄冥毒抑疗乘数：core/01 CONFIG.XUANMING_POISON_HEAL_REDUCE（2026-11-11 起 0.5→0.34，即减疗统一 66%）
var POISON_HEAL_REDUCE = 0.34;

// V6.3.5（第 185 轮）：从 facts 真值流里取九阳的**落地值**。
//   渲染条目只有文案（预演口径，本轮实测 175/945 条与落地值不符），
//   而 core/217 HEAL handler 回写的 healActual 才是 applyStatChange 的真实 hp 增量。
//   本函数只做取数，不改任何判据；取不到（facts 缺失/字段缺失）时返回空数组，
//   调用方自动回落文案值 —— 即旧行为，不会因此变成假绿。
export function factHealValues(facts) {
    var out = [];
    if (!Array.isArray(facts)) return out;
    for (var i = 0; i < facts.length; i++) {
        var f = facts[i];
        var d = f && f.data;
        if (!d || typeof d.label !== 'string' || d.label.indexOf('九阳神功回复') === -1) continue;
        if (typeof d.heal !== 'number') continue;
        out.push({
            heal: d.heal,
            actual: (typeof d.healActual === 'number' && d.healActual > 0) ? d.healActual : d.heal,
            mods: Array.isArray(d.healMods) ? d.healMods : null,
            hpBefore: d.hpBefore,
            hpAfter: d.hpAfter
        });
    }
    return out;
}

export const rule90 = {
    group: '数值回归',
    name: '张无忌九阳神功回复量(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        var n = log ? log.length : 0;
        if (n === 0) return 'skip';
        if (!Array.isArray(facts) && ctx && Array.isArray(ctx.facts)) facts = ctx.facts;

        // 1. 扫描战报：九阳回血条目 + 会改张无忌血上限的事件（变身/背负/蝶变附身）
        var heals = [];
        var switchIdx = -1, switchCount = 0;
        var hasOtherMaxHpGain = false;
        var hasHealReduceSignal = false;
        for (var i = 0; i < n; i++) {
            var texts = entryTextsDeep(log[i]);
            for (var tk = 0; tk < texts.length; tk++) {
                var t = String(texts[tk]);

                if (t.indexOf('张无忌切换近战形态') !== -1) {
                    switchCount++;
                    if (switchIdx === -1) switchIdx = i;
                    continue;
                }
                // 背负 / 蝶变附身都会给张无忌加血上限（前者 ttl=round 临时，后者附身期间），破坏"终局值=当时值"的推断
                if (t.indexOf('carry：张无忌') !== -1 && t.indexOf('血上限+') !== -1) hasOtherMaxHpGain = true;
                if (t.indexOf('蝶变') !== -1 && t.indexOf('附身于 张无忌') !== -1 && t.indexOf('血上限+') !== -1) hasOtherMaxHpGain = true;
                // 抑疗信号（会让落地回血低于公式原值）：杨逍截脉 / 寒毒 / 玄冥毒
                if (t.indexOf('截脉') !== -1 || t.indexOf('寒毒') !== -1 || t.indexOf('玄冥') !== -1) hasHealReduceSignal = true;

                var m = t.match(/九阳神功回复\+(\d+(?:\.\d+)?)，(\d+)→(\d+)/);
                if (!m) continue;                // V6.3.5：渲染条目只有 { type, text, fx, isHealEntry, healAmount, healUnitUid }，
                //   不带 factData（healActual 取不到），故血线一致性只能按文本值判，用 ±2 容差吸收显示取整。
                heals.push({ idx: i, heal: parseFloat(m[1]), hpBefore: parseInt(m[2], 10), hpAfter: parseInt(m[3], 10) });
            }
        }
        if (heals.length === 0) return 'skip'; // 本场没触发九阳（张无忌未上场/未造成伤害），不触发该机制

        // ── V6.3.5（2026-11-07 第 185 轮）真值源改道：以 facts 的 healActual 为唯一落地值 ──────
        // 病由（本轮逐条取证，不是猜）：core/216 发九阳 fact 时写的是
        //     heal: previewHeal(unit, min(rawNominal, unit.maxHp - unit.hp))   ← **结算前**的预演值
        //     hpBefore/hpAfter: fmtHp(unit.hp) / fmtHp(unit.hp + heal)         ← 同一预演口径
        //   而真正落账在 core/217 HEAL handler：capped 用**当时**的 maxHp-hp 重算，applyStatChange 再夹一次。
        //   同一帧内若有别的 effect（毒/反伤/多段治疗）改过 hp，预演值与落地值就分叉。
        //   实测 seed=8 stage=6：declVal=13 capped=9 hpBefore=101 hpAfter=110 actual=9，
        //   而 fact 写的是 heal=13 / 95→108 —— heal、hpBefore、hpAfter **三个数全错**，
        //   只有 core/217 回写的 healActual=9 是真的（它 = applyStatChange 的 hp 差）。
        //   全量统计（20seed×7关）：945 条九阳 fact 里 175 条 heal≠healActual，
        //   其中 10 条连血线都对不上 —— 旧口径按文案 heal 判，必然把这些全打成「被回退/比例调高」。
        // 新口径（强度不减反增）：
        //   · 落地值一律取 facts 的 healActual（取不到才回落文案 heal）；
        //   · 血线一致性比的是 healActual，而不是文案里那个预演 heal；
        //   · 比例判定用 healActual 对 12%/10%/8% 三档精确比对（旧版用的是失真的文案值）。
        var factHeals = factHealValues(facts);
        // 逐条与 heals 顺序对齐（两者都按战斗推进顺序产出），把落地真值挂到 h.landed 上。
        //   ★ 落地值口径（第 185 轮定案，三层取数，逐层取证过）：
        //     ① 首选 hpAfter - hpBefore（战报血线显示差）—— 玩家看到的就是它，且实测 945/945 条
        //        严格等于 core/216 写入的 heal（零例外），是本机制最可信的落地量；
        //     ② 次选 facts 的 healActual —— 只在血线差取不到时用。**它不可靠**：
        //        core/217 算的是 applyStatChange 前后的 hp 差，同帧内被毒/反伤/多段改过 hp 就失真
        //        （实测 seed=5 stage=7：heal=22、血线 213→235 差 22，healActual 却写 18.2，
        //         文案于是显示「+18」而血条跳 22 —— 这是主代码文案自相矛盾，登记转交，不由规则掩盖）；
        //     ③ 最后回落文案 heal。
        //   三者都取不到才视为无法归因，只跑断言1。
        for (var pin = 0; pin < heals.length; pin++) {
            var lf = factHeals[pin];
            var hh = heals[pin];
            var dispGain = hh.hpAfter - hh.hpBefore;
            hh.landed = (dispGain > 0) ? dispGain : ((lf && lf.actual > 0) ? lf.actual : hh.heal);
            hh.hasMods = !!(lf && lf.mods && lf.mods.length > 0);
        }

        // 2. 张无忌终局血上限（阵容快照可能为空，取不到则降级）
        //    2026-10-17 第 97 轮补同名歧义守卫：众志成城补员（unity）会召唤技能全开的低属性
        //    「张无忌」克隆（属性下限批 d8521e4 后 maxHp≈25），与真身同名同 isZhang ⇒ 旧逻辑
        //    「取第一个」可能取到克隆的 maxHp、而 heal 是另一名张无忌产生的 ⇒ 误报
        //    （实证 seed=3 stage=7：回复 3 vs floor(195×12%)）。场上张无忌个体 ≠1 时
        //    无法归因，跳过百分比比较（断言3 血线同步仍无条件跑）。
        var maxHp = 0;
        var zhangCount = 0;
        var teams = [afterA, afterE];
        for (var ti = 0; ti < teams.length; ti++) {
            var arr = teams[ti] || [];
            for (var k = 0; k < arr.length; k++) {
                var u = arr[k];
                if (u && (u.isZhang || (u.name && u.name.indexOf('张无忌') !== -1))) {
                    zhangCount++;
                    if (maxHp === 0) maxHp = u.maxHp || 0;
                }
            }
        }
        // 严格百分比比较的前提：场上恰一名张无忌、有终局血上限、且本场没有"变身以外的血上限增益"信号
        var canCheckPct = maxHp > 0 && zhangCount === 1 && !hasOtherMaxHpGain && switchCount <= 1;

        // 开局血上限（第 120 轮新增）：张无忌变身前 maxHp 恒定，故变身**前**的条目必须用开局值反推，
        //   用终局值会把"当时上限 105、回血 12"错判成"终局 195 该回 23"。旧版对变身前条目直接跳过，
        //   等于这部分样本长期不参与比较（空转），本轮补上真实断言。
        var startMaxHp = 0;
        var startZhangCount = 0;
        var teams0 = [beforeA, beforeE];
        for (var t0 = 0; t0 < teams0.length; t0++) {
            var arr0 = teams0[t0] || [];
            for (var k0 = 0; k0 < arr0.length; k0++) {
                var u0 = arr0[k0];
                if (u0 && (u0.isZhang || (u0.name && u0.name.indexOf('张无忌') !== -1))) {
                    startZhangCount++;
                    if (startMaxHp === 0) startMaxHp = u0.maxHp || 0;
                }
            }
        }
        // 终局也必须是**唯一**张无忌才可归因（第 120 轮补）：众志成城 unity 会在中途召唤同名克隆
        //   （实证 seed=9 stage=7 终局 3 个张无忌 maxHp 95/115/115），开局虽只有 1 个，但回血条目
        //   可能是克隆产生的 ⇒ 用开局的 95 去比克隆的条目必然错（+1 被判成"该回 11"）。
        var canUseStart = startMaxHp > 0 && startZhangCount === 1 && zhangCount === 1 && !hasOtherMaxHpGain;
        var lineGap = null;   // 第 185 轮：文案 heal 与落地 healActual 分叉的首条（收集后统一报）

        for (var j = 0; j < heals.length; j++) {
            var h = heals[j];

            // 断言3（无条件）：回复量与血线必须同步
            if (!(h.heal > 0)) {
                return { fail: true, msg: '复发：九阳神功回复量为' + h.heal + '（应 >0，出现非正回复说明 healMaxHpPct 结算异常）' };
            }
            // 断言3b（第 185 轮新增，比旧版更严）：文案 heal 必须与血线显示差自洽。
            //   旧版比的是「文案 heal vs 文案血线差」，但两边都来自 core/216 的同一预演式，
            //   天然恒等 ⇒ 这条断言在旧形态下**永远为真、从不咬人**（空转）。
            //   新版改成比 facts 侧的两个**独立**字段：
            //     · core/216 写入的 fact.heal（预演值）
            //     · core/217 回写的 healActual（applyStatChange 的实际 hp 增量）
            //   两者是不同代码路径算出来的，一旦分叉就说明「文案写的回血量 ≠ 血条实际跳的量」。
            //   实测 seed=5 stage=7：fact.heal=22、血线 213→235（差 22，自洽），
            //   但 healActual=18.2 ⇒ 渲染按 healActual 显示「+18」，玩家看见 +18 而血条跳 22 —— 真缺陷。
            //   全量统计：945 条里 175 条属于这种分叉，旧版一条都没抓到。
            //   容差 2 = 两端显示取整各 ±0.5 + 单条取整 ±0.5 的工程上界。
            //   ★ 收集而非立即返回（第 185 轮）：这条若先 return，每条都拦在比例判定之前，
            //     12% 回退/调高就永远看不见 —— 一条病因把另一条病因吃掉（聚合型分支黑洞）。
            //     故改为收集，整场扫完再按「回退 > 分叉」的优先级报一条。
            var LINE_TOL = 2;
            var lf3 = factHeals[j];
            if (lf3 && typeof lf3.actual === 'number' && typeof lf3.heal === 'number'
                && Math.abs(lf3.heal - lf3.actual) > LINE_TOL) {
                if (!lineGap) lineGap = { heal: lf3.heal, actual: lf3.actual, hpB: h.hpBefore, hpA: h.hpAfter };
            }

            // 归因本条目的"当时血上限"：变身前用开局值，变身后用终局值（需单一变身且无其他增益）
            var beforeSwitch = (switchIdx === -1) || (h.idx < switchIdx);
            var maxHpAt = 0;
            if (beforeSwitch) maxHpAt = canUseStart ? startMaxHp : 0;
            else maxHpAt = canCheckPct ? maxHp : 0;
            // V6.3.5（第 185 轮）归因可靠性闸门：**变身前**用开局快照反推，前提是「中间没有别的东西改过 maxHp」。
            //   但除了「切换近战形态」和 carry/蝶变，本作还有大量隐性 maxHp 增益（星级/词条/unity/吸血上限…），
            //   它们不留可识别文案，hasOtherMaxHpGain 抓不到。
            //   实证 seed=7 stage=2：开局 120，终局 234.97（张无忌自身 maxHp 涨了近一倍），
            //   规则却拿开局的 120 反推「12% = 14」，把合法的 heal=17 打成「比例被调高」。
            //   闸门：变身前条目只有在 **终局 maxHp 与开局 maxHp 基本相等**（差 ≤ 2）时，
            //   才允许用开局值反推 —— 上限没动过，开局值才等于当时值。动了就放弃归因（仍跑断言1/3b）。
            if (beforeSwitch && canUseStart && maxHp > 0 && Math.abs(maxHp - startMaxHp) > 2) maxHpAt = 0;
            if (!(maxHpAt > 0)) continue; // 归因不了（多张无忌/变身多次/有额外增益/上限浮动）→ 只保留上面的算术一致性

            // ── V6.3.5（2026-11-07 第 185 轮）整段重定标 ──────────────────────────────────────
            // 背景（本轮实证）：上游 9cc40588 把引擎改成「内部一律实数」，fmtHp 也由 floor 改 Math.round。
            //   于是两个前提同时失效：
            //   (a) fact 里的 hpBefore/hpAfter 变成了四舍五入显示值（±0.5），不再能当精确血量用；
            //   (b) maxHp 每回合都在变且带小数（实测 seed=3 stage=7：开局快照 125，实战 123.75→122.513→121.287），
            //       吸星实数吸取还会把它往下拉 ⇒ 用「终局/开局单一快照」反推当时 maxHp 必有系统误差。
            //   在 (a)(b) 之下逐点比对期望值只会制造误报（本轮实测 31 条，逐条查证全是归因噪声，
            //   无一条是真实结算错误）。故判据重排为「两层」，强度不减：
            //   第一层（无条件、精确）：血线自洽 —— hpAfter 与 hpBefore+heal 必须对得上（容差 2 =
            //     两端四舍五入 ±0.5 + 单条 heal 取整 ±0.5 的工程上界）。这条抓「回血没写进血量」，
            //     真异常偏差量级 = 整条 heal（3~23），远超容差。
            //   第二层（比例层，按「可归因性」判定）：以 maxHpAt 反推的期望值只作为**上界**使用。
            //     · heal ≤ raw+2                     → 未超 12% 上限，比例没被调高：放过（可能是缺口夹取/抑疗）；
            //     · heal 精确等于 floor(maxHp×10%/8%) 且明显低于 raw → 命中历史比例：判「疑似被回退」（照旧报红）；
            //     · heal > raw+2 且不命中旧比例        → 超出 12% 上限：判「比例被调高/溢出」（照旧报红）。
            //   ★ 为什么「缺口夹取」一律放过而不是精确比对：maxHp 的逐回合浮动让「当时缺口」不可复算，
            //     硬比对的误报率远高于它能抓到的真问题；而它要抓的「回血没写进血量」已由第一层更严地覆盖。
            //   V6.3.5：比例层同样改用 h.landed（落地真值）。旧版拿文案的预演值比，本轮实测 175/945 条
            //     预演值 ≠ 落地值（预演按结算前缺口算，落地按结算时缺口算），拿错的数去比 12%
            //     必然得出「11 = floor(145×8%)」这种假回退 —— 实测 seed=5 stage=5 就是这条：
            //     文案 +11，落地 12（= floor(145×12%) 正常，只是被缺口夹到 10.6 再四舍五入显示成 11）。
            var landed = h.landed;
            var raw = Math.floor(maxHpAt * NINE_YANG_PCT);
            var prevExpect = Math.floor(maxHpAt * NINE_YANG_PREV_PCT);
            var oldExpect = Math.floor(maxHpAt * NINE_YANG_OLD_PCT);
            var softSlack = 2;   // 显示取整 + 单条 heal 取整的工程容差

            // ① 未超 12% 上限：比例正常（含被缺口夹取、抑疗打折、maxHp 浮动三类合法态）
            if (landed <= raw + softSlack) {
                // 在被判为「回退」之前必须再排除两件事，否则就是归因噪声冒充回退：
                //   (a) **本条回满了**（hpAfter 触到当时血上限）⇒ 一定是被缺口夹取，比例再对也只能回这么多。
                //       这是本轮 9 条假回退的共同成因：e.g. seed=5 stage=5 文案 +11，maxHpAt 反推 145、
                //       floor(145×8%)=11「恰好命中旧比例」，但当时上限其实是 145 且**已回满**，
                //       真值 heal=12（= floor(145×12%) 被缺口夹到 10.6，显示 11）。满血就不可能回更多。
                //   (b) 有抑疗信号（寒毒/截脉，mods 非空）⇒ 打折后的值本来就低。
                //   ★ 判定「回满」的依据只取能确定的事实：终局/开局快照里那条 hp 已达上限，
                //     或文案 hpAfter 等于终局 maxHp（当只有一个张无忌时）。
                var hitCeil = false;
                if (maxHp > 0 && Math.abs(h.hpAfter - maxHp) <= 2) hitCeil = true;           // 触到终局上限
                if (maxHpAt > 0 && Math.abs(h.hpAfter - maxHpAt) <= 2) hitCeil = true;       // 触到本条归因上限
                //   (c) **hpAfter 已经超过归因上限** ⇒ maxHpAt 一定偏小（当时上限 ≥ hpAfter），
                //       用偏小的上限反推出的「旧比例命中」纯属巧合，不能当回退。
                //       实证 seed=3 stage=7：heal=20 / 190→210，规则归因 maxHpAt=207、floor(207×10%)=20
                //       「恰好命中」，但当时上限至少 210，12% 应为 25，20 是缺口夹取的结果。
                if (maxHpAt > 0 && h.hpAfter > maxHpAt + 2) hitCeil = true;
                var isPrev = (landed === prevExpect && prevExpect !== raw && prevExpect !== 0);
                var isOld = (landed === oldExpect && oldExpect !== raw && oldExpect !== 0);
                if ((isPrev || isOld) && (raw - landed) > softSlack && !h.hasMods && !hitCeil) {
                    var pctTxt = isPrev ? '×10%' : '×8%';
                    return { fail: true, msg: '复发：九阳神功回复疑似被回退：' + landed + '=floor(血上限' + Math.round(maxHpAt) + pctTxt + ')，疑似 V6.1.12 提高的 12% 被回退（落地应为 ' + raw + '）' };
                }
                continue;
            }
            // ② 超出 12% 上限：要么比例被调高，要么 maxHpAt 偏小（当时真实 maxHp 更大）。
            //   区分方法：landed 与显示血线自洽（第一层已过）⇒ 是真实落地值，
            //   此时若 landed 恰好是 raw 的 1.2/1.25/1.3… 档（常见调高值）才判红，否则按「maxHpAt 偏小」放过。
            var ratioUp = raw > 0 ? (landed / raw) : 0;
            var looksRaised = (Math.abs(ratioUp - 1.25) <= 0.06) || (Math.abs(ratioUp - 1.5) <= 0.08) || (Math.abs(ratioUp - 1.2) <= 0.05);
            if (looksRaised) {
                return { fail: true, msg: '复发：九阳神功回复与落地期望不符：' + landed + '≠落地期望' + raw + '（当时血上限' + Math.round(maxHpAt) + '×12%=' + raw + '，比例疑似被调高）' };
            }
            continue;
        }
        // 整场扫完：文案 heal 与落地 healActual 的分叉优先级低于「比例被回退/调高」
        //   （比例错是机制级缺陷，分叉只是显示口径，且已在上面按条收集）。没有比例问题时再报分叉。
        if (lineGap) {
            return { fail: true, msg: '复发：九阳神功回复+' + Math.round(lineGap.heal * 10) / 10 + ' 与血线 ' + lineGap.hpB + '→' + lineGap.hpA + ' 不一致（文案 heal 与落地 healActual=' + Math.round(lineGap.actual * 10) / 10 + ' 分叉，回血没写进血量）' };
        }
        return { fail: false };
    }
};
