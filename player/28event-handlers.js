// player/28event-handlers.js - 光明顶5v5 事件处理器函数族
// V5.4.0 | ~31000 bytes| 2026-08-10 DOM操作迁移至54renderer
export const VER = 'player/28event-handlers.js V5.4.0';

import { isBlocked } from '../core/03battle-utils.js';
import { showDanmaku, showDamageFloat, showDodgeBubble, showHealFloat, showAtkBuffFloat, applyBrushEffect, showBuffBanner, showCriticalBanner, showHeartEffect, showPinkFlash, showKuLianEffect, showWindClaw } from '../fx/39fx-common-5v5-test.js';
import { showDodgeBulletTime } from '../fx/44fx-dodge-bullet.js';
import { showRangedArrow, showSplashArrows, showBoneClaw } from '../fx/40fx-arrows-5v5-test.js';
import { playLineText } from './24player-text.js';
import { animatePositionSwap } from '../fx/42fx-position-swap.js';
import { animatePushBack, animatePushSwap } from '../fx/43fx-push-back.js';
import { AudioManager } from '../modules/17audio-manager.js';
import { getState } from '../modules/18global-store.js';
import { appendLogHTML, appendLogElement, autoScrollLog, updateRoundDisplay, renderSeparator } from './29renderer.js';

const safeShowDanmaku = (...args) => { try { return showDanmaku(...args); } catch(e) {} };

export async function handleBuffBonus(c, entry) {
    appendLogHTML(entry.text + '<br>');
    if (entry.targetUid && entry.bonusDmg) {
        let targetUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.targetUid);
        if (targetUnit) showDamageFloat(targetUnit, entry.bonusDmg);
    }
}

export async function handleBuffSwap(c, entry) {
    c.isPaused = true;
    GlobalStore.set('bulletTimeActive', true);
    await showBuffBanner('🌀 惑人心智！');
    appendLogHTML(entry.text + '<br>');
    let units = c.UI.allyTeam.concat(c.UI.enemyTeam);
    let unitA = entry.uidA ? units.find(u => u.uid === entry.uidA) : null;
    let unitB = entry.uidB ? units.find(u => u.uid === entry.uidB) : null;
    if (unitA && unitB) {
        let oldPosA = entry.oldPosA, oldPosB = entry.oldPosB;
        await animatePositionSwap(unitA, unitB, c, {
            skipDataChange: true,
            oldPositions: (oldPosA != null && oldPosB != null) ? [oldPosA, oldPosB] : null
        });
        if (c.store) {
            c.store.dispatch({ type: 'APPLY_EVENTS', events: [
                { eventType: 'pos-change', uid: unitA.uid, pos: oldPosB || unitB.pos },
                { eventType: 'pos-change', uid: unitB.uid, pos: oldPosA || unitA.pos }
            ]});
            c.updateUI();
        }
    }
    GlobalStore.set('bulletTimeActive', false);
    c.isPaused = false;
}

export async function handleBuffPush(c, entry) {
    c.isPaused = true;
    GlobalStore.set('bulletTimeActive', true);
    if (entry.pushTargetUid) {
        const events = [];
        const targetUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.pushTargetUid);
        if (entry.behindUid) {
            const behindUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.behindUid);
            if (targetUnit && behindUnit) {
                events.push({ eventType: 'pos-change', uid: targetUnit.uid, pos: entry.oldPos || behindUnit.pos });
                events.push({ eventType: 'pos-change', uid: behindUnit.uid, pos: entry.behindOldPos || targetUnit.pos });
            }
        } else if (targetUnit && entry.newPos) {
            events.push({ eventType: 'pos-change', uid: targetUnit.uid, pos: entry.newPos });
        }
        if (events.length > 0) {
            c.store.dispatch({ type: 'APPLY_EVENTS', events });
            c.updateUI();
        }
    }
    await showBuffBanner('🦅 乘风突袭！');
    GlobalStore.set('bulletTimeActive', false);
    c.isPaused = false;
    appendLogHTML(entry.text + '<br>');
    let targetUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.pushTargetUid);
    if (entry.behindUid) {
        let behindUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.behindUid);
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
    let attacker = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.attackerUid);
    if (attacker && entry.reboundDmg) showDamageFloat(attacker, entry.reboundDmg);
    if (entry.selfDmg && entry.selfDmgUid) {
        let selfTarget = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.selfDmgUid);
        if (selfTarget) showDamageFloat(selfTarget, entry.selfDmg);
    }
    if (attacker && entry.isDead && c.store) {
        c.store.dispatch({ type: 'SET_FLASH', uid: attacker.uid, flash: 'dead' });
        c.store.dispatch({ type: 'SET_VISUAL', uid: attacker.uid, _isDead: true });
    }
    appendLogHTML(entry.text + '<br>');
    await new Promise(r=>setTimeout(r, GlobalStore.get('fastForwardActive') ? 1 : c.speed/2));
}

export async function handleAttackGroup(c, entry, roundResult, abortSig, isFirstAttackRef) {
    if (entry.isCombo) { appendLogHTML('<br>'); c.isPaused = true; GlobalStore.set('bulletTimeActive', true); await new Promise(r => setTimeout(r, 1500)); showBuffBanner('⚡ 连击！'); GlobalStore.set('bulletTimeActive', false); c.isPaused = false; }

    if (!entry._pendingHpEvents) entry._pendingHpEvents = [];
    if (entry._events && entry._events.length > 0) {
        for (const ev of entry._events) {
            if (ev.payload && (ev.payload._flyMode === 'butterfly' || ev.payload._butterflyHost)) {
                const sister = c.UI.allyTeam.find(u => u.uid === ev.unitUid);
                if (sister) {
                    const { showButterflyFlyOut } = await import('../fx/45fx-butterfly-spider.js');
                    const hostUid = ev.payload._butterflyHost;
                    const host = hostUid ? c.UI.allyTeam.find(u => u.uid === hostUid) : null;
                    if (host) showButterflyFlyOut(sister, host);
                    c.store.dispatch({ type: 'APPLY_EVENTS', events: [ev] });
                    c.updateUI(c.UI);
                }
            } else if (ev.payload && ev.payload._flyMode === 'spider') {
                const brother = c.UI.allyTeam.find(u => u.uid === ev.unitUid);
                if (brother) {
                    const { showSpiderAscend } = await import('../fx/45fx-butterfly-spider.js');
                    showSpiderAscend(brother);
                    c.store.dispatch({ type: 'APPLY_EVENTS', events: [ev] });
                    c.updateUI(c.UI);
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
        if (typeof window._triggerFX === 'function') {
            setTimeout(() => {
                window._triggerFX(entry._fxSnapshot,unitA,unitD,entry.isDead,entry.isDodge,entry.isMiss,entry.isBlock,entry._dmg,entry.waveTaunt,entry.waveUnit,entry.unitRole);
            }, 0);
        }
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
    if(unitA&&!entry.isBlock)atkTimer=setTimeout(async()=>{ await c.waitWhilePaused(); if(unitA){c.store.dispatch({ type: 'CLEAR_UNIT_FLASH', uid: unitA.uid }); if (!entry.isDodge) { c.store.dispatch({ type: 'SET_VISUAL', uid: unitA.uid, _acted: true }); }} },atkFlashDuration);
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
        if(logLevel==='brief'&&entry2.type==='detail'){ let hiddenDiv=document.createElement('div'); hiddenDiv.className='detail-hidden'; hiddenDiv.innerHTML=entry2.text+'<br>'; appendLogElement(hiddenDiv); continue; }
        if(entry2.type==='damage-text'){
            let tempDiv=document.createElement('div'); appendLogElement(tempDiv); lastDiv=tempDiv; await playLineText(entry2.text,tempDiv, Math.max(c.speed || 1000, 1000));
        }
        else if(entry2.isHealEntry && entry.isDead){ let tempDiv=document.createElement('div'); appendLogElement(tempDiv); healDiv=tempDiv; await playLineText(entry2.text,tempDiv); }
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
            if (entry2.text && entry2.text.includes('🦋 乾坤衍生') && entry2.text.includes('攻击+')) {
                if (entry2.atkTargetUid && entry2.atkGain) {
                    const atkTarget = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry2.atkTargetUid);
                    if (atkTarget) {
                        setTimeout(() => showAtkBuffFloat(atkTarget, entry2.atkGain), 180);
                    }
                } else {
                    const atkMatch = entry2.text.match(/攻击\+(\d+)/);
                    if (atkMatch) {
                        const atkGain = parseInt(atkMatch[1]);
                        const nameMatch = entry2.text.match(/(\S+)攻击\+/);
                        let atkTarget = null;
                        if (nameMatch) {
                            atkTarget = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.name === nameMatch[1]);
                        }
                        if (atkTarget) {
                            setTimeout(() => showAtkBuffFloat(atkTarget, atkGain), 180);
                        }
                    }
                }
            }
            if(entry.isBlock&&entry2.text&&entry2.text.includes('休息回复20点生命')&&unitA){c.store.dispatch({ type: 'SET_VISUAL', uid: unitA.uid, _resting: true });blockDelay = true; showHealFloat(unitA, entry.healAmount || 10);}
            if (entry2.type === 'buff-splash') {
                if (entry2.buffType === 'meteor_splash' && entry2.attackerUid && entry2.primaryUid && entry2.splashUids && entry2.splashUids.length > 0) {
                    let attacker = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry2.attackerUid);
                    let primary = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry2.primaryUid);
                    let splashU = entry2.splashUids.map(uid => c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === uid)).filter(u => u);
                    if (attacker && primary && splashU.length > 0) {
                        c.isPaused = true; GlobalStore.set('bulletTimeActive', true);
                        await showBuffBanner('☄️ 流星赶月！');
                        showSplashArrows(attacker, primary, splashU, c.speed, () => c.isPaused);
                        splashU.forEach((st, i) => { setTimeout(() => { AudioManager.playSfx(attacker); }, i * 120); });
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
            let tempDiv=document.createElement('div'); appendLogElement(tempDiv); await playLineText(entry2.text, tempDiv, forcedSpeed);
            if (!c.userScrolled) autoScrollLog();
            if (entry2.type === 'detail' || entry2.type === 'info' || entry2.type === 'buff-bonus' || entry2.type === 'buff-splash') {
                await new Promise(r => setTimeout(r, 120));
            }
            if (entry2.type === 'detail' && entry2.text && entry2.text.includes('计算：') && !entry._dmgFloatShown) {
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
    if (entry.isDead && lastDiv && !entry.isBlock && !entry.isMiss && !entry.isDodge) { applyBrushEffect(lastDiv); }
    if(entry.isDodge&&unitA)showDodgeBubble(unitA,'闪避！'); if(entry.isMiss&&unitA)showDodgeBubble(unitA,'未命中');
    if(unitD&&entry.hpPctAfter!==undefined&&entry.hpPctBefore!==undefined){ if(entry.hpPctBefore>40&&entry.hpPctAfter<=40&&entry.hpPctAfter>20){let t=(unitD.camp==='ally'?'不好，必须反击了！':'小儿安敢伤我！');safeShowDanmaku(unitD,t);} else if(entry.hpPctBefore>20&&entry.hpPctAfter<=20){let t=(unitD.camp==='ally'?'撑住！':'已是强弩之末！');safeShowDanmaku(unitD,t);} }
    await new Promise(r=>setTimeout(r,offset)); await c.waitWhilePaused();
    if(defTimer)clearTimeout(defTimer);
    if(unitA && !unitA.state._isDead){c.store.dispatch({ type: 'CLEAR_UNIT_FLASH', uid: unitA.uid }); if (!entry.isDodge) { c.store.dispatch({ type: 'SET_VISUAL', uid: unitA.uid, _acted: true }); }}
    if (entry.isDead && unitD && !entry.isBlock && !entry.isMiss && !entry.isDodge) {
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

export async function handleInfo(c, entry) {
    if (entry.fastEntry) {
        appendLogHTML(entry.text + '<br>');
        updateRoundDisplay(`📜 日志（第${c.UI.round}回合）`);
        return;
    }

    async function getButterflyFx(name) {
        if (window[name]) return window[name];
        const mod = await import('../fx/45fx-butterfly-spider.js');
        return mod[name];
    }
    if (entry.text) {
        if (entry.text.includes('🦋 蝶变') && entry.text.includes('化为蝴蝶附身于')) {
            const sister = c.UI.allyTeam?.find(u => u.isXiaoZhaoSister && u.alive);
            const hostName = entry.text.match(/附身于 (.+)！/)?.[1];
            const host = hostName ? c.UI.allyTeam?.find(u => u.name === hostName) : null;
            if (sister && host) {
                const showButterflyFlyOut = await getButterflyFx('showButterflyFlyOut');
                showButterflyFlyOut(sister, host);
            }
        } else if (entry.text.includes('🦋 蝶变') && entry.text.includes('飞回')) {
            const sister = c.UI.allyTeam?.find(u => u.isXiaoZhaoSister && u.alive);
            if (sister) {
                const showButterflyFlyBack = await getButterflyFx('showButterflyFlyBack');
                const hostUid = (sister.state && sister.state._butterflyHost) || sister._butterflyHost;
                const host = hostUid ? c.UI.allyTeam?.find(u => u.uid === hostUid) : null;
                if (host) showButterflyFlyBack(host, sister);
            }
        } else if (entry.text.includes('🕷️ 飞天')) {
            const brother = c.UI.allyTeam?.find(u => u.isXiaoZhaoBrother && u.alive);
            if (brother) {
                const showSpiderAscend = await getButterflyFx('showSpiderAscend');
                showSpiderAscend(brother);
            }
        } else if (entry.text.includes('🕷️ 蛛落')) {
            const brother = c.UI.allyTeam?.find(u => u.isXiaoZhaoBrother && u.alive);
            if (brother) {
                c.store.dispatch({ type: 'SET_VISUAL', uid: brother.uid, _flyMode: null, _acted: false });
                const showSpiderDescend = await getButterflyFx('showSpiderDescend');
                showSpiderDescend(brother);
            }
        }
    }

    if(entry.isZhangSwitch&&entry.unit){ let zhangUnit = c.UI.allyTeam.find(u => u.isZhang); renderSeparator(); let tempDiv=document.createElement('div'); appendLogElement(tempDiv); await playLineText(entry.text,tempDiv); if(zhangUnit) { c.store.dispatch({ type: 'SET_VISUAL', uid: zhangUnit.uid, _resting: false }); safeShowDanmaku(zhangUnit, '不好，要顶上去了！'); } }
    else {
        if (entry.isDoubleStrikeBanner) {
            c.isPaused = true;
            await showBuffBanner('⚡ 概率连击！');
            c.isPaused = false;
        }

        if (entry.buffType === 'elite_xinhun') {
            let song = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.name === '宋青书');
            let zhou = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.zhouUid);
            if (zhou) c.store.dispatch({ type: 'SET_VISUAL', uid: zhou.uid, _hasKuaiLe: true });
            requestAnimationFrame(() => {
                if (song) showHeartEffect(song);
                if (zhou) showHeartEffect(zhou);
                if (zhou && zhou.alive) showPinkFlash(zhou);
            });
            if (zhou) {
                let match = entry.text.match(/被扣除(\d+)点血量/);
                if (match) showDamageFloat(zhou, parseInt(match[1]));
            }
        }
        if (entry.buffType === 'elite_kuaile_heal' && entry.zhouUid) {
            let unit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.zhouUid);
            let match = entry.text.match(/回复(\d+)/);
            if (match && unit) showHealFloat(unit, parseInt(match[1]));
        }
        if (entry.buffType !== 'elite_kuaile_heal' && entry.text && entry.text.includes('🦋 乾坤衍生') && entry.text.includes('攻击+')) {
            const atkMatch = entry.text.match(/攻击\+(\d+)/);
            if (atkMatch) {
                const atkGain = parseInt(atkMatch[1]);
                const nameMatch = entry.text.match(/(\S+)攻击\+/);
                let atkTarget = null;
                if (nameMatch) {
                    atkTarget = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.name === nameMatch[1]);
                }
                if (atkTarget) {
                    setTimeout(() => showAtkBuffFloat(atkTarget, atkGain), 180);
                }
            }
        }
        if (entry.text && entry.text.includes('🦋 乾坤衍生') && entry.text.includes('攻击+')) {
            const atkMatch = entry.text.match(/攻击\+(\d+)/);
            if (atkMatch) {
                const atkGain = parseInt(atkMatch[1]);
                const nameMatch = entry.text.match(/(\S+)攻击\+/);
                let atkTarget = null;
                if (nameMatch) {
                    atkTarget = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.name === nameMatch[1]);
                }
                if (atkTarget) {
                    setTimeout(() => showAtkBuffFloat(atkTarget, atkGain), 180);
                }
            }
        }

        if (entry.uidA && entry.uidD && entry.text && entry.text.includes('🕷️ 蛛袭')) {
            const spiderUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.uidA);
            const strikeTarget = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.uidD);
            if (spiderUnit && strikeTarget) {
                let tempDiv = document.createElement('div');
                appendLogElement(tempDiv);
                await playLineText(entry.text, tempDiv);
                c.isPaused = true;
                GlobalStore.set('bulletTimeActive', true);
                const { showSpiderStrike } = await import('../fx/45fx-butterfly-spider.js');
                await showSpiderStrike(spiderUnit, strikeTarget);
                if (entry.text && entry.isDead && strikeTarget && c.store) {
                    c.store.dispatch({ type: 'SET_FLASH', uid: strikeTarget.uid, flash: 'dead' });
                    c.store.dispatch({ type: 'SET_VISUAL', uid: strikeTarget.uid, _isDead: true });
                }
                await new Promise(r => setTimeout(r, 1800));
                GlobalStore.set('bulletTimeActive', true);
                c.isPaused = false;
            }
        }

        if (entry.isClawHit && entry.clawAttackerUid && entry.clawTargetUid) {
            let attacker = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.clawAttackerUid);
            let target = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.clawTargetUid);
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
        if (entry.isHealEntry && entry.healAmount && entry.healUnitUid) {
            let healUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.healUnitUid);
            if (healUnit) showHealFloat(healUnit, entry.healAmount);
        }
        if (entry.text && entry.text.includes('攻击+')) {
            const atkMatch = entry.text.match(/攻击\+(\d+(?:\.\d+)?)/);
            if (atkMatch) {
                const atkGain = parseFloat(atkMatch[1]);
                const nameMatch = entry.text.match(/(\S+)攻击\+/);
                let atkTarget = null;
                if (nameMatch) {
                    atkTarget = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.name === nameMatch[1]);
                }
                if (atkTarget && atkGain > 0) {
                    setTimeout(() => showAtkBuffFloat(atkTarget, atkGain), 180);
                }
            }
        }
        if (entry.reboundDmg && entry.attackerUid) {
            let attacker = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.attackerUid);
            if (attacker) showDamageFloat(attacker, entry.reboundDmg);
        }
        if (entry.isDead && entry.uidD) {
            let deadUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.uidD);
            if (deadUnit && c.store) {
                c.store.dispatch({ type: 'SET_FLASH', uid: deadUnit.uid, flash: 'dead' });
                c.store.dispatch({ type: 'SET_VISUAL', uid: deadUnit.uid, _isDead: true });
            }
            let tempDiv=document.createElement('div'); appendLogElement(tempDiv); await playLineText(entry.text,tempDiv);
            applyBrushEffect(tempDiv);
            if (entry.dmg && deadUnit) showDamageFloat(deadUnit, entry.dmg);
        } else {
            let tempDiv=document.createElement('div'); appendLogElement(tempDiv); await playLineText(entry.text,tempDiv);
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
    c.updateUI(c.UI);
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