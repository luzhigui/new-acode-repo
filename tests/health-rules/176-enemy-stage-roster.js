// 回归规则：六大派「各关该出谁 / 不该出谁」—— modules/330-battle-init.js 关卡阵容段（L406-465）静态校验
// 口径来源：content.encounters.enemySquads（每关基础阵）+ encounters.squadVariants（仅第 3 关两套变体）
//   + encounters.elitePool（各关固定精英池，也是额外混入的关卡解锁闸数据源）。
//
// rule177「关卡固定精英必到」：
//   330 明确承诺「额外混入绝不顶掉关卡固定精英」（L429/L548-556）——替换目标只认
//   「不在任一关固定池 + characters.named !== true」的杂兵位。具名固定精英（张三丰/宋青书/周芷若/
//   鹿杖客/鹤笔翁/成昆/灭绝师太/胖远桥/俞莲舟）因此不可被替换，必须整份出现。
//   第 3 关有两套变体，用「命中任一变体的必到集合」判：变体1{宋青书} / 变体2{胖远桥,俞莲舟}。
//   这样既不会因为「变体1 局额外混入了胖远桥」误报，也能抓住「变体整体没出/被整队顶掉」。
//
// rule178「关卡解锁闸」：
//   330 L432-448：名字若出现在任一关固定池，只允许从首次出现关卡起被额外混入（例：灭绝师太只属第 7 关
//   固定池 → 第 1~6 关不得提前出场；周芷若首现第 4 关 → 第 3 关不出）。这是老板点名过的硬约束，
//   一旦 stageAllows 的 firstStage 推导或调用点丢失，就会静默变成「前段关刷后段精英」。
//   唯一豁免：dev 开关 forceWeakElite 走 330 L457-458 的强制通道，明确不受关卡过滤。
export const VER = 'tests/health-rules/176-enemy-stage-roster.js V1.0.0';
import { CONFIG as C, getGameData, loadGameData } from '../../core/201-config-5v5-test.js';
import { GlobalStore } from '../../infra/104-global-store.js';

loadGameData().catch(() => { });

// 取本关可用的基础阵（变体关返回变体数组，否则返回单元素数组）
function squadsOfStage(stage) {
    var variants = C.ENCOUNTER_VARIANTS[stage];
    if (variants && variants.length) return variants.map(function (v) { return v.squad; });
    var sq = C.ENEMY_SQUADS[stage];
    return sq ? [sq] : null;
}

// 基础阵里的具名（不可替换）成员
function namedOfSquad(squad, chars) {
    return squad.filter(function (it) {
        return it && typeof it === 'object' && it.name && chars[it.name] && chars[it.name].named === true;
    }).map(function (it) { return it.name; });
}

export const rule177 = {
    group: '阵容生成回归',
    name: '六大派关卡固定精英必到(回归)',
    test: function (ctx, log, beforeA, beforeE) {
        var stage = ctx && ctx.currentStage;
        var E = beforeE || (ctx && ctx.snapshot && ctx.snapshot.enemy) || [];
        if (!E.length) return 'skip';
        var squads = squadsOfStage(stage);
        if (!squads) return 'skip';
        var chars;
        try { chars = getGameData().characters || {}; } catch (e) { return 'skip'; }
        var requiredSets = squads.map(function (sq) { return namedOfSquad(sq, chars); });
        if (requiredSets.every(function (s) { return s.length === 0; })) return { fail: false };

        var names = {};
        E.forEach(function (u) { if (u && u.name) names[u.name] = true; });
        var matched = requiredSets.some(function (set) { return set.every(function (n) { return names[n]; }); });
        if (matched) return { fail: false };

        var missText = requiredSets.map(function (set, i) {
            var miss = set.filter(function (n) { return !names[n]; });
            return (requiredSets.length > 1 ? '变体' + (i + 1) + ' 缺 ' : '缺 ') + miss.join(',');
        }).join(' / ');
        return { fail: true, msg: '复发：第' + stage + '关该出的具名固定精英缺席（' + missText + '，额外混入顶掉了关卡固定精英）' };
    }
};

export const rule178 = {
    group: '阵容生成回归',
    name: '关卡解锁闸·后段精英不得提前(回归)',
    test: function (ctx, log, beforeA, beforeE) {
        var stage = ctx && ctx.currentStage;
        var E = beforeE || (ctx && ctx.snapshot && ctx.snapshot.enemy) || [];
        if (!E.length) return 'skip';
        var data;
        try { data = getGameData(); } catch (e) { return 'skip'; }
        var pools = (data.encounters && data.encounters.elitePool) || {};
        // 首次出现关卡 = 该名字在所有关固定池里的最小关卡号（与 330 L435-444 同口径）
        var first = {};
        for (var key in pools) {
            var st = Number(key);
            var list = pools[key] || [];
            for (var i = 0; i < list.length; i++) {
                var n = list[i] && list[i].name;
                if (!n) continue;
                if (first[n] == null || st < first[n]) first[n] = st;
            }
        }
        if (Object.keys(first).length === 0) return 'skip';
        var forced = null;
        try { forced = GlobalStore.get('forceWeakElite'); } catch (e) { /* 忽略 */ }

        for (var j = 0; j < E.length; j++) {
            var u = E[j];
            if (!u || !u.name) continue;
            if (forced && u.name === forced) continue;   // dev 强制通道不受关卡过滤（330 L457-458）
            var from = first[u.name];
            if (from != null && stage < from) {
                return { fail: true, msg: '复发：第' + stage + '关提前出现第' + from + '关专属精英「' + u.name + '」（stageAllows 关卡解锁闸被绕过）' };
            }
        }
        return { fail: false };
    }
};
