// 回归规则：死亡特效缺失 —— 目标被斩杀/白骨爪/闪避反击杀死时，死亡标记必须随日志下发，
// 否则播放器不渲染死亡特效（刷子红色底 + 尸体不消失）。
//
// 【数据契约，2026-09-22 实跑取证，改规则前务必对照】
//   斩杀/爪击日志不是顶层条目，而是挂在 attack-group 的 `entries` 子条目里。两类斩杀走**不同通道**：
//   · 战士斩杀：子条目 keys=[type,text]，文案「⚔️ 战士斩杀！X 直接击杀 Y！」
//     → 死亡标记落在**组**的 isDead（render/30 renderAttackFact: isDead = dmgResult.dead || executeKill）
//     → player/46attack-group.js L141 `if (entry.isDead && c.store)` 读它。
//   · 九阴白骨爪斩杀：子条目 keys=[type,text,isClawHit,clawAttackerUid,clawTargetUid,isExecute]
//     → 死亡标记**不走组 isDead**（实测组 isDead 恒为 undefined，因为爪伤是攻击结算后才由
//       core/16 CLAW_CHAIN 处理器落地，组的 isDead 只反映基础攻击），而走
//       render/31 translateExecute（CLAW_EXECUTE → `dead: data.isDead ?? true`），
//       该链路唯一依赖的是子条目上的 clawTargetUid（定位死者）+ isExecute（标记为斩杀）。
// 复发信号：
//   1. 战士斩杀：组内有战士斩杀声明但组 isDead 未置 true（core/10 补丁条件 !target.alive 在斩杀瞬间不成立）
//   2. 白骨爪斩杀：爪击斩杀条目缺 clawTargetUid / isExecute → translateExecute 定位不到死者，死亡特效无处可落
//   3. 闪避反击击杀：isDodge+isDead 并存但 hpAfter 未归零或组内无 deadFlag → 血条不落底/尸体残留
// 对应已修 Bug：战士斩杀/白骨爪斩杀/闪避反击击杀 无死亡特效回归
//
// V6.1.17 修订（本轮体检迭代），修四处体检侧缺陷：
//   ① 死代码：旧版 `saw` 只在三条 return{fail:true} 分支里置位，文件末尾 `return {fail:false}` 永不可达——
//      规则结构上不可能变绿，只要它 skip 就永久占据"恒空转"名单，DEAD=1 红线失去区分度。改为 issues[] 收集。
//   ② 漏报（主因）：旧版循环首行 `if (!e || !e.text) continue;` —— attack-group 顶层**没有 text**，
//      文本全在子条目上，于是三条路径一条都进不去，120 场恒 skip。改为按子条目判定。
//   ③ 规则过期（误报）：路径3 旧版见 `isDodge && isDead` 即判复发。但 player/46 L141 现为
//      `if (entry.isDodge…)` 守卫已移除，isDodge+isDead 并存是**合法态**，照旧判必误报。
//      改为校验真正该成立的下游契约：hpAfter 归零 + 组内 damage-text 带 deadFlag。
//   ④ 通道混淆（误报）：路径1 旧版按文本"斩杀"一把抓，会把白骨爪斩杀也算进来，而白骨爪根本不走组 isDead
//      （见上数据契约），改完②后立刻炸出 13 条假红。现按 `!en.isClawHit` 把战士斩杀与白骨爪斩杀拆成两条独立路径。
export const VER = 'tests/health-rules/133-death-effect.js V6.1.17 | ~6.3KB';

export const rule80 = {
    group: '特效回归',
    name: '死亡特效缺失(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var saw = false;      // 本场是否观测到任一"该有死亡特效"的场景
        var issues = [];      // 观测到但契约未满足 → 复发
        for (var j = 0; j < log.length; j++) {
            var e = log[j];
            if (!e) continue;
            var entries = Array.isArray(e.entries) ? e.entries : [];

            // ---- 路径1：战士斩杀（非白骨爪通道）----
            // 死亡标记必须落在组的 isDead 上，供 player/46 触发死亡特效
            var warriorExec = false;
            for (var k = 0; k < entries.length; k++) {
                var en = entries[k];
                if (!en || !en.text) continue;
                if (!en.isClawHit && en.text.indexOf('斩杀') !== -1) { warriorExec = true; break; }
            }
            if (warriorExec) {
                saw = true;
                if (e.isDead !== true) issues.push('第' + j + '条攻击组内有战士斩杀声明但组 isDead=' + e.isDead + '（战士斩杀缺死亡特效）');
            }

            // ---- 路径2：周芷若九阴白骨爪斩杀 ----
            // 不走组 isDead，走 render/31 translateExecute；唯一硬依赖是子条目上的 clawTargetUid + isExecute
            for (var c = 0; c < entries.length; c++) {
                var ce = entries[c];
                if (!ce || !ce.isClawHit || !ce.isExecute) continue;
                saw = true;
                if (ce.clawTargetUid === undefined || ce.clawTargetUid === null) {
                    issues.push('第' + j + '条白骨爪斩杀条目缺 clawTargetUid（translateExecute 定位不到死者，死亡特效无处可落）');
                }
                if (ce.clawAttackerUid === undefined || ce.clawAttackerUid === null) {
                    issues.push('第' + j + '条白骨爪斩杀条目缺 clawAttackerUid（飞爪动画无法定位攻击者）');
                }
                break;
            }

            // ---- 路径3：闪避反击击杀 ----
            // isDodge+isDead 并存是修复后的合法态，不再一见即判复发；
            // 真正要校验的是死亡标记有没有随条目下发给播放器：hpAfter 归零 + 组内 damage-text 带 deadFlag
            if (e.isDodge === true && e.isDead === true) {
                saw = true;
                var deadFlag = false;
                for (var q = 0; q < entries.length; q++) {
                    if (entries[q] && entries[q].deadFlag === true) { deadFlag = true; break; }
                }
                if (e.hpAfter !== 0) {
                    issues.push('第' + j + '条闪避反击击杀但 hpAfter=' + e.hpAfter + ' 未归零（血条不落底、尸体残留）');
                } else if (!deadFlag) {
                    issues.push('第' + j + '条闪避反击击杀但组内无 deadFlag 标记（死亡特效被拦截）');
                }
            }
        }
        if (!saw) return 'skip';
        if (issues.length > 0) return { fail: true, msg: '复发：' + issues.slice(0, 2).join(' | ') };
        return { fail: false };
    }
};
