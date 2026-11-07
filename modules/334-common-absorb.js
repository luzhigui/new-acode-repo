// modules/334-common-absorb.js — 武当莲舟·吸星（普通兵机制）
// V1.1.0 | 2026-11-07 吸取量不再取整：每目标实数扣 = max(面板值 × ratio, 0.1)，攻/防/血上限同精度；
//          旧版 floor 把 1% 不足 1 点的目标抹成 0（30 攻吸 0），那不是需求。
export const VER = 'modules/334-common-absorb.js V1.1.0';

import { registerSettlementHook, EXECUTION_LAYER as L } from '../infra/101-event-bus.js';
import { registerMechanicHandler } from '../core/219-mechanic-registry.js';
import { SIGNAL_TYPES, MECHANIC_TYPES } from '../infra/106-battle-enums.js';
import { getBattleRng, addMod, getStat, refreshMaxHp } from '../core/214-battle-shared.js';
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

                // 概率判定
                if (getBattleRng().next() >= decl.prob) return;

                let totalAtk = 0, totalDef = 0, totalMaxHp = 0;

                // 遍历全场其他人
                allUnits.forEach(u => {
                    if (!u.alive || u.uid === self.uid) return;
                    
                    // 实数吸取，保底 0.1：不做 floor/round/toFixed（面板值 × 1% = 0.3 就真吸 0.3）
                    const absorbAtk = Math.max(getStat(u, 'atk') * decl.ratio, 0.1);
                    const absorbDef = Math.max(getStat(u, 'def') * decl.ratio, 0.1);
                    const absorbHp = Math.max(getStat(u, 'maxHp') * decl.ratio, 0.1);

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
                        pushSkillAnnounce(data.log, self, '吸星大法', `🌀 ${self.name} 发动吸星：全场吸取 攻+${fmtNum(totalAtk)} 防+${fmtNum(totalDef)} 血+${fmtNum(totalMaxHp)}`, { floatText: '🌀', floatUid: self.uid });
                    }
                }
            }
        });
    }
};

registerMechanicHandler(MECHANIC_TYPES.STAT_ABSORB, statAbsorbHandler);