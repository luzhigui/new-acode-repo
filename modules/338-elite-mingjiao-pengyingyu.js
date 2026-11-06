// modules/338-elite-mingjiao-pengyingyu.js — 明教·五散人 彭莹玉「双面观音」
// 规则：每回合开始 {disguiseChance}%（首回合 {openingChance}%）进入假身，持续 {duration} 回合；
//   假身期间自身造成的伤害 ×1.5。
export const VER = 'modules/338-elite-mingjiao-pengyingyu.js V1.0.0';

import { registerSettlementHook, EXECUTION_LAYER as L, EFFECT_TYPES } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, CAMP_TYPES } from '../infra/106-battle-enums.js';
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

        // 待接线位（本轮不做）：彭莹玉的「敌人不打他」属于选敌池过滤，需要 core/212 的
        //   registerTargetFilter 注册面（另一条线在加）。本文件在此留位，等该注册面落地后
        //   「假身期间把本单位从敌方候选池剔除」接在这里；不许 splice core 的目标数组，也不另造过滤器。
    }
};

registerMechanicHandler(MECHANIC_TYPES.DOUBLE_FACE, doubleFaceHandler);
