// modules/342-elite-sixsects-san-du.js — 少林三渡与炎魔狮王（第6关·正三角·金刚伏魔阵）
// 设计：三渡技能固定、职业随站位随机（2号位=防战 / 7号位=战士 / 9号位=飞行，由 modules/330 抽位改写）。
//   渡厄：防御 +40%（严阵以待）
//   渡劫：每回合攻击两次（必发；走引擎 doubleStrike 额外出手通道）
//   渡难：自带流云身法，闪避 +25%
//   共有：站 7~9 号位时每回合开始回复 30 点生命（金刚伏魔阵）
//   炎魔狮王：锁在 5 号位、永久无法行动；每回合开始随机对一名明教角色打出一发炎爆（28 点真实伤害）。
// 注：引擎的 ON_ROUND_END 在每个出手后都会广播（并非整回合只一次），
//   故「每回合」类效果统一挂 ON_ROUND_START，保证每回合各结算一次。
// V1.1.1 | 2026-11-21 炎爆演出改挂 blazeBurst cue（凝球→飞行→爆开），撤掉只在目标头顶飘 🚀
export const VER = 'modules/342-elite-sixsects-san-du.js V1.1.1';

import { registerSettlementHook } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, CAMP_TYPES, FACT_TYPES, SKILL_CUE_KINDS } from '../infra/106-battle-enums.js';
import { addMod, applyStatChange, getBattleRng } from '../core/214-battle-shared.js';
import { pushSkillAnnounce } from './305-elite-helpers.js';
import { registerDodgeRule } from '../core/221-registry-dodge.js';

// 本回合在场的自己（decl.camp 指明站在哪一方；三渡/谢逊只会出现在敌方 B 队）
function findSelf(A, B, decl) {
    const team = decl.camp === CAMP_TYPES.ALLY ? A : B;
    return (team || []).find(u => u && u.name === decl.name) || null;
}

// ── 三大高僧的固定被动 ──
export const monkFixedBuffHandler = {
    fields: { buffType: 'string' },
    install({ A, B, decl }) {
        const self = findSelf(A, B, decl);
        if (!self) return;

        if (decl.buffType === 'defense') {
            // 渡厄·金刚不坏：防御 +40%（ttl:'round' 每回合重挂，避免永久 mod 逐回合叠加）
            registerSettlementHook({
                when: SIGNAL_TYPES.ON_ROUND_START,
                priority: 20,
                handler: () => {
                    if (!self.alive) return;
                    addMod(self, 'def', { source: '严阵以待', value: 0.4, ttl: 'round', op: 'mul', group: 'monkDef' });
                }
            });
        } else if (decl.buffType === 'doubleAttack') {
            // 渡劫·一回合两次攻击：首次出手后追加一次（_doubleStriked 每回合重置，天然限一次）
            const submitSecond = (data) => {
                if (!data || data.unit !== self || !self.alive || self.state._doubleStriked) return;
                self.state._doubleStriked = true;
                const fact = {
                    factType: FACT_TYPES.DOUBLE_STRIKE,
                    data: { success: true, unitName: self.name }
                };
                if (Array.isArray(data.deferredFacts)) data.deferredFacts.push(fact);
                else if (Array.isArray(data.log)) data.log.push(fact);
                if (!Array.isArray(data.extraRequests)) data.extraRequests = [];
                data.extraRequests.push({
                    unit: self,
                    targetUid: (data.target && data.target.alive && !data.target.state._pendingDeath) ? data.target.uid : null,
                    reason: 'doubleStrike',
                    actedMode: 'allow',
                    priority: 10,
                    ignoreBlock: true
                });
            };
            registerSettlementHook({ when: SIGNAL_TYPES.AFTER_ATTACK, priority: 20, handler: submitSecond });
            registerSettlementHook({ when: SIGNAL_TYPES.AFTER_MISS, priority: 20, handler: submitSecond });
        } else if (decl.buffType === 'dodge') {
            // 渡难·流云身法：闪避 +25%
            registerDodgeRule((target) => (target && target.uid === self.uid && target.alive ? 0.25 : 0));
        }

        // 共有：7~9 号位每回合开始回复 30 点生命
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_START,
            priority: 21,
            handler: () => {
                if (!self.alive || ![7, 8, 9].includes(self.pos)) return;
                applyStatChange(self, 'hp', 30, self, '金刚伏魔阵回复');
            }
        });
    }
};

// ── 炎魔狮王：被金刚伏魔圈锁死 ──
export const blazeLionKingHandler = {
    fields: {},
    install({ A, B, decl }) {
        const self = findSelf(A, B, decl);
        if (!self) return;

        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_START,
            priority: 24,
            handler: (data) => {
                if (!self.alive) return;
                // 永久无法行动：_stunned 每回合被重置，这里每回合重新压上（跳过出手/行动）
                self.state._stunned = true;

                const victims = ((data && data.A) || [])
                    .filter(u => u && u.alive && u.camp === CAMP_TYPES.ALLY && !u.isSummon);
                if (victims.length === 0) return;
                const victim = victims[getBattleRng().nextInt(0, victims.length - 1)];
                applyStatChange(victim, 'hp', -28, self, '炎魔狮王·炎爆', true, false);
                pushSkillAnnounce(data.log, self, '炎爆',
                    `炎魔狮王掌心凝聚火球，一发炎爆轰向 ${victim.name}，造成 28 点真实伤害！`,
                    {
                        cue: {
                            kind: SKILL_CUE_KINDS.BLAZE_BURST,
                            self: { uid: self.uid, camp: self.camp, pos: self.pos },
                            target: { uid: victim.uid, camp: victim.camp, pos: victim.pos }
                        }
                    });
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.MONK_FIXED_BUFF, monkFixedBuffHandler);
registerMechanicHandler(MECHANIC_TYPES.BLAZE_LION_KING, blazeLionKingHandler);
