// render/31-stage-actions.js — 舞台动作入口（装配 + 出口）
// V7.0.0 | ~600 bytes | 2026-09-22 拆出翻译域(38)与演出域(39)：本文件只做装配与转出口
//
// 加新 fact 的演出：翻译器改 render/38，演出定义改 render/39，本文件不用动。
import './38-actions-translate.js';
import './39-actions-defs.js';
export const VER = 'render/31-stage-actions.js V7.0.0';

export { translateFactsToStageActions } from './38-actions-translate.js';
export { STAGE_ACTION_DEFS } from './39-actions-defs.js';
