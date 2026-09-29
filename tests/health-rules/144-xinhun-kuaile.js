// 回归规则：宋青书·新婚快乐链路 — 覆盖此前完全没有体检项盯的一整套机制：
//   ① 新婚：宋青书每次攻击命中，扣周芷若 1 点血（宋青书 mechanics type=xinHun 的 hpDeduct=1），并给周芷若叠 1 层快乐
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
export const VER = 'tests/health-rules/144-xinhun-kuaile.js V6.1.21';
import { entryTexts } from '../122health-utils.js';

// 当前版本数值（对照 content/200game-data.json：宋青书 mechanics type=xinHun 的 hpDeduct；
//   回血档位 healLevels 两侧同名同源，见 tools/120 MECHANICS_HIDDEN_BY_TYPE）
const XINHUN_DEDUCT = 1;   // hpDeduct（mechanics 真值，单一来源）
const XINHUN_PCT = 16;     // healLevels[0] = 0.16

// 一条战报里可能被本规则命中的文本：顶层 text + attack-group 的 entries 子条目


// 快照里是否存在「血量上限恰等于 hpAfter」的单位 —— 用于识别快乐回血的"回满截断"合法形态。
// 注意是弱判据（同名/同上限会误认），故只在"精确判据不成立"时兜底放行，不做反向断言。
function hpIsCap(pools, hpAfter) {
    if (typeof hpAfter !== 'number') return false;
    for (var i = 0; i < pools.length; i++) {
        var arr = pools[i] || [];
        for (var k = 0; k < arr.length; k++) {
            if (arr[k] && arr[k].maxHp === hpAfter) return true;
        }
    }
    return false;
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
                    // 第 43 轮补：连同「血量上限 A → B」一起解析 —— 用于 fact 内部自洽判据（见下方信号0）。
                    //   起因：T4/T5 类变异证明「只校验步长/配对」抓不到**整体平移**的错值
                    //   （penalty 每笔 +5 后步长仍为 1，旧判据全绿）。声明与实际一对账就露馅。
                    var mm = s.match(/血量上限\s*(\d+(?:\.\d+)?)\s*→\s*(\d+(?:\.\d+)?)/);
                    if (xm) xingfen.push({
                        penalty: parseInt(xm[1], 10),
                        oldMaxHp: mm ? parseFloat(mm[1]) : null,
                        newMaxHp: mm ? parseFloat(mm[2]) : null
                    });
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
                return { fail: true, msg: '复发：新婚扣血' + x.deduct + '点，与当前版本 hpDeduct=' + XINHUN_DEDUCT + ' 不符（宋青书 mechanics type=xinHun 的真值漂移）' };
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
            // V6.1.15 第 7 趟修正（上游 core/15 V6.0.3「快乐回血 fact 的 hpAfter 改预测值」引发）：
            //   现在 hpBefore = fmtHp(floor(unit.hp))、hpAfter = fmtHp(min(maxHp, unit.hp + totalHeal))，
            //   于是合法形态有两种 —— ① 精确：hpAfter - hpBefore 等于 heal 或 heal-1（两段各自 floor，
            //   最多差 1）；② **回满截断**：hpAfter 顶到该单位血量上限（实测 seed=1 170→175 回复 28、
            //   seed=3 144→175 回复 56，都是被 maxHp 截断，属设计使然）。旧判据只认①，上游一改
            //   就 120 场误报 18 场。截断判定取「快照里存在 maxHp 恰等于 hpAfter 的单位」，
            //   拿不到快照时该条退化为只认①（宁可漏报也不硬报）。
            if (kl.heal !== null && kl.hpBefore !== null && kl.hpAfter !== null) {
                var diff = kl.hpAfter - kl.hpBefore;
                var exact = (diff === kl.heal || diff === kl.heal - 1);
                var pools2 = [afterA || [], afterE || [], beforeA || [], beforeE || []];
                if (!exact && !hpIsCap(pools2, kl.hpAfter)) {
                    return { fail: true, msg: '复发：快乐回血' + kl.heal + '点，但血量' + kl.hpBefore + '→'
                        + kl.hpAfter + ' 既非 +' + kl.heal + ' 也非回满截断（治疗量与实际血量脱节）' };
                }
            }
        }

        // 复发信号0（第 43 轮新增，T5 补牙）：**fact 内部自洽** —— 声明扣了多少 vs 血上限实际变了多少。
        //   渲染（render/35 L328）：`💗 性奋代价：宋青书 血量上限 100 → 98（-2）`
        //   penalty 只是一次「声明」，oldMaxHp/newMaxHp 才是**实际**落点；两者必须对得上。
        //   为什么必须有它：只校验「步长==1 / 与新婚 1:1 配对」会被**整体平移**的错值绕过 ——
        //   penalty 每笔都 +5 后序列变成 7,8,9…，步长仍是 1、配对仍成立，旧判据全绿（T5 实测即此）。
        //   容差 1：newMaxHp 经 Math.floor 取整（modules/26 L636），oldMaxHp 是 addMod 前值可能带小数。
        for (var z = 0; z < xingfen.length; z++) {
            var xf = xingfen[z];
            if (xf.oldMaxHp == null || xf.newMaxHp == null || !xf.penalty) continue;
            // 触底截断豁免（第 43 轮实测补）：modules/26 L632 有 `unit.maxHp > 1` 保底，
            //   宋青书上限只剩个位数时，声明扣 16 也只能扣到 1 —— 这是**设计内的合法截断**，不是脱节。
            //   不加这条会误报（A1 变异实测 seed=18 stage=4：「声明扣 16，8 → 1」即此类）。
            if (xf.newMaxHp <= 1) continue;
            var delta = xf.oldMaxHp - xf.newMaxHp;   // 实际上限减少量（正数）
            if (Math.abs(delta - xf.penalty) > 1) {
                return { fail: true, msg: '复发：性奋代价声明扣 ' + xf.penalty + '，但血量上限 ' + xf.oldMaxHp
                    + ' → ' + xf.newMaxHp + '（实际只变了 ' + delta + '，声明与实际脱节）' };
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
