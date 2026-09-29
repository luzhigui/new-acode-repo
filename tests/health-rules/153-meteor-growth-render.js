// 回归规则：流星赶月「溅射成长」在战报里的渲染形态 —— 单位名 / 唯一性 / 成长量
//
// 立它的原因（第 43 轮实证，务必先读）：
//   主代码 V6.0.3（core/16effect-handlers.js L175）补发了 METEOR_SPLASH_GROWTH fact（此前枚举/契约/
//   渲染/翻译链早已接好却零 emit）。补发本身是对的，但**没有同步收口老的渲染出口**，导致两处旧疾：
//     ① 老路径（core/16 L173 `decl.factData.growth = growth` → render/35 L143 挂在溅射行尾）里
//        `fact.unitName` **从未被赋值**，渲染出 `⚡ undefined 攻击+8` —— 单位名长期显示为 undefined。
//     ② 新 fact 由 render/35 L453 再渲染一次 `⚡ X 攻击+8`（独立 info 行，单位名是对的）
//        ⇒ 同一笔成长在战报里出现**两遍**，且前一条还是 undefined。
//   实测（tests/.mut/probe-meteor.mjs，seed=37 stage=1 r1）：
//       [0.6] buff-splash :: ☄️ 流星赶月溅射：班淑娴、何太冲、昆仑玉清、崆峒弟子，各-5，防御-1 ⚡ undefined 攻击+8
//       [1]   info        :: ⚡ 明教弟子3 攻击+8
//
// ★ 第 43 轮中拆分：本规则**只管成长量的数值**，「渲染形态」的两条（单位名缺失 / 同一笔渲染两遍）
//   已拆到 155-meteor-growth-dup.js。为什么必须拆：那两条在干净树上就是红的（主代码既有 bug），
//   一条在基线就不绿的规则**没有作证资格** —— 变异牙齿测试会把它报出的任何明细都当成噪声抹掉
//   （见 mutation-teeth.mjs「基线已红的规则失去作证资格」）。拆开之后本规则在干净树是绿的，
//   才能真正为 T3 变异（把 fact 的 growth 写错 +5）作证 —— 否则 T3 永远只能判成装饰品。
//
// 复发信号：
//   1) 独立成长行的加攻量 ≠ 溅射命中人数 × atkPerSplash(2) —— 成长量口径漂移
//      （136 只校验**内联在溅射行里**的那条，锚定含「溅射」的文本；独立 info 行不含「溅射」二字，
//        136 完全看不到它 —— 本规则补的正是这块覆盖缺口，两者不重叠）
//
// 误报规避：
//   - 本场没有溅射行、也没有成长行 → skip（流星赶月/蝶星是团队 Buff 门控，多数场次本就没有）
//   - 命中人数解析不出来（溅射行格式变了）→ 跳过本判据，不猜
//   - 只校验独立 info 行：内联在溅射行尾的那条归 136 管，不重复判
export const VER = 'tests/health-rules/153-meteor-growth-render.js V6.1.19';
import { collectNodes, plain } from '../122health-utils.js';

const ATK_PER_SPLASH = 2; // content 小昭.hexEnhance.params.meteorShower.atkPerSplash

export const rule100 = {
    group: '战报渲染回归',
    name: '流星溅射成长渲染(单位名/唯一性/成长量)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var nodes = collectNodes(log);
        var growths = [];  // { idx, name, n, kind:'info'|'splash' }
        var splashes = []; // { idx, hits }

        for (var i = 0; i < nodes.length; i++) {
            var t = plain(nodes[i] && nodes[i].text);
            if (!t) continue;
            var gm = t.match(/⚡\s*(.*?)\s*攻击\+(\d+)/);
            var isSplash = t.indexOf('溅射') !== -1;
            if (isSplash) {
                // 命中人数：与 136 同口径 —— 「溅射：」后到首个「，」之间的名字按「、」计数
                var body = t.substring(t.indexOf('溅射') + 2);
                var cut = body.indexOf('，');
                var namePart = cut === -1 ? body : body.substring(0, cut);
                var colon = namePart.indexOf('：');
                var names = colon === -1 ? namePart : namePart.substring(colon + 1);
                var hits = names ? names.split('、').length : 0;
                splashes.push({ idx: i, hits: hits });
                if (gm) growths.push({ idx: i, name: String(gm[1] || '').trim(), n: parseInt(gm[2], 10), kind: 'splash' });
            } else if (gm) {
                growths.push({ idx: i, name: String(gm[1] || '').trim(), n: parseInt(gm[2], 10), kind: 'info' });
            }
        }
        if (splashes.length === 0 && growths.length === 0) return 'skip'; // 本场无流星溅射/成长

        // 唯一信号：独立成长行的加攻量 = 溅射命中人数 × atkPerSplash（136 只看内联行，这里补独立行）
        for (var d = 0; d < growths.length; d++) {
            var gd = growths[d];
            if (gd.kind !== 'info') continue;
            var near = null;
            for (var e = 0; e < splashes.length; e++) {
                var sp = splashes[e];
                if (sp.idx < gd.idx && gd.idx - sp.idx <= 3) {
                    if (near === null || gd.idx - sp.idx < gd.idx - near.idx) near = sp;
                }
            }
            if (!near || !near.hits) continue; // 解析不出命中人数就不猜
            var expect = near.hits * ATK_PER_SPLASH;
            if (gd.n !== expect) {
                return { fail: true, msg: '复发：流星溅射命中' + near.hits + '人，成长行却写「⚡ ' + gd.name
                    + ' 攻击+' + gd.n + '」，应为 ' + expect + '（命中人数×atkPerSplash=' + ATK_PER_SPLASH + '，成长量口径漂移）' };
            }
        }
        return { fail: false };
    }
};
