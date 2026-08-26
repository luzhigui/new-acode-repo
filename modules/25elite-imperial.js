// modules/25elite-imperial.js - 朝廷精英组件合集
// V5.5.1 | ~8522 bytes| 2026-08-21 战报记账修正：玄冥中毒tick传入鹿杖客作输出源
export const VER = 'modules/25elite-imperial.js V5.5.1';

import { registerElite } from '../core/08-elite-registry.js';
import { tickXuanmingPoison } from './20elite-skills.js';
import { EXECUTION_LAYER as L } from '../infra/50-event-bus.js';
import { FACT_TYPES } from '../infra/56-battle-enums.js';

// ==================== 成昆 ====================
export function createChengKunComponent() {
    return {
        name: '成昆',
        register(eventBus, A, B, log) {}
    };
}

// ==================== 鹿杖客 ====================
export function createLuZhangKeComponent() {
    return {
        name: '鹿杖客',
        register(eventBus, A, B, log) {
            const lu = B.find(u => u.name === '鹿杖客' && u.alive);
            if (!lu) return;
            eventBus.on('onRoundStart', L.ROUND_START.XUANMING_POISON, (data) => {
                const { A, B, log } = data;
                A.concat(B).forEach(u => {
                    if (!u.alive) return;
                    const dot = tickXuanmingPoison(u, lu);
                    if (dot > 0) {
                        log.push({ factType: FACT_TYPES.XUAN_MING_DOT, data: { unitName: u.name, dot, uidD: u.uid, isDead: !u.alive } });
                    }
                });
            });
        }
    };
}

// ==================== 鹤笔翁 ====================
export function createHeBiWengComponent() {
    return {
        name: '鹤笔翁',
        register(eventBus, A, B, log) {
            const he = B.find(u => u.name === '鹤笔翁' && u.alive);
            if (!he) return;
        },
    };
}



registerElite('成昆', createChengKunComponent);
registerElite('鹿杖客', createLuZhangKeComponent);
registerElite('鹤笔翁', createHeBiWengComponent);