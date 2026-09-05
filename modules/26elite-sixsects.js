// V5.6.1 | ~11992 bytes | 2026-08-21 战报记账修正：新婚扣血改非记账并删手动双记
export const VER = 'modules/26elite-sixsects.js V5.6.1';
import { registerElite } from '../core/08-elite-registry.js';

// 宋青书
export function createSongQingshuComponent() {
    return {
        name: '宋青书',
        register(eventBus, A, B, log) {}
    };
}

// 周芷若
export function createZhouZhiruoComponent() {
    return {
        name: '周芷若',
        register(eventBus, A, B, log) {}
    };
}

registerElite('宋青书', createSongQingshuComponent);
registerElite('周芷若', createZhouZhiruoComponent);