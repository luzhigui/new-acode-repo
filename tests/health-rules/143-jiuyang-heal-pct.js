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
// 数据来源：单位血上限取 afterA/afterE 中该回复归属单位（healUnitUid）的终局 maxHp；拿不到则同样降级。
//
// V6.1.22 修订（体检迭代第 6 轮）：修恒空转真因 —— 扫错条目层级。
// 【数据契约，2026-09-22 实跑取证，改规则前务必对照】
//   九阳回复条目**不是顶层条目**，而是挂在 `attack-group` 的 `entries` 子条目上：
//     { type:'info', text:'☀️ 九阳神功回复+{heal}，{hpBefore}→{hpAfter}',
//       isHealEntry:true, healAmount:{heal}, healUnitUid:{unit.uid} }
//   产出链：core/15 L164 把 {factType:NINE_YANG_HEAL, factData:{unitName,heal,hpBefore,hpAfter,unitUid}}
//   推入 `data.declarations`（EFFECT_TYPES.HEAL），由 attack-group 收集后经 render/30 L587
//   renderNineYangHealFact 渲染成上述子条目 —— 因此 NINE_YANG_HEAL **从不进 step.log**，
//   回放器的"零产出 factType"直方图会把它误列为数据源缺失（本规则此前据此被错误归因）。
//   旧版只扫顶层 `e.text`，顶层 attack-group 自身没有 text（文本全在子条目）→ 120 场恒 skip，
//   自登记以来一次断言都没跑（假绿），而实际同批次存在 899 条九阳回复子条目。
//   ⚠ `isHealEntry` 是**所有回血类子条目共用**的标记（嗜血吸血/热血奋战/韦一笑吸血/幻影伪装/白骨爪
//     回血都带，render/31 L506），不能单独当九阳判别位；九阳的判别位是文本「九阳神功回复+」
//     （render/30 L588 写死的固定前缀）。归属单位以 healUnitUid 为准，不再靠"扫 isZhang"猜测。
export const VER = 'tests/health-rules/143-jiuyang-heal-pct.js V6.1.22';

// V6.1.12 后的现行比例（content/200 张无忌 mechanics healMaxHpPct.pct，2026-09-22 复核 = 0.12）
var NINE_YANG_PCT = 0.12;
// V6.1.8~V6.1.11 的上一版比例，用于精确识别"被回退"
var NINE_YANG_PREV_PCT = 0.10;
// V6.1.8 之前的更早比例
var NINE_YANG_OLD_PCT = 0.08;

// 收集本场「九阳回复」子条目：顶层 + attack-group 的 entries 两层都收，下标取所属顶层条目序
function collectNineYangHeals(log) {
    var out = [];
    for (var i = 0; i < log.length; i++) {
        var e = log[i];
        if (!e) continue;
        if (Array.isArray(e.entries)) {
            for (var k = 0; k < e.entries.length; k++) {
                var s = e.entries[k];
                if (s && s.isHealEntry === true && typeof s.text === 'string' && s.text.indexOf('九阳神功回复+') !== -1) {
                    out.push({ idx: i, node: s });
                }
            }
        }
        // 顶层兜底：正常链路不会出现，但条目层级若变化不应漏报
        if (e.isHealEntry === true && typeof e.text === 'string' && e.text.indexOf('九阳神功回复+') !== -1) {
            out.push({ idx: i, node: e });
        }
    }
    return out;
}

// 收集本场全部日志文本（顶层 + 子条目），用于"血上限被其它机制临时抬高"的信号识别
function collectAllTexts(log) {
    var out = [];
    for (var i = 0; i < log.length; i++) {
        var e = log[i];
        if (!e) continue;
        if (typeof e.text === 'string') out.push(e.text);
        if (Array.isArray(e.entries)) {
            for (var k = 0; k < e.entries.length; k++) {
                var s = e.entries[k];
                if (s && typeof s.text === 'string') out.push(s.text);
            }
        }
    }
    return out;
}

export const rule90 = {
    group: '数值回归',
    name: '张无忌九阳神功回复量(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var n = log ? log.length : 0;
        if (n === 0) return 'skip';

        // 1. 扫描战报：九阳回血条目 + 会改张无忌血上限的事件（变身/背负/蝶变附身）
        var healEntries = collectNineYangHeals(log);
        if (healEntries.length === 0) return 'skip'; // 本场没触发九阳（张无忌未上场/未造成伤害），不触发该机制

        var texts = collectAllTexts(log);
        var switchIdx = -1, switchCount = 0;
        var hasOtherMaxHpGain = false;
        for (var i = 0; i < n; i++) {
            var e = log[i];
            if (!e) continue;
            var t = typeof e.text === 'string' ? e.text : '';
            if (t.indexOf('张无忌切换近战形态') !== -1) {
                switchCount++;
                if (switchIdx === -1) switchIdx = i;
            }
        }
        for (var ti = 0; ti < texts.length; ti++) {
            var tt = texts[ti];
            // 背负 / 蝶变附身都会给张无忌加血上限（前者 ttl=round 临时，后者附身期间），破坏"终局值=当时值"的推断
            if (tt.indexOf('carry：张无忌') !== -1 && tt.indexOf('血上限+') !== -1) hasOtherMaxHpGain = true;
            if (tt.indexOf('蝶变') !== -1 && tt.indexOf('附身于 张无忌') !== -1 && tt.indexOf('血上限+') !== -1) hasOtherMaxHpGain = true;
        }

        // 2. 终局阵容快照（用于按 healUnitUid 取归属单位的终局血上限；取不到则降级）
        var teams = [afterA, afterE];
        // 真正断言过的条目数：为 0 说明本场虽有九阳文本、但没有一条落在可判定范围内，
        // 此时必须返回 skip（"没断言"）而不是 pass（"断言通过"）—— 后者是假绿。
        var checked = 0;

        for (var j = 0; j < healEntries.length; j++) {
            var node = healEntries[j].node;
            var h = { idx: healEntries[j].idx, heal: node.healAmount, healUnitUid: node.healUnitUid };
            var m = String(node.text).match(/九阳神功回复\+(\d+(?:\.\d+)?)，(\d+)→(\d+)/);
            if (m) {
                h.heal = parseFloat(m[1]);
                h.hpBefore = parseInt(m[2], 10);
                h.hpAfter = parseInt(m[3], 10);
            } else {
                h.hpBefore = null; h.hpAfter = null;
            }
            if (typeof h.heal !== 'number' || !isFinite(h.heal)) continue; // 契约 requiredFields:[unitUid,heal]，缺 heal 无法断言

            // 归属单位：以 healUnitUid 定位（契约字段），非张无忌的九阳回复不属本规则口径
            var owner = null;
            for (var ci = 0; ci < teams.length && !owner; ci++) {
                var arr = teams[ci] || [];
                for (var k = 0; k < arr.length; k++) {
                    if (arr[k] && h.healUnitUid != null && arr[k].uid === h.healUnitUid) { owner = arr[k]; break; }
                }
            }
            if (!owner) continue; // 归属单位不在终局快照里（理论上不该发生）→ 不猜，跳过该条
            if (!(owner.isZhang || (owner.name && owner.name.indexOf('张无忌') !== -1))) continue; // 不是九阳持有者
            checked++;
            var maxHp = owner.maxHp || 0;

            // 严格百分比比较的前提：有终局血上限、有血线文本、本场没有"变身以外的血上限增益"
            var canCheckPct = maxHp > 0 && h.hpBefore !== null && h.hpAfter !== null && !hasOtherMaxHpGain && switchCount <= 1;

            // 断言3（无条件）：回复量与血线必须同步
            if (!(h.heal > 0)) {
                return { fail: true, msg: '复发：九阳神功回复量为' + h.heal + '（应 >0，出现非正回复说明 healMaxHpPct 结算异常）' };
            }
            if (h.hpBefore !== null && Math.abs(h.hpAfter - (h.hpBefore + h.heal)) > 1) {
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
        // 一条都没断言到 → skip（无覆盖），不能报 pass（那是假绿）
        if (checked === 0) return 'skip';
        return { fail: false };
    }
};
