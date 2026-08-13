﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// ui/37fx-trigger.js - 光明顶5v5 特效触发
// V5.4.0 | ~3800 bytes| 2026-07-07
export const VER = 'ui/37fx-trigger.js V5.4.0';

import { KILL_TAUNT } from '../core/01config-5v5-test.js';
import { getKillTaunt } from '../core/03battle-utils.js';
import { showDanmaku, showDamageFloat } from '../fx/39fx-common-5v5-test.js';
import { showRangedArrow } from '../fx/40fx-arrows-5v5-test.js';
import { showMeleeCrash, showMeleeDodge, showMeleeMiss } from '../fx/41fx-crash-5v5-test.js';
import { getState, setState } from './33main-state.js';

const KT = KILL_TAUNT;

export function toggleDodgeEffect() {
    setState.dodgeEffectEnabled(!getState.dodgeEffectEnabled());
    let btn = document.getElementById('btnDodgeToggle');
    if (btn) {
        btn.classList.toggle('active', getState.dodgeEffectEnabled());
        btn.textContent = getState.dodgeEffectEnabled() ? '华丽' : '简单';
    }
}

function getPausedState() {
    return window._getPlayerContext ? window._getPlayerContext().isPaused : false;
}

export function _triggerFX(fxSnapshot, unitA, unitD, isDead, isDodge, isMiss, isBlock, dmg, waveTaunt, waveUnit, attackerRole) {
    const speed = getState.speed();
    if (GlobalStore.get('fastForwardActive')) return;
    if (isDead && unitA && !isBlock && !isMiss && !isDodge) {
        let killTaunt = getKillTaunt(unitA, KT);
        setTimeout(() => showDanmaku(unitA, killTaunt), 0);
    } else if (waveTaunt && waveUnit && !isBlock && !isMiss && !isDodge) {
        let delay = 0;
        if (dmg !== undefined && dmg >= 30) delay = 0;
        else if (dmg !== undefined && dmg >= 20) delay = 200;
        else delay = 400;
        setTimeout(() => showDanmaku(waveUnit, waveTaunt), delay);
    }
    if (unitA && unitD) {
        if (attackerRole === '远程' && !isBlock && !isMiss && !isDodge) {
            showRangedArrow(unitA, unitD, speed, getPausedState);
        } else if (!isBlock) {
            if (isDodge) {
                if (!getState.dodgeEffectEnabled()) {
                    showMeleeDodge(unitD, unitA, speed * 2, getPausedState);
                }
            } else if (isMiss) {
                showMeleeMiss(unitA, unitD, speed * 2, getPausedState);
            } else {
                showMeleeCrash(unitA, unitD, speed, getPausedState, () => {
                    if (isDead && unitD) {
                        const ctx = GlobalStore.get('playerContext');
                        if (ctx && ctx.store) {
                            ctx.store.dispatch({ type: 'SET_FLASH', uid: unitD.uid, flash: 'dead' });
                            ctx.store.dispatch({ type: 'SET_VISUAL', uid: unitD.uid, _isDead: true });
                        } else {
                            unitD._flash = 'dead';
                        }
                    }
                }, () => {
                    // 飞撞动画完成，清除攻击闪光，防止原地残留蓝色格子
                    const ctx = GlobalStore.get('playerContext');
                    if (ctx && ctx.store) {
                        ctx.store.dispatch({ type: 'CLEAR_UNIT_FLASH', uid: unitA.uid });
                    } else {
                        unitA._flash = null;
                    }
                });
            }
        }
    }
    // 掉血弹幕已移至波动行末端弹出，此处不再触发
    if (isDodge && unitD && unitA) {
        let reboundDmg = Math.floor((unitD.atk + unitD.def) * 0.5);
        showDamageFloat(unitA, reboundDmg);
    }
}

Object.defineProperty(window, '_triggerFX', { value: _triggerFX, writable: true, configurable: true });