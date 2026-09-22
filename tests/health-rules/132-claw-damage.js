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
// V6.1.18 修订（体检迭代）：修同源漏报 —— 与 133-death-effect 同一个坑。爪击日志不是顶层条目，
//   而是 attack-group 的 entries 子条目（子条目 keys 含 isClawHit/clawAttackerUid/clawTargetUid/
//   isExecute）。旧版只扫顶层 e.text / e.isExecute，30 场探针实测顶层「九阴白骨爪」文本与
//   isClawHit 双 0（数据全在子条目：仅 stage 4 周芷若在场时产出，30 场共 112 条），规则恒 skip。
//   改为下沉遍历 entries 子条目：
//   · 伤害正则/isExecute 改从子条目取（顶层 e.isExecute 不存在，白骨爪斩杀标记在子条目上）；
//   · 斩杀 HP 校验 clawTargetHpAfter 优先取子条目、回退组级（真实契约里子条目未列该键，
//     守卫式处理：字段不存在时跳过该校验，不误报）；
//   · 顶层不再扫描（30 场实测顶层爪击数据恒 0，保留即为死代码）。
//
// V6.1.18b 修订（同轮取证补丁）：连锁递减判据过期 → 改为仅在**同一 attack-group 内**比较。
//   取证（seed 3 stage 4）：第 116 组末 6.8 → 第 136 组首 6.3，期间目标被治疗（已损失血量变小）
//   → 跨序列伤害合法下降；同一序列内（hits 同组生成，simulatedTargetHp 单调降）才承诺单调递增
//   （core/15 submitChainClaw：同组内 ratioDmg 按同一模拟血线递推）。旧版跨组全局比较炸出 4 条假红。
//
// V6.1.19 修订（体检迭代第 4 轮）：V6.1.18b 只改了文件头、代码没跟上（prev 声明在 j 循环外，
//   仍跨组比较），4 条假红（seed 3/10/11）依旧每轮必炸。本轮补上实现：
//   prev 下沉到 j 循环内（每条 attack-group 重置）。安全性已全量取证：
//   20 种子 × stage4 组内递减 0 处（组内比较零漏报风险）、跨组递减 5 处（恰为现有假红）。
//   判据语义不变：底线下界 1.5 / 斩杀归零 / 同组连锁递增，三条全保留。
export const VER = 'tests/health-rules/132-claw-damage.js V6.1.19';

export const rule79 = {
    group: '数值回归',
    name: '九阴白骨爪伤害(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var saw = false;
        for (var j = 0; j < log.length; j++) {
            var e = log[j];
            if (!e) continue;
            var entries = Array.isArray(e.entries) ? e.entries : [];
            var prev = null; // { name, dmg } — 组内作用域：连锁递减仅在同一 attack-group 内比较（V6.1.19）
            for (var k = 0; k < entries.length; k++) {
                var en = entries[k];
                if (!en || !en.isClawHit || !en.text) continue;
                if (en.text.indexOf('九阴白骨爪') === -1) continue;
                // 伤害为小数（如 1.5 / 2.5），必须捕获小数，否则规则会跳过全部真实爪击而漏检
                var m = en.text.match(/对 (.+?) 造成 (\d+(?:\.\d+)?) 点伤害/);
                if (!m) continue;
                saw = true;
                var name = m[1];
                var dmg = parseFloat(m[2]);
                var isExec = !!(en.isExecute) || en.text.indexOf('斩杀') !== -1;
                var hpAfter = en.clawTargetHpAfter !== undefined ? en.clawTargetHpAfter : e.clawTargetHpAfter;

                // 1. 伤害底线：baseDmg=1.5（张无忌在场为 2），ratioDmg>=0 → 单爪下界恰为 1.5；
                //    任何 < 1.5 的伤害均为回归（设计底线都没达到）
                if (dmg < 1.5) {
                    return { fail: true, msg: '复发：九阴白骨爪伤害<1.5 为' + dmg + '（第' + j + '条组内爪击，周芷若伤害计算异常，低于设计底线 baseDmg=1.5）' };
                }
                // 2. 斩杀一致性：标记斩杀则目标血量应被调为 0（clawTargetHpAfter 未下发时无从校验，跳过）
                if (isExec && hpAfter !== undefined && hpAfter !== null && hpAfter !== 0) {
                    return { fail: true, msg: '复发：九阴白骨爪斩杀但目标HP剩余' + hpAfter + '（第' + j + '条组内爪击，斩杀未将目标调血为0）' };
                }
                // 3. 连锁调血：同一目标连续爪击，伤害应按"已损失生命比例"递增（不可递减）
                if (prev && prev.name === name && dmg < prev.dmg) {
                    return { fail: true, msg: '复发：九阴白骨爪连锁伤害递减 ' + prev.dmg + '→' + dmg + '（第' + j + '条组内爪击，未按已损失血量递增调血）' };
                }
                prev = { name: name, dmg: dmg };
            }
        }
        if (!saw) return 'skip';
        return { fail: false };
    }
};
