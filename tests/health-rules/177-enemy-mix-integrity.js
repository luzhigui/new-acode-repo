// 回归规则：六大派「额外混入」与「玄冥补员」的阵容完整性 —— modules/330-battle-init.js（L456-567）
// 口径来源：extraEnemyElites 三档（M107 20% / M104 30% / M100 30%）只做**替换**（enemyUnits[targetIdx] = newUnit），
//   唯一增员路径是第 5 关玄冥二老齐出时的 XUANMING_EXTRA_M 补 1 人。
//
// rule179「额外混入不增员·不重名」：
//   ① 变体关的多套阵容长度必须一致（否则「人数」这一判据本身失去意义，先报配置错）；
//   ② 开场敌方人数 = 基础阵长度 +（第5关玄冥齐出 ? 1 : 0）——替换型混入不允许改变人数；
//   ③ 敌方无重名（330 L544-546 曾因玄冥补员没登记 usedEnemyNames 刷出「唐文亮×2 / 何太冲×2」，
//      这里把去重守卫做成常驻绊线，任何新增混入路径漏登记都会当场红）。
//
// rule180「具名敌方职业与身份一致」：
//   330 L492-506 / L529-540 的职业解析口径：content `role`（标枪等非四职业）> tags 命中 ROLE_TYPES>标枪
//   > 无名杂兵随机四选一；何太冲双修 50/50 摇战士/远程是老板拍板的例外。
//   历史缺陷：数值空位抽到唐文亮时给随机职业（L530 注释），玄冥补员路径同款——都被修过，
//   本规则守住「具名角色顶着错职业出场」不再复发。
export const VER = 'tests/health-rules/177-enemy-mix-integrity.js V1.0.0';
import { CONFIG as C, getGameData, loadGameData } from '../../core/201-config-5v5-test.js';
import { ROLE_TYPES } from '../../infra/106-battle-enums.js';

loadGameData().catch(() => { });

function squadsOfStage(stage) {
    var variants = C.ENCOUNTER_VARIANTS[stage];
    if (variants && variants.length) return variants.map(function (v) { return v.squad; });
    var sq = C.ENEMY_SQUADS[stage];
    return sq ? [sq] : null;
}

export const rule179 = {
    group: '阵容生成回归',
    name: '额外混入不增员·不重名(回归)',
    test: function (ctx, log, beforeA, beforeE) {
        var stage = ctx && ctx.currentStage;
        var E = beforeE || (ctx && ctx.snapshot && ctx.snapshot.enemy) || [];
        if (!E.length) return 'skip';
        var squads = squadsOfStage(stage);
        if (!squads) return 'skip';

        // ① 变体阵容长度一致性（长度不一致 ⇒ 下方人数判据无意义）
        var baseLen = squads[0].length;
        for (var v = 1; v < squads.length; v++) {
            if (squads[v].length !== baseLen) {
                return { fail: true, msg: '复发：变体阵容长度不一致 — 第' + stage + '关变体阵容长度不一致（变体1 ' + baseLen + ' 人 / 变体' + (v + 1) + ' ' + squads[v].length + ' 人）' };
            }
        }
        // ② 人数：替换型混入不增员，仅第5关玄冥齐出 +1
        var names = {};
        E.forEach(function (u) { if (u && u.name) names[u.name] = true; });
        var bothXuanming = !!(names['鹿杖客'] && names['鹤笔翁']);
        var expected = baseLen + (stage === 5 && bothXuanming ? 1 : 0);
        if (E.length !== expected) {
            return { fail: true, msg: '复发：额外混入导致增员 — 第' + stage + '关敌方阵容 ' + E.length + ' 人（应为 ' + expected + ' 人，额外混入只许替换不增员）' };
        }
        // ③ 重名
        var seen = {}, dup = null;
        for (var i = 0; i < E.length; i++) {
            var n = E[i] && E[i].name;
            if (!n) continue;
            if (seen[n]) { dup = n; break; }
            seen[n] = true;
        }
        if (dup) return { fail: true, msg: '复发：额外混入出现重名 — 第' + stage + '关敌方阵容出现重名「' + dup + '」（混入/玄冥补员去重守卫漏登记）' };
        return { fail: false };
    }
};

export const rule180 = {
    group: '阵容生成回归',
    name: '具名敌方职业与身份一致(回归)',
    test: function (ctx, log, beforeA, beforeE) {
        var stage = ctx && ctx.currentStage;
        var E = beforeE || (ctx && ctx.snapshot && ctx.snapshot.enemy) || [];
        if (!E.length) return 'skip';
        var chars;
        try { chars = getGameData().characters || {}; } catch (e) { return 'skip'; }
        var ROLES = [ROLE_TYPES.WARRIOR, ROLE_TYPES.DEFENDER, ROLE_TYPES.RANGED, ROLE_TYPES.FLYER];

        for (var i = 0; i < E.length; i++) {
            var u = E[i];
            if (!u || !u.name) continue;
            var ch = chars[u.name];
            if (!ch) continue;
            var idRole = ch.role || (ch.tags || []).find(function (t) {
                return ROLES.indexOf(t) !== -1 || t === ROLE_TYPES.JAVELIN;
            });
            if (!idRole) continue;   // 无职业身份（武当/峨眉等纯门派 tag 的杂兵）→ 允许随机，不判
            if (u.name === '何太冲') {
                // 双修特例：老板拍板 50/50，只允许战士/远程
                if (u.role !== ROLE_TYPES.WARRIOR && u.role !== ROLE_TYPES.RANGED) {
                    return { fail: true, msg: '复发：何太冲职业越界 — 第' + stage + '关何太冲职业 ' + u.role + '（双修只允许战士/远程）' };
                }
                continue;
            }
            if (u.role !== idRole) {
                return { fail: true, msg: '复发：具名敌方职业与身份不符 — 第' + stage + '关具名敌方「' + u.name + '」职业与身份不符（身份 ' + idRole + ' / 实站 ' + u.role + '）' };
            }
        }
        return { fail: false };
    }
};
