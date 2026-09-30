// 回归规则：流星赶月溅射加攻的**来源合法性** —— 没有海克斯增强来源时，溅射本就不该加攻
//
// ★ 第 44 轮重锚（务必先读，这是本规则的一次死而复生）：
//   主代码 V1.0.10/V6.0.4 收口了流星成长的渲染：**删掉了溅射行尾的内联 ⚡ 成长段**
//   （原先读的 `fact.unitName` 从未赋值 → 长期显示「⚡ undefined」，且与 METEOR_SPLASH_GROWTH fact 重复渲染两遍），
//   成长改由 METEOR_SPLASH_GROWTH fact **独立渲染**成一条 info 行（见 render/35 L143 的删除注释）。
//   而本规则原本锚定「含『溅射』二字的那一行」，那行现在**已经不带 ⚡ 了**
//   → `s.match(/⚡…攻击\+(\d+)/)` 恒为 null → 两条信号双双静默跳过 → **pass=51 的假绿**（实测确认）。
//   修复：改锚到**独立 info 行**（`⚡ X 攻击+N`）；溅射行只用来识别「本场有流星/蝶星溅射」。
//
// 分工（三条规则盯着同一笔成长，各管一段，**刻意不重叠**）：
//   136 = **来源合法性**：阵容里没有小昭·姊（无 hexEnhance 增强来源）却出现加攻 ⇒ 加攻被误接到普通路径
//   153 = **数值**：加攻量 = 溅射命中人数 × atkPerSplash(2)      ← 原信号①已整体交给它
//   155 = **渲染形态**：单位名缺失 / 同一笔渲染两遍（第 44 轮随主代码修复已转绿）
//   故规则名从「流星赶月溅射加攻量」改为「流星溅射成长来源合法性」。
//
// 机制源（core/16effect-handlers.js SPLASH 分支）：
//   加攻 = 小昭·姊「海克斯增强」专属 —— `query('xiaoHexEnhance', …)` 取不到就 perSplash=0 ⇒ **不该加攻**。
//   普通 ☄️ 流星赶月（仅团队海克斯 meteorshower 生效）本就不加攻；小昭·弟永久海克斯版标签为 🦋 蝶星。
// 复发信号：
//   1) 本场阵容里没有小昭·姊，却出现了加攻成长 ⇒ 加攻来源被写死/写宽，攻击数值静默膨胀
// 误报规避：
//   - 本场没有流星/蝶星溅射条目 → skip（团队 Buff 门控，多数场次本就没有）
//   - 溅射了但没加攻 → 直接 pass（这才是多数情况下的正确形态，不强制要求加攻）
//   - 小昭·姊只要在本场阵容里出现过就视为"可能有增强来源"（她中途阵亡无法从终局阵容反推）
//   - 只认**独立 info 行**的成长（`⚡ X 攻击+N`）；溅射行尾的 ⚡ 已被主代码删除，二者不再混淆
// 历史（旧版教训，勿回退）：
//   V6.1.12 曾修过一次规则侧误报：growth 正则原先裸匹配 `/攻击\+(\d+)/`，会把同一行尾随的
//   「胖远桥莽撞」rageText（`💢 莽撞：…攻击+2（当前 67）`）当成流星成长 → seed=15:3 谎报。
//   重锚后天然不会踩这个坑：rageText 挂在溅射行上，而现在溅射行根本不参与成长解析。
export const VER = 'tests/health-rules/136-meteor-atk.js V6.2.0';
import { collectNodes, plain } from '../122health-utils.js';

export const rule83 = {
    group: 'Buff效果回归',
    name: '流星溅射成长来源合法性(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var nodes = collectNodes(log);
        var splashes = [];  // { label }  —— 只用来确认「本场有流星/蝶星溅射」
        var growths = [];   // { name, n } —— 独立 info 行的成长

        for (var i = 0; i < nodes.length; i++) {
            var t = plain(nodes[i] && nodes[i].text);
            if (!t) continue;
            var isMeteor = t.indexOf('☄️ 流星赶月') !== -1;
            var isBrother = t.indexOf('🦋 蝶星') !== -1;
            if (t.indexOf('溅射') !== -1 && (isMeteor || isBrother)) {
                splashes.push({ label: isBrother ? '蝶星' : '流星赶月' });
                continue; // 溅射行：主代码收口后它已不带 ⚡，只看它存在与否
            }
            // 独立成长行：`⚡ 单位名 攻击+N`（渲染出口 render/35 renderMeteorSplashGrowthFact）
            var gm = t.match(/⚡\s*(.*?)\s*攻击\+(\d+)/);
            if (gm) growths.push({ name: String(gm[1] || '').trim(), n: parseInt(gm[2], 10) });
        }
        if (splashes.length === 0) return 'skip';            // 本场没有流星/蝶星溅射
        if (growths.length === 0) return { fail: false };    // 溅射了但没加攻 —— 这才是正常形态

        // 复发信号1：阵容里完全没有小昭·姊（无海克斯增强来源）却出现加攻
        var hasSister = false;
        var pools = [afterA || [], afterE || [], beforeA || [], beforeE || []];
        for (var p = 0; p < pools.length && !hasSister; p++) {
            var arr = pools[p] || [];
            for (var u = 0; u < arr.length; u++) {
                var un = arr[u];
                if (un && (un.isXiaoZhaoSister || un.name === '小昭·姊')) { hasSister = true; break; }
            }
        }
        if (!hasSister) {
            return { fail: true, msg: '复发：本场无小昭·姊（无海克斯增强来源），' + splashes[0].label
                + '溅射却让 ' + growths[0].name + ' 攻击+' + growths[0].n
                + '（加攻被误接到普通路径，攻击数值膨胀）' };
        }
        return { fail: false };
    }
};
