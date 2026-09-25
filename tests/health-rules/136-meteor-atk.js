// 回归规则：流星赶月溅射加攻量 — 校验溅射附带的攻击成长「量」对不对（core/16effect-handlers.js SPLASH 分支）
// 现行口径（对照 记录-更改履历.md V5.1.0 与 core/16）：
//   加攻 = 小昭·姊「海克斯增强」专属（content 小昭.hexEnhance.params.meteorShower.atkPerSplash = 2），
//   普通 ☄️ 流星赶月（仅团队海克斯 meteorshower 生效）本就不加攻；小昭·弟永久海克斯版标签为 🦋 蝶星。
//   命中后：growth = 溅射存活命中人数 × atkPerSplash(2)，写回 factData.growth，
//   由 render/30 renderMeteorShowerSplashFact 渲染成「⚡ 单位名 攻击+N」。
// ⚠️ 旧口径（V6.0.0）写的是「普通溅射必须带攻击+N，否则判失败」——与设计相反，属于碰到就误报，
//    本版改为「不强制加攻，但一旦出现加攻就必须等于 命中人数×2」。
// 复发信号：
//   1) 加攻量 ≠ 溅射命中人数 × 2 —— 成长量算错（命中人数含了已死单位、或 atkPerSplash 改了没同步）
//   2) 阵容里根本没有小昭·姊（无增强来源）却出现加攻 —— 加攻被误接到普通路径，攻击数值膨胀
// 误报规避：
//   - 普通版不强制要求加攻（小昭·姊不在场时本就应无成长）
//   - 小昭·姊只要在本场阵容里出现过就视为"可能有增强来源"，不做信号2判定（她中途阵亡无法从终局阵容反推）
//   - 本场无流星/蝶星溅射条目直接 skip
// V6.1.12 | 2026-09-25 修规则侧误报（非引擎问题）：growth 正则原先裸匹配 `/攻击\+(\d+)/`，
//   会把同一行尾随的「胖远桥莽撞」rageText（`💢 莽撞：…吃了溅射，攻击+2（当前 67）`，
//   modules/26elite-sixsects.js 下发、render/35 L144 追加）当成流星成长 → seed=15:3 谎报
//   "本场无小昭·姊却加攻2"。现锚定 ⚡ 成长段（render/35 L142 独占 `⚡ 单位名 攻击+N`）。
export const VER = 'tests/health-rules/136-meteor-atk.js V6.1.12';

const ATK_PER_SPLASH = 2; // content 小昭.hexEnhance.params.meteorShower.atkPerSplash

// 一条战报里可能被本规则命中的文本：顶层 text + attack-group 的 entries 子条目
function entryTexts(e) {
    var out = [];
    if (!e) return out;
    if (typeof e.text === 'string' && e.text) out.push(e.text);
    if (Array.isArray(e.entries)) {
        for (var i = 0; i < e.entries.length; i++) {
            var sub = e.entries[i];
            if (sub && typeof sub.text === 'string' && sub.text) out.push(sub.text);
        }
    }
    return out;
}

export const rule83 = {
    group: 'Buff效果回归',
    name: '流星赶月溅射加攻量(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var splashes = [];   // { label, hits, growth }
        for (var i = 0; i < log.length; i++) {
            var texts = entryTexts(log[i]);
            for (var t = 0; t < texts.length; t++) {
                var s = texts[t];
                if (s.indexOf('溅射') === -1) continue;
                var isMeteor = s.indexOf('☄️ 流星赶月') !== -1;
                var isBrother = s.indexOf('🦋 蝶星') !== -1;
                if (!isMeteor && !isBrother) continue;
                // 文本形如「☄️ 流星赶月溅射：甲、乙，各-12，防御-1 ⚡ 丙 攻击+4」
                var body = s.substring(s.indexOf('溅射') + 2);      // 去掉"溅射"两字
                var cut = body.indexOf('，');
                var namePart = cut === -1 ? body : body.substring(0, cut); // "：甲、乙"
                var colon = namePart.indexOf('：');
                var names = colon === -1 ? namePart : namePart.substring(colon + 1);
                var hits = names ? names.split('、').length : 0;
                // 只认 ⚡ 成长段（`⚡ 单位名 攻击+N`），别把尾随 rageText 的「攻击+2」吃进来
                var gm = s.match(/⚡\s*\S+\s*攻击\+(\d+)/);
                splashes.push({
                    label: isBrother ? '蝶星' : '流星赶月',
                    hits: hits,
                    growth: gm ? parseInt(gm[1], 10) : null
                });
                break;
            }
        }
        if (splashes.length === 0) return 'skip'; // 本场没有流星/蝶星溅射

        // 复发信号1：一旦出现加攻，量必须 = 溅射命中人数 × atkPerSplash
        for (var k = 0; k < splashes.length; k++) {
            var sp = splashes[k];
            if (sp.growth === null) continue; // 普通版无加攻属正常（小昭·姊不在场）
            var expect = sp.hits * ATK_PER_SPLASH;
            if (sp.growth !== expect) {
                return { fail: true, msg: '复发：' + sp.label + '溅射命中' + sp.hits + '人却加攻' + sp.growth
                    + '，应为 ' + expect + '（命中人数×atkPerSplash=' + ATK_PER_SPLASH + '，成长量口径漂移）' };
            }
        }

        // 复发信号2：阵容里完全没有小昭·姊（无海克斯增强来源）却出现加攻 → 加攻被误接到普通路径
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
            for (var q = 0; q < splashes.length; q++) {
                if (splashes[q].growth !== null) {
                    return { fail: true, msg: '复发：本场无小昭·姊（无海克斯增强来源），' + splashes[q].label
                        + '溅射却加攻' + splashes[q].growth + '（加攻被误接到普通路径，攻击数值膨胀）' };
                }
            }
        }
        return { fail: false };
    }
};
