// fx/88fx-trigger.js
// V6.1.5 | 2026-10-17 | ~5500 bytes
export const VER = 'fx/88fx-trigger.js V6.1.5';

import { getKillTaunt } from '../core/03battle-utils.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { ROLE_TYPES } from '../infra/56-battle-enums.js';
import { showDanmaku, showDamageFloat, showDodgeBubble, showMarkBurst } from './80fx-common-5v5-test.js';
import { showRangedArrow } from './81fx-arrows-5v5-test.js';
import { showMeleeCrash, showMeleeDodge, showMeleeMiss } from './82fx-crash-5v5-test.js';
import { markGridShake } from '../render/32-grid-render.js';
import { clock } from '../infra/52-clock.js';

// 唐文亮「标枪」抛出外观（老板指正：标枪该掷矛，不该近战飞撞）：
//   起手图标沿用职业图标 🪠（与 render/37 同源），枪身木色更粗更长、枪头金属灰
const JAVELIN_SHOT_STYLE = { icon: '🪠', len: 54, thick: 4, color: '#6b4a2f', headSize: 10, headColor: '#b9c1c9' };

// 颤动规则单一入口：目前仅远程飞箭命中触发，未来调整规则只改此处
export function shakeTarget(uid, durationMs = 350) {
    if (GlobalStore.get('fastForwardActive')) return;
    markGridShake(uid, durationMs);
}

// 统一视觉特效入口：弹幕/箭矢/飞撞/死亡
export function _triggerFX(fxSnapshot, unitA, unitD, isDead, isDodge, isMiss, isBlock, dmg, waveTaunt, waveUnit, attackerRole, markBurst) {
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
        // 被闪避优先于「远程/近战」分流：远程被闪避与近战同款——克隆体冲过去被挡回。
        //   原先远程走 showRangedArrow(isMiss=true) 演成「箭射偏」，读作未命中而非闪避。
        //   华丽模式的子弹时间在 render/39 的 DODGE stage action 里演，这里只管简单模式。
        if (!isBlock && isDodge) {
            if (!GlobalStore.get('dodgeEffectEnabled')) {
                showMeleeDodge(unitA, unitD);
            }
        // 标枪并入投射分支（老板指正：标枪该掷矛，不该近战飞撞）
        } else if ((attackerRole === ROLE_TYPES.RANGED || attackerRole === ROLE_TYPES.JAVELIN) && !isBlock) {
            const shotStyle = attackerRole === ROLE_TYPES.JAVELIN ? JAVELIN_SHOT_STYLE : null;
            if (isMiss) {
                showRangedArrow(unitA, unitD, false, null, true, shotStyle);
                // 射偏箭飞到中段再弹气泡（对齐近战"撞到一半才弹"的节奏，不在起手就抢跑）
                clock.wait(500).then(() => {
                    if (!GlobalStore.get('fastForwardActive')) showDodgeBubble(unitA, '未命中');
                });
            } else {
                showRangedArrow(unitA, unitD, false, () => {
                    shakeTarget(unitD.uid, 350);
                    // 箭靶碎裂：命中帧先炸 🎯，再等 1100ms 出伤害弹幕（老板：碎裂要在弹幕之前）
                    if (markBurst) showMarkBurst(unitD);
                    // 飘字延后 800ms；09-16 调到 1100ms，再等日志文本一会
                    clock.wait(1100).then(() => {
                        if (!GlobalStore.get('fastForwardActive')) showDamageFloat(unitD, dmg);
                    });
                }, false, shotStyle);
            }
        } else if (!isBlock) {
            if (isMiss) {
                // return：把动画 Promise 交给调用方 await
                return showMeleeMiss(unitA, unitD, () => {
                    if (!GlobalStore.get('fastForwardActive')) showDodgeBubble(unitA, '未命中');
                });
            } else {
                showMeleeCrash(unitA, unitD, () => {
                    // 箭靶碎裂：命中帧先炸 🎯，再等 1100ms 出伤害弹幕（老板：碎裂要在弹幕之前）
                    if (markBurst) showMarkBurst(unitD);
                    // 飘字延后 800ms；09-16 调到 1100ms，再等日志文本一会
                    clock.wait(1100).then(() => {
                        if (!GlobalStore.get('fastForwardActive')) showDamageFloat(unitD, dmg);
                    });
                    // 死亡态不再由这里派发：原先在撞完 1100ms 后才发 DEAD flash（远程分支压根不发），
                    //   与「死亡特效不能延后」冲突，且替死/免疫回退取消死亡时会把格子错标成尸体。
                    //   现在死亡态只认引擎状态（resolveDeaths 写 alive/_isDead），UI 当帧就上红底 ✕。
                });
            }
        }
    }
    // 伤害飘字由 DODGE stage action 发出，此处不重复
}