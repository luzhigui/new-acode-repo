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
export const VER = 'modules/342-elite-sixsects-san-du.js V1.1.5';

import { registerSettlementHook } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, CAMP_TYPES, FACT_TYPES, SKILL_CUE_KINDS, BUFF_TYPES } from '../infra/106-battle-enums.js';
import { addMod, applyStatChange, getBattleRng } from '../core/214-battle-shared.js';
import { CONFIG } from '../core/201-config-5v5-test.js';
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
            // 渡厄·圣火令（2026-11-22 老板拍板重排版）：个人技从「严阵以待防御」换成圣火令——
            //   往敌方 side._activeBuffs 塞一张常驻圣火令（applyTeamRoundBuffs 210 双方都跑 →
            //   敌方全队自动吃圣火令管线：加成/战报行/播报免费）。防御本体没丢：二号位获得严阵以待（阵位授予钩子）。
            if (!Array.isArray(B._activeBuffs)) B._activeBuffs = [];
            if (!B._activeBuffs.some(b => b && b.key === BUFF_TYPES.HOLY_FLAME && b.sanDuOwned)) {
                const rng = getBattleRng();
                const cols = [rng.nextInt(1, 3)];
                const rows = [];
                while (rows.length < 2) { const r = rng.nextInt(1, 3); if (!rows.includes(r)) rows.push(r); }
                rows.sort((a, b) => a - b);
                B._activeBuffs.push({ key: BUFF_TYPES.HOLY_FLAME, target: CAMP_TYPES.ENEMY, remaining: CONFIG.MAX_ROUND, permanent: true, name: '圣火令', cols, rows, sanDuOwned: true });
            }
            // 圣火令几何每回合重掷（与海克斯「每回合重掷」口径一致）；priority 19 先于阵位授予与本回合施加
            registerSettlementHook({
                when: SIGNAL_TYPES.ON_ROUND_START,
                priority: 19,
                handler: () => {
                    const buff = (B._activeBuffs || []).find(b => b && b.key === BUFF_TYPES.HOLY_FLAME && b.sanDuOwned);
                    if (!buff) return;
                    const rng = getBattleRng();
                    buff.cols = [rng.nextInt(1, 3)];
                    const rows = [];
                    while (rows.length < 2) { const r = rng.nextInt(1, 3); if (!rows.includes(r)) rows.push(r); }
                    rows.sort((a, b) => a - b);
                    buff.rows = rows;
                }
            });
            // 阵位常驻授予（2026-11-22 老板拍板）：2 号位=严阵以待（防 +40%，原渡厄个人防御落到阵位）；
            //   7/9 号位=热血奋战（挂 _sanDuHotBlood 旗，204 热血管线同享）
            registerSettlementHook({
                when: SIGNAL_TYPES.ON_ROUND_START,
                priority: 20,
                handler: () => {
                    const team = (decl.camp === CAMP_TYPES.ALLY ? (A || []) : (B || []));
                    team.forEach(u => {
                        if (!u.alive || u.pos == null) return;
                        if (u.pos === 2) {
                            addMod(u, 'def', { source: '严阵以待', value: 0.4, ttl: 'round', op: 'mul', group: 'sanDuPosDef' });
                        } else if (u.pos === 7 || u.pos === 9) {
                            u.state._sanDuHotBlood = true;
                        }
                    });
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
