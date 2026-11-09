// 回归规则：流星赶月「溅射成长」的**渲染形态** —— 单位名缺失 / 同一笔渲染两遍
//
// 与 153 的分工（第 43 轮拆分，务必先读）：
//   153 = **数值**（成长量 = 命中人数×2）→ 干净树绿，负责给 T3 变异作证（有牙）
//   155 = **形态**（单位名 / 重复渲染）→ **干净树就是红的**，它报的是主代码既有 bug，
//         不是任何变异引入的。正因它在基线就不绿，变异牙齿测试会把它标为「失去作证资格」；
//         这是**设计如此** —— 它的价值是「盯住这个 bug 直到被修好」，不是参与牙口判定。
//
// 立它的原因（第 43 轮探针实证，tests/.mut/probe-meteor.mjs，seed=37 stage=1 r1）：
//   主代码 V6.0.3（core/217-effect-handlers.js L175）补发了 METEOR_SPLASH_GROWTH fact（此前枚举/契约/
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
export const VER = 'tests/health-rules/155-meteor-growth-dup.js V1.2.0';
import { collectNodes, plain } from '../122health-utils.js';

// fact 侧形态判据（V1.2.0 新增，主通道）：
//   ① 单位名缺失：METEOR_SPLASH_GROWTH.data.unitName 必须是非空字符串且不是 undefined/null。
//      render/412 直接把它插进文案 ⇒ 缺了就是玩家看到「⚡ undefined 攻击+8」。
//   ② 重复渲染：同一笔成长**只应有一条 fact**。若同一场里出现两条 unitName+growth 全同、
//      且中间没有别的成长 fact 隔开的记录，即同一笔被发了两遍（老路径与 fact 路径并行时就是这个形态）。
//   返回 null 表示 fact 侧无样本（交回文本通道），返回 'skip' 或 {fail} 表示已有结论。
export function assessFacts(facts) {
    if (!Array.isArray(facts) || facts.length === 0) return null;
    var rows = [];
    for (var i = 0; i < facts.length; i++) {
        var f = facts[i];
        if (!f || f.factType !== 'meteorSplashGrowth') continue;
        var d = f.data || {};
        rows.push({ name: d.unitName, growth: d.growth });
    }
    if (rows.length === 0) return null;
    for (var a = 0; a < rows.length; a++) {
        var nm = rows[a].name;
        if (typeof nm !== 'string' || !nm.trim() || nm === 'undefined' || nm === 'null') {
            return { fail: true, msg: '复发：流星成长 fact 缺 unitName（growth=' + rows[a].growth
                + '）—— render/412 会渲染成「⚡ undefined 攻击+N」，玩家看不出是谁加了攻' };
        }
    }
    for (var b = 1; b < rows.length; b++) {
        if (rows[b].name === rows[b - 1].name && rows[b].growth === rows[b - 1].growth) {
            return { fail: true, msg: '复发：同一笔流星成长被发了两遍 fact（' + rows[b].name
                + ' 攻击+' + rows[b].growth + ' 两条紧邻）—— 战报会重复、数值看着像翻倍；应只保留一个发射口' };
        }
    }
    return { fail: false };
}

export const rule102 = {
    group: '战报渲染回归',
    name: '流星溅射成长渲染形态(单位名/重复)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        // ★ V1.2.0（第 195 轮）：主通道改读**原始 fact 流**。
        //   病根：成长行由 render/412 的 registerFactRenderer 渲染，而回放器产出的 log 里
        //   这些 fact 不落成独立的 text 节点（实测 seed=8 stage=1-4 定向场：「流星溅射成长渲染」
        //   153 靠 fact 侧 pass=18，本规则同一批场次靠文本 skip=23，一条文本都认不到）。
        //   ⇒ 本规则在 156 场里恒空转（pass=0 fail=0 skip=156），而 153 的头注白纸黑字写着
        //     「单位名缺失 / 渲染两遍两条已拆到 155」，153 实现里却没有它们 —— 两块覆盖双重失守，
        //     面板上却一直显示这两条规则「在册」。这就是「规则在册 ≠ 规则在岗」。
        //   新口径：形态判据在 **fact 层**验（数据形态与渲染形态同源，render 直接读这几个字段），
        //   文本通道保留为副证（老路径把成长挂在溅射行尾的那种形态只能从文本看出来）。
        var factSide = assessFacts(facts);
        // 回放器与静态形状守门只认 {fail:boolean,msg?} 或 'skip' —— 不能直接 return 变量，
        //   必须显式包成字面量对象（否则被静态扫描判为「返回非对象表达式」，整条静默变 pass）。
        // ★ V1.2.1（第 199 轮）：原来这里写的是 `msg: factSide.msg`（变量透传）⇒
        //   抽取器（_lib/rule-branch-extract）读不到任何静态字面量 ⇒ fp=null ⇒ 本条规则被
        //   rule-branch-idle-selftest 判「新增无可抽取指纹的分支」。改成「固定标签 + 变量」形态，
        //   判据与判定顺序一字未动，只给这条分支补一个可定位的静态前缀。
        if (factSide && factSide.fail) return { fail: true, msg: `流星溅射成长渲染形态：${factSide.msg}` };
        if (factSide && !factSide.fail) return { fail: false };

        var nodes = collectNodes(log);
        var growths = [];  // { idx, name, n, kind:'info'|'splash' }
        for (var i = 0; i < nodes.length; i++) {
            var t = plain(nodes[i] && nodes[i].text);
            if (!t) continue;
            // ★ V6.1.20（第 195 轮）：主代码把成长行的符号统一成 `sgn()`——正成长「攻击+3」、
            //   负成长「攻击-3」（render/412 renderMeteorSplashGrowthFact 实测 `攻击${sgn(fact.growth)}`）。
            //   旧正则只认 `攻击+(\d+)`，负成长一条都认不到；更要命的是**若某场只有负成长**，
            //   growths 会全场为空 ⇒ 直接 return skip ⇒ 规则在 156 场里恒空转（pass=0 fail=0 skip=156）。
            //   这不是主代码退化，是本规则认错了渲染形态。改为认 `±`，数值取绝对值，其余判据一字未动。
            var gm = t.match(/⚡\s*(.*?)\s*攻击([+＋\-−])\s*(\d+(?:\.\d+)?)/);
            if (!gm) continue;
            growths.push({
                idx: i,
                name: String(gm[1] || '').trim(),
                n: Math.abs(parseFloat(gm[3])),
                kind: t.indexOf('溅射') !== -1 ? 'splash' : 'info'
            });
        }
        if (growths.length === 0) {
            // ★ V1.2.0：本场零样本时不再沉默 skip。
            //   第 195 轮实测：156 场里本规则一条样本都拿不到（fact 通道无 meteorSplashGrowth、
            //   文本通道无成长行），看上去「全绿」，实际是**本规则已无法取证**。
            //   根因见下（主代码配置键改名 ⇒ 成长永不发射），但那属主代码侧问题，本规则无权替它判红，
            //   也不许继续用 skip 假装在岗 —— 改为如实报告「不可取证」，与观察项同口径（不计退码）。
            return { fail: false, observe: '本场零样本：既无 METEOR_SPLASH_GROWTH fact，也无「⚡ X 攻击±N」成长行 —— 本规则当前无法取证（见转交：主代码引用的 atkPerSplash 键已不存在）' };
        }

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
