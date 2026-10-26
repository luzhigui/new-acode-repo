// 回归规则：飘字 fx 数值对账 — 带特效 fx 的战报条目，fx 的 kind 必须被播放器认得、
//   amount 必须是有限正数、且该数值必须在条目正文里出现（数值与文案同源）。
// 复发信号：① fx.kind 不在已知集合 ⇒ 播放器不认 ⇒ 特效静默不播；
//   ② fx.amount 是 NaN / undefined / 非正 ⇒ 飘字数值哑火（数值照算、不报任何错）；
//   ③ fx.amount 在正文里找不到 ⇒ 文案改了特效没跟（或反之），飘字数值与正文对不上。
// 对应已修 Bug（本规则的原型）：飞行再生飘字上线即哑四天（2026-10-06）——锚点文本写「回复+N」、
//   正文渲染成「回复 N 点」，一个空格之差子串永不匹配，飘字回调永不触发，数值正常加、
//   不报任何错，纯静默失效。这类坑靠人眼四天后才逮到，此规则让体检当场报红。
//
// V2.0.0 | 2026-10-26 第 139 轮：★ 数据源错位修复 —— 自检自身腐烂第五次应验
//   上游「去锚定化」重构（6360e96c 起）把战报条目上的 `fxAnchors` 整个删掉，
//   改由 `fx: [{ kind: 'heal'|'atk'|'dmg', amount }]` 数据结构驱动特效。
//   本规则仍只读 `e.fxAnchors` ⇒ 140 场里 anchored 恒为 0 ⇒ 返回 'skip' ⇒ **恒空转**，
//   由「规则恒空转自检」当场报红（不在白名单的新增恒空转规则）—— 绊线立功，但契约本身已失效。
//   ★ 修法不是给它挂白名单：挂白名单等于承认「这条契约从此没人守」，而上游重构只是
//     把飘字从「文本锚点」换成「数值结构」，风险形态变了、风险本身没消失 ——
//     kind 写错、amount 为 NaN、数值与正文对不上，三种静默失效在新结构下一一对应旧风险。
//     故按新结构重写判据：**同源性**从「锚文本⊂正文」换成「fx.amount⊂正文」，
//     另补 kind 合法性 与 amount 有限正数两条（旧结构没有、新结构才有的失效面）。
//   ★ 规则名同步改为「飘字fx数值对账(契约)」：锚点已不复存在，再叫「锚点对齐」是在报告里说谎。
//     改名连带更新 tests/124rule-recipes.js 的同名键（registration-check 按名查配方）。
export const VER = 'tests/health-rules/158-fact-anchor-align.js V2.0.0';

import { collectNodesGrouped as collectNodes } from '../122health-utils.js';

// 播放器认得的 fx 类型。新增 kind 必须同时改这里与本文件 VER —— 否则新 kind 会被当未知静默丢弃。
var FX_KINDS = ['heal', 'atk', 'dmg'];

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
        var breaks = [];
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
                    breaks.push('fx#' + k + ' 非法(空/非对象): ' + text.slice(0, 40));
                    continue;
                }
                // ① kind 合法性：播放器只按已知 kind 分派，写错的 kind 被静默丢弃（特效不播）
                if (FX_KINDS.indexOf(item.kind) === -1) {
                    breaks.push('fx#' + k + ' kind 未知「' + item.kind + '」(认得: ' + FX_KINDS.join('/') + ')，特效将静默不播: ' + text.slice(0, 50));
                    continue;
                }
                // ② amount 有限正数：NaN / undefined / 0 / 负数 都让飘字哑火（数值照算、不报错）
                var amt = item.amount;
                if (typeof amt !== 'number' || !isFinite(amt)) {
                    breaks.push('fx#' + k + '(' + item.kind + ') amount 非有限数「' + amt + '」，飘字将哑火: ' + text.slice(0, 50));
                    continue;
                }
                //   0 是合法空操作（如「回复0点生命」本就无事发生，不该飘字），不算失效 ⇒ 跳过不报；
                //   负数才是异常（飘字会飘出「-N」），保留为红。
                if (amt === 0) continue;
                if (amt < 0) {
                    breaks.push('fx#' + k + '(' + item.kind + ') amount 为负「' + amt + '」，飘字将飘出负数值: ' + text.slice(0, 50));
                    continue;
                }
                // ③ 同源性（旧「锚文本⊂正文」在新结构下的等价形态）：数值必须在正文里出现
                var forms = amountTextForms(amt);
                var hit = false;
                for (var f = 0; f < forms.length; f++) {
                    if (text.indexOf(forms[f]) !== -1) { hit = true; break; }
                }
                if (!hit) {
                    breaks.push('fx#' + k + '(' + item.kind + ') 数值 ' + amt + ' 不在正文（文案与特效不同源，飘字数值将对不上）: ' + text.slice(0, 60));
                }
            }
        }
        if (fxEntries === 0) return 'skip';
        if (breaks.length > 0) {
            return { fail: true, msg: '飘字 fx 与正文错位 ' + breaks.length + ' 处（特效将静默失效）: ' + breaks.slice(0, 5).join(' | ') };
        }
        return { fail: false };
    }
};
