// core/08-elite-registry.js - 光明顶5v5 精英组件注册表
// V5.4.0 | ~800 bytes| 2026-08-12 core层定义注册接口，modules层注册
export const VER = 'core/08-elite-registry.js V5.4.0';

const eliteRegistry = new Map();

/**
 * 注册精英组件工厂
 * @param {string} name - 角色名
 * @param {function} factory - 工厂函数，返回 { register(eventBus, A, B, log) }
 */
export function registerElite(name, factory) {
    eliteRegistry.set(name, factory);
}

/**
 * 获取所有已注册的精英工厂
 * @returns {Map<string, function>}
 */
export function getEliteFactories() {
    return eliteRegistry;
}