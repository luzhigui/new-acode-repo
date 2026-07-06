// player/10player-core.js - 光明顶5v5 战斗播放器核心
// V5.0.0 | ~48000 bytes | 2026-07-06 逐步执行、Store 驱动视觉标记
export const VER = 'player/10player-core.js V5.0.0';

import { isBlocked } from '../core/03battle-utils.js';
import { showDanmaku, showDamageFloat, showDodgeBubble, showHealFloat, applyBrushEffect, showBuffBanner, showCriticalBanner, showHeartEffect, showPinkFlash } from '../fx/15fx-common-5v5-test.js';
import { showDodgeBulletTime } from '../fx/20fx-dodge-bullet.js';
import { showRangedArrow, showSplashArrows } from '../fx/16fx-arrows-5v5-test.js';
import { CONFIG } from '../core/01config-5v5-test.js';
import { playLineText } from './08player-text.js';
import { animatePositionSwap } from '../fx/18fx-position-swap.js';
import { animatePushBack } from '../fx/19fx-push-back.js';
import { AudioManager } from '../modules/28audio-manager.js';
import { handleBuffSummon, handleBuffDestroy, handleBuffLeech, showBuffPopup } from './09player-buff-ui.js';
import { createRoundStepper } from '../core/06battle-engine-core.js';
import { getState } from '../ui/39main-state.js';
import { setRenderStore, updateUI } from '../ui/14ui-render-5v5-test.js';

class AnimationScheduler {
    constructor() {
        this.tasks = [];
        this.now = 0;
        this.speed = 1;
        this.paused = false;
    }
    schedule(type, delay, callback) {
        this.tasks.push({ type, startTime: this.now + delay, callback });
        this.tasks.sort((a, b) => a.startTime - b.startTime);
    }
    clear(type) { this.tasks = this.tasks.filter(t => t.type !== type); }
    tick(deltaMs) {
        if (this.paused) return;
        this.now += deltaMs * this.speed;
        while (this.tasks.length > 0 && this.tasks[0].startTime <= this.now) {
            const task = this.tasks.shift();
            try { task.callback(); } catch(e) {}
        }
    }
    pause() { this.paused = true; }
    resume() { this.paused = false; }
    setSpeed(s) { this.speed = s; }
}

const safeShowDanmaku = (...args) => { try { return showDanmaku(...args); } catch(e) {} };

function getCtx() {
    return window._getPlayerContext ? window._getPlayerContext() : null;
}

export function clearAllEffects(){
    document.querySelectorAll('.fly-shadow,.fly-ghost,.fly-arrow,.danmaku-bubble,.dmg-float,.heal-float,.arrow-overlay,.crash-clone,.victory-banner,.party-particle,.star-particle,.bullet-mask,.bullet-clone,.comic-bubble,.shockwave,.lightning-split,.flame-trail,.wind-split,.bg-particle,.counter-storm,.wind-shield').forEach(el=>{if(el.parentNode)el.parentNode.removeChild(el);});
    document.querySelectorAll('.cell-cheer').forEach(cell => cell.classList.remove('cell-cheer'));
    document.querySelectorAll('.grid.victory-border').forEach(grid => grid.classList.remove('victory-border'));
}

function insertBuffSeparator(logDiv, c) {
    let lastChild = logDiv.lastElementChild;
    if (lastChild) {
        let lastHTML = lastChild.innerHTML || '';
        if (lastHTML.includes('separator')) return;
    }
    let sep = document.createElement('div');
    sep.innerHTML = '<span class="separator">- - - - -</span><br>';
    logDiv.appendChild(sep);
    c.autoScrollLog();
}

const GAME_STATE_FIELDS = ['hp','alive','maxHp','atk','def','role','rangedForm','_isDead','_baseMaxHp','dmgDealt','dmgTaken','healDone','reboundDone','leechDone','dodgeCount','critCount','survivedRounds','pos','buffAtkBonus','buffDefBonus','buffDodgeBonus','buffHpBonus'];

function createStore(initialState, reducer) {
    let state = initialState;
    const listeners = [];
    return {
        getState: () => state,
        dispatch: (action) => {
            const next = reducer(state, action);
            if (next === state) return;
            state = next;
            listeners.forEach(fn => { try { fn(state, action); } catch(e) { console.error('Store subscriber error:', e); } });
        },
        subscribe: (fn) => { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; }
    };
}

function battleReducer(state, action) {
    switch (action.type) {
        case 'INIT': return state;
        case 'SET_FLASH': {
            let next = state.units.map(u => {
                if (u.uid !== action.uid) return u;
                return { ...u, _flash: action.flash };
            });
            return { ...state, units: next };
        }
        case 'SET_VISUAL': {
            let next = state.units.map(u => {
                if (u.uid !== action.uid) return u;
                const patch = {};
                if (action._acted !== undefined) patch._acted = action._acted;
                if (action._resting !== undefined) patch._resting = action._resting;
                if (action._blocked !== undefined) patch._blocked = action._blocked;
                if (action._isDead !== undefined) patch._isDead = action._isDead;
                if (action._flyMode !== undefined) patch._flyMode = action._flyMode;
                return { ...u, ...patch };
            });
            return { ...state, units: next };
        }
        case 'CLEAR_ALL_FLASH': {
            let next = state.units.map(u => ({ ...u, _flash: null }));
            return { ...state, units: next };
        }
        case 'CLEAR_UNIT_FLASH': {
            let next = state.units.map(u => {
                if (u.uid !== action.uid) return u;
                return { ...u, _flash: null };
            });
            return { ...state, units: next };
        }
        case 'APPLY_EVENTS': {
            const events = action.events;
            if (!events || events.length === 0) return state;
            let next = state.units.map(u => ({ ...u }));
            for (const ev of events) {
                if (ev.eventType === 'hp-change' || ev.eventType === 'stat-bonus-change') {
                    const idx = next.findIndex(u => u.uid === ev.unitUid);
                    if (idx >= 0) {
                        const p = ev.payload;
                        if (p.hp !== undefined) next[idx].hp = p.hp;
                        if (p.maxHp !== undefined) next[idx].maxHp = p.maxHp;
                        if (p.alive !== undefined) next[idx].alive = p.alive;
                        if (p.atk !== undefined) next[idx].atk = p.atk;
                        if (p.def !== undefined) next[idx].def = p.def;
                        if (p.buffAtkBonus !== undefined) next[idx].buffAtkBonus = p.buffAtkBonus;
                        if (p.buffDefBonus !== undefined) next[idx].buffDefBonus = p.buffDefBonus;
                        if (p.buffDodgeBonus !== undefined) next[idx].buffDodgeBonus = p.buffDodgeBonus;
                        if (p.buffHpBonus !== undefined) next[idx].buffHpBonus = p.buffHpBonus;
                        if (p.dmgDealt !== undefined) next[idx].dmgDealt = p.dmgDealt;
                        if (p.dmgTaken !== undefined) next[idx].dmgTaken = p.dmgTaken;
                        if (p.healDone !== undefined) next[idx].healDone = p.healDone;
                        if (p.reboundDone !== undefined) next[idx].reboundDone = p.reboundDone;
                        if (p.leechDone !== undefined) next[idx].leechDone = p.leechDone;
                        if (p.dodgeCount !== undefined) next[idx].dodgeCount = p.dodgeCount;
                        if (p.critCount !== undefined) next[idx].critCount = p.critCount;
                        if (p.survivedRounds !== undefined) next[idx].survivedRounds = p.survivedRounds;
                        if (p._isDead !== undefined) next[idx]._isDead = p._isDead;
                        if (ev.eventType === 'zhang-switch') {
                            next[idx].rangedForm = p.rangedForm !== undefined ? p.rangedForm : next[idx].rangedForm;
                            next[idx].role = p.role || next[idx].role;
                        }
                    }
                } else if (ev.eventType === 'unit-add') {
                    const p = ev.payload;
                    if (!next.find(u => u.uid === p.uid)) {
                        next.push({
                            uid: p.uid, name: p.name, role: p.role, camp: p.camp, pos: p.pos,
                            hp: p.hp, maxHp: p.maxHp, atk: p.atk, def: p.def, alive: p.alive,
                            isHorse: p.isHorse || false, _isDead: p._isDead || false,
                            dmgDealt: 0, dmgTaken: 0, healDone: 0, reboundDone: 0, leechDone: 0,
                            dodgeCount: 0, critCount: 0, survivedRounds: 0,
                            buffAtkBonus: 0, buffDefBonus: 0, buffDodgeBonus: 0, buffHpBonus: 0,
                            _flash: null, _acted: false, _resting: false, _blocked: false
                        });
                    }
                } else if (ev.eventType === 'unit-remove') {
                    next = next.filter(u => u.uid !== ev.payload.uid);
                }
            }
            return { ...state, units: next };
        }
        case 'SYNC_UNIT': {
            let next = state.units.map(u => {
                if (u.uid !== action.uid) return u;
                return { ...u, ...action.fields };
            });
            return { ...state, units: next };
        }
        case 'ADD_UNIT': {
            if (state.units.find(u => u.uid === action.unit.uid)) return state;
            return { ...state, units: [...state.units, action.unit] };
        }
        case 'REMOVE_UNIT': {
            return { ...state, units: state.units.filter(u => u.uid !== action.uid) };
        }
        default: return state;
    }
}
// ==================== 视觉动画函数（不修改状态，仅触发 UI 效果） ====================

async function handleBuffBonus(c, entry) {
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
    document.getElementById('log').appendChild(div);c.autoScrollLog();
    if (entry.targetUid && entry.bonusDmg) {
        let targetUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.targetUid);
        if (targetUnit) showDamageFloat(targetUnit, entry.bonusDmg);
    }
}

async function handleBuffSwap(c, entry) {
    insertBuffSeparator(document.getElementById('log'), c);
    c.isPaused = true;
    window.bulletTimeActive = true;
    await showBuffBanner('🌀 惑人心智！');
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';document.getElementById('log').appendChild(div);c.autoScrollLog();
    let units = c.UI.allyTeam.concat(c.UI.enemyTeam);
    let matchA = entry.text.match(/号位(.+?)\(/);
    let matchB = entry.text.match(/与.*?号位(.+?)\(/);
    let unitA = matchA ? units.find(u => u.name === matchA[1]) : null;
    let unitB = matchB ? units.find(u => u.name === matchB[1]) : null;
    if (unitA && unitB) {
        await animatePositionSwap(unitA, unitB, c);
    }
    window.bulletTimeActive = false;
    c.isPaused = false;
}

async function handleBuffPush(c, entry) {
    insertBuffSeparator(document.getElementById('log'), c);
    c.isPaused = true;
    window.bulletTimeActive = true;
    await showBuffBanner('🦅 乘风突袭！');
    window.bulletTimeActive = false;
    c.isPaused = false;
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';document.getElementById('log').appendChild(div);c.autoScrollLog();
    let targetUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.name === entry.pushTarget);
    if (entry.pushBehind) {
        let behindUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.name === entry.pushBehind);
        if (targetUnit && behindUnit) { await animatePositionSwap(targetUnit, behindUnit, c); }
    } else if (targetUnit) {
        await animatePushBack(targetUnit, c, entry.pushPos);
    }
}

async function handleBuffReboundFortify(c, entry) {
    insertBuffSeparator(document.getElementById('log'), c);
    c.isPaused = true;
    window.bulletTimeActive = true;
    await showBuffBanner('🛡️ 严阵以待！');
    window.bulletTimeActive = false;
    c.isPaused = false;
    let attacker = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.attackerUid);
    if (attacker && entry.reboundDmg) showDamageFloat(attacker, entry.reboundDmg);
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';document.getElementById('log').appendChild(div);c.autoScrollLog();
    await new Promise(r=>setTimeout(r, c.speed/2));
}

// 核心攻击动画（纯视觉，通过 Store dispatch 更新标记）
async function handleAttackGroup(c, entry, roundResult, abortSig, isFirstAttackRef) {
    if (entry.isCombo) { let spacer = document.createElement('div'); spacer.innerHTML = '<br>'; document.getElementById('log').appendChild(spacer); c.autoScrollLog(); c.isPaused = true; window.bulletTimeActive = true; if (c._scheduler) { await new Promise(r => c._scheduler.schedule('banner', 1500, r)); showBuffBanner('⚡ 连击！'); } else { await showBuffBanner('⚡ 连击！'); } window.bulletTimeActive = false; c.isPaused = false; }
    let unitA=c.UI.allyTeam.concat(c.UI.enemyTeam).find(u=>u.uid===entry.uidA);
    let unitD=entry.uidD?c.UI.allyTeam.concat(c.UI.enemyTeam).find(u=>u.uid===entry.uidD):null;
    if(!entry.isBlock&&!entry.isMiss&&!entry.isDodge&&(!unitA||!unitD))return { isBattleOver: false };
    // 攻击闪光（视觉）- 通过 Store dispatch
    if(unitA&&!entry.isBlock){
        c.store.dispatch({ type: 'SET_FLASH', uid: unitA.uid, flash: 'attack' });
        setTimeout(() => {
            c._triggerFX(entry._fxSnapshot,unitA,unitD,entry.isDead,entry.isDodge,entry.isMiss,entry.isBlock,entry._dmg,entry.waveTaunt,entry.waveUnit,entry.unitRole);
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
    
    // 日志逐行播放
    let textEntries=entry.entries,lineCount=textEntries.length, speedFactor=Math.max(c.speed,600)/1000, textDuration=c.speed*lineCount, offset=200*speedFactor, atkFlashDuration=textDuration+300*speedFactor, defFlashDuration=atkFlashDuration, atkTimer=null;
    if(unitA&&!entry.isBlock)atkTimer=setTimeout(async()=>{ await c.waitWhilePaused(); if(unitA){c.store.dispatch({ type: 'CLEAR_UNIT_FLASH', uid: unitA.uid }); c.store.dispatch({ type: 'SET_VISUAL', uid: unitA.uid, _acted: true });} },atkFlashDuration);
    await new Promise(r=>setTimeout(r,offset)); await c.waitWhilePaused();
    if(abortSig&&abortSig.aborted){if(atkTimer)clearTimeout(atkTimer);return { isBattleOver: false };}
    if(unitD&&!entry.isDodge&&!entry.isMiss){c.store.dispatch({ type: 'SET_FLASH', uid: unitD.uid, flash: 'defend' });} let defTimer=null; if(unitD&&!entry.isDodge&&!entry.isMiss)defTimer=setTimeout(async()=>{ await c.waitWhilePaused(); if(unitD&&!entry.isDead){c.store.dispatch({ type: 'CLEAR_UNIT_FLASH', uid: unitD.uid });} },defFlashDuration);
    
    // 闪避子弹时间
    if (entry.isDodge && unitA && unitD) { if (c.dodgeEffectEnabled) { let reboundDmg = Math.floor((unitD.atk + unitD.def) * 0.5); c.isPaused = true; window.bulletTimeActive = true; await showCriticalBanner('✨闪避反击✨'); await showDodgeBulletTime(unitA, unitD, reboundDmg); window.bulletTimeActive = false; c.isPaused = false; } else { showDodgeBubble(unitD, '闪避！'); } }
    if (entry.isDead && unitD) { if (defTimer) clearTimeout(defTimer); c.store.dispatch({ type: 'SET_FLASH', uid: unitD.uid, flash: 'dead' }); c.store.dispatch({ type: 'SET_VISUAL', uid: unitD.uid, _isDead: true }); }
    if (entry.isDodge && unitA && !unitA.alive) { c.store.dispatch({ type: 'SET_FLASH', uid: unitA.uid, flash: 'dead' }); c.store.dispatch({ type: 'SET_VISUAL', uid: unitA.uid, _isDead: true }); }
    
    let lastDiv=null,healDiv=null, blockDelay=false;
    for(let entry2 of textEntries){
        if(abortSig&&abortSig.aborted){if(atkTimer)clearTimeout(atkTimer);if(defTimer)clearTimeout(defTimer);return { isBattleOver: false };}
        if(!c.detailMode&&entry2.type==='detail'){ let hiddenDiv=document.createElement('div'); hiddenDiv.className='detail-hidden'; hiddenDiv.innerHTML=entry2.text+'<br>'; document.getElementById('log').appendChild(hiddenDiv); c.autoScrollLog(); continue; }
        if(entry2.type==='damage-text'){ lastDiv=document.createElement('div'); document.getElementById('log').appendChild(lastDiv); await playLineText(entry2.text,lastDiv); }
        else if(entry2.isHealEntry && entry.isDead){ healDiv=document.createElement('div'); document.getElementById('log').appendChild(healDiv); await playLineText(entry2.text,healDiv); }
        else{
            if(entry2.isHealEntry && !entry.isDead) {
                let match = entry2.text.match(/\+(\d+)/);
                let healUid = entry2.healUnitUid || (unitA ? unitA.uid : null);
                let healUnit = healUid ? c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === healUid) : null;
                if(match && healUnit) {
                    let healAmount = parseInt(match[1]);
                    showHealFloat(healUnit, healAmount);
                }
            }
            if(entry.isBlock&&entry2.text&&entry2.text.includes('休息回复10点生命')&&unitA){c.store.dispatch({ type: 'SET_VISUAL', uid: unitA.uid, _resting: true });blockDelay = true;}
            let tempDiv=document.createElement('div'); document.getElementById('log').appendChild(tempDiv); await playLineText(entry2.text,tempDiv);
        }
    }
    if(blockDelay) await new Promise(r=>setTimeout(r, c.speed/2));
    if (entry.isDead && lastDiv && !entry.isBlock && !entry.isMiss && !entry.isDodge) { applyBrushEffect(lastDiv); }
    if(entry.isDodge&&unitD)showDodgeBubble(unitD,'闪避！'); if(entry.isMiss&&unitA)showDodgeBubble(unitA,'未命中');
    if(unitD&&entry.hpPctAfter!==undefined&&entry.hpPctBefore!==undefined){ if(entry.hpPctBefore>40&&entry.hpPctAfter<=40&&entry.hpPctAfter>20){let t=(unitD.camp==='ally'?'不好，必须反击了！':'小儿安敢伤我！');safeShowDanmaku(unitD,t);} else if(entry.hpPctBefore>20&&entry.hpPctAfter<=20){let t=(unitD.camp==='ally'?'撑住！':'已是强弩之末！');safeShowDanmaku(unitD,t);} }
    await new Promise(r=>setTimeout(r,offset)); await c.waitWhilePaused();
    if(atkTimer)clearTimeout(atkTimer); if(defTimer)clearTimeout(defTimer);
    if(unitA && !unitA._isDead){c.store.dispatch({ type: 'CLEAR_UNIT_FLASH', uid: unitA.uid }); c.store.dispatch({ type: 'SET_VISUAL', uid: unitA.uid, _acted: true });}
    if(unitD && !entry.isDodge && !entry.isMiss && !entry.isDead && !unitD._isDead) c.store.dispatch({ type: 'CLEAR_UNIT_FLASH', uid: unitD.uid });
    // 更新遮挡状态
    c.UI.allyTeam.concat(c.UI.enemyTeam).forEach(u => { if (u.alive) { let blocked = isBlocked(u, u.camp === 'ally' ? c.UI.allyTeam : c.UI.enemyTeam); c.store.dispatch({ type: 'SET_VISUAL', uid: u.uid, _blocked: blocked }); } });
    document.getElementById('roundDisplay').innerText = `📜 日志（第${c.UI.round}回合）`;
    if(entry.isDead&&(c.UI.allyTeam.every(ch=>!ch.alive)||c.UI.enemyTeam.every(ch=>!ch.alive))){ return { isBattleOver: true }; }
    return { isBattleOver: false };
}

async function handleInfo(c, entry) {
    if(entry.isZhangSwitch&&entry.unit){ let zhangUnit = c.UI.allyTeam.find(u => u.isZhang); let sepDiv=document.createElement('div');sepDiv.innerHTML='<span class="separator">- - - - -</span><br>'; document.getElementById('log').appendChild(sepDiv); c.autoScrollLog(); let tempDiv=document.createElement('div');document.getElementById('log').appendChild(tempDiv); await playLineText(entry.text,tempDiv); if(zhangUnit) { c.store.dispatch({ type: 'SET_VISUAL', uid: zhangUnit.uid, _resting: false }); safeShowDanmaku(zhangUnit, '不好，要顶上去了！'); } }
    else { 
        if (entry.isDoubleStrikeBanner) {
            c.isPaused = true;
            await showBuffBanner('⚡ 概率连击！');
            c.isPaused = false;
        }
        if (entry.text && entry.text.includes('拒马无法攻击')) { let sepDiv=document.createElement('div'); sepDiv.innerHTML='<span class="separator">- - - - -</span><br>'; document.getElementById('log').appendChild(sepDiv); c.autoScrollLog(); await new Promise(r=>setTimeout(r, c.speed/4)); } 
        if (entry.buffType === 'elite_xinhun') {
            let song = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.name === '宋青书');
            let zhou = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.zhouUid);
            if (song) showHeartEffect(song);
            if (zhou) showHeartEffect(zhou);
            if (zhou) {
                setTimeout(() => {
                    if (zhou.alive) showPinkFlash(zhou);
                }, 800); 
            }
        }
        if (entry.buffType === 'elite_kuaile_heal' && entry.zhouUid) {
            let unit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.zhouUid);
            let match = entry.text.match(/回复(\d+)/);
            if (match && unit) showHealFloat(unit, parseInt(match[1]));
        }
        let tempDiv=document.createElement('div');document.getElementById('log').appendChild(tempDiv); await playLineText(entry.text,tempDiv); 
    }
    document.getElementById('roundDisplay').innerText = `📜 日志（第${c.UI.round}回合）`;
}

async function handleRoundStart(c, entry, isFirstAttackRef) {
    c.UI.round = parseInt(entry.text.match(/\d+/)[0])||1;
    if (isFirstAttackRef) isFirstAttackRef.value = true;
    c.UI.allyTeam.concat(c.UI.enemyTeam).forEach(u=>{if(u.alive){c.store.dispatch({ type: 'SET_VISUAL', uid: u.uid, _acted: false, _resting: false }); let blocked = isBlocked(u, u.camp==='ally'?c.UI.allyTeam:c.UI.enemyTeam); c.store.dispatch({ type: 'SET_VISUAL', uid: u.uid, _blocked: blocked });}});
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';document.getElementById('log').appendChild(div);c.autoScrollLog();
    document.getElementById('roundDisplay').innerText = `📜 日志（第${c.UI.round}回合）`;
    await new Promise(r=>setTimeout(r, c.speed/3));
}

async function handleRoundEnd(c, entry, log, i) {
    let hasSkill=log[i-1]&&log[i-1].type==='attack-group'&&log[i-1].entries.some(e=>e.type==='info'); if(!hasSkill){ let spacer=document.createElement('div');spacer.innerHTML='<br>';document.getElementById('log').appendChild(spacer);c.autoScrollLog(); }
    let div=document.createElement('div');div.innerHTML=entry.text + '<br>';document.getElementById('log').appendChild(div); c.autoScrollLog(); document.getElementById('roundDisplay').innerText = `📜 日志（第${c.UI.round}回合）`;
    if (c.tickBuffDurations) { c.tickBuffDurations(); c.updateBuffSlots(); }
    if (window._refreshGlowCells) window._refreshGlowCells();
    await new Promise(r=>setTimeout(r,c.speed/3));
}

// ==================== 主分发器 ====================

export async function playLogEntries(c, log, roundResult, isFirstAttackRef) {
    let abortSig = c.abortController ? c.abortController.signal : null;
    let lastEntryType = null;

    try {
        for (let i = 0; i < log.length; i++) {
            if (abortSig && abortSig.aborted) return { isBattleOver: false };
            await c.waitWhilePaused();
            let entry = log[i];

            const isAttackCore = (t) => t === 'attack-group' || t === 'buff-leech' || t === 'buff-splash';
            const isAttackSub = (t) => t === 'buff-leech' || t === 'buff-splash' || t === 'buff-bonus';

            const needSep =
                (lastEntryType && isAttackCore(lastEntryType) && !isAttackSub(entry.type) && entry.type !== lastEntryType) ||
                (lastEntryType === 'attack-group' && entry.type === 'attack-group');

            if (needSep) {
                let sepDiv = document.createElement('div');
                sepDiv.innerHTML = '<span class="separator">- - - - -</span><br>';
                document.getElementById('log').appendChild(sepDiv);
                c.autoScrollLog();
                await new Promise(r => setTimeout(r, c.speed / 4));
            }

            switch (entry.type) {
                case 'buff-summon':
                    await handleBuffSummon(c, entry, i > 0 ? log[i-1] : null);
                    const horse = c.UI.allyTeam.find(u => u.uid === entry.horseUid);
                    if (horse) c.store.dispatch({ type: 'ADD_UNIT', unit: horse.clone() });
                    lastEntryType = entry.type;
                    break;
                case 'buff-destroy':
                    await handleBuffDestroy(c, entry, i > 0 ? log[i-1] : null);
                    lastEntryType = entry.type;
                    break;
                case 'buff-leech':
                    insertBuffSeparator(document.getElementById('log'), c);
                    if (entry.buffType === 'hotBlood') {
                        let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
                        document.getElementById('log').appendChild(div);c.autoScrollLog();
                        let healUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.healUnitUid);
                        if (healUnit && entry.healAmount) showHealFloat(healUnit, entry.healAmount);
                        if (entry.text.includes('翻倍')) {
                            c.isPaused = true; window.bulletTimeActive = true;
                            await showBuffBanner('❤️‍🔥 热血奋战(翻倍)！');
                            window.bulletTimeActive = false; c.isPaused = false;
                        }
                    } else {
                        await handleBuffLeech(c, entry);
                        if (entry.healUnitUid && entry.healAmount) {
                            let healed = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.healUnitUid);
                            if (healed) c.store.dispatch({ type: 'SYNC_UNIT', uid: entry.healUnitUid, fields: { hp: healed.hp, maxHp: healed.maxHp } });
                        }
                    }
                    lastEntryType = entry.type;
                    break;
                case 'buff-splash':
                    c.isPaused = true; window.bulletTimeActive = true;
                    if (entry.buffType === 'wind_assault') await showBuffBanner('🦅 乘风突袭！');
                    else if (entry.buffType === 'meteor_splash') await showBuffBanner('☄️ 流星赶月！');
                    else await showBuffBanner('🦅 乘风突袭！');
                    window.bulletTimeActive = false;
                    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
                    document.getElementById('log').appendChild(div);c.autoScrollLog();
                    if (entry.splashUids && entry.splashDmg) {
                        if (entry.attackerUid && entry.primaryUid) {
                            let attacker = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.attackerUid);
                            let primary = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.primaryUid);
                            let splashTargets = entry.splashUids.map(uid => c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === uid)).filter(u => u);
                            if (attacker && primary && splashTargets.length > 0) showSplashArrows(attacker, primary, splashTargets, c.speed, () => c.isPaused);
                        }
                        entry.splashUids.forEach(uid => {
                            let targetUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === uid);
                            if (targetUnit) showDamageFloat(targetUnit, entry.splashDmg);
                        });
                    }
                    if (entry.buffType === 'meteor_splash') await new Promise(r=>setTimeout(r, 600));
                    c.isPaused = false;
                    lastEntryType = entry.type;
                    break;
                case 'buff-bonus':           await handleBuffBonus(c, entry); lastEntryType = entry.type; break;
                case 'buff-swap':            await handleBuffSwap(c, entry); lastEntryType = entry.type; break;
                case 'buff-push':            await handleBuffPush(c, entry); lastEntryType = entry.type; break;
                case 'buff-summary':         { let div2=document.createElement('div');div2.innerHTML=entry.text+'<br>';document.getElementById('log').appendChild(div2);c.autoScrollLog(); lastEntryType = entry.type; } break;
                case 'buff-rebound-fortify': await handleBuffReboundFortify(c, entry); lastEntryType = entry.type; break;
                case 'round-start':          await handleRoundStart(c, entry, isFirstAttackRef); lastEntryType = entry.type; break;
                case 'attack-group': {
                    let result = await handleAttackGroup(c, entry, roundResult, abortSig, isFirstAttackRef);
                    if (entry._events && entry._events.length > 0) {
                        c.store.dispatch({ type: 'APPLY_EVENTS', events: entry._events });
                    }
                    lastEntryType = entry.type;
                    if (result && result.isBattleOver) return result;
                    break;
                }
                case 'info':  await handleInfo(c, entry); lastEntryType = entry.type; break;
                case 'round-end': await handleRoundEnd(c, entry, log, i); lastEntryType = entry.type; break;
            }

            if (abortSig && abortSig.aborted) return { isBattleOver: false };
        }
    } catch (e) {
        window.bulletTimeActive = false;
        console.error('playLogEntries 错误:', e);
        return { isBattleOver: false };
    }
    return { isBattleOver: false };
}

export async function playBattle() {
    const c = getCtx();
    if (!c || !c.UI.currentResult) return;
    const scheduler = new AnimationScheduler();
    c._scheduler = scheduler;

    let lastTime = performance.now();
    function frameLoop() {
        const now = performance.now();
        if (c.isPaused) {
            window.bulletTimeActive = false;
            lastTime = now;
            if (!c._battleEnded) requestAnimationFrame(frameLoop);
            return;
        }
        scheduler.paused = false;
        scheduler.tick(Math.min(now - lastTime, 100));
        lastTime = now;
        if (!c._battleEnded) requestAnimationFrame(frameLoop);
    }
    requestAnimationFrame(frameLoop);

    let abortSig = c.abortController ? c.abortController.signal : null;

    // ========== 初始化 Store ==========
    const initialUnits = [
        ...c.snapshot.ally.map(u => { let u2 = u.clone(); u2.hp = u2.maxHp; u2.alive = true; u2._isDead = false; u2._flash = null; u2._acted = false; u2._resting = false; u2._blocked = false; u2.camp = 'ally'; return u2; }),
        ...c.snapshot.enemy.map(u => { let u2 = u.clone(); u2.hp = u2.maxHp; u2.alive = true; u2._isDead = false; u2._flash = null; u2._acted = false; u2._resting = false; u2._blocked = false; u2.camp = 'enemy'; return u2; })
    ];
    c.store = createStore({ units: initialUnits, round: 1 }, battleReducer);
    setRenderStore(c.store);

    // 订阅 Store 变化 → 同步到 c.UI
    c.store.subscribe((state) => {
        if (!c.UI || !c.UI.allyTeam || !c.UI.enemyTeam) return;
        const syncFields = (uiUnit) => {
            const su = state.units.find(u => u.uid === uiUnit.uid);
            if (!su) return;
            GAME_STATE_FIELDS.forEach(f => { if (su[f] !== undefined) uiUnit[f] = su[f]; });
            if (su._flash !== undefined) uiUnit._flash = su._flash;
            if (su._acted !== undefined) uiUnit._acted = su._acted;
            if (su._resting !== undefined) uiUnit._resting = su._resting;
            if (su._blocked !== undefined) uiUnit._blocked = su._blocked;
            if (su._isDead && !uiUnit._isDead) {
                uiUnit._isDead = true;
                uiUnit._flash = 'dead';
            }
        };
        c.UI.allyTeam.forEach(syncFields);
        c.UI.enemyTeam.forEach(syncFields);
        state.units.forEach(su => {
            if (su.camp === 'ally' && !c.UI.allyTeam.find(u => u.uid === su.uid)) c.UI.allyTeam.push({...su});
            if (su.camp === 'enemy' && !c.UI.enemyTeam.find(u => u.uid === su.uid)) c.UI.enemyTeam.push({...su});
        });
        c.UI.allyTeam = c.UI.allyTeam.filter(u => state.units.find(su => su.uid === u.uid));
        c.UI.enemyTeam = c.UI.enemyTeam.filter(u => state.units.find(su => su.uid === u.uid));

        if (!c._deathTimers) c._deathTimers = {};
        for (const teamKey of ['allyTeam', 'enemyTeam']) {
            for (const unit of c.UI[teamKey]) {
                if (unit._isDead && !c._deathTimers[unit.uid]) {
                    c._deathTimers[unit.uid] = true;
                    const uid = unit.uid;
                    setTimeout(() => {
                        c.UI.allyTeam = c.UI.allyTeam.filter(u => u.uid !== uid);
                        c.UI.enemyTeam = c.UI.enemyTeam.filter(u => u.uid !== uid);
                        delete c._deathTimers[uid];
                        c.store.dispatch({ type: 'REMOVE_UNIT', uid: uid });
                    }, 3000);
                }
            }
        }
    });

    c.UI.allyTeam = initialUnits.filter(u => u.camp === 'ally').map(u => u.clone());
    c.UI.enemyTeam = initialUnits.filter(u => u.camp === 'enemy').map(u => u.clone());
    document.getElementById('roundDisplay').innerText = `📜 日志（第1回合）`;

    let logDiv = document.getElementById('log');
    let backToBottomBtn = document.createElement('div'); backToBottomBtn.id = 'backToBottomBtn'; backToBottomBtn.style.cssText = 'position:absolute;right:8px;bottom:60px;width:32px;height:32px;background:rgba(0,0,0,0.6);color:#ffd700;border-radius:50%;display:none;align-items:center;justify-content:center;font-size:18px;cursor:pointer;z-index:20;'; backToBottomBtn.innerHTML = '↓';
    backToBottomBtn.addEventListener('click', () => {
        logDiv.scrollTop = logDiv.scrollHeight;
        c.userScrolled = false;
        backToBottomBtn.style.display = 'none';
        if (window._restoreSpeedFromScroll) window._restoreSpeedFromScroll();
        let mainCtx = window._getPlayerContext ? window._getPlayerContext() : c;
        if (mainCtx && mainCtx.speed) c.speed = mainCtx.speed;
        else c.speed = 500;
    });
    logDiv.parentElement.appendChild(backToBottomBtn);
    logDiv.addEventListener('scroll', () => {
        let threshold = 10;
        let distToBottom = logDiv.scrollHeight - logDiv.scrollTop - logDiv.clientHeight;
        if (distToBottom > threshold) {
            c.userScrolled = true;
            backToBottomBtn.style.display = 'flex';
            if (window._activateScrollSlowdown) window._activateScrollSlowdown();
            c.speed = 1800;
        } else {
            c.userScrolled = false;
            backToBottomBtn.style.display = 'none';
            if (window._restoreSpeedFromScroll) window._restoreSpeedFromScroll();
            c.speed = getState.speed();
        }
    });

    let battleState = { ally: c.snapshot.ally.map(u => u.clone()), enemy: c.snapshot.enemy.map(u => u.clone()), round: 1, activeBuffs: c.activeBuffs ? c.activeBuffs.map(b => ({...b})) : [] };
    let isBattleOver = false; let finalWinner = null;

    while (!isBattleOver) {
        if (abortSig && abortSig.aborted) return;

        const isFirstAttackRef = { value: true };
        const stepper = createRoundStepper(battleState);
        let lastStep = null;

        for (const step of stepper) {
            if (abortSig && abortSig.aborted) return;
            await c.waitWhilePaused();
            lastStep = step;

            await playLogEntries(c, step.log, step, isFirstAttackRef);

            if (step.events && step.events.length > 0) {
                c.store.dispatch({ type: 'APPLY_EVENTS', events: step.events });
            }

            await new Promise(r => setTimeout(r, Math.max(100, c.speed / 2)));

            if (step.winner) {
                finalWinner = step.winner;
                isBattleOver = true;
                break;
            }
        }

        if (isBattleOver) break;

        let nextActiveBuffs = c.activeBuffs ? c.activeBuffs.map(b => ({...b, remaining: b.remaining - 1})).filter(b => b.remaining > 0) : [];
        if (battleState.round % 3 === 0 && battleState.round > 0) {
            let promDiv = document.createElement('div'); promDiv.innerHTML = `<span class="gold">✨ 请选择新的Buff（持续${CONFIG.BUFF_DURATION || 4}回合）</span><br>`; logDiv.appendChild(promDiv); c.autoScrollLog();
            c.isPaused = true;
            let newBuff = await showBuffPopup(c);
            if (newBuff) {
                nextActiveBuffs = [...(nextActiveBuffs || []), newBuff];
                let msgDiv = document.createElement('div'); msgDiv.innerHTML = `<span class="gold">✨ 获得Buff：${newBuff.name}（持续${newBuff.remaining}回合）</span><br>`; logDiv.appendChild(msgDiv); c.autoScrollLog();
                let mainCtx = window._getPlayerContext ? window._getPlayerContext() : null;
                if (mainCtx) { mainCtx.activeBuffs = nextActiveBuffs; if (mainCtx.updateBuffSlots) mainCtx.updateBuffSlots(); }
            }
            c.isPaused = false;
        }

        battleState = { ally: lastStep.ally, enemy: lastStep.enemy, round: battleState.round + 1, activeBuffs: nextActiveBuffs };

        if (c.autoMode) {
            await new Promise(r=>setTimeout(r, c.speed/2));
        } else {
            document.getElementById('btnNext').disabled = false;
            c.waitingForNextRound = true;
            await new Promise((resolve) => {
                let check = setInterval(() => { if (!c.waitingForNextRound || (abortSig && abortSig.aborted)) { clearInterval(check); resolve(); } }, 200);
            });
            if (abortSig && abortSig.aborted) return;
            c.waitingForNextRound = false;
            document.getElementById('btnNext').disabled = true;
        }
    }

    if (!finalWinner) finalWinner = '平局';
    c.gs = 'GAMEOVER'; c.isPaused = false; c.waitingForNextRound = false; c.isBattleStarting = false;
    c.updateButtons(); c.enableAllButtons();

    let winner = finalWinner;
    if (winner === '明教' || winner === '六大派') {
        c.battleResultForInfo = { winner, ally: c.UI.allyTeam, enemy: c.UI.enemyTeam };
        let units = winner === '明教' ? c.UI.allyTeam : c.UI.enemyTeam, alive = units.filter(u => u.alive);
        if (alive.length > 0) {
            alive.forEach(u => { c.store.dispatch({ type: 'SET_FLASH', uid: u.uid, flash: 'cheer' }); });
            await new Promise(r => setTimeout(r, 800));
            if (c.spawnVictoryEffects) c.spawnVictoryEffects(winner);
        }
        let winColor = winner === '明教' ? 'blue' : 'orange';
        logDiv.innerHTML += `<span class="gold">🎉🏆 <span class="${winColor}">${winner}</span>获得最终胜利！ 🏆🎉</span><br>`;
        logDiv.scrollTop = logDiv.scrollHeight;
        await new Promise(r => setTimeout(r, 3000));
    } else {
        logDiv.innerHTML+='<span class="gray">🤝 平局！积分不变</span><br>';
        logDiv.scrollTop = logDiv.scrollHeight;
    }

    c.store.dispatch({ type: 'CLEAR_ALL_FLASH' });

    let mainCtx = window._getPlayerContext ? window._getPlayerContext() : null;
    if (mainCtx && mainCtx.activeBuffs) mainCtx.activeBuffs = [];
    if (mainCtx && mainCtx.updateBuffSlots) mainCtx.updateBuffSlots();
    if (window._updateGlowColors) window._updateGlowColors(-1);

    if (window._voteChoice && window._voteChoice !== 'skip' && winner !== '平局') {
        let correct = (window._voteChoice === winner), earnPoints = 0;
        if (correct) { earnPoints = window._battleHasZhang ? 3 : 2; window._voteScore += earnPoints; }
        else { earnPoints = -1; window._voteScore += earnPoints; }
        localStorage.setItem('ming_vote_score_5v5_test', window._voteScore);
        let badge = document.getElementById('scoreBadge'), floatEl = document.createElement('span');
        floatEl.className = 'score-float'; floatEl.textContent = (earnPoints > 0 ? '+' : '') + earnPoints + '🏆';
        badge.appendChild(floatEl);
        setTimeout(() => { if (floatEl.parentNode) floatEl.parentNode.removeChild(floatEl); }, 3500);
        setTimeout(() => c.updateScoreBadge(), 3500);
        let voteMsg = correct ? `<span class="green">📊 你猜了${window._voteChoice}，正确！+${earnPoints}分！ 当前积分：${window._voteScore}</span>` : `<span class="red">📊 你猜了${window._voteChoice}，错误！-1分！当前积分：${window._voteScore}</span>`;
        logDiv.innerHTML += voteMsg + '<br>'; logDiv.scrollTop = logDiv.scrollHeight;
    } else if (winner === '平局') {
        logDiv.innerHTML += '<span class="gray">📊 平局，积分不变，当前积分：' + window._voteScore + '</span><br>';
        logDiv.scrollTop = logDiv.scrollHeight;
    }
    window._voteChoice = null;
    c._battleEnded = true;
    c.abortController = null;
    c.store = null;
}