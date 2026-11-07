// modules/339-elite-mingjiao-zhangzhong.js — 明教·五散人 张中「召唤蹦蹦」
// 规则：每回合开始，在己方空位召唤一只蹦蹦（参数全部来自 content 的 summonBengBeng，与谢逊幼狮同口径）。
export const VER = 'modules/339-elite-mingjiao-zhangzhong.js V1.0.0';

import { registerSettlementHook, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES, CAMP_TYPES, FACT_TYPES, ROLE_TYPES, SKILL_CUE_KINDS } from '../infra/106-battle-enums.js';
import { getBattleRng } from '../core/214-battle-shared.js';
import { spawnUnit, pickFreePos } from '../core/205-battle-horse.js';
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
                // 落位走 core/205 pickFreePos（每方各自占 1-9，随机取一格；无空位返回 null）
                const pos = pickFreePos(myTeam, getBattleRng());
                if (pos == null) return;
                const unit = spawnUnit(myTeam, '蹦蹦', params.m, ROLE_TYPES.WARRIOR, pos,
                    { atk: params.atk, def: params.def, maxHp: params.maxHp, skipRoleBonus: true });
                data.log.push({
                    factType: FACT_TYPES.SUMMON_UNIT,
                    data: {
                        summonName: unit.name, summonUid: unit.uid, pos, byName: self.name,
                        // 演出：从张中格到空位留一串残影、落点轻闪（fx/619 只读定位，不影响召唤）
                        cue: (self.pos != null)
                            ? { kind: SKILL_CUE_KINDS.SUMMON_MOVE, from: { uid: self.uid, camp: self.camp, pos: self.pos }, to: { uid: unit.uid, camp: unit.camp, pos } }
                            : null
                    }
                });
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.SUMMON_BENGBENG, summonBengBengHandler);
