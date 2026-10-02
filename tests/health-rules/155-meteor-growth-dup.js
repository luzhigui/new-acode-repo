// 回归规则：流星赶月「溅射成长」的**渲染形态** —— 单位名缺失 / 同一笔渲染两遍
//
// 与 153 的分工（第 43 轮拆分，务必先读）：
//   153 = **数值**（成长量 = 命中人数×2）→ 干净树绿，负责给 T3 变异作证（有牙）
//   155 = **形态**（单位名 / 重复渲染）→ **干净树就是红的**，它报的是主代码既有 bug，
//         不是任何变异引入的。正因它在基线就不绿，变异牙齿测试会把它标为「失去作证资格」；
//         这是**设计如此** —— 它的价值是「盯住这个 bug 直到被修好」，不是参与牙口判定。
//
// 立它的原因（第 43 轮探针实证，tests/.mut/probe-meteor.mjs，seed=37 stage=1 r1）：
//   主代码 V6.0.3（core/16effect-handlers.js L175）补发了 METEOR_SPLASH_GROWTH fact（此前枚举/契约/
//   渲染/翻译链早已接好却零 emit）。补发本身是对的，但**没有收口老的渲染出口**，于是：
//     ① 老路径（core/16 L173 `decl.factData.growth = growth` → render/35 L143 挂在溅射行尾）
//        `fact.unitName` **从未被赋值** → 渲染成 `⚡ undefined 攻击+8`（单位名长期显示 undefined）
//     ② 新 fact 由 render/35 L453 再渲染一次 `⚡ X 攻击+8`（独立 info 行，单位名是对的）
//        ⇒ 同一笔成长在战报里出现**两遍**
//   实测原始战报：
//       [0.6] buff-splash :: ☄️ 流星赶月溅射：班淑娴、何太冲、昆仑玉清、崆峒弟子，各-5，防御-1 ⚡ undefined 攻击+8
//       [1]   info        :: ⚡ 明教弟子3 攻击+8
//
// 两条复发信号（干净树当前**均在报红**，修复后应转绿）：
//   1) 成长行缺少单位名（`⚡ undefined` / 空名）—— factData 未带 unitName，玩家看不出是谁加了攻
//   2) 同一笔成长被渲染两遍（溅射行尾 ⚡ 与紧随的独立 ⚡ 数值相同）—— 战报重复、看着像数值翻倍
//
// 主代码修复建议（本规则转绿的验收口径）：二选一，别两个都留 ——
//   (a) 保留新 fact 作唯一出口：core/16 删掉 `if (decl.factData) decl.factData.growth = growth;`
//       → 但 136 锚定的是「含溅射二字的行」，删了它就空转，须同步把 136 改成认独立 info 行；
//   (b) 保留内联出口：render/35 不再注册 METEOR_SPLASH_GROWTH 的渲染器（fact 仍发，供 render/38
//       动作翻译链 STAT_CHANGE 用），并把 unitName 补进 factData —— 玩家侧改动最小。
//
// 误报规避：
//   - 本场没有溅射行也没有成长行 → skip（流星赶月/蝶星是团队 Buff 门控，多数场次本就没有）
//   - 信号 2 要求两条 ⚡ **数值相同且索引相邻（≤2）**：不同回合的两笔成长即便数值巧合相同也不误判
export const VER = 'tests/health-rules/155-meteor-growth-dup.js V6.1.19';
import { collectNodes, plain } from '../122health-utils.js';

export const rule102 = {
    group: '战报渲染回归',
    name: '流星溅射成长渲染形态(单位名/重复)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var nodes = collectNodes(log);
        var growths = [];  // { idx, name, n, kind:'info'|'splash' }
        for (var i = 0; i < nodes.length; i++) {
            var t = plain(nodes[i] && nodes[i].text);
            if (!t) continue;
            var gm = t.match(/⚡\s*(.*?)\s*攻击\+(\d+)/);
            if (!gm) continue;
            growths.push({
                idx: i,
                name: String(gm[1] || '').trim(),
                n: parseInt(gm[2], 10),
                kind: t.indexOf('溅射') !== -1 ? 'splash' : 'info'
            });
        }
        if (growths.length === 0) return 'skip'; // 本场没有流星成长

        // 信号1：成长行单位名缺失（老路径 factData 从未带 unitName → 渲染成 `⚡ undefined`）
        for (var a = 0; a < growths.length; a++) {
            var g0 = growths[a];
            if (!g0.name || g0.name === 'undefined' || g0.name === 'null') {
                return { fail: true, msg: '复发：第' + g0.idx + '条战报的成长行「⚡ ' + (g0.name || '')
                    + ' 攻击+' + g0.n + '」缺少单位名（factData 未带 unitName，玩家看不出是谁加了攻）' };
            }
        }

        // 信号2：同一笔成长被渲染两遍（溅射行尾 ⚡ 与紧随的独立 ⚡ 数值相同且相邻）
        for (var b = 0; b < growths.length; b++) {
            if (growths[b].kind !== 'info') continue;
            var gi = growths[b];
            for (var c = 0; c < growths.length; c++) {
                var gs = growths[c];
                if (gs.kind !== 'splash' || gs.n !== gi.n) continue;
                if (Math.abs(gs.idx - gi.idx) > 2) continue;
                return { fail: true, msg: '复发：同一笔流星成长被渲染了两遍（溅射行尾「⚡ ' + gs.name + ' 攻击+' + gs.n
                    + '」+ 紧随的独立行「⚡ ' + gi.name + ' 攻击+' + gi.n + '」）'
                    + ' —— 战报重复、数值看着像翻倍；应只保留一处渲染出口' };
            }
        }
        return { fail: false };
    }
};
