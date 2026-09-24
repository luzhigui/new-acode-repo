// V1.0.1 | ~1400 bytes | 2026-09-06 注册表下沉 core/18，本文件仅注册 damageReflect
export const VER = 'modules/30custom-effects.js V1.0.1';

import { registerSettlementHook, EFFECT_TYPES, EXECUTION_LAYER as L } from '../infra/50-event-bus.js';
import { registerMechanicHandler } from '../core/18mechanic-registry.js';
import { SIGNAL_TYPES, FACT_TYPES } from '../infra/56-battle-enums.js';

// 机制注册表已下沉 core/18，本文件只负责注册具体机制
export { registerMechanicHandler, hasMechanicHandler, installMechanicByType } from '../core/18mechanic-registry.js';

// dotTick：通用 DOT tick 原语（每回合按剩余数取档扣血）。
// 声明形态：
//   { type: "dotTick", stateKey: "_xuanmingPoison", factKey: "XUAN_MING_DOT", reason: "玄冥中毒", sourceName: "鹿杖客" }
// stateKey 指向的状态结构：{ remaining: number, dotPercents: [..] }
//   —— percentages 由施加端（onHitEffects: poison）写入 state，tick 端只负责按 remaining 取档。
registerMechanicHandler('dotTick', {
    install({ eventBus, decl }) {
        const factType = FACT_TYPES[decl.factKey];
        if (!factType) throw new Error(`[dotTick] 未知 factKey: ${decl.factKey}`);
        registerSettlementHook({
            when: SIGNAL_TYPES.ON_ROUND_START,
            priority: L.ROUND_START.XUANMING_POISON,
            handler: (data) => {
                const allUnits = [...(data.A || []), ...(data.B || [])];
                const source = decl.sourceName ? allUnits.find(u => u.name === decl.sourceName) : null;
                allUnits.forEach(u => {
                    if (!u.alive) return;
                    const st = u.state[decl.stateKey];
                    if (!st || st.remaining <= 0) return;
                    st.remaining--;
                    const idx = Math.min(st.dotPercents.length - 1, st.dotPercents.length - 1 - st.remaining);
                    const pct = st.dotPercents[idx] || 0;
                    const dot = Math.floor(u.maxHp * pct);
                    if (dot > 0) {
                        data.declarations.push({
                            type: EFFECT_TYPES.ROUND_STAT_GRANT,
                            field: 'hp',
                            delta: -dot,
                            target: u,
                            source,
                            reason: decl.reason
                        });
                        data.log.push({ factType, data: { unitName: u.name, dot, uidD: u.uid, isDead: !u.alive } });
                    }
                });
            }
        });
    }
});

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