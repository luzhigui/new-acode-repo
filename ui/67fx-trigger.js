﻿// ui/67fx-trigger.js - 光明顶5v5 特效切换开关
// V5.6.0 | ~900 bytes| 2026-08-21 特效触发下沉至fx/88，本文件仅保留UI交互开关
export const VER = 'ui/67fx-trigger.js V5.6.0';

import { getState, setState } from './63main-state.js';

// 特效-切换：简单/华丽闪避效果开关
export function toggleDodgeEffect() {
    setState.dodgeEffectEnabled(!getState.dodgeEffectEnabled());
    let btn = document.getElementById('btnDodgeToggle');
    if (btn) {
        btn.classList.toggle('active', getState.dodgeEffectEnabled());
        btn.textContent = getState.dodgeEffectEnabled() ? '华丽' : '简单';
    }
}