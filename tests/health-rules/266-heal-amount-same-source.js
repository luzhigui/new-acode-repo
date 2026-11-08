// 治疗演出数值与血量迁移同源（回归）。
// 为什么需要：演出层禁反推历史值——治疗条目正文显示的回复数字应与血量实际迁移对上；
//   158 已盯「fx.amount 与正文同源」，但治疗条目的正文数字/血量端点独立渲染，二次取整或口径漂移会漏过去。
// 判据来源（render/413-generic-renderers.js makeHealRenderer）：
//   同一条治疗正文里，飘字数字取自 healDisplay(fact, fact.heal)（render/413 的 healActual），
//   血量端点 a→b 取自同一个 fact 的 hpBefore/hpAfter；两者量同一次治疗，故必须相等（≤1 点取整容差）。
//   旧版曾按「名义治疗量≠有效治疗量」把它降成观察项；但 413 明确打印的是实际生效量，
//   偏离 >1 只能是端点/口径错配 ⇒ 2026-11-08 升硬判，并把实测 69 例偏离登记 known-transfers 转交主代码。
// 判据：
//   ① healAmount 必须是有限且 ≥0 的数（NaN / 负数 ⇒ 飘字哑火或方向错）；
//   ② 正文写了回复数字时，必须与正文血量迁移差（a→b）一致（容差 1 点）；
//   ③ 正文没写数字 / 写百分比 / 无血量迁移端点 → 不可判，跳过。
export const VER = 'tests/health-rules/266-heal-amount-same-source.js V1.3.0';

import { collectNodesGrouped as collectNodes } from '../122health-utils.js';

function stripTags(s) { return String(s || '').replace(/<[^>]*>/g, ''); }

export const rule266 = {
    group: '战报与渲染一致性',
    name: '治疗演出数值与血量迁移同源(回归)',
    test: function(ctx, log) {
        var nodes = collectNodes(log || []);
        var checked = 0, judged = 0, badCount = 0;
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
                badCount++;
                if (bad.length < 3) bad.push('显示 ' + disp + ' / 血量迁移 ' + delta + '（' + text.slice(0, 45) + '）');
            }
        }
        if (badCount) return { fail: true, msg: '治疗显示值与血量迁移偏离 >1 点：' + badCount + '/' + judged + ' 例，样例：' + bad.join(' | ') };
        if (checked === 0) return 'skip';
        return { fail: false, msg: '治疗条目 ' + checked + ' 条（可判 ' + judged + ' 条），显示值与血量迁移差一致（≤1 点取整容差）' };
    }
};
