// core/21-registry-calc.js — 计算修饰器注册表（战斗注册面）
// V1.0.0 | 2026-08-28 从 16effect-handlers 拆出；modules 只 import 注册函数
// 2026-10-16 从 infra/57-calc-modifier-registry.js 迁入 core（纯搬移，逻辑零改动；仅文件头与错误前缀改新路径）：
//   infra 只放无业务依赖工具，计算修饰器是战斗注册面，应住 core。
// 消费方：core/16 注册破防/无视防御/加伤/倍率/减伤；core/12 calcFinalDamage 按 type 查表。
export const VER = 'core/21-registry-calc.js V1.0.0';

const calcModifierHandlers = new Map();

// 2026-09-16 注册时校验：type 必须是 enum 里的已知值（防御拼写错误/未知类型）
export function registerCalcModifier(type, handler) {
    if (!type || typeof type !== 'string') {
        throw new Error(`[21-registry-calc] registerCalcModifier: type 必须是非空字符串`);
    }
    if (typeof handler !== 'function') {
        throw new Error(`[21-registry-calc] registerCalcModifier: handler 必须是函数`);
    }
    calcModifierHandlers.set(type, handler);
}

export function getCalcModifier(type) {
    return calcModifierHandlers.get(type);
}
