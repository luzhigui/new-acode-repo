// modules/342-elite-sixsects-san-du.js — 少林三渡与炎魔狮王（第6关·正三角·金刚伏魔阵）
// 设计：三渡技能固定、职业随站位随机（2号位=防战 / 7号位=战士 / 9号位=飞行，由 modules/330 抽位改写）。
//   渡厄：防御 +40%（严阵以待）
//   渡劫：每回合攻击两次（必发；走引擎 doubleStrike 额外出手通道）
//   渡难：自带流云身法，闪避 +25%
//   共有：站 7~9 号位时每回合开始回复 30 点生命（金刚伏魔阵）
//   炎魔狮王：锁在 5 号位、永久无法行动；每回合收尾（所有单位行动完、回合结束结算前）随机对一名明教角色打出一发炎爆（28 点真实伤害）。
// 注：引擎的 ON_ROUND_END 在每个出手后都会广播（并非整回合只一次），
//   故「每回合收尾」类效果统一挂 ROUND_SETTLED（core/210 行动循环结束后只发一次）。
// V1.1.2 | 2026-11-21 炎爆从「回合开始」改到 ROUND_SETTLED（回合结束前）；ON_ROUND_START 只负责每回合重新压 _stunned
// V1.1.3 | 2026-11-22 炎爆播报带needsSeparator自成一组(修贴上组尾巴)
// V1.1.4 | 2026-11-22 金刚伏魔阵回复补播报+飘字(老板报:回血无日志无飘字)
// V1.1.5 | 2026-11-22 三渡重排版(老板拍板):渡厄个人技换圣火令(常驻side buff),2号位严阵以待/7,9号位热血奋战(阵位授予)
// V1.1.6 | 2026-11-22 老板钉死口径对调:三样个人技绑和尚(严阵以待回渡厄),圣火令改2号位阵位授予(空位熄灭)
// V1.1.7 | 2026-11-22 老板二钉:圣火令降级移除;金刚不坏(40%防)回渡厄个人;阵位=2严阵以待/7,9热血奋战
// V1.1.8 | 2026-11-22 渡厄个人技改名首当其冲(金刚不坏让给空见金钟罩,老板拍板)
// V1.1.9 | 2026-11-22 修复重复三份的 doubleAttack 分支(首个空块吃掉分支，渡劫必发双击完全失效)
// V2.0.0 | 2026-11-22 老板口径落地：渡劫改 80% 概率连击；删 7/9 热血奋战（只留回血 30）；2 号位严阵以待补受击反弹 40%+战报/横幅/飘字；流云/严阵以待补回合播报；两个 40% 共用同一常量
// V2.0.1 | 2026-11-22 修 nextFloat 不存在（战斗 RNG 只有 next/nextInt）→ 渡劫概率连击不再抛异常
export const VER = 'modules/342-elite-sixsects-san-du.js V2.0.1';

import { registerSettlementHook, EFFECT_TYPES } from '../infra/101-event-bus.js';
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

// 三渡数值唯一来源（老板 2026-11-22 拍板：首当其冲与 2 号位严阵以待两个 40% 共用同一常量，不写死两处）
const SAN_DU_DEF_BONUS = 0.4;          // 防御 +40%（个人技 / 2 号位阵位，共用）
const SAN_DU_FORTIFY_REBOUND = 0.4;    // 2 号位严阵以待受击反弹：实际承伤的 40%
const SAN_DU_LIUYUN_RATE = 0.25;       // 流云身法闪避 +25%
const SAN_DU_DOUBLE_STRIKE_RATE = 0.8; // 概率连击：80%

// ── 三大高僧的固定被动 ──
export const monkFixedBuffHandler = {
    fields: { buffType: 'string' },
    install({ A, B, decl }) {
        const self = findSelf(A, B, decl);
        if (!self) return;

        if (decl.buffType === 'defense') {
            // 渡厄·首当其冲（个人技，绑人）：防御 +40%（ttl:'round' 每回合重挂，避免永久 mod 逐回合叠加）
            registerSettlementHook({
                when: SIGNAL_TYPES.ON_ROUND_START,
                priority: 20,
                handler: () => {
                    if (!self.alive) return;
                    addMod(self, 'def', { source: '首当其冲', value: SAN_DU_DEF_BONUS, ttl: 'round', op: 'mul', group: 'monkDef' });
                }
            });
            // 阵位授予（认位不认人）：2 号位=严阵以待（防御 +40% + 受击反弹 40%）；7/9 号位只保留金刚伏魔阵回血
            registerSettlementHook({
                when: SIGNAL_TYPES.ON_ROUND_START,
                priority: 19,
                handler: (data) => {
                    const team = (decl.camp === CAMP_TYPES.ALLY ? (A || []) : (B || []));
                    let fortifyUnit = null;
                    team.forEach(u => {
                        if (!u || !u.state) return;
                        const atTwo = u.alive && u.pos === 2;
                        u.state._sanDuFortify = atTwo;
                        if (!atTwo) return;
                        addMod(u, 'def', { source: '严阵以待', value: SAN_DU_DEF_BONUS, ttl: 'round', op: 'mul', group: 'sanDuPosFort' });
                        fortifyUnit = u;
                    });
                    if (fortifyUnit) {
                        pushSkillAnnounce(data && data.log, fortifyUnit, '严阵以待',
                            `🛡️ 严阵以待：${fortifyUnit.name} 防御 +${Math.round(SAN_DU_DEF_BONUS * 100)}%，受击反弹 ${Math.round(SAN_DU_FORTIFY_REBOUND * 100)}%`);
                    }
                }
            });
            // 严阵以待反击：2 号位实际掉血后反弹 40% 给攻击者（FORTIFY_REBOUND 自带横幅 + 飘字 + 战报）
            registerSettlementHook({
                when: 'afterDamageApplied',
                priority: 24,
                handler: (data) => {
                    const { unit, target, dmg } = data || {};
                    if (!unit || !target || !target.alive || !target.state || !target.state._sanDuFortify) return;
                    if (target.pos !== 2 || !dmg || dmg <= 0) return;
                    const value = Math.floor(dmg * SAN_DU_FORTIFY_REBOUND);
                    if (value <= 0) return;
                    if (!data.declarations) data.declarations = [];
                    data.declarations.push({
                        type: EFFECT_TYPES.REBOUND,
                        value,
                        source: target,
                        target: unit,
                        factType: FACT_TYPES.FORTIFY_REBOUND,
                        factData: { reboundDmg: value, unitName: unit.name, attackerUid: unit.uid, unitUid: target.uid }
                    });
                }
            });
        } else if (decl.buffType === 'doubleAttack') {
            // 渡劫·概率连击：命中/闪避后 80% 概率追加一次（每回合只掷一次骰，不 100% 必发）
            const submitSecond = (data) => {
                if (!data || data.unit !== self || !self.alive) return;
                if (self.state._doubleStrikeRolled) return;
                self.state._doubleStrikeRolled = true;
                if (self.state._doubleStriked) return;
                if (getBattleRng().next() >= SAN_DU_DOUBLE_STRIKE_RATE) return;
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
            // 每回合重置掷骰与追加标记（_doubleStriked 由核心统一清，这里只补掷骰标记）
            registerSettlementHook({
                when: SIGNAL_TYPES.ON_ROUND_START,
                priority: 18,
                handler: () => { self.state._doubleStrikeRolled = false; self.state._doubleStriked = false; }
            });
        } else if (decl.buffType === 'dodge') {
            // 渡难·流云身法：闪避 +25%（格子挂 💨 logo，回合开始播报一条，避免只有属性面板能看见）
            self.state._sanDuLiuYun = true;
            registerDodgeRule((target) => (target && target.uid === self.uid && target.alive ? SAN_DU_LIUYUN_RATE : 0));
            registerSettlementHook({
                when: SIGNAL_TYPES.ON_ROUND_START,
                priority: 22,
                handler: (data) => {
                    if (!self.alive) return;
                    pushSkillAnnounce(data && data.log, self, '流云身法',
                        `💨 流云身法：${self.name} 闪避 +${Math.round(SAN_DU_LIUYUN_RATE * 100)}%`);
                }
            });
        }

        // 共有：7~9 号位每回合开始回复 30 点生命
        //   2026-11-22 老板报：回血没日志没飘字——补 SKILL_ANNOUNCE 播报 + 飘字（满血回复 0 不刷行）。
        //   注意：本回复暂未接 341 智取抢血前置钩子（休息回血/飞行再生走的是 stealHealByHook），要接说一声。
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_START,
            priority: 21,
            handler: (data) => {
                if (!self.alive || ![7, 8, 9].includes(self.pos)) return;
                const hpBefore = self.hp;
                applyStatChange(self, 'hp', 30, self, '金刚伏魔阵回复');
                const healed = self.hp - hpBefore;
                if (healed > 0) {
                    pushSkillAnnounce(data && data.log, self, '金刚伏魔阵',
                        `${self.name} 金刚伏魔阵回复 ${Math.round(healed)} 点生命（${Math.round(hpBefore)} → ${Math.round(self.hp)}）`,
                        { floatText: '💚', floatUid: self.uid });
                }
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
            handler: () => {
                if (!self.alive) return;
                // 永久无法行动：_stunned 每回合被重置，这里每回合重新压上（跳过出手/行动）
                self.state._stunned = true;
            }
        });

        // 炎爆：整回合收尾（所有单位行动完、回合结束结算前）随机轰一发。
        //   ⚠️ 不能挂 ON_ROUND_END——那是每次出手后广播，会一回合打很多次。
        registerSettlementHook({
            when: SIGNAL_TYPES.ROUND_SETTLED,
            priority: 24,
            handler: (data) => {
                if (!self.alive) return;
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
                        },
                        needsSeparator: true
                    });
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.MONK_FIXED_BUFF, monkFixedBuffHandler);
registerMechanicHandler(MECHANIC_TYPES.BLAZE_LION_KING, blazeLionKingHandler);
