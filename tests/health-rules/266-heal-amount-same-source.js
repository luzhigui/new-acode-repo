// 治疗演出数值与字段同源（不许二次取整）。
// 为什么需要：演出层禁反推历史值——治疗条目正文里显示的回复数字，必须等于该条 fact 下发的
//   healAmount（名义治疗量），或等于正文自带的血量迁移差（a→b）——两者至少命中一个。
//   158 已盯「fx.amount 与正文同源」，但治疗条目的正文数字是独立渲染的，二次取整会在这里漏过去
//   （正文写 12，实际血量 152→164 是 13，演出显示的就是算术错）。
// 判据（回放实测口径，先量后升硬判据）：
//   ① healAmount 必须是有限且 ≥0 的数（NaN / 负数 ⇒ 飘字数值哑火或方向错）；
//   ② 正文若写了回复数字，则该数字必须等于 healAmount，或与正文血量迁移差（a→b）相差不超 1 点
//      （正文血量端点按整数展示，治疗量可带一位小数，1 点容差正是端点取整的上界）；
//      正文没写数字或写的是百分比时视为不可判，不报红。
export const VER = 'tests/health-rules/266-heal-amount-same-source.js V1.1.0';

import { collectNodesGrouped as collectNodes } from '../122health-utils.js';

// 数值等价形态：原值 / 整数四舍五入 / 一位小数（与 158 同一口径）
function amountTextForms(amount) {
    var forms = [Math.round(amount * 1000) / 1000, Math.round(amount), Math.round(amount * 10) / 10];
    return forms;
}

function sameNumber(amount, value) {
    var forms = amountTextForms(amount);
    for (var i = 0; i < forms.length; i++) if (forms[i] === value) return true;
    return false;
}

function stripTags(s) { return String(s || '').replace(/<[^>]*>/g, ''); }

export const rule266 = {
    group: '战报与渲染一致性',
    name: '治疗演出数值与字段同源(不许二次取整)',
    test: function(ctx, log) {
        var nodes = collectNodes(log || []);
        var checked = 0, judged = 0;
        for (var i = 0; i < nodes.length; i++) {
            var e = nodes[i] && nodes[i].e;
            if (!e || typeof e !== 'object') continue;
            if (!e.isHealEntry || typeof e.healAmount !== 'number') continue;
            checked++;
            if (!isFinite(e.healAmount) || e.healAmount < 0) {
                return { fail: true, msg: '治疗条目 healAmount 非法（' + String(e.healAmount) + '）：演出飘字会哑火或反向，正文=' + stripTags(e.text).slice(0, 40) };
            }
            var text = stripTags(e.text);
            if (text.indexOf('%') !== -1) continue;   // 百分比口径不可判
            var mDisp = text.match(/(?:回复|吸血|治疗)\s*[+＋]?\s*(-?\d+(?:\.\d+)?)/);
            if (!mDisp) continue;   // 正文没写回复数字 = 不可判，不冤杀
            judged++;
            var disp = Number(mDisp[1]);
            var ok = sameNumber(e.healAmount, disp);
            var mTrans = text.match(/(-?\d+(?:\.\d+)?)\s*→\s*(-?\d+(?:\.\d+)?)/);
            if (!ok && mTrans) {
                var delta = Math.abs(Number(mTrans[2]) - Number(mTrans[1]));
                // 正文血量端点按整数展示：显示值与迁移差允许 1 点取整容差
                ok = Math.abs(delta - disp) <= 1;
            }
            if (!ok) {
                return { fail: true, msg: '治疗显示数字与 fact 不同源：healAmount=' + e.healAmount + '，正文写 ' + disp + '（' + text.slice(0, 50) + '）—— 显示值既非名义治疗量，也与血量迁移差偏离超过 1 点' };
            }
        }
        if (checked === 0) return 'skip';
        return { fail: false, msg: '治疗条目 ' + checked + ' 条（可判显示数字 ' + judged + ' 条），显示值与 healAmount/血量迁移差同源' };
    }
};
