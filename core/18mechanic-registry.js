// V1.2.0 | ~1900 bytes | 2026-10-02 新增 getMechanicHandler：core/15 安装期字段 schema 校验需读注册表 handler 声明的 fields（字段契约与机制实现放在一起）
export const VER = 'core/18mechanic-registry.js V1.2.0';

// 机制注册表：type → 处理器（须提供 install）
// 第三方/数据驱动机制在 modules/30 等上层注册，core 只在 15 查表调用 install
const mechanicHandlers = new Map();

export function registerMechanicHandler(type, handler) {
    if (!type || typeof type !== 'string') {
        throw new Error(`[18mechanic-registry] registerMechanicHandler: type 必须是非空字符串`);
    }
    if (!handler || typeof handler.install !== 'function') {
        throw new Error(`[18mechanic-registry] registerMechanicHandler: 机制 "${type}" 的 handler 必须提供 install() 方法`);
    }
    mechanicHandlers.set(type, handler);
}

export function hasMechanicHandler(type) {
    return mechanicHandlers.has(type);
}

// 取 handler 描述符（含可选 fields 字段契约），供 core/15 安装期校验；未注册返回 undefined
export function getMechanicHandler(type) {
    return mechanicHandlers.get(type);
}

// 按 type 安装机制，未注册返回 false。decl = 触发本次安装的声明对象（可选），
// 供 handler 读取自己的参数，避免回 gameData 反查。
// install 内部报错直接向上抛（本函数只在战斗安装期被调用，core/15 安装期校验已先于此处跑过）：
// 机制装坏了必须开局就炸，不允许 console.error 吞掉后机制静默缺失。
export function installMechanicByType(eventBus, type, A, B, log, decl) {
    const handler = mechanicHandlers.get(type);
    if (!handler) return false;
    handler.install({ eventBus, A, B, log, decl });
    return true;
}