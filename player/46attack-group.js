// V6.1.0 | 2026-09-13 统一时间层：setTimeout/waitWhilePaused 换 clock.wait，forcedSpeed 改 1x 基准时长（特效已全部移交 stageActions，本文件只负责文本与格子闪示）
export const VER = 'player/46attack-group.js V6.1.0';

import { GlobalStore, getState } from '../infra/54-global-store.js';
import { STORE_ACTION_TYPES, FLASH_TYPES, CAMP_TYPES } from '../infra/56-battle-enums.js';
import { appendLogHTML, autoScrollLog, updateRoundDisplay, playLogLine, appendHiddenDetail, findUnitByUid } from './47renderer.js';
import { showBoneClaw } from '../fx/81fx-arrows-5v5-test.js';
import { showDamageFloat } from '../fx/80fx-common-5v5-test.js';
import { clock } from '../infra/52-clock.js';

export async function handleAttackGroup(c, entry, roundResult, abortSig, isFirstAttackRef) {
    let unitA = findUnitByUid(c, entry.uidA);
    let unitD = entry.uidD ? findUnitByUid(c, entry.uidD) : null;

    if (!entry.isBlock && !entry.isMiss && !entry.isDodge && (!unitA || !unitD)) {
        appendLogHTML(`<span class="gray">${entry.attackerName || entry.uidA || '未知'} 攻击 ${entry.targetName || entry.uidD || '未知'}，但目标已不存在</span><br>`);
    }

    if (unitA && entry.isRest && c.store) {
        c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _resting: true });
        // 休息特效 3 秒后自动清除
        clock.wait(3000).then(() => {
            if (!c.store) return;
            const cur = c.store.getState().units.find(u => u.uid === unitA.uid);
            if (cur && cur.state && cur.state._resting) {
                c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _resting: false });
            }
        });
    }

    if (unitA && entry.isBlock && c.store) {
        c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _acted: true, _blocked: true });
    }

    if (unitA && !entry.isBlock && !entry.isDodge) {
        // 闪避反击时攻击者只显示眩晕，由 DODGE stage action 处理
        if (c.store) c.store.dispatch({ type: STORE_ACTION_TYPES.SET_FLASH, uid: unitA.uid, flash: FLASH_TYPES.ATTACK });
    }

    const textEntries = entry.entries || [];
    const lineCount = textEntries.length;
    // flash 持续时长：1x 基准（每行 600ms + 300ms 余量），clock 自动缩放/快进
    const atkFlashDuration = lineCount * 600 + 300;

    await clock.wait(200);
    if (abortSig && abortSig.aborted) return { isBattleOver: false };

    if (unitD && !entry.isMiss && !entry.isDodge && c.store) {
        c.store.dispatch({ type: STORE_ACTION_TYPES.SET_FLASH, uid: unitD.uid, flash: FLASH_TYPES.DEFEND });
    }
    // 受击方 flash 延迟清除：用 cancel flag 替代 clearTimeout（clock.wait 不可取消）
    let defTimerCancelled = false;
    if (unitD && !entry.isDodge && !entry.isMiss && c.store) {
        clock.wait(atkFlashDuration).then(() => {
            if (defTimerCancelled) return;
            if (c.store && unitD && !entry.isDead) {
                c.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: unitD.uid });
            }
        });
    }

    let lastDiv = null;
    for (const entry2 of textEntries) {
        if (abortSig && abortSig.aborted) { defTimerCancelled = true; return { isBattleOver: false }; }
        const logLevel = getState.logLevel();
        if (logLevel === 'brief' && entry2.type === 'detail') { appendHiddenDetail(entry2.text); continue; }

        if (entry2.type === 'damage-text') {
            lastDiv = await playLogLine(entry2.text, 1200);
            continue;
        }

        // 九阴白骨爪：每条爪击日志快速触发飞爪动画，不阻塞日志推进
        if (entry2.isClawHit) {
            const clawAttacker = findUnitByUid(c, entry2.clawAttackerUid);
            const clawTarget = findUnitByUid(c, entry2.clawTargetUid);
            if (clawAttacker && clawTarget) {
                showBoneClaw(clawAttacker, clawTarget, null, { isExecute: entry2.isExecute });
                // 爪击伤害飘字（快进跳过）
                if (!GlobalStore.get('fastForwardActive') && entry2.dmg > 0) {
                    showDamageFloat(clawTarget, entry2.dmg);
                }
            }
        }

        // combat-text/damage-text 基准 1200ms；爪击行 500ms（≈单爪动画时长，两者同步不互等）；其他 600ms
        const forcedSpeed = entry2.isClawHit ? 500
            : (entry2.type === 'combat-text' || entry2.type === 'damage-text') ? 1200 : 600;
        await playLogLine(entry2.text, forcedSpeed);
        if (!c.userScrolled) autoScrollLog();

        // 逐次更新目标血量：每击后立即同步 store，让血条跟着掉
        if (entry2.isClawHit && entry2.hpAfter !== undefined && entry2.clawTargetUid && c.store) {
            c.store.dispatch({
                type: STORE_ACTION_TYPES.HP_CHANGE,
                unitUid: entry2.clawTargetUid,
                payload: { hp: Math.max(0, entry2.hpAfter) }
            });
        }

        // 爪击之间极短间隔，形成连续快打节奏
        if (entry2.isClawHit) {
            await clock.wait(60);
        }

        if (entry2.type === 'detail' || entry2.type === 'info' || entry2.type === 'buff-bonus' || entry2.type === 'buff-splash') {
            await clock.wait(120);
        }
    }

    await clock.wait(200);
    defTimerCancelled = true;
    if (unitA && !unitA.state._isDead && c.store) {
        c.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: unitA.uid });
        if (!entry.isBlock && !entry.isDodge && !entry.isLinkAttack) {
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _acted: true });
        }
    }
    if (unitD && !entry.isMiss && !entry.isDead && !unitD.state._isDead && c.store) {
        c.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: unitD.uid });
    }

    updateRoundDisplay(`📜 日志（第${(c.store ? c.store.getState().round : (c.UI && c.UI.round)) || 1}回合）`);

    // 血量事件延迟到特效快结束才应用，避免与受击特效冲突
    if (entry._events && entry._events.length > 0) {
        c.store.dispatch({ type: STORE_ACTION_TYPES.APPLY_EVENTS, events: entry._events });
    }

    if (entry.isDead && c.store) {
        const liveUnits = c.store.getState().units;
        const allyAlive = liveUnits.some(u => u.camp === CAMP_TYPES.ALLY && u.alive);
        const enemyAlive = liveUnits.some(u => u.camp === CAMP_TYPES.ENEMY && u.alive);
        if (!allyAlive || !enemyAlive) return { isBattleOver: true };
    }
    return { isBattleOver: false };
}