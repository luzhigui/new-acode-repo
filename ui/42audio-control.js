﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// ui/42audio-control.js - 光明顶5v5 音频控制
// V5.4.0 | ~1200 bytes| 2026-07-07
export const VER = 'ui/42audio-control.js V5.4.0';

import { AudioManager } from '../modules/28audio-manager.js';

export function initBGM() { AudioManager.init(); }
export function playBGM() { AudioManager.play(); }
export function pauseBGM() { AudioManager.pause(); }
export function setBGMVolume(v) { AudioManager.setVolume(v); }
export function fadeBGMTo(targetVol, durationMs) { AudioManager.fadeTo(targetVol, durationMs); }
export function toggleBGM() { AudioManager.cycleSource(); updateBGMBtn(); }
export function updateBGMBtn() {
    const btn = document.getElementById('btnBGM');
    if (btn) {
        const source = AudioManager.currentSource;
        btn.classList.toggle('active', AudioManager.enabled);
        if (source === 'network') btn.textContent = '🎵 网络';
        else if (source === 'local') btn.textContent = '🎵 本地';
        else btn.textContent = '🎵 静音';
    }
}
export function lowerBGM() { setBGMVolume(0.3); }