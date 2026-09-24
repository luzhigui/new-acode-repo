// V6.0.0 | 2026-08-21 战报记账修正：玄冥中毒tick传入鹿杖客作输出源
export const VER = 'modules/25elite-imperial.js V6.0.0';

import { registerElite } from '../core/08-elite-registry.js';

// 成昆
export function createChengKunComponent() {
    return {
        name: '成昆',
        register(eventBus, A, B, log) {}
    };
}

// 鹿杖客：玄冥毒 tick 已收归数据驱动的 dotTick 原语（modules/30 + content 声明），
//   本组件不再持有 tick 逻辑——残存 register 空实现以保持注册表结构一致。
export function createLuZhangKeComponent() {
    return {
        name: '鹿杖客',
        register(eventBus, A, B, log) {}
    };
}

// 鹤笔翁
export function createHeBiWengComponent() {
    return {
        name: '鹤笔翁',
        register(eventBus, A, B, log) {
            const he = B.find(u => u.isHeBiWeng && u.alive);
            if (!he) return;
        },
    };
}



registerElite('成昆', createChengKunComponent);
registerElite('鹿杖客', createLuZhangKeComponent);
registerElite('鹤笔翁', createHeBiWengComponent);