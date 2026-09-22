// 回归规则：白骨爪回血刷屏 — 修复后回血日志应在追击序列末尾统一输出一条汇总
// 复发信号：回血日志夹在 clawHit 之间（说明又改回循环内逐条 push）
// 对应已修 Bug：白骨爪回血刷屏（循环内累计，循环外统一输出一条）
//
// V6.1.18 修订（体检迭代）：修同源漏报 —— 与 132/133 同一个坑。爪击条目不是顶层，
//   而是挂在 attack-group 的 entries 子条目上（子条目 isClawHit；「追击」文案也在子条目，
//   30 场探针实测顶层 isClawHit 与顶层「追击」文本双 0，子条目分别为 112/24 条）。
//   旧版 clawEvs/pursueCount 只扫顶层 → 恒 skip。
//
// V6.1.19 修订（体检迭代第 4 轮）：V6.1.18 的「夹在中间」判据写错轴——用整场 log 的
//   首尾 claw 组下标当区间，凡回血落在区间内即判复发。真实战报一场有多个 claw 序列
//   （如 seed1 stage4：claw组@6,27,48,68,124），每个序列末尾的合法汇总全都落在区间内
//   → 11 场全误报。取证（20 种子 stage4，探针复刻规则判定 + 邻域 dump）：
//   · 全部被标"夹中间"的回血，都紧跟在某个含 clawHit 的组之后（j+1），正是序列末尾
//     汇总的合法位置——含 claw 组本身（如 seed1 j=6→7、seed6 j=112→113）；
//   · 原刷屏 bug 的形态是回血被 push 进 claw 循环，落在**同一 attack-group 的两条
//     clawHit 子条目之间**——这才是"夹在中间"的真实判据（组内轴，非整场轴）。
//   改为：
//   · 主信号（组内夹击）：同一组内某回血子条目两侧都有 clawHit 子条目 → 复发；
//   · 辅助信号（刷屏）：宋青书回血信号总数（组内回血子条目 + 紧跟含 claw 组的顶层
//     汇总）> 含 claw 组数（每序列至多 1 条汇总；不紧跟 claw 组的顶层回血不计入——
//     业务侧存在无 claw 组后仍发「宋青书已满血，白骨爪未能回复生命」的现象
//     （seed1 j=88/89、seed10 j=53/54，组内 0 条 clawHit），语义待业务侧定性，
//     计入会误报，本轮只记录不判罚）。
export const VER = 'tests/health-rules/123-claw-heal-spam.js V6.1.19';

export const rule70 = {
    group: '精英技能回归',
    name: '白骨爪回血刷屏(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var allBefore = (beforeA || []).concat(beforeE || []);
        var songUid = null;
        for (var i = 0; i < allBefore.length; i++) {
            if (allBefore[i] && allBefore[i].name === '宋青书') { songUid = allBefore[i].uid; break; }
        }
        var clawGroups = 0;   // 含 clawHit 子条目的顶层组数 = 追击序列数
        var summaryHeals = 0; // 合法序列末尾汇总数（紧跟含 claw 组之后的顶层回血）
        var issues = [];
        var prevIsClawGroup = false;
        for (var j = 0; j < log.length; j++) {
            var e = log[j];
            if (!e) continue;
            var entries = Array.isArray(e.entries) ? e.entries : [];
            var clawIdx = [];
            for (var k = 0; k < entries.length; k++) {
                var en = entries[k];
                if (en && en.isClawHit) clawIdx.push(k);
            }
            if (clawIdx.length > 0) {
                // 主信号：回血子条目夹在同组两条 clawHit 之间 = 循环内逐条 push（复发）
                for (var h = 0; h < entries.length; h++) {
                    var en2 = entries[h];
                    if (!en2) continue;
                    var inGroupHeal = false;
                    if (en2.isHealEntry && songUid != null && en2.healUnitUid === songUid) inGroupHeal = true;
                    if (!inGroupHeal && en2.text && en2.text.indexOf('宋青书') !== -1 &&
                        (en2.text.indexOf('回复') !== -1 || en2.text.indexOf('回血') !== -1)) inGroupHeal = true;
                    if (!inGroupHeal) continue;
                    summaryHeals++; // 组内回血信号计入刷屏判定（每序列至多 1 条）
                    var hasClawBefore = false, hasClawAfter = false;
                    for (var c = 0; c < clawIdx.length; c++) {
                        if (clawIdx[c] < h) hasClawBefore = true;
                        if (clawIdx[c] > h) hasClawAfter = true;
                    }
                    if (hasClawBefore && hasClawAfter) {
                        issues.push('复发：第' + j + '组内回血日志夹在两条白骨爪之间（子条目' + h + '），修复后回血应在序列末尾统一输出一条汇总');
                        break;
                    }
                }
                clawGroups++;
                prevIsClawGroup = true;
            } else {
                // 顶层回血：仅紧跟含 claw 组才计为序列末尾汇总（刷屏辅助判定用）
                var isHeal = false;
                if (e.isHealEntry && songUid != null && e.healUnitUid === songUid) isHeal = true;
                if (!isHeal && e.type === 'info') {
                    var t = e.text || '';
                    if (t.indexOf('宋青书') !== -1 && (t.indexOf('回复') !== -1 || t.indexOf('回血') !== -1)) isHeal = true;
                }
                if (isHeal && prevIsClawGroup) summaryHeals++;
                prevIsClawGroup = false;
            }
        }
        if (clawGroups === 0) return 'skip';

        // 辅助信号：汇总条数 > 追击序列数 = 刷屏（每序列至多 1 条汇总）
        if (summaryHeals > clawGroups) {
            issues.push('复发：序列末尾汇总' + summaryHeals + '条 > 追击序列数' + clawGroups + '条，修复后每序列应≤1条汇总回血');
        }

        if (issues.length > 0) {
            return { fail: true, msg: issues.slice(0, 2).join(' | ') };
        }
        return { fail: false };
    }
};
