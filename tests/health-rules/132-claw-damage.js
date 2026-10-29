// 回归规则：第四关 BOSS 周芷若·九阴白骨爪 伤害/调血是否符合设计
// 设计（content/200game-data.json 周芷若 mechanics[0] type=chainClaw；2026-09-29 单一真值源收口后
//   这是唯一出处，core/01 的 DESC_TRUTH 也从这里取真值插值技能说明）：
//   baseDmg=2（jealous.baseDmg=2，张无忌在场走 jealous 档）、lostHpRatio=0.015（按已损失生命）、
//   maxHpRatio=0.01（按最大生命）、executeThreshold=0.15（斩杀线）、连锁 chainProcChance=0.8。
//   ⚠ 2026-09-30 content 5.6.17 起 baseDmg 由 1.5 调为 2 —— 旧头注释的 1.5 已过期；
//     下限自 V6.2.0 起不再写死，由 getDesignFloor() 从 content 现读（单一真值源）。
// 复发信号：
//   1. 设计值(designedDmg) 丢失/带浮点尾巴/低于设计下限 floor，或落地值(dmg) 越界（负数/超设计值/带尾巴）
//   2. 连锁(同目标连续爪击)伤害递减 —— 未按"已损失生命比例"递增调血
//   3. 标记"斩杀"但同组无处决条目（execute 声明被吞/丢失）
// 对应已修 Bug：九阴白骨爪伤害计算/斩杀/连锁相关回归
// 优化（V6.1.x 复核）：伤害为小数（当时 baseDmg=1.5 → 渲染"造成 1.5 点伤害"），原正则 (\d+) 只匹配
//   整数，导致绝大多数真实爪击被跳过、回归检测漏检；改为 (\d+(?:\.\d+)?) 捕获小数，并把底线收紧到
//   1.5（历史值；2026-09-30 content 调为 2，V6.2.0 起 floor 改为从 content 动态取）。
//
// 优化（V6.1.15，第 7 趟）：修「整条规则恒空转」—— 数据源与 130/133/134/143 同源同病。
//   实测（120 场）：render/30 的 attack-group 自身**全部不带 .text**，而 renderClawHitFact（L731）
//   那条「🐾 九阴白骨爪追击/连锁！甲 对 乙 造成 X 点伤害」是作为 **entries 子条目**挂在攻击组里的
//   （同场的 renderClawExecuteFact 斩杀条目亦然，见 133 的注释），顶层命中数为 0。
//   旧写法 `for (log) { if (!e.text) continue; }` 把所有攻击组直接跳过 → 120 场 0 命中。
//   改法：复用 133 的 collectNodes（数组元素 → 顶层 → attack-group entries）摊平后再扫，
//   判据（伤害底线 1.5 / 连锁不递减）一字未动 —— 规则此前从未真正生效过，谈不上"放宽"。
//   遗留（本趟刻意不动，避免一次改两处）：判据2「斩杀后 hp 残留」读的 `clawTargetHpAfter` 字段在
//   现行 render/30 里已不存在（现字段为 hpAfter / clawTargetUid），该判据恒空转，下一趟可照
//   133 路径2 的口径改为校验斩杀条目带 isExecute + clawTargetUid。
//
//
export const VER = 'tests/health-rules/132-claw-damage.js V6.3.0';
// 用 as 保留原调用名 collectNodes：调用点（下方遍历）不改，避免"改名漏改调用点"这类回归。
import { collectNodesGrouped as collectNodes } from '../122health-utils.js';
import { getGameData } from '../../core/01config-5v5-test.js';
import { MECHANIC_TYPES, FACT_TYPES } from '../../infra/56-battle-enums.js';

// 设计下限 floor（V6.2.0）：真心值在 content —— 张无忌在场走 jealous.baseDmg、否则 baseDmg
//   （modules/26 chainClaw：`baseHit = zhangAlive ? decl.jealous?.baseDmg : decl.baseDmg`）。
//   引擎 bonusDmg = floor((baseHit + max(0, ratioDmg)) * 10) / 10 ≥ floor10(baseHit) ≥ floor10(min(a,b))，
//   故 floor10(min(baseDmg, jealous.baseDmg)) 是对任意 ratioDmg 都成立的硬下界。
//   取不到配置（未加载/字段缺失）兜底 2 —— 与当前 content 一致；数值变更以 content 为准。
function getDesignFloor() {
    try {
        var gd = getGameData();
        var zhou = gd && gd.characters && gd.characters['周芷若'];
        var ms = (zhou && zhou.mechanics) || [];
        for (var i = 0; i < ms.length; i++) {
            if (!ms[i] || ms[i].type !== MECHANIC_TYPES.CHAIN_CLAW) continue;
            var a = ms[i].baseDmg;
            var b = ms[i].jealous && ms[i].jealous.baseDmg;
            var vals = [];
            if (typeof a === 'number' && isFinite(a)) vals.push(a);
            if (typeof b === 'number' && isFinite(b)) vals.push(b);
            if (vals.length) return Math.floor(Math.min.apply(null, vals) * 10) / 10;
        }
    } catch (e) { /* 数据未就绪：走兜底 */ }
    return 2;
}

// 已损失生命比例 lostHpRatio（V6.3.0）：判据 3 用它算「回血导致设计值合法下降多少」。
//   真值在 content 周芷若 chainClaw.lostHpRatio；取不到兜底 0.015（与当前 content 一致）。
function getLostHpRatio() {
    try {
        var gd = getGameData();
        var zhou = gd && gd.characters && gd.characters['周芷若'];
        var ms = (zhou && zhou.mechanics) || [];
        for (var i = 0; i < ms.length; i++) {
            if (!ms[i] || ms[i].type !== MECHANIC_TYPES.CHAIN_CLAW) continue;
            var r = ms[i].lostHpRatio;
            if (typeof r === 'number' && isFinite(r) && r > 0) return r;
        }
    } catch (e) { /* 数据未就绪：走兜底 */ }
    return 0.015;
}

// 一位小数无浮点尾巴（V6.2.0）：按引擎收敛式 round(v*10)/10 转一遍，字符串不等 = 带尾巴。
//   真尾巴样例：2.8 − 2 = 0.7999999999999998（'0.7999999999999998' ≠ '0.8'）。
function hasFloatTail(v) { return String(v) !== String(Math.round(v * 10) / 10); }

// 战报节点收集：数组元素（render/30 少数渲染函数返回数组）→ 顶层条目 → attack-group 的 entries 子条目。
// 只摊一层子条目：孙层没有爪击语义，再深会重复计数。顺序保持战报原序，连锁递增判定才有效。
// V6.1.16：每个节点带上所属顶层组号 gi（数组元素沿用其外层条目的组号），供判据 2 做同组判定。


export const rule79 = {
    group: '数值回归',
    name: '九阴白骨爪伤害(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        var floorDmg = getDesignFloor(); // 设计下限（content 现读，兜底 2）
        var lostHpRatio = getLostHpRatio(); // 判据 3 的回血容差系数（content 现读，兜底 0.015）
        var EPS = 1e-9;
        var prev = null; // { name, designed, hpAfter }
        var saw = false;
        var nodes = collectNodes(log);
        // 判据 2 的组级信号（V6.1.16）：处决条目与标记斩杀的 hit 谁先渲染未证，先收集后判定
        var execHitGroups = {};   // gi -> 有标记斩杀的 hit（isExecute 且带 dmg 字段）
        var execEntryGroups = {}; // gi -> 有处决条目（renderClawExecuteFact，文本固定含「九阴白骨爪斩杀！」）
        for (var j = 0; j < nodes.length; j++) {
            var e = nodes[j].e;
            var gi = nodes[j].gi;
            if (!e || !e.text) continue;
            if (e.text.indexOf('九阴白骨爪') === -1) continue;
            // 组级收集要在下面的 continue 之前（处决条目过不了伤害正则，hit 判定也不能依赖正则命中）
            if (e.text.indexOf('九阴白骨爪斩杀！') !== -1) { execEntryGroups[gi] = true; continue; }
            if (e.isExecute === true && e.dmg !== undefined) execHitGroups[gi] = true;
            // 伤害为小数（如 1.5 / 2.5），必须捕获小数，否则规则会跳过全部真实爪击而漏检。
            // V6.1.19：再放宽到可捕获负数/NaN —— 判据1 改校验「有限且≥0」，这两类必须被正则吃到，
            //   否则「造成 -1/NaN 点伤害」会因正则不匹配而整条跳过，判据1 反而空转。
            var m = e.text.match(/对 (.+?) 造成 (-?\d+(?:\.\d+)?|NaN) 点伤害/);
            if (!m) continue;
            saw = true;
            var name = m[1];
            var raw = m[2];
            var dmg = (raw === 'NaN') ? NaN : parseFloat(raw);
            // 字段口径修正（第 21 轮）：原名 clawTargetHpAfter 已随 fact 改名撤除、全库再无写入源，
            //   故 hpAfter 恒为 undefined —— 不只判据2 是死分支，**判据3 的连锁调血校验也一直是空转**
            //   （undefined 参与的四则运算得 NaN，等值校验永不成立）。现行 render/35 渲染出的是
            //   hpAfter（同条目另有 clawTargetUid），取值来自 modules/26 的 simulatedTargetHp。
            //   按现行字段重写 —— 这次是让判据3 真正生效，不是放宽。
            var hpAfter = e.hpAfter;

            // 1. 落地伤害必须是**有限数且 ≥0**（V6.1.19 口径保持；抓 NaN/负数两类计算断链）。
            //    为什么旧判据失效（有实证，勿复原）：2026-10-09 引擎 V6.0.8 把爪击 fact 的 `data.dmg`
            //    回填为减伤后实际落地值（小昭·姊乾坤衍生按爪减伤，CLAW_HIT_APPLIED 相位），
            //    渲染与规则读到的已**不是**设计值 bonusDmg —— 减伤后合法低于下限（实测 0.7999999999999998，
            //    甚至可为 0）。设计值守护自 V6.2.0 起由 designedDmg 字段承担，见 1b。
            if (!isFinite(dmg)) {
                return { fail: true, msg: '复发：九阴白骨爪落地伤害非有限数「' + raw + '」（设计值/减伤计算断链，'
                    + '如 modules/26 chainClaw 的 decl.jealous?.baseDmg 缺失 → NaN）' };
            }
            if (dmg < 0) {
                return { fail: true, msg: '复发：九阴白骨爪落地伤害为负数 ' + dmg
                    + '（core/16 CLAW_CHAIN 的 Math.round(Math.max(0, 伤害-减伤)*10)/10 下限守卫被破坏）' };
            }
            // 1b. 设计下限守护（V6.2.0 重建）：designedDmg 由 core/16 回填（= modules/26 设计值 bonusDmg）、
            //     render/35 透传。缺失 = 回填断链（或 decl 被整条跳过）；带尾 = 设计值被浮点污染
            //     （应恒为 floor(×10)/10 的一位小数）；低于 floor = baseDmg/jealous 取值断链；
            //     落地 dmg > designed = 减伤/回填写反（落地不可能超过设计）。
            if (typeof e.designedDmg !== 'number' || !isFinite(e.designedDmg)) {
                return { fail: true, msg: '复发：九阴白骨爪条目缺设计值 designedDmg（core/16 未回填：'
                    + 'decl 被跳过或字段断链，落地值 0~设计值 的下限守护不可还原）' };
            }
            if (hasFloatTail(e.designedDmg)) {
                return { fail: true, msg: '复发：九阴白骨爪设计值带浮点尾巴 ' + e.designedDmg
                    + '（应恒为一位小数，modules/26 bonusDmg 的 floor(×10)/10 收敛被破坏）' };
            }
            if (e.designedDmg < floorDmg - EPS) {
                return { fail: true, msg: '复发：九阴白骨爪设计值低于下限：' + e.designedDmg + ' 低于设计下限 ' + floorDmg
                    + '（content 周芷若 chainClaw 声明下界；如 decl.jealous?.baseDmg 缺失或改错）' };
            }
            if (dmg > e.designedDmg + EPS) {
                return { fail: true, msg: '复发：九阴白骨爪落地值超过设计值：' + dmg + ' 超过设计值 ' + e.designedDmg
                    + '（减伤/回填写反，落地不可大于设计）' };
            }
            // 2.（已删除，第 21 轮）原判据「标记斩杀则目标血量应为 0」是**自相矛盾的伪判据**：
            //    modules/26elite-sixsects.js:534 的斩杀定义就是
            //      isExecute = !isDeadByHit && hpPctAfter <= execThreshold && simulatedTargetHp > 0
            //    —— 即"没被打死、但血量跌破阈值且仍 > 0"才叫斩杀。所以 isExecute 为真时
            //    hpAfter ≠ 0 是**设计使然**，该判据一复活就必然误报（实测 15/120 场全假红）。
            //    已删除而非放宽。斩杀真正应保证什么（例如"该连锁序列内最终致死"）属业务语义，
            //    不猜，记待确认：见体检迭代日志第 21 轮「报业务侧」。
            // 3. 连锁调血：同一目标「同一次连锁序列内」的伤害应按"已损失生命比例"递增（不可递减）。
            //    为什么必须限定在同一次序列内（V6.1.15 第 7 趟修正，旧写法一复活就误报 3/120 场）：
            //    core/15-skill-mechanisms.js L358 的伤害 = baseHit + floor((已损失生命×lostHpRatio
            //    + 最大生命×maxHpRatio)×10)/10。只要两次爪击之间目标**回过血**（九阳/快乐/热血/carry
            //    抬血上限等），已损失生命变小 → 伤害合法变小。实测 seed=6 stage=4：张无忌在两爪之间
            //    被九阳回血 17 点（血 62→79 再挨打回 55），于是 6.9→6.7，属设计使然而非回归。
            //    同序列判据：同一次 submitChainClaw 的 hits 是连续模拟出来的，故必然满足
            //    「上一爪 hpAfter − 本爪 dmg ≈ 本爪 hpAfter」（容差 0.05 消化浮点）。不满足即说明
            //    中间隔着别的结算（回血/其他单位攻击），属新序列起点或跨次，跳过递增校验。
            //    ★ V6.3.0 口径修正（2026-10-20 第 111 轮）：原判据比的是**减伤后的落地 dmg**，
            //    一旦两爪之间目标的减伤层变厚就必然假红。实证 seed=20 stage=4 第4回合：殷天正被
            //    小昭·姊蝶变附身，「乾坤衍生」逐爪给减伤（1→2），设计值 5.6→6.6 一路正常递增，
            //    落地值却在减伤 1→2 那一步 5.2→4.3（正好少 1.0）——调血没问题，是判据拿错了量。
            //    现改判 designedDmg（减伤层之前的真值，render/35 已透传），落地值越界仍由判据 1b 守。
            //    回血导致的合法下降按 lostHpRatio×回血量 放行（+0.11 取整/浮点余量），其余下降即报。
            var curDesigned = (typeof e.designedDmg === 'number' && isFinite(e.designedDmg)) ? e.designedDmg : dmg;
            if (prev && prev.name === name && typeof prev.designed === 'number'
                && typeof prev.hpAfter === 'number' && typeof e.hpAfter === 'number'
                && Math.abs((prev.hpAfter - dmg) - e.hpAfter) < 0.05) {
                // 本爪起手血量 = e.hpAfter + dmg；高于上一爪收尾血量即为中间回血（回血合法抬高设计值下限）
                var healGain = Math.max(0, (e.hpAfter + dmg) - prev.hpAfter);
                var allowDrop = lostHpRatio * healGain + 0.11;
                if (curDesigned < prev.designed - allowDrop) {
                    return { fail: true, msg: '复发：九阴白骨爪同一次连锁内设计伤害递减 ' + prev.designed + '→' + curDesigned
                        + '（未按已损失血量递增调血；期间回血 ' + Math.round(healGain * 10) / 10 + ' 点，容差 ' + (Math.round(allowDrop * 100) / 100) + '）' };
                }
            }
            prev = { name: name, designed: curDesigned, hpAfter: e.hpAfter };
        }
        // 2.（V6.1.16）斩杀一致性：标记斩杀的 hit → 同一 attack-group 必须存在处决条目。
        //    依据 core/15 L407-413：isExecute 触发时 executeInfo 必然同组产出（declaration = {hits, execute}）。
        //    缺失 = execute 声明被吞/丢失（回放器曾有的"吞数组"bug 正是这种形态，第 6 轮修过一次）。
        for (var g in execHitGroups) {
            if (!execEntryGroups[g]) {
                return { fail: true, msg: '复发：九阴白骨爪标记斩杀但同组无处决条目（第' + g + '组，execute 声明缺失/被吞）' };
            }
        }
        // 4. 源头级守护（V6.2.0，仅回放器传第 7 参 facts 时）：原始 fact 流独立于渲染文案，读 data 段。
        //    为什么放在"无爪击→skip"之前：即使本场渲染层没扫到爪击节点，源头数据也要独立对账。
        //    data.dmg 无尾 = 锁住 core/16 V6.0.9 的源头收敛（此前只洗显示出口，原始流/规则读到尾巴）。
        //    只认 CLAW_HIT：执行条目是 CLAW_EXECUTE（另类，无 designedDmg 属正常）。
        if (facts && facts.length) {
            for (var k = 0; k < facts.length; k++) {
                var f = facts[k];
                if (!f || f.factType !== FACT_TYPES.CLAW_HIT || !f.data) continue;
                var fd = f.data;
                if (typeof fd.dmg !== 'number' || !isFinite(fd.dmg) || fd.dmg < 0) {
                    return { fail: true, msg: '复发：clawHit 原始 fact 的 data.dmg 非法（' + fd.dmg + '，应有限且≥0）' };
                }
                if (hasFloatTail(fd.dmg)) {
                    return { fail: true, msg: '复发：clawHit 原始 fact 的 data.dmg 带浮点尾巴 ' + fd.dmg
                        + '（core/16 源头收敛被撤；显示出口洗白不顶用）' };
                }
                if (typeof fd.designedDmg !== 'number' || !isFinite(fd.designedDmg)) {
                    return { fail: true, msg: '复发：clawHit 原始 fact 缺 data.designedDmg（core/16 未回填设计值）' };
                }
                if (hasFloatTail(fd.designedDmg)) {
                    return { fail: true, msg: '复发：clawHit 原始 fact 的 data.designedDmg 带浮点尾巴 ' + fd.designedDmg };
                }
                if (fd.designedDmg < floorDmg - EPS) {
                    return { fail: true, msg: '复发：clawHit 原始 fact 的设计值 ' + fd.designedDmg + ' 低于设计下限 ' + floorDmg };
                }
                if (fd.dmg > fd.designedDmg + EPS) {
                    return { fail: true, msg: '复发：clawHit 原始 fact 的落地值 ' + fd.dmg + ' 超过设计值 ' + fd.designedDmg };
                }
            }
        }
        if (!saw) return 'skip';
        return { fail: false };
    }
};