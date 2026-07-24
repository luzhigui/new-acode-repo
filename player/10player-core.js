// player/10player-core.js - 光明顶5v5 战斗播放器核心
// V5.2.0 | ~48000 bytes | 2026-07-11 事件链路重构：播放器纯消费日志，不补事件
export const VER = 'player/10player-core.js V5.2.0';

import { isBlocked } from '../core/03battle-utils.js';
import { showDanmaku, showDamageFloat, showDodgeBubble, showHealFloat, showAtkBuffFloat, applyBrushEffect, showBuffBanner, showCriticalBanner, showHeartEffect, showPinkFlash, showKuLianEffect } from '../fx/15fx-common-5v5-test.js';
import { showDodgeBulletTime } from '../fx/20fx-dodge-bullet.js';
import { showRangedArrow, showSplashArrows, showBoneClaw } from '../fx/16fx-arrows-5v5-test.js';
import { CONFIG } from '../core/01config-5v5-test.js';
import { playLineText } from './08player-text.js';
import { animatePositionSwap } from '../fx/18fx-position-swap.js';
import { animatePushBack, animatePushSwap } from '../fx/19fx-push-back.js';
import { AudioManager } from '../modules/28audio-manager.js';
import { handleBuffSummon, handleBuffDestroy, handleBuffLeech, showBuffPopup, handleHolyTokenDrop } from './09player-buff-ui.js';
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
    document.querySelectorAll('[data-fx="temporary"]').forEach(el=>{if(el.parentNode)el.parentNode.removeChild(el);});
    document.querySelectorAll('.cell-cheer').forEach(cell => cell.classList.remove('cell-cheer'));
    document.querySelectorAll('.grid.victory-border').forEach(grid => grid.classList.remove('victory-border'));
}

const GAME_STATE_FIELDS = ['hp','alive','maxHp','atk','def','role','rangedForm','_isDead','_baseMaxHp','_baseAtk','_baseDef','dmgDealt','dmgTaken','healDone','reboundDone','leechDone','dodgeCount','critCount','survivedRounds','pos','buffAtkBonus','buffDefBonus','buffDodgeBonus','buffHpBonus','_phantomTarget', '_masteredRoles', '_fortifyStacks', '_baseFangDef'];

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
                if (action._hasKuaiLe !== undefined) patch._hasKuaiLe = action._hasKuaiLe;
                if (action._hasXingFen !== undefined) patch._hasXingFen = action._hasXingFen;
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
                if (ev.eventType === 'hp-change' || ev.eventType === 'stat-bonus-change' || ev.eventType === 'zhang-switch') {
                    const idx = next.findIndex(u => u.uid === ev.unitUid);
                    if (idx >= 0) {
                        const p = ev.payload;
                        if (p.hp !== undefined) next[idx].hp = p.hp;
                        if (p.maxHp !== undefined) next[idx].maxHp = p.maxHp;
                        if (p.alive !== undefined) next[idx].alive = p.alive;
                        if (p.atk !== undefined) next[idx].atk = p.atk;
                        if (p.def !== undefined) next[idx].def = p.def;
                        if (p.role !== undefined) next[idx].role = p.role;
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
                        if (p._resting !== undefined) next[idx]._resting = p._resting;
                        if (p._blocked !== undefined) next[idx]._blocked = p._blocked;
                        if (p._phantomTarget !== undefined) next[idx]._phantomTarget = p._phantomTarget;
                        if (p._flyMode !== undefined) next[idx]._flyMode = p._flyMode;
                        if (p._butterflyHost !== undefined) next[idx]._butterflyHost = p._butterflyHost;
                        if (p._masteredRoles !== undefined) next[idx]._masteredRoles = p._masteredRoles;
                        if (ev.eventType === 'zhang-switch') {
                            if (p.rangedForm !== undefined) next[idx].rangedForm = p.rangedForm;
                            if (p.role) next[idx].role = p.role;
                        }
                    }
                } else if (ev.eventType === 'unit-add') {
                    const p = ev.payload;
                    if (!next.find(u => u.uid === p.uid)) {
                        next.push({
                            uid: p.uid, name: p.name, role: p.role, camp: p.camp, pos: p.pos,
                            hp: p.hp, maxHp: p.maxHp, atk: p.atk, def: p.def, alive: p.alive,
                            isHorse: p.isHorse || false, _isDead: p._isDead || false,
                            _phantomTarget: p._phantomTarget || null,
                            dmgDealt: 0, dmgTaken: 0, healDone: 0, reboundDone: 0, leechDone: 0,
                            dodgeCount: 0, critCount: 0, survivedRounds: 0,
                            buffAtkBonus: 0, buffDefBonus: 0, buffDodgeBonus: 0, buffHpBonus: 0,
                            _flash: null, _acted: false, _resting: false, _blocked: false
                        });
                    }
                } else if (ev.eventType === 'unit-remove') {
                    next = next.filter(u => u.uid !== ev.payload.uid);
                } else if (ev.eventType === 'pos-change') {
                    const idx = next.findIndex(u => u.uid === ev.uid);
                    if (idx >= 0) {
                        next[idx].pos = ev.pos;
                    }
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

async function handleBuffBonus(c, entry) {
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
    document.getElementById('log').appendChild(div);c.autoScrollLog();
    if (entry.targetUid && entry.bonusDmg) {
        let targetUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.targetUid);
        if (targetUnit) showDamageFloat(targetUnit, entry.bonusDmg);
    }
}

async function handleBuffSwap(c, entry) {
    c.isPaused = true;
    window.bulletTimeActive = true;
    await showBuffBanner('🌀 惑人心智！');
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';document.getElementById('log').appendChild(div);c.autoScrollLog();
    let units = c.UI.allyTeam.concat(c.UI.enemyTeam);
    let unitA = entry.uidA ? units.find(u => u.uid === entry.uidA) : null;
    let unitB = entry.uidB ? units.find(u => u.uid === entry.uidB) : null;
    if (unitA && unitB) {
        let oldPosA = entry.oldPosA, oldPosB = entry.oldPosB;
        await animatePositionSwap(unitA, unitB, c, {
            skipDataChange: true,
            oldPositions: (oldPosA != null && oldPosB != null) ? [oldPosA, oldPosB] : null
        });
        // 统一通过 Store dispatch 换位，保证 UI 同步
        if (c.store) {
            c.store.dispatch({ type: 'APPLY_EVENTS', events: [
                { eventType: 'pos-change', uid: unitA.uid, pos: oldPosB || unitB.pos },
                { eventType: 'pos-change', uid: unitB.uid, pos: oldPosA || unitA.pos }
            ]});
            c.updateUI();
        }
    }
    window.bulletTimeActive = false;
    c.isPaused = false;
}

async function handleBuffPush(c, entry) {
    c.isPaused = true;
    window.bulletTimeActive = true;
    await showBuffBanner('🦅 乘风突袭！');
    window.bulletTimeActive = false;
    c.isPaused = false;
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';document.getElementById('log').appendChild(div);c.autoScrollLog();
    let targetUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.pushTargetUid);
    if (entry.behindUid) {
        let behindUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.behindUid);
        if (targetUnit && behindUnit) {
            await animatePushSwap(targetUnit, behindUnit, c);
        }
    } else if (targetUnit) {
        await animatePushBack(targetUnit, c, entry.newPos, { skipDataChange: false });
    }
}

async function handleBuffReboundFortify(c, entry) {
    c.isPaused = true;
    window.bulletTimeActive = true;
    await showBuffBanner('🛡️ 严阵以待！');
    window.bulletTimeActive = false;
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
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';document.getElementById('log').appendChild(div);c.autoScrollLog();
    await new Promise(r=>setTimeout(r, window._fastForwardActive ? 1 : c.speed/2));
}

async function handleAttackGroup(c, entry, roundResult, abortSig, isFirstAttackRef) {
    if (entry.isCombo) { let spacer = document.createElement('div'); spacer.innerHTML = '<br>'; document.getElementById('log').appendChild(spacer); c.autoScrollLog(); c.isPaused = true; window.bulletTimeActive = true; if (c._scheduler) { await new Promise(r => c._scheduler.schedule('banner', 1500, r)); showBuffBanner('⚡ 连击！'); } else { await showBuffBanner('⚡ 连击！'); } window.bulletTimeActive = false; c.isPaused = false; }
    let unitA=c.UI.allyTeam.concat(c.UI.enemyTeam).find(u=>u.uid===entry.uidA);
    let unitD=entry.uidD?c.UI.allyTeam.concat(c.UI.enemyTeam).find(u=>u.uid===entry.uidD):null;
    if(!entry.isBlock&&!entry.isMiss&&!entry.isDodge&&(!unitA||!unitD)){
        let fallbackDiv = document.createElement('div');
        let attackerName = entry.uidA || '未知';
        let defenderName = entry.uidD || '未知';
        fallbackDiv.innerHTML = `<span class="gray">${attackerName} 攻击 ${defenderName}，但目标已不存在</span><br>`;
        document.getElementById('log').appendChild(fallbackDiv);
        c.autoScrollLog();
    }
    if(unitA&&!entry.isBlock){
        const flashType = entry.isDodge ? 'defend' : 'attack';
        // 苦练特效：在飞撞前单独播放，让玩家看清楚
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
    // 近战攻击：闪光保留时间覆盖飞撞动画+展示时间（800+900+800+1000=3500ms）
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

    if (entry.isDodge && unitA && unitD) { if (c.dodgeEffectEnabled) { let reboundDmg = Math.floor((unitA.atk + unitA.def) * 0.5); c.isPaused = true; window.bulletTimeActive = true; await showCriticalBanner('✨闪避反击✨'); await showDodgeBulletTime(unitD, unitA, reboundDmg); window.bulletTimeActive = false; c.isPaused = false; } else { showDodgeBubble(unitA, '闪避！'); } }

    let lastDiv=null,healDiv=null, blockDelay=false;
    for(let entry2 of textEntries){
        if(abortSig&&abortSig.aborted){if(atkTimer)clearTimeout(atkTimer);if(defTimer)clearTimeout(defTimer);return { isBattleOver: false };}
        if(!c.detailMode&&entry2.type==='detail'){ let hiddenDiv=document.createElement('div'); hiddenDiv.className='detail-hidden'; hiddenDiv.innerHTML=entry2.text+'<br>'; document.getElementById('log').appendChild(hiddenDiv); c.autoScrollLog(); continue; }
        if(entry2.type==='damage-text'){ lastDiv=document.createElement('div'); document.getElementById('log').appendChild(lastDiv); await playLineText(entry2.text,lastDiv, Math.max(c.speed || 1000, 1000)); }
        else if(entry2.isHealEntry && entry.isDead){ healDiv=document.createElement('div'); document.getElementById('log').appendChild(healDiv); await playLineText(entry2.text,healDiv); }
        else{
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
            // 处理来自衍生技的治疗条目
            if (entry2.isHealEntry && !entry2.isDead && entry2.healUnitUid) {
                let healUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry2.healUnitUid);
                if (healUnit && entry2.healAmount) {
                    showHealFloat(healUnit, entry2.healAmount);
                }
            }
            // 乾坤衍生加攻弹幕
            if (entry2.text && entry2.text.includes('🦋 乾坤衍生') && entry2.text.includes('攻击+')) {
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
            if(entry.isBlock&&entry2.text&&entry2.text.includes('休息回复20点生命')&&unitA){c.store.dispatch({ type: 'SET_VISUAL', uid: unitA.uid, _resting: true });blockDelay = true; showHealFloat(unitA, entry.healAmount || 10);}
            const currentSpeed = c.speed || 1000;
            // 重要文本（战斗行、伤害行）：加速保底常速，减速跟随
            // 次要文本（波动、计算等）：完全跟随倍速，并整体加速
            const isImportant = (entry2.type === 'combat-text' || entry2.type === 'damage-text');
            const forcedSpeed = isImportant
                ? Math.max(currentSpeed, 600)
                : Math.floor(currentSpeed * 0.8);
            let tempDiv=document.createElement('div'); document.getElementById('log').appendChild(tempDiv); await playLineText(entry2.text, tempDiv, forcedSpeed);
            if (!c.userScrolled) document.getElementById('log').scrollTop = document.getElementById('log').scrollHeight;
            // 波动行和计算行之间加间隔，防止连续冲击
            if (entry2.type === 'detail' || entry2.type === 'info' || entry2.type === 'buff-bonus' || entry2.type === 'buff-splash') {
                await new Promise(r => setTimeout(r, 120));
            }
        }
    }
    if(blockDelay) await new Promise(r=>setTimeout(r, GlobalStore.get('fastForwardActive') ? 1 : c.speed/2));
    if (entry.isDead && lastDiv && !entry.isBlock && !entry.isMiss && !entry.isDodge) { applyBrushEffect(lastDiv); }
    if(entry.isDodge&&unitA)showDodgeBubble(unitA,'闪避！'); if(entry.isMiss&&unitA)showDodgeBubble(unitA,'未命中');
    if(unitD&&entry.hpPctAfter!==undefined&&entry.hpPctBefore!==undefined){ if(entry.hpPctBefore>40&&entry.hpPctAfter<=40&&entry.hpPctAfter>20){let t=(unitD.camp==='ally'?'不好，必须反击了！':'小儿安敢伤我！');safeShowDanmaku(unitD,t);} else if(entry.hpPctBefore>20&&entry.hpPctAfter<=20){let t=(unitD.camp==='ally'?'撑住！':'已是强弩之末！');safeShowDanmaku(unitD,t);} }
    await new Promise(r=>setTimeout(r,offset)); await c.waitWhilePaused();
    if(defTimer)clearTimeout(defTimer);
    if(unitA && !unitA._isDead){c.store.dispatch({ type: 'CLEAR_UNIT_FLASH', uid: unitA.uid }); if (!entry.isDodge) { c.store.dispatch({ type: 'SET_VISUAL', uid: unitA.uid, _acted: true }); }}
    if(unitD && !entry.isDodge && !entry.isMiss && !entry.isDead && !unitD._isDead) c.store.dispatch({ type: 'CLEAR_UNIT_FLASH', uid: unitD.uid });
    if (c.UI && c.UI.allyTeam && c.UI.enemyTeam) {
        c.UI.allyTeam.concat(c.UI.enemyTeam).forEach(u => { if (u.alive) { const su = c.store ? c.store.getState().units.find(s => s.uid === u.uid) : null; if (!su || !su._flyMode) { let blocked = isBlocked(u, u.camp === 'ally' ? c.UI.allyTeam : c.UI.enemyTeam); c.store.dispatch({ type: 'SET_VISUAL', uid: u.uid, _blocked: blocked }); } } });
    }
    document.getElementById('roundDisplay').innerText = `📜 日志（第${c.UI.round}回合）`;

    // ★ 不在此处应用事件，交给外层统一处理以保证动画→数据时序
    // 事件快照存入 entry._pendingEvents，由 playLogEntries 在动画完成后 apply

    if(entry.isDead&&(c.UI.allyTeam.every(ch=>!ch.alive)||c.UI.enemyTeam.every(ch=>!ch.alive))){ return { isBattleOver: true }; }
    return { isBattleOver: false };
}

async function handleInfo(c, entry) {
    // ★ 快速条目：白骨爪附带效果，直接显示不逐字播放
    if (entry.fastEntry) {
        let tempDiv = document.createElement('div');
        document.getElementById('log').appendChild(tempDiv);
        tempDiv.innerHTML = entry.text + '<br>';
        c.autoScrollLog();
        document.getElementById('roundDisplay').innerText = `📜 日志（第${c.UI.round}回合）`;
        return;
    }

    // 🦋🕷️ 蝶蛛特效触发（兼容单文件构建：优先 window 全局，回退动态 import）
    async function getButterflyFx(name) {
        if (window[name]) return window[name];
        const mod = await import('../fx/21fx-butterfly-spider.js');
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
                const host = c.UI.allyTeam?.find(u => u.uid === sister._butterflyHost);
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
                // 立即清除飞天状态，让格子在蜘蛛落下瞬间恢复
                c.store.dispatch({ type: 'SET_VISUAL', uid: brother.uid, _flyMode: null, _acted: false });
                const showSpiderDescend = await getButterflyFx('showSpiderDescend');
                showSpiderDescend(brother);
            }
        }
    }

    if(entry.isZhangSwitch&&entry.unit){ let zhangUnit = c.UI.allyTeam.find(u => u.isZhang); let sepDiv=document.createElement('div');sepDiv.innerHTML='<span class="separator">- - - - -</span><br>'; document.getElementById('log').appendChild(sepDiv); c.autoScrollLog(); let tempDiv=document.createElement('div');document.getElementById('log').appendChild(tempDiv); await playLineText(entry.text,tempDiv); if(zhangUnit) { c.store.dispatch({ type: 'SET_VISUAL', uid: zhangUnit.uid, _resting: false }); safeShowDanmaku(zhangUnit, '不好，要顶上去了！'); } }
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
            // 新婚掉血飘字
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
        // 小昭衍生技：加攻弹幕（延迟于治疗数字）
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
        // 白骨爪触发的乾坤衍生加攻弹幕
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
                c.isPaused = true;
                window.bulletTimeActive = true;
                const { showSpiderStrike } = await import('../fx/21fx-butterfly-spider.js');
                await showSpiderStrike(spiderUnit, strikeTarget);
                if (entry.text && entry.isDead && strikeTarget && c.store) {
                    c.store.dispatch({ type: 'SET_FLASH', uid: strikeTarget.uid, flash: 'dead' });
                    c.store.dispatch({ type: 'SET_VISUAL', uid: strikeTarget.uid, _isDead: true });
                }
                await new Promise(r => setTimeout(r, 1800));
                window.bulletTimeActive = false;
                c.isPaused = false;
            }
        }

        if (entry.isClawHit && entry.clawAttackerUid && entry.clawTargetUid) {
            let attacker = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.clawAttackerUid);
            let target = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.clawTargetUid);
            // 白骨爪飘字
            if (target && entry.text) {
                let dmgMatch = entry.text.match(/造成 (\d+) 点伤害/);
                if (dmgMatch) showDamageFloat(target, parseInt(dmgMatch[1]));
            }
            if (attacker && target) {
                showBoneClaw(attacker, target, c.speed, () => c.isPaused, null, { isExecute: entry.isExecute });
            }
            // 立即应用白骨爪事件，每击单独刷新血量
            if (entry._events && entry._events.length > 0) {
                c.store.dispatch({ type: 'APPLY_EVENTS', events: entry._events });
            }
        }
        let tempDiv=document.createElement('div');document.getElementById('log').appendChild(tempDiv); await playLineText(entry.text,tempDiv);
    }
    document.getElementById('roundDisplay').innerText = `📜 日志（第${c.UI.round}回合）`;
}

async function handleRoundStart(c, entry, isFirstAttackRef) {
    c.UI.round = parseInt(entry.text.match(/\d+/)[0])||1;
    if (isFirstAttackRef) isFirstAttackRef.value = true;
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';document.getElementById('log').appendChild(div);c.autoScrollLog();
    document.getElementById('roundDisplay').innerText = `📜 日志（第${c.UI.round}回合）`;
    await new Promise(r=>setTimeout(r, window._fastForwardActive ? 1 : c.speed/3));
    c.updateUI(c.UI);
}

async function handleRoundEnd(c, entry, log, i) {
    let div=document.createElement('div');div.innerHTML=entry.text + '<br>';document.getElementById('log').appendChild(div); c.autoScrollLog(); document.getElementById('roundDisplay').innerText = `📜 日志（第${c.UI.round}回合）`;
    if (c.updateBuffSlots) { c.updateBuffSlots(); }
    if (window._refreshGlowCells) window._refreshGlowCells();
    await new Promise(r=>setTimeout(r,c.speed/3));
}

function shouldStartNewGroup(entry, lastType) {
    if (!lastType) return false;
    if (lastType === 'round-end') return false;
    if (lastType === 'round-start') return false;
    if (entry.type === 'round-end') return false;
    if (entry.type === 'round-start') return false;
    if (lastType === 'attack-group' && entry.type === 'attack-group') return true;
    if (lastType === 'attack-group' && entry.type === 'info' && !entry.isDoubleStrikeBanner) return true;
    // buff-bonus/buff-splash 是攻击触发的效果，与攻击者之间不需要分隔符
    if (lastType === 'attack-group' && (entry.type === 'buff-bonus' || entry.type === 'buff-splash')) return false;
    if (lastType === 'attack-group' && entry.type !== 'attack-group' && entry.type !== 'info') return true;
    if (lastType !== 'attack-group' && entry.type === 'attack-group') return true;
    return false;
}

export async function playLogEntries(c, log, roundResult, isFirstAttackRef) {
    let abortSig = c.abortController ? c.abortController.signal : null;
    let lastEntryType = c._lastLogType || null;

    try {
        for (let i = 0; i < log.length; i++) {
            if (abortSig && abortSig.aborted) return { isBattleOver: false };
            await c.waitWhilePaused();
            let entry = log[i];

            if (shouldStartNewGroup(entry, lastEntryType)) {
                let sepDiv = document.createElement('div');
                sepDiv.innerHTML = '<span class="separator">- - - - -</span><br>';
                document.getElementById('log').appendChild(sepDiv);
                c.autoScrollLog();
            }

            switch (entry.type) {
                case 'info':
                    if (entry.text && entry.text.includes('🔥 圣火令掉落')) {
                        await handleHolyTokenDrop(c, entry);
                        lastEntryType = entry.type;
                        break;
                    }
                    await handleInfo(c, entry);
                    lastEntryType = entry.type;
                    break;
                case 'buff-summon':
                    await handleBuffSummon(c, entry, i > 0 ? log[i-1] : null);
                    lastEntryType = entry.type;
                    break;
                case 'buff-destroy':
                    await handleBuffDestroy(c, entry, i > 0 ? log[i-1] : null);
                    lastEntryType = entry.type;
                    break;
                case 'buff-leech':
                    if (entry.buffType === 'hotBlood') {
                        let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
                        document.getElementById('log').appendChild(div);c.autoScrollLog();
                        let healUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.healUnitUid);
                        if (healUnit && entry.healAmount) {
                            showHealFloat(healUnit, entry.healAmount);
                        }
                        c.isPaused = true; window.bulletTimeActive = true;
                        let bannerText = entry.text.includes('翻倍') ? '❤️‍🔥 热血奋战(翻倍)！' : '❤️ 热血奋战！';
                        await showBuffBanner(bannerText);
                        window.bulletTimeActive = false; c.isPaused = false;
                    } else {
                        await handleBuffLeech(c, entry);
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
                            if (targetUnit) {
                                // 流星赶月溅射掉血字幕延迟0.15s，让分裂箭飞完再飘
                                if (entry.buffType === 'meteor_splash') {
                                    setTimeout(() => showDamageFloat(targetUnit, entry.splashDmg), 150);
                                } else {
                                    showDamageFloat(targetUnit, entry.splashDmg);
                                }
                            }
                        });
                    }
                    if (entry.buffType === 'meteor_splash') await new Promise(r=>setTimeout(r, window._fastForwardActive ? 1 : 600));
                    c.isPaused = false;
                    lastEntryType = entry.type;
                    break;
                case 'buff-bonus':           await handleBuffBonus(c, entry); lastEntryType = entry.type; break;
                case 'buff-swap':            await handleBuffSwap(c, entry); lastEntryType = entry.type; break;
                case 'buff-push':            await handleBuffPush(c, entry); lastEntryType = entry.type; break;
                case 'buff-summary':         { let div2=document.createElement('div');div2.innerHTML=entry.text+'<br>';document.getElementById('log').appendChild(div2);c.autoScrollLog(); if(entry.buffType==='elite_xingfen'){let song=c.UI.allyTeam.concat(c.UI.enemyTeam).find(u=>u.name==='宋青书');if(song)c.store.dispatch({type:'SET_VISUAL',uid:song.uid,_hasXingFen:true});} lastEntryType = entry.type; } break;
                case 'buff-rebound-fortify': await handleBuffReboundFortify(c, entry); lastEntryType = entry.type; break;
                case 'round-start':
                    // 重置所有单位的已行动状态
                    c.UI.allyTeam.forEach(u => { if (u.alive) c.store.dispatch({ type: 'SET_VISUAL', uid: u.uid, _acted: false }); });
                    c.UI.enemyTeam.forEach(u => { if (u.alive) c.store.dispatch({ type: 'SET_VISUAL', uid: u.uid, _acted: false }); });
                    // 先应用回合开始事件，再渲染 UI，避免 buffDefBonus 等延迟一帧
                    if (roundResult && roundResult.events && roundResult.events.length > 0) {
                        c.store.dispatch({ type: 'APPLY_EVENTS', events: roundResult.events });
                        roundResult.events = [];
                    }
                    await handleRoundStart(c, entry, isFirstAttackRef);
                    if (roundResult && roundResult.doubleStrikeUid) {
                        c.currentDoubleStrikeUid = roundResult.doubleStrikeUid;
                    }
                    c.updateUI(c.UI);
                    lastEntryType = entry.type;
                    break;
                case 'attack-group': {
                    let result = await handleAttackGroup(c, entry, roundResult, abortSig, isFirstAttackRef);
                    // 动画完成后立即应用本组事件，保证血量在下一个 attack-group 开始前已同步
                    if (entry._events && entry._events.length > 0) {
                        c.store.dispatch({ type: 'APPLY_EVENTS', events: entry._events });
                    }
                    lastEntryType = entry.type;
                    if (result && result.isBattleOver) return result;
                    break;
                }
                case 'info':
                    if (entry.text && entry.text.includes('🔥 圣火令掉落')) {
                        await handleHolyTokenDrop(c, entry);
                        lastEntryType = entry.type;
                        break;
                    }
                    await handleInfo(c, entry);
                    lastEntryType = entry.type;
                    break;
                case 'round-end': await handleRoundEnd(c, entry, log, i); lastEntryType = entry.type; break;
            }

            if (abortSig && abortSig.aborted) return { isBattleOver: false };
        }
    } catch (e) {
        window.bulletTimeActive = false;
        console.error('playLogEntries 错误:', e);
        return { isBattleOver: false };
    }
    c._lastLogType = lastEntryType;
    return { isBattleOver: false };
}

export async function playBattle() {
    const c = getCtx();
    if (!c || !c.snapshot || !c.snapshot.ally || !c.snapshot.ally.length) return;
    const scheduler = new AnimationScheduler();
    c._scheduler = scheduler;

    GlobalStore.effect('fastForwardActive', (isActive) => {
        if (isActive) {
            if (!c._originalSpeed) c._originalSpeed = c.speed;
            c.speed = 1;
            if (c._scheduler && c._scheduler.setSpeed) c._scheduler.setSpeed(50);
        } else {
            c.speed = c._originalSpeed || 500;
            if (c._scheduler && c._scheduler.setSpeed) c._scheduler.setSpeed(1);
        }
    });

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
    c._battleEnded = false;

    const initialUnits = [
        ...c.snapshot.ally.map(u => { let u2 = u.clone(); u2.hp = u2.maxHp; u2.alive = true; u2._isDead = false; u2._flash = null; u2._acted = false; u2._resting = false; u2._blocked = false; u2.camp = 'ally'; return u2; }),
        ...c.snapshot.enemy.map(u => { let u2 = u.clone(); u2.hp = u2.maxHp; u2.alive = true; u2._isDead = false; u2._flash = null; u2._acted = false; u2._resting = false; u2._blocked = false; u2.camp = 'enemy'; return u2; })
    ];
    c.store = createStore({ units: initialUnits, round: 1 }, battleReducer);
    GlobalStore.set('battleStore', c.store);
    setRenderStore(c.store);
    updateUI();

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
            if (su._flyMode !== undefined) uiUnit._flyMode = su._flyMode;
            if (su._butterflyHost !== undefined) uiUnit._butterflyHost = su._butterflyHost;
            if (su._phantomTarget !== undefined) uiUnit._phantomTarget = su._phantomTarget;
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

        // 死亡后保留 3 秒展示特效，然后移除
        if (!c._deathTimers) c._deathTimers = {};
        for (const su of state.units) {
            if ((su._isDead || su.alive === false) && !c._deathTimers[su.uid]) {
                c._deathTimers[su.uid] = true;
                const uid = su.uid;
                setTimeout(() => {
                    if (!c._deadUnitsForReport) c._deadUnitsForReport = [];
                    const dead = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === uid);
                    if (dead && !c._deadUnitsForReport.find(u => u.uid === uid)) {
                        c._deadUnitsForReport.push({...dead});
                    }
                    delete c._deathTimers[uid];
                    if (c.store) c.store.dispatch({ type: 'REMOVE_UNIT', uid: uid });
                }, 3000);
            }
        }
    });

    c.UI.allyTeam = initialUnits.filter(u => u.camp === 'ally').map(u => u.clone());
    c.UI.enemyTeam = initialUnits.filter(u => u.camp === 'enemy').map(u => u.clone());
    c._deadUnitsForReport = [];
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
        let threshold = 50;
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

    let battleState = { ally: c.snapshot.ally.map(u => u.clone()), enemy: c.snapshot.enemy.map(u => u.clone()), round: 1, activeBuffs: c.activeBuffs ? c.activeBuffs.map(b => ({...b})) : [], allAllies: c.snapshot.ally.map(u => u.clone()) };
    if (c.activeBuffs && c.activeBuffs.some(b => b.key === 'horseFormation') && !battleState.activeBuffs.some(b => b.key === 'horseFormation')) {
        const hb = c.activeBuffs.find(b => b.key === 'horseFormation');
        battleState.activeBuffs.push({...hb});
    }
    let isBattleOver = false; let finalWinner = null; let finalStep = null;

    while (!isBattleOver) {
        if (abortSig && abortSig.aborted) return;

        const isFirstAttackRef = { value: true };
        const stepper = createRoundStepper(battleState);
        let lastStep = null;

        for (const step of stepper) {
            if (abortSig && abortSig.aborted) return;
            await c.waitWhilePaused();
            lastStep = step;

            // Store 初始数据已在 createStore 时用快照设置，
            // 后续所有血量变化统一由 APPLY_EVENTS 驱动，不再提前同步

            await playLogEntries(c, step.log, step, isFirstAttackRef);

            // 回合级事件（玄冥毒/拒马召唤/加攻等）在攻击组之后应用
            if (step.events && step.events.length > 0) {
                c.store.dispatch({ type: 'APPLY_EVENTS', events: step.events });
            }

            await new Promise(r => setTimeout(r, window._fastForwardActive ? 1 : Math.max(100, c.speed / 2)));

            if (step.winner) {
                finalWinner = step.winner;
                isBattleOver = true;
                break;
            }
        }

        if (isBattleOver) { finalStep = lastStep; break; }

        let nextActiveBuffs = c.activeBuffs ? c.activeBuffs.map(b => ({...b, remaining: b.remaining - 1})).filter(b => b.remaining > 0) : [];
        c.activeBuffs = nextActiveBuffs;
        if (c.updateBuffSlots) c.updateBuffSlots();
        if (!window._fastForwardActive && battleState.round % 3 === 0 && battleState.round > 0) {
            const mainCtx2 = window._getPlayerContext ? window._getPlayerContext() : null;
            const isFullAuto = mainCtx2 && mainCtx2.autoLevel === 'full-auto';
            let promDiv = document.createElement('div'); promDiv.innerHTML = `<span class="gold">✨ 请选择新的Buff（持续${CONFIG.BUFF_DURATION || 4}回合）</span><br>`; logDiv.appendChild(promDiv); c.autoScrollLog();
            let newBuff = null;
            if (isFullAuto) {
                const allKeys = Object.keys(CONFIG.BUFFS);
                const existing = (nextActiveBuffs || []).map(b => b.key);
                const allyTeam = c.UI?.allyTeam || [];
                let available = allKeys.filter(k => {
                    if (existing.includes(k)) return false;
                    const requiredRole = CONFIG.BUFF_ROLE_REQUIREMENTS?.[k];
                    if (requiredRole && !allyTeam.some(u => u.alive && u.role === requiredRole)) return false;
                    return true;
                });
                if (available.length > 0) {
                    const pick = available[Math.floor(Math.random() * available.length)];
                    const duration = CONFIG.BUFFS[pick].duration || CONFIG.BUFF_DURATION || 4;
                    newBuff = { key: pick, target: 'ally', remaining: duration, name: CONFIG.BUFFS[pick].name };
                    // 小昭永久海克斯存储
                    if (c.UI && c.UI.allyTeam) {
                        const xiaoZhao = c.UI.allyTeam.find(u => u.isXiaoZhaoBrother);
                        if (xiaoZhao) {
                            if (!xiaoZhao._permanentBuffs) xiaoZhao._permanentBuffs = [];
                            xiaoZhao._permanentBuffs.push({ ...newBuff, remaining: Infinity });
                        }
                    }
                    if (pick === 'holyFlame') {
                        newBuff.col = Math.floor(Math.random() * 3) + 1;
                        newBuff.row = Math.floor(Math.random() * 3) + 1;
                    }
                }
                promDiv.innerHTML = `<span class="gold">🤖 全自动选择Buff：${newBuff ? newBuff.name : '无'}</span><br>`;
            } else {
                c.isPaused = true;
                newBuff = await showBuffPopup(c);
            }
            if (newBuff) {
                // 小昭永久海克斯

                nextActiveBuffs = [...(nextActiveBuffs || []), newBuff];
                let msgDiv = document.createElement('div'); msgDiv.innerHTML = `<span class="gold">✨ 获得Buff：${newBuff.name}（持续${newBuff.remaining}回合）</span><br>`; logDiv.appendChild(msgDiv); c.autoScrollLog();
                let mainCtx = window._getPlayerContext ? window._getPlayerContext() : null;
                if (mainCtx) { mainCtx.activeBuffs = nextActiveBuffs; if (mainCtx.updateBuffSlots) mainCtx.updateBuffSlots(); }
            }
            c.isPaused = false;
        }

        battleState = { ally: lastStep.ally, enemy: lastStep.enemy, round: battleState.round + 1, activeBuffs: nextActiveBuffs, allAllies: battleState.allAllies };

        if (c.autoMode || window._fastForwardActive) {
            await new Promise(r=>setTimeout(r, window._fastForwardActive ? 1 : c.speed/2));
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
    GlobalStore.set('fastForwardActive', false);
    c.updateButtons(); c.enableAllButtons();

    let winner = finalWinner;
    if (winner === '明教' && c.currentStage) {
        const stage = c.currentStage;
        const killRate = [0, 1.5, 2, 2.5, 4, 5.5, 6][stage] / 100;
        const clearRate = stage === 5 ? killRate * 6 : killRate * 5;
        if (Math.random() < clearRate) {
            const currentToken = GlobalStore.get('holyToken') || 0;
            GlobalStore.set('holyToken', currentToken + 1);
            localStorage.setItem('ming_holy_token_5v5_test', String(currentToken + 1));
            logDiv.innerHTML += `<span class="gold">🔥 通关奖励：获得1枚圣火令！当前总数：${currentToken + 1}</span><br>`;
            logDiv.scrollTop = logDiv.scrollHeight;
        }
    }
    // 宝箱通关掉落
    if (winner === '明教' && c.currentStage) {
        const chestClearRate = 1 / 100;
        if (Math.random() < chestClearRate) {
            let chests = parseInt(localStorage.getItem('ming_chest_count') || '0');
            chests++;
            localStorage.setItem('ming_chest_count', String(chests));
            GlobalStore.set('chestCount', chests);
            logDiv.innerHTML += `<span class="gold">🎁 通关宝箱：获得1个宝箱！当前总数：${chests}</span><br>`;
            logDiv.scrollTop = logDiv.scrollHeight;
        }
    }
    if (winner === '明教' || winner === '六大派') {
        let deadAllies = (c._deadUnitsForReport || []).filter(u => u.camp === 'ally');
        let deadEnemies = (c._deadUnitsForReport || []).filter(u => u.camp === 'enemy');
        let reportAllies = [...c.UI.allyTeam, ...deadAllies].filter((u, i, arr) => arr.findIndex(v => v.uid === u.uid) === i);
        let reportEnemies = [...c.UI.enemyTeam, ...deadEnemies].filter((u, i, arr) => arr.findIndex(v => v.uid === u.uid) === i);
        c.battleResultForInfo = { winner, ally: reportAllies, enemy: reportEnemies };

        const winState = finalStep ? (winner === '明教' ? finalStep.ally : finalStep.enemy) : null;
        if (winState && c.store) {
            for (const su of winState) {
                c.store.dispatch({ type: 'SYNC_UNIT', uid: su.uid, fields: { hp: su.hp, alive: su.alive, _isDead: !su.alive } });
            }
        }

        let aliveUnits = winState ? winState.filter(u => u.alive) : [];
        if (aliveUnits.length > 0) {
            aliveUnits.forEach(u => { c.store.dispatch({ type: 'SET_FLASH', uid: u.uid, flash: 'cheer' }); });
            await new Promise(r => setTimeout(r, window._fastForwardActive ? 100 : 800));
            if (c.spawnVictoryEffects) c.spawnVictoryEffects(winner, aliveUnits);
        }
        let winColor = winner === '明教' ? 'blue' : 'orange';
        if (c.gs === 'GAMEOVER') logDiv.innerHTML += `<span class="gold">🎉🏆 <span class="${winColor}">${winner}</span>获得最终胜利！ 🏆🎉</span><br>`;
        logDiv.scrollTop = logDiv.scrollHeight;
        await new Promise(r => setTimeout(r, window._fastForwardActive ? 500 : 6000));
    } else {
        logDiv.innerHTML+='<span class="gray">🤝 平局！积分不变</span><br>';
        logDiv.scrollTop = logDiv.scrollHeight;
    }

    let mainCtx = window._getPlayerContext ? window._getPlayerContext() : null;
    if (mainCtx && mainCtx.activeBuffs) mainCtx.activeBuffs = [];
    if (mainCtx && mainCtx.updateBuffSlots) mainCtx.updateBuffSlots();
    if (window._updateGlowColors) window._updateGlowColors(-1);

    if (GlobalStore.get('voteChoice') && GlobalStore.get('voteChoice') !== 'skip' && winner !== '平局') {
        let correct = (GlobalStore.get('voteChoice') === winner), earnPoints = 0;
        if (correct) { earnPoints = GlobalStore.get('battleHasZhang') ? 3 : 2; }
        else { earnPoints = -1; }
        GlobalStore.set('voteScore', GlobalStore.get('voteScore') + earnPoints);
        localStorage.setItem('ming_vote_score_5v5_test', String(GlobalStore.get('voteScore')));
        const newScore = GlobalStore.get('voteScore');
const oldScoreStr = localStorage.getItem('ming_vote_score_5v5_test');
const oldScore = oldScoreStr ? parseInt(oldScoreStr, 10) : 0;

// 如果旧分数为 0（第一次玩），或者新分数大于等于旧分数，正常写入（加分或不变）
if (oldScore === 0 || newScore >= oldScore) {
    localStorage.setItem('ming_vote_score_5v5_test', newScore);
}
// 如果新分数小于旧分数，但下降幅度不超过 50，视为正常扣分，允许写入
else if (oldScore - newScore <= 50) {
    localStorage.setItem('ming_vote_score_5v5_test', newScore);
}
// 否则就是剧烈下降（异常重置），阻止写入，并打印调试信息
else {
    console.error(
        `🚨 阻止可疑积分覆盖：${oldScore} → ${newScore}，下降幅度过大，已忽略写入`,
        '\n调用栈:',
        new Error().stack
    );
    // 如果想在异常发生时中断执行以便调试，可以取消下面这行的注释：
    // debugger;
}
        let badge = document.getElementById('scoreBadge'), floatEl = document.createElement('span');
        floatEl.className = 'score-float'; floatEl.textContent = (earnPoints > 0 ? '+' : '') + earnPoints + '🏆';
        badge.appendChild(floatEl);
        setTimeout(() => { if (floatEl.parentNode) floatEl.parentNode.removeChild(floatEl); }, 3500);
        setTimeout(() => c.updateScoreBadge(), 3500);
        let voteMsg = correct ? `<span class="green">📊 你猜了${GlobalStore.get('voteChoice')}，正确！+${earnPoints}分！ 当前积分：${GlobalStore.get('voteScore')}</span>` : `<span class="red">📊 你猜了${GlobalStore.get('voteChoice')}，错误！-1分！当前积分：${GlobalStore.get('voteScore')}</span>`;
        if (c.gs === 'GAMEOVER') { logDiv.innerHTML += voteMsg + '<br>'; logDiv.scrollTop = logDiv.scrollHeight; }
    } else if (winner === '平局') {
        logDiv.innerHTML += '<span class="gray">📊 平局，积分不变，当前积分：' + GlobalStore.get('voteScore') + '</span><br>';
        logDiv.scrollTop = logDiv.scrollHeight;
    }
    GlobalStore.set('voteChoice', null);
    c._battleEnded = true;
    c.abortController = null;
    c.store = null;
}