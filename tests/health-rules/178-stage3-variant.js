// 回归规则：关卡变体「可辨识性」—— content.encounters.squadVariants + modules/330-battle-init.js L406-424
// 背景：目前只有第 3 关有变体（变体1 = 宋青书 + 104,104,100,97；变体2 = 胖远桥/俞莲舟/张松溪/俞岱岩/殷梨亭）。
//   跑批统计曾用「阵里有没有胖远桥 / 宋青书」反推变体做分桶——**这个口径不可信**，实测取证如下：
//     ① 变体1 的数字空位会抽到普通兵池里的名字，而 张松溪/俞岱岩/俞莲舟 本身就是 ENEMY_POOL_TIER=100 的
//        六大派弟子（seed=2 第3关实测阵容：宋青书 + 班淑娴 + 空见 + 张松溪 + 昆仑玉清），
//        所以「阵里有张松溪/俞岱岩」既不能证明变体2，也不能反推任何东西；
//     ② 变体1 局可被额外混入 M107 档抽到胖远桥（第3关 stageAllows 已放行，20% 档），
//        会被误记进「变体2」桶；变体2 局同样可被 M100 档塞进俞莲舟（30%）或 M107 塞进宋青书（20%）；
//     ③ 于是唯一**不可被替换**的身份标记只剩「每套变体自带的具名精英」：
//        变体1 ⇒ 宋青书（m107，普通兵池抽不到）；变体2 ⇒ 胖远桥（m107，普通兵池抽不到）。
//        但两者都可能被额外混入注入另一套的具名精英 ⇒ 「两套同时在场」是合法形态，无法精确二分。
//   结论：想精确统计变体，必须由 330 在建队时把抽中的变体 id 落成事实/日志（见需求清单），
//        不许再从阵容名字反推。本规则守住「反推至少还有一套可用依据」这条底线。
// 判据：
//   ① 静态：每套变体必须至少带 1 个 characters.named===true 的具名精英（否则该变体永远无法被识别）；
//   ② 静态：同一关的多套变体，其具名精英集合不能完全相同（完全相同 ⇒ 按名反推必然打架）；
//   ③ 运行时（本关有变体配置时）：开场敌方阵容必须命中某一套变体的具名集合（变体没成套下发就报）。
export const VER = 'tests/health-rules/178-stage3-variant.js V1.1.0';
import { CONFIG as C, getGameData, loadGameData } from '../../core/201-config-5v5-test.js';

loadGameData().catch(() => { });

function namedElitesOf(squad, chars) {
    return (squad || []).filter(function (it) {
        return it && typeof it === 'object' && it.name && chars[it.name] && chars[it.name].named === true;
    }).map(function (it) { return it.name; });
}

export const rule181 = {
    group: '阵容生成回归',
    name: '关卡变体可辨识性(回归)',
    test: function (ctx, log, beforeA, beforeE) {
        var data;
        try { data = getGameData(); } catch (e) { return 'skip'; }
        var chars = data.characters || {};
        var byStage = C.ENCOUNTER_VARIANTS || {};
        var stageKeys = Object.keys(byStage).filter(function (k) { return byStage[k] && byStage[k].length; });
        if (!stageKeys.length) return 'skip';

        // ①② 静态可辨识性：逐关逐变体检查
        for (var i = 0; i < stageKeys.length; i++) {
            var st = stageKeys[i];
            var vars = byStage[st];
            var sets = vars.map(function (v) { return namedElitesOf(v && v.squad, chars); });
            for (var j = 0; j < sets.length; j++) {
                if (!sets[j].length) {
                    return { fail: true, msg: '复发：变体缺具名精英 — 第' + st + '关变体' + (j + 1) + ' 未配具名（不可替换）精英（该变体无法被任何名字反推，跑批分桶口径失效）' };
                }
                for (var k = 0; k < j; k++) {
                    if (sets[k].join('|') === sets[j].join('|')) {
                        return { fail: true, msg: '复发：变体具名精英完全重合 — 第' + st + '关变体' + (k + 1) + ' 与变体' + (j + 1) + ' 的具名精英完全相同（按名反推必然打架）' };
                    }
                }
            }
        }

        // ③ 运行时：本关有变体时，开场敌方必须命中某一套变体的具名集合
        var stage = ctx && ctx.currentStage;
        var mine = byStage[stage];
        if (!mine || !mine.length) return { fail: false };
        var E = beforeE || (ctx && ctx.snapshot && ctx.snapshot.enemy) || [];
        if (!E.length) return 'skip';
        var names = {};
        E.forEach(function (u) { if (u && u.name) names[u.name] = true; });
        var mineSets = mine.map(function (v) { return namedElitesOf(v && v.squad, chars); });
        var matched = mineSets.some(function (set) { return set.every(function (n) { return names[n]; }); });
        if (!matched) {
            return { fail: true, msg: '复发：变体未成套下发 — 第' + stage + '关变体未成套下发（两套变体自带的具名精英都不在场）' };
        }
        return { fail: false };
    }
};
