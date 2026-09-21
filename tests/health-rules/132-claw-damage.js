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
export const VER = 'tests/health-rules/132-claw-damage.js V6.1.15';

// 战报节点收集：数组元素（render/30 少数渲染函数返回数组）→ 顶层条目 → attack-group 的 entries 子条目。
// 只摊一层子条目：孙层没有爪击语义，再深会重复计数。顺序保持战报原序，连锁递增判定才有效。
function collectNodes(log) {
    var out = [];
    function walk(node, depth) {
        if (!node) return;
        if (Array.isArray(node)) {
            for (var i = 0; i < node.length; i++) walk(node[i], depth);
            return;
        }
        out.push(node);
        if (depth === 0 && Array.isArray(node.entries)) {
            for (var k = 0; k < node.entries.length; k++) walk(node.entries[k], depth + 1);
        }
    }
    for (var j = 0; j < log.length; j++) walk(log[j], 0);
    return out;
}

export const rule79 = {
    group: '数值回归',
    name: '九阴白骨爪伤害(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var prev = null; // { name, dmg }
        var saw = false;
        var nodes = collectNodes(log);
        for (var j = 0; j < nodes.length; j++) {
            var e = nodes[j];
            if (!e || !e.text) continue;
            if (e.text.indexOf('九阴白骨爪') === -1) continue;
            // 伤害为小数（如 1.5 / 2.5），必须捕获小数，否则规则会跳过全部真实爪击而漏检
            var m = e.text.match(/对 (.+?) 造成 (\d+(?:\.\d+)?) 点伤害/);
            if (!m) continue;
            saw = true;
            var name = m[1];
            var dmg = parseFloat(m[2]);
            var isExec = !!(e.isExecute) || e.text.indexOf('斩杀') !== -1;
            var hpAfter = e.clawTargetHpAfter;

            // 1. 伤害底线：baseDmg=1.5（张无忌在场为 2），ratioDmg>=0 → 单爪下界恰为 1.5；
            //    任何 < 1.5 的伤害均为回归（设计底线都没达到）
            if (dmg < 1.5) {
                return { fail: true, msg: '复发：九阴白骨爪伤害<1.5 为' + dmg + '（周芷若伤害计算异常，低于设计底线 baseDmg=1.5）' };
            }
            // 2. 斩杀一致性：标记斩杀则目标血量应被调为 0
            if (isExec && hpAfter !== undefined && hpAfter !== null && hpAfter !== 0) {
                return { fail: true, msg: '复发：九阴白骨爪斩杀但目标HP剩余' + hpAfter + '（斩杀未将目标调血为0）' };
            }
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
        if (!saw) return 'skip';
        return { fail: false };
    }
};
