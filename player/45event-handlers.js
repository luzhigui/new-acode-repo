// player/45event-handlers.js - 光明顶5v5 事件处理器函数族
// V5.7.1 | ~25800 bytes| 2026-08-25 换位/击退/蝶蛛飞行动画移交导演 stageAction
export const VER = 'player/45event-handlers.js V5.7.1';

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
    // 换位特效已由导演 stageAction 'posSwap' 统一触发，此处只播文本
    appendLogHTML(entry.text + '<br>');
}

export async function handleBuffPush(c, entry) {
    // 击退特效已由导演 stageAction 'push' 统一触发，此处只播文本
    appendLogHTML(entry.text + '<br>');
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

    // 蝴蝶附身/飞回、蜘蛛升空/降落动画已由导演 stageAction 'flyMode' 统一触发

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