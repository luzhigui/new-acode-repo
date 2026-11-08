// 战报分组一致性：同一攻击组内的事件必须属于同一组（组归属、结果行同源、组不嵌套）。
// 为什么需要：日志按 attack-group 分组渲染（render/407-facts-attack.js），组是"一次攻击"的唯一容器。
//   一旦组装配错位——结果行挂到别的组、顶层漏出孤儿伤害行、组里又套组——玩家会看到
//   "报幕说打 A，伤害行结算给 B"这类错组账，体检此前只查了破防行位置（135）和分隔符重复（131），
//   没有一条规则校验"组结构本身"。
// 判据来源（2026-11-08 实测 140 场 = 20 种子 × 1~7 关，全部 0 误报）：
//   1. 顶层 damage-text 必须包在 attack-group 内（渲染器全部把伤害行塞进组 entries）；
//   2. attack-group 的 entries 里不允许再出现 attack-group（组不可嵌套，再深一层就是跑错组）；
//   3. 组的 attackerName / targetName 必须成对出现（有其一必有其二），否则组归属残缺；
//   4. 组必须带非空 uidA（uidA 是"谁打的"唯一机器可读标识，丢了就无法归组）；
//   5. uidD 缺失（被遮挡 / 拒马休息 / 无法选择目标 / 攻击力不足等空组）时，
//      组内不得出现 damage-text 或数值 hpAfter —— 结果行没有目标就无法归组；
//   6. 组内 damage-text.hpAfter 必须等于组 hpAfter —— 同一组只能有一个结算结果。
// 注意：不要断言"uidD 必须有"——实测 2864/14727 个攻击组是合法的空组（被遮挡/休息/无法选目标），
//   写死会成片假红（探针实测）。
export const VER = 'tests/health-rules/185-log-group-consistency.js V1.0.0';

export const rule185 = {
    group: '战报与渲染一致性',
    name: '战报分组一致性(组归属/结果同源)',
    test: function(ctx, log) {
        var flat = [];
        for (var i = 0; i < (log || []).length; i++) {
            var e0 = log[i];
            if (Array.isArray(e0)) { for (var j = 0; j < e0.length; j++) if (e0[j]) flat.push(e0[j]); }
            else if (e0) flat.push(e0);
        }
        var sawGroup = false;
        for (var g = 0; g < flat.length; g++) {
            var e = flat[g];
            if (!e) continue;
            // 判据1：顶层孤儿伤害行 = 事件跑到了组外
            if (e.type === 'damage-text') {
                return { fail: true, msg: '跑错组：伤害行没有包在任何 attack-group 内（顶层孤儿条目）' };
            }
            if (e.type !== 'attack-group') continue;
            sawGroup = true;
            // 判据4：uidA 必填
            if (typeof e.uidA !== 'string' || !e.uidA) {
                return { fail: true, msg: '组归属残缺：attack-group 缺少 uidA（' + (e.attackerName || '未知攻方') + '）' };
            }
            // 判据3：攻守名字成对
            if (!!e.attackerName !== !!e.targetName) {
                return { fail: true, msg: '组归属残缺：attackerName=' + e.attackerName + ' 与 targetName=' + e.targetName + ' 不成对' };
            }
            var entries = e.entries || [];
            var hasDmg = false;
            for (var k = 0; k < entries.length; k++) {
                if (entries[k] && entries[k].type === 'damage-text') hasDmg = true;
            }
            // 判据5：没有目标（uidD 缺失）却带结算结果
            if ((e.uidD === null || e.uidD === undefined) && (hasDmg || typeof e.hpAfter === 'number')) {
                return { fail: true, msg: '跑错组：无 uidD 的空组（' + (e.attackerName || '?') + '）却带结算结果行/hpAfter，结果无处归属' };
            }
            // 判据6：组结果唯一
            for (var m = 0; m < entries.length; m++) {
                var sub = entries[m];
                if (!sub) continue;
                // 判据2：组内套组
                if (sub.type === 'attack-group') {
                    return { fail: true, msg: '跑错组：attack-group 组内又嵌套 attack-group（' + (e.attackerName || '?') + '）' };
                }
                if (sub.type === 'damage-text' && typeof sub.hpAfter === 'number' && typeof e.hpAfter === 'number'
                    && Math.abs(sub.hpAfter - e.hpAfter) > 1e-6) {
                    return { fail: true, msg: '结果不同源：组 hpAfter=' + e.hpAfter + ' 与伤害行 hpAfter=' + sub.hpAfter + ' 不一致（' + (e.targetName || '?') + '）' };
                }
            }
        }
        if (!sawGroup) return 'skip'; // 本场没有任何攻击组，机制未出场
        return { fail: false };
    }
};
