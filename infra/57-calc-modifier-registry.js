// infra/57-calc-modifier-registry.js - 光明顶5v5 伤害修饰注册表（纯容器）
// V1.0.0 | 2026-08-28 从 16effect-handlers 拆出；modules 只 import 注册函数
export const VER = 'infra/57-calc-modifier-registry.js V1.0.0';

const calcModifierHandlers = new Map();

export function registerCalcModifier(type, handler) {
    calcModifierHandlers.set(type, handler);
}

export function getCalcModifier(type) {
    return calcModifierHandlers.get(type);
}