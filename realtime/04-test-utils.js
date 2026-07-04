// realtime/04-test-utils.js - 测试用工具函数（纯数学运算，零依赖）
export function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function calcDamage(atk, def) {
    if (def <= 0) return atk;
    const d = atk * (atk / (atk + def));
    return Math.max(d, atk * 0.1);
}