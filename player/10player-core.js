// player/10player-core.js - 光明顶5v5 战斗播放器核心
// V4.4.0 | 2026-07-02 引入响应式 Store，状态与动画彻底分离，可靠的日志驱动状态更新
export const VER = 'player/10player-core.js V4.4.0';

import { runBattleRound } from '../core/07battle-engine-5v5-test.js';
import { isBlocked } from '../core/03battle-utils.js';
import { showDanmaku, showDamageFloat, showDodgeBubble, showHealFloat, applyBrushEffect, showBuffBanner, showCriticalBanner } from '../fx/15fx-common-5v5-test.js';
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

// ==================== 响应式 Store (移植自 realtime) ====================

// 游戏状态字段列表（store → UI 同步时只覆盖这些字段，视觉状态如 _flash/_acted 保留不动）
// 注意：必须包含 buff 加成字段，否则 carry 等 Buff 加成无法同步到 UI
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

        // 消费攻击条目内嵌的事件快照（hp-change 等），统一同步所有游戏状态字段
        case 'APPLY_EVENTS': {
            const events = action.events;
            if (!events || events.length === 0) return state;
            let next = state.units.map(u => ({ ...u }));
            for (const ev of events) {
                if (ev.eventType === 'hp-change') {
                    const idx = next.findIndex(u => u.uid === ev.unitUid);
                    if (idx >= 0) {
                        const p = ev.payload;
                        next[idx] = {
                            ...next[idx],
                            hp: p.hp,
                            maxHp: p.maxHp,
                            alive: p.alive,
                            atk: p.atk,
                            def: p.def,
                            _baseMaxHp: p.maxHp,
                            dmgDealt: p.dmgDealt || 0,
                            dmgTaken: p.dmgTaken || 0,
                            healDone: p.healDone || 0,
                            reboundDone: p.reboundDone || 0,
                            leechDone: p.leechDone || 0,
                            dodgeCount: p.dodgeCount || 0,
                            critCount: p.critCount || 0,
                            survivedRounds: p.survivedRounds || 0,
                            _isDead: !p.alive
                        };
                    }
                }
            }
            return { ...state, units: next };
        }

        // 回血（热血奋战等，Store 内部计算新 hp）
        case 'HEAL_UNIT': {
            let next = state.units.map(u => {
                if (u.uid !== action.uid) return u;
                return { ...u, hp: Math.min(u.maxHp, u.hp + action.amount) };
            });
            return { ...state, units: next };
        }

        // 直接同步某个单位的指定字段（用于 handleBuffLeech 等已直接修改 UI 的场景）
        case 'SYNC_UNIT': {
            let next = state.units.map(u => {
                if (u.uid !== action.uid) return u;
                return { ...u, ...action.fields };
            });
            return { ...state, units: next };
        }

        // 添加单位（拒马生成）
        case 'ADD_UNIT': {
            if (state.units.find(u => u.uid === action.unit.uid)) return state;
            return { ...state, units: [...state.units, action.unit] };
        }

        // 移除单位（拒马销毁）
        case 'REMOVE_UNIT': {
            return { ...state, units: state.units.filter(u => u.uid !== action.uid) };
        }

        // 回合开始时用引擎权威状态校准所有单位（防止剧透 + 修正遗漏）
        case 'SYNC_FULL_STATE': {
            const allEngine = [...action.ally, ...action.enemy];
            let next = state.units.map(u => {
                const src = allEngine.find(s => s.uid === u.uid);
                if (!src) return u;
                return {
                    ...u,
                    hp: src.hp,
                    alive: src.alive,
                    _isDead: !src.alive,
                    maxHp: src.maxHp,
                    atk: src.atk,
                    def: src.def,
                    role: src.role,
                    rangedForm: src.rangedForm,
                    pos: src.pos,
                    dmgDealt: src.dmgDealt || 0,
                    dmgTaken: src.dmgTaken || 0,
                    healDone: src.healDone || 0,
                };
            });
            return { ...state, units: next };
        }

        default:
            return state;
    }
}

// ==================== 核心：状态更新 ====================
// 原始的 applyLogStateToUI 已被 Store dispatch 替代，状态同步逻辑统一收敛到 battleReducer

// ==================== 纯视觉动画函数 ====================

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

async function handleAttackGroup(c, entry, roundResult, abortSig, isFirstAttackInRoundRef) {
    if (entry.isCombo) { let spacer = document.createElement('div'); spacer.innerHTML = '<br>'; document.getElementById('log').appendChild(spacer); c.autoScrollLog(); c.isPaused = true; window.bulletTimeActive = true; if (c._scheduler) { await new Promise(r => c._scheduler.schedule('banner', 1500, r)); showBuffBanner('⚡ 连击！'); } else { await showBuffBanner('⚡ 连击！'); } window.bulletTimeActive = false; c.isPaused = false; }
    let unitA=c.UI.allyTeam.concat(c.UI.enemyTeam).find(u=>u.uid===entry.uidA);
    let unitD=entry.uidD?c.UI.allyTeam.concat(c.UI.enemyTeam).find(u=>u.uid===entry.uidD):null;
    if(!entry.isBlock&&!entry.isMiss&&!entry.isDodge&&(!unitA||!unitD))return { isBattleOver: false };
    if(!isFirstAttackInRoundRef.value && !entry.isCombo){ let sepDiv=document.createElement('div'); sepDiv.innerHTML='<span class="separator">- - - - -</span><br>'; document.getElementById('log').appendChild(sepDiv); c.autoScrollLog(); await new Promise(r=>setTimeout(r, c.speed/4)); }
    isFirstAttackInRoundRef.value=false;
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
    let textEntries=entry.entries,lineCount=textEntries.length, speedFactor=Math.max(c.speed,600)/1000, textDuration=c.speed*lineCount, offset=200*speedFactor, atkFlashDuration=textDuration+300*speedFactor, defFlashDuration=atkFlashDuration, deadDuration=entry.isDead?Math.max(2400*speedFactor,600):0, atkTimer=null;
    if(unitA&&!entry.isBlock)atkTimer=setTimeout(async()=>{ await c.waitWhilePaused(); if(unitA){unitA._flash=null;unitA._acted=true;c.updateUI(c.UI);} },atkFlashDuration);
    await new Promise(r=>setTimeout(r,offset)); await c.waitWhilePaused();
    if(abortSig&&abortSig.aborted){if(atkTimer)clearTimeout(atkTimer);return { isBattleOver: false };}
    if(unitD&&!entry.isDodge&&!entry.isMiss){unitD._flash='defend';c.updateUI(c.UI);} let defTimer=null; if(unitD&&!entry.isDodge&&!entry.isMiss)defTimer=setTimeout(async()=>{ await c.waitWhilePaused(); if(unitD&&!entry.isDead){unitD._flash=null;c.updateUI(c.UI);} },defFlashDuration);
    if (entry.isDodge && unitA && unitD) { if (c.dodgeEffectEnabled) { let reboundDmg = Math.floor((unitD.atk + unitD.def) * 0.5); c.isPaused = true; window.bulletTimeActive = true; await showCriticalBanner('✨闪避反击✨'); await showDodgeBulletTime(unitA, unitD, reboundDmg); window.bulletTimeActive = false; c.isPaused = false; } else { showDodgeBubble(unitD, '闪避！'); } }
    if (entry.isDead && unitD) { if (defTimer) clearTimeout(defTimer); setTimeout(async () => { await c.waitWhilePaused(); if (unitD && !unitD.alive && unitD._flash !== 'dead') { unitD._flash = 'dead'; unitD._isDead = true; c.updateUI(c.UI); } }, 600); }
    if (entry.isDodge && unitA && !unitA.alive) { setTimeout(async () => { await c.waitWhilePaused(); if (unitA && !unitA.alive && unitA._flash !== 'dead') { unitA._flash = 'dead'; unitA._isDead = true; c.updateUI(c.UI); setTimeout(() => { unitA._isDead = true; c.updateUI(c.UI); }, 3500); } }, 600); }
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
    if(entry.isDead){ await new Promise(r=>setTimeout(r,deadDuration)); await c.waitWhilePaused(); if(unitD)setTimeout(()=>{unitD._isDead = true;c.updateUI(c.UI);},3500); }
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
    let div=document.createElement('div');div.innerHTML=entry.text;document.getElementById('log').appendChild(div); c.autoScrollLog(); document.getElementById('roundDisplay').innerText = `📜 日志（第${c.UI.round}回合）`;
    if (c.tickBuffDurations) { c.tickBuffDurations(); c.updateBuffSlots(); }
    c.updateUI(c.UI);
    if (window._refreshGlowCells) window._refreshGlowCells();
    await new Promise(r=>setTimeout(r,c.speed/3));
}

// ==================== 主分发器 ====================

export async function playLogEntries(c, log, roundResult) {
    let abortSig = c.abortController ? c.abortController.signal : null;
    let isFirstAttackInRoundRef = { value: true };

    try {
        for (let i = 0; i < log.length; i++) {
            if (abortSig && abortSig.aborted) return { isBattleOver: false };
            await c.waitWhilePaused();
            let entry = log[i];

            switch (entry.type) {
                case 'buff-summon':
                    await handleBuffSummon(c, entry, i > 0 ? log[i-1] : null);
                    // 同步拒马到 Store，订阅会自动处理 UI 去重
                    c.store.dispatch({ type: 'ADD_UNIT', unit: c.UI.allyTeam.find(u => u.uid === entry.horseUid) });
                    break;
                case 'buff-destroy':
                    await handleBuffDestroy(c, entry, i > 0 ? log[i-1] : null);
                    // 从 Store 移除拒马
                    c.store.dispatch({ type: 'REMOVE_UNIT', uid: entry.horseUid });
                    break;
                case 'buff-leech':
                    insertBuffSeparator(document.getElementById('log'), c);
                    if (entry.buffType === 'hotBlood') {
                        let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
                        document.getElementById('log').appendChild(div);c.autoScrollLog();
                        let healUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.healUnitUid);
                        if (healUnit && entry.healAmount) {
                            // 通过 Store dispatch 回血，订阅自动同步 UI
                            c.store.dispatch({ type: 'HEAL_UNIT', uid: entry.healUnitUid, amount: entry.healAmount });
                            showHealFloat(healUnit, entry.healAmount);
                        }
                        if (entry.text.includes('翻倍')) {
                            c.isPaused = true; window.bulletTimeActive = true;
                            await showBuffBanner('❤️‍🔥 热血奋战(翻倍)！');
                            window.bulletTimeActive = false; c.isPaused = false;
                        }
                    } else {
                        await handleBuffLeech(c, entry);
                        // handleBuffLeech 已直接修改 UI，将最终状态同步回 Store
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
                    // 通过 Store 消费攻击事件快照，Reducer 统一处理所有状态字段，杜绝遗漏
                    c.store.dispatch({ type: 'APPLY_EVENTS', events: entry._events || [] });
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
        const panel = document.getElementById('errorCapturePanel');
        if (panel) {
            const line = document.createElement('div'); line.style.color = '#f55';
            line.textContent = '[ERROR] playLogEntries: ' + detail;
            panel.appendChild(line); panel.style.display = 'block'; panel.scrollTop = panel.scrollHeight;
        }
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

    // 初始化 UI 状态为开局快照
    let currentUIState = {
        ally: c.snapshot.ally.map(u => u.clone()),
        enemy: c.snapshot.enemy.map(u => u.clone())
    };

    // ========== 初始化响应式 Store ==========
    const initialUnits = [
        ...c.snapshot.ally.map(u => { let u2 = u.clone(); u2.hp = u2.maxHp; u2.alive = true; u2._isDead = false; u2.camp = 'ally'; return u2; }),
        ...c.snapshot.enemy.map(u => { let u2 = u.clone(); u2.hp = u2.maxHp; u2.alive = true; u2._isDead = false; u2.camp = 'enemy'; return u2; })
    ];
    c.store = createStore({ units: initialUnits, round: 1 }, battleReducer);

    // 订阅 Store 变化：自动同步游戏状态到 UI 并刷新
    // 视觉状态（_flash, _acted, _blocked, _resting）保留不动，只覆盖 GAME_STATE_FIELDS
    c.store.subscribe((state) => {
        if (!c.UI || !c.UI.allyTeam || !c.UI.enemyTeam) return;
        // 同步现有单位的游戏状态字段
        const syncFields = (uiUnit) => {
            const su = state.units.find(u => u.uid === uiUnit.uid);
            if (!su) return;
            GAME_STATE_FIELDS.forEach(f => { if (su[f] !== undefined) uiUnit[f] = su[f]; });
        };
        c.UI.allyTeam.forEach(syncFields);
        c.UI.enemyTeam.forEach(syncFields);
        // 添加新单位（拒马等，使用 clone 保留 Unit 原型链）
        state.units.forEach(su => {
            if (su.camp === 'ally' && !c.UI.allyTeam.find(u => u.uid === su.uid)) c.UI.allyTeam.push(su.clone());
            if (su.camp === 'enemy' && !c.UI.enemyTeam.find(u => u.uid === su.uid)) c.UI.enemyTeam.push(su.clone());
        });
        // 移除已销毁的单位
        c.UI.allyTeam = c.UI.allyTeam.filter(u => state.units.find(su => su.uid === u.uid));
        c.UI.enemyTeam = c.UI.enemyTeam.filter(u => state.units.find(su => su.uid === u.uid));
        c.updateUI(c.UI);
    });

    // 初始化 UI 团队（保留 Unit 原型链，避免丢失 clone 等方法）
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

    while (!isBattleOver) {
        if (abortSig && abortSig.aborted) return;
        let roundResult = runBattleRound(battleState);

        // 使用上回合结束时的状态同步到 Store（防止剧透），Store 订阅会自动刷新 UI
        c.store.dispatch({ type: 'SYNC_FULL_STATE', ally: currentUIState.ally, enemy: currentUIState.enemy });

        let mainCtx = window._getPlayerContext ? window._getPlayerContext() : null;
        if (mainCtx && roundResult.doubleStrikeUid !== undefined) mainCtx.currentDoubleStrikeUid = roundResult.doubleStrikeUid;

        let playResult = await playLogEntries(c, roundResult.log, roundResult);
        isBattleOver = playResult ? playResult.isBattleOver : false;
        if (roundResult.winner) { finalWinner = roundResult.winner; break; }
        if (isBattleOver) break;

        // 更新"上回合结束状态"为本次引擎结果
        currentUIState = {
            ally: roundResult.ally.map(u => u.clone()),
            enemy: roundResult.enemy.map(u => u.clone())
        };

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
