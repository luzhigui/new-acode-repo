// modules/26elite-sixsects-tangwenliang.js — 六大派精英「唐文亮」（崆峒·战士·M107）：
//   七伤拳（出手自损换增伤 / 临危更凶） + 同归于尽（阵亡反噬一名敌人）
// V6.0.0 | ~4300 bytes | 2026-10-15 新增：补六大派「自损爆发 / 临死反扑」缺口，与张三丰生生不息构成拉锯
export const VER = 'modules/26elite-sixsects-tangwenliang.js V6.0.0';
import { getSkillParams } from '../core/01config-5v5-test.js';
import { applyStatChange, getBattleRng } from '../core/13battle-shared.js';
import { eventBus, EFFECT_TYPES, EXECUTION_LAYER as L } from '../infra/50-event-bus.js';
import { SIGNAL_TYPES, FACT_TYPES, CAMP_TYPES } from '../infra/56-battle-enums.js';

export function createTangWenLiangComponent() {
    return {
        name: '唐文亮',
        register(eventBus, A, B, log) {
            // 不写死阵营：按身份标记在两侧找
            const tw = [...A, ...B].find(u => u.isTangWenLiang && u.alive);
            if (!tw) return;

            const qi = getSkillParams('唐文亮', 'qiShangQuan');
            if (!qi) throw new Error('缺技能参数: 唐文亮.qiShangQuan');
            const tong = getSkillParams('唐文亮', 'tongGuiYuJin');
            if (!tong) throw new Error('缺技能参数: 唐文亮.tongGuiYuJin');

            // ① 七伤拳：出手前自损 maxHp×selfHpPct（≥minSelfDmg，且不致死——留 1 点），
            //    本次伤害 ×(1+dmgBonus)；自身生命低于 lowHpThreshold 时额外再 +lowHpExtra（临危更凶）。
            //    自损走统一 HP 出口 applyStatChange（记 hp 审计），不经伤害管线（否则会吃防御/格挡）
            eventBus.on(SIGNAL_TYPES.BEFORE_DAMAGE_CALC, L.BEFORE_DAMAGE_CALC.QISHANG, (data) => {
                if (data.unit !== tw || !tw.alive) return;
                if (tw.state._pendingDeath) return;
                const lowHp = tw.hp < tw.maxHp * qi.lowHpThreshold;
                const mult = 1 + qi.dmgBonus + (lowHp ? qi.lowHpExtra : 0);
                data.declarations.push({ type: EFFECT_TYPES.DMG_MULTIPLIER, value: mult, source: tw, label: lowHp ? '七伤拳·临危' : '七伤拳' });
                const want = Math.max(qi.minSelfDmg, Math.round(tw.maxHp * qi.selfHpPct));
                const real = Math.min(want, Math.max(0, Math.floor(tw.hp) - 1));
                if (real > 0) applyStatChange(tw, 'hp', -real, null, '七伤拳自损', false);
                if (data.log) data.log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: {
                    unitName: tw.name, unitUid: tw.uid, camp: tw.camp, skillName: '七伤拳',
                    note: `👊 唐文亮七伤拳：自损 ${real} 点生命，本次伤害 ×${mult.toFixed(2)}${lowHp ? '（临危加成）' : ''}`
                } });
            });

            // ② 同归于尽：阵亡时反噬一名随机存活敌人（非拒马），扣其 maxHp×reflectRatio（留 1 点，不直接致死）。
            //    ON_UNIT_DEATH 广播不带击杀者信息，故取「随机一名敌人」而非击杀者
            eventBus.on(SIGNAL_TYPES.ON_UNIT_DEATH, L.ON_UNIT_DEATH.TONG_GUI, (data) => {
                const dead = (data.deadUnits || []).find(u => u.isTangWenLiang);
                if (!dead) return;
                const enemies = (dead.camp === CAMP_TYPES.ALLY ? data.enemySide : data.allySide) || [];
                const pool = enemies.filter(u => u.alive && !u.isHorse);
                if (!pool.length) return;
                const victim = pool[getBattleRng().nextInt(0, pool.length - 1)];
                const want = Math.max(1, Math.round(victim.maxHp * tong.reflectRatio));
                const real = Math.min(want, Math.max(0, Math.floor(victim.hp) - 1));
                if (real <= 0) return;
                applyStatChange(victim, 'hp', -real, dead, '同归于尽');
                if (data.log) data.log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: {
                    unitName: dead.name, unitUid: dead.uid, camp: dead.camp, skillName: '同归于尽',
                    note: `💥 唐文亮同归于尽：拖 ${victim.name} 下水，扣 ${real} 点生命`,
                    floatText: '💥', floatUid: victim.uid
                } });
            });
        }
    };
}
