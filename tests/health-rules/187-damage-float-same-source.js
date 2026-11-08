// 飘字/伤害行数值同源：damage-text 的 dmg 字段（player/509-attack-group.js 用它发飘字、预演血条）
// 必须与正文「造成 X 伤害」里显示的 X 完全一致——同一个结算值不许在两条显示出口上各取整一次。
// 现状（2026-11-08 实测 500 条/140 场）：render/407-facts-attack.js 主伤害行
//   正文走 fmt1(=fmtNum) 显示 9.8，dmg 字段走 Math.round 写 10 ⇒ 战报写 9.8、飘字飘 10。
//   根因：2026-11-08「显示统一 fmtNum/fmtHpText」改造只改了正文，没改 dmg 字段（行内注释还写着
//   旧的"都是 Math.round"，已过时）。属主代码显示口径缺陷，体检侧不做兜底；在 known-transfers.md
//   登记为转交中，修好后本规则自然转绿。
// 判据：dmg 字段必须是严格"整数"（player/509 只判 >0）且等于 fmtNum(正文数字)；空组/免疫 0 伤害行天然相等。
// 判据来源：140 场实测，除上述 Math.round 口径外 0 误报（嵌套行的 dmg:fmt1 与正文同口径，全部通过）。
export const VER = 'tests/health-rules/187-damage-float-same-source.js V1.0.0';
import { collectNodes } from '../122health-utils.js';
import { fmtNum } from '../../infra/102-core-utils.js';

export const rule187 = {
    group: '战报与渲染一致性',
    name: '飘字伤害数值与正文同源',
    test: function(ctx, log) {
        var nodes = collectNodes(log);
        var saw = false;
        for (var i = 0; i < nodes.length; i++) {
            var e = nodes[i];
            if (!e || e.type !== 'damage-text' || typeof e.dmg !== 'number') continue;
            var text = String(e.text || '').replace(/<[^>]+>/g, '');
            var m = text.match(/造成\s*(-?\d+(?:\.\d+)?)\s*伤害/);
            if (!m) continue;
            saw = true;
            var shown = parseFloat(m[1]);
            if (fmtNum(shown) !== e.dmg) {
                return { fail: true, msg: '飘字与正文不同源：dmg 字段=' + e.dmg + '，正文显示=' + m[1] + '（fmtNum=' + fmtNum(shown) + '）——同一结算值两处各取整一次' };
            }
        }
        if (!saw) return 'skip'; // 本场没有带 dmg 字段的伤害行
        return { fail: false };
    }
};
