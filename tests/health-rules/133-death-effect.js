// tests/health-rules/133-death-effect.js
// 回归规则：死亡特效缺失 —— 目标被斩杀/白骨爪/闪避反击杀死时，日志必须带 isDead/deadFlag 死亡标记，
// 否则播放器不渲染死亡特效（刷子红色底 + 尸体不消失）。
// 已定位的三条复发路径：
//   1. 战士斩杀：core/10battle-attack.js 补丁条件 `!target.alive` 在斩杀瞬间不成立（alive 要等 resolveDeaths 才置 false），
//      导致攻击组 isDead 未标记、damage-text 无 brush-red。
//   2. 周芷若白骨爪斩杀：modules/26elite-sixsects.js 日志 `isDead:!target.alive` 在斩杀瞬间 alive 仍为 true → isDead 恒为 false。
//   3. 闪避反击击杀：player/46attack-group.js 死亡特效渲染条件带 `!entry.isDodge`，而反击组 isDodge+isDead 并存 → 特效被拦截。
// 对应已修 Bug：战士斩杀/白骨爪斩杀/闪避反击击杀 无死亡特效回归
export const VER = 'tests/health-rules/133-death-effect.js V5.5.0';

export const rule80 = {
    group: '特效回归',
    name: '死亡特效缺失(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        var saw = false;
        for (var j = 0; j < log.length; j++) {
            var e = log[j];
            if (!e || !e.text) continue;
            // ---- 路径1：战士斩杀 ----
            // 斩杀声明日志会作为 info 条目塞进攻击组，文本含"斩杀"；此时攻击组应标记 isDead
            if (e.type === 'attack-group' && !e.isDead) {
                var entries = e.entries || [];
                for (var k = 0; k < entries.length; k++) {
                    var en = entries[k];
                    if (en && en.text && en.text.indexOf('斩杀') !== -1) {
                        saw = true;
                        return { fail: true, msg: '复发：攻击组内出现斩杀但isDead未标记（战士斩杀缺死亡特效）' };
                    }
                }
            }
            // ---- 路径2：周芷若白骨爪斩杀 ----
            // 白骨爪斩杀后 clawTargetHpAfter 应为 0，此时日志 isDead 必须为 true
            if (e.clawTargetHpAfter === 0 && e.isDead !== true) {
                saw = true;
                return { fail: true, msg: '复发：白骨爪斩杀目标HP=0但isDead未标记（缺死亡特效）' };
            }
            // ---- 路径3：闪避反击击杀 ----
            // 反击组 isDodge+isDead 并存时，播放器 `!entry.isDodge` 拦截死亡特效 → 尸体残留
            if (e.isDodge === true && e.isDead === true) {
                saw = true;
                return { fail: true, msg: '复发：闪避反击击杀 isDodge+isDead 并存，死亡特效被拦截、尸体不消失' };
            }
        }
        if (!saw) return 'skip';
        return { fail: false };
    }
};
