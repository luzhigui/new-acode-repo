// modules/338-elite-mingjiao-pengyingyu.js — 明教·五散人 彭莹玉「双面观音」
// V1.0.10 | 女装＝别人不忍下手 ⇒ 敌方候选池有多人时不选她（core/07 registerTargetFilter），
//   她是唯一可选目标时由 AFTER_SELECT_TARGET 改打攻击方自己的队友；队友也没了＝本击跳过，她不挨打。
export const VER = 'modules/338-elite-mingjiao-pengyingyu.js V1.0.10';

import { registerSettlementHook, EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { registerTargetFilter } from '../core/207-target-strategies.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, CAMP_TYPES, FACT_TYPES, SKILL_CUE_KINDS } from '../infra/106-battle-enums.js';
import { canBeTargeted } from '../core/203-battle-utils.js';
import { getBattleRng } from '../core/214-battle-shared.js';
import { getSkillParams } from '../core/201-config-5v5-test.js';
import { pushSkillAnnounce } from './305-elite-helpers.js';


export const doubleFaceHandler = {
    fields: {},
    install({ eventBus, A, B, decl }) {
        const selfTeam = decl.camp === CAMP_TYPES.ALLY ? A : B;
        const self = selfTeam.find(u => u.alive && u.name === decl.name);
        if (!self) return;

        const params = getSkillParams(decl.name, 'doubleFace');
        if (!params) throw new Error(`缺技能参数: ${decl.name}.doubleFace`);
        const disguiseChance = params.disguiseChance;
        const openingChance = params.openingChance;
        const duration = params.duration;

        // 女装＝「别人不忍下手」：敌方选目标时，只要池里还有别的合法可选目标，就把她排除。
        //   挂在 core/07 的 registerTargetFilter（全局选敌面：core/12 selectAttackTarget 与
        //   buildTargetCandidates 都跑）；core/10 每回合清场，本 install 每回合重跑，同 id 覆盖＝幂等。
        //   只对敌方阵营的攻击者生效（她自己的队友不受影响）；池里只剩她一人时不剔除——
        //   保留「唯一可选目标」交给 AFTER_SELECT_TARGET 改打攻击方自己的队友。
        //   不写 state、不 splice 引擎数组、不抽签：同种子 RNG 序完全不变。
        const FILTER_ID = `modules/338:doubleFace:${self.uid}`;
        registerTargetFilter(FILTER_ID, (attacker, candidates) => {
            if (!attacker || attacker.camp === self.camp) return null;
            if (!self.alive || self.state._crossdressRounds <= 0) return null;
            const rest = candidates.filter(c => c !== self);
            // 没有别人可选：她仍留在池里（唯一目标语义，由 AFTER_SELECT_TARGET 接手）
            if (rest.length === 0) return null;
            return rest.length === candidates.length ? null : rest;
        });

        // 女装轮转：每回合开始先递减剩余回合，到 0 再掷骰进入；首回合用更高的 openingChance。
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_START,
            priority: L.ROUND_START.XIE_SUMMON + 1,
            handler: (data) => {
                if (!self.alive) return;
                if (self.state._crossdressRounds > 0) {
                    self.state._crossdressRounds -= 1;
                    if (self.state._crossdressRounds === 0) {
                        // 刚褪装（进入 0）：妆容碎屑往下散（line:false 不落战报行），名字牌保持本名不动
                        //   褪装当回合不掷骰，保持原节奏：从下一回合起按 disguiseChance 掷
                        if (data.log && self.pos != null) {
                            pushSkillAnnounce(data.log, self, '双面观音', '', {
                                line: false,
                                cue: { kind: SKILL_CUE_KINDS.UNVEIL, unit: { uid: self.uid, camp: self.camp, pos: self.pos } }
                            });
                        }
                        return;
                    }
                    // 仍在女装（含第 2 回合）：照常掷骰（每回合恰好一次）。成功＝在当前剩余回合上 +1 顺延，
                    //   不是重置成 duration、也不是忽略；文案用「女装延长」，与「女装上阵」区分。
                    // 掷中/未中都必须落一条提示，避免「骰子掷了、战报一片空白」。
                    self.state._crossdressRolled = true;
                    if (getBattleRng().next() < disguiseChance) {
                        self.state._crossdressRounds += 1;
                        pushSkillAnnounce(data.log, self, '双面观音', `${self.name} 女装延长 1 回合（剩余 ${self.state._crossdressRounds} 回合）。`);
                    } else {
                        pushSkillAnnounce(data.log, self, '双面观音', `${self.name} 女装未能延续（本回合未触发，剩余 ${self.state._crossdressRounds} 回合）。`);
                    }
                    return;
                }
                const chance = self.state._crossdressRolled ? disguiseChance : openingChance;
                self.state._crossdressRolled = true;
                if (getBattleRng().next() >= chance) {
                    pushSkillAnnounce(data.log, self, '双面观音', `${self.name} 女装未能延续（本回合未触发）。`);
                    return;
                }
                self.state._crossdressRounds = duration;
                // 变装：薄纱扫过（只表现，不改数值与目标规则）；名字牌不换名，仍按本名显示
                const cue = self.pos != null
                    ? { kind: SKILL_CUE_KINDS.DISGUISE, unit: { uid: self.uid, camp: self.camp, pos: self.pos }, rounds: duration }
                    : null;
                pushSkillAnnounce(data.log, self, '双面观音', `${self.name} 女装上阵，众人不忍下手（${duration} 回合）。`, { cue });
            }
        });

        // 女装增伤：自身对敌方造成的伤害 ×dmgBonus（走声明的伤害倍率，不进账本）
        const dmgBonus = params.dmgBonus;
        if (dmgBonus == null) throw new Error('缺技能参数: 彭莹玉.doubleFace.dmgBonus');
        registerSettlementHook({
            when: SIGNAL_TYPES.BEFORE_DAMAGE_CALC,
            priority: L.BEFORE_DAMAGE_CALC.HE_TAICHONG_MARK + 5,
            handler: (data) => {
                if (data.unit !== self || !self.alive) return;
                if (self.state._crossdressRounds <= 0) return;
                if (!data.target || data.target.camp === self.camp) return;
                data.declarations.push({
                    type: EFFECT_TYPES.DMG_MULTIPLIER,
                    value: dmgBonus,
                    source: self,
                    label: `双面观音（伤害×${dmgBonus}）`
                });
            }
        });

        // 「唯一可选目标」才走这里（V1.0.10）：多目标时上面的 registerTargetFilter 已把她排除，
        //   选目标阶段根本不会落到她；只有池里只剩她一个（或锁定目标等额外攻击路径）时才会进来。
        //   此时改打「攻击方自己的队友」——不新增抽签，按 pos 取第一个存活可选队友（同种子 RNG 序不变）。
        //   挂 AFTER_SELECT_TARGET：core/12 选敌完成、命中/闪避判定之前；core/209 回读后重算目标账，
        //   因此改人后的护罩/减伤都按队友算，不会拿彭莹玉的账去打队友。
        //   攻击方队友全灭＝本击跳过、她不挨打，写一条看得懂的理由（不兜底去打她）。
        registerSettlementHook({
            when: SIGNAL_TYPES.AFTER_SELECT_TARGET,
            priority: L.AFTER_SELECT_TARGET.DOUBLE_FACE_RETARGET,
            handler: (data) => {
                if (!self.alive || self.state._crossdressRounds <= 0) return;
                if (data.target !== self) return;
                if (!data.unit || data.unit.camp === self.camp) return;
                const mates = (data.unit.camp === CAMP_TYPES.ALLY ? data.A : data.B)
                    .filter(u => u && u.alive && u.uid !== data.unit.uid && canBeTargeted(u))
                    .sort((a, b) => (a.pos == null ? 99 : a.pos) - (b.pos == null ? 99 : b.pos));
                if (mates.length === 0) {
                    data.target = null;
                    data.skipReason = `${data.unit.name} 不忍对${self.name}下手，身边已无可替之人，这一击落空`;
                    return;
                }
                const victim = mates[0];
                data.target = victim;
                data.phantomFact = {
                    factType: FACT_TYPES.PHANTOM_CONFUSE,
                    // sourceSkill 是这条事实的「来源词」：渲染按它打「双面观音」，
                    //   战绩/体检也按它归因（不再和成昆的 PHANTOM_CONFUSE 混算）。
                    data: {
                        unitName: data.unit.name, deceiver: self.name, targetName: victim.name, sourceSkill: '双面观音',
                        // 演出定位：识破/被迷惑那一下，在彭莹玉格上揭面具（fx/619 只读这些定位字段）
                        deceiverUid: self.uid, deceiverCamp: self.camp, deceiverPos: self.pos
                    }
                };
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.DOUBLE_FACE, doubleFaceHandler);
