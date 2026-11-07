// modules/338-elite-mingjiao-pengyingyu.js — 明教·五散人 彭莹玉「双面观音」
// V1.0.3 | 2026-11-07 | 误攻队友的 PHANTOM_CONFUSE fact 补 sourceSkill='双面观音'：
//   渲染打「双面观音」、战绩/体检按来源区分归因（不再复用成昆的「幻影伪装」文案）
// V1.0.2 | 2026-11-07 | 概率回调 disguiseChance 0.10 / openingChance 0.20；新增「假身是敌方唯一可选目标」→ 误攻队友
// 规则：每回合开始 {disguiseChance}%（首回合 {openingChance}%）进入假身，持续 {duration} 回合；
//   假身期间自身造成的伤害 ×1.5。
export const VER = 'modules/338-elite-mingjiao-pengyingyu.js V1.0.3';

import { registerSettlementHook, EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { registerTargetFilter } from '../core/207-target-strategies.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, CAMP_TYPES, FACT_TYPES } from '../infra/106-battle-enums.js';
import { canBeTargeted } from '../core/203-battle-utils.js';
import { getBattleRng } from '../core/214-battle-shared.js';
import { getSkillParams } from '../core/201-config-5v5-test.js';
import { pushSkillAnnounce } from './305-elite-helpers.js';

const DMG_BONUS = 1.5;

export const doubleFaceHandler = {
    fields: {},
    install({ eventBus, A, B, decl }) {
        const selfTeam = decl.camp === CAMP_TYPES.ALLY ? A : B;
        const self = selfTeam.find(u => u.alive && u.name === decl.name);
        if (!self) return;

        const params = getSkillParams(decl.name, 'doubleFace');
        if (!params) throw new Error(`缺技能参数: ${decl.name}.doubleFace`);
        const selfName = decl.name;
        const disguiseChance = params.disguiseChance;
        const openingChance = params.openingChance;
        const duration = params.duration;

        // 假身轮转：每回合开始先递减剩余回合，到 0 再掷骰进入；首回合用更高的 openingChance。
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_START,
            priority: L.ROUND_START.XIE_SUMMON + 1,
            handler: (data) => {
                if (!self.alive) return;
                if (self.state._crossdressRounds > 0) {
                    self.state._crossdressRounds -= 1;
                    return;
                }
                const chance = self.state._crossdressRolled ? disguiseChance : openingChance;
                self.state._crossdressRolled = true;
                if (getBattleRng().next() >= chance) return;
                self.state._crossdressRounds = duration;
                pushSkillAnnounce(data.log, self, '双面观音', `${self.name} 化出假身，真身隐去 ${duration} 回合。`);
            }
        });

        // 假身增伤：自身对敌方造成的伤害 ×1.5（走声明的伤害倍率，不进账本）
        registerSettlementHook({
            when: SIGNAL_TYPES.BEFORE_DAMAGE_CALC,
            priority: L.BEFORE_DAMAGE_CALC.HE_TAICHONG_MARK + 5,
            handler: (data) => {
                if (data.unit !== self || !self.alive) return;
                if (self.state._crossdressRounds <= 0) return;
                if (!data.target || data.target.camp === self.camp) return;
                data.declarations.push({
                    type: EFFECT_TYPES.DMG_MULTIPLIER,
                    value: DMG_BONUS,
                    source: self,
                    label: `双面观音（伤害×${DMG_BONUS}）`
                });
            }
        });

        // 「敌人不打他」：假身期间把本单位从敌方候选池里剔除（core/07 注册面，core/10 每回合清场，
        //   故必须在这里用固定 id 重挂，同 id 覆盖＝幂等）。filter 本体无状态：只读调用时传入的
        //   attacker / candidates 与候选实例自身的 state，不闭包回合快照、不 splice 引擎数组；
        //   全被剔除＝返回空数组，引擎按「本轮无目标」处理，不做兜底。
        const FILTER_ID = 'modules/338:doubleFace';
        registerTargetFilter(FILTER_ID, (attacker, candidates) => {
            const kept = candidates.filter(c =>
                !(c.name === selfName && c.state && c.state._crossdressRounds > 0));
            return kept.length === candidates.length ? null : kept;
        });

        // 「唯一目标」：假身中他是敌方唯一可选目标时，敌方改为误攻自己的队友（走 phantomFact 既有路径），
        //   而不是空过。这一条放在「选目标声明层」（core/12 先读 targetResult、命中就不再跑过滤器），
        //   所以不改 core/12 的空池＝无目标语义；也没有把攻击者队友塞进敌方候选池。
        registerSettlementHook({
            when: SIGNAL_TYPES.BEFORE_SELECT_TARGET,
            priority: L.BEFORE_SELECT_TARGET.PERMANENT_MIND_CONTROL - 1,
            handler: (data) => {
                if (!self.alive || self.state._crossdressRounds <= 0) return;
                if (data.unit.camp === self.camp) return;
                const valid = data.validTargets;
                if (!valid || valid.length !== 1 || valid[0] !== self) return;
                const mates = data.allySide.filter(u => u.alive && canBeTargeted(u) && u.uid !== data.unit.uid);
                if (mates.length === 0) return;
                const victim = mates[getBattleRng().nextInt(0, mates.length - 1)];
                data.declaration.targetResult = victim;
                data.declaration.phantomFact = {
                    factType: FACT_TYPES.PHANTOM_CONFUSE,
                    // sourceSkill 是这条事实的「来源词」：渲染按它打「双面观音」，
                    //   战绩/体检也按它归因（不再和成昆的 PHANTOM_CONFUSE 混算）。
                    data: { unitName: data.unit.name, deceiver: self.name, targetName: victim.name, sourceSkill: '双面观音' }
                };
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.DOUBLE_FACE, doubleFaceHandler);
