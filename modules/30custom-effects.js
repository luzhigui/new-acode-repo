// V1.1.1 | 2026-10-12 | ~5100 bytes
export const VER = 'modules/30custom-effects.js V1.1.1';

import { registerSettlementHook, EFFECT_TYPES, EXECUTION_LAYER as L } from '../infra/50-event-bus.js';
import { registerMechanicHandler } from '../core/18mechanic-registry.js';
import { SIGNAL_TYPES, FACT_TYPES, MECHANIC_TYPES } from '../infra/56-battle-enums.js';
import { recordHpAudit } from '../core/13battle-shared.js';

// 机制注册表已下沉 core/18，本文件只负责注册具体机制
export { registerMechanicHandler, hasMechanicHandler, installMechanicByType } from '../core/18mechanic-registry.js';

// dotTick：通用 DOT tick 原语（每回合按剩余数取档扣血）。
// 声明形态（type 值见 MECHANIC_TYPES.DOT_TICK）：
//   { type: "dotTick", stateKey: "_xuanmingPoison", factKey: "XUAN_MING_DOT", reason: "玄冥中毒", sourceName: "鹿杖客" }
// stateKey 指向的状态结构：{ remaining: number, dotPercents: [..] }
//   —— percentages 由施加端（onHitEffects: poison）写入 state，tick 端只负责按 remaining 取档。
registerMechanicHandler(MECHANIC_TYPES.DOT_TICK, {
    // reason/sourceName 可选（sourceName 缺省时 tick fact 不带 source）
    fields: { stateKey: 'string', factKey: 'string' },
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
                    // 不衰减 + 可叠加：固定取首档 pct，按 stacks 倍乘（无上限）
                    const stacks = st.stacks || 1;
                    const pct = (st.dotPercents[0] || 0) * stacks;
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
                        // isDead 用预测值：毒是声明式扣血，u.hp 此刻尚未落账，结算阶段才 applyStatChange。
                        //   原 isDead: !u.alive 在声明期恒为 false ⇒ 寒毒致死从不带死亡标记。
                        data.log.push({ factType, data: { unitName: u.name, dot, uidD: u.uid, isDead: (u.hp - dot) <= 0, stacks } });
                        // 审计账本：玄冥中毒自身 hp 贡献记进 unit._audit.hp，供 stat-decl 对照器按
                        //   group='xuanMingDot' 比对「声明 dot vs 实际扣血」。审计容器全库无读点、详情弹窗只渲染 atk/def。
                        recordHpAudit(u, 'xuanMingDot', -dot, '玄冥中毒');
                    }
                });
            }
        });
    }
});

// damageReflect：反伤护盾，纯数据接入
// 数据源：gameData.characters["反伤弟子"].mechanics
// 反伤弟子受击后反弹 30% 给攻击者
registerMechanicHandler(MECHANIC_TYPES.DAMAGE_REFLECT, {
    fields: { reflectRatio: 'number' },
    install({ eventBus, decl }) {
        // 反弹率唯一来源：内容表 characters.反伤弟子.mechanics.damageReflect.reflectRatio（1 = 100%）
        const ratio = decl && decl.reflectRatio;
        if (typeof ratio !== 'number') throw new Error('缺机制参数: damageReflect.reflectRatio');
        registerSettlementHook({
            when: 'afterDamageApplied',
            priority: L.AFTER_DAMAGE_APPLIED.REBOUND,
            handler: (data) => {
                const { unit, target, dmg } = data || {};
                // 仅反伤弟子存活并实际承伤时触发。去名字字面量：用声明自带的 decl.name
                //   （buildMechanicDeclarations 注入的角色名），不再硬编码「反伤弟子」
                if (!target || target.name !== decl.name || !target.alive) return;
                if (!dmg || dmg <= 0) return;
                const value = Math.floor(dmg * ratio);
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