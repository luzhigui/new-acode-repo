// 回归规则：唐文亮「同归于尽」——阵亡反噬必须触发、反噬对象必须是对立阵营、反噬伤害按 25% 最大生命
// 真值源（content/001-game-data.json 唐文亮 skills.tongGuiYuJin.params）：
//   reflectRatio = 0.25（阵亡时反噬击杀者，扣其最大生命 25%，可直接致死；可能打空/被闪避）。
// 引擎落点（modules/315 L382-431，ON_UNIT_DEATH 钩子）：
//   ① 先算 miss（getMissBreakdown）→ 命中则 DODGE 判定 → 都不过则
//   want = max(1, round(victim.maxHp × reflectRatio))，applyStatChange 真伤，并播报：
//     「💨 …打空了」/「🌀 …被闪避了」/「💥 唐文亮同归于尽：反噬击杀者 V，扣 N 点生命」。
// 复发信号：
//   1) 唐文亮整场死了，却没有一条「同归于尽」播报（阵亡钩子断链 / 被旧架构吞掉）；
//   2) 反噬打到了己方（阵营过滤写反，会误杀队友）；
//   3) 反噬扣血量 ≠ max(1, round(击杀者 maxHp × 25%))（比例写死 / 配置改了引擎没跟）。
// 观测口径：击杀者 maxHp 取「同归于尽之前最近一次 ATTACK fact 里该单位的 attacker 快照」；
//   毒杀等无攻击快照的场次只校验触发存在性 + 阵营 + N≥1，不硬算比例（避免用开战 maxHp 误判）。
// 误报规避：唐文亮未出场 / 终局仍存活（被圣火不熄复活）→ skip；打空/被闪避属 desc 明示分支，不判红。
export const VER = 'tests/health-rules/197-tangwenliang-tonggui.js V1.0.0';
import { FACT_TYPES, CAMP_TYPES } from '../../infra/106-battle-enums.js';
import { getSkillParams } from '../../core/201-config-5v5-test.js';
import { plain } from '../122health-utils.js';

function namesOf(units) {
    var set = {};
    for (var i = 0; i < (units || []).length; i++) {
        var u = units[i];
        if (u && typeof u.name === 'string') set[u.name] = true;
    }
    return set;
}

// 找该单位在 idx 之前最近一次 ATTACK 快照的 maxHp（只认 attacker 快照，避免拿到别人）
function latestAttackerMaxHp(facts, idx, unitName) {
    for (var i = idx - 1; i >= 0; i--) {
        var f = facts[i];
        if (!f || f.factType !== FACT_TYPES.ATTACK || !f.data) continue;
        var a = f.data.attacker;
        if (a && a.name === unitName && a.maxHp != null) return a.maxHp;
    }
    return null;
}

export const rule197 = {
    group: '技能效果回归',
    name: '唐文亮同归于尽阵亡反噬(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!facts || facts.length === 0) return 'skip';
        var tong = getSkillParams('唐文亮', 'tongGuiYuJin') || {};
        var ratio = (tong.reflectRatio != null) ? tong.reflectRatio : 0.25;

        var opened = false, finalDead = false;
        var opening = (beforeA || []).concat(beforeE || []);
        for (var i = 0; i < opening.length; i++) {
            if (opening[i] && opening[i].name === '唐文亮') opened = true;
        }
        if (!opened) return 'skip';
        var finale = (afterA || []).concat(afterE || []);
        for (var i2 = 0; i2 < finale.length; i2++) {
            var u = finale[i2];
            if (u && u.name === '唐文亮' && !u.alive) finalDead = true;
        }

        var announceCount = 0, hitCount = 0;
        for (var i3 = 0; i3 < facts.length; i3++) {
            var f = facts[i3];
            if (!f || f.factType !== FACT_TYPES.SKILL_ANNOUNCE || !f.data) continue;
            if (f.data.skillName !== '同归于尽') continue;
            announceCount++;
            var note = plain(f.data.note || '');
            if (note.indexOf('打空了') !== -1 || note.indexOf('被闪避了') !== -1) continue;   // desc 明示分支

            var m = note.match(/反噬击杀者\s*(\S+?)\s*，扣\s*(\d+)\s*点生命/);
            if (!m) continue;
            hitCount++;
            var victimName = m[1];
            var dmg = parseInt(m[2], 10);
            if (!(dmg >= 1)) {
                return { fail: true, msg: '复发：同归于尽反噬扣血 ' + dmg + ' < 1（配置 max(1, …) 下限丢失）' };
            }

            // 阵营：反噬对象必须与唐文亮对立（caster camp 从播报 fact 取，名单从开战快照取）
            var casterCamp = f.data.camp;
            var allyNames = namesOf((ctx && ctx.snapshot) ? ctx.snapshot.ally : beforeA);
            var enemyNames = namesOf((ctx && ctx.snapshot) ? ctx.snapshot.enemy : beforeE);
            var same = (casterCamp === CAMP_TYPES.ALLY) ? allyNames : enemyNames;
            var foe = (casterCamp === CAMP_TYPES.ALLY) ? enemyNames : allyNames;
            if (same[victimName] && !foe[victimName]) {
                return { fail: true, msg: '复发：同归于尽反噬打到己方 ' + victimName + '（阵营过滤写反）' };
            }

            // 数值：有击杀者攻击快照时才能精确对账
            var M = latestAttackerMaxHp(facts, i3, victimName);
            if (M != null && M > 0) {
                var want = Math.max(1, Math.round(M * ratio));
                if (Math.abs(dmg - want) > 1) {
                    return { fail: true, msg: '复发：同归于尽反噬扣血 ' + dmg + ' ≠ round(' + victimName + ' maxHp ' + M + ' × ' + ratio + ')=' + want };
                }
            }
        }

        if (finalDead && announceCount === 0) {
            return { fail: true, msg: '复发：唐文亮本场阵亡（终局快照 alive=false），但没有一条「同归于尽」播报（阵亡反噬钩子断链）' };
        }
        if (announceCount === 0 || hitCount === 0) return 'skip';
        return { fail: false };
    }
};
