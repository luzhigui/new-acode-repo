// player/10player-core.js - 光明顶5v5 战斗播放器核心
// V4.3.0 | 2026-07-02 重写：状态与动画彻底分离，可靠的日志驱动状态更新
export const VER = 'player/10player-core.js V4.3.0';

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

// 安全包装
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

// ==================== 核心：状态更新 ====================

// 根据一条日志条目，更新 UI 工作副本中的状态
function applyLogStateToUI(c, entry) {
    const uiAll = c.UI.allyTeam.concat(c.UI.enemyTeam);

    // 1. 处理攻击条目 (`attack-group`)
    if (entry.type === 'attack-group' && entry.uidD && entry.hpAfter !== undefined) {
        const target = uiAll.find(u => u.uid === entry.uidD);
        if (target) {
            target.hp = entry.hpAfter;
            target.alive = entry.alive !== false;
            if (!target.alive) target._isDead = true;
        }
        // 处理攻击条目内嵌套的回血（韦一笑吸血、九阳神功等）
        if (entry.entries) {
            entry.entries.forEach(sub => {
                if (sub.isHealEntry && sub.healUnitUid) {
                    const unit = uiAll.find(u => u.uid === sub.healUnitUid);
                    if (!unit || !unit.alive) return;
                    
                    // 先处理上限变化（韦一笑吸血涨上限）
                    if (sub.text && sub.text.includes('上限→')) {
                        const maxMatch = sub.text.match(/上限→(\d+)/);
                        if (maxMatch) {
                            unit.maxHp = parseInt(maxMatch[1]);
                        }
                    }
                    // 再处理回血
                    if (sub.healAmount) {
                        unit.hp = Math.min(unit.maxHp, unit.hp + sub.healAmount);
                    }

                }
            });
        }
    }

    // 2. 处理 Buff 溅射/额外伤害
    if (entry.splashUids && entry.splashDmg) {
        entry.splashUids.forEach(uid => {
            const unit = uiAll.find(u => u.uid === uid);
            if (unit) {
                unit.hp = Math.max(0, unit.hp - entry.splashDmg);
                if (unit.hp <= 0) { unit.alive = false; unit._isDead = true; }
            }
        });
    }
    if (entry.type === 'buff-bonus' && entry.targetUid && entry.bonusDmg) {
        const unit = uiAll.find(u => u.uid === entry.targetUid);
        if (unit) {
            unit.hp = Math.max(0, unit.hp - entry.bonusDmg);
            if (unit.hp <= 0) { unit.alive = false; unit._isDead = true; }
        }
    }

    // 3. 处理顶层回血（嗜血狂刀、热血奋战等）
    if (entry.isHealEntry && entry.healUnitUid && entry.healAmount) {
        const unit = uiAll.find(u => u.uid === entry.healUnitUid);
        if (unit && unit.alive) {
            unit.hp = Math.min(unit.maxHp, unit.hp + entry.healAmount);
        }
    }

    // 4. 张无忌变身
    if (entry.isZhangSwitch && entry.unit) {
        const zhang = uiAll.find(u => u.isZhang);
        if (zhang) {
            zhang.rangedForm = entry.unit.rangedForm;
            zhang.role = entry.unit.role;
            zhang.atk = entry.unit.atk;
            zhang.def = entry.unit.def;
            zhang.maxHp = entry.unit.maxHp;
            zhang.hp = entry.unit.hp;
            zhang._blocked = false;
            zhang._resting = false;
        }
    }

    // 5. 新婚扣血
    if (entry.zhouUid && entry.zhouHpAfter !== undefined) {
        const zhou = uiAll.find(u => u.uid === entry.zhouUid);
        if (zhou) {
            zhou.hp = entry.zhouHpAfter;
            if (zhou.hp <= 0) { zhou.alive = false; zhou._isDead = true; }
        }
    }

    // 6. 休息回血（遮挡恢复）
    if (entry.isBlock && entry.healAmount && entry.healUnitUid) {
        const unit = uiAll.find(u => u.uid === entry.healUnitUid);
        if (unit && unit.alive) {
            unit.hp = Math.min(unit.maxHp, unit.hp + entry.healAmount);
        }
    }
}

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
    if (c._scheduler) {
        c._scheduler.schedule('banner', 1500, () => { window.bulletTimeActive = false; c.isPaused = false; });
    }
    await showBuffBanner('🌀 惑人心智！');
    if (!c._scheduler) { window.bulletTimeActive = false; c.isPaused = false; }
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';document.getElementById('log').appendChild(div);c.autoScrollLog();
    let units = c.UI.allyTeam.concat(c.UI.enemyTeam);
    let matchA = entry.text.match(/号位(.+?)\(/);
    let matchB = entry.text.match(/与.*?号位(.+?)\(/);
    let unitA = matchA ? units.find(u => u.name === matchA[1]) : null;
    let unitB = matchB ? units.find(u => u.name === matchB[1]) : null;
    if (unitA && unitB) {
        const swapPos = unitA.pos;
        unitA.pos = unitB.pos;
        unitB.pos = swapPos;
        c.updateUI(c.UI);
        if (c._scheduler) {
            await new Promise(r => c._scheduler.schedule('effect', 900, r));
        } else {
            await animatePositionSwap(unitA, unitB, c);
        }
    } else { c.updateUI(c.UI); }
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
    // ... 保留原有动画逻辑，不修改任何状态 ...
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
                case 'buff-summon':   await handleBuffSummon(c, entry, i > 0 ? log[i-1] : null); break;
                case 'buff-destroy':  await handleBuffDestroy(c, entry, i > 0 ? log[i-1] : null); break;
                case 'buff-leech':
                    insertBuffSeparator(document.getElementById('log'), c);
                    if (entry.buffType === 'hotBlood') {
                        let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
                        document.getElementById('log').appendChild(div);c.autoScrollLog();
                        let healUnit = c.UI.allyTeam.find(u => u.uid === entry.healUnitUid) || c.UI.allyTeam.find(u => u.alive);
                        if (healUnit && entry.healAmount) showHealFloat(healUnit, entry.healAmount);
                        if (entry.text.includes('翻倍')) {
                            c.isPaused = true; window.bulletTimeActive = true;
                            await showBuffBanner('❤️‍🔥 热血奋战(翻倍)！');
                            window.bulletTimeActive = false; c.isPaused = false;
                        }
                    } else await handleBuffLeech(c, entry);
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
                    // 消费该攻击自带的事件快照，避免提前消费后续攻击的状态
                    const events = entry._events || [];
                    if (events.length > 0) {
                        const uiAll = c.UI.allyTeam.concat(c.UI.enemyTeam);
                        events.forEach(ev => {
                            if (ev.eventType === 'hp-change') {
                                const uiUnit = uiAll.find(u => u.uid === ev.unitUid);
                                if (uiUnit) {
                                    uiUnit.hp = ev.payload.hp;
                                    uiUnit.maxHp = ev.payload.maxHp;
                                    uiUnit.alive = ev.payload.alive;
                                    uiUnit.atk = ev.payload.atk;
                                    uiUnit.def = ev.payload.def;
                                    uiUnit._baseMaxHp = ev.payload.maxHp;
                                    uiUnit.dmgDealt = ev.payload.dmgDealt;
                                    uiUnit.dmgTaken = ev.payload.dmgTaken;
                                    uiUnit.healDone = ev.payload.healDone;
                                    uiUnit.reboundDone = ev.payload.reboundDone;
                                    uiUnit.leechDone = ev.payload.leechDone;
                                    uiUnit.dodgeCount = ev.payload.dodgeCount;
                                    uiUnit.critCount = ev.payload.critCount;
                                    uiUnit.survivedRounds = ev.payload.survivedRounds;
                                }
                            }
                        });
                        c.updateUI(c.UI);
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
    c.UI.allyTeam = c.snapshot.ally.map(u => { let u2 = u.clone(); u2.hp = u2.maxHp; u2.alive = true; u2._isDead = false; return u2; });
    c.UI.enemyTeam = c.snapshot.enemy.map(u => { let u2 = u.clone(); u2.hp = u2.maxHp; u2.alive = true; u2._isDead = false; return u2; });
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

        // 使用上回合结束时的状态作为本回合 UI 初始状态（防止剧透）
        c.UI.allyTeam = currentUIState.ally.map(u => u.clone());
        c.UI.enemyTeam = currentUIState.enemy.map(u => u.clone());
        c.updateUI(c.UI);

        let mainCtx = window._getPlayerContext ? window._getPlayerContext() : null;
        if (mainCtx && roundResult.doubleStrikeUid !== undefined) mainCtx.currentDoubleStrikeUid = roundResult.doubleStrikeUid;

        let playResult = await playLogEntries(c, roundResult.log, roundResult);
        isBattleOver = playResult ? playResult.isBattleOver : false;
        if (roundResult.winner) { finalWinner = roundResult.winner; break; }
        if (isBattleOver) break;

        // 更新“上回合结束状态”为本次引擎结果
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

    if (mainCtx.activeBuffs) mainCtx.activeBuffs = [];
    if (mainCtx.updateBuffSlots) mainCtx.updateBuffSlots();
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
}