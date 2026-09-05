// V1.0.1 | ~1400 bytes | 2026-09-06 注册表下沉 core/18，本文件仅注册 damageReflect
export const VER = 'modules/30custom-effects.js V1.0.1';

import { registerSettlementHook, EFFECT_TYPES, EXECUTION_LAYER as L } from '../infra/50-event-bus.js';
import { registerMechanicHandler } from '../core/18mechanic-registry.js';

// 机制注册表已下沉 core/18，本文件只负责注册具体机制
export { registerMechanicHandler, hasMechanicHandler, installMechanicByType } from '../core/18mechanic-registry.js';

// damageReflect：反伤护盾，纯数据接入
// 数据源：gameData.characters["反伤弟子"].mechanics
// 反伤弟子受击后反弹 30% 给攻击者
registerMechanicHandler('damageReflect', {
    install({ eventBus }) {
        registerSettlementHook({
            when: 'afterDamageApplied',
            priority: L.AFTER_DAMAGE_APPLIED.REBOUND,
            handler: (data) => {
                const { unit, target, dmg } = data || {};
                // 仅反伤弟子存活并实际承伤时触发
                if (!target || target.name !== '反伤弟子' || !target.alive) return;
                if (!dmg || dmg <= 0) return;
                const value = Math.floor(dmg * 0.30);
                if (value <= 0) return;
                if (!data.declarations) data.declarations = [];
                data.declarations.push({
                    type: EFFECT_TYPES.REBOUND,
                    value,
                    source: target,         // 反弹来源=反伤弟子
                    target: unit,            // 承受反弹者=进攻者
                    logText: `⚡ 反伤护盾：${target.name}反弹 ${value} 点伤害给 ${unit ? unit.name : '攻击者'}`
                });
            }
        });
    }
});