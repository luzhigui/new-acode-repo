// ui/43fx-trigger.js - 光明顶5v5 特效触发
// V5.0.1 | ~1800 bytes | 2026-07-07
export const VER = 'ui/43fx-trigger.js V5.0.2';

import { KILL_TAUNT } from '../core/01config-5v5-test.js';
import { getKillTaunt } from '../core/07battle-engine-5v5-test.js';
import { showDanmaku, showDamageFloat } from '../fx/15fx-common-5v5-test.js';
import { showRangedArrow } from '../fx/16fx-arrows-5v5-test.js';
import { showMeleeCrash, showMeleeDodge, showMeleeMiss } from '../fx/17fx-crash-5v5-test.js';
import { getState, setState } from './39main-state.js';

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
    const detailMode = getState.detailMode();
    const speed = getState.speed();
    if (!detailMode || window._fastForwardActive) return;
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
                        // 通过 Store dispatch 设置死亡标记，不直接修改 unitD._flash
                        const ctx = window._getPlayerContext ? window._getPlayerContext() : null;
                        if (ctx && ctx.store) {
                            ctx.store.dispatch({ type: 'SET_FLASH', uid: unitD.uid, flash: 'dead' });
                            ctx.store.dispatch({ type: 'SET_VISUAL', uid: unitD.uid, _isDead: true });
                        } else {
                            unitD._flash = 'dead';  // 兜底
                        }
                    }
                });
            }
        }
    }
    if (unitD && dmg !== undefined && !isBlock && !isMiss && !isDodge) {
        showDamageFloat(unitD, dmg);
    }
    if (isDodge && unitD && unitA) {
        let reboundDmg = Math.floor((unitD.atk + unitD.def) * 0.5);
        showDamageFloat(unitA, reboundDmg);
    }
}

window._triggerFX = _triggerFX;