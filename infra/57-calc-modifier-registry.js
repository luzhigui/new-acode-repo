// V1.0.0 | 2026-08-28 从 16effect-handlers 拆出；modules 只 import 注册函数
export const VER = 'infra/57-calc-modifier-registry.js V1.0.0';

const calcModifierHandlers = new Map();

// 2026-09-16 注册时校验：type 必须是 enum 里的已知值（防御拼写错误/未知类型）
export function registerCalcModifier(type, handler) {
    if (!type || typeof type !== 'string') {
        throw new Error(`[57-calc-modifier-registry] registerCalcModifier: type 必须是非空字符串`);
    }
    if (typeof handler !== 'function') {
        throw new Error(`[57-calc-modifier-registry] registerCalcModifier: handler 必须是函数`);
    }
    calcModifierHandlers.set(type, handler);
}

export function getCalcModifier(type) {
    return calcModifierHandlers.get(type);
}