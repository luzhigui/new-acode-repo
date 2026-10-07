// 回归规则：飘字锚点对齐 — 带锚动作的战报条目，锚文本必须是条目正文的子串
// 复发信号：entry.fxAnchors 里的锚文本在 entry.text 里找不到（indexOf === -1）
// 对应已修 Bug：飞行再生飘字上线即哑四天（2026-10-06）——锚点文本写「回复+N」、
//   正文渲染成「回复 N 点」，一个空格之差子串永不匹配，飘字回调永不触发，数值正常加、
//   不报任何错，纯静默失效。这类坑靠人眼四天后才逮到，此规则让体检当场报红。
// 判据来源：player/42 playLineText 按锚文本逐字扫正文触发 anchor 动作——锚不在正文里
//   = 锚动作永远打不响。render/35 各渲染函数的 fxAnchors 与 text 必须同模板同变量。
export const VER = 'tests/health-rules/158-fact-anchor-align.js V1.0.0';

import { collectNodesGrouped as collectNodes } from '../122health-utils.js';

export const rule105 = {
    group: '渲染与特效契约',
    name: '飘字锚点对齐(契约)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var nodes = collectNodes(log || []);
        var anchored = 0;
        var breaks = [];
        for (var i = 0; i < nodes.length; i++) {
            var e = nodes[i] && nodes[i].e;
            if (!e || typeof e !== 'object') continue;
            var anchors = e.fxAnchors;
            if (!Array.isArray(anchors) || anchors.length === 0) continue;
            anchored++;
            var text = (typeof e.text === 'string') ? e.text : '';
            for (var k = 0; k < anchors.length; k++) {
                var a = anchors[k];
                if (typeof a !== 'string' || a.length === 0) {
                    breaks.push('锚#' + k + ' 非法(空/非字符串): ' + (e.text || '').slice(0, 40));
                    continue;
                }
                if (text.indexOf(a) === -1) {
                    breaks.push('锚#' + k + '「' + a + '」不在正文: ' + text.slice(0, 60));
                }
            }
        }
        if (anchored === 0) return 'skip';
        if (breaks.length > 0) {
            return { fail: true, msg: '飘字锚点与正文错位 ' + breaks.length + ' 处（锚动作将永不触发，静默失效）: ' + breaks.slice(0, 5).join(' | ') };
        }
        return { fail: false };
    }
};
