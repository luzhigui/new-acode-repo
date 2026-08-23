// player/45event-handlers.js - 光明顶5v5 事件处理器函数族
// V5.6.0 | ~27500 bytes| 2026-08-23 导演调度：格子标记与位置统一走stageAction
export const VER = 'player/45event-handlers.js V5.6.0';

import { isBlocked } from '../core/03battle-utils.js';
import { _triggerFX } from '../fx/88fx-trigger.js';
import { showDanmaku, showDamageFloat, showDodgeBubble, showHealFloat, showAtkBuffFloat, applyBrushEffect, showBuffBanner, showCriticalBanner, showHeartEffect, showPinkFlash, showKuLianEffect, showWindClaw, showDodgeBulletTime, showRangedArrow, showSplashArrows, showBoneClaw, animatePositionSwap, animatePushBack, animatePushSwap, showButterflyFlyOut, showButterflyFlyBack, showSpiderAscend, showSpiderDescend, showSpiderStrike } from '../fx/87fx-manager.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { getState } from '../infra/54-global-store.js';
import { appendLogHTML, appendLogElement, autoScrollLog, updateRoundDisplay, renderSeparator, playLogLine, appendHiddenDetail, findUnitByUid } from './47renderer.js';

const safeShowDanmaku = (...args) => { try { return showDanmaku(...args); } catch(e) {} };

export async function handleBuffBonus(c, entry) {
    appendLogHTML(entry.text + '<br>');
    // 额外伤害飘字已由导演 stageAction 统一处理
}

export async function handleBuffSwap(c, entry) {
    c.isPaused = true;
    GlobalStore.set('bulletTimeActive', true);
    await showBuffBanner('🌀 惑人心智！');
    appendLogHTML(entry.text + '<br>');
    let unitA = entry.uidA ? findUnitByUid(c, entry.uidA) : null;
    let unitB = entry.uidB ? findUnitByUid(c, entry.uidB) : null;
    if (unitA && unitB) {
        let oldPosA = entry.oldPosA, oldPosB = entry.oldPosB;
        await animatePositionSwap(unitA, unitB, c, {
            skipDataChange: true,
            oldPositions: (oldPosA != null && oldPosB != null) ? [oldPosA, oldPosB] : null
        });
        // 位置交换已由导演 stageAction 'posSwap' 统一处理
    }
    GlobalStore.set('bulletTimeActive', false);
    c.isPaused = false;
}

export async function handleBuffPush(c, entry) {
    c.isPaused = true;
    GlobalStore.set('bulletTimeActive', true);
    // 击退位置已由导演 stageAction 'push' 统一处理
    await showBuffBanner('🦅 乘风突袭！');
    GlobalStore.set('bulletTimeActive', false);
    c.isPaused = false;
    appendLogHTML(entry.text + '<br>');
    let targetUnit = findUnitByUid(c, entry.pushTargetUid);
    if (entry.behindUid) {
        let behindUnit = findUnitByUid(c, entry.behindUid);
        if (targetUnit && behindUnit) {
            await animatePushSwap(targetUnit, behindUnit, c, { skipDataChange: true });
        }
    } else if (targetUnit) {
        await animatePushBack(targetUnit, c, entry.newPos, { skipDataChange: true });
    }
}

export async function handleBuffReboundFortify(c, entry) {
    c.isPaused = true;
    GlobalStore.set('bulletTimeActive', true);
    await showBuffBanner('🛡️ 严阵以待！');
    GlobalStore.set('bulletTimeActive', false);
    c.isPaused = false;
    // 反伤/自伤飘字已由导演 stageAction 'attack' 统一处理
    // 死亡标记已由导演 stageAction 统一处理
    appendLogHTML(entry.text + '<br>');
    await new Promise(r=>setTimeout(r, GlobalStore.get('fastForwardActive') ? 1 : c.speed/2));
}

export async function handleInfo(c, entry) {
    if (entry.fastEntry) {
        appendLogHTML(entry.text + '<br>');
        updateRoundDisplay(`📜 日志（第${c.UI.round}回合）`);
        return;
    }

    async function getButterflyFx(name) {
        if (window[name]) return window[name];
        const mod = await import('../fx/86fx-butterfly-spider.js');
        return mod[name];
    }
    if (entry.butterflyAction === 'attach' && entry.sisterUid && entry.hostUid) {
        const sister = findUnitByUid(c, entry.sisterUid);
        const host = findUnitByUid(c, entry.hostUid);
        if (sister && sister.alive && host) {
            const showButterflyFlyOut = await getButterflyFx('showButterflyFlyOut');
            showButterflyFlyOut(sister, host);
        }
    } else if (entry.butterflyAction === 'return' && entry.sisterUid) {
        const sister = findUnitByUid(c, entry.sisterUid);
        if (sister && sister.alive) {
            const showButterflyFlyBack = await getButterflyFx('showButterflyFlyBack');
            const hostUid = (sister.state && sister.state._butterflyHost) || sister._butterflyHost;
            const host = hostUid ? findUnitByUid(c, hostUid) : null;
            if (host) showButterflyFlyBack(host, sister);
        }
    } else if (entry.spiderAction === 'fly' && entry.spiderUid) {
        const brother = findUnitByUid(c, entry.spiderUid);
        if (brother && brother.alive) {
            const showSpiderAscend = await getButterflyFx('showSpiderAscend');
            showSpiderAscend(brother);
        }
    } else if (entry.spiderAction === 'return' && entry.spiderUid) {
        const brother = findUnitByUid(c, entry.spiderUid);
        if (brother && brother.alive) {
            c.store.dispatch({ type: 'SET_VISUAL', uid: brother.uid, _flyMode: null, _acted: false });
            const showSpiderDescend = await getButterflyFx('showSpiderDescend');
            showSpiderDescend(brother);
        }
    }

    if(entry.isZhangSwitch&&entry.unit){ let zhangUnit = c.store ? c.store.getState().units.find(u => u.isZhang) : null; renderSeparator(); await playLogLine(entry.text); if(zhangUnit) { c.store.dispatch({ type: 'SET_VISUAL', uid: zhangUnit.uid, _resting: false }); safeShowDanmaku(zhangUnit, '不好，要顶上去了！'); } }
    else {
        if (entry.isDoubleStrikeBanner) {
            c.isPaused = true;
            await showBuffBanner('⚡ 概率连击！');
            c.isPaused = false;
        }

        if (entry.buffType === 'elite_xinhun') {
            let song = c.store ? c.store.getState().units.find(u => u.name === '宋青书') : null;
            let zhou = findUnitByUid(c, entry.zhouUid);
            if (zhou) c.store.dispatch({ type: 'SET_VISUAL', uid: zhou.uid, _hasKuaiLe: true });
            requestAnimationFrame(() => {
                if (song) showHeartEffect(song);
                if (zhou) showHeartEffect(zhou);
                if (zhou && zhou.alive) showPinkFlash(zhou);
            });
            if (zhou && entry.hpDeduct && !GlobalStore.get('fastForwardActive')) {
                showDamageFloat(zhou, entry.hpDeduct);
            }
        }
        // 快乐回血飘字已由导演 stageAction 'heal' 统一处理
        if (entry.buffType === 'qiankun_atk' && entry.atkTargetUid && entry.atkGain) {
            const atkTarget = findUnitByUid(c, entry.atkTargetUid);
            if (atkTarget) {
                setTimeout(() => showAtkBuffFloat(atkTarget, entry.atkGain), 180);
            }
        }

        // 蛛袭已由导演 stageAction 'spiderStrike' 统一驱动特效与掉血，不再经过日志分支

        if (entry.isClawHit && entry.clawAttackerUid && entry.clawTargetUid) {
            let attacker = findUnitByUid(c, entry.clawAttackerUid);
            let target = findUnitByUid(c, entry.clawTargetUid);
            if (target && entry.text) {
                let dmgMatch = entry.text.match(/造成 (\d+) 点伤害/);
                if (dmgMatch) showDamageFloat(target, parseInt(dmgMatch[1]));
            }
            if (attacker && target) {
                showBoneClaw(attacker, target, c.speed, () => c.isPaused, null, { isExecute: entry.isExecute });
            }
            if (entry._events && entry._events.length > 0) {
                c.store.dispatch({ type: 'APPLY_EVENTS', events: entry._events });
            }
        }
        // 治疗飘字已由导演 stageAction 'heal' 统一处理

        // rebond 飘字已由导演 stageAction 'attack' 统一处理
        if (entry.isDead && entry.uidD) {
            let deadUnit = findUnitByUid(c, entry.uidD);
            const deadDiv = await playLogLine(entry.text);
            applyBrushEffect(deadDiv);
            if (entry.dmg && deadUnit) showDamageFloat(deadUnit, entry.dmg);
        } else {
            await playLogLine(entry.text);
        }
    }
    updateRoundDisplay(`📜 日志（第${c.UI.round}回合）`);
}

export async function handleRoundStart(c, entry, isFirstAttackRef) {
    c.UI.round = parseInt(entry.text.match(/\d+/)[0])||1;
    if (isFirstAttackRef) isFirstAttackRef.value = true;
    appendLogHTML(entry.text + '<br>');
    updateRoundDisplay(`📜 日志（第${c.UI.round}回合）`);
    await new Promise(r=>setTimeout(r, GlobalStore.get('fastForwardActive') ? 1 : c.speed/3));
}

export async function handleRoundEnd(c, entry, log, i) {
    appendLogHTML(entry.text + '<br>');
    updateRoundDisplay(`📜 日志（第${c.UI.round}回合）`);
    if (c.updateBuffSlots) { c.updateBuffSlots(); }
    if (window._refreshGlowCells) window._refreshGlowCells();
    await new Promise(r=>setTimeout(r,c.speed/3));
}

export function shouldStartNewGroup(entry, lastType) {
    if (!lastType) return false;
    if (entry.needsSeparator) return true;
    return false;
}