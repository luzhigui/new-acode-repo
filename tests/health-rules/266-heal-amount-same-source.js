// 治疗演出数值与血量迁移同源（观察项）。
// 为什么需要：演出层禁反推历史值——治疗条目正文显示的回复数字应与血量实际迁移对上；
//   158 已盯「fx.amount 与正文同源」，但治疗条目的正文数字/血量端点独立渲染，二次取整或口径漂移会漏过去。
// 先量再立规（第 192 轮实测）：156 场里 healAmount 与正文显示值大量对不上（名义治疗量≠有效治疗量），
//   且部分条目「显示 +14 / 血量 120→136（+16）」偏离 2 点，无法在不读主代码的前提下判定是取整还是口径差。
//   ⇒ 按纪律不升硬判据，留观察项输出：只报「显示值与血量迁移差偏离 >1 点」的条数与样例，供主代码研判。
// 判据（观察项：fail 恒 false）：
//   ① healAmount 必须是有限且 ≥0 的数（NaN / 负数 ⇒ 飘字哑火或方向错，这是硬问题，见 msg 里标红字样）；
//   ② 正文写了回复数字时，与正文血量迁移差（a→b）偏离 >1 点即记入观测；
//   ③ 正文没写数字或写百分比 → 不可判，跳过。
export const VER = 'tests/health-rules/266-heal-amount-same-source.js V1.2.0';

import { collectNodesGrouped as collectNodes } from '../122health-utils.js';

function stripTags(s) { return String(s || '').replace(/<[^>]*>/g, ''); }

export const rule266 = {
    group: '战报与渲染一致性',
    name: '治疗演出数值与血量迁移同源(观测)',
    test: function(ctx, log) {
        var nodes = collectNodes(log || []);
        var checked = 0, judged = 0;
        var bad = [];
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
            if (!mDisp) continue;   // 正文没写回复数字 = 不可判
            var mTrans = text.match(/(-?\d+(?:\.\d+)?)\s*→\s*(-?\d+(?:\.\d+)?)/);
            if (!mTrans) continue;  // 没有血量迁移端点 = 不可判
            judged++;
            var disp = Number(mDisp[1]);
            var delta = Math.abs(Number(mTrans[2]) - Number(mTrans[1]));
            if (Math.abs(delta - disp) > 1) {
                if (bad.length < 3) bad.push('显示 ' + disp + ' / 血量迁移 ' + delta + '（' + text.slice(0, 45) + '）');
            }
        }
        if (bad.length) return { fail: false, observe: '治疗显示值与血量迁移偏离 >1 点（' + bad.length + ' 例样例）：' + bad.join(' | ') };
        if (checked === 0) return 'skip';
        return { fail: false, msg: '治疗条目 ' + checked + ' 条（可判 ' + judged + ' 条），显示值与血量迁移差一致（≤1 点取整容差）' };
    }
};
