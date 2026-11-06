// modules/339-elite-mingjiao-zhangzhong.js — 明教·五散人 张中「召唤蹦蹦」
// 规则：每回合开始，在己方空位召唤一只蹦蹦（参数全部来自 content 的 summonBengBeng，与谢逊幼狮同口径）。
export const VER = 'modules/339-elite-mingjiao-zhangzhong.js V1.0.0';

import { registerSettlementHook, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, CAMP_TYPES, FACT_TYPES, ROLE_TYPES } from '../infra/106-battle-enums.js';
import { getBattleRng } from '../core/214-battle-shared.js';
import { spawnUnit } from '../core/205-battle-horse.js';
import { getSkillParams } from '../core/201-config-5v5-test.js';

export const summonBengBengHandler = {
    fields: {},
    install({ eventBus, A, B, decl }) {
        const selfTeam = decl.camp === CAMP_TYPES.ALLY ? A : B;
        const self = selfTeam.find(u => u.alive && u.name === decl.name);
        if (!self) return;

        const params = getSkillParams(decl.name, 'summonBengBeng');
        if (!params) throw new Error(`缺技能参数: ${decl.name}.summonBengBeng`);

        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_START,
            priority: L.ROUND_START.XIE_SUMMON,
            handler: (data) => {
                if (!self.alive || self.state._pendingDeath) return;
                const myTeam = self.camp === CAMP_TYPES.ALLY ? data.A : data.B;
                // 落位只看己方空位（每方各自占 1-9，与灭绝召唤周芷若同口径）
                const occupied = new Set(myTeam.filter(u => u.alive).map(u => u.pos));
                const free = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(p => !occupied.has(p));
                if (free.length === 0) return;
                const pos = free[getBattleRng().nextInt(0, free.length - 1)];
                const unit = spawnUnit(myTeam, '蹦蹦', params.m, ROLE_TYPES.WARRIOR, pos,
                    { atk: params.atk, def: params.def, maxHp: params.maxHp, skipRoleBonus: true });
                data.log.push({
                    factType: FACT_TYPES.SUMMON_UNIT,
                    data: { summonName: unit.name, summonUid: unit.uid, pos, byName: self.name }
                });
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.SUMMON_BENGBENG, summonBengBengHandler);
