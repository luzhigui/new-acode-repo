// modules/334-common-absorb.js — 武当莲舟·吸星（普通兵机制）
// V1.2.0 | 2026-11-07 面板为 0 的属性不吸（否则被吸方扣不动、吸方白得 0.1）；面板 > 0 时仍 max(面板 × ratio, 0.1)。
// V1.1.0 | 2026-11-07 吸取量不再取整：每目标实数扣 = max(面板值 × ratio, 0.1)，攻/防/血上限同精度；
//          旧版 floor 把 1% 不足 1 点的目标抹成 0（30 攻吸 0），那不是需求。
// V1.5.0 | 2026-11-08 known-transfers 第 1 条：吸星汇总账实同源——扣减与增益都先除乘区因子再落 add 词条，
//   并以落地实测值累加 absorbedTotal；旧版平铺扣 -absorbDef 被 getStat 乘区放大，受害者实损比
//   施术者所得多 (1+mulSum) 倍，差额凭空消失（50 例实证）。
export const VER = 'modules/334-common-absorb.js V1.5.0';
// V1.3.0 | 2026-11-07 未触发/无可吸目标时补一行「🌀 吸星：本次未触发」回合开始提示（每回合最多一行，不飘字）。
// V1.4.0 | 2026-11-08 体检转交：一次吸星结算补一条 ABSORB_SUMMARY 汇总事实（absorbedTotal 分项 +
//   beneficiaries 逐单位逐属性 before/after，含施术者正增量），group absorbed/absorbGain 从此可对账；
//   不按单位/属性拆 fact，战报行数不变。

import { registerSettlementHook, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, SKILL_CUE_KINDS, FACT_TYPES } from '../infra/106-battle-enums.js';
import { getBattleRng, addMod, getStat, refreshMaxHp, statMulFactor } from '../core/214-battle-shared.js';
import { fmtNum } from '../infra/102-core-utils.js';
import { pushSkillAnnounce } from './305-elite-helpers.js';

export const statAbsorbHandler = {
    fields: { prob: 'number', ratio: 'number' },
    install({ eventBus, A, B, decl }) {
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_START,
            priority: 50,
            handler: (data) => {
                const allUnits = [...(data.A || []), ...(data.B || [])];
                const self = allUnits.find(u => u.name === decl.name && u.alive);
                if (!self) return;

                // 概率判定：没触发也留一行提示（每回合最多这一行），避免玩家以为机制坏了
                if (getBattleRng().next() >= decl.prob) {
                    if (data.log) pushSkillAnnounce(data.log, self, '吸星大法', `🌀 ${self.name} 吸星：本次未触发`);
                    return;
                }

                let totalAtk = 0, totalDef = 0, totalMaxHp = 0;
                // 演出用：每个被吸者吸走多少（攻/防/上限），只给 fx/619 画连线与飘字，不进任何结算
                const absorbed = [];
                // 账本用：逐单位逐属性的变更前/后（一次结算只汇总成一条 ABSORB_SUMMARY，不按单位拆 fact）
                const beneficiaries = [];

                // 账实同源的唯一出口：受害者实损必须严格等于声明分项。
                //   getStat = (base + addSum) x (1 + mulSum)——add 层落 1 点会被乘区放大成 (1+mulSum) 点
                //   （严阵以待 ×1.1 等）。旧版按面板百分比把 -absorbDef 平铺扣进 add 层，受害者实损
                //   比施术者所得多出那 10%，差额凭空消失（known-transfers 第 1 条，50 例实证）。
                //   落词条前先除乘区因子，再以落地实测值累加，保证「声明分项 = 受害者实损 = 施术者正增」。
                const take = (u, stat, want) => {
                    if (!(want > 0)) return 0;
                    const before = getStat(u, stat);
                    addMod(u, stat, { source: '被吸星', value: -want / statMulFactor(u, stat), ttl: 'permanent', group: 'absorbed', op: 'add' });
                    if (stat === 'maxHp') refreshMaxHp(u, null, '被吸星');
                    const after = getStat(u, stat);
                    const real = before - after;
                    if (real !== 0) beneficiaries.push({ uid: u.uid, name: u.name, stat, before, after });
                    return real;   // 吸到多少由落地实测决定（扣到底被夹 0 时如实变少）
                };
                const give = (u, stat, want) => {
                    if (!(want > 0)) return 0;
                    const before = getStat(u, stat);
                    addMod(u, stat, { source: '吸星大法', value: want / statMulFactor(u, stat), ttl: 'permanent', group: 'absorbGain', op: 'add' });
                    if (stat === 'maxHp') refreshMaxHp(u, null, '吸星大法');
                    const after = getStat(u, stat);
                    const real = after - before;
                    if (real !== 0) beneficiaries.push({ uid: u.uid, name: u.name, stat, before, after });
                    return real;
                };

                // 遍历全场其他人
                allUnits.forEach(u => {
                    if (!u.alive || u.uid === self.uid) return;

                    // 实数吸取，保底 0.1：不做 floor/round/toFixed（面板值 × 1% = 0.3 就真吸 0.3）。
                    //   面板为 0 的属性不吸——被吸方本来扣不动，吸方却会白得 0.1（0 攻召唤物送属性）。
                    const atkV = getStat(u, 'atk'), defV = getStat(u, 'def'), hpV = getStat(u, 'maxHp');
                    const absorbAtk = atkV > 0 ? Math.max(atkV * decl.ratio, 0.1) : 0;
                    const absorbDef = defV > 0 ? Math.max(defV * decl.ratio, 0.1) : 0;
                    const absorbHp = hpV > 0 ? Math.max(hpV * decl.ratio, 0.1) : 0;

                    const gotAtk = take(u, 'atk', absorbAtk);
                    const gotDef = take(u, 'def', absorbDef);
                    const gotHp = take(u, 'maxHp', absorbHp);
                    totalAtk += gotAtk;
                    totalDef += gotDef;
                    totalMaxHp += gotHp;

                    if (gotAtk > 0 || gotDef > 0 || gotHp > 0) {
                        absorbed.push({ uid: u.uid, camp: u.camp, pos: u.pos, atk: gotAtk, def: gotDef, hp: gotHp });
                    }
                });

                // 结算给自己（至少吸到一点属性才提示，防止0收益满屏飘字）
                if (totalAtk > 0 || totalDef > 0 || totalMaxHp > 0) {
                    // 施术者侧同口径落账（自身带乘区时也不许放大）：beneficiaries 正增量 = 'absorbGain'、
                    //   负增量 = 'absorbed'，三处数值严格相等。
                    give(self, 'atk', totalAtk);
                    give(self, 'def', totalDef);
                    give(self, 'maxHp', totalMaxHp);

                    if (data.log) {
                        // 账本：一次结算一条汇总事实（不按单位拆行），体检按 before/after 核对 absorbed/absorbGain
                        data.log.push({
                            factType: FACT_TYPES.ABSORB_SUMMARY,
                            data: {
                                casterUid: self.uid,
                                casterName: self.name,
                                skillName: '吸星大法',
                                source: '回合开始·吸星大法',
                                absorbedTotal: { atk: totalAtk, def: totalDef, maxHp: totalMaxHp },
                                beneficiaries
                            }
                        });
                        const cue = (self.pos != null && absorbed.length > 0)
                            ? { kind: SKILL_CUE_KINDS.ABSORB, self: { uid: self.uid, camp: self.camp, pos: self.pos }, targets: absorbed }
                            : null;
                        pushSkillAnnounce(data.log, self, '吸星大法', `🌀 ${self.name} 发动吸星：全场吸取 攻+${fmtNum(totalAtk)} 防+${fmtNum(totalDef)} 血+${fmtNum(totalMaxHp)}`, { floatText: '🌀', floatUid: self.uid, cue });
                    }
                } else if (data.log) {
                    // 掷中了但全场没有可吸属性（例如只剩 0 面板的召唤物）：也算未触发，同样只留一行
                    pushSkillAnnounce(data.log, self, '吸星大法', `🌀 ${self.name} 吸星：本次无可吸目标`);
                }
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.STAT_ABSORB, statAbsorbHandler);