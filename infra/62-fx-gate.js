// infra/62-fx-gate.js — 演出层统一开关判据（「这次演出要不要跳过」的唯一出口）
// 以后加判据（如「简单模式跳过特写」）只改本文件，各 fx 零改动。
export const VER = 'infra/62-fx-gate.js V1.0.0';

import { GlobalStore } from './54-global-store.js';

// 本次演出是否应跳过：快进中一律跳。
export function isFxSkipped() {
    return !!GlobalStore.get('fastForwardActive');
}