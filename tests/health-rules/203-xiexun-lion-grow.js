// 回归规则：金毛狮王谢逊「召唤狮子 · 幼狮成长」——形态按站位、最终数值 = 配置基础值 + 职业加成
// 真值源（content/001-game-data.json 金毛狮王谢逊 skills.summonLion.params）：
//   cub {name:幼狮, role:防战, atk:0, def:4, maxHp:40, skipRoleBonus:true}
//   grow {prob:0.8, frontMax:6, front:{name:雄狮, role:战士, atk:18, def:12, maxHp:50},
//                              back :{name:母狮, role:远程, atk:20, def:16, maxHp:85}}
//   口径：spec 里是【基础值】，成形后最终值 = 基础值 + getRoleBonus(该形态职业)；
//   fact 的增量字段 = 最终值 − cub 基础值（与 addMod 入参同源）。
// 引擎落点（modules/326 L34-66，ON_ROUND_START/LION_GROW）：
//   1-6 号位 → 雄狮（front），7-9 号位 → 母狮（back），推 LION_GROW：
//   { name, unitName, unitUid, pos, atk, def, maxHp, atkDelta, defDelta, maxHpDelta }。
// 复发信号：
//   1) 形态与站位不符（pos≤frontMax 应是雄狮、否则母狮；frontMax 改了引擎没跟）；
//   2) atk/def/maxHp ≠ 配置基础值 + 该职业加成（漏职业加成 / 写死旧基础值）；
//   3) 三个增量 ≠ 最终值 − cub 基础值（fact 增量与 addMod 入参不同源，账面与实值分叉）。
// 误报规避：无 LION_GROW fact → skip；整数域精确比，职业加成取整差 ≤0；浮点允许 ±1。
export const VER = 'tests/health-rules/203-xiexun-lion-grow.js V1.0.0';
import { FACT_TYPES } from '../../infra/106-battle-enums.js';
import { getSkillParams } from '../../core/201-config-5v5-test.js';
import { getRoleBonus } from '../../core/202-unit.js';

export const rule203 = {
    group: '技能效果回归',
    name: '谢逊幼狮成长成形(回归)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE, facts) {
        if (!facts || facts.length === 0) return 'skip';
        var summon = getSkillParams('金毛狮王谢逊', 'summonLion');
        if (!summon || !summon.grow || !summon.cub) return 'skip';
        var grow = summon.grow;
        var cub = summon.cub;

        var samples = 0;
        for (var i = 0; i < facts.length; i++) {
            var f = facts[i];
            if (!f || f.factType !== FACT_TYPES.LION_GROW || !f.data) continue;
            var pos = f.data.pos;
            if (typeof pos !== 'number') continue;
            samples++;

            var expectForm = (pos <= grow.frontMax) ? grow.front : grow.back;
            if (f.data.name !== expectForm.name) {
                return { fail: true, msg: '复发：幼狮在 ' + pos + ' 号位长成「' + f.data.name + '」，按配置（pos≤' + grow.frontMax + ' → ' + grow.front.name + '，其余 → ' + grow.back.name + '）应为「' + expectForm.name + '」（形态/站位判据写反）' };
            }

            var bonus = { atk: 0, def: 0, maxHp: 0 };
            try { bonus = getRoleBonus(expectForm.role) || bonus; } catch (e) { /* 缺职业加成时按 0 校验基础值 */ }
            var wantAtk = expectForm.atk + (bonus.atk || 0);
            var wantDef = expectForm.def + (bonus.def || 0);
            var wantMaxHp = expectForm.maxHp + (bonus.maxHp || 0);
            if (Math.abs(f.data.atk - wantAtk) > 1 || Math.abs(f.data.def - wantDef) > 1 || Math.abs(f.data.maxHp - wantMaxHp) > 1) {
                return { fail: true, msg: '复发：成形值 atk/def/maxHp 与配置不符 — ' + expectForm.name + ' 实测 atk/def/maxHp=' + f.data.atk + '/' + f.data.def + '/' + f.data.maxHp + ' ≠ 配置基础值+职业加成 ' + wantAtk + '/' + wantDef + '/' + wantMaxHp + '（基础值改配置没跟 / 漏职业加成）' };
            }

            var dAtk = wantAtk - cub.atk;
            var dDef = wantDef - cub.def;
            var dHp = wantMaxHp - cub.maxHp;
            if (Math.abs(f.data.atkDelta - dAtk) > 1 || Math.abs(f.data.defDelta - dDef) > 1 || Math.abs(f.data.maxHpDelta - dHp) > 1) {
                return { fail: true, msg: '复发：成形增量 atk/def/maxHp=' + f.data.atkDelta + '/' + f.data.defDelta + '/' + f.data.maxHpDelta + ' ≠ 最终值−幼狮基础值 ' + dAtk + '/' + dDef + '/' + dHp + '（fact 增量与 addMod 入参不同源）' };
            }
        }
        if (samples === 0) return 'skip';
        return { fail: false };
    }
};
