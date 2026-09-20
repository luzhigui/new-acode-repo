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
export const VER = 'tests/health-rules/132-claw-damage.js V6.1.10';

export const rule79 = {
    group: '数值回归',
    name: '九阴白骨爪伤害(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var prev = null; // { name, dmg }
        var saw = false;
        for (var j = 0; j < log.length; j++) {
            var e = log[j];
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
            // 3. 连锁调血：同一目标连续爪击，伤害应按"已损失生命比例"递增（不可递减）
            if (prev && prev.name === name && dmg < prev.dmg) {
                return { fail: true, msg: '复发：九阴白骨爪连锁伤害递减 ' + prev.dmg + '→' + dmg + '（未按已损失血量递增调血）' };
            }
            prev = { name: name, dmg: dmg };
        }
        if (!saw) return 'skip';
        return { fail: false };
    }
};
