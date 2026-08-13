// tests/58health-rules/67-claw-damage.js
// 回归规则：第四关 BOSS 周芷若·九阴白骨爪 伤害/调血是否符合设计
// 设计（core/01config-5v5-test.js nineYinClaw）：baseDmg=1.5、lostHpRatio=0.015（按已损失生命）、
// maxHpRatio=0.01（按最大生命）、executeThreshold=0.15（斩杀线）、连锁 chainProcChance=0.8。
// 复发信号：
//   1. 单次伤害 < baseHit（<1.5，即设计底线都没达到）
//   2. 连锁(同目标连续爪击)伤害递减 —— 未按"已损失生命比例"递增调血
//   3. 标记"斩杀"但目标血量未被调为 0（斩杀后 hp 残留）
// 对应已修 Bug：九阴白骨爪伤害计算/斩杀/连锁相关回归
export const VER = 'tests/58health-rules/67-claw-damage.js V5.4.0';

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
            var m = e.text.match(/对 (.+?) 造成 (\d+) 点伤害/);
            if (!m) continue;
            saw = true;
            var name = m[1];
            var dmg = parseInt(m[2], 10);
            var isExec = !!(e.isExecute) || e.text.indexOf('斩杀') !== -1;
            var hpAfter = e.clawTargetHpAfter;

            // 1. 伤害底线：单次爪击至少应造成 baseHit(>=1.5)，取整后也应为正数
            if (dmg < 1) {
                return { fail: true, msg: '复发：九阴白骨爪伤害<1 为' + dmg + '（周芷若伤害计算异常）' };
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
