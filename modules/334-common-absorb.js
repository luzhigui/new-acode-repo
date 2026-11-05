// modules/334-common-absorb.js — 武当莲舟·吸星（普通兵机制）
export const VER = 'modules/334-common-absorb.js V1.0.0';

import { registerSettlementHook, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES } from '../infra/106-battle-enums.js';
import { getBattleRng, addMod, getStat, refreshMaxHp } from '../core/214-battle-shared.js';
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

                // 概率判定
                if (getBattleRng().next() >= decl.prob) return;

                let totalAtk = 0, totalDef = 0, totalMaxHp = 0;

                // 遍历全场其他人
                allUnits.forEach(u => {
                    if (!u.alive || u.uid === self.uid) return;
                    
                    const absorbAtk = Math.max(0, Math.floor(getStat(u, 'atk') * decl.ratio));
                    const absorbDef = Math.max(0, Math.floor(getStat(u, 'def') * decl.ratio));
                    const absorbHp = Math.max(0, Math.floor(getStat(u, 'maxHp') * decl.ratio));

                    if (absorbAtk > 0) addMod(u, 'atk', { source: '被吸星', value: -absorbAtk, ttl: 'permanent', group: 'absorbed', op: 'add' });
                    if (absorbDef > 0) addMod(u, 'def', { source: '被吸星', value: -absorbDef, ttl: 'permanent', group: 'absorbed', op: 'add' });
                    if (absorbHp > 0) {
                        addMod(u, 'maxHp', { source: '被吸星', value: -absorbHp, ttl: 'permanent', group: 'absorbed', op: 'add' });
                        refreshMaxHp(u, null, '被吸星');
                    }

                    totalAtk += absorbAtk;
                    totalDef += absorbDef;
                    totalMaxHp += absorbHp;
                });

                // 结算给自己（至少吸到一点属性才提示，防止0收益满屏飘字）
                if (totalAtk > 0 || totalDef > 0 || totalMaxHp > 0) {
                    if (totalAtk > 0) addMod(self, 'atk', { source: '吸星大法', value: totalAtk, ttl: 'permanent', group: 'absorbGain', op: 'add' });
                    if (totalDef > 0) addMod(self, 'def', { source: '吸星大法', value: totalDef, ttl: 'permanent', group: 'absorbGain', op: 'add' });
                    if (totalMaxHp > 0) {
                        addMod(self, 'maxHp', { source: '吸星大法', value: totalMaxHp, ttl: 'permanent', group: 'absorbGain', op: 'add' });
                        refreshMaxHp(self, null, '吸星大法');
                    }
                    
                    if (data.log) {
                        pushSkillAnnounce(data.log, self, '吸星大法', `🌀 ${self.name} 发动吸星：全场吸取 攻+${totalAtk} 防+${totalDef} 血+${totalMaxHp}`, { floatText: '🌀', floatUid: self.uid });
                    }
                }
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.STAT_ABSORB, statAbsorbHandler);