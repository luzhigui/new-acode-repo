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
// V6.1.22 修订（体检迭代第 6 轮）：修恒空转真因 —— 扫错条目层级。
// 【数据契约，2026-09-22 实跑取证，改规则前务必对照】
//   飞天条目**不是顶层条目**，而是挂在 `attack-group` 的 `entries` 子条目上：
//     { type:'info', spiderAction:'fly', spiderUid, text:'🕷️ 飞天：{名} {原因}，免疫本次攻击的
//       {伤害} 点伤害，化为蜘蛛遁走！剩余次数：{N}' }
//   产出链：modules/27 的 submitSpiderFlyDeclaration 走 `data.declarations` 免疫声明
//   （携带 _flyFactData={unitName,spiderUid,reason,incomingDmg,remaining}），
//   由 attack-group 收集后经 render/30 renderSpiderFlyFact（L628）渲染成上述子条目。
//   顶层 `attack-group` 自身没有 text，只带 isImmune/isDodge 等组级标记 —— 故"只扫顶层 e.text"
//   在结构上永远命中不了：自登记以来 120 场恒 skip，一次断言都没跑（假绿）。
//   判据字段以 `spiderAction==='fly'` 为准（render/30 写死的结构化判别位），文本仅作兜底；
//   注意 render/30 L548 的「蛛落」同为 spiderAction 但值为 'return'，**不是**飞天次数信号。
export const VER = 'tests/health-rules/129-spider-fly-count.js V6.1.22';

// 收集本场全部飞天条目（顶层 + attack-group 的 entries 子条目，两层都收 = 不漏 placements 变化）
function collectFlyEntries(log) {
    var out = [];
    for (var i = 0; i < log.length; i++) {
        var e = log[i];
        if (!e) continue;
        if (e.spiderAction === 'fly') { out.push(e); continue; }
        if (!Array.isArray(e.entries)) continue;
        for (var k = 0; k < e.entries.length; k++) {
            var s = e.entries[k];
            if (s && s.spiderAction === 'fly') out.push(s);
        }
    }
    return out;
}

export const rule76 = {
    group: '精英技能回归',
    name: '小昭妹飞天免疫次数超限(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var cap = 3; // 与 27elite-mingjiao.js 的 _spiderRemaining||3 一致（每单位每场限 3 次）
        var perUnit = {}; // uid -> { count, lastRem }
        var flyEntries = collectFlyEntries(log);
        for (var j = 0; j < flyEntries.length; j++) {
            var e = flyEntries[j];
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
