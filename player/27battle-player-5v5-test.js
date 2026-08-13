﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// player/27battle-player-5v5-test.js - 光明顶5v5 战斗播放器入口
// V5.4.0 | ~1100 bytes| 2026-07-05
export const VER = 'player/27battle-player-5v5-test.js V5.4.0';

// 导入子模块的实际功能函数
import { playBattle, playLogEntries, clearAllEffects } from './26player-core.js';
import { playLineText, setPlayerContext as setTextCtx } from './24player-text.js';
import {
    showBuffPopup,
    handleBuffSummon,
    handleBuffDestroy,
    handleBuffLeech,
    setBuffUIContext
} from './25player-buff-ui.js';

// 子模块版本号
import { VER as VER_CORE } from './26player-core.js';
import { VER as VER_TEXT } from './24player-text.js';
import { VER as VER_BUFF_UI } from './25player-buff-ui.js';

// 重新导出给 main-5v5-test.js 使用
export { playBattle, clearAllEffects, playLineText };
export {
    showBuffPopup,
    handleBuffSummon,
    handleBuffDestroy,
    handleBuffLeech
};

export const ALL_VERS = {
    player: VER,
    core: VER_CORE,
    text: VER_TEXT,
    buffUI: VER_BUFF_UI
};