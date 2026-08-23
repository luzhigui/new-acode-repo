// player/45event-handlers.js - 光明顶5v5 事件处理器函数族
// V5.7.0 | ~27600 bytes| 2026-08-23 fx 直调改事件订阅，player 不再依赖 fx（含 getButterflyFx 动态 import）
export const VER = 'player/45event-handlers.js V5.7.0';

import { isBlocked } from '../core/03battle-utils.js';
import { eventBus } from '../infra/50-event-bus.js';
import { FX_SIGNALS } from '../infra/55-fx-signals.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { getState } from '../infra/54-global-store.js';
import { appendLogHTML, appendLogElement, autoScrollLog, updateRoundDisplay, renderSeparator, playLogLine, appendHiddenDetail, findUnitByUid } from './47renderer.js';

export async function handleBuffBonus(c, entry) {
    appendLogHTML(entry.text + '<br>');
    // 额外伤害飘字已由导演 stageAction 统一处理
}

export async function handleBuffSwap(c, entry) {
    c.isPaused = true;
    GlobalStore.set('bulletTimeActive', true);
    await eventBus.emit(FX_SIGNALS.BANNER, { text: '🌀 惑人心智！' });
    appendLogHTML(entry.text + '<br>');
    let unitA = entry.uidA ? findUnitByUid(c, entry.uidA) : null;
    let unitB = entry.uidB ? findUnitByUid(c, entry.uidB) : null;
    if (unitA && unitB) {
        let oldPosA = entry.oldPosA, oldPosB = entry.oldPosB;
        await eventBus.emit(FX_SIGNALS.POSITION_SWAP, {
            unitA, unitB, c,
            opts: {
                skipDataChange: true,
                oldPositions: (oldPosA != null && oldPosB != null) ? [oldPosA, oldPosB] : null
            }
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
    await eventBus.emit(FX_SIGNALS.BANNER, { text: '🦅 乘风突袭！' });
    GlobalStore.set('bulletTimeActive', false);
    c.isPaused = false;
    appendLogHTML(entry.text + '<br>');
    let targetUnit = findUnitByUid(c, entry.pushTargetUid);
    if (entry.behindUid) {
        let behindUnit = findUnitByUid(c, entry.behindUid);
        if (targetUnit && behindUnit) {
            await eventBus.emit(FX_SIGNALS.PUSH_SWAP, { target: targetUnit, behind: behindUnit, c, opts: { skipDataChange: true } });
        }
    } else if (targetUnit) {
        await eventBus.emit(FX_SIGNALS.PUSH_BACK, { target: targetUnit, c, newPos: entry.newPos, opts: { skipDataChange: true } });
    }
}

export async function handleBuffReboundFortify(c, entry) {
    c.isPaused = true;
    GlobalStore.set('bulletTimeActive', true);
    await eventBus.emit(FX_SIGNALS.BANNER, { text: '🛡️ 严阵以待！' });
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

    if (entry.butterflyAction === 'attach' && entry.sisterUid && entry.hostUid) {
        const sister = findUnitByUid(c, entry.sisterUid);
        const host = findUnitByUid(c, entry.hostUid);
        if (sister && sister.alive && host) {
            eventBus.emit(FX_SIGNALS.BUTTERFLY_FLY_OUT, { sister, host });
        }
    } else if (entry.butterflyAction === 'return' && entry.sisterUid) {
        const sister = findUnitByUid(c, entry.sisterUid);
        if (sister && sister.alive) {
            const hostUid = (sister.state && sister.state._butterflyHost) || sister._butterflyHost;
            const host = hostUid ? findUnitByUid(c, hostUid) : null;
            if (host) eventBus.emit(FX_SIGNALS.BUTTERFLY_FLY_BACK, { host, sister });
        }
    } else if (entry.spiderAction === 'fly' && entry.spiderUid) {
        const brother = findUnitByUid(c, entry.spiderUid);
        if (brother && brother.alive) {
            eventBus.emit(FX_SIGNALS.SPIDER_ASCEND, { unit: brother });
        }
    } else if (entry.spiderAction === 'return' && entry.spiderUid) {
        const brother = findUnitByUid(c, entry.spiderUid);
        if (brother && brother.alive) {
            eventBus.emit(FX_SIGNALS.SPIDER_DESCEND, { unit: brother });
        }
    }

    if(entry.isZhangSwitch&&entry.unit){ let zhangUnit = c.store ? c.store.getState().units.find(u => u.isZhang) : null; renderSeparator(); await playLogLine(entry.text); if(zhangUnit) { c.store.dispatch({ type: 'SET_VISUAL', uid: zhangUnit.uid, _resting: false }); eventBus.emit(FX_SIGNALS.DANMAKU, { unit: zhangUnit, text: '不好，要顶上去了！' }); } }
    else {
        if (entry.isDoubleStrikeBanner) {
            c.isPaused = true;
            await eventBus.emit(FX_SIGNALS.BANNER, { text: '⚡ 概率连击！' });
            c.isPaused = false;
        }

        if (entry.buffType === 'elite_xinhun') {
            let song = c.store ? c.store.getState().units.find(u => u.name === '宋青书') : null;
            let zhou = findUnitByUid(c, entry.zhouUid);
            if (zhou) c.store.dispatch({ type: 'SET_VISUAL', uid: zhou.uid, _hasKuaiLe: true });
            requestAnimationFrame(() => {
                if (song) eventBus.emit(FX_SIGNALS.HEART_EFFECT, { unit: song });
                if (zhou) eventBus.emit(FX_SIGNALS.HEART_EFFECT, { unit: zhou });
                if (zhou && zhou.alive) eventBus.emit(FX_SIGNALS.PINK_FLASH, { unit: zhou });
            });
            if (zhou && entry.hpDeduct && !GlobalStore.get('fastForwardActive')) {
                eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: zhou, dmg: entry.hpDeduct });
            }
        }
        // 快乐回血飘字已由导演 stageAction 'heal' 统一处理
        if (entry.buffType === 'qiankun_atk' && entry.atkTargetUid && entry.atkGain) {
            const atkTarget = findUnitByUid(c, entry.atkTargetUid);
            if (atkTarget) {
                setTimeout(() => eventBus.emit(FX_SIGNALS.ATK_BUFF_FLOAT, { unit: atkTarget, gain: entry.atkGain }), 180);
            }
        }

        // 蛛袭已由导演 stageAction 'spiderStrike' 统一驱动特效与掉血，不再经过日志分支

        if (entry.isClawHit && entry.clawAttackerUid && entry.clawTargetUid) {
            let attacker = findUnitByUid(c, entry.clawAttackerUid);
            let target = findUnitByUid(c, entry.clawTargetUid);
            if (target && entry.text) {
                let dmgMatch = entry.text.match(/造成 (\d+) 点伤害/);
                if (dmgMatch) eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: target, dmg: parseInt(dmgMatch[1]) });
            }
            if (attacker && target) {
                eventBus.emit(FX_SIGNALS.BONE_CLAW, { attacker, target, speed: c.speed, isPausedFn: () => c.isPaused, opts: { isExecute: entry.isExecute } });
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
            eventBus.emit(FX_SIGNALS.BRUSH_EFFECT, { el: deadDiv });
            if (entry.dmg && deadUnit) eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: deadUnit, dmg: entry.dmg });
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