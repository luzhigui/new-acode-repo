// fx/88fx-trigger.js
// V6.1.2 | 2026-09-24 远程分支补 isDodge 弧线（简单模式远程闪避有画面）；死亡态改由引擎状态驱动，这里不再派发 DEAD flash / _isDead
export const VER = 'fx/88fx-trigger.js V6.1.2';

import { getKillTaunt } from '../core/03battle-utils.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { ROLE_TYPES } from '../infra/56-battle-enums.js';
import { showDanmaku, showDamageFloat, showDodgeBubble } from './80fx-common-5v5-test.js';
import { showRangedArrow } from './81fx-arrows-5v5-test.js';
import { showMeleeCrash, showMeleeDodge, showMeleeMiss } from './82fx-crash-5v5-test.js';
import { markGridShake } from '../render/32-grid-render.js';
import { clock } from '../infra/52-clock.js';

// 颤动规则单一入口：目前仅远程飞箭命中触发，未来调整规则只改此处
export function shakeTarget(uid, durationMs = 350) {
    if (GlobalStore.get('fastForwardActive')) return;
    markGridShake(uid, durationMs);
}

// 统一视觉特效入口：弹幕/箭矢/飞撞/死亡
export function _triggerFX(fxSnapshot, unitA, unitD, isDead, isDodge, isMiss, isBlock, dmg, waveTaunt, waveUnit, attackerRole) {
    if (GlobalStore.get('fastForwardActive')) return;
    if (isDead && unitA && !isBlock && !isMiss && !isDodge) {
        let killTaunt = getKillTaunt(unitA);
        clock.wait(0).then(() => showDanmaku(unitA, killTaunt));
    } else if (waveTaunt && waveUnit && !isBlock && !isMiss && !isDodge) {
        let delay = 0;
        if (dmg !== undefined && dmg >= 30) delay = 0;
        else if (dmg !== undefined && dmg >= 20) delay = 200;
        else delay = 400;
        clock.wait(delay).then(() => showDanmaku(waveUnit, waveTaunt));
    }
    if (unitA && unitD) {
        // 攻击音效与飞撞/箭矢同步触发
        if (!isBlock && !isMiss && !isDodge && unitA) {
            AudioManager.playSfx(unitA.role);
        }
        if (attackerRole === ROLE_TYPES.RANGED && !isBlock) {
            if (isMiss) {
                showRangedArrow(unitA, unitD, false, null, true);
                // 射偏箭飞到中段再弹气泡（对齐近战"撞到一半才弹"的节奏，不在起手就抢跑）
                clock.wait(500).then(() => {
                    if (!GlobalStore.get('fastForwardActive')) showDodgeBubble(unitA, '未命中');
                });
            } else if (isDodge) {
                // 2026-09-24 远程被闪避（简单模式）：与射偏同款弧线——箭飞向目标、中途偏开，
                //   让远程闪避也有画面（原先远程分支对 isDodge 什么都不做，只有气泡）
                showRangedArrow(unitA, unitD, false, null, true);
            } else {
                showRangedArrow(unitA, unitD, false, () => {
                    shakeTarget(unitD.uid, 350);
                    // 2026-09-15 飘字延后 800ms；09-16 调到 1100ms，再等日志文本一会
                    clock.wait(1100).then(() => {
                        if (!GlobalStore.get('fastForwardActive')) showDamageFloat(unitD, dmg);
                    });
                });
            }
        } else if (!isBlock) {
            if (isDodge) {
                if (!GlobalStore.get('dodgeEffectEnabled')) {
                    showMeleeDodge(unitA, unitD);
                }
            } else if (isMiss) {
                // 2026-09-16 return：把动画 Promise 交给调用方 await
                return showMeleeMiss(unitA, unitD, () => {
                    if (!GlobalStore.get('fastForwardActive')) showDodgeBubble(unitA, '未命中');
                });
            } else {
                showMeleeCrash(unitA, unitD, () => {
                    // 2026-09-15 飘字延后 800ms；09-16 调到 1100ms，再等日志文本一会
                    clock.wait(1100).then(() => {
                        if (!GlobalStore.get('fastForwardActive')) showDamageFloat(unitD, dmg);
                    });
                    // 2026-09-24 死亡态不再由这里派发：原先在撞完 1100ms 后才发 DEAD flash（远程分支压根不发），
                    //   与「死亡特效不能延后」冲突，且替死/免疫回退取消死亡时会把格子错标成尸体。
                    //   现在死亡态只认引擎状态（resolveDeaths 写 alive/_isDead），UI 当帧就上红底 ✕。
                });
            }
        }
    }
    // 伤害飘字由 DODGE stage action 发出，此处不重复
}