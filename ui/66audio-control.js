// V6.0.1 | 2026-10-20 删死代码：initBGM / playBGM / toggleBGM / updateBGMBtn（零调用；btnBGM 走 ui/68 bindBGButton → showMusicPanel，不经此）
// V6.0.0 | ~1200 bytes | 2026-07-07
export const VER = 'ui/66audio-control.js V6.0.1';

import { AudioManager } from '../modules/22audio-manager.js';

export function pauseBGM() { AudioManager.pause(); }
export function setBGMVolume(v) { AudioManager.setVolume(v); }
export function fadeBGMTo(targetVol, durationMs) { AudioManager.fadeTo(targetVol, durationMs); }
export function lowerBGM() { setBGMVolume(0.3); }
