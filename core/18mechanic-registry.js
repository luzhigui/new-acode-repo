// V1.0.0 | ~600 bytes | 2026-09-06 机制注册表自 modules/30 下沉 core，core/15 查表不再依赖 modules
export const VER = 'core/18mechanic-registry.js V1.0.0';

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

// 按 type 安装机制，未注册返回 false
export function installMechanicByType(eventBus, type, A, B, log) {
    const handler = mechanicHandlers.get(type);
    if (!handler) return false;
    try {
        handler.install({ eventBus, A, B, log });
    } catch (e) {
        console.error(`[18mechanic-registry] 机制 "${type}" install 执行出错:`, e);
    }
    return true;
}