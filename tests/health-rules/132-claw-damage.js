// 回归规则：第四关 BOSS 周芷若·九阴白骨爪 伤害/调血是否符合设计
// 设计（core/01config-5v5-test.js nineYinClaw）：baseDmg=1.5、lostHpRatio=0.015（按已损失生命）、
// maxHpRatio=0.01（按最大生命）、executeThreshold=0.15（斩杀线）、连锁 chainProcChance=0.8。
// 复发信号：
//   1. 单次伤害 < baseHit（<1.5，即设计底线都没达到；当前伤害为小数，单爪下界恰为 1.5）
//   2. 连锁(同目标连续爪击)伤害递减 —— 未按"已损失生命比例"递增调血
//   3. 标记"斩杀"但目标血量未被调为 0（斩杀后 hp 残留）
// 对应已修 Bug：九阴白骨爪伤害计算/斩杀/连锁相关回归
// 优化（V6.1.x 复核）：伤害为小数（baseDmg=1.5 → 渲染"造成 1.5 点伤害"），原正则 (\d+) 只匹配整数，
//   导致绝大多数真实爪击被跳过、回归检测漏检；改为 (\d+(?:\.\d+)?) 捕获小数，并把底线收紧到 1.5。
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
// V6.1.16 修订（2026-09-25，主线侧同步轮）：补回**现行契约的斩杀判据**。
//   第 21 轮删掉的"斩杀→hpAfter=0"是伪判据（斩杀的定义就是 hp>0 且跌破阈值，见下方注释块）；
//   但"标记斩杀"本身有一条 core 保证的现行契约可校验：core/15 L407-413 中 isExecute 触发时
//   executeInfo **必然**与 hits 同组产出（declaration = {hits, execute}，renderClawExecuteFact
//   文本固定含「九阴白骨爪斩杀！」）。故新判据 2：标记斩杀的 hit → 同一 attack-group 内必须存在
//   处决条目；缺失 = execute 声明被吞/丢失（回放器吞数组的历史 bug 正是这种形态）。
//   实现：collectNodes 带组号 gi，组级收集两路信号，主循环结束后统一判定（处决条目与 hit
//   的渲染先后顺序未证，不能在单遍循环里即时判定）。负向测试 6 例全过（含跨组不认的 C 例）。
//
// V6.1.17 取证（2026-09-26，验收轮补命中数）：判据 2' 是否真跑得起来、会不会又是恒空转，实测填上。
//   · 真实战报（stage=4，seed 1~8 共 8 局，探针直接吃 render/30 的渲染产物）：
//     爪击节点 220、处决条目 12、**带 isExecute+dmg 的爪击 12**，判据 2' 在 6/8 局被触发（12 次），
//     与处决条目严格 1:1 → 非恒空转，且当前无缺失（fail=0）。
//   · 全量回放 120 场（node tests/rules-replay.mjs）：本规则 pass=20 fail=0 skip=100
//     （skip 全落在非第四关，无爪击，符合预期），恒 skip 规则 0 条。
//   · 字段口径实证（为何判据 2' 读得到 isExecute）：爪击节点 keys =
//     `type,hpAfter,clawTargetUid,dmg,text,isClawHit,clawAttackerUid,isExecute` —— 爪击是挂在
//     attack-group 的 entries 子条目上，走 render/33:106 projectFactEntry 把 fact 附加字段并进渲染产物；
//     顶层 renderLog 不带这些字段（回放器 L198 直接用 renderLog，故必须下钻 entries 才读得到）。
//   · 判据内 `dmg !== undefined` 是**鉴别项**：处决条目自身也带 isExecute:true，靠 dmg 缺省把两者分开
//     （处决条目已在文本分支 continue，这里是双保险）。
//   · 负向测试 7 例全过：同组有处决→pass、缺处决→fail、处决在别组→fail（不跨组误认）、
//     处决先于 hit 渲染→pass（验"先收集后判定"）、未标斩杀的爪击→pass（不被判据 2 误伤）、
//     伤害 1.2→fail（判据 1 仍活）、无爪击→skip。
export const VER = 'tests/health-rules/132-claw-damage.js V6.1.17';

// 战报节点收集：数组元素（render/30 少数渲染函数返回数组）→ 顶层条目 → attack-group 的 entries 子条目。
// 只摊一层子条目：孙层没有爪击语义，再深会重复计数。顺序保持战报原序，连锁递增判定才有效。
// V6.1.16：每个节点带上所属顶层组号 gi（数组元素沿用其外层条目的组号），供判据 2 做同组判定。
function collectNodes(log) {
    var out = [];
    function walk(node, depth, gi) {
        if (!node) return;
        if (Array.isArray(node)) {
            for (var i = 0; i < node.length; i++) walk(node[i], depth, gi);
            return;
        }
        out.push({ e: node, gi: gi });
        if (depth === 0 && Array.isArray(node.entries)) {
            for (var k = 0; k < node.entries.length; k++) walk(node.entries[k], depth + 1, gi);
        }
    }
    for (var j = 0; j < log.length; j++) walk(log[j], 0, j);
    return out;
}

export const rule79 = {
    group: '数值回归',
    name: '九阴白骨爪伤害(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var prev = null; // { name, dmg }
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
            // 伤害为小数（如 1.5 / 2.5），必须捕获小数，否则规则会跳过全部真实爪击而漏检
            var m = e.text.match(/对 (.+?) 造成 (\d+(?:\.\d+)?) 点伤害/);
            if (!m) continue;
            saw = true;
            var name = m[1];
            var dmg = parseFloat(m[2]);
            // 字段口径修正（第 21 轮）：原名 clawTargetHpAfter 已随 fact 改名撤除、全库再无写入源，
            //   故 hpAfter 恒为 undefined —— 不只判据2 是死分支，**判据3 的连锁调血校验也一直是空转**
            //   （undefined 参与的四则运算得 NaN，等值校验永不成立）。现行 render/35:478 渲染出的是
            //   hpAfter（同条目另有 clawTargetUid），取值来自 modules/26:534 的 simulatedTargetHp。
            //   按现行字段重写 —— 这次是让判据3 真正生效，不是放宽。
            var hpAfter = e.hpAfter;

            // 1. 伤害底线：baseDmg=1.5（张无忌在场为 2），ratioDmg>=0 → 单爪下界恰为 1.5；
            //    任何 < 1.5 的伤害均为回归（设计底线都没达到）
            if (dmg < 1.5) {
                return { fail: true, msg: '复发：九阴白骨爪伤害<1.5 为' + dmg + '（周芷若伤害计算异常，低于设计底线 baseDmg=1.5）' };
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
            if (prev && prev.name === name && dmg < prev.dmg
                && typeof prev.hpAfter === 'number' && typeof e.hpAfter === 'number'
                && Math.abs((prev.hpAfter - dmg) - e.hpAfter) < 0.05) {
                return { fail: true, msg: '复发：九阴白骨爪同一次连锁内伤害递减 ' + prev.dmg + '→' + dmg + '（未按已损失血量递增调血）' };
            }
            prev = { name: name, dmg: dmg, hpAfter: e.hpAfter };
        }
        // 2.（V6.1.16）斩杀一致性：标记斩杀的 hit → 同一 attack-group 必须存在处决条目。
        //    依据 core/15 L407-413：isExecute 触发时 executeInfo 必然同组产出（declaration = {hits, execute}）。
        //    缺失 = execute 声明被吞/丢失（回放器曾有的"吞数组"bug 正是这种形态，第 6 轮修过一次）。
        for (var g in execHitGroups) {
            if (!execEntryGroups[g]) {
                return { fail: true, msg: '复发：九阴白骨爪标记斩杀但同组无处决条目（第' + g + '组，execute 声明缺失/被吞）' };
            }
        }
        if (!saw) return 'skip';
        return { fail: false };
    }
};
