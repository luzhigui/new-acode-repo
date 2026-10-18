// player/42player-stage-actions.js — fact 渲染 + stageAction 三阶段执行（store/fx/storeAfter）
// V1.0.0 | ~2800 bytes | 2026-10-18 自 player/42player-core.js V6.8.9 拆出（纯搬移，函数体逐字不动）：
//   prepareLogEntry / getActionTiming / getActionFx / hasStageWork /
//   applyStageActionTo{Store,FX,StoreAfter} 整块迁入。
//   playStepInterleaved 是唯一消费方（42player-play-step.js）。
export const VER = 'player/42player-stage-actions.js V1.0.0';

import { renderLog } from '../render/30-fact-renderer.js';
import { STAGE_ACTION_DEFS } from '../render/31-stage-actions.js';

export function prepareLogEntry(entry) {
    if (!entry || !entry.factType) return entry;
    const rendered = renderLog(entry.factType, entry.data);
    if (Array.isArray(rendered)) return rendered;
    if (rendered && typeof rendered === 'object') {
        const extra = {};
        for (const k in entry) { if (k !== 'factType' && k !== 'data') extra[k] = entry[k]; }
        return Object.assign({}, rendered, extra);
    }
    return rendered;
}

export function getActionTiming(action) {
    const def = STAGE_ACTION_DEFS[action && action.kind];
    if (!def) return 'beforeText';
    return typeof def.timing === 'function' ? def.timing(action) : (def.timing || 'beforeText');
}

export function getActionFx(action) {
    const def = STAGE_ACTION_DEFS[action && action.kind];
    return def && def.fx ? 'has' : 'none';
}

// 2026-10-12 执行门槛修正：此前过滤器只认「有 fx 的 action」，无 fx 但有 store 回调的 action（全表唯一=ROUND_START 回合清场）
//   被整体跳过 → 回合开始「账本随回合归零」从未执行。门槛改为「fx / store / storeAfter 任一有活」；
//   fx 执行处本就各自判空（L156/L222 与 applyStageActionToFX 内），无 fx 的 action 不会误调 fx。
export function hasStageWork(action) {
    const def = STAGE_ACTION_DEFS[action && action.kind];
    return !!(def && (def.fx || def.store || def.storeAfter));
}

export function applyStageActionToStore(c, action, pendingDeaths) {
    if (!c.store || !action) return;
    const def = STAGE_ACTION_DEFS[action.kind];
    if (def && def.store) def.store(c, action, pendingDeaths);
}

export async function applyStageActionToFX(c, action) {
    if (!action) return;
    const def = STAGE_ACTION_DEFS[action.kind];
    if (def && def.fx) await def.fx(c, action);
}

export function applyStageActionToStoreAfter(c, action, pendingDeaths) {
    if (!c.store || !action) return;
    const def = STAGE_ACTION_DEFS[action.kind];
    if (def && def.storeAfter) def.storeAfter(c, action, pendingDeaths);
}