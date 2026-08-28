// infra/57-calc-modifier-registry.js - 光明顶5v5 伤害修饰注册表（纯容器）
// V1.0.0 | ~450 bytes| 2026-08-28 从 core/16effect-handlers.js 拆出；modules 侧只 import 注册函数，不碰 core
export const VER = 'infra/57-calc-modifier-registry.js V1.0.0';

const calcModifierHandlers = new Map();

export function registerCalcModifier(type, handler) {
    calcModifierHandlers.set(type, handler);
}

export function getCalcModifier(type) {
    return calcModifierHandlers.get(type);
}