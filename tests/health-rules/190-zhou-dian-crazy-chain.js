// 回归规则：周颠·「癫」传染链一致性 —— 弱判据（V1.1.0 判 C 降级）
// 机制源（modules/333-elite-mingjiao-crazy.js）：
//   开局「癫」在周颠身上；持有者出手必中且无视闪避，目标随机不分敌友；
//   攻击后若目标仍存活 → 癫传给目标（报幕：🤪 {持有者} 将「癫」传染给了 {目标}）；
//   持有者阵亡 → 传给击杀者（🤪 「癫」随着 {死者} 的死亡传给了 {击杀者}）；
//   找不到击杀者 → 回周颠（🤪 「癫」找不到攻击者，回到了 周颠 身上）；
//   周颠已死 → 随机传（🤪 周颠已阵亡，「癫」随机传给了 {目标}）。
// 复发信号（V1.1.0 弱判据，判 C 降级 —— 原线性单链不变量在当前架构下不成立）：
//   · 实测癫会落到「拒马」这类**不产生攻击报幕**的召唤物，也会经未覆盖路径回流周颠，
//     所以「持有者是线性单链」「每次出手报幕都由当前持有者发出」都无法保证（原判据 2/3/4 作废）。
//   只保留可证伪的两条：
//   1) 传染源与目标是同一单位（自传自留 = 癫卡死）—— 按 uid 判，同名克隆不算；
//   2) 传染/死亡传递的源必须出现在**已追踪链**中（开局周颠 + 历次报幕出现过的 uid）——
//      源凭空出现说明报幕与真实传递脱节。
// 误报规避：本场没有任何癫报幕直接 skip；「周颠已阵亡」随机传递那条只登记目的地，不校验来源。
export const VER = 'tests/health-rules/190-zhou-dian-crazy-chain.js V1.1.0';
import { plain } from '../122health-utils.js';

export const rule190 = {
    group: '技能效果回归',
    name: '周颠癫传染链一致性(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        var list = facts || [];
        var RE_ATTACK = /^🤪 (.+?) 受到「癫」的影响，不分敌友地向 (.+?) 发起攻击！?$/;
        var RE_TRANSFER = /^🤪 (.+?) 将「癫」传染给了 (.+?)$/;
        var RE_DEATH = /^🤪 「癫」随着 (.+?) 的死亡传给了 (.+?)$/;
        var RE_BACK = /^🤪 「癫」找不到攻击者，回到了 (.+?) 身上$/;
        var RE_RANDOM = /^🤪 周颠已阵亡，「癫」随机传给了 (.+?)$/;

        // 已追踪链：uid → 名字。癫报幕都是 SKILL_ANNOUNCE fact（modules/305 pushSkillAnnounce）：
        //   data.unitUid = 源（出手报幕里就是持有者自己），data.floatUid = 目标（传染/死亡/回收/随机）。
        var chain = {};
        var seed = function (u, nm) { if (u != null && nm) chain[u] = nm; };
        var pools = [beforeA || [], beforeE || []];
        for (var p = 0; p < pools.length; p++) {
            for (var q = 0; q < pools[p].length; q++) {
                var u0 = pools[p][q];
                if (u0 && u0.name === '周颠') seed(u0.uid, u0.name);
            }
        }

        var hits = 0;
        for (var i = 0; i < list.length; i++) {
            var f = list[i];
            var d = f && f.data;
            if (!d || d.skillName !== '癫' || typeof d.note !== 'string') continue;
            var s = plain(d.note);
            var m;
            if ((m = s.match(RE_ATTACK))) {
                hits++;
                // 出手者 = 当前持有者：直接登记进链（拒马等召唤物也可能持有，但没有其它登记路径）
                seed(d.unitUid, m[1]);
            } else if ((m = s.match(RE_TRANSFER))) {
                hits++;
                if (d.unitUid != null && d.floatUid != null && d.unitUid === d.floatUid) {
                    return { fail: true, msg: '复发：癫传染源与目标是同一单位「' + m[1] + '」（自我传染 = 癫卡死）' };
                }
                if (d.unitUid != null && !chain[d.unitUid] && m[1] !== '周颠') {
                    return { fail: true, msg: '复发：癫传染源「' + m[1] + '」不在已追踪链中（报幕与真实传递脱节）' };
                }
                seed(d.unitUid, m[1]);
                seed(d.floatUid, m[2]);
            } else if ((m = s.match(RE_DEATH))) {
                hits++;
                if (d.unitUid != null && !chain[d.unitUid] && m[1] !== '周颠') {
                    return { fail: true, msg: '复发：死亡传递的死者「' + m[1] + '」不在已追踪链中（报幕与真实传递脱节）' };
                }
                seed(d.unitUid, m[1]);
                seed(d.floatUid, m[2]);
            } else if ((m = s.match(RE_BACK))) {
                hits++;
                if (m[1] !== '周颠') {
                    return { fail: true, msg: '复发：癫回收到「' + m[1] + '」身上，应回周颠' };
                }
                seed(d.floatUid, m[1]);
            } else if ((m = s.match(RE_RANDOM))) {
                // 「周颠已阵亡」随机传递：只登记目的地，不校验来源（无可追踪的源）
                hits++;
                seed(d.floatUid, m[1]);
            }
        }
        if (hits === 0) return 'skip';
        return { fail: false };
    }
};
