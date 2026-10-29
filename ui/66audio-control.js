export const VER = 'ui/66audio-control.js V6.0.2';

import { AudioManager } from '../modules/22audio-manager.js';

export function setBGMVolume(v) { AudioManager.setVolume(v); }
export function fadeBGMTo(targetVol, durationMs) { AudioManager.fadeTo(targetVol, durationMs); }
export function lowerBGM() { setBGMVolume(0.3); }
