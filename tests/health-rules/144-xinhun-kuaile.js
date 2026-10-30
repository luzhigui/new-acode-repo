// 回归规则：宋青书·新婚快乐链路 — 覆盖此前完全没有体检项盯的一整套机制：
//   ① 新婚：宋青书每次攻击命中，扣周芷若 1 点血（宋青书 mechanics type=xinHun 的 hpDeduct=1），并给周芷若叠 1 层快乐
//   ② 快乐层：新层百分比恒为 healLevels[0]（序列见 content/200game-data.json 宋青书 mechanics.type=xinHun.healLevels，逐层衰减、末层消失）
//   ③ 性奋代价：每次新婚同步扣宋青书血量上限，penalty 逐次 +1（core/15 submitXinHun，与 V5.x「性奋惩罚」同源）；
//      2026-10-15 起首攻免扣（老板拍板，modules/26elite-sixsects-songqingshu.js V6.26.0）：penalty = 累计攻击次数 − 1，
//      第 1 次新婚 penalty=0、不进 `penalty > 0` 门、不渲染条目 ⇒ 性奋代价条目数 = 新婚次数 − 1
//   ④ 快乐回血：每回合结算按层数给周芷若回血（core/15 tickKuaiLeHeal），层数不应超过累计叠加次数
// 三条复发信号（各对应一处历史上真出过问题的口径）：
//   1) 新婚扣血量 ≠ 1 / 叠加百分比 ≠ 16% —— 参数漂移或新层错用了已衰减的百分比
//   2) 新婚与性奋代价不是 (N−1):1 配对（2026-10-15 首攻免扣前是 1:1）—— 性奋惩罚漏扣
//      （V5.x 曾出现"仅 _xingFenActive 激活时才扣"的漏扣）或重复扣；penalty 不是每次 +1 —— 递增口径退化成固定值/倍率
//   3) 快乐回血层数 > 累计新婚次数 —— 叠层被重复 push（同一层算了两次，回血虚高）
// 误报规避：
//   - 性奋代价有 `unit.maxHp > 1` 保底（core/15），宋青书上限被扣到 ≤2 时合法地不再扣 → 此时跳过配对校验
//   - 只按文本解析，不依赖 fact 层字段（渲染层会抹掉 factType/data，见 141 的口径说明）
//   - 本场无新婚条目直接 skip（宋青书/周芷若为随机精英，常不同场）
export const VER = 'tests/health-rules/144-xinhun-kuaile.js V6.1.25';
// V6.1.24（2026-10-15 第 91 轮）跟随主代码 81105a8「性奋代价首攻免扣」：配对判据从 1:1 改为
//   (新婚次数 − 1) : 1——第 1 次新婚 penalty=0 不渲染条目（modules/26 V6.26.0）。旧判据在新设计下
//   每场必误报（实测 seed=1/2 stage=4：新婚 3 次、代价 2 次即合法）。步长/自洽判据不变。
// V6.1.23（2026-10-12）修弱判据 hpIsCap：maxHp 是浮点、fact 文本走 fmtHp(floor)，旧严格相等漏认
//   "回满截断" → seed=1/5 stage=4 两条误报；改为 Math.floor(maxHp) === hpAfter。判据强度不变。
// V6.1.25（2026-10-30 第 144 轮续）：信号2 配对校验抗两类误报 —— ① 多实例（克隆/众志成城补员）时
//   全局「新婚数 vs 性奋代价数」计数无意义（每个体各自记一套），改按 uid 数判定 cloneAmbiguous，多实例
//   直接跳过信号2（宁漏勿误）；② 触底截断：末笔性奋代价 newMaxHp≤1 说明 core/15 `maxHp>1` 保底已停扣，
//   其后新婚本就不该再出代价条目，不再判「漏扣」。单实例且未触底时信号2 原Logic不变，真漏扣/重复扣仍捕获。
import { entryTexts } from '../122health-utils.js';
import { getGameData } from '../../core/01config-5v5-test.js';

// 当前版本数值（对照 content/200game-data.json：宋青书 mechanics type=xinHun 的 hpDeduct；
//   回血档位 healLevels 两侧同名同源，见 tools/120 MECHANICS_HIDDEN_BY_TYPE）
// 注意：healLevels[0] 不再硬编码——2026-10-01 曾硬编码 16%，但 content/200game-data.json 已改为 20%，
//   规则没跟上 → 每场新婚必误报。改为运行时从游戏数据动态读取真值（单一来源），配置再改也不会漂移。
const XINHUN_DEDUCT = 1;   // hpDeduct（mechanics 真值，单一来源）

// 一条战报里可能被本规则命中的文本：顶层 text + attack-group 的 entries 子条目


// 快照里是否存在「血量上限（取整后）恰等于 hpAfter」的单位 —— 用于识别快乐回血的"回满截断"合法形态。
// 注意是弱判据（同名/同上限会误认），故只在"精确判据不成立"时兜底放行，不做反向断言。
// V6.1.23 修正（弱判据漏认回满截断 → 误报）：引擎内部 maxHp 是浮点（seed=1 stage=4 周芷若 maxHp=157.5、
//   seed=5 stage=4 =142.5），而 fact 文本经 fmtHp(floor) 显示成 157 / 142，规则从文本解析出的 hpAfter
//   是整数，旧判据 `maxHp === hpAfter` 严格相等必然不等 → 被误判为"既非 +heal 也非回满截断"。
//   故取整后再比：Math.floor(maxHp) === hpAfter。判据强度不变（仍是"上限恰等于落点"才放行），
//   只是把"浮点真值 vs 文本 floor"的表示差对齐。
function hpIsCap(pools, hpAfter) {
    if (typeof hpAfter !== 'number') return false;
    for (var i = 0; i < pools.length; i++) {
        var arr = pools[i] || [];
        for (var k = 0; k < arr.length; k++) {
            if (arr[k] && typeof arr[k].maxHp === 'number' && Math.floor(arr[k].maxHp) === hpAfter) return true;
        }
    }
    return false;
}

export const rule91 = {
    group: '精英技能回归',
    name: '宋青书新婚快乐链路(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        // healLevels[0] 运行时从游戏数据动态读取（单一来源），配置改了也不会再漂移误报
        var gd = getGameData();
        var xinHunMech = gd && gd.characters && gd.characters['宋青书'] && Array.isArray(gd.characters['宋青书'].mechanics)
            ? gd.characters['宋青书'].mechanics.find(function(m){ return m && m.type === 'xinHun'; }) : null;
        var heal0 = xinHunMech && Array.isArray(xinHunMech.healLevels) ? xinHunMech.healLevels[0] : null;
        var XINHUN_PCT = (heal0 != null) ? Math.round(heal0 * 100) : 20; // 兜底 20，与 content/200game-data.json 当前值一致
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
                    return { fail: true, msg: '复发：快乐回血与血量脱节：' + kl.heal + '点，但血量' + kl.hpBefore + '→'
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
        var songUids = {};
        for (var p = 0; p < pools.length; p++) {
            var arr = pools[p] || [];
            for (var u = 0; u < arr.length; u++) {
                var un = arr[u];
                if (un && (un.isSongQingshu || un.name === '宋青书')) {
                    if (!song) song = un;
                    if (un.uid != null) songUids[un.uid] = 1;
                }
            }
        }
        // 多实例（克隆/众志成城补员）时全局计数无意义（每个体各自记一套 新婚/性奋代价），
        //   配对/步长判据会把不同个体的序列拼到一起误报 → 宁漏勿误跳过信号2（V6.1.25 第 144 轮续补）。
        var songCount = 0; for (var su in songUids) songCount++;
        var cloneAmbiguous = songCount > 1;
        // 触底截断判定：core/15 submitXinHun 有 `unit.maxHp > 1` 保底，宋青书上限扣到 ≤1 后合法停扣。
        //   若末笔性奋代价 newMaxHp ≤ 1，说明已触底，其后新婚本就不该再产生代价条目 → 容忍少于 新婚−1。
        var lastNew = xingfen.length ? xingfen[xingfen.length - 1].newMaxHp : null;
        var floorHit = (lastNew != null && lastNew <= 1);
        // maxHp ≤ 2 时（终局快照）core 保底合法停扣，亦不做配对校验；多实例/触底时跳过计数与步长判据
        if (!song || (typeof song.maxHp === 'number' ? song.maxHp : 99) > 2) {
            // 2026-10-15 第 91 轮：主代码 81105a8（老板拍板）性奋代价首攻免扣——penalty = 累计攻击次数 − 1
            //   （modules/26elite-sixsects-songqingshu.js V6.26.0），第 1 次新婚 penalty=0、不进 `penalty > 0`
            //   门、不渲染条目 ⇒ 预期性奋代价条目数 = 新婚次数 − 1（下限 0）。旧 1:1 判据在新设计下每场必误报。
            var expectXf = Math.max(xinhun.length - 1, 0);
            if (!cloneAmbiguous && !floorHit && xingfen.length < expectXf) {
                return { fail: true, msg: '复发：性奋惩罚漏扣：新婚' + xinhun.length + '次但性奋代价仅' + xingfen.length + '次（首攻免扣后期望 ' + expectXf + ' 次；性奋惩罚漏扣，V5.x 同类问题复发）' };
            }
            if (!cloneAmbiguous && xingfen.length > expectXf) {
                return { fail: true, msg: '复发：性奋代价疑重复扣：' + xingfen.length + '次 > 新婚' + xinhun.length + '次（首攻免扣后期望 ' + expectXf + ' 次；疑重复扣）' };
            }
            if (!cloneAmbiguous) {
                for (var f = 1; f < xingfen.length; f++) {
                    var step = xingfen[f].penalty - xingfen[f - 1].penalty;
                    if (step !== 1) {
                        return { fail: true, msg: '复发：性奋代价步长异常，第' + f + '次 ' + xingfen[f - 1].penalty + ' → 第' + (f + 1) + '次 ' + xingfen[f].penalty + '（应每次 +1 递增）' };
                    }
                }
            }
        }
        return { fail: false };
    }
};
