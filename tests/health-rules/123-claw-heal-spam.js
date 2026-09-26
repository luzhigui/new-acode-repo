// 回归规则：白骨爪回血刷屏 — 修复后回血日志应在追击序列末尾统一输出一条汇总
// 复发信号：回血日志夹在 clawHit 之间（说明又改回循环内逐条 push）
// 对应已修 Bug：白骨爪回血刷屏（循环内累计，循环外统一输出一条）
//
// 优化（V6.1.15，第 9 趟）：修「整条规则恒空转」—— 数据源与 129/132/133/150/151 同源同病（第 5 例）。
//   探针实测（120 场）：`isClawHit` 顶层命中 **0**、摊平后命中 **450**；文本含「九阴白骨爪」
//   顶层 0 / 摊平后 482。源码依据：core/10battle-attack.js L255-272 —— 爪击/斩杀条目是
//   `group.data.entries.push(e)` 挂进攻击组的（render/35 renderClawHitFact / renderClawExecuteFact
//   渲染后仍带 isClawHit），顶层只有不带标记的 attack-group 自身 → 旧写法扫 log 顶层，
//   120 场一次没真跑过（恒 skip120）。
//   改法：加 collectNodes（顶层 → attack-group 的 entries）摊平后再扫。
//
//   但只加摊平会**立刻误报 20/20 场**（实测），两条判据的粒度都必须跟着收窄到「同一个攻击组」：
//   ① 旧判据的"爪击区间"取的是**整场第一条~最后一条爪击**（第 25~408 条这种跨度），一整局里
//      任何一条宋青书回血天然落在区间内 → 必红。源码口径（core/10 L249-282）：一次
//      resolveAfterDamageEffects 里，CLAW_CHAIN 的 hits 先连续 push，其他 decl（含回血）
//      在紧接着的第二个循环里统一 push，**同一攻击组内**才是"一次追击序列"的正确边界。
//   ② 回血识别也要收窄：旧写法 `songUid == null` 时把所有 isHealEntry 都算作白骨爪回血，
//      摊平后 isHealEntry 有 4016 条（九阳/热血/嗜血/休息回复等全是），宋青书不出阵时
//      随便一条回血都会被拉进判据。现改为只认「白骨爪 + 宋青书 + 回复/回血」的条目。
//   两处收窄都是为了"复活后不误报"，判据语义（回血不许夹在爪击中间、每序列≤1条）一字未动。
export const VER = 'tests/health-rules/123-claw-heal-spam.js V6.1.15';
// 用 as 保留原调用名 collectNodes：调用点（L54 等）不改，避免"改名漏改调用点"这类回归。
import { collectNodesGrouped as collectNodes } from '../122health-utils.js';

// 战报节点收集：顶层条目 → attack-group 的 entries 子条目（爪击/斩杀/白骨爪回血都挂在这一层）。
// 每个节点带上所属顶层组序号 gi 与摊平序号 i：判据要在**同一组**内比先后顺序，不能跨组比。
// 顺序保持战报原序，"夹在爪击中间"的位置判据才有效。


// 白骨爪回血条目识别（收窄版）：必须是「白骨爪 + 宋青书 + 回复/回血」。
// 文本通道对现行 render/35 renderClawHealFact「💚 宋青书因九阴白骨爪共回复X点生命」；
// uid 通道是文案形态变化时的兜底（靠 isHealEntry + healUnitUid 认人，仍要求与白骨爪同组）。
function isClawHealEntry(e, songUid) {
    var t = (e && typeof e.text === 'string') ? e.text : '';
    if (t.indexOf('白骨爪') !== -1 && t.indexOf('宋青书') !== -1
        && (t.indexOf('回复') !== -1 || t.indexOf('回血') !== -1)) return true;
    if (songUid != null && e && e.isHealEntry && e.healUnitUid === songUid
        && t.indexOf('白骨爪') !== -1) return true;
    return false;
}

export const rule70 = {
    group: '精英技能回归',
    name: '白骨爪回血刷屏(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var clawEvs = [];
        var healEvs = [];
        var allBefore = (beforeA || []).concat(beforeE || []);
        var songUid = null;
        for (var i = 0; i < allBefore.length; i++) {
            if (allBefore[i] && allBefore[i].name === '宋青书') { songUid = allBefore[i].uid; break; }
        }
        // 数据源修正（第 9 趟）：扫摊平后的节点，否则爪击条目一条也扫不到
        var nodes = collectNodes(log);
        for (var j = 0; j < nodes.length; j++) {
            var n = nodes[j];
            var e = n.e;
            if (!e) continue;
            if (e.isClawHit) clawEvs.push(n);
            if (isClawHealEntry(e, songUid)) healEvs.push(n);
        }
        if (clawEvs.length === 0) return 'skip';

        var issues = [];
        // 检查1（主信号）：同一攻击组内，回血日志后面还排着爪击 → 循环内逐条 push（复发）。
        //    正确顺序（core/10）：[本组全部爪击…] 然后才是统一的一条回血，回血之后不该再有爪击。
        for (var h = 0; h < healEvs.length; h++) {
            var hn = healEvs[h];
            for (var k = 0; k < clawEvs.length; k++) {
                var cn = clawEvs[k];
                if (cn.gi === hn.gi && cn.i > hn.i) {
                    issues.push('复发：第' + hn.i + '条白骨爪回血日志后面还排着第' + cn.i + '条爪击（同组' + hn.gi + '），说明又改回循环内逐条 push，修复后应在序列末尾统一输出一条汇总');
                    break;
                }
            }
            if (issues.length > 0) break;
        }
        // 检查2（辅助）：同一组内回血条数 > 该组追击序列数（序列数=文本含"追击"的 clawHit，即 depth=0）
        var pursueByGroup = {}, healByGroup = {};
        for (var p = 0; p < clawEvs.length; p++) {
            var txt = clawEvs[p].e.text || '';
            if (txt.indexOf('追击') !== -1) pursueByGroup[clawEvs[p].gi] = (pursueByGroup[clawEvs[p].gi] || 0) + 1;
        }
        for (var q = 0; q < healEvs.length; q++) healByGroup[healEvs[q].gi] = (healByGroup[healEvs[q].gi] || 0) + 1;
        for (var g in healByGroup) {
            var pc = pursueByGroup[g] || 0;
            if (pc > 0 && healByGroup[g] > pc) {
                issues.push('复发：同组' + g + '内白骨爪回血日志' + healByGroup[g] + '条 > 追击序列数' + pc + '条，修复后每序列应≤1条汇总回血');
                break;
            }
        }

        if (issues.length > 0) {
            return { fail: true, msg: issues.slice(0, 2).join(' | ') };
        }
        return { fail: false };
    }
};
