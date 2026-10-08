// V6.0.0 | 2026-08-26 移除 handleBuffLeech re-export（接口变更）
export const VER = 'player/44battle-player-5v5-test.js V6.0.0';

import { playBattle, clearAllEffects } from './42player-core.js';
import { playLineText, setPlayerContext as setTextCtx } from './40player-text.js';
// 2026-10-08 清死转口（外部AI清单#8/#9）：playLogEntries（import 后未转出，42 侧整函数全库零调用）已删；
//   handleBuffSummon/Destroy 转出仅 61 import 且函数体零使用（真身在 41，42 内部直接调用）——转口删；
//   ALL_VERS（61 自拼 window.ALL_VERS，本 export 无人提货）连同 VER_CORE/VER_TEXT/VER_BUFF_UI 死 import 删。
//   保留：playBattle/clearAllEffects/playLineText 转出（61 在用）与本文件 VER（61 import BP_VER）。

export { playBattle, clearAllEffects, playLineText };