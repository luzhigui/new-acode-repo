// player/11battle-player-5v5-test.js - 光明顶5v5 战斗播放器入口
// V4.0.0 | ~45 lines | 2026-06-29 09:29
export const VER = 'player/11battle-player-5v5-test.js V4.0.0';

// 导入子模块的实际功能函数
import { playBattle, playLogEntries, clearAllEffects } from './10player-core.js';
import { playLineText, setPlayerContext as setTextCtx } from './08player-text.js';
import {
    showBuffPopup,
    handleBuffSummon,
    handleBuffDestroy,
    handleBuffLeech,
    handleBuffSplash,
    setBuffUIContext
} from './09player-buff-ui.js';

// 子模块版本号
import { VER as VER_CORE } from './10player-core.js';
import { VER as VER_TEXT } from './08player-text.js';
import { VER as VER_BUFF_UI } from './09player-buff-ui.js';

// 重新导出给 main-5v5-test.js 使用
export { playBattle, clearAllEffects, playLineText };
export {
    showBuffPopup,
    handleBuffSummon,
    handleBuffDestroy,
    handleBuffLeech,
    handleBuffSplash
};

export const ALL_VERS = {
    player: VER,
    core: VER_CORE,
    text: VER_TEXT,
    buffUI: VER_BUFF_UI
};