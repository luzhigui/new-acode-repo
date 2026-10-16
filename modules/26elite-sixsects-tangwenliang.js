// modules/26elite-sixsects-tangwenliang.js — 六大派精英「唐文亮」（崆峒·战士·M107）：
//   七伤拳（出手自损换增伤 / 临危更凶） + 同归于尽（阵亡反噬击杀者）
// V6.0.1 | ~5000 bytes | 2026-10-16 同归于尽改回原稿口径：反噬击杀者（core/13 致死出口记 _killerUid）、
//   伤害可被闪避（直调 core/12 resolveAttackHit 引擎同源判定）、可直接致死不再保留 1 血；
//   找不到有效凶手（毒/无源/同帧阵亡）时退回随机一名存活敌人
// V6.0.0 | 2026-10-15 新增：补六大派「自损爆发 / 临死反扑」缺口，与张三丰生生不息构成拉锯
export const VER = 'modules/26elite-sixsects-tangwenliang.js V6.0.1';
import { getSkillParams } from '../core/01config-5v5-test.js';
import { applyStatChange, getBattleRng } from '../core/13battle-shared.js';
import { computeBuffStats } from '../core/04buff-system.js';
import { resolveAttackHit } from '../core/12battle-attack-steps.js';
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

            // ② 同归于尽：阵亡时反噬击杀者，扣其 maxHp×reflectRatio 的真实伤害——可被闪避、可直接致死。
            //    击杀者来自 core/13 致死出口的 _killerUid 记账；找不到有效凶手（毒/无源伤害致死、
            //    凶手同帧阵亡）时退回随机一名存活敌人。闪避判定直调 core/12 resolveAttackHit，
            //    与普攻完全同源（前置「未行动过/闪避流」+ 规则表 + 流云身法；反弹对死者天然无效）
            eventBus.on(SIGNAL_TYPES.ON_UNIT_DEATH, L.ON_UNIT_DEATH.TONG_GUI, (data) => {
                const dead = (data.deadUnits || []).find(u => u.isTangWenLiang);
                if (!dead) return;
                const allies = [...(data.allySide || []), ...(data.enemySide || [])];
                const valid = v => v && v.alive && !v.state._pendingDeath && !v.isHorse && v.camp !== dead.camp;
                let victim = allies.find(u => u.uid === dead.state._killerUid && valid(u)) || null;
                if (!victim) {
                    const pool = (dead.camp === CAMP_TYPES.ALLY ? data.enemySide : data.allySide) || [];
                    const candidates = pool.filter(valid);
                    if (!candidates.length) return;
                    victim = candidates[getBattleRng().nextInt(0, candidates.length - 1)];
                }
                // 闪避判定（引擎同源）：A/B 用 resolveDeaths 传入的阵营本尊（带 _activeBuffs，流云身法可判）
                const deadSide = dead.camp === CAMP_TYPES.ALLY ? data.allySide : data.enemySide;
                const victimSide = victim.camp === CAMP_TYPES.ALLY ? data.allySide : data.enemySide;
                const attackerStats = computeBuffStats(dead, deadSide && deadSide._activeBuffs, deadSide);
                const defenderStats = computeBuffStats(victim, victimSide && victimSide._activeBuffs, victimSide);
                const hitResult = resolveAttackHit(dead, victim, attackerStats, defenderStats, eventBus, { log: data.log, A: data.allySide, B: data.enemySide });
                if (hitResult.skipped) {
                    if (data.log && hitResult.missFact) data.log.push({ factType: FACT_TYPES.MISS, data: hitResult.missFact });
                    if (data.log && hitResult.dodgeFact) data.log.push({ factType: FACT_TYPES.DODGE, data: hitResult.dodgeFact });
                    return;
                }
                // 命中：全额真实伤害（不走攻防公式），不保留 1 血——致死则挂 _pendingDeath 交 resolveDeaths 统一结算
                const want = Math.max(1, Math.round(victim.maxHp * tong.reflectRatio));
                applyStatChange(victim, 'hp', -want, dead, '同归于尽');
                if (data.log) data.log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: {
                    unitName: dead.name, unitUid: dead.uid, camp: dead.camp, skillName: '同归于尽',
                    note: `💥 唐文亮同归于尽：反噬击杀者 ${victim.name}，扣 ${want} 点生命`,
                    floatText: '💥', floatUid: victim.uid
                } });
            });
        }
    };
}
