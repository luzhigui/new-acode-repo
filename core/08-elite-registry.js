// V5.4.0 | ~800 bytes | 2026-08-12 core层定义注册接口，modules层注册
export const VER = 'core/08-elite-registry.js V5.4.0';

const eliteRegistry = new Map();

// 注册精英组件工厂：name=角色名，factory 返回 { register }
export function registerElite(name, factory) {
    eliteRegistry.set(name, factory);
}

export function getEliteFactories() {
    return eliteRegistry;
}