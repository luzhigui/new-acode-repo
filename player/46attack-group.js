// V5.8.0 | ~8000 bytes | 2026-08-26 特效全部移交 stageActions，本文件只负责文本与格子闪示
export const VER = 'player/46attack-group.js V5.8.0';

import { GlobalStore, getState } from '../infra/54-global-store.js';
import { STORE_ACTION_TYPES, FLASH_TYPES, CAMP_TYPES } from '../infra/56-battle-enums.js';
import { appendLogHTML, autoScrollLog, updateRoundDisplay, playLogLine, appendHiddenDetail, findUnitByUid } from './47renderer.js';

export async function handleAttackGroup(c, entry, roundResult, abortSig, isFirstAttackRef) {
    let unitA = findUnitByUid(c, entry.uidA);
    let unitD = entry.uidD ? findUnitByUid(c, entry.uidD) : null;

    if (!entry.isBlock && !entry.isMiss && !entry.isDodge && (!unitA || !unitD)) {
        appendLogHTML(`<span class="gray">${entry.attackerName || entry.uidA || '未知'} 攻击 ${entry.targetName || entry.uidD || '未知'}，但目标已不存在</span><br>`);
    }

    if (unitA && entry.isRest && c.store) {
        c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _resting: true });
        // 休息特效 3 秒后自动清除
        setTimeout(() => {
            if (!c.store) return;
            const cur = c.store.getState().units.find(u => u.uid === unitA.uid);
            if (cur && cur.state && cur.state._resting) {
                c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _resting: false });
            }
        }, 3000);
    }

    if (unitA && entry.isBlock && c.store) {
        c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _acted: true, _blocked: true });
    }

    if (unitA && !entry.isBlock && !entry.isDodge) {
        // 闪避反击时攻击者只显示眩晕，由 DODGE stage action 处理
        if (c.store) c.store.dispatch({ type: STORE_ACTION_TYPES.SET_FLASH, uid: unitA.uid, flash: FLASH_TYPES.ATTACK });
    }

    const isFF = GlobalStore.get('fastForwardActive');
    const textEntries = entry.entries || [];
    const lineCount = textEntries.length;
    const speedFactor = isFF ? 0.001 : Math.max(c.speed, 600) / 1000;
    const offset = isFF ? 1 : (200 * speedFactor);
    const atkFlashDuration = (isFF ? 1 : (c.speed * lineCount)) + 300 * speedFactor;
    const defFlashDuration = atkFlashDuration;

    await new Promise(r => setTimeout(r, offset));
    await c.waitWhilePaused();
    if (abortSig && abortSig.aborted) return { isBattleOver: false };

    if (unitD && !entry.isMiss && !entry.isDodge && c.store) {
        c.store.dispatch({ type: STORE_ACTION_TYPES.SET_FLASH, uid: unitD.uid, flash: FLASH_TYPES.DEFEND });
    }
    let defTimer = null;
    if (unitD && !entry.isDodge && !entry.isMiss && c.store) {
        defTimer = setTimeout(async () => {
            await c.waitWhilePaused();
            if (c.store && unitD && !entry.isDead) {
                c.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: unitD.uid });
            }
        }, defFlashDuration);
    }

    let lastDiv = null;
    for (const entry2 of textEntries) {
        if (abortSig && abortSig.aborted) { if (defTimer) clearTimeout(defTimer); return { isBattleOver: false }; }
        const logLevel = getState.logLevel();
        if (logLevel === 'brief' && entry2.type === 'detail') { appendHiddenDetail(entry2.text); continue; }

        if (entry2.type === 'damage-text') {
            lastDiv = await playLogLine(entry2.text, Math.max(c.speed || 1000, 1000));
            continue;
        }

        const currentSpeed = c.speed || 1000;
        const forcedSpeed = (entry2.type === 'combat-text' || entry2.type === 'damage-text')
            ? Math.max(currentSpeed, 600)
            : Math.floor(currentSpeed * 0.8);
        await playLogLine(entry2.text, forcedSpeed);
        if (!c.userScrolled) autoScrollLog();
        if (entry2.type === 'detail' || entry2.type === 'info' || entry2.type === 'buff-bonus' || entry2.type === 'buff-splash') {
            await new Promise(r => setTimeout(r, 120));
        }
    }

    await new Promise(r => setTimeout(r, offset));
    await c.waitWhilePaused();
    if (defTimer) clearTimeout(defTimer);
    if (unitA && !unitA.state._isDead && c.store) {
        c.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: unitA.uid });
        if (!entry.isBlock && !entry.isDodge && !entry.isLinkAttack) {
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _acted: true });
        }
    }
    if (unitD && !entry.isMiss && !entry.isDead && !unitD.state._isDead && c.store) {
        c.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: unitD.uid });
    }

    updateRoundDisplay(`📜 日志（第${c.UI.round}回合）`);

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