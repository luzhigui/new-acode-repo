// 回归规则：金毛狮王谢逊「雄狮 · 振奋」——每次命中给存活角色永久 +atkPerHit，名单按 fact 名单核对
// 真值源（content/001-game-data.json 金毛狮王谢逊 skills.lionInspire.params）：{ atkPerHit: 1 }
//   口径：雄狮命中后，己方全体存活角色（含雄狮自己、谢逊）各 +1 攻；幼狮/拒马/天上单位不吃。
// 引擎落点（modules/326 L85-118，AFTER_DAMAGE_APPLIED/LION_INSPIRE）：
//   addMod(t,'atk',{source:'振奋', value:gain, ttl:'permanent', group:'lionInspire', op:'add'}），
//   然后把本次受益名单写进 LION_INSPIRE fact：{ unitName:雄狮名, targets:[{unitName, uid, atkDelta}] }。
// 复发信号：
//   1) 任一 target 的 atkDelta ≠ content atkPerHit（写死旧值 / 配置改了引擎没跟）；
//   2) 同一次触发 targets 里 uid 重复（同一单位被加两次，账面虚高）；
//   3) targets 为空（振奋实际没给任何人加，但播报照样喊）。
// 误报规避：无 LION_INSPIRE fact → skip；同一雄狮多次命中 → 每次触发各自独立校验。
export const VER = 'tests/health-rules/204-xiexun-lion-inspire.js V1.0.0';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';
import { getSkillParams } from '../../core/201-config-5v5-test.js';

export const rule204 = {
    group: '技能效果回归',
    name: '谢逊雄狮振奋加攻(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!facts || facts.length === 0) return 'skip';
        var insp = getSkillParams('金毛狮王谢逊', 'lionInspire');
        if (!insp || insp.atkPerHit == null) return 'skip';
        var gain = insp.atkPerHit;

        var samples = 0;
        for (var i = 0; i < facts.length; i++) {
            var f = facts[i];
            if (!f || f.factType !== FACT_TYPES.LION_INSPIRE || !f.data) continue;
            var targets = f.data.targets;
            samples++;
            if (!Array.isArray(targets) || targets.length === 0) {
                return { fail: true, msg: '复发：雄狮振奋 fact 的 targets 为空（播报喊了「全体攻 +X」但没人真加到）' };
            }
            var seen = {};
            for (var j = 0; j < targets.length; j++) {
                var t = targets[j];
                if (!t) continue;
                if (t.uid && seen[t.uid]) {
                    return { fail: true, msg: '复发：雄狮振奋同一次触发对 ' + (t.unitName || t.uid) + ' 加了两次（uid 重复，账面虚高）' };
                }
                if (t.uid) seen[t.uid] = true;
                if (Math.abs(t.atkDelta - gain) > 0) {
                    return { fail: true, msg: '复发：雄狮振奋给 ' + (t.unitName || t.uid) + ' 加攻 ' + t.atkDelta + ' ≠ content atkPerHit ' + gain + '（写死旧值 / 配置改了引擎没跟）' };
                }
            }
        }
        if (samples === 0) return 'skip';
        return { fail: false };
    }
};
