// 回归规则：飘字 fx 数值对账 — 带特效 fx 的战报条目，fx 的 kind 必须被播放器认得、
//   amount 必须是有限正数、且该数值必须在条目正文里出现（数值与文案同源）。
// 复发信号：① fx.kind 不在已知集合 ⇒ 播放器不认 ⇒ 特效静默不播；
//   ② fx.amount 是 NaN / undefined / 非正 ⇒ 飘字数值哑火（数值照算、不报任何错）；
//   ③ fx.amount 在正文里找不到 ⇒ 文案改了特效没跟（或反之），飘字数值与正文对不上。
// 对应已修 Bug（本规则的原型）：飞行再生飘字上线即哑四天（2026-10-06）——锚点文本写「回复+N」、
//   正文渲染成「回复 N 点」，一个空格之差子串永不匹配，飘字回调永不触发，数值正常加、
//   不报任何错，纯静默失效。这类坑靠人眼四天后才逮到，此规则让体检当场报红。
//
export const VER = 'tests/health-rules/158-fact-anchor-align.js V2.0.2';
// V2.0.2（2026-11-07 第 184 轮）：拆聚合型分支（只改「怎么报」，不改判定口径与判定顺序）。
//   病由：五类子病因（fx 项非法 / kind 未知 / amount 非有限 / amount 为负 / 数值不在正文）全 push 进
//   breaks，末尾 slice(0,5).join(' | ') 合成一条 msg ⇒ 一条指纹下挤 6 类结构模板，掉任一类都看不出。
//   今五类各存一格、按原判定顺序命中首因返回（非法 → kind → NaN → 负 → 不同源），并统一用「1 处」
//   计数以固定模板。判定仍是同一组断言、同一 FX_KINDS 白名单、同一 amount 同源形态表。

import { collectNodesGrouped as collectNodes } from '../122health-utils.js';

// 播放器认得的 fx 类型。新增 kind 必须同时改这里与本文件 VER —— 否则新 kind 会被当未知静默丢弃。
// 'def' = 破防飘字（右侧族），播放器 fx/601 dynamicBuffLeft(kind='def') 已实装，此前本清单漏登记 → 假红。
var FX_KINDS = ['heal', 'atk', 'dmg', 'def'];

// amount 在正文里的等价文本形态：原值 / 整数四舍五入 / 一位小数。
// 渲染侧对同一数值可能取 Math.round（如 Math.round(fact.totalHeal)），任一形态命中即算同源，
// 不作过度约束 —— 本规则盯的是「文案与特效彻底对不上」，不是卡渲染取整口径。
function amountTextForms(amount) {
    var forms = [String(amount)];
    var rounded = String(Math.round(amount));
    if (forms.indexOf(rounded) === -1) forms.push(rounded);
    var one = String(Math.round(amount * 10) / 10);
    if (forms.indexOf(one) === -1) forms.push(one);
    return forms;
}

export const rule105 = {
    group: '渲染与特效契约',
    name: '飘字fx数值对账(契约)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var nodes = collectNodes(log || []);
        var fxEntries = 0;
        // ★ 第 184 轮（拆聚合型分支）：5 类子病因各自独立上报（首因返回），不再 slice(0,5).join(' | ')
        //   合并成一条聚合外壳——原先一条指纹下挤了 6 类结构模板，掉其中任何一类都看不出来。
        //   判定口径与顺序一字未改（仍是同一组断言），只改「怎么报」。
        var bBad = null, bKind = null, bNaN = null, bNeg = null, bSync = null;
        for (var i = 0; i < nodes.length; i++) {
            var e = nodes[i] && nodes[i].e;
            if (!e || typeof e !== 'object') continue;
            var fx = e.fx;
            if (!Array.isArray(fx) || fx.length === 0) continue;
            fxEntries++;
            var text = (typeof e.text === 'string') ? e.text : '';
            for (var k = 0; k < fx.length; k++) {
                var item = fx[k];
                if (!item || typeof item !== 'object') {
                    if (!bBad) bBad = 'fx#' + k + ' 非法(空/非对象): ' + text.slice(0, 40);
                    continue;
                }
                // ① kind 合法性：播放器只按已知 kind 分派，写错的 kind 被静默丢弃（特效不播）
                if (FX_KINDS.indexOf(item.kind) === -1) {
                    if (!bKind) bKind = 'fx#' + k + ' kind 未知「' + item.kind + '」(认得: ' + FX_KINDS.join('/') + ')，特效将静默不播: ' + text.slice(0, 50);
                    continue;
                }
                // ② amount 有限正数：NaN / undefined / 0 / 负数 都让飘字哑火（数值照算、不报错）
                var amt = item.amount;
                if (typeof amt !== 'number' || !isFinite(amt)) {
                    if (!bNaN) bNaN = 'fx#' + k + '(' + item.kind + ') amount 非有限数「' + amt + '」，飘字将哑火: ' + text.slice(0, 50);
                    continue;
                }
                //   0 是合法空操作（如「回复0点生命」本就无事发生，不该飘字），不算失效 ⇒ 跳过不报；
                //   负数才是异常（飘字会飘出「-N」），保留为红。
                if (amt === 0) continue;
                if (amt < 0) {
                    if (!bNeg) bNeg = 'fx#' + k + '(' + item.kind + ') amount 为负「' + amt + '」，飘字将飘出负数值: ' + text.slice(0, 50);
                    continue;
                }
                // ③ 同源性（旧「锚文本⊂正文」在新结构下的等价形态）：数值必须在正文里出现
                var forms = amountTextForms(amt);
                var hit = false;
                for (var f = 0; f < forms.length; f++) {
                    if (text.indexOf(forms[f]) !== -1) { hit = true; break; }
                }
                if (!hit) {
                    if (!bSync) bSync = 'fx 数值不在正文（文案与特效不同源，飘字数值将对不上）: ' + text.slice(0, 60);
                }
            }
        }
        if (fxEntries === 0) return 'skip';
        if (bBad) return { fail: true, msg: '飘字 fx 条目非法（特效将静默失效）: ' + bBad };
        if (bKind) return { fail: true, msg: '飘字 fx kind 未知（特效将静默不播）: ' + bKind };
        if (bNaN) return { fail: true, msg: '飘字 fx amount 非有限数（特效将哑火）: ' + bNaN };
        if (bNeg) return { fail: true, msg: '飘字 fx amount 为负（特效将飘负值）: ' + bNeg };
        if (bSync) return { fail: true, msg: '飘字 fx 数值不在正文（不同源）: ' + bSync };
        return { fail: false };
    }
};
