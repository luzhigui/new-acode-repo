// player/46attack-group.js - 光明顶5v5 攻击组事件处理器
// V5.7.0 | ~12100 bytes| 2026-08-23 fx 直调改事件订阅，player 不再依赖 fx
export const VER = 'player/46attack-group.js V5.7.0';

import { eventBus } from '../infra/50-event-bus.js';
import { FX_SIGNALS } from '../infra/55-fx-signals.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { getState } from '../infra/54-global-store.js';
import { appendLogHTML, autoScrollLog, updateRoundDisplay, playLogLine, appendHiddenDetail, findUnitByUid } from './47renderer.js';

export async function handleAttackGroup(c, entry, roundResult, abortSig, isFirstAttackRef) {
    let unitA = findUnitByUid(c, entry.uidA);
    let unitD = entry.uidD ? findUnitByUid(c, entry.uidD) : null;

    if (!entry.isBlock && !entry.isMiss && !entry.isDodge && (!unitA || !unitD)) {
        appendLogHTML(`<span class="gray">${entry.attackerName || entry.uidA || '未知'} 攻击 ${entry.targetName || entry.uidD || '未知'}，但目标已不存在</span><br>`);
    }

    if (unitA && entry.isRest && c.store) {
        c.store.dispatch({ type: 'SET_VISUAL', uid: unitA.uid, _resting: true });
    }

    if (unitA && !entry.isBlock) {
        const flashType = entry.isDodge ? 'defend' : 'attack';
        if (entry.isKuLianAttack && unitA) {
            const team = unitA.camp === 'ally' ? c.UI.allyTeam : c.UI.enemyTeam;
            eventBus.emit(FX_SIGNALS.KULIAN, { unit: unitA, team });
            await new Promise(r => setTimeout(r, 1200));
        }
        if (c.store) c.store.dispatch({ type: 'SET_FLASH', uid: unitA.uid, flash: flashType });
        setTimeout(() => {
            eventBus.emit(FX_SIGNALS.TRIGGER, { fxSnapshot: entry._fxSnapshot, unitA, unitD, isDead: entry.isDead, isDodge: entry.isDodge, isMiss: entry.isMiss, isBlock: entry.isBlock, dmg: entry._dmg, waveTaunt: entry.waveTaunt, waveUnit: entry.waveUnit, attackerRole: entry.unitRole });
        }, 0);
        // 防战严阵横幅由 handleBuffReboundFortify 负责，导演不重复
        if (!entry.isBlock && !entry.isMiss && !entry.isDodge && unitA) {
            AudioManager.playSfx(unitA.role);
        }
    }

    const isFF = GlobalStore.get('fastForwardActive');
    const textEntries = entry.entries || [];
    const lineCount = textEntries.length;
    const speedFactor = isFF ? 0.001 : Math.max(c.speed, 600) / 1000;
    const textDuration = isFF ? 1 : (c.speed * lineCount);
    const offset = isFF ? 1 : (200 * speedFactor);
    const atkFlashDuration = textDuration + 300 * speedFactor;
    const defFlashDuration = atkFlashDuration;
    let atkTimer = null;

    if (unitA && !entry.isBlock && !entry.isDodge && !entry.isMiss && (unitA.role === '战士' || unitA.role === '防战' || unitA.role === '飞行')) {
        // 近战闪持续更久，避免攻击动作没播完就清除
    }
    if (unitA && !entry.isBlock && c.store) {
        atkTimer = setTimeout(async () => {
            await c.waitWhilePaused();
            if (c.store && unitA) {
                c.store.dispatch({ type: 'CLEAR_UNIT_FLASH', uid: unitA.uid });
                if (!entry.isDodge && !entry.isLinkAttack) {
                    c.store.dispatch({ type: 'SET_VISUAL', uid: unitA.uid, _acted: true });
                }
            }
        }, atkFlashDuration);
    }

    await new Promise(r => setTimeout(r, offset));
    await c.waitWhilePaused();
    if (abortSig && abortSig.aborted) { if (atkTimer) clearTimeout(atkTimer); return { isBattleOver: false }; }

    if (unitD && !entry.isMiss && c.store) {
        c.store.dispatch({ type: 'SET_FLASH', uid: unitD.uid, flash: entry.isDodge ? 'attack' : 'defend' });
    }
    let defTimer = null;
    if (unitD && !entry.isDodge && !entry.isMiss && c.store) {
        defTimer = setTimeout(async () => {
            await c.waitWhilePaused();
            if (c.store && unitD && !entry.isDead) {
                c.store.dispatch({ type: 'CLEAR_UNIT_FLASH', uid: unitD.uid });
            }
        }, defFlashDuration);
    }

    if (entry.isDodge && unitA && unitD) {
        if (c.dodgeEffectEnabled) {
            c.isPaused = true;
            GlobalStore.set('bulletTimeActive', true);
            await eventBus.emit(FX_SIGNALS.CRITICAL_BANNER, { text: '✨闪避反击✨' });
            await eventBus.emit(FX_SIGNALS.DODGE_BULLET_TIME, { unitD, unitA });
            GlobalStore.set('bulletTimeActive', false);
            c.isPaused = false;
        } else {
            eventBus.emit(FX_SIGNALS.DODGE_BUBBLE, { unit: unitA, text: '闪避！' });
        }
    }

    let lastDiv = null;
    for (const entry2 of textEntries) {
        if (abortSig && abortSig.aborted) { if (atkTimer) clearTimeout(atkTimer); if (defTimer) clearTimeout(defTimer); return { isBattleOver: false }; }
        const logLevel = getState.logLevel();
        if (logLevel === 'brief' && entry2.type === 'detail') { appendHiddenDetail(entry2.text); continue; }

        if (entry2.type === 'damage-text') {
            lastDiv = await playLogLine(entry2.text, Math.max(c.speed || 1000, 1000));
            continue;
        }

        // 治疗飘字已由导演 stageAction 'heal' 统一处理

        // rebond/selfDmg 飘字已由导演 stageAction 'attack' 统一处理
        if (entry2.buffType === 'qiankun_atk' && entry2.atkTargetUid && entry2.atkGain) {
            const atkTarget = findUnitByUid(c, entry2.atkTargetUid);
            if (atkTarget) setTimeout(() => eventBus.emit(FX_SIGNALS.ATK_BUFF_FLOAT, { unit: atkTarget, gain: entry2.atkGain }), 180);
        }

        if (entry2.type === 'buff-splash') {
            if (entry2.buffType === 'meteor_splash' && entry2.attackerUid && entry2.primaryUid && entry2.splashUids && entry2.splashUids.length > 0) {
                const attacker = findUnitByUid(c, entry2.attackerUid);
                const primary = findUnitByUid(c, entry2.primaryUid);
                const splashU = entry2.splashUids.map(uid => findUnitByUid(c, uid)).filter(u => u);
                if (attacker && primary && splashU.length > 0) {
                    c.isPaused = true; GlobalStore.set('bulletTimeActive', true);
                    await eventBus.emit(FX_SIGNALS.BANNER, { text: '☄️ 流星赶月！' });
                    eventBus.emit(FX_SIGNALS.SPLASH_ARROWS, { attacker, primary, targets: splashU, speed: c.speed, isPausedFn: () => c.isPaused });
                    splashU.forEach((st, i) => { setTimeout(() => AudioManager.playSfx(attacker.role || '远程'), i * 120); });
                    GlobalStore.set('bulletTimeActive', false); c.isPaused = false;
                }
            }
            // splash 伤害飘字已由导演 stageAction 'splash' 统一处理
            if (entry2.buffType === 'meteor_splash') await new Promise(r => setTimeout(r, GlobalStore.get('fastForwardActive') ? 1 : 600));
        }

        if (entry2.isClawHit && entry2.clawAttackerUid && entry2.clawTargetUid) {
            const clawAttacker = findUnitByUid(c, entry2.clawAttackerUid);
            const clawTarget = findUnitByUid(c, entry2.clawTargetUid);
            if (clawTarget && entry2.text) {
                const dmgMatch = entry2.text.match(/造成 (\d+(?:\.\d+)?) 点伤害/);
                if (dmgMatch) eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: clawTarget, dmg: Math.round(parseFloat(dmgMatch[1])) });
            }
            if (clawAttacker && clawTarget) {
                eventBus.emit(FX_SIGNALS.BONE_CLAW, { attacker: clawAttacker, target: clawTarget, speed: c.speed, isPausedFn: () => c.isPaused, opts: { isExecute: entry2.isExecute } });
            }
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
        // 攻击伤害飘字已由导演 stageAction 'attack' 统一处理
    }

    if (entry.isDead && lastDiv && !entry.isBlock && !entry.isMiss) eventBus.emit(FX_SIGNALS.BRUSH_EFFECT, { el: lastDiv });
    if (entry.isDodge && unitA) eventBus.emit(FX_SIGNALS.DODGE_BUBBLE, { unit: unitA, text: '闪避！' });
    if (entry.isMiss && unitA) eventBus.emit(FX_SIGNALS.DODGE_BUBBLE, { unit: unitA, text: '未命中' });

    if (unitD && entry.hpPctAfter !== undefined && entry.hpPctBefore !== undefined) {
        if (entry.hpPctBefore > 40 && entry.hpPctAfter <= 40 && entry.hpPctAfter > 20) {
            eventBus.emit(FX_SIGNALS.DANMAKU, { unit: unitD, text: unitD.camp === 'ally' ? '不好，必须反击了！' : '小儿安敢伤我！' });
        } else if (entry.hpPctBefore > 20 && entry.hpPctAfter <= 20) {
            eventBus.emit(FX_SIGNALS.DANMAKU, { unit: unitD, text: unitD.camp === 'ally' ? '撑住！' : '已是强弩之末！' });
        }
    }

    await new Promise(r => setTimeout(r, offset));
    await c.waitWhilePaused();
    if (defTimer) clearTimeout(defTimer);
    if (unitA && !unitA.state._isDead && c.store) {
        c.store.dispatch({ type: 'CLEAR_UNIT_FLASH', uid: unitA.uid });
    }
    if (unitD && !entry.isDodge && !entry.isMiss && !entry.isDead && !unitD.state._isDead && c.store) {
        c.store.dispatch({ type: 'CLEAR_UNIT_FLASH', uid: unitD.uid });
    }

    updateRoundDisplay(`📜 日志（第${c.UI.round}回合）`);

    if (entry.isDead && (c.UI.allyTeam.every(ch => !ch.alive) || c.UI.enemyTeam.every(ch => !ch.alive))) {
        return { isBattleOver: true };
    }
    return { isBattleOver: false };
}