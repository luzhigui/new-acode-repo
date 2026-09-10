// V6.1.0 | ~1400 bytes | 2026-09-10 单位状态变化统一发射口：所有"单位状态变了"的机制信号都从这里发
// 说明：本文件只负责"机制信号"通道（eventBus）。
//   日志 fact 是领域特定的事实（每种变化的字段形态不同：飞天带 reason/incomingDmg，
//   附身带 hostUid/atkTransfer），继续由各源头的 log.push 负责，不在本文件统一。
export const VER = 'infra/59-state-change.js V6.1.0';

import { eventBus } from './50-event-bus.js';
import { SIGNAL_TYPES, STATE_CHANGE_TYPES } from './56-battle-enums.js';

// 发射单位状态变化：unit=发生变化的单位，changeType=STATE_CHANGE_TYPES 之一，extra=附加字段
// 关心此变化的机制统一订阅 SIGNAL_TYPES.ON_UNIT_STATE_CHANGE，无需分别订阅死亡/换位/飞天……
export function emitStateChange(unit, changeType, extra, log) {
    if (!unit || !unit.uid) return;
    const data = Object.assign({
        unitUid: unit.uid,
        unitName: unit.name,
        changeType,
        log: log || null
    }, extra || {});
    eventBus.emit(SIGNAL_TYPES.ON_UNIT_STATE_CHANGE, data);
}

export { STATE_CHANGE_TYPES };