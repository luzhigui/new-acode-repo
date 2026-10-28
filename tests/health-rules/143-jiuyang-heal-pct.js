// V6.3.1 | 2026-10-28 | ~11KB | gap<=0（hp>maxHp 异常态）时落地回血夹 0，修 d8a9cea8 后 6 场「缺口为负」假红
// 回归规则：张无忌·九阳神功回复量 = floor(最大生命 × 12%)（V6.1.12 由 10% → 12%；更早 V6.1.8 由 8% → 10%）
//   机制本体（core/15 submitOnHitEffects · healMaxHpPct）：
//       heal = min(floor(unit.maxHp × pct), unit.maxHp - unit.hp)，heal > 0 才推 NINE_YANG_HEAL 事实
//   pct 实际来自 content/200game-data.json 张无忌 mechanics[0].onHitEffects[0].pct（=0.12）——
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
export const VER = 'tests/health-rules/143-jiuyang-heal-pct.js V6.3.1';
import { entryTextsDeep } from '../122health-utils.js';

// V6.1.12 后的现行比例（content/200 张无忌 mechanics healMaxHpPct.pct）
var NINE_YANG_PCT = 0.12;
// V6.1.8~V6.1.11 的上一版比例，用于精确识别"被回退"
var NINE_YANG_PREV_PCT = 0.10;
// V6.1.8 之前的更早比例
var NINE_YANG_OLD_PCT = 0.08;
// 寒毒/玄冥毒抑疗系数：core/01 CONFIG.XUANMING_POISON_HEAL_REDUCE（2026-10-22 起）
var POISON_HEAL_REDUCE = 0.5;

export const rule90 = {
    group: '数值回归',
    name: '张无忌九阳神功回复量(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var n = log ? log.length : 0;
        if (n === 0) return 'skip';

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
                if (!m) continue;
                heals.push({ idx: i, heal: parseFloat(m[1]), hpBefore: parseInt(m[2], 10), hpAfter: parseInt(m[3], 10) });
            }
        }
        if (heals.length === 0) return 'skip'; // 本场没触发九阳（张无忌未上场/未造成伤害），不触发该机制

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

        for (var j = 0; j < heals.length; j++) {
            var h = heals[j];

            // 断言3（无条件）：回复量与血线必须同步
            if (!(h.heal > 0)) {
                return { fail: true, msg: '复发：九阳神功回复量为' + h.heal + '（应 >0，出现非正回复说明 healMaxHpPct 结算异常）' };
            }
            if (Math.abs(h.hpAfter - (h.hpBefore + h.heal)) > 1) {
                return { fail: true, msg: '复发：九阳神功回复+' + h.heal + ' 与血线 ' + h.hpBefore + '→' + h.hpAfter + ' 不一致（回血没写进血量）' };
            }

            // 归因本条目的"当时血上限"：变身前用开局值，变身后用终局值（需单一变身且无其他增益）
            var beforeSwitch = (switchIdx === -1) || (h.idx < switchIdx);
            var maxHpAt = 0;
            if (beforeSwitch) maxHpAt = canUseStart ? startMaxHp : 0;
            else maxHpAt = canCheckPct ? maxHp : 0;
            if (!(maxHpAt > 0)) continue; // 归因不了（多张无忌/变身多次/有额外增益）→ 只保留上面的算术一致性

            // 落地口径（core/15 + core/13 previewHeal）：
            //   原值 raw = floor(当时血上限 × 12%) → 抑疗打折 → 最后夹"血上限缺口"
            var raw = Math.floor(maxHpAt * NINE_YANG_PCT);
            var gap = maxHpAt - h.hpBefore;
            // V6.3.1（d8a9cea8 后冒出的假红）：gap<=0 即 hpBefore >= maxHpAt —— 只可能是
            //   ①hp 越上限（maxHp 下降后未夹取）或 ②maxHpAt 归因偏小（蝶变附身/变身把当时上限抬高）。
            //   两种情形下「百分比回血」都不可测，按「宁漏勿误」跳过百分比比较（上方断言3 血线同步仍无条件跑）。
            if (gap <= 0) continue;
            // 逐档都按引擎口径取整（core/13 出口 Math.floor）：期望值必须是整数，否则与整数 heal
            //   比会凭空多出 0.5~1.5 的偏差（实证 seed=4 stage=1 血上限 122.5 → 旧写法期望 13.5 误报）
            // V6.3.1 口径修正（d8a9cea8 后冒出的假红）：gap<=0（hpBefore > maxHpAt，即 maxHp 下降后
            //   血未夹取，如蝶变附身 maxHp 加成移除）时，min(raw,gap) 为负 ⇒ 旧写法期望恒负（如 -51），
            //   而引擎 heal 受 max(1,...) 下界恒 ≥1 ⇒ 假红。落地回血**定义上不可能为负**，故先夹 0 再取整。
            var clamped = Math.max(0, Math.min(raw, gap));                                       // gap<=0 时落地必为 0
            var expectLanded = Math.floor(clamped);                                              // ① 无抑疗（含被缺口夹小）
            var expectReduced = Math.floor(Math.round(clamped * POISON_HEAL_REDUCE));            // ② 寒毒/玄冥毒抑疗 ×0.5

            if (Math.abs(h.heal - expectLanded) <= 1) continue;   // ① 干净条目 / 被缺口夹取 —— 通过
            if (Math.abs(h.heal - expectReduced) <= 1) continue;  // ② 抑疗打折后的落地值 —— 通过

            // 断言1/2（回退检测）：夹取与抑疗都解释不了，且恰好等于历史比例 → 12% 被回退
            var prevExpect = Math.floor(maxHpAt * NINE_YANG_PREV_PCT);
            var oldExpect = Math.floor(maxHpAt * NINE_YANG_OLD_PCT);
            if (expectLanded - h.heal > 1 && (h.heal === prevExpect || h.heal === oldExpect) && prevExpect !== raw) {
                var pctTxt = (h.heal === prevExpect) ? '×10%' : '×8%';
                // ★ 第 132 轮：本条与下一条曾共用同一指纹「复发：九阳神功回复」，且它俩又是另两条分支指纹的
                //   前缀 ⇒ 四条分支互相抢匹配，分支级判定失效。补独立前缀（只改报错文案，判据一行未动）。
                return { fail: true, msg: '复发：九阳神功回复疑似被回退：' + h.heal + '=floor(血上限' + maxHpAt + pctTxt + ')，疑似 V6.1.12 提高的 12% 被回退（落地应为 ' + expectLanded + '）' };
            }
            // 抑疗信号存在但比例对不上（如截脉 ratio 由 content 决定、本规则取不到）→ 无法归因，不误报
            if (hasHealReduceSignal && h.heal < expectLanded) continue;
            return { fail: true, msg: '复发：九阳神功回复与落地期望不符：' + h.heal + '≠落地期望' + expectLanded + '（当时血上限' + maxHpAt + '×12%=' + raw + '，缺口' + gap + '，抑疗档应为' + expectReduced + '）' };
        }
        return { fail: false };
    }
};
