// player/46attack-group.js - 光明顶5v5 攻击组事件处理器
// V5.5.1 | ~16500 bytes| 2026-08-17 事实化适配：消费渲染器生成的日志对象
export const VER = 'player/46attack-group.js V5.5.1';

import { isBlocked } from '../core/03battle-utils.js';
import { _triggerFX } from '../ui/67fx-trigger.js';
import {
    showDanmaku, showDamageFloat, showDodgeBubble, showHealFloat, showAtkBuffFloat,
    applyBrushEffect, showBuffBanner, showCriticalBanner, showHeartEffect, showPinkFlash,
    showKuLianEffect, showWindClaw, showDodgeBulletTime, showRangedArrow, showSplashArrows,
    showBoneClaw, animatePositionSwap, animatePushBack, animatePushSwap,
    showButterflyFlyOut, showButterflyFlyBack, showSpiderAscend, showSpiderDescend, showSpiderStrike
} from '../fx/87fx-manager.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { getState } from '../infra/54-global-store.js';
import { appendLogHTML, appendLogElement, autoScrollLog, updateRoundDisplay, renderSeparator, playLogLine, appendHiddenDetail } from './47renderer.js';

const safeShowDanmaku = (...args) => { try { return showDanmaku(...args); } catch(e) {} };

export async function handleAttackGroup(c, entry, roundResult, abortSig, isFirstAttackRef) {
    if (entry.isCombo) { appendLogHTML('<br>'); c.isPaused = true; GlobalStore.set('bulletTimeActive', true); await new Promise(r => setTimeout(r, 1500)); showBuffBanner('⚡ 连击！'); GlobalStore.set('bulletTimeActive', false); c.isPaused = false; }

    if (!entry._pendingHpEvents) entry._pendingHpEvents = [];
    if (entry._events && entry._events.length > 0) {
        for (const ev of entry._events) {
            if (ev.payload && (ev.payload._flyMode === 'butterfly' || ev.payload._butterflyHost)) {
                const sister = c.UI.allyTeam.find(u => u.uid === ev.unitUid);
                if (sister) {
                    const { showButterflyFlyOut } = await import('../fx/86fx-butterfly-spider.js');
                    const hostUid = ev.payload._butterflyHost;
                    const host = hostUid ? c.UI.allyTeam.find(u => u.uid === hostUid) : null;
                    if (host) showButterflyFlyOut(sister, host);
                    c.store.dispatch({ type: 'APPLY_EVENTS', events: [ev] });
                }
            } else if (ev.payload && ev.payload._flyMode === 'spider') {
                const brother = c.UI.allyTeam.find(u => u.uid === ev.unitUid);
                if (brother) {
                    const { showSpiderAscend } = await import('../fx/86fx-butterfly-spider.js');
                    showSpiderAscend(brother);
                    c.store.dispatch({ type: 'APPLY_EVENTS', events: [ev] });
                }
            } else if (ev.eventType === 'hp-change' || ev.type === 'hp-change') {
                entry._pendingHpEvents.push(ev);
            } else {
                c.store.dispatch({ type: 'APPLY_EVENTS', events: [ev] });
            }
        }
    }

    let unitA=c.UI.allyTeam.concat(c.UI.enemyTeam).find(u=>u.uid===entry.uidA);
    let unitD=entry.uidD?c.UI.allyTeam.concat(c.UI.enemyTeam).find(u=>u.uid===entry.uidD):null;
    if(!entry.isBlock&&!entry.isMiss&&!entry.isDodge&&(!unitA||!unitD)){
        appendLogHTML(`<span class="gray">${entry.uidA || '未知'} 攻击 ${entry.uidD || '未知'}，但目标已不存在</span><br>`);
    }
    if(unitA&&!entry.isBlock){
        const flashType = entry.isDodge ? 'defend' : 'attack';
        if (entry.isKuLianAttack && unitA) {
            const team = unitA.camp === 'ally' ? c.UI.allyTeam : c.UI.enemyTeam;
            showKuLianEffect(unitA, team);
            await new Promise(r => setTimeout(r, 1200));
        }
        c.store.dispatch({ type: 'SET_FLASH', uid: unitA.uid, flash: flashType });
        setTimeout(() => {
            _triggerFX(entry._fxSnapshot,unitA,unitD,entry.isDead,entry.isDodge,entry.isMiss,entry.isBlock,entry._dmg,entry.waveTaunt,entry.waveUnit,entry.unitRole);
        }, 0);
        if (unitD && unitD.role === '防战') {
            let defBuffs = (unitD.camp === 'ally' ? c.UI.allyTeam : c.UI.enemyTeam);
            defBuffs = defBuffs ? (defBuffs._activeBuffs || []) : [];
            if (defBuffs.some(b => b.key === 'fortify')) {
                c._scheduler.schedule('banner', Math.min(400, c.speed / 3), () => showBuffBanner('🛡️ 严阵以待！'));
            }
        }
        if (!entry.isBlock && !entry.isMiss && !entry.isDodge && unitA) {
            AudioManager.playSfx(unitA.role);
        }
    }

    const isFF = GlobalStore.get('fastForwardActive');
    let textEntries=entry.entries,lineCount=textEntries.length, speedFactor=isFF?0.001:Math.max(c.speed,600)/1000, textDuration=isFF?1:(c.speed*lineCount), offset=isFF?1:(200*speedFactor), atkFlashDuration=textDuration+300*speedFactor, defFlashDuration=atkFlashDuration, atkTimer=null;
    if (unitA && !entry.isBlock && !entry.isDodge && !entry.isMiss && (unitA.role === '战士' || unitA.role === '防战' || unitA.role === '飞行')) {
        atkFlashDuration = Math.max(atkFlashDuration, 3500 * speedFactor);
    }
    if(unitA&&!entry.isBlock)atkTimer=setTimeout(async()=>{ await c.waitWhilePaused(); if(unitA){c.store.dispatch({ type: 'CLEAR_UNIT_FLASH', uid: unitA.uid }); if (!entry.isDodge && !entry.isLinkAttack) { c.store.dispatch({ type: 'SET_VISUAL', uid: unitA.uid, _acted: true }); }} },atkFlashDuration);
    await new Promise(r=>setTimeout(r,offset)); await c.waitWhilePaused();
    if(abortSig&&abortSig.aborted){if(atkTimer)clearTimeout(atkTimer);return { isBattleOver: false };}
    if(unitD&&!entry.isMiss){
        const flashTypeD = entry.isDodge ? 'attack' : 'defend';
        c.store.dispatch({ type: 'SET_FLASH', uid: unitD.uid, flash: flashTypeD });
    } let defTimer=null; if(unitD&&!entry.isDodge&&!entry.isMiss)defTimer=setTimeout(async()=>{ await c.waitWhilePaused(); if(unitD&&!entry.isDead){c.store.dispatch({ type: 'CLEAR_UNIT_FLASH', uid: unitD.uid });} },defFlashDuration);

    if (entry.isDodge && unitA && unitD) { if (c.dodgeEffectEnabled) { let reboundDmg = Math.floor((unitA.atk + unitA.def) * 0.5); c.isPaused = true; GlobalStore.set('bulletTimeActive', true); await showCriticalBanner('✨闪避反击✨'); await showDodgeBulletTime(unitD, unitA, reboundDmg); GlobalStore.set('bulletTimeActive', false); c.isPaused = false; } else { showDodgeBubble(unitA, '闪避！'); } }

    let lastDiv=null,healDiv=null, blockDelay=false;
    for(let entry2 of textEntries){
        if(abortSig&&abortSig.aborted){if(atkTimer)clearTimeout(atkTimer);if(defTimer)clearTimeout(defTimer);return { isBattleOver: false };}
        const logLevel = getState.logLevel();
        if(logLevel==='brief'&&entry2.type==='detail'){ appendHiddenDetail(entry2.text); continue; }
        if(entry2.type==='damage-text'){
            lastDiv = await playLogLine(entry2.text, Math.max(c.speed || 1000, 1000));
        }
        else if(entry2.isHealEntry && entry.isDead){ healDiv = await playLogLine(entry2.text); }
        else{
            if (entry2._events && entry2._events.length > 0) {
                c.store.dispatch({ type: 'APPLY_EVENTS', events: entry2._events });
                entry2._events = [];
            }
            if(entry2.isHealEntry && !entry.isDead) {
                let healAmount = entry2.healAmount;
                if (healAmount == null) {
                    let match = entry2.text.match(/\+(\d+)/);
                    if (match) healAmount = parseInt(match[1]);
                }
                let healUid = entry2.healUnitUid || (unitA ? unitA.uid : null);
                let healUnit = healUid ? c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === healUid) : null;
                if(healAmount != null && healUnit) {
                    showHealFloat(healUnit, healAmount);
                }
            }
            if (entry2.isHealEntry && !entry2.isDead && entry2.healUnitUid) {
                let healUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry2.healUnitUid);
                if (healUnit && entry2.healAmount) {
                    showHealFloat(healUnit, entry2.healAmount);
                }
            }
            if (entry2.reboundDmg && entry2.reboundTargetUid) {
                let reboundTarget = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry2.reboundTargetUid);
                if (reboundTarget) showDamageFloat(reboundTarget, entry2.reboundDmg);
            }
            if (entry2.selfDmg && entry2.selfDmgUid) {
                let selfTarget = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry2.selfDmgUid);
                if (selfTarget) showDamageFloat(selfTarget, entry2.selfDmg);
            }
            if (entry2.buffType === 'qiankun_atk' && entry2.atkTargetUid && entry2.atkGain) {
                const atkTarget = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry2.atkTargetUid);
                if (atkTarget) {
                    setTimeout(() => showAtkBuffFloat(atkTarget, entry2.atkGain), 180);
                }
            }

            if (entry2.type === 'buff-splash') {
                if (entry2.buffType === 'meteor_splash' && entry2.attackerUid && entry2.primaryUid && entry2.splashUids && entry2.splashUids.length > 0) {
                    let attacker = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry2.attackerUid);
                    let primary = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry2.primaryUid);
                    let splashU = entry2.splashUids.map(uid => c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === uid)).filter(u => u);
                    if (attacker && primary && splashU.length > 0) {
                        c.isPaused = true; GlobalStore.set('bulletTimeActive', true);
                        await showBuffBanner('☄️ 流星赶月！');
                        showSplashArrows(attacker, primary, splashU, c.speed, () => c.isPaused);
                        splashU.forEach((st, i) => { setTimeout(() => { AudioManager.playSfx(attacker.role || '远程'); }, i * 120); });
                        GlobalStore.set('bulletTimeActive', false); c.isPaused = false;
                    }
                }
                if (entry2.splashUids && entry2.splashDmg) {
                    entry2.splashUids.forEach(uid => {
                        let t = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === uid);
                        if (t) {
                            if (entry2.buffType === 'meteor_splash') setTimeout(() => showDamageFloat(t, entry2.splashDmg), 150);
                            else showDamageFloat(t, entry2.splashDmg);
                        }
                    });
                }
                if (entry2.buffType === 'meteor_splash') await new Promise(r=>setTimeout(r, GlobalStore.get('fastForwardActive') ? 1 : 600));
            }
            const currentSpeed = c.speed || 1000;
            const isImportant = (entry2.type === 'combat-text' || entry2.type === 'damage-text');
            const forcedSpeed = isImportant
                ? Math.max(currentSpeed, 600)
                : Math.floor(currentSpeed * 0.8);
            await playLogLine(entry2.text, forcedSpeed);
            if (!c.userScrolled) autoScrollLog();
            if (entry2.type === 'detail' || entry2.type === 'info' || entry2.type === 'buff-bonus' || entry2.type === 'buff-splash') {
                await new Promise(r => setTimeout(r, 120));
            }
            if (entry2.isDamageCalc && !entry._dmgFloatShown) {
                entry._dmgFloatShown = true;
                if (unitD && entry._dmg !== undefined && !entry.isBlock && !entry.isMiss && !entry.isDodge) {
                    showDamageFloat(unitD, entry._dmg);
                }
            }
        }
    }
    if(blockDelay) await new Promise(r=>setTimeout(r, GlobalStore.get('fastForwardActive') ? 1 : c.speed/2));
    if (entry._pendingHpEvents && entry._pendingHpEvents.length > 0) {
        c.store.dispatch({ type: 'APPLY_EVENTS', events: entry._pendingHpEvents.splice(0) });
    }
    if (entry.isDead && lastDiv && !entry.isBlock && !entry.isMiss) { applyBrushEffect(lastDiv); }
    if(entry.isDodge&&unitA)showDodgeBubble(unitA,'闪避！'); if(entry.isMiss&&unitA)showDodgeBubble(unitA,'未命中');
    if(unitD&&entry.hpPctAfter!==undefined&&entry.hpPctBefore!==undefined){ if(entry.hpPctBefore>40&&entry.hpPctAfter<=40&&entry.hpPctAfter>20){let t=(unitD.camp==='ally'?'不好，必须反击了！':'小儿安敢伤我！');safeShowDanmaku(unitD,t);} else if(entry.hpPctBefore>20&&entry.hpPctAfter<=20){let t=(unitD.camp==='ally'?'撑住！':'已是强弩之末！');safeShowDanmaku(unitD,t);} }
    await new Promise(r=>setTimeout(r,offset)); await c.waitWhilePaused();
    if(defTimer)clearTimeout(defTimer);
    if(unitA && !unitA.state._isDead){c.store.dispatch({ type: 'CLEAR_UNIT_FLASH', uid: unitA.uid }); }
    if (entry.isDead && unitD && !entry.isBlock && !entry.isMiss) {
        c.store.dispatch({ type: 'SET_FLASH', uid: unitD.uid, flash: 'dead' });
        c.store.dispatch({ type: 'SET_VISUAL', uid: unitD.uid, _isDead: true });
    }
    if (entry.entries) {
        for (const e of entry.entries) {
            if ((e.isExecute || e.type === 'execute') && entry.isDead && lastDiv) {
                applyBrushEffect(lastDiv);
                break;
            }
        }
    }
    if(unitD && !entry.isDodge && !entry.isMiss && !entry.isDead && !unitD.state._isDead) c.store.dispatch({ type: 'CLEAR_UNIT_FLASH', uid: unitD.uid });
    if (c.UI && c.UI.allyTeam && c.UI.enemyTeam) {
        c.UI.allyTeam.concat(c.UI.enemyTeam).forEach(u => { if (u.alive) { const su = c.store ? c.store.getState().units.find(s => s.uid === u.uid) : null; if (!su || !su._flyMode) { let blocked = isBlocked(u, u.camp === 'ally' ? c.UI.allyTeam : c.UI.enemyTeam); c.store.dispatch({ type: 'SET_VISUAL', uid: u.uid, _blocked: blocked }); } } });
    }
    updateRoundDisplay(`📜 日志（第${c.UI.round}回合）`);

    if(entry.isDead&&(c.UI.allyTeam.every(ch=>!ch.alive)||c.UI.enemyTeam.every(ch=>!ch.alive))){ return { isBattleOver: true }; }
    return { isBattleOver: false };
}