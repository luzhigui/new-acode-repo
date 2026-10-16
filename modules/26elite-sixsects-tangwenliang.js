// modules/26elite-sixsects-tangwenliang.js — 六大派精英「唐文亮」（崆峒·战士·M107）：
//   七伤拳（出手自损换增伤 / 临危更凶） + 同归于尽（阵亡反噬击杀者）
// V6.0.2 | 2026-10-16 反噬落空改为概率直读：自身未命中率（getMissBreakdown 直调）+ 目标闪避率
//   （core/12 computeDodgeChance 单点公式）两层独立判——反噬是死人出手，不吃「行动过不能闪避」
//   引擎前置，但概率全引擎同源；落空推 MISS/DODGE 战报行（无反弹无眩晕），命中全额可致死
// V6.0.1 | 2026-10-16 同归于尽改回原稿口径：反噬击杀者（core/13 致死出口记 _killerUid）、
//   伤害可被闪避、可直接致死不再保留 1 血；找不到有效凶手（毒/无源/同帧阵亡）时退回随机一名存活敌人
// V6.0.0 | 2026-10-15 新增：补六大派「自损爆发 / 临死反扑」缺口，与张三丰生生不息构成拉锯
export const VER = 'modules/26elite-sixsects-tangwenliang.js V6.0.2';
import { getSkillParams } from '../core/01config-5v5-test.js';
import { applyStatChange, getBattleRng, getStat } from '../core/13battle-shared.js';
import { computeBuffStats } from '../core/04buff-system.js';
import { computeDodgeChance, snapshotUnitForFact } from '../core/12battle-attack-steps.js';
import { getMissBreakdown, makeFXSnapshot } from '../core/03battle-utils.js';
import { flushBattleEvents } from '../infra/51-core-utils.js';
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
                // 落空判定（引擎同源公式、概率直读）：反噬是死人出手，不吃「行动过不能闪避」引擎前置——
                //   ①自身未命中：getMissBreakdown 直调（与普攻同一公式，双方人数压制等全生效）
                //   ②目标闪避：computeDodgeChance 综合闪避规则表 + 流云身法（core/12 单点公式）
                //   两层独立判，任一中即落空；落空只推战报行，不触发反弹/眩晕（死人打不着不该有反弹）
                const deadSide = dead.camp === CAMP_TYPES.ALLY ? data.allySide : data.enemySide;
                const victimSide = victim.camp === CAMP_TYPES.ALLY ? data.allySide : data.enemySide;
                const rng = getBattleRng();
                const missChance = getMissBreakdown(dead, deadSide, victimSide).total;
                if (missChance > 0 && rng.nextInt(1, 100) <= missChance) {
                    if (data.log) {
                        const missFact = { type: 'miss', attacker: snapshotUnitForFact(dead), target: snapshotUnitForFact(victim), fxSnapshot: makeFXSnapshot(dead, victim) };
                        missFact.events = flushBattleEvents();
                        data.log.push({ factType: FACT_TYPES.MISS, data: missFact });
                        data.log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: {
                            unitName: dead.name, unitUid: dead.uid, camp: dead.camp, skillName: '同归于尽',
                            note: `💨 唐文亮同归于尽反噬 ${victim.name}：打空了`, floatText: '💨', floatUid: victim.uid
                        } });
                    }
                    return;
                }
                const defenderStats = computeBuffStats(victim, victimSide && victimSide._activeBuffs, victimSide);
                const dodgeChance = computeDodgeChance(victim, dead, defenderStats);
                victim.state._dodgeChance = Math.round(dodgeChance * 100);
                if (dodgeChance > 0 && rng.nextInt(1, 100) <= dodgeChance * 100) {
                    if (data.log) {
                        const dodgeFact = { type: 'dodge', attacker: snapshotUnitForFact(dead), dodger: snapshotUnitForFact(victim),
                            reboundDmg: 0, attackerHpBefore: 0, attackerHpAfter: 0, attackerAlive: false,
                            attackerAtk: Math.floor(getStat(dead, 'atk')), dodgerDef: Math.floor(getStat(victim, 'def')),
                            dodgerHp: Math.floor(victim.hp), weiHeal: null, fxSnapshot: makeFXSnapshot(victim, dead) };
                        dodgeFact.events = flushBattleEvents();
                        data.log.push({ factType: FACT_TYPES.DODGE, data: dodgeFact });
                        data.log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: {
                            unitName: dead.name, unitUid: dead.uid, camp: dead.camp, skillName: '同归于尽',
                            note: `🌀 唐文亮同归于尽反噬 ${victim.name}：被闪避了`, floatText: '🌀', floatUid: victim.uid
                        } });
                    }
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
