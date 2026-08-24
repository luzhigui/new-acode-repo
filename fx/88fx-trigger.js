// fx/88fx-trigger.js - 光明顶5v5 特效触发入口
// V5.7.0 | ~3100 bytes| 2026-08-24 清理已删除的 KILL_TAUNT 兜底引用：击杀台词直读 gameData
export const VER = 'fx/88fx-trigger.js V5.7.0';

import { getKillTaunt } from '../core/03battle-utils.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { showDanmaku, showDamageFloat } from './80fx-common-5v5-test.js';
import { showRangedArrow } from './81fx-arrows-5v5-test.js';
import { showMeleeCrash, showMeleeDodge, showMeleeMiss } from './82fx-crash-5v5-test.js';

function getPausedState() {
    const ctx = GlobalStore.get('playerContext');
    return ctx ? ctx.isPaused : false;
}

// 特效-触发：统一视觉特效入口（弹幕/箭矢/飞撞/死亡）
export function _triggerFX(fxSnapshot, unitA, unitD, isDead, isDodge, isMiss, isBlock, dmg, waveTaunt, waveUnit, attackerRole) {
    const speed = GlobalStore.get('speed');
    if (GlobalStore.get('fastForwardActive')) return;
    if (isDead && unitA && !isBlock && !isMiss && !isDodge) {
        let killTaunt = getKillTaunt(unitA);
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
                if (!GlobalStore.get('dodgeEffectEnabled')) {
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
    if (isDodge && unitD && unitA) {
        let reboundDmg = Math.floor((unitD.atk + unitD.def) * 0.5);
        showDamageFloat(unitA, reboundDmg);
    }
}