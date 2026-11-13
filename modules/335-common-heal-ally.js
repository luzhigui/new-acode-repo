// modules/335-common-heal-ally.js — 峨眉素问·妙手回春（普通兵机制）
// 规则：每次攻击或被攻击（结算完伤害后），随机一名存活友方回复 healAmount 点生命值。
// V1.0.1 | 2026-11-08 体检转交：HEAL fact 补 maxHp / stacks。
export const VER = 'modules/335-common-heal-ally.js V1.0.1';

import { registerSettlementHook, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, FACT_TYPES, CAMP_TYPES } from '../infra/106-battle-enums.js';
import { getBattleRng, applyStatChange, addMod } from '../core/214-battle-shared.js';
import { fmtHp, fmtNum } from '../infra/102-core-utils.js';
import { pushSkillAnnounce } from './305-elite-helpers.js';

export const healAllyOnHitHandler = {
    fields: { healAmount: 'number' },
    install({ eventBus, A, B, decl }) {
        registerSettlementHook({
            when: SIGNAL_TYPES.AFTER_DAMAGE_APPLIED,
            priority: L.AFTER_DAMAGE_APPLIED.LEECH + 5, // 排在吸血/反伤之后
            handler: (data) => {
                const { unit, target, log } = data;
                const isAttacker = unit && unit.alive && unit.name === decl.name;
                const isDefender = target && target.alive && target.name === decl.name;

                if (!isAttacker && !isDefender) return;

                const self = isAttacker ? unit : target;
                const myTeam = self.camp === CAMP_TYPES.ALLY ? data.A : data.B;
                
                // 找存活友方
                const pool = myTeam.filter(u => u.alive && !u.state._pendingDeath);
                if (pool.length === 0) return;

                // 随机挑一个
                const pick = pool[getBattleRng().nextInt(0, pool.length - 1)];

                // 溢出转防御（2026-11-13 老板拍板：素问太弱，满血溢出加永久防御，不封顶）
                //   治疗量 10 点，实际回血 = min(10, 缺口)，溢出 = 10 - 实际回血 → addMod 永久 def。
                //   之前「满血直接 return」改成「满血整笔转防御」——触发次数不变，但每次都有产出。
                //   溢出是永久 add（group 'healAllyDef'），30 回合累积到 +60~+100 防，越打越硬。
                const healAmount = Math.min(decl.healAmount, pick.maxHp - pick.hp);
                const overflow = decl.healAmount - healAmount;
                const hpBefore = Math.floor(pick.hp);
                if (healAmount > 0) {
                    applyStatChange(pick, 'hp', healAmount, self, '妙手回春');
                }
                if (overflow > 0) {
                    addMod(pick, 'def', { source: '妙手回春·溢甲', value: overflow, ttl: 'permanent', group: 'healAllyDef', op: 'add' });
                }

                if (log) {
                    // 只有真回血才推 HEAL fact（溢出全转防御时没有回血数值）
                    if (healAmount > 0) {
                        log.push({
                            factType: FACT_TYPES.HEAL,
                            data: {
                                unitName: pick.name,
                                heal: healAmount,
                                hpBefore: fmtHp(hpBefore),
                                hpAfter: fmtHp(hpBefore + healAmount),
                                unitUid: pick.uid,
                                maxHp: pick.maxHp,
                                stacks: 1,
                                icon: '🌿',
                                label: '妙手回春',
                                mode: 'plusTrail',
                                anchorVerb: '回复'
                            }
                        });
                    }
                    const reason = isAttacker ? '攻击后' : '被攻击后';
                    if (healAmount > 0 && overflow > 0) {
                        pushSkillAnnounce(log, self, '妙手回春', `🌿 ${self.name} ${reason}触发妙手回春：${pick.name} 回复 ${fmtNum(healAmount)} 点生命，溢出 ${fmtNum(overflow)} 转防御`, { floatText: '🌿', floatUid: pick.uid });
                    } else if (healAmount > 0) {
                        pushSkillAnnounce(log, self, '妙手回春', `🌿 ${self.name} ${reason}触发妙手回春：${pick.name} 回复 ${fmtNum(healAmount)} 点生命`, { floatText: '🌿', floatUid: pick.uid });
                    } else if (overflow > 0) {
                        pushSkillAnnounce(log, self, '妙手回春', `🌿 ${self.name} ${reason}触发妙手回春：${pick.name} 满血，溢出 ${fmtNum(overflow)} 转防御`, { floatText: '🌿', floatUid: pick.uid });
                    }
                }
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.HEAL_ALLY_ON_HIT, healAllyOnHitHandler);