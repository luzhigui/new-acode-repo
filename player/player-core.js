// player/player-core.js - 光明顶5v5 播放器核心（合并自08文本+09BuffUI+10核心）

export const VER = 'player/player-core.js V4.0.0';

import { CONFIG } from '../core/config.js';
import { Unit, runBattleRound, isBlocked } from '../core/engine.js';
import { showDanmaku, showDamageFloat, showDodgeBubble, showHealFloat, applyBrushEffect, showBuffBanner, showCriticalBanner } from '../fx/fx-common.js';
import { showDodgeBulletTime } from '../fx/fx-dodge-bullet.js';
import { showRangedArrow, showSplashArrows } from '../fx/fx-arrows.js';
import { animatePositionSwap, animatePushBack } from '../fx/fx-swap-push.js';
import { AudioManager } from '../modules/audio.js';

// 安全包装 showDanmaku，防止模块加载异常时崩溃
const safeShowDanmaku = (...args) => { try { return showDanmaku(...args); } catch(e) {} };

let ctx = null;
function getCtx() {
    if (!ctx) ctx = window._getPlayerContext();
    return ctx;
}

// ========== 08player-text.js ==========

export function setPlayerContext(c) { ctx = c; }

export async function playLineText(text, div) {
    const c = getCtx(); let plain = text.replace(/<[^>]+>/g, ''); let htmlIdx=0,fullHtml='';
    let minCharDelay = 30;
    if (c.speed <= 143) minCharDelay = 2;
    else if (c.speed <= 250) minCharDelay = 5;
    else if (c.speed <= 500) minCharDelay = 10;
    
    while(htmlIdx<text.length){
        if(c.abortController&&c.abortController.signal.aborted)return;
        await c.waitWhilePaused();
        let charDelay = c.speed / plain.length;
        if (charDelay < minCharDelay) charDelay = minCharDelay;
        if(text[htmlIdx]==='<'){let tag='';while(text[htmlIdx]!=='>'){tag+=text[htmlIdx];htmlIdx++;}tag+='>';fullHtml+=tag;htmlIdx++;}
        else{fullHtml+=text[htmlIdx];htmlIdx++;await new Promise(r=>setTimeout(r,charDelay));}
        div.innerHTML=fullHtml+'<br>';
        c.autoScrollLog();
    }
}

// ========== 09player-buff-ui.js ==========

export function setBuffUIContext(c) { ctx = c; }

export function showBuffPopup(c) {
    return new Promise((resolve) => {
        let activeBuffs = c.activeBuffs || [];
        let existingKeys = activeBuffs.map(b => b.key);
        let allKeys = Object.keys(CONFIG.BUFFS || {});
        let available = allKeys.filter(k => !existingKeys.includes(k));
        if (available.length === 0) { resolve(null); return; }

        let shuffled = [...available].sort(() => Math.random() - 0.5);
        let choices = shuffled.slice(0, CONFIG.BUFF_CHOICES || 3);
        let text = '选择 Buff（持续 ' + (CONFIG.BUFF_DURATION || 4) + ' 回合）';
        let buttons = choices.map(key => {
            let buff = CONFIG.BUFFS[key] || { name: key, icon: '?' };
            return { text: (buff.icon || '?') + ' ' + (buff.name || key) + '\n' + (buff.desc || ''), value: key, cls: 'buff' };
        });
        if (buttons.length === 0) { resolve(null); return; }

        let overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.id = 'buffModalOverlay';
        let box = document.createElement('div'); box.className = 'modal-box';
        let inner = `<div class="modal-text">${text}</div><span class="modal-minimize" id="buffModalMinimize">∧</span><div class="modal-buttons"></div>`;
        box.innerHTML = inner;
        let btnsDiv = box.querySelector('.modal-buttons');
        buttons.forEach(b => {
            let btn = document.createElement('button'); btn.className = 'modal-btn ' + (b.cls || '');
            btn.textContent = b.text;
            btn.addEventListener('click', () => {
                clearTimeout(timeoutId);
                try {
                    if (document.body.contains(overlay)) document.body.removeChild(overlay);
                    let floatBtn = document.getElementById('buffFloatBtn');
                    if (floatBtn) floatBtn.remove();
                    let duration = CONFIG.BUFFS[b.value]?.duration || CONFIG.BUFF_DURATION || 4;
                    resolve({ key: b.value, target: 'ally', remaining: duration, name: CONFIG.BUFFS[b.value]?.name || b.value });
                } catch(e) {
                    console.error('showBuffPopup resolve error:', e);
                    resolve(null);
                }
            });
            btnsDiv.appendChild(btn);
        });
        overlay.appendChild(box); document.body.appendChild(overlay);

        // 30秒超时兜底，防止游戏卡死
        let timeoutId = setTimeout(() => {
            if (document.body.contains(overlay)) {
                try { document.body.removeChild(overlay); } catch(e) {}
            }
            let floatBtn = document.getElementById('buffFloatBtn');
            if (floatBtn) floatBtn.remove();
            resolve(null);
        }, 30000);

        document.getElementById('buffModalMinimize').addEventListener('click', () => {
            overlay.style.display = 'none';
            let floatBtn = document.createElement('div');
            floatBtn.id = 'buffFloatBtn';
            floatBtn.className = 'vote-float';
            floatBtn.style.display = 'flex';
            floatBtn.title = '恢复Buff选择';
            floatBtn.innerHTML = '🛡️';
            floatBtn.addEventListener('click', () => {
                overlay.style.display = 'flex';
                floatBtn.remove();
            });
            document.body.appendChild(floatBtn);
        });

        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                overlay.style.display = 'none';
                let floatBtn = document.createElement('div');
                floatBtn.id = 'buffFloatBtn';
                floatBtn.className = 'vote-float';
                floatBtn.style.display = 'flex';
                floatBtn.title = '恢复Buff选择';
                floatBtn.innerHTML = '🛡️';
                floatBtn.addEventListener('click', () => {
                    overlay.style.display = 'flex';
                    floatBtn.remove();
                });
                document.body.appendChild(floatBtn);
            }
        });
    });
}
window.showBuffPopup = showBuffPopup;

export async function handleBuffSummon(c, entry, prevEntry) {
    if (prevEntry && (prevEntry.type === 'attack-group' || prevEntry.type === 'buff-leech' || prevEntry.type === 'buff-splash')) {
        let sepDiv = document.createElement('div');
        sepDiv.innerHTML = '<span class="separator">- - - - -</span><br>';
        document.getElementById('log').appendChild(sepDiv);
        c.autoScrollLog();
        await new Promise(r=>setTimeout(r, c.speed/4));
    }
    let horse = new Unit('拒马', 20, '防战', 'ally');
    horse.uid = entry.horseUid;
    horse.pos = entry.horsePos;
    horse.alive = true;
    horse.hp = 20;
    horse.maxHp = 20;
    horse.atk = 0;
    horse.def = 5;
    horse.isHorse = true;
    horse._originalPos = entry.horsePos;
    if (!c.UI.allyTeam.some(u => u.uid === horse.uid)) {
        c.UI.allyTeam.push(horse);
    }
    c.updateUI(c.UI, c.UI.lastSnapshot);
    c.UI.lastSnapshot = { ally: c.UI.allyTeam.map(u => u.clone()), enemy: c.UI.enemyTeam.map(u => u.clone()) };
    if (entry.horseTaunt) {
        c.isPaused = true;
        try { await showBuffBanner('🐴 拒马阵！' + entry.horseTaunt); } finally { c.isPaused = false; }
    }
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
    document.getElementById('log').appendChild(div);
    c.autoScrollLog();
    let sepAfter = document.createElement('div');
    sepAfter.innerHTML = '<span class="separator">- - - - -</span><br>';
    document.getElementById('log').appendChild(sepAfter);
    c.autoScrollLog();
    await new Promise(r=>setTimeout(r, c.speed/4));
}

export async function handleBuffDestroy(c, entry, prevEntry) {
    if (prevEntry && (prevEntry.type === 'attack-group' || prevEntry.type === 'buff-leech' || prevEntry.type === 'buff-splash')) {
        let sepDiv = document.createElement('div');
        sepDiv.innerHTML = '<span class="separator">- - - - -</span><br>';
        document.getElementById('log').appendChild(sepDiv);
        c.autoScrollLog();
        await new Promise(r=>setTimeout(r, c.speed/4));
    }
    let idx = c.UI.allyTeam.findIndex(u => u.uid === entry.horseUid);
    if (idx >= 0) {
        c.UI.allyTeam.splice(idx, 1);
        c.updateUI(c.UI, c.UI.lastSnapshot);
        c.UI.lastSnapshot = { ally: c.UI.allyTeam.map(u => u.clone()), enemy: c.UI.enemyTeam.map(u => u.clone()) };
    }
    c.isPaused = true;
    try { await showBuffBanner('🐴 拒马已销毁'); } finally { c.isPaused = false; }
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
    document.getElementById('log').appendChild(div);
    c.autoScrollLog();
}

export async function handleBuffLeech(c, entry) {
    let healUnit = c.UI.allyTeam.find(u => u.uid === entry.healUnitUid) || c.UI.allyTeam.find(u => u.alive);
    if (healUnit && entry.healAmount) {
        showHealFloat(healUnit, entry.healAmount);
        healUnit.hp = Math.min(healUnit.maxHp, healUnit.hp + entry.healAmount);
        c.updateUI(c.UI);
    }
    let bannerText = '🗡️ 嗜血狂刀！';
    if (entry.buffType === 'hotBlood') {
        bannerText = entry.text.includes('翻倍') ? '❤️‍🔥 热血奋战(翻倍)！' : '❤️ 热血奋战！';
    }
    c.isPaused = true;
    try { await showBuffBanner(bannerText); } finally { c.isPaused = false; }
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
    document.getElementById('log').appendChild(div);
    c.autoScrollLog();
}

export async function handleBuffSplash(c, entry) {
    let match = entry.text.match(/-(\d+)/);
    if (match) {
        let targetName = entry.text.match(/溅射(.+?) -/) || entry.text.match(/波及(.+?) -/);
        let targetUnit = targetName ? c.UI.enemyTeam.find(u => u.name === targetName[1] && u.alive) : null;
        if (targetUnit) showDamageFloat(targetUnit, parseInt(match[1]));
    }
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
    document.getElementById('log').appendChild(div);
    c.autoScrollLog();
    if (entry.buffType === 'wind_assault') {
        c.isPaused = true;
        await showBuffBanner('🦅 乘风突袭！');
        c.isPaused = false;
    } else {
        c.isPaused = true;
        await showBuffBanner('☄️ 流星赶月！');
        c.isPaused = false;
    }
}

// ========== 10player-core.js ==========

export function clearAllEffects(){
    document.querySelectorAll('.fly-shadow,.fly-ghost,.fly-arrow,.danmaku-bubble,.dmg-float,.heal-float,.arrow-overlay,.crash-clone,.victory-banner,.party-particle,.star-particle,.bullet-mask,.bullet-clone,.comic-bubble,.shockwave,.lightning-split,.flame-trail,.wind-split,.bg-particle,.counter-storm,.wind-shield').forEach(el=>{if(el.parentNode)el.parentNode.removeChild(el);});
    document.querySelectorAll('.cell-cheer').forEach(cell => cell.classList.remove('cell-cheer'));
    document.querySelectorAll('.grid.victory-border').forEach(grid => grid.classList.remove('victory-border'));
}

function syncAllyBuffFields(roundResult, uiAlly) {
    if (!roundResult || !roundResult.ally) return;
    roundResult.ally.forEach(ru => {
        let uiUnit = uiAlly.find(u => u.uid === ru.uid);
        if (uiUnit && uiUnit.alive) {
            uiUnit.buffAtkBonus = ru.buffAtkBonus || 0;
            uiUnit.buffDefBonus = ru.buffDefBonus || 0;
            uiUnit.buffDodgeBonus = ru.buffDodgeBonus || 0;
            uiUnit.buffHpBonus = ru.buffHpBonus || 0;
            // 同步 carry 血量上限和当前血量
            if (ru.maxHp !== undefined) uiUnit.maxHp = ru.maxHp;
            if (ru.hp !== undefined) uiUnit.hp = ru.hp;
        }
    });
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

async function waitSafe(ms, c) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
        if (c.abortController && c.abortController.signal && c.abortController.signal.aborted) return;
        await c.waitWhilePaused();
        await new Promise(r => setTimeout(r, 50));
    }
}

export async function playLogEntries(c, log, roundResult) {
    let abortSig = c.abortController ? c.abortController.signal : null;
    let isFirstAttackInRound = true;

    try {
        for (let i = 0; i < log.length; i++) {
            if (abortSig && abortSig.aborted) return { isBattleOver: false };
            await c.waitWhilePaused();
            let entry = log[i];

            if (entry.type === 'buff-summon') { await handleBuffSummon(c, entry, i > 0 ? log[i-1] : null); continue; }
            if (entry.type === 'buff-destroy') { await handleBuffDestroy(c, entry, i > 0 ? log[i-1] : null); continue; }
            if (entry.type === 'buff-leech') {
                insertBuffSeparator(document.getElementById('log'), c);
                if (entry.buffType === 'hotBlood') {
                    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
                    document.getElementById('log').appendChild(div);c.autoScrollLog();
                    let healUnit = c.UI.allyTeam.find(u => u.uid === entry.healUnitUid) || c.UI.allyTeam.find(u => u.alive);
                    if (healUnit && entry.healAmount) {
                        showHealFloat(healUnit, entry.healAmount);
                        healUnit.hp = Math.min(healUnit.maxHp, healUnit.hp + entry.healAmount);
                        c.updateUI(c.UI);
                    }
                    if (entry.text.includes('翻倍')) {
                        c.isPaused = true;
                        window.bulletTimeActive = true;
                        try { await showBuffBanner('❤️‍🔥 热血奋战(翻倍)！'); } finally { window.bulletTimeActive = false; c.isPaused = false; }
                    }
                } else {
                    await handleBuffLeech(c, entry);
                }
                continue;
            }
            if (entry.type === 'buff-splash') {
                c.isPaused = true;
                window.bulletTimeActive = true;
                try {
                    if (entry.buffType === 'wind_assault') {
                        await showBuffBanner('🦅 乘风突袭！');
                    } else if (entry.buffType === 'meteor_splash') {
                        await showBuffBanner('☄️ 流星赶月！');
                    } else {
                        await showBuffBanner('🦅 乘风突袭！');
                    }
                } finally { window.bulletTimeActive = false; c.isPaused = false; }
                let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
                document.getElementById('log').appendChild(div);c.autoScrollLog();
                if (entry.splashUids && entry.splashDmg) {
                    if (entry.attackerUid && entry.primaryUid) {
                        let attacker = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.attackerUid);
                        let primary = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.primaryUid);
                        let splashTargets = entry.splashUids.map(uid => c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === uid)).filter(u => u);
                        if (attacker && primary && splashTargets.length > 0) {
                            showSplashArrows(attacker, primary, splashTargets, c.speed, () => c.isPaused);
                        }
                    }
                    entry.splashUids.forEach(uid => {
                        let targetUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === uid);
                        if (targetUnit) {
                            targetUnit.hp = Math.max(0, targetUnit.hp - entry.splashDmg);
                            if (targetUnit.hp <= 0) targetUnit.alive = false;
                            showDamageFloat(targetUnit, entry.splashDmg);
                        }
                    });
                    c.updateUI(c.UI);
                }
                // 流星赶月需要额外停顿，展示分裂特效
                if (entry.buffType === 'meteor_splash') {
                    await new Promise(r=>setTimeout(r, 600));
                }
                c.isPaused = false;
                continue;
            }
            if (entry.type === 'buff-bonus') {
                let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
                document.getElementById('log').appendChild(div);c.autoScrollLog();
                if (entry.targetUid && entry.bonusDmg) {
                    let targetUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.targetUid);
                    if (targetUnit) {
                        targetUnit.hp = Math.max(0, targetUnit.hp - entry.bonusDmg);
                        if (targetUnit.hp <= 0) targetUnit.alive = false;
                        showDamageFloat(targetUnit, entry.bonusDmg);
                        c.updateUI(c.UI);
                    }
                }
                continue;
            }
            if (entry.type === 'buff-swap') {
                insertBuffSeparator(document.getElementById('log'), c);
                c.isPaused = true;
                window.bulletTimeActive = true;
                await showBuffBanner('🌀 惑人心智！');
                window.bulletTimeActive = false;
                c.isPaused = false;
                let div=document.createElement('div');div.innerHTML=entry.text+'<br>';document.getElementById('log').appendChild(div);c.autoScrollLog();
                let units = c.UI.allyTeam.concat(c.UI.enemyTeam);
                let matchA = entry.text.match(/号位(.+?)\(/);
                let matchB = entry.text.match(/与.*?号位(.+?)\(/);
                let unitA = matchA ? units.find(u => u.name === matchA[1]) : null;
                let unitB = matchB ? units.find(u => u.name === matchB[1]) : null;
                if (unitA && unitB) { await animatePositionSwap(unitA, unitB, c); }
                else { c.updateUI(c.UI); }
                continue;
            }
            if (entry.type === 'buff-push') {
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
                continue;
            }
            if (entry.type === 'buff-summary') { let div=document.createElement('div');div.innerHTML=entry.text+'<br>';document.getElementById('log').appendChild(div);c.autoScrollLog();
                // carry buff 立即更新UI
                if (entry.buffType === 'buff_stat' && entry.carryUnit && entry.atkVal !== undefined) {
                    let carryUi = c.UI.allyTeam.find(u => u.uid === entry.carryUnit.uid);
                    if (carryUi) {
                        carryUi.buffAtkBonus = (carryUi.buffAtkBonus || 0) + (entry.atkVal / Math.max(1, carryUi.atk));
                        carryUi.buffDefBonus = (carryUi.buffDefBonus || 0) + (entry.defVal / Math.max(1, carryUi.def));
                        carryUi.buffHpBonus = (carryUi.buffHpBonus || 0) + (entry.hpVal / Math.max(1, carryUi._baseMaxHp || carryUi.maxHp));
                        c.updateUI(c.UI);
                    }
                }
                continue; }
            if (entry.type === 'buff-rebound-fortify') {
                insertBuffSeparator(document.getElementById('log'), c);
                c.isPaused = true;
                window.bulletTimeActive = true;
                await showBuffBanner('🛡️ 严阵以待！');
                window.bulletTimeActive = false;
                c.isPaused = false;
                let attacker = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.attackerUid);
                if (attacker && entry.reboundDmg) {
                    attacker.hp = Math.max(0, attacker.hp - entry.reboundDmg);
                    if (attacker.hp <= 0) attacker.alive = false;
                    showDamageFloat(attacker, entry.reboundDmg);
                    c.updateUI(c.UI);
                }
                let div=document.createElement('div');div.innerHTML=entry.text+'<br>';document.getElementById('log').appendChild(div);c.autoScrollLog();
                await new Promise(r=>setTimeout(r, c.speed/2)); continue;
            }

            if (entry.type === 'round-start') {
                c.UI.round = parseInt(entry.text.match(/\d+/)[0])||1;
                isFirstAttackInRound=true;
                c.UI.allyTeam.concat(c.UI.enemyTeam).forEach(u=>{if(u.alive){u._acted=false;u._blocked=isBlocked(u, u.camp==='ally'?c.UI.allyTeam:c.UI.enemyTeam);u._resting = false;}});
                c.updateUI(c.UI);
                let div=document.createElement('div');div.innerHTML=entry.text+'<br>';document.getElementById('log').appendChild(div);c.autoScrollLog();
                document.getElementById('roundDisplay').innerText = `📜 日志（第${c.UI.round}回合）`;
                await new Promise(r=>setTimeout(r, c.speed/3));
            }
            else if (entry.type === 'attack-group') {
                if (entry.isCombo) { let spacer = document.createElement('div'); spacer.innerHTML = '<br>'; document.getElementById('log').appendChild(spacer); c.autoScrollLog(); c.isPaused = true; window.bulletTimeActive = true; await showBuffBanner('⚡ 连击！'); window.bulletTimeActive = false; c.isPaused = false; }
                let unitA=c.UI.allyTeam.concat(c.UI.enemyTeam).find(u=>u.uid===entry.uidA);
                let unitD=entry.uidD?c.UI.allyTeam.concat(c.UI.enemyTeam).find(u=>u.uid===entry.uidD):null;
                if(!entry.isBlock&&!entry.isMiss&&!entry.isDodge&&(!unitA||!unitD))continue;
                if(!isFirstAttackInRound && !entry.isCombo){ let sepDiv=document.createElement('div'); sepDiv.innerHTML='<span class="separator">- - - - -</span><br>'; document.getElementById('log').appendChild(sepDiv); c.autoScrollLog(); await new Promise(r=>setTimeout(r, c.speed/4)); }
                isFirstAttackInRound=false;
                if(unitA&&!entry.isBlock){
                    unitA._flash='attack';c.updateUI(c.UI);
                    if (unitD && unitD.role === '防战') {
                        let defBuffs = (unitD.camp === 'ally' ? c.UI.allyTeam : c.UI.enemyTeam);
                        defBuffs = defBuffs ? (defBuffs._activeBuffs || []) : [];
                        if (defBuffs.some(b => b.key === 'fortify')) {
                            setTimeout(() => showBuffBanner('🛡️ 严阵以待！'), Math.min(400, c.speed / 3));
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
                let lastDiv=null,healDiv=null,hasWeiXiXue=false, weiXueHealAmount=0, weiXueUnit=null, blockDelay=false;
                for(let entry2 of textEntries){
                    if(abortSig&&abortSig.aborted){if(atkTimer)clearTimeout(atkTimer);if(defTimer)clearTimeout(defTimer);return { isBattleOver: false };}
                    if(!c.detailMode&&entry2.type==='detail'){ let hiddenDiv=document.createElement('div'); hiddenDiv.className='detail-hidden'; hiddenDiv.innerHTML=entry2.text+'<br>'; document.getElementById('log').appendChild(hiddenDiv); c.autoScrollLog(); continue; }
                    if(entry2.type==='damage-text'){ lastDiv=document.createElement('div'); document.getElementById('log').appendChild(lastDiv); await playLineText(entry2.text,lastDiv); }
                    else if(entry2.isHealEntry && entry.isDead){ healDiv=document.createElement('div'); document.getElementById('log').appendChild(healDiv); await playLineText(entry2.text,healDiv); }
                    else{
                        if(entry2.isHealEntry && !entry.isDead) {
                            let match = entry2.text.match(/\+(\d+)/);
                            if(match && unitA) {
                                let healAmount = parseInt(match[1]);
                                let uiHealUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === unitA.uid);
                                if (uiHealUnit) {
                                    uiHealUnit.hp = Math.min(uiHealUnit.maxHp, uiHealUnit.hp + healAmount);
                                    // 韦一笑被动增加上限
                                    if (unitA.isWei && entry2.text.includes('上限→')) {
                                        let maxMatch = entry2.text.match(/上限→(\d+)/);
                                        if (maxMatch) uiHealUnit.maxHp = parseInt(maxMatch[1]);
                                    }
                                    c.updateUI(c.UI);
                                    // 先更新界面再飘字，保证飘字基于最新血量
                                    showHealFloat(uiHealUnit, healAmount);
                                }
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
                if (hasWeiXiXue && weiXueUnit && weiXueHealAmount > 0) { showHealFloat(weiXueUnit, weiXueHealAmount); }
                if(unitD&&entry.hpPctAfter!==undefined&&entry.hpPctBefore!==undefined){ if(entry.hpPctBefore>40&&entry.hpPctAfter<=40&&entry.hpPctAfter>20){let t=(unitD.camp==='ally'?'不好，必须反击了！':'小儿安敢伤我！');safeShowDanmaku(unitD,t);} else if(entry.hpPctBefore>20&&entry.hpPctAfter<=20){let t=(unitD.camp==='ally'?'撑住！':'已是强弩之末！');safeShowDanmaku(unitD,t);} }
                await new Promise(r=>setTimeout(r,offset)); await c.waitWhilePaused();
                if(atkTimer)clearTimeout(atkTimer); if(defTimer)clearTimeout(defTimer);
                if(unitA){unitA._flash=null;unitA._acted=true;} if(unitD&&!entry.isDodge&&!entry.isMiss&&!entry.isDead)unitD._flash=null; if(unitD&&entry.hpAfter!==undefined){unitD.hp=entry.hpAfter;unitD.alive=entry.alive;}
                if (unitA) {
                    let uiUnitA = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === unitA.uid);
                    if (uiUnitA) {
                        uiUnitA.dmgDealt = (uiUnitA.dmgDealt || 0) + (entry._dmg || 0);
                        uiUnitA.dmgTaken = (uiUnitA.dmgTaken || 0) + (entry._dmg || 0);
                        uiUnitA.dodgeCount = unitA.dodgeCount || 0;
                        uiUnitA.healDone = unitA.healDone || 0;
                        uiUnitA.reboundDone = unitA.reboundDone || 0;
                        uiUnitA.leechDone = unitA.leechDone || 0;
                        uiUnitA.critCount = unitA.critCount || 0;
                        uiUnitA.survivedRounds = unitA.survivedRounds || 0;
                        if (unitA.isWei && hasWeiXiXue) { uiUnitA.maxHp = unitA.maxHp; uiUnitA.hp = unitA.hp; }
                        if (unitA.buffAtkBonus !== undefined) uiUnitA.buffAtkBonus = unitA.buffAtkBonus;
                        if (unitA.buffDefBonus !== undefined) uiUnitA.buffDefBonus = unitA.buffDefBonus;
                        if (unitA.buffHpBonus !== undefined) uiUnitA.buffHpBonus = unitA.buffHpBonus;
                    }
                }
                if (unitD) {
                    let uiUnitD = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === unitD.uid);
                    if (uiUnitD) {
                        uiUnitD.dmgTaken = (uiUnitD.dmgTaken || 0) + (entry._dmg || 0);
                        uiUnitD.dodgeCount = unitD.dodgeCount || 0;
                        uiUnitD.healDone = unitD.healDone || 0;
                        uiUnitD.reboundDone = unitD.reboundDone || 0;
                        uiUnitD.leechDone = unitD.leechDone || 0;
                        uiUnitD.critCount = unitD.critCount || 0;
                        uiUnitD.survivedRounds = unitD.survivedRounds || 0;
                    }
                }
                if (entry.isDead && unitD && unitD.camp === 'ally' && roundResult) { syncAllyBuffFields(roundResult, c.UI.allyTeam); }
                c.UI.allyTeam.concat(c.UI.enemyTeam).forEach(u => { if (u.alive) u._blocked = isBlocked(u, u.camp === 'ally' ? c.UI.allyTeam : c.UI.enemyTeam); });
                if (entry.isBlock && entry.healAmount && entry.healUnitUid) {
                    let healUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.healUnitUid);
                    if (healUnit) healUnit.hp = Math.min(healUnit.maxHp, healUnit.hp + entry.healAmount);
                }
                c.updateUI(c.UI);
                document.getElementById('roundDisplay').innerText = `📜 日志（第${c.UI.round}回合）`; if(hasWeiXiXue)setTimeout(()=>c.updateUI(c.UI),100);
                if(entry.isDead){ await new Promise(r=>setTimeout(r,deadDuration)); await c.waitWhilePaused(); if(unitD)setTimeout(()=>{unitD._isDead = true;c.updateUI(c.UI);},3500); }
                if(entry.isDead&&(c.UI.allyTeam.every(ch=>!ch.alive)||c.UI.enemyTeam.every(ch=>!ch.alive))){ return { isBattleOver: true }; }
            }
            else if (entry.type === 'info') {
                if(entry.isZhangSwitch&&entry.unit){ let zhangUnit = c.UI.allyTeam.find(u => u.isZhang); let sepDiv=document.createElement('div');sepDiv.innerHTML='<span class="separator">- - - - -</span><br>'; document.getElementById('log').appendChild(sepDiv); c.autoScrollLog(); let tempDiv=document.createElement('div');document.getElementById('log').appendChild(tempDiv); await playLineText(entry.text,tempDiv); if(zhangUnit) { zhangUnit.rangedForm = entry.unit.rangedForm; zhangUnit.role = entry.unit.role; zhangUnit._blocked = false; zhangUnit._resting = false; c.updateUI(c.UI); safeShowDanmaku(zhangUnit, '不好，要顶上去了！'); } }
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
            else if (entry.type === 'round-end') {
                let hasSkill=log[i-1]&&log[i-1].type==='attack-group'&&log[i-1].entries.some(e=>e.type==='info'); if(!hasSkill){ let spacer=document.createElement('div');spacer.innerHTML='<br>';document.getElementById('log').appendChild(spacer);c.autoScrollLog(); }
                let div=document.createElement('div');div.innerHTML=entry.text;document.getElementById('log').appendChild(div); c.autoScrollLog(); document.getElementById('roundDisplay').innerText = `📜 日志（第${c.UI.round}回合）`;
                if (c.tickBuffDurations) { c.tickBuffDurations(); c.updateBuffSlots(); }
                if (c.updateUI) { c.updateUI(c.UI); if (window._refreshGlowCells) window._refreshGlowCells(); }
                await new Promise(r=>setTimeout(r,c.speed/3));
            }
            if (abortSig && abortSig.aborted) return { isBattleOver: false };
        }
    } catch (e) {
        window.bulletTimeActive = false;
        if (c) c.isPaused = false;
        const detail = e && e.stack ? e.stack : (e && e.message ? e.message : String(e));
        console.error('playLogEntries 错误:', detail);
        const panel = document.getElementById('errorCapturePanel');
        if (panel) {
            const line = document.createElement('div');
            line.style.color = '#f55';
            line.textContent = '[ERROR] playLogEntries: ' + detail;
            panel.appendChild(line);
            panel.style.display = 'block';
            panel.scrollTop = panel.scrollHeight;
        }
        return { isBattleOver: false };
    }
    return { isBattleOver: false };
}

export async function playBattle() {
    const c = getCtx();
    if (!c || !c.UI || !c.UI.currentResult) return;
    c.fadeBGMTo(0.1, 1500);
    let abortSig = c.abortController ? c.abortController.signal : null;
    c.UI.allyTeam = c.snapshot.ally.map(u => u.clone()); c.UI.enemyTeam = c.snapshot.enemy.map(u => u.clone());
    c.UI.lastSnapshot = { ally: c.UI.allyTeam.map(u => u.clone()), enemy: c.UI.enemyTeam.map(u => u.clone()) };
    c.updateUI(c.UI); document.getElementById('roundDisplay').innerText = `📜 日志（第1回合）`;
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
        // 同步概率连击选中单位，确保格子显示 ⚡ 图标
        let mainCtx = window._getPlayerContext ? window._getPlayerContext() : null;
        if (mainCtx && roundResult.doubleStrikeUid !== undefined) {
            mainCtx.currentDoubleStrikeUid = roundResult.doubleStrikeUid;
        }
        let uiAlly = c.UI.allyTeam; let uiEnemy = c.UI.enemyTeam; syncAllyBuffFields(roundResult, uiAlly); c.updateUI(c.UI, c.UI.lastSnapshot);
        let playResult = await playLogEntries(c, roundResult.log, roundResult);
        isBattleOver = playResult ? playResult.isBattleOver : false;
        if (roundResult.winner) { finalWinner = roundResult.winner; break; }
        if (isBattleOver) break;
        let nextActiveBuffs = roundResult.activeBuffs;
        if (battleState.round % 3 === 0 && battleState.round > 0) { let promDiv = document.createElement('div'); promDiv.innerHTML = `<span class="gold">✨ 请选择新的Buff（持续${CONFIG.BUFF_DURATION || 4}回合）</span><br>`; logDiv.appendChild(promDiv); c.autoScrollLog(); c.isPaused = true; let newBuff = await showBuffPopup(c); if (newBuff) { nextActiveBuffs = [...(nextActiveBuffs || []), newBuff]; let msgDiv = document.createElement('div'); msgDiv.innerHTML = `<span class="gold">✨ 获得Buff：${newBuff.name}（持续${newBuff.remaining}回合）</span><br>`; logDiv.appendChild(msgDiv); c.autoScrollLog(); let mainCtx = window._getPlayerContext ? window._getPlayerContext() : null; if (mainCtx) { mainCtx.activeBuffs = nextActiveBuffs; if (mainCtx.updateBuffSlots) mainCtx.updateBuffSlots(); } } c.isPaused = false; }
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
    c.updateButtons(); c.enableAllButtons(); c.fadeBGMTo(0.6, 2000);
    let winner = finalWinner;
    if (winner === '明教' || winner === '六大派') { c.battleResultForInfo = { winner, ally: c.UI.allyTeam, enemy: c.UI.enemyTeam }; let units = winner === '明教' ? c.UI.allyTeam : c.UI.enemyTeam, alive = units.filter(u => u.alive); if (alive.length > 0) { alive.forEach(u => { u._flash = 'cheer'; }); c.updateUI(c.UI); let victoryLines = ['我们赢了！','好！','胜了！','痛快！','拿下！','赢了！']; alive.forEach((u,i) => { setTimeout(() => { let line = victoryLines[i % victoryLines.length]; let div = document.createElement('div'); div.innerHTML = '<span class="gold">🗣️ ' + u.name + '：' + line + '</span><br>'; logDiv.appendChild(div); c.autoScrollLog(); showDanmaku(u, line); }, i * 400); }); await new Promise(r => setTimeout(r, 800 + alive.length * 400)); if (c.spawnVictoryEffects) c.spawnVictoryEffects(winner); await new Promise(r => setTimeout(r, 3000)); } } else { logDiv.innerHTML+='<span class="gray">🤝 平局！积分不变</span><br>'; logDiv.scrollTop = logDiv.scrollHeight; }
    c.UI.allyTeam.concat(c.UI.enemyTeam).forEach(u => { u._flash = null; }); c.updateUI(c.UI);
    let mainCtx = window._getPlayerContext ? window._getPlayerContext() : c; if (mainCtx.activeBuffs) mainCtx.activeBuffs = []; if (mainCtx.updateBuffSlots) mainCtx.updateBuffSlots(); if (window._updateGlowColors) window._updateGlowColors(-1);
    if (window._voteChoice && window._voteChoice !== 'skip' && winner !== '平局') { let correct = (window._voteChoice === winner), earnPoints = 0; if (correct) { earnPoints = window._battleHasZhang ? 3 : 2; window._voteScore += earnPoints; } else { earnPoints = -1; window._voteScore += earnPoints; } localStorage.setItem('ming_vote_score_5v5_test', window._voteScore); let badge = document.getElementById('scoreBadge'), floatEl = document.createElement('span'); floatEl.className = 'score-float'; floatEl.textContent = (earnPoints > 0 ? '+' : '') + earnPoints + '🏆'; badge.appendChild(floatEl); setTimeout(() => { if (floatEl.parentNode) floatEl.parentNode.removeChild(floatEl); }, 3500); setTimeout(() => c.updateScoreBadge(), 3500); let voteMsg = correct ? `<span class="green">📊 你猜了${window._voteChoice}，正确！+${earnPoints}分！ 当前积分：${window._voteScore}</span>` : `<span class="red">📊 你猜了${window._voteChoice}，错误！-1分！当前积分：${window._voteScore}</span>`; logDiv.innerHTML += voteMsg + '<br>'; logDiv.scrollTop = logDiv.scrollHeight; } else if (winner === '平局') { logDiv.innerHTML += '<span class="gray">📊 平局，积分不变，当前积分：' + window._voteScore + '</span><br>'; logDiv.scrollTop = logDiv.scrollHeight; }
    window._voteChoice = null; c.abortController = null;
}