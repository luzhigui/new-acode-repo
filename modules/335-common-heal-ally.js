// modules/335-common-heal-ally.js — 峨眉素问·妙手回春（普通兵机制）
// 规则：每次攻击或被攻击（结算完伤害后），随机一名存活友方回复 healAmount 点生命值。
export const VER = 'modules/335-common-heal-ally.js V1.0.0';

import { registerSettlementHook, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, FACT_TYPES, CAMP_TYPES } from '../infra/106-battle-enums.js';
import { getBattleRng, applyStatChange } from '../core/214-battle-shared.js';
import { fmtHp } from '../infra/102-core-utils.js';
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
                if (pick.hp >= pick.maxHp) return; // 满血就不回了

                const healAmount = Math.min(decl.healAmount, pick.maxHp - pick.hp);
                const hpBefore = Math.floor(pick.hp);
                applyStatChange(pick, 'hp', healAmount, self, '妙手回春');

                if (log) {
                    log.push({
                        factType: FACT_TYPES.HEAL,
                        data: {
                            unitName: pick.name,
                            heal: healAmount,
                            hpBefore: fmtHp(hpBefore),
                            hpAfter: fmtHp(hpBefore + healAmount),
                            unitUid: pick.uid,
                            icon: '🌿',
                            label: '妙手回春',
                            mode: 'plusTrail',
                            anchorVerb: '回复'
                        }
                    });
                    const reason = isAttacker ? '攻击后' : '被攻击后';
                    pushSkillAnnounce(log, self, '妙手回春', `🌿 ${self.name} ${reason}触发妙手回春：${pick.name} 回复 ${healAmount} 点生命`, { floatText: '🌿', floatUid: pick.uid });
                }
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.HEAL_ALLY_ON_HIT, healAllyOnHitHandler);