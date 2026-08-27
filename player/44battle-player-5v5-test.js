﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// player/44battle-player-5v5-test.js - 光明顶5v5 战斗播放器入口
// V5.5.1 | ~1080 bytes| 2026-08-26 移除 handleBuffLeech re-export（接口变更）
export const VER = 'player/44battle-player-5v5-test.js V5.5.1';

// 导入子模块的实际功能函数
import { playBattle, playLogEntries, clearAllEffects } from './42player-core.js';
import { playLineText, setPlayerContext as setTextCtx } from './40player-text.js';
import {
    handleBuffSummon,
    handleBuffDestroy,
    setBuffUIContext
} from './41player-buff-ui.js';

// 子模块版本号
import { VER as VER_CORE } from './42player-core.js';
import { VER as VER_TEXT } from './40player-text.js';
import { VER as VER_BUFF_UI } from './41player-buff-ui.js';

// 重新导出给 main-5v5-test.js 使用
export { playBattle, clearAllEffects, playLineText };
export {
    handleBuffSummon,
    handleBuffDestroy
};

export const ALL_VERS = {
    player: VER,
    core: VER_CORE,
    text: VER_TEXT,
    buffUI: VER_BUFF_UI
};