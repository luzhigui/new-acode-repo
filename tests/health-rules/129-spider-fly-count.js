// 回归规则：小昭妹妹飞天免疫次数 — 每单位每场限 3 次（27elite-mingjiao.js 的 state._spiderRemaining||3）
//   计数口径：每次飞天由 core/17 将 _spiderRemaining = Math.max(0, 原值-1) 扣减，故首飞剩 2、终飞剩 0，且永不为负。
// 复发信号（三层）：
//   1) 单单位飞天超过 3 次（次数未正确递减 / 飞天误触发）；
//   2) "剩余次数"回退或重置（如由 1 跳回 2，计数被重复授权，溢出）；
//   3) "剩余次数"停留不降（如续两次都是 2，扣减失效）。
// 旧版只比"全场合计 > 3"且查"负数"，但负数已被 Math.max(0,..) 兜底永不可见（死代码），
//   且未校验逐次扣减——计数卡死在 2 的bug会被合计阈值放过。现改为按 spiderUid 逐单位核对。
// 对应已修 Bug：小昭妹妹飞天误触发、飞天后仍行动、飞天免疫次数超限
//
// 优化（V6.1.15，第 8 趟）：修「整条规则恒空转」—— 数据源与 132/133 同源同病。
//   实测（120 场）：战报顶层「🕷️ 飞天」命中 **0**，摊平到 attack-group 的 entries 后命中 **74**（52 场）。
//   根因：飞天那条不是独立顶层条目，而是由 render/34-facts-attack.js L231-233 在**免疫攻击组**
//   （renderImmuneFact 的 immuneGroup）里 `entries.push(getFactRenderer(SPIDER_FLY)(fact.flyData))`
//   挂成子条目的（顶层只有 immuneGroup 自身，而它不带 .text）。旧写法 `if (!e.text) continue`
//   把所有攻击组直接跳过 → 120 场一次都没真正跑过。
//   改法：复用 132/133 的 collectNodes（数组元素 → 顶层 → attack-group entries）摊平后再扫，
//   三条判据（负数 / 回退 / 停留不降 / 每单位上限 3）一字未动 —— 规则此前从未生效过，谈不上"放宽"。
export const VER = 'tests/health-rules/129-spider-fly-count.js V6.1.15';
import { collectNodes } from '../122health-utils.js';

// 战报节点收集：数组元素（渲染层少数函数返回数组）→ 顶层条目 → attack-group 的 entries 子条目。
// 只摊一层：飞天只挂在免疫组的 entries 上，再深会重复计数。顺序保持战报原序，逐次递减判定才有效。


export const rule76 = {
    group: '精英技能回归',
    name: '小昭妹飞天免疫次数超限(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var cap = 3; // 与 27elite-mingjiao.js 的 _spiderRemaining||3 一致（每单位每场限 3 次）
        var perUnit = {}; // uid -> { count, lastRem }
        var nodes = collectNodes(log);
        for (var j = 0; j < nodes.length; j++) {
            var e = nodes[j];
            if (!e || !e.text) continue;
            if (e.text.indexOf('🕷️ 飞天') === -1) continue;
            var uid = (e.spiderUid != null) ? e.spiderUid : '__unknown__';
            var m = e.text.match(/剩余次数：(-?\d+)/);
            var rem = (m) ? parseInt(m[1], 10) : null;
            var st = perUnit[uid];
            if (!st) { st = { count: 0, lastRem: null }; perUnit[uid] = st; }
            st.count++;
            // 现版本 _spiderRemaining 经 Math.max(0,...) 兜底，剩余次数不应为负（保留为防御性断言）
            if (rem !== null && rem < 0) {
                return { fail: true, msg: '复发：小昭妹飞天"剩余次数"出现负数' + rem + '（次数超限/未正确递减）' };
            }
            // 同单位每次飞天剩余次数应严格 -1：不得回退（重置/重复授权），也不得停留不降（扣减失效）
            if (st.lastRem !== null && rem !== null) {
                if (rem > st.lastRem) {
                    return { fail: true, msg: '复发：小昭妹飞天剩余次数由' + st.lastRem + '回退到' + rem + '（计数被重置/重复授权，溢出）' };
                }
                if (rem === st.lastRem && st.lastRem > 0) {
                    return { fail: true, msg: '复发：小昭妹飞天剩余次数停留于' + st.lastRem + '未递减（次数未正确扣减）' };
                }
            }
            st.lastRem = rem;
        }
        // 逐单位核对上限（每单位限 3 次，而非全场合计 3 次）
        for (var u in perUnit) {
            if (perUnit[u].count > cap) {
                return { fail: true, msg: '复发：小昭妹飞天免疫' + perUnit[u].count + '次，超过每单位上限' + cap + '（飞天误触发/次数未递减）' };
            }
        }
        if (Object.keys(perUnit).length === 0) return 'skip';
        return { fail: false };
    }
};
