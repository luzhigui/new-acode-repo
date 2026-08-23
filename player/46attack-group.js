// player/46attack-group.js - 光明顶5v5 攻击组事件处理器
// V5.6.0 | ~12000 bytes| 2026-08-23 只念稿+动效；格子正确性由导演stageAction统一驱动
export const VER = 'player/46attack-group.js V5.6.0';

import { _triggerFX } from '../fx/88fx-trigger.js';
import {
    showDanmaku, showDamageFloat, showDodgeBubble, showHealFloat, showAtkBuffFloat,
    applyBrushEffect, showBuffBanner, showCriticalBanner, showHeartEffect, showPinkFlash,
    showKuLianEffect, showWindClaw, showDodgeBulletTime, showRangedArrow, showSplashArrows,
    showBoneClaw, animatePositionSwap, animatePushBack, animatePushSwap,
    showButterflyFlyOut, showButterflyFlyBack, showSpiderAscend, showSpiderDescend, showSpiderStrike
} from '../fx/87fx-manager.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { getState } from '../infra/54-global-store.js';
import { appendLogHTML, autoScrollLog, updateRoundDisplay, playLogLine, appendHiddenDetail, findUnitByUid } from './47renderer.js';

const safeShowDanmaku = (...args) => { try { return showDanmaku(...args); } catch(e) {} };

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
            showKuLianEffect(unitA, team);
            await new Promise(r => setTimeout(r, 1200));
        }
        if (c.store) c.store.dispatch({ type: 'SET_FLASH', uid: unitA.uid, flash: flashType });
        setTimeout(() => {
            _triggerFX(entry._fxSnapshot, unitA, unitD, entry.isDead, entry.isDodge, entry.isMiss, entry.isBlock, entry._dmg, entry.waveTaunt, entry.waveUnit, entry.unitRole);
        }, 0);
        if (unitD && unitD.role === '防战') {
            const defBuffs = (unitD.camp === 'ally' ? c.UI.allyTeam : c.UI.enemyTeam)?._activeBuffs || [];
            if (defBuffs.some(b => b.key === 'fortify')) {
                c._scheduler.schedule('banner', Math.min(400, c.speed / 3), () => showBuffBanner('🛡️ 严阵以待！'));
            }
        }
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
            await showCriticalBanner('✨闪避反击✨');
            await showDodgeBulletTime(unitD, unitA, 0);
            GlobalStore.set('bulletTimeActive', false);
            c.isPaused = false;
        } else {
            showDodgeBubble(unitA, '闪避！');
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
            if (atkTarget) setTimeout(() => showAtkBuffFloat(atkTarget, entry2.atkGain), 180);
        }

        if (entry2.type === 'buff-splash') {
            if (entry2.buffType === 'meteor_splash' && entry2.attackerUid && entry2.primaryUid && entry2.splashUids && entry2.splashUids.length > 0) {
                const attacker = findUnitByUid(c, entry2.attackerUid);
                const primary = findUnitByUid(c, entry2.primaryUid);
                const splashU = entry2.splashUids.map(uid => findUnitByUid(c, uid)).filter(u => u);
                if (attacker && primary && splashU.length > 0) {
                    c.isPaused = true; GlobalStore.set('bulletTimeActive', true);
                    await showBuffBanner('☄️ 流星赶月！');
                    showSplashArrows(attacker, primary, splashU, c.speed, () => c.isPaused);
                    splashU.forEach((st, i) => { setTimeout(() => AudioManager.playSfx(attacker.role || '远程'), i * 120); });
                    GlobalStore.set('bulletTimeActive', false); c.isPaused = false;
                }
            }
            if (entry2.splashUids && entry2.splashDmg) {
                entry2.splashUids.forEach(uid => {
                    const t = findUnitByUid(c, uid);
                    if (t) {
                        if (entry2.buffType === 'meteor_splash') setTimeout(() => showDamageFloat(t, entry2.splashDmg), 150);
                        else showDamageFloat(t, entry2.splashDmg);
                    }
                });
            }
            if (entry2.buffType === 'meteor_splash') await new Promise(r => setTimeout(r, GlobalStore.get('fastForwardActive') ? 1 : 600));
        }

        if (entry2.isClawHit && entry2.clawAttackerUid && entry2.clawTargetUid) {
            const clawAttacker = findUnitByUid(c, entry2.clawAttackerUid);
            const clawTarget = findUnitByUid(c, entry2.clawTargetUid);
            if (clawTarget && entry2.text) {
                const dmgMatch = entry2.text.match(/造成 (\d+(?:\.\d+)?) 点伤害/);
                if (dmgMatch) showDamageFloat(clawTarget, Math.round(parseFloat(dmgMatch[1])));
            }
            if (clawAttacker && clawTarget) {
                showBoneClaw(clawAttacker, clawTarget, c.speed, () => c.isPaused, null, { isExecute: entry2.isExecute });
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

    if (entry.isDead && lastDiv && !entry.isBlock && !entry.isMiss) applyBrushEffect(lastDiv);
    if (entry.isDodge && unitA) showDodgeBubble(unitA, '闪避！');
    if (entry.isMiss && unitA) showDodgeBubble(unitA, '未命中');

    if (unitD && entry.hpPctAfter !== undefined && entry.hpPctBefore !== undefined) {
        if (entry.hpPctBefore > 40 && entry.hpPctAfter <= 40 && entry.hpPctAfter > 20) {
            safeShowDanmaku(unitD, unitD.camp === 'ally' ? '不好，必须反击了！' : '小儿安敢伤我！');
        } else if (entry.hpPctBefore > 20 && entry.hpPctAfter <= 20) {
            safeShowDanmaku(unitD, unitD.camp === 'ally' ? '撑住！' : '已是强弩之末！');
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