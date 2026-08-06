// player/10player-core.js - 光明顶5v5 战斗播放器核心
// V5.3.1 | ~29200 bytes| 2026-07-31 提取事件处理器到53，精简核心调度
export const VER = 'player/10player-core.js V5.3.1';

import { showBuffBanner } from '../fx/15fx-common-5v5-test.js';
import { CONFIG } from '../core/01config-5v5-test.js';
import { AudioManager } from '../modules/28audio-manager.js';
import { handleBuffSummon, handleBuffDestroy, handleBuffLeech, showBuffPopup, handleHolyTokenDrop } from './09player-buff-ui.js';
import { createRoundStepper } from '../core/48battle-round.js';
import { getState } from '../ui/39main-state.js';
import { setRenderStore, updateUI } from '../ui/14ui-render-5v5-test.js';
import { createStore, battleReducer, GAME_STATE_FIELDS } from '../modules/52battle-store.js';
import { handleBuffBonus, handleBuffSwap, handleBuffPush, handleBuffReboundFortify, handleAttackGroup, handleInfo, handleRoundStart, handleRoundEnd, shouldStartNewGroup } from './53event-handlers.js';

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

function getCtx() {
    return window._getPlayerContext ? window._getPlayerContext() : null;
}

export function clearAllEffects(){
    document.querySelectorAll('[data-fx="temporary"]').forEach(el=>{if(el.parentNode)el.parentNode.removeChild(el);});
    document.querySelectorAll('.cell-cheer').forEach(cell => cell.classList.remove('cell-cheer'));
    document.querySelectorAll('.grid.victory-border').forEach(grid => grid.classList.remove('victory-border'));
}

export async function playLogEntries(c, log, roundResult, isFirstAttackRef) {
    let abortSig = c.abortController ? c.abortController.signal : null;
    let lastEntryType = c._lastLogType || null;

    try {
        for (let i = 0; i < log.length; i++) {
            if (abortSig && abortSig.aborted) return { isBattleOver: false };
            await c.waitWhilePaused();
            let entry = log[i];

            // 统一分隔符判断：在任何 entry 处理之前检查
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
                            const { showHealFloat } = await import('../fx/15fx-common-5v5-test.js');
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
                    if (entry.buffType === 'wind_assault') {
                        await showBuffBanner('🦅 乘风突袭！');
                        if (entry.splashUids) {
                            const { showWindClaw } = await import('../fx/15fx-common-5v5-test.js');
                            entry.splashUids.forEach(uid => {
                                const targetUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === uid);
                                if (targetUnit) showWindClaw(targetUnit);
                            });
                        }
                    }
                    else if (entry.buffType === 'meteor_splash') {
                        await showBuffBanner('☄️ 流星赶月！');
                        if (entry.attackerUid && entry.primaryUid && entry.splashUids && entry.splashUids.length > 0) {
                            let attacker = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.attackerUid);
                            let primary = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === entry.primaryUid);
                            let splashTargets = entry.splashUids.map(uid => c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === uid)).filter(u => u);
                            if (attacker && primary && splashTargets.length > 0) {
                                const { showSplashArrows } = await import('../fx/16fx-arrows-5v5-test.js');
                                showSplashArrows(attacker, primary, splashTargets, c.speed, () => c.isPaused);
                                // 分裂箭音效：每发小箭间隔播放，营造万箭齐发感
                                splashTargets.forEach((st, i) => {
                                    setTimeout(() => {
                                        AudioManager.playSfx(attacker);
                                    }, i * 120);
                                });
                            }
                        }
                    }
                    else await showBuffBanner('🦅 乘风突袭！');
                    window.bulletTimeActive = false;
                    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
                    document.getElementById('log').appendChild(div);c.autoScrollLog();
                    if (entry.splashUids && entry.splashDmg) {
                        const { showDamageFloat } = await import('../fx/15fx-common-5v5-test.js');
                        entry.splashUids.forEach(uid => {
                            let targetUnit = c.UI.allyTeam.concat(c.UI.enemyTeam).find(u => u.uid === uid);
                            if (targetUnit) {
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
                    c.UI.allyTeam.forEach(u => { if (u.alive) c.store.dispatch({ type: 'SET_VISUAL', uid: u.uid, _acted: false }); });
                    c.UI.enemyTeam.forEach(u => { if (u.alive) c.store.dispatch({ type: 'SET_VISUAL', uid: u.uid, _acted: false }); });
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
                    lastEntryType = entry.type;
                    if (result && result.isBattleOver) return result;
                    break;
                }
                case 'round-end':
                    await handleRoundEnd(c, entry, log, i); lastEntryType = entry.type; break;
                case 'signal':
                    const logLevel = getState.logLevel();
                    if (logLevel === 'debug') {
                        let sigDiv = document.createElement('div');
                        sigDiv.innerHTML = entry.text + '<br>';
                        document.getElementById('log').appendChild(sigDiv);
                        c.autoScrollLog();
                    }
                    lastEntryType = entry.type;
                    break;
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
            const restored = c._originalSpeed || 600;
            c.speed = restored;
            GlobalStore.set('speed', restored);
            if (typeof window.updateSpeedButtons === 'function') window.updateSpeedButtons();
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

    // 保存初始阵容快照，供"原班再战"使用
    c._originalSnapshot = {
        ally: c.snapshot.ally.map(u => u.clone()),
        enemy: c.snapshot.enemy.map(u => u.clone())
    };
    let battleState = { ally: c.snapshot.ally.map(u => u.clone()), enemy: c.snapshot.enemy.map(u => u.clone()), round: 1, activeBuffs: c.activeBuffs ? c.activeBuffs.map(b => ({...b})) : [], allAllies: c.snapshot.ally.map(u => u.clone()) };
    let isBattleOver = false; let finalWinner = null; let finalStep = null;

    while (!isBattleOver) {
        if (abortSig && abortSig.aborted) return;

        const isFirstAttackRef = { value: true };
        const stepper = createRoundStepper(battleState);
        let lastStep = null;

        for await (const step of stepper) {
            if (abortSig && abortSig.aborted) return;
            await c.waitWhilePaused();
            lastStep = step;

            await playLogEntries(c, step.log, step, isFirstAttackRef);

            if (step.events && step.events.length > 0) {
                c.store.dispatch({ type: 'APPLY_EVENTS', events: step.events });
                c.updateUI(c.UI);
            }
            c.store.dispatch({ type: 'SYNC_BATTLE_STATS', ally: step.ally, enemy: step.enemy });

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
    // 同步更新 39main-state.js 的模块级 gs 变量，否则 updateButtons 里 import 的 gs 仍是旧值
    if (typeof window._syncGs === 'function') window._syncGs('GAMEOVER');
    
    // 强制刷新按钮状态，确保 GAMEOVER 状态下的按钮布局正确生效
    if (typeof window._restoreSpeedFromScroll === 'function') window._restoreSpeedFromScroll();
    if (typeof window.updateButtons === 'function') {
        window.updateButtons();
    }
    c.enableAllButtons();

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
        // 从 snapshot（初始完整名单）合并最终状态，确保阵亡单位也包含在内
        const finalAllyState = finalStep ? finalStep.ally : [];
        const finalEnemyState = finalStep ? finalStep.enemy : [];
        const allyMap = new Map(finalAllyState.map(u => [u.uid, u]));
        const enemyMap = new Map(finalEnemyState.map(u => [u.uid, u]));
        const reportAllies = (c.snapshot.ally || []).map(u => {
            const final = allyMap.get(u.uid);
            return final ? { ...u, hp: final.hp, maxHp: final.maxHp, alive: final.alive, atk: final.atk, def: final.def, pos: final.pos, dmgDealt: final.dmgDealt, dmgTaken: final.dmgTaken, healDone: final.healDone, reboundDone: final.reboundDone, leechDone: final.leechDone, dodgeCount: final.dodgeCount, critCount: final.critCount, survivedRounds: final.survivedRounds, _isDead: final._isDead } : { ...u, alive: false, _isDead: true };
        });
        const reportEnemies = (c.snapshot.enemy || []).map(u => {
            const final = enemyMap.get(u.uid);
            return final ? { ...u, hp: final.hp, maxHp: final.maxHp, alive: final.alive, atk: final.atk, def: final.def, pos: final.pos, dmgDealt: final.dmgDealt, dmgTaken: final.dmgTaken, healDone: final.healDone, reboundDone: final.reboundDone, leechDone: final.leechDone, dodgeCount: final.dodgeCount, critCount: final.critCount, survivedRounds: final.survivedRounds, _isDead: final._isDead } : { ...u, alive: false, _isDead: true };
        });
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
        // 胜利弹幕播完，弹出战报
        if (c.battleResultForInfo && typeof showBattleReport === 'function') {
            showBattleReport(c.UI, c.battleResultForInfo);
        }
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

if (oldScore === 0 || newScore >= oldScore) {
    localStorage.setItem('ming_vote_score_5v5_test', newScore);
}
else if (oldScore - newScore <= 50) {
    localStorage.setItem('ming_vote_score_5v5_test', newScore);
}
else {
    console.error(
        `🚨 阻止可疑积分覆盖：${oldScore} → ${newScore}，下降幅度过大，已忽略写入`,
        '\n调用栈:',
        new Error().stack
    );
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
    if (c._scheduler) { c._scheduler.setSpeed(1); c._scheduler = null; }
}