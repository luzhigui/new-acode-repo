// 回归规则：张无忌·九阳神功回复量 = floor(最大生命 × 12%)（V6.1.12 由 10% → 12%；更早 V6.1.8 由 8% → 10%）
//   机制本体（core/15 submitOnHitEffects · healMaxHpPct）：
//       heal = min(floor(unit.maxHp × pct), unit.maxHp - unit.hp)，heal > 0 才推 NINE_YANG_HEAL 事实
//   pct 实际来自 content/200game-data.json 张无忌 mechanics[0].onHitEffects[0].pct（=0.12），
//   另有 skills.nineYang.params.healPct（=12）只用于文案插值，两处须同步。
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
export const VER = 'tests/health-rules/143-jiuyang-heal-pct.js V6.1.11';

// V6.1.12 后的现行比例（content/200 张无忌 mechanics healMaxHpPct.pct）
var NINE_YANG_PCT = 0.12;
// V6.1.8~V6.1.11 的上一版比例，用于精确识别"被回退"
var NINE_YANG_PREV_PCT = 0.10;
// V6.1.8 之前的更早比例
var NINE_YANG_OLD_PCT = 0.08;

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
        for (var i = 0; i < n; i++) {
            var e = log[i];
            if (!e || !e.text) continue;
            var t = String(e.text);

            if (t.indexOf('张无忌切换近战形态') !== -1) {
                switchCount++;
                if (switchIdx === -1) switchIdx = i;
                continue;
            }
            // 背负 / 蝶变附身都会给张无忌加血上限（前者 ttl=round 临时，后者附身期间），破坏"终局值=当时值"的推断
            if (t.indexOf('carry：张无忌') !== -1 && t.indexOf('血上限+') !== -1) hasOtherMaxHpGain = true;
            if (t.indexOf('蝶变') !== -1 && t.indexOf('附身于 张无忌') !== -1 && t.indexOf('血上限+') !== -1) hasOtherMaxHpGain = true;

            var m = t.match(/九阳神功回复\+(\d+(?:\.\d+)?)，(\d+)→(\d+)/);
            if (!m) continue;
            heals.push({ idx: i, heal: parseFloat(m[1]), hpBefore: parseInt(m[2], 10), hpAfter: parseInt(m[3], 10) });
        }
        if (heals.length === 0) return 'skip'; // 本场没触发九阳（张无忌未上场/未造成伤害），不触发该机制

        // 2. 张无忌终局血上限（阵容快照可能为空，取不到则降级）
        var maxHp = 0;
        var teams = [afterA, afterE];
        for (var ti = 0; ti < teams.length; ti++) {
            var arr = teams[ti] || [];
            for (var k = 0; k < arr.length; k++) {
                var u = arr[k];
                if (u && (u.isZhang || (u.name && u.name.indexOf('张无忌') !== -1))) { maxHp = u.maxHp || 0; break; }
            }
            if (maxHp > 0) break;
        }
        // 严格百分比比较的前提：有终局血上限，且本场没有"变身以外的血上限增益"信号
        var canCheckPct = maxHp > 0 && !hasOtherMaxHpGain && switchCount <= 1;

        for (var j = 0; j < heals.length; j++) {
            var h = heals[j];

            // 断言3（无条件）：回复量与血线必须同步
            if (!(h.heal > 0)) {
                return { fail: true, msg: '复发：九阳神功回复量为' + h.heal + '（应 >0，出现非正回复说明 healMaxHpPct 结算异常）' };
            }
            if (Math.abs(h.hpAfter - (h.hpBefore + h.heal)) > 1) {
                return { fail: true, msg: '复发：九阳神功回复+' + h.heal + ' 与血线 ' + h.hpBefore + '→' + h.hpAfter + ' 不一致（回血没写进血量）' };
            }

            if (!canCheckPct) continue;
            // 变身前条目：当时血上限小于终局值，无法反推，跳过百分比比较
            if (switchIdx !== -1 && h.idx < switchIdx) continue;
            // 回满条目：heal 被 min(maxHp-hp) 截断（常带小数），不参与百分比比较
            if (h.hpAfter >= maxHp) continue;

            var expect = Math.floor(maxHp * NINE_YANG_PCT);
            var prevExpect = Math.floor(maxHp * NINE_YANG_PREV_PCT);
            var oldExpect = Math.floor(maxHp * NINE_YANG_OLD_PCT);

            // 断言1/2（回退检测）：恰好等于历史版本比例 → 现行 12% 被回退
            if (h.heal !== expect) {
                if (h.heal === prevExpect && expect !== prevExpect) {
                    return { fail: true, msg: '复发：九阳神功回复' + h.heal + '=floor(血上限' + maxHp + '×10%)，疑似 V6.1.12 提高的 12% 被回退（应为 ' + expect + '）' };
                }
                if (h.heal === oldExpect && expect !== oldExpect) {
                    return { fail: true, msg: '复发：九阳神功回复' + h.heal + '=floor(血上限' + maxHp + '×8%)，疑似回退到更早版本（应为 ' + expect + '）' };
                }
                // 断言3：既不是现行 12%，也不是任何历史值（含文案侧 params.healPct 与 mechanics.pct 不同步、或被改成别的比例）
                return { fail: true, msg: '复发：九阳神功回复' + h.heal + '≠floor(血上限' + maxHp + '×12%=' + expect + ')（healMaxHpPct.pct 被改动？）' };
            }
        }
        return { fail: false };
    }
};
