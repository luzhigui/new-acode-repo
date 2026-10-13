// 回归规则：惑人心智（mindControl）换位链路 — 矩阵「剩余待攻」pos/状态类最后一项。
// 机制源（core/14buff-effects.js applyMindControlCore，core/04buff-system.js L254-268 注册 AFTER_ATTACK）：
//   - 门控：unit.alive + 队伍带 MIND_CONTROL buff + unit 是己方最前排（pos 最小、非拒马存活单位）
//     —— AFTER_ATTACK 每次攻击都跑 handler，但非最前排单位在 core 内被 return，不产生任何条目；
//   - 一次完整执行 = 「敌方一条 + 己方一条」（SWAP 或 FAIL），中间夹两条恒空的 MIND_CONTROL_BANNER
//     （render/35 L247 renderMindControlBannerFact 恒返回 null——有意设计，横幅在 stageAction 显示），
//     故文本流里 ENEMY 结果与 ALLY 结果必然相邻；
//   - 敌方概率 = CONFIG.BUFFS.mindControl.enemySwapProb×100（0.8→80；小昭·姊在场走 hexEnhance 0.95→95），
//     己方概率 = allySwapProb×100（0.4→40；增强 0.50→50）；
//   - roll(1,100) ≤ prob → 该侧选两个可用单位（alive、排除 butterfly/spider 飞天态）a≠b 互换位置
//     （swapUnitPositions + SWAP fact）；roll 超 → FAIL(未触发)；可用单位 <2 → FAIL(可用单位不足)。
// 为什么值得盯：
//   1) 换位直接改写双方站位，而站位决定行动序/carry/圣火令行列——一次错换静默改变整局节奏；
//   2) BANNER 恒空 ⇒ 文本通道只剩 SWAP/FAIL 两条，配对断链（如一侧分支被误删）在战报上完全看不出来；
//   3) swapUnitPositions 与实际 pos 写入曾经分家过（V6.1.3 参数三源收敛那一轮改过 core/14 多处），
//     需要「宣告位置 vs 后续真实站位」对账——与 138 乘风击退同款病灶。
// 五条复发信号：
//   1) 配对断链：一条「敌方」惑心条目之后紧邻的惑心条目不是「己方」（或首条惑心条目就是「己方」）
//      —— 一侧分支漏 push / 两侧顺序被改写；
//   2) SWAP 自洽破坏：uidA===uidB（自己换自己）、oldPosA===oldPosB、位置越界 1~9；
//   3) FAIL 理由越界：不在 {未触发, 可用单位不足} —— 渲染/机制漂移；
//   4) 文本格式漂移：渲染模板改动导致字段解析不到（判据 1/2 的前提失效，显式报出而非静默 skip）；
//   5) 宣告位置未生效：SWAP 宣告 A→posB、B→posA，被下一次换位打断前，该单位后续出场快照
//      从未落到宣告位（复用 138 V6.1.12 口径：一拍时滞内任一快照命中即算生效；无后续快照不报）。
// 误报规避：本场没有惑心条目直接 skip（仅在抽到「惑人心智」团队 Buff 时产生）。
export const VER = 'tests/health-rules/166-mind-control-swap.js V6.1.0';

export const rule113 = {
    group: '技能效果回归',
    name: '惑心换位配对与落地(回归)',
    test: function(ctx, log) {
        var n = log ? log.length : 0;
        if (n === 0) return 'skip';

        // 收集所有惑心 SWAP/FAIL 条目。
        // 注意排除 buff 宣告横幅「🌀 惑人心智：最前排80%扰乱敌方换位，40%扰乱己方换位」
        //   （BANNER 渲染器恒空，这条横幅是 stageAction 侧的 info 条目，render/35 L248 注释所指），
        //   它不是一次执行的结果条目，不参与配对/自洽判据。
        var mc = [];
        for (var i = 0; i < n; i++) {
            var e = log[i];
            if (!e || typeof e.text !== 'string') continue;
            if (e.text.indexOf('惑人心智') === -1) continue;
            if (e.text.indexOf('惑人心智：') !== -1 && e.text.indexOf('扰乱') !== -1) continue; // 宣告横幅
            var m = e.text.match(/🌀\s*惑人心智(敌方|己方)：(?:(\d+)号位(\S+)与(\d+)号位(\S+)互换位置！|换位失败（(\S+)）)/);
            if (!m) {
                // 判据 4：惑心条目存在但格式解析不了（渲染模板漂移）——显式报出
                return { fail: true, msg: '复发：惑心条目文本格式无法解析（渲染模板漂移）：' + e.text.slice(0, 80) };
            }
            var isSwap = !!m[2];
            mc.push({
                idx: i, entry: e, side: m[1],
                isSwap: isSwap,
                posA: isSwap ? parseInt(m[2], 10) : null,
                nameA: isSwap ? m[3] : null,
                posB: isSwap ? parseInt(m[4], 10) : null,
                nameB: isSwap ? m[5] : null,
                reason: isSwap ? null : m[6],
                uidA: isSwap ? (e.uidA != null ? e.uidA : null) : null,
                uidB: isSwap ? (e.uidB != null ? e.uidB : null) : null,
                oldPosA: isSwap ? (e.oldPosA != null ? e.oldPosA : null) : null,
                oldPosB: isSwap ? (e.oldPosB != null ? e.oldPosB : null) : null
            });
        }
        if (mc.length === 0) return 'skip'; // 本场没抽到「惑人心智」团队 Buff

        var problems = [];

        // 判据 1：配对完整性 —— 一次执行 = 敌方一条 + 己方一条，两条必然相邻
        for (var k = 0; k < mc.length; k++) {
            if (mc[k].side === '敌方') {
                if (k + 1 >= mc.length || mc[k + 1].side !== '己方') {
                    problems.push('第' + (k + 1) + '条惑心（敌方）之后未紧跟己方条目（一次执行被截断/两侧顺序改写）');
                }
            } else { // 己方
                if (k === 0 || mc[k - 1].side !== '敌方') {
                    problems.push('第' + (k + 1) + '条惑心（己方）之前不是敌方条目（首条即为己方/敌方条目丢失）');
                }
            }
        }

        for (var k2 = 0; k2 < mc.length; k2++) {
            var it = mc[k2];
            var tag = '第' + (k2 + 1) + '条惑心(' + it.side + ')';
            if (!it.isSwap) {
                // 判据 3：FAIL 理由合法性
                if (it.reason !== '未触发' && it.reason !== '可用单位不足') {
                    problems.push(tag + ' FAIL 理由越界：「' + it.reason + '」（应为 未触发/可用单位不足）');
                }
                continue;
            }
            // 判据 2：SWAP 自洽
            if (it.uidA == null || it.uidB == null) {
                problems.push(tag + ' SWAP 条目缺 uidA/uidB（渲染条目字段丢失）');
            } else if (it.uidA === it.uidB) {
                problems.push(tag + ' SWAP 自己换自己（uidA===uidB=' + it.uidA + '）');
            }
            if (it.oldPosA == null || it.oldPosB == null) {
                problems.push(tag + ' SWAP 条目缺 oldPosA/oldPosB（渲染条目字段丢失）');
            } else if (it.oldPosA === it.oldPosB) {
                problems.push(tag + ' SWAP 两个旧位置相同（' + it.oldPosA + '号位，选人逻辑退化为同位）');
            }
            if (!(it.posA >= 1 && it.posA <= 9) || !(it.posB >= 1 && it.posB <= 9)) {
                problems.push(tag + ' SWAP 位置越界：' + it.posA + '↔' + it.posB + '（应在 1~9）');
            }
            if (!it.nameA || !it.nameB) {
                problems.push(tag + ' SWAP 单位名为空');
            }
            // 判据 5：宣告位置真实生效（复用 138 V6.1.12 口径）
            //   A 从 oldPosA 换到 oldPosB，B 从 oldPosB 换到 oldPosA（文本 posA/posB 即旧位）
            if (it.uidA != null && it.uidB != null && it.oldPosA != null && it.oldPosB != null
                && it.oldPosA !== it.oldPosB && it.uidA !== it.uidB) {
                var expect = [
                    { uid: it.uidA, pos: it.oldPosB, tag: it.nameA + '(A)' },
                    { uid: it.uidB, pos: it.oldPosA, tag: it.nameB + '(B)' }
                ];
                for (var q = 0; q < expect.length; q++) {
                    var exp = expect[q];
                    var seen = 0, hit = false;
                    for (var r = it.idx + 1; r < n; r++) {
                        var a = log[r];
                        if (!a || a.type !== 'attack-group' || !a._fxSnapshot) continue;
                        var actual = null;
                        if (a.uidA === exp.uid) actual = a._fxSnapshot.attackerPos;
                        else if (a.uidD === exp.uid) actual = a._fxSnapshot.defenderPos;
                        if (actual == null) continue;
                        // 被下一次换位（含乘风击退 buff-push / 惑心 buff-swap）打断则放弃本条
                        var interrupted = false;
                        for (var s = it.idx + 1; s < r; s++) {
                            var mid = log[s];
                            if (mid && (mid.type === 'buff-push' || mid.type === 'buff-swap')) {
                                if (mid.pushTargetUid === exp.uid || mid.behindUid === exp.uid ||
                                    mid.uidA === exp.uid || mid.uidB === exp.uid) { interrupted = true; break; }
                            }
                        }
                        if (interrupted) break;
                        seen++;
                        if (actual === exp.pos) { hit = true; break; }
                    }
                    if (seen > 0 && !hit) {
                        problems.push(tag + ' ' + exp.tag + ' 换位后位置未生效：预期' + exp.pos + '号位（'
                            + seen + '次出场均未落到该位）');
                    }
                }
            }
        }

        if (problems.length > 0) return { fail: true, msg: '复发：惑心换位异常 — ' + problems.slice(0, 3).join(' | ') };
        return { fail: false };
    }
};
