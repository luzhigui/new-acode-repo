// modules/30custom-effects.js - 光明顶5v5 自定义机制注册表（核心机制查表化）
// V1.0.0 | ~1800 bytes| 2026-08-29 机制查表化：registerMechanicHandler/installMechanicByType/hasMechanicHandler；demageReflect（反伤护盾）纯数据接入
export const VER = 'modules/30custom-effects.js V1.0.0';

import { registerSettlementHook, EFFECT_TYPES, EXECUTION_LAYER as L } from '../infra/50-event-bus.js';

// 机制注册表：type -> 处理器（处理器须提供 install({eventBus,A,B,log})）
// 第三方/数据驱动机制在此按 type 注册，core/15 仅在查表后调用 installMechanicByType 安装
const mechanicHandlers = new Map();

// 注册一个机制处理器
export function registerMechanicHandler(type, handler) {
    if (!type || typeof type !== 'string') {
        throw new Error(`[30custom-effects] registerMechanicHandler: type 必须是非空字符串`);
    }
    if (!handler || typeof handler.install !== 'function') {
        throw new Error(`[30custom-effects] registerMechanicHandler: 机制 "${type}" 的 handler 必须提供 install() 方法`);
    }
    mechanicHandlers.set(type, handler);
}

// 查询某机制是否已注册
export function hasMechanicHandler(type) {
    return mechanicHandlers.has(type);
}

// 按 type 安装机制（查表；未注册返回 false，已注册执行 install）
export function installMechanicByType(eventBus, type, A, B, log) {
    const handler = mechanicHandlers.get(type);
    if (!handler) return false;
    try {
        handler.install({ eventBus, A, B, log });
    } catch (e) {
        console.error(`[30custom-effects] 机制 "${type}" install 执行出错:`, e);
    }
    return true;
}

// ==================== damageReflect：反伤护盾（纯数据接入）====================
// 数据源：content/200game-data.json -> characters["反伤弟子"].mechanics [{camp:"ally",type:"damageReflect",reflectRatio:0.30}]
// 命中结算后，若受害者是存活的反伤弟子且伤害>0，向攻击者反弹 reflectRatio(30%) 伤害
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