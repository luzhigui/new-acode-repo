// V6.0.0 | 2026-08-21 | ~500 bytes
export const VER = 'ui/67fx-trigger.js V6.0.0';

import { getState, setState } from '../infra/54-global-store.js';

// 简单/华丽闪避切换
export function toggleDodgeEffect() {
    setState.dodgeEffectEnabled(!getState.dodgeEffectEnabled());
    let btn = document.getElementById('btnDodgeToggle');
    if (btn) {
        btn.classList.toggle('active', getState.dodgeEffectEnabled());
        btn.textContent = getState.dodgeEffectEnabled() ? '华丽' : '简单';
    }
}