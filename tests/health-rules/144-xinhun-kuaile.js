// 回归规则：宋青书·新婚快乐链路 — 覆盖此前完全没有体检项盯的一整套机制：
//   ① 新婚：宋青书每次攻击命中，扣周芷若 1 点血（content 宋青书.xinHun.hpDeduct = 1），并给周芷若叠 1 层快乐
//   ② 快乐层：新层百分比恒为 healLevels[0] = 16%（序列 [0.16, 0.10, 0.06, 0.03]，每回合结算后逐层衰减、末层消失）
//   ③ 性奋代价：每次新婚同步扣宋青书血量上限，penalty 逐次 +1（core/15 submitXinHun，与 V5.x「性奋惩罚」同源）
//   ④ 快乐回血：每回合结算按层数给周芷若回血（core/15 tickKuaiLeHeal），层数不应超过累计叠加次数
// 三条复发信号（各对应一处历史上真出过问题的口径）：
//   1) 新婚扣血量 ≠ 1 / 叠加百分比 ≠ 16% —— 参数漂移或新层错用了已衰减的百分比
//   2) 新婚与性奋代价不是 1:1 配对 —— 性奋惩罚漏扣（V5.x 曾出现"仅 _xingFenActive 激活时才扣"的漏扣）
//      或重复扣；penalty 不是每次 +1 —— 递增口径退化成固定值/倍率
//   3) 快乐回血层数 > 累计新婚次数 —— 叠层被重复 push（同一层算了两次，回血虚高）
// 误报规避：
//   - 性奋代价有 `unit.maxHp > 1` 保底（core/15），宋青书上限被扣到 ≤2 时合法地不再扣 → 此时跳过配对校验
//   - 只按文本解析，不依赖 fact 层字段（渲染层会抹掉 factType/data，见 141 的口径说明）
//   - 本场无新婚条目直接 skip（宋青书/周芷若为随机精英，常不同场）
export const VER = 'tests/health-rules/144-xinhun-kuaile.js V6.1.11';

// 当前版本数值（对照 记录-更改履历.md / content/200game-data.json 宋青书.xinHun）
const XINHUN_DEDUCT = 1;   // hpDeduct
const XINHUN_PCT = 16;     // healLevels[0] = 0.16

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

export const rule91 = {
    group: '精英技能回归',
    name: '宋青书新婚快乐链路(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var xinhun = [];     // 新婚条目：{ deduct, pct, stack }
        var xingfen = [];    // 性奋代价：{ penalty }
        var kuaiLe = [];     // 快乐回血：{ layers, heal, hpBefore, hpAfter }
        for (var i = 0; i < log.length; i++) {
            var texts = entryTexts(log[i]);
            for (var t = 0; t < texts.length; t++) {
                var s = texts[t];
                if (s.indexOf('💒 新婚') !== -1) {
                    var dm = s.match(/被扣除(\d+)点血量/);
                    var pm = s.match(/叠加一层快乐\((\d+)%\)/);
                    var sm = s.match(/当前快乐层数：(\d+)/);
                    xinhun.push({
                        deduct: dm ? parseInt(dm[1], 10) : null,
                        pct: pm ? parseInt(pm[1], 10) : null,
                        stack: sm ? parseInt(sm[1], 10) : null
                    });
                    break;
                }
                if (s.indexOf('💗 性奋代价') !== -1) {
                    var xm = s.match(/（-(\d+)）/);
                    if (xm) xingfen.push({ penalty: parseInt(xm[1], 10) });
                    break;
                }
                if (s.indexOf('💚 快乐回血') !== -1) {
                    var hm = s.match(/回复(\d+)点生命/);
                    var lm = s.match(/（(\d+)层触发）/);
                    var bm = s.match(/血量\s*(\d+)\s*→\s*(\d+)/);
                    kuaiLe.push({
                        heal: hm ? parseInt(hm[1], 10) : null,
                        layers: lm ? parseInt(lm[1], 10) : null,
                        hpBefore: bm ? parseInt(bm[1], 10) : null,
                        hpAfter: bm ? parseInt(bm[2], 10) : null
                    });
                    break;
                }
            }
        }
        if (xinhun.length === 0) return 'skip'; // 本场无新婚（随机精英未同场）

        // 复发信号1：新婚扣血量 / 新层百分比与当前版本不符
        for (var k = 0; k < xinhun.length; k++) {
            var x = xinhun[k];
            if (x.deduct !== null && x.deduct !== XINHUN_DEDUCT) {
                return { fail: true, msg: '复发：新婚扣血' + x.deduct + '点，与当前版本 hpDeduct=' + XINHUN_DEDUCT + ' 不符（content 宋青书.xinHun 参数漂移）' };
            }
            if (x.pct !== null && x.pct !== XINHUN_PCT) {
                return { fail: true, msg: '复发：新婚叠加快乐' + x.pct + '%，与当前版本 healLevels[0]=' + XINHUN_PCT + '% 不符（新层错用衰减值或序列首元素被改）' };
            }
        }

        // 复发信号3：快乐回血层数不得超过累计新婚次数（叠层被重复 push 时层数会虚高）
        for (var q = 0; q < kuaiLe.length; q++) {
            var kl = kuaiLe[q];
            if (kl.layers !== null && kl.layers > xinhun.length) {
                return { fail: true, msg: '复发：快乐回血按' + kl.layers + '层结算，但全场新婚仅叠加' + xinhun.length + '次（叠层被重复计算，回血虚高）' };
            }
            // 回写同步：hpAfter 应等于 hpBefore + heal（fact 与播放器两侧口径一致）
            if (kl.heal !== null && kl.hpBefore !== null && kl.hpAfter !== null && kl.hpAfter !== kl.hpBefore + kl.heal) {
                return { fail: true, msg: '复发：快乐回血' + kl.heal + '点，但血量' + kl.hpBefore + '→' + kl.hpAfter + ' 与回写不一致（治疗量与实际血量脱节）' };
            }
        }

        // 复发信号2：性奋代价与新婚 1:1 配对 + penalty 每次 +1
        //   宋青书（性奋代价的承受者）在两侧阵容里找，取血上限判断"是否还有余量可扣"
        var song = null;
        var pools = [afterA || [], afterE || [], beforeA || [], beforeE || []];
        for (var p = 0; p < pools.length && !song; p++) {
            var arr = pools[p] || [];
            for (var u = 0; u < arr.length; u++) {
                var un = arr[u];
                if (un && (un.isSongQingshu || un.name === '宋青书')) { song = un; break; }
            }
        }
        // maxHp ≤ 2 时 core/15 的 `unit.maxHp > 1` 保底会合法地停扣，此时不做配对校验避免误报
        if (!song || (typeof song.maxHp === 'number' ? song.maxHp : 99) > 2) {
            if (xingfen.length < xinhun.length) {
                return { fail: true, msg: '复发：新婚' + xinhun.length + '次但性奋代价仅' + xingfen.length + '次（性奋惩罚漏扣，V5.x 同类问题复发）' };
            }
            if (xingfen.length > xinhun.length) {
                return { fail: true, msg: '复发：性奋代价' + xingfen.length + '次 > 新婚' + xinhun.length + '次（每次新婚应只扣一次上限，疑重复扣）' };
            }
            for (var f = 1; f < xingfen.length; f++) {
                var step = xingfen[f].penalty - xingfen[f - 1].penalty;
                if (step !== 1) {
                    return { fail: true, msg: '复发：性奋代价步长异常，第' + f + '次 ' + xingfen[f - 1].penalty + ' → 第' + (f + 1) + '次 ' + xingfen[f].penalty + '（应每次 +1 递增）' };
                }
            }
        }
        return { fail: false };
    }
};
