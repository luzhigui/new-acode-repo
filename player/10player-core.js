// player/10player-core.js - 光明顶5v5 战斗播放器核心
// V4.0.0 | ~41141 bytes | 2026-07-05
export const VER = 'player/10player-core.js V4.0.0';

import { runBattleRound } from '../core/07battle-engine-5v5-test.js';
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

// ==================== 动画调度器 ====================
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
    clear(type) {
        this.tasks = this.tasks.filter(t => t.type !== type);
    }
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

// ==================== 响应式 Store ====================
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
        case 'INIT':
            return state;

        // ========== 核心：应用引擎事件快照 ==========
        case 'APPLY_EVENTS': {
            const events = action.events;
            if (!events || events.length === 0) return state;
            let next = state.units.map(u => ({ ...u }));
            for (const ev of events) {
                if (ev.eventType === 'hp-change' || ev.eventType === 'stat-bonus-change') {
                    const idx = next.findIndex(u => u.uid === ev.unitUid);
                    if (idx >= 0) {
                        const p = ev.payload;
                        // 覆盖所有引擎传递的字段（完整快照）
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
                        // 张无忌切换
                        if (ev.eventType === 'zhang-switch') {
                            next[idx].rangedForm = p.rangedForm !== undefined ? p.rangedForm : next[idx].rangedForm;
                            next[idx].role = p.role || next[idx].role;
                        }
                    }
                } else if (ev.eventType === 'unit-add') {
                    // 拒马生成
                    const p = ev.payload;
                    if (!next.find(u => u.uid === p.uid)) {
                        next.push({
                            uid: p.uid, name: p.name, role: p.role, camp: p.camp, pos: p.pos,
                            hp: p.hp, maxHp: p.maxHp, atk: p.atk, def: p.def, alive: p.alive,
                            isHorse: p.isHorse || false, _isDead: p._isDead || false,
                            dmgDealt: 0, dmgTaken: 0, healDone: 0, reboundDone: 0, leechDone: 0,
                            dodgeCount: 0, critCount: 0, survivedRounds: 0,
                            buffAtkBonus: 0, buffDefBonus: 0, buffDodgeBonus: 0, buffHpBonus: 0
                        });
                    }
                } else if (ev.eventType === 'unit-remove') {
                    const uid = ev.payload.uid;
                    next = next.filter(u => u.uid !== uid);
                }
            }
            return { ...state, units: next };
        }

        // 直接同步单位（用于 handleBuffLeech 等已直接修改 UI 对象的场景，兼容过渡）
        case 'SYNC_UNIT': {
            let next = state.units.map(u => {
                if (u.uid !== action.uid) return u;
                return { ...u, ...action.fields };
            });
            return { ...state, units: next };
        }

        // 添加单位（兼容旧代码，实际应通过 APPLY_EVENTS 的 unit-add 处理）
        case 'ADD_UNIT': {
            if (state.units.find(u => u.uid === action.unit.uid)) return state;
            return { ...state, units: [...state.units, action.unit] };
        }

        // 移除单位
        case 'REMOVE_UNIT': {
            return { ...state, units: state.units.filter(u => u.uid !== action.uid) };
        }

        // 回合开始时用引擎权威状态校准所有单位（防剧透 + 修正遗漏）
        case 'SYNC_FULL_STATE': {
            const allEngine = [...action.ally, ...action.enemy];
            let next = state.units.map(u => {
                const src = allEngine.find(s => s.uid === u.uid);
                if (!src) return u;
                return {
                    ...u,
                    hp: src.hp,
                    alive: src.alive,
                    maxHp: src.maxHp,
                    atk: src.atk,
                    def: src.def,
                    buffAtkBonus: src.buffAtkBonus || 0,
                    buffDefBonus: src.buffDefBonus || 0,
                    buffDodgeBonus: src.buffDodgeBonus || 0,
                    buffHpBonus: src.buffHpBonus || 0,
                    _isDead: !src.alive
                };
            });
            return { ...state, units: next };
        }

        default:
            return state;
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
    } else { c.updateUI(c.UI); }
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

// 核心攻击动画（纯视觉，不修改状态）
async function handleAttackGroup(c, entry, roundResult, abortSig, isFirstAttackInRoundRef) {
    if (entry.isCombo) { let spacer = document.createElement('div'); spacer.innerHTML = '<br>'; document.getElementById('log').appendChild(spacer); c.autoScrollLog(); c.isPaused = true; window.bulletTimeActive = true; if (c._scheduler) { await new Promise(r => c._scheduler.schedule('banner', 1500, r)); showBuffBanner('⚡ 连击！'); } else { await showBuffBanner('⚡ 连击！'); } window.bulletTimeActive = false; c.isPaused = false; }
    let unitA=c.UI.allyTeam.concat(c.UI.enemyTeam).find(u=>u.uid===entry.uidA);
    let unitD=entry.uidD?c.UI.allyTeam.concat(c.UI.enemyTeam).find(u=>u.uid===entry.uidD):null;
    if(!entry.isBlock&&!entry.isMiss&&!entry.isDodge&&(!unitA||!unitD))return { isBattleOver: false };
    if(!isFirstAttackInRoundRef.value && !entry.isCombo){ let sepDiv=document.createElement('div'); sepDiv.innerHTML='<span class="separator">- - - - -</span><br>'; document.getElementById('log').appendChild(sepDiv); c.autoScrollLog(); await new Promise(r=>setTimeout(r, c.speed/4)); }
    isFirstAttackInRoundRef.value=false;
    
    // 攻击闪光（视觉）
    if(unitA&&!entry.isBlock){
        unitA._flash='attack';c.updateUI(c.UI);
        if (unitD && unitD.role === '防战') {
            let defBuffs = (unitD.camp === 'ally' ? c.UI.allyTeam : c.UI.enemyTeam);
            defBuffs = defBuffs ? (defBuffs._activeBuffs || []) : [];
            if (defBuffs.some(b => b.key === 'fortify')) {
                c._scheduler.schedule('banner', Math.min(400, c.speed / 3), () => showBuffBanner('🛡️ 严阵以待！'));
            }
        }
        c._triggerFX(entry._fxSnapshot,unitA,unitD,entry.isDead,entry.isDodge,entry.isMiss,entry.isBlock,entry._dmg,entry.waveTaunt,entry.waveUnit,entry.unitRole);
        if (!entry.isBlock && !entry.isMiss && !entry.isDodge && unitA) {
            AudioManager.playSfx(unitA.role);
        }
    }
    
    // 日志逐行播放
    let textEntries=entry.entries,lineCount=textEntries.length, speedFactor=Math.max(c.speed,600)/1000, textDuration=c.speed*lineCount, offset=200*speedFactor, atkFlashDuration=textDuration+300*speedFactor, defFlashDuration=atkFlashDuration, deadDuration=entry.isDead?Math.max(2400*speedFactor,1500):0, atkTimer=null;
    if(unitA&&!entry.isBlock)atkTimer=setTimeout(async()=>{ await c.waitWhilePaused(); if(unitA){unitA._flash=null;unitA._acted=true;c.updateUI(c.UI);} },atkFlashDuration);
    await new Promise(r=>setTimeout(r,offset)); await c.waitWhilePaused();
    if(abortSig&&abortSig.aborted){if(atkTimer)clearTimeout(atkTimer);return { isBattleOver: false };}
    if(unitD&&!entry.isDodge&&!entry.isMiss){unitD._flash='defend';c.updateUI(c.UI);} let defTimer=null; if(unitD&&!entry.isDodge&&!entry.isMiss)defTimer=setTimeout(async()=>{ await c.waitWhilePaused(); if(unitD&&!entry.isDead){unitD._flash=null;c.updateUI(c.UI);} },defFlashDuration);
    
    // 闪避子弹时间
    if (entry.isDodge && unitA && unitD) { if (c.dodgeEffectEnabled) { let reboundDmg = Math.floor((unitD.atk + unitD.def) * 0.5); c.isPaused = true; window.bulletTimeActive = true; await showCriticalBanner('✨闪避反击✨'); await showDodgeBulletTime(unitA, unitD, reboundDmg); window.bulletTimeActive = false; c.isPaused = false; } else { showDodgeBubble(unitD, '闪避！'); } }
    if (entry.isDead && unitD) { if (defTimer) clearTimeout(defTimer); unitD._flash = 'dead'; unitD._isDead = true; c.updateUI(c.UI); }
    if (entry.isDodge && unitA && !unitA.alive) { unitA._flash = 'dead'; unitA._isDead = true; c.updateUI(c.UI); }
    
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
            if(entry.isBlock&&entry2.text&&entry2.text.includes('休息回复10点生命')&&unitA){unitA._resting = true;c.updateUI(c.UI);blockDelay = true;}
            let tempDiv=document.createElement('div'); document.getElementById('log').appendChild(tempDiv); await playLineText(entry2.text,tempDiv);
        }
    }
    if(blockDelay) await new Promise(r=>setTimeout(r, c.speed/2));
    c.updateUI(c.UI);
    if (entry.isDead && lastDiv && !entry.isBlock && !entry.isMiss && !entry.isDodge) { applyBrushEffect(lastDiv); }
    if(entry.isDodge&&unitD)showDodgeBubble(unitD,'闪避！'); if(entry.isMiss&&unitA)showDodgeBubble(unitA,'未命中');
    if(unitD&&entry.hpPctAfter!==undefined&&entry.hpPctBefore!==undefined){ if(entry.hpPctBefore>40&&entry.hpPctAfter<=40&&entry.hpPctAfter>20){let t=(unitD.camp==='ally'?'不好，必须反击了！':'小儿安敢伤我！');safeShowDanmaku(unitD,t);} else if(entry.hpPctBefore>20&&entry.hpPctAfter<=20){let t=(unitD.camp==='ally'?'撑住！':'已是强弩之末！');safeShowDanmaku(unitD,t);} }
    await new Promise(r=>setTimeout(r,offset)); await c.waitWhilePaused();
    if(atkTimer)clearTimeout(atkTimer); if(defTimer)clearTimeout(defTimer);
    if(unitA){unitA._flash=null;unitA._acted=true;} if(unitD&&!entry.isDodge&&!entry.isMiss&&!entry.isDead)unitD._flash=null;
    c.UI.allyTeam.concat(c.UI.enemyTeam).forEach(u => { if (u.alive) u._blocked = isBlocked(u, u.camp === 'ally' ? c.UI.allyTeam : c.UI.enemyTeam); });
    c.updateUI(c.UI);
    document.getElementById('roundDisplay').innerText = `📜 日志（第${c.UI.round}回合）`;
    // 死亡单位已立即设置 _isDead=true，此处不再重复设置
    if(entry.isDead&&(c.UI.allyTeam.every(ch=>!ch.alive)||c.UI.enemyTeam.every(ch=>!ch.alive))){ return { isBattleOver: true }; }
    c.updateUI(c.UI);
    return { isBattleOver: false };
}

async function handleInfo(c, entry) {
    if(entry.isZhangSwitch&&entry.unit){ let zhangUnit = c.UI.allyTeam.find(u => u.isZhang); let sepDiv=document.createElement('div');sepDiv.innerHTML='<span class="separator">- - - - -</span><br>'; document.getElementById('log').appendChild(sepDiv); c.autoScrollLog(); let tempDiv=document.createElement('div');document.getElementById('log').appendChild(tempDiv); await playLineText(entry.text,tempDiv); if(zhangUnit) { zhangUnit._resting = false; c.updateUI(c.UI); safeShowDanmaku(zhangUnit, '不好，要顶上去了！'); } }
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

async function handleRoundStart(c, entry, isFirstAttackInRoundRef) {
    c.UI.round = parseInt(entry.text.match(/\d+/)[0])||1;
    isFirstAttackInRoundRef.value=true;
    c.UI.allyTeam.concat(c.UI.enemyTeam).forEach(u=>{if(u.alive){u._acted=false;u._blocked=isBlocked(u, u.camp==='ally'?c.UI.allyTeam:c.UI.enemyTeam);u._resting = false;}});
    c.updateUI(c.UI);
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';document.getElementById('log').appendChild(div);c.autoScrollLog();
    document.getElementById('roundDisplay').innerText = `📜 日志（第${c.UI.round}回合）`;
    await new Promise(r=>setTimeout(r, c.speed/3));
}

async function handleRoundEnd(c, entry, log, i) {
    let hasSkill=log[i-1]&&log[i-1].type==='attack-group'&&log[i-1].entries.some(e=>e.type==='info'); if(!hasSkill){ let spacer=document.createElement('div');spacer.innerHTML='<br>';document.getElementById('log').appendChild(spacer);c.autoScrollLog(); }
    let div=document.createElement('div');div.innerHTML=entry.text + '<br>';document.getElementById('log').appendChild(div); c.autoScrollLog(); document.getElementById('roundDisplay').innerText = `📜 日志（第${c.UI.round}回合）`;
    if (c.tickBuffDurations) { c.tickBuffDurations(); c.updateBuffSlots(); }
    c.updateUI(c.UI);
    if (window._refreshGlowCells) window._refreshGlowCells();
    await new Promise(r=>setTimeout(r,c.speed/3));
}

// ==================== 主分发器（使用 Store 驱动） ====================

export async function playLogEntries(c, log, roundResult) {
    let abortSig = c.abortController ? c.abortController.signal : null;
    let isFirstAttackInRoundRef = { value: true };

    try {
        for (let i = 0; i < log.length; i++) {
            if (abortSig && abortSig.aborted) return { isBattleOver: false };
            await c.waitWhilePaused();
            let entry = log[i];



            switch (entry.type) {
                case 'buff-summon': {
                    await handleBuffSummon(c, entry, i > 0 ? log[i-1] : null);
                    const horse = c.UI.allyTeam.find(u => u.uid === entry.horseUid);
                    if (horse) c.store.dispatch({ type: 'ADD_UNIT', unit: horse.clone() });
                    break;
                }
                case 'buff-destroy':
                    await handleBuffDestroy(c, entry, i > 0 ? log[i-1] : null);
                    break;
                case 'buff-leech':
                    insertBuffSeparator(document.getElementById('log'), c);
                    if (entry.buffType === 'hotBlood') {
                        let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
                        document.getElementById('log').appendChild(div);c.autoScrollLog();
                        let healUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.healUnitUid);
                        if (healUnit && entry.healAmount) {
                            showHealFloat(healUnit, entry.healAmount);
                        }
                        if (entry.text.includes('翻倍')) {
                            c.isPaused = true; window.bulletTimeActive = true;
                            await showBuffBanner('❤️‍🔥 热血奋战(翻倍)！');
                            window.bulletTimeActive = false; c.isPaused = false;
                        }
                    } else {
                        await handleBuffLeech(c, entry);
                        // handleBuffLeech 可能直接修改了 UI，通过 sync 方式同步回 Store
                        if (entry.healUnitUid && entry.healAmount) {
                            let healed = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.healUnitUid);
                            if (healed) c.store.dispatch({ type: 'SYNC_UNIT', uid: entry.healUnitUid, fields: { hp: healed.hp, maxHp: healed.maxHp } });
                        }
                    }
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
                    break;
                case 'buff-bonus':           await handleBuffBonus(c, entry); break;
                case 'buff-swap':            await handleBuffSwap(c, entry); break;
                case 'buff-push':            await handleBuffPush(c, entry); break;
                case 'buff-summary':         { let div=document.createElement('div');div.innerHTML=entry.text+'<br>';document.getElementById('log').appendChild(div);c.autoScrollLog(); } break;
                case 'buff-rebound-fortify': await handleBuffReboundFortify(c, entry); break;
                case 'round-start':          await handleRoundStart(c, entry, isFirstAttackInRoundRef); break;
                case 'attack-group': {
                    let result = await handleAttackGroup(c, entry, roundResult, abortSig, isFirstAttackInRoundRef);
                    // 动画播完后再应用状态变更，避免UI提前显示
                    if (entry._events && entry._events.length > 0) {
                        c.store.dispatch({ type: 'APPLY_EVENTS', events: entry._events });
                    }
                    if (result && result.isBattleOver) return result;
                    break;
                }
                case 'info':  await handleInfo(c, entry); break;
                case 'round-end': await handleRoundEnd(c, entry, log, i); break;
            }

            if (abortSig && abortSig.aborted) return { isBattleOver: false };
        }
    } catch (e) {
        window.bulletTimeActive = false;
        const detail = e && e.stack ? e.stack : (e && e.message ? e.message : String(e));
        console.error('playLogEntries 错误:', detail);
        if (typeof appendErrorLog === 'function') {
            appendErrorLog('[ERROR] playLogEntries: ', detail);
        }
        return { isBattleOver: false };
    }
    return { isBattleOver: false };
}

export async function playBattle() {
    const c = getCtx();
    console.log('[诊断2] playBattle 入口, currentResult:', !!c?.UI?.currentResult);
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
        ...c.snapshot.ally.map(u => { let u2 = u.clone(); u2.hp = u2.maxHp; u2.alive = true; u2._isDead = false; u2.camp = 'ally'; return u2; }),
        ...c.snapshot.enemy.map(u => { let u2 = u.clone(); u2.hp = u2.maxHp; u2.alive = true; u2._isDead = false; u2.camp = 'enemy'; return u2; })
    ];
    c.store = createStore({ units: initialUnits, round: 1 }, battleReducer);

    // 订阅 Store 变化 → 同步到 c.UI 并刷新界面
    c.store.subscribe((state) => {
        if (!c.UI || !c.UI.allyTeam || !c.UI.enemyTeam) return;
        // 将 Store 中的单位状态同步回 UI 对象（保留 Unit 原型链的方法）
        const syncFields = (uiUnit) => {
            const su = state.units.find(u => u.uid === uiUnit.uid);
            if (!su) return;
            GAME_STATE_FIELDS.forEach(f => { if (su[f] !== undefined) uiUnit[f] = su[f]; });
            // 如果 Store 里标记为死亡，强制同步 _flash 为 'dead'，防止残留
            if (su._isDead && !uiUnit._isDead) {
                uiUnit._isDead = true;
                uiUnit._flash = 'dead';
            }
        };
        // 同步前保存视觉标记，防止被 Store 覆盖
        const allyFlash = c.UI.allyTeam.map(u => ({ uid: u.uid, _flash: u._flash, _isDead: u._isDead, _acted: u._acted, _resting: u._resting, _blocked: u._blocked }));
        const enemyFlash = c.UI.enemyTeam.map(u => ({ uid: u.uid, _flash: u._flash, _isDead: u._isDead, _acted: u._acted, _resting: u._resting, _blocked: u._blocked }));
        c.UI.allyTeam.forEach(syncFields);
        c.UI.enemyTeam.forEach(syncFields);
        // 恢复视觉标记（跳过已死亡的单位，保留其死亡特效）
        allyFlash.forEach(s => {
            const uiUnit = c.UI.allyTeam.find(u => u.uid === s.uid);
            if (uiUnit && !uiUnit._isDead) { uiUnit._flash = s._flash; uiUnit._acted = s._acted; uiUnit._resting = s._resting; uiUnit._blocked = s._blocked; }
        });
        enemyFlash.forEach(s => {
            const uiUnit = c.UI.enemyTeam.find(u => u.uid === s.uid);
            if (uiUnit && !uiUnit._isDead) { uiUnit._flash = s._flash; uiUnit._acted = s._acted; uiUnit._resting = s._resting; uiUnit._blocked = s._blocked; }
        });
        // 添加新单位（拒马等）
        state.units.forEach(su => {
            if (su.camp === 'ally' && !c.UI.allyTeam.find(u => u.uid === su.uid)) c.UI.allyTeam.push({...su});
            if (su.camp === 'enemy' && !c.UI.enemyTeam.find(u => u.uid === su.uid)) c.UI.enemyTeam.push({...su});
        });
        // 移除已销毁的单位
        c.UI.allyTeam = c.UI.allyTeam.filter(u => state.units.find(su => su.uid === u.uid));
        c.UI.enemyTeam = c.UI.enemyTeam.filter(u => state.units.find(su => su.uid === u.uid));
        c.updateUI(c.UI);
    });

    // 初始 UI 状态
    c.UI.allyTeam = initialUnits.filter(u => u.camp === 'ally').map(u => u.clone());
    c.UI.enemyTeam = initialUnits.filter(u => u.camp === 'enemy').map(u => u.clone());
    c.updateUI(c.UI);
    document.getElementById('roundDisplay').innerText = `📜 日志（第1回合）`;

    let logDiv = document.getElementById('log');
    let backToBottomBtn = document.createElement('div'); backToBottomBtn.id = 'backToBottomBtn'; backToBottomBtn.style.cssText = 'position:absolute;right:8px;bottom:60px;width:32px;height:32px;background:rgba(0,0,0,0.6);color:#ffd700;border-radius:50%;display:none;align-items:center;justify-content:center;font-size:18px;cursor:pointer;z-index:20;'; backToBottomBtn.innerHTML = '↓';
    backToBottomBtn.addEventListener('click', () => { logDiv.scrollTop = logDiv.scrollHeight; c.userScrolled = false; backToBottomBtn.style.display = 'none'; let mainCtx = window._getPlayerContext ? window._getPlayerContext() : c; if (mainCtx.manualSpeedLock) { mainCtx.slideSpeedActive = true; if (mainCtx.manualSpeedValue) { mainCtx.speed = mainCtx.manualSpeedValue; } if (mainCtx.updateSpeedButtons) mainCtx.updateSpeedButtons(); } });
    logDiv.parentElement.appendChild(backToBottomBtn);
    logDiv.addEventListener('scroll', () => { let threshold = 10; let distToBottom = logDiv.scrollHeight - logDiv.scrollTop - logDiv.clientHeight; let mainCtx = window._getPlayerContext ? window._getPlayerContext() : c; if (distToBottom > threshold) { c.userScrolled = true; backToBottomBtn.style.display = 'flex'; if (mainCtx.manualSpeedLock && mainCtx.slideSpeedActive) { mainCtx.slideSpeedActive = false; if (!c._originalSpeed && c.speed !== 1800) { c._originalSpeed = c.speed; c.speed = 1800; } if (mainCtx.updateSpeedButtons) mainCtx.updateSpeedButtons(); } } else { c.userScrolled = false; backToBottomBtn.style.display = 'none'; if (mainCtx.manualSpeedLock && !mainCtx.slideSpeedActive) { mainCtx.slideSpeedActive = true; if (c._originalSpeed) { c.speed = c._originalSpeed; c._originalSpeed = null; } if (mainCtx.updateSpeedButtons) mainCtx.updateSpeedButtons(); } } });

    let battleState = { ally: c.snapshot.ally.map(u => u.clone()), enemy: c.snapshot.enemy.map(u => u.clone()), round: 1, activeBuffs: c.activeBuffs || [] };
    let isBattleOver = false; let finalWinner = null;

    console.log('[诊断3] 进入播放循环, round:', battleState.round);
while (!isBattleOver) {
        if (abortSig && abortSig.aborted) return;
        let roundResult = runBattleRound(battleState);

        // 使用 Store 同步引擎权威状态（防剧透逻辑不变，但由 Reducer 处理）
        const startAlly = roundResult.ally.map(u => {
            const prev = c.UI.allyTeam.find(p => p.uid === u.uid) || u;
            if (u.hp > prev.hp || u.maxHp > prev.maxHp) {
                return { ...u, alive: prev.alive, _isDead: !prev.alive };
            }
            return { ...u, hp: prev.hp, alive: prev.alive, _isDead: !prev.alive };
        });
        const startEnemy = roundResult.enemy.map(u => {
            const prev = c.UI.enemyTeam.find(p => p.uid === u.uid) || u;
            if (u.hp > prev.hp || u.maxHp > prev.maxHp) {
                return { ...u, alive: prev.alive, _isDead: !prev.alive };
            }
            return { ...u, hp: prev.hp, alive: prev.alive, _isDead: !prev.alive };
        });
        c.store.dispatch({ type: 'SYNC_FULL_STATE', ally: startAlly, enemy: startEnemy });

        let mainCtx = window._getPlayerContext ? window._getPlayerContext() : null;
        if (mainCtx && roundResult.doubleStrikeUid !== undefined) mainCtx.currentDoubleStrikeUid = roundResult.doubleStrikeUid;

        let playResult = await playLogEntries(c, roundResult.log, roundResult);
        isBattleOver = playResult ? playResult.isBattleOver : false;
        if (roundResult.winner) { finalWinner = roundResult.winner; break; }
        if (isBattleOver) break;

        // 回合间 Buff 选择（手动弹窗）
        let nextActiveBuffs = roundResult.activeBuffs;
        if (battleState.round % 3 === 0 && battleState.round > 0) {
            let promDiv = document.createElement('div'); promDiv.innerHTML = `<span class="gold">✨ 请选择新的Buff（持续${CONFIG.BUFF_DURATION || 4}回合）</span><br>`; logDiv.appendChild(promDiv); c.autoScrollLog();
            c.isPaused = true;
            let newBuff = await showBuffPopup(c);
            if (newBuff) {
                nextActiveBuffs = [...(nextActiveBuffs || []), newBuff];
                let msgDiv = document.createElement('div'); msgDiv.innerHTML = `<span class="gold">✨ 获得Buff：${newBuff.name}（持续${newBuff.remaining}回合）</span><br>`; logDiv.appendChild(msgDiv); c.autoScrollLog();
                if (mainCtx) { mainCtx.activeBuffs = nextActiveBuffs; if (mainCtx.updateBuffSlots) mainCtx.updateBuffSlots(); }
            }
            c.isPaused = false;
        }

        battleState = { ally: roundResult.ally, enemy: roundResult.enemy, round: battleState.round + 1, activeBuffs: nextActiveBuffs };

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
            alive.forEach(u => { u._flash = 'cheer'; });
            c.updateUI(c.UI);
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

    c.UI.allyTeam.concat(c.UI.enemyTeam).forEach(u => { u._flash = null; });
    c.updateUI(c.UI);

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