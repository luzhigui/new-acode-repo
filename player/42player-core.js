// player/42player-core.js - 光明顶5v5 战斗播放器核心
// V5.5.2 | ~29509 bytes| 2026-08-19 import 路径合并至 infra/51-core-utils
export const VER = 'player/42player-core.js V5.5.2';

import { showBuffBanner, showHealFloat, showWindClaw, showSplashArrows, showDamageFloat } from '../fx/87fx-manager.js';
import { CONFIG } from '../core/01config-5v5-test.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { handleBuffSummon, handleBuffDestroy, handleBuffLeech, handleHolyTokenDrop } from './41player-buff-ui.js';
import { showBuffPopup } from '../ui/70buff-dialog.js';
import { createRoundStepper } from '../core/11battle-round.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import { getBattleRng } from '../core/13battle-shared.js';
import { GlobalStore, getState, getPlayerContext } from '../infra/54-global-store.js';
import { createStore, battleReducer, GAME_STATE_FIELDS } from '../modules/24battle-store.js';
import { handleBuffBonus, handleBuffSwap, handleBuffPush, handleBuffReboundFortify, handleInfo, handleRoundStart, handleRoundEnd, shouldStartNewGroup } from './45event-handlers.js';
import { handleAttackGroup } from './46attack-group.js';
import { getLogDiv, appendLogHTML, appendLogElement, autoScrollLog, updateRoundDisplay, renderSeparator, renderRoundStart, renderRoundEnd, renderInfoLine, renderVictoryLine, setBtnDisabled, setBtnText, initRenderer, initLogScrollControls, showScoreFloat, findUnitByUid } from './47renderer.js';
import { updateGridUI, setGridStore } from '../render/32-grid-render.js';
import { setGridRenderCtx } from '../render/32-grid-render.js';
import { AnimationScheduler } from './43animation-scheduler.js';
import { renderLog } from '../render/30-fact-renderer.js';

function getCtx() {
    return getPlayerContext();
}

export { clearAllEffects } from './47renderer.js';

export async function playLogEntries(c, log, roundResult, isFirstAttackRef) {
    let abortSig = c.abortController ? c.abortController.signal : null;
    let lastEntryType = c._lastLogType || null;

    try {
        for (let i = 0; i < log.length; i++) {
            if (abortSig && abortSig.aborted) return { isBattleOver: false };
            await c.waitWhilePaused();
            let entry = log[i];

            // ★ fact 投影：结构化事实 → 渲染条目
            if (entry && entry.factType) {
                const rendered = renderLog(entry.factType, entry.data);
                if (Array.isArray(rendered)) {
                    log.splice(i, 1, ...rendered);
                    i -= 1;
                    continue;
                }
                if (rendered && typeof rendered === 'object') {
                    const extra = {};
                    for (const k in entry) {
                        if (k !== 'factType' && k !== 'data') extra[k] = entry[k];
                    }
                    entry = Object.assign({}, rendered, extra);
                } else {
                    entry = rendered;
                }
                if (!entry) continue;
            }

            if (shouldStartNewGroup(entry, lastEntryType)) {
                renderSeparator();
            }

            switch (entry.type) {
                case 'info':
                    if (entry.dropKind === 'token') {
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
                        appendLogHTML(entry.text + '<br>');
                        let healUnit = findUnitByUid(c, entry.healUnitUid);
                        if (healUnit && entry.healAmount) {
                            showHealFloat(healUnit, entry.healAmount);
                        }
                        c.isPaused = true; GlobalStore.set('bulletTimeActive', true);
                        let bannerText = entry.isDouble ? '❤️‍🔥 热血奋战(翻倍)！' : '❤️ 热血奋战！';
                        await showBuffBanner(bannerText);
                        GlobalStore.set('bulletTimeActive', false); c.isPaused = false;
                    } else {
                        await handleBuffLeech(c, entry);
                    }
                    lastEntryType = entry.type;
                    break;
                case 'buff-splash':
                    c.isPaused = true; GlobalStore.set('bulletTimeActive', true);
                    if (entry.buffType === 'wind_assault') {
                        await showBuffBanner('🦅 乘风突袭！');
                        if (entry.splashUids) {
                            entry.splashUids.forEach(uid => {
                                const targetUnit = findUnitByUid(c, uid);
                                if (targetUnit) showWindClaw(targetUnit);
                            });
                        }
                    }
                    else if (entry.buffType === 'meteor_splash') {
                        await showBuffBanner('☄️ 流星赶月！');
                        if (entry.attackerUid && entry.primaryUid && entry.splashUids && entry.splashUids.length > 0) {
                            let attacker = findUnitByUid(c, entry.attackerUid);
                            let primary = findUnitByUid(c, entry.primaryUid);
                            let splashTargets = entry.splashUids.map(uid => findUnitByUid(c, uid)).filter(u => u);
                            if (attacker && primary && splashTargets.length > 0) {
                                showSplashArrows(attacker, primary, splashTargets, c.speed, () => c.isPaused);
                                splashTargets.forEach((st, i) => {
                                    setTimeout(() => {
                                        AudioManager.playSfx(attacker.role || '远程');
                                    }, i * 120);
                                });
                            }
                        }
                    }
                    else await showBuffBanner('🦅 乘风突袭！');
                    GlobalStore.set('bulletTimeActive', false);
                    appendLogHTML(entry.text + '<br>');
                    if (entry.splashUids && entry.splashDmg) {
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
                    if (entry.buffType === 'meteor_splash') await new Promise(r=>setTimeout(r, GlobalStore.get('fastForwardActive') ? 1 : 600));
                    c.isPaused = false;
                    lastEntryType = entry.type;
                    break;
                case 'buff-bonus':           await handleBuffBonus(c, entry); lastEntryType = entry.type; break;
                case 'buff-swap':            await handleBuffSwap(c, entry); lastEntryType = entry.type; break;
                case 'buff-push':            await handleBuffPush(c, entry); lastEntryType = entry.type; break;
                case 'buff-summary':         { appendLogHTML(entry.text + '<br>'); if(entry.buffType==='elite_xingfen'){let song = c.store ? c.store.getState().units.find(u => u.name === '宋青书') : null; if(song)c.store.dispatch({type:'SET_VISUAL',uid:song.uid,_hasXingFen:true});} lastEntryType = entry.type; } break;
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
                    if (getState.logLevel() === 'debug') {
                        appendLogHTML(entry.text + '<br>');
                    }
                    lastEntryType = entry.type;
                    break;
            }

            if (abortSig && abortSig.aborted) return { isBattleOver: false };
        }
    } catch (e) {
        GlobalStore.set('bulletTimeActive', false);
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
            GlobalStore.set('speedButtonsNeedUpdate', true);
            if (c._scheduler && c._scheduler.setSpeed) c._scheduler.setSpeed(1);
        }
    });

    let lastTime = performance.now();
    function frameLoop() {
        const now = performance.now();
        if (c.isPaused) {
            GlobalStore.set('bulletTimeActive', true);
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

    const preferredVolume = parseFloat(localStorage.getItem('ming_bgm_volume') || '0.5');
    if (typeof AudioManager !== 'undefined' && AudioManager.setVolume) {
        AudioManager.fadeTo(preferredVolume, 1500);
    }

    const initialUnits = [
        ...c.snapshot.ally.map(u => { let u2 = u.clone(); u2.hp = u2.maxHp; u2.alive = true; u2.state._isDead = false; u2._flash = null; u2.state._acted = false; u2.state._resting = false; u2.state._blocked = false; u2.camp = 'ally'; return u2; }),
        ...c.snapshot.enemy.map(u => { let u2 = u.clone(); u2.hp = u2.maxHp; u2.alive = true; u2.state._isDead = false; u2._flash = null; u2.state._acted = false; u2.state._resting = false; u2.state._blocked = false; u2.camp = 'enemy'; return u2; })
    ];
    c.store = createStore({ units: initialUnits, round: 1 }, battleReducer);
    GlobalStore.set('battleStore', c.store);
    const setRenderStoreFn = GlobalStore.getUIHandler('setRenderStore');
    if (setRenderStoreFn) setRenderStoreFn(c.store);
    setGridStore(c.store);
    setGridRenderCtx(c);
    c.updateUI();

    // UI 快照整体重建：从 store 克隆单位到 c.UI，保证 c.UI 只读且与 store 一致
    function rebuildUISnapshotFromStore() {
        if (!c.store) return;
        const storeUnits = c.store.getState().units;
        const cloneUnit = (su) => {
            const copyState = {};
            ['_acted','_stunned','_isDead','_resting','_blocked','_flyMode','_butterflyHost','_spiderFlying','_spiderTriggeredHit','_spiderTriggered70','_spiderTriggered40','_spiderTriggeredDeath','_spiderTriggeredThisRound','_phantomTarget'].forEach(f => { if (su.state && su.state[f] !== undefined) copyState[f] = su.state[f]; });
            return { ...su, state: copyState };
        };
        c.UI.allyTeam = storeUnits.filter(u => u.camp === 'ally').map(cloneUnit);
        c.UI.enemyTeam = storeUnits.filter(u => u.camp === 'enemy').map(cloneUnit);
    }

    c.store.subscribe((state) => {
        if (!c.UI || !c.UI.allyTeam || !c.UI.enemyTeam) return;
        // UI 单源化：不再逐字段同步 c.UI，快照由每步结束后的 rebuildUISnapshotFromStore 整体重建
        // 新增单位：store 有而 c.UI 快照没有的，补进快照
        const mergeNewUnits = (camp) => {
            const dst = camp === 'ally' ? c.UI.allyTeam : c.UI.enemyTeam;
            for (const su of state.units.filter(u => u.camp === camp)) {
                if (!dst.find(u => u.uid === su.uid)) {
                    const copyState = {};
                    ['_acted','_stunned','_isDead','_resting','_blocked','_flyMode','_butterflyHost','_spiderFlying','_spiderTriggeredHit','_spiderTriggered70','_spiderTriggered40','_spiderTriggeredDeath','_spiderTriggeredThisRound','_phantomTarget'].forEach(f => { if (su.state && su.state[f] !== undefined) copyState[f] = su.state[f]; });
                    dst.push({...su, state: copyState});
                }
            }
        };
        mergeNewUnits('ally');
        mergeNewUnits('enemy');
        // 移除单位：c.UI 快照有而 store 没有的，从快照剔除
        const removeStaleUnits = (camp) => {
            const liveUids = new Set(state.units.filter(u => u.camp === camp).map(u => u.uid));
            if (camp === 'ally') c.UI.allyTeam = c.UI.allyTeam.filter(u => liveUids.has(u.uid));
            else c.UI.enemyTeam = c.UI.enemyTeam.filter(u => liveUids.has(u.uid));
        };
        removeStaleUnits('ally');
        removeStaleUnits('enemy');

        if (!c._deathTimers) c._deathTimers = {};
        for (const su of state.units) {
            if ((su._isDead || su.alive === false) && !c._deathTimers[su.uid]) {
                c._deathTimers[su.uid] = true;
                const uid = su.uid;
                setTimeout(() => {
                    if (!c._deadUnitsForReport) c._deadUnitsForReport = [];
                    const dead = findUnitByUid(c, uid);
                    if (dead && !c._deadUnitsForReport.find(u => u.uid === uid)) {
                        c._deadUnitsForReport.push({...dead});
                    }
                    delete c._deathTimers[uid];
                    if (c.store) c.store.dispatch({ type: 'REMOVE_UNIT', uid: uid });
                }, 3000);
            }
        }
    });

    rebuildUISnapshotFromStore();
    c._deadUnitsForReport = [];
    initRenderer(c);
    updateRoundDisplay('📜 日志（第1回合）');

    initLogScrollControls(c);

    c._originalSnapshot = {
        ally: c.snapshot.ally.map(u => u.clone()),
        enemy: c.snapshot.enemy.map(u => u.clone())
    };
    let battleState = {
        ally: c.snapshot.ally.map(u => u.clone()),
        enemy: c.snapshot.enemy.map(u => u.clone()),
        round: 1,
        activeBuffs: c.activeBuffs ? c.activeBuffs.map(b => ({...b})) : [],
        allAllies: c.snapshot.ally.map(u => u.clone()),
        requestFlyDirection: async () => {
            const { showFlyDirectionPopup } = await import('../ui/65main-battle.js');
            return await new Promise(resolve => { showFlyDirectionPopup(resolve); });
        }
    };
    if (c.snapshot._rngSeed !== undefined) {
        battleState._rng = new SeededRNG(c.snapshot._rngSeed);
    }
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
            }
            c.store.dispatch({ type: 'SYNC_BATTLE_STATS', ally: step.ally, enemy: step.enemy });
            rebuildUISnapshotFromStore();

            await new Promise(r => setTimeout(r, GlobalStore.get('fastForwardActive') ? 1 : Math.max(100, c.speed / 2)));

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
        if (battleState.round % 3 === 0 && battleState.round > 0) {
            const mainCtx2 = getPlayerContext();
            const isFullAuto = mainCtx2 && mainCtx2.autoLevel === 'full-auto';
            appendLogHTML(`<span class="gold">✨ 请选择新的Buff（持续${CONFIG.BUFF_DURATION || 4}回合）</span><br>`);
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
                    const rng = getBattleRng();
                    const pick = available[rng.nextInt(0, available.length - 1)];
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
                        newBuff.col = getBattleRng().nextInt(1, 3);
                        newBuff.row = getBattleRng().nextInt(1, 3);
                    }
                }
                appendLogHTML(`<span class="gold">🤖 自动选择Buff：${newBuff ? newBuff.name : '无'}</span><br>`);
            } else {
                c.isPaused = true;
                newBuff = await showBuffPopup(c);
            }
            if (newBuff) {
                nextActiveBuffs = [...(nextActiveBuffs || []), newBuff];
                appendLogHTML(`<span class="gold">✨ 获得Buff：${newBuff.name}（持续${newBuff.remaining}回合）</span><br>`);
                let mainCtx = getPlayerContext();
                if (mainCtx) { mainCtx.activeBuffs = nextActiveBuffs; if (mainCtx.updateBuffSlots) mainCtx.updateBuffSlots(); }
            }
            c.isPaused = false;
        }

        const nextRound = battleState.round + 1;
        if (!GlobalStore.get('fastForwardActive') && nextRound % 3 === 1 && lastStep) {
            const hasSister = lastStep.ally && lastStep.ally.some(u => u.isXiaoZhaoSister && u.alive);
            if (hasSister) {
                c.isPaused = true;
                const { showFlyDirectionPopup } = await import('../ui/65main-battle.js');
                const direction = await new Promise(resolve => {
                    showFlyDirectionPopup(resolve);
                });
                if (!lastStep.ally._flyDirection) lastStep.ally._flyDirection = 'right';
                lastStep.ally._flyDirection = direction;
                c.isPaused = false;
            }
        }

        // 同步小昭·妹永久海克斯到下一回合引擎单位，保证本场后续回合生效
        const uiXiaoZhao = c.UI && c.UI.allyTeam ? c.UI.allyTeam.find(u => u.isXiaoZhaoBrother) : null;
        if (uiXiaoZhao && uiXiaoZhao._permanentBuffs && lastStep && lastStep.ally) {
            const engineXiaoZhao = lastStep.ally.find(u => u.isXiaoZhaoBrother);
            if (engineXiaoZhao) {
                engineXiaoZhao._permanentBuffs = uiXiaoZhao._permanentBuffs.map(b => ({ ...b }));
            }
        }
        battleState = { ally: lastStep.ally, enemy: lastStep.enemy, round: battleState.round + 1, activeBuffs: nextActiveBuffs, allAllies: battleState.allAllies };

        if (c.autoMode || GlobalStore.get('fastForwardActive')) {
            await new Promise(r=>setTimeout(r, GlobalStore.get('fastForwardActive') ? 1 : c.speed/2));
        } else {
            setBtnDisabled('btnNext', false);
            c.waitingForNextRound = true;
            await new Promise((resolve) => {
                let check = setInterval(() => { if (!c.waitingForNextRound || (abortSig && abortSig.aborted)) { clearInterval(check); resolve(); } }, 200);
            });
            if (abortSig && abortSig.aborted) return;
            c.waitingForNextRound = false;
            setBtnDisabled('btnNext', true);
        }
    }

    if (!finalWinner) finalWinner = '平局';
    c.gs = 'GAMEOVER'; c.isPaused = false; c.waitingForNextRound = false; c.isBattleStarting = false;
    GlobalStore.set('fastForwardActive', false);
    GlobalStore.set('gs', 'GAMEOVER');
    
    GlobalStore.set('restoreSpeed', true);
    c.enableAllButtons();

    let winner = finalWinner;
    if (winner === '明教' && c.currentStage) {
        const stage = c.currentStage;
        const killRate = [0, 1.5, 2, 2.5, 4, 5.5, 6][stage] / 100;
        const clearRate = stage === 5 ? killRate * 6 : killRate * 5;
        if (getBattleRng().next() < clearRate) {
            const currentToken = GlobalStore.get('holyToken') || 0;
            GlobalStore.set('holyToken', currentToken + 1);
            localStorage.setItem('ming_holy_token_5v5_test', String(currentToken + 1));
            renderVictoryLine(`<span class="gold">🔥 通关奖励：获得1枚圣火令！当前总数：${currentToken + 1}</span><br>`);
        }
    }
    if (winner === '明教' && c.currentStage) {
        const chestClearRate = 1 / 100;
        if (getBattleRng().next() < chestClearRate) {
            let chests = parseInt(localStorage.getItem('ming_chest_count') || '0');
            chests++;
            localStorage.setItem('ming_chest_count', String(chests));
            GlobalStore.set('chestCount', chests);
            renderVictoryLine(`<span class="gold">🎁 通关宝箱：获得1个宝箱！当前总数：${chests}</span><br>`);
        }
    }
    if (winner === '明教' || winner === '六大派') {
        const finalAllyState = finalStep ? finalStep.ally : [];
        const finalEnemyState = finalStep ? finalStep.enemy : [];
        const allyMap = new Map(finalAllyState.map(u => [u.uid, u]));
        const enemyMap = new Map(finalEnemyState.map(u => [u.uid, u]));
        const reportAllies = (c.snapshot.ally || []).map(u => {
            const final = allyMap.get(u.uid);
            return final ? { ...u, hp: final.hp, maxHp: final.maxHp, alive: final.alive, atk: final.atk, def: final.def, pos: final.pos, dmgDealt: final.dmgDealt, dmgTaken: final.dmgTaken, healDone: final.healDone, reboundDone: final.reboundDone, leechDone: final.leechDone, dodgeCount: final.dodgeCount, critCount: final.critCount, survivedRounds: final.survivedRounds, _isDead: final.state._isDead } : { ...u, alive: false, _isDead: true };
        });
        const reportEnemies = (c.snapshot.enemy || []).map(u => {
            const final = enemyMap.get(u.uid);
            return final ? { ...u, hp: final.hp, maxHp: final.maxHp, alive: final.alive, atk: final.atk, def: final.def, pos: final.pos, dmgDealt: final.dmgDealt, dmgTaken: final.dmgTaken, healDone: final.healDone, reboundDone: final.reboundDone, leechDone: final.leechDone, dodgeCount: final.dodgeCount, critCount: final.critCount, survivedRounds: final.survivedRounds, _isDead: final.state._isDead } : { ...u, alive: false, _isDead: true };
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
            await new Promise(r => setTimeout(r, GlobalStore.get('fastForwardActive') ? 100 : 800));
            if (c.spawnVictoryEffects) c.spawnVictoryEffects(winner, aliveUnits);
        }
        let winColor = winner === '明教' ? 'blue' : 'orange';
        if (c.gs === 'GAMEOVER') renderVictoryLine(`<span class="gold">🎉🏆 <span class="${winColor}">${winner}</span>获得最终胜利！ 🏆🎉</span><br>`);
        autoScrollLog();
        await new Promise(r => setTimeout(r, GlobalStore.get('fastForwardActive') ? 500 : 6000));
        const showBattleReportFn = GlobalStore.getUIHandler('showBattleReport');
        if (showBattleReportFn && c.battleResultForInfo) {
            showBattleReportFn(c.UI, c.battleResultForInfo);
        }
    } else {
        renderVictoryLine('<span class="gray">🤝 平局！积分不变</span><br>');
        autoScrollLog();
    }

    let mainCtx = getPlayerContext();
    if (mainCtx && mainCtx.activeBuffs) mainCtx.activeBuffs = [];
    if (mainCtx && mainCtx.updateBuffSlots) mainCtx.updateBuffSlots();
    GlobalStore.set('glowColors', -1);

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
        showScoreFloat(earnPoints);
        let voteMsg = correct ? `<span class="green">📊 你猜了${GlobalStore.get('voteChoice')}，正确！+${earnPoints}分！ 当前积分：${GlobalStore.get('voteScore')}</span>` : `<span class="red">📊 你猜了${GlobalStore.get('voteChoice')}，错误！-1分！当前积分：${GlobalStore.get('voteScore')}</span>`;
        if (c.gs === 'GAMEOVER') { renderVictoryLine(voteMsg + '<br>'); }
    } else if (winner === '平局') {
        renderVictoryLine('<span class="gray">📊 平局，积分不变，当前积分：' + GlobalStore.get('voteScore') + '</span><br>');
    }
    GlobalStore.set('voteChoice', null);
    c._battleEnded = true;
    c.abortController = null;
    c.store = null;
    if (c._scheduler) { c._scheduler.setSpeed(1); c._scheduler = null; }
}