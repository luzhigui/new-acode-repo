// V5.7.5 | ~42250 bytes | 2026-08-26 posSwap 补惑心横幅；summon 拼 horseTaunt 台词
export const VER = 'player/42player-core.js V5.7.6';

import { CONFIG } from '../core/01config-5v5-test.js';
import { eventBus } from '../infra/50-event-bus.js';
import { FX_SIGNALS } from '../infra/55-fx-signals.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { handleBuffSummon, handleBuffDestroy, handleHolyTokenDrop } from './41player-buff-ui.js';
import { showBuffPopup } from '../ui/70buff-dialog.js';
import { createRoundStepper } from '../core/11battle-round.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import { getBattleRng } from '../core/13battle-shared.js';
import { GlobalStore, getState, getPlayerContext } from '../infra/54-global-store.js';
import { createStore, battleReducer } from '../modules/24battle-store.js';
import { STORE_ACTION_TYPES, STAGE_ACTION_TYPES, BUFF_SUBTYPES, BUFF_EFFECT_TYPES, FLY_MODE_TYPES, UNIT_EVENT_TYPES, DROP_TYPES, FLASH_TYPES, CAMP_TYPES, ROLE_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';
import { syncStateToUI } from '../core/17-state-keys.js';
import { handleBuffText, handleInfo, handleRoundStart, handleRoundEnd, shouldStartNewGroup } from './45event-handlers.js';
import { handleAttackGroup } from './46attack-group.js';
import { getLogDiv, appendLogHTML, appendLogElement, autoScrollLog, updateRoundDisplay, renderSeparator, renderRoundStart, renderRoundEnd, renderInfoLine, renderVictoryLine, setBtnDisabled, setBtnText, initRenderer, initLogScrollControls, showScoreFloat, findUnitByUid } from './47renderer.js';
import { updateGridUI, setGridStore } from '../render/32-grid-render.js';
import { setGridRenderCtx } from '../render/32-grid-render.js';
import { AnimationScheduler } from './43animation-scheduler.js';
import { renderLog } from '../render/30-fact-renderer.js';
import { STAGE_ACTION_DEFS, translateFactsToStageActions } from '../render/31-stage-actions.js';

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

            // 投影后条目送入 battleLog，供体检规则消费
            {
                const _battleLog = GlobalStore.get('battleLog');
                if (Array.isArray(_battleLog)) _battleLog.push(entry);
            }

            if (shouldStartNewGroup(entry, lastEntryType)) {
                renderSeparator();
            }

            switch (entry.type) {
                case 'info':
                    if (entry.dropKind === DROP_TYPES.TOKEN) {
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
                    // 特效已由导演 stageAction（heal）统一触发，此处只播文本
                    appendLogHTML(entry.text + '<br>');
                    lastEntryType = entry.type;
                    break;
                case 'buff-splash':
                    // 特效已由导演 stageAction（splash）统一触发，此处只播文本
                    appendLogHTML(entry.text + '<br>');
                    lastEntryType = entry.type;
                    break;
                case 'buff-bonus':           await handleBuffText(c, entry); lastEntryType = entry.type; break;
                case 'buff-swap':            await handleBuffText(c, entry); lastEntryType = entry.type; break;
                case 'buff-push':            await handleBuffText(c, entry); lastEntryType = entry.type; break;
                case 'buff-summary':         { appendLogHTML(entry.text + '<br>'); if(entry.buffType==='elite_xingfen'){let song = c.store ? c.store.getState().units.find(u => u.name === '宋青书') : null; if(song)c.store.dispatch({type: STORE_ACTION_TYPES.SET_VISUAL,uid:song.uid,_hasXingFen:true});} lastEntryType = entry.type; } break;
                case 'buff-rebound-fortify': await handleBuffText(c, entry, c.speed/2); lastEntryType = entry.type; break;
                case 'round-start':
                    if (roundResult && roundResult.events && roundResult.events.length > 0) {
                        c.store.dispatch({ type: STORE_ACTION_TYPES.APPLY_EVENTS, events: roundResult.events });
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
                    // 血量事件已移至 handleAttackGroup 末尾延迟应用，此处不再重复
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

function applyStageActionToStore(c, action, pendingDeaths) {
    if (!c.store || !action) return;
    const def = STAGE_ACTION_DEFS[action.kind];
    if (def && def.store) def.store(c, action, pendingDeaths);
}

async function applyStageActionToFX(c, action) {
    if (!action) return;
    const def = STAGE_ACTION_DEFS[action.kind];
    if (def && def.fx) await def.fx(c, action);
}

function rebuildUISnapshotFromStore(c) {
    if (!c.store) return;
    const storeUnits = c.store.getState().units;
    const cloneUnit = (su) => {
        const copyState = {};
        syncStateToUI(su.state, su.uid, copyState);
        return { ...su, state: copyState };
    };
    c.UI.allyTeam = storeUnits.filter(u => u.camp === CAMP_TYPES.ALLY).map(cloneUnit);
    c.UI.enemyTeam = storeUnits.filter(u => u.camp === CAMP_TYPES.ENEMY).map(cloneUnit);
}

function syncStoreFromStep(c, step) {
    if (!c.store || !step) return;
    const units = [...step.ally, ...step.enemy].filter(u => !(c._removedUids && c._removedUids.has(u.uid)));
    c.store.dispatch({ type: STORE_ACTION_TYPES.SET_UNITS, units });
}

// timing 从 STAGE_ACTION_DEFS 读取
function getActionTiming(action) {
    const def = STAGE_ACTION_DEFS[action && action.kind];
    if (!def) return 'beforeText';
    return typeof def.timing === 'function' ? def.timing(action) : (def.timing || 'beforeText');
}

function getActionFx(action) {
    const def = STAGE_ACTION_DEFS[action && action.kind];
    return def && def.fx ? 'has' : 'none';
}

async function playStep(c, step, isFirstAttackRef) {
    const pendingDeaths = [];
    if (step.stageActions && step.stageActions.length > 0) {
        // 1. DEFS 驱动调度：grid（Store 变更)+ beforeText 特效（飞撞/箭矢/子弹时间/伤害飘字等）
        for (let i = 0; i < step.stageActions.length; i++) {
            const action = step.stageActions[i];
            applyStageActionToStore(c, action, pendingDeaths);
            const isBeforeText = getActionFx(action) !== 'none' && getActionTiming(action) !== 'afterText';
            if (isBeforeText) {
                await applyStageActionToFX(c, action);
            }
            // 连击第一击后紧跟横幅时，等飞撞/飞箭播完，避免横幅冻结半空的飞撞
            if (isBeforeText && action.kind === STAGE_ACTION_TYPES.ATTACK && !GlobalStore.get('fastForwardActive')) {
                let nextBeforeText = null;
                for (let j = i + 1; j < step.stageActions.length; j++) {
                    const na = step.stageActions[j];
                    if (getActionFx(na) !== 'none' && getActionTiming(na) !== 'afterText') {
                        nextBeforeText = na;
                        break;
                    }
                }
                if (nextBeforeText && nextBeforeText.kind === STAGE_ACTION_TYPES.BANNER) {
                    const speed = GlobalStore.get('speed') || 1000;
                    const durMs = action.attackerRole === ROLE_TYPES.RANGED ? 1700 : 2500;
                    await new Promise(r => setTimeout(r, durMs * (speed / 1000)));
                }
            }
        }
    }

    // 2. 只播日志文本（playLogEntries 不再触发特效）
    await playLogEntries(c, step.log, step, isFirstAttackRef);

    // 3. afterText：文本后特效（白骨爪/流星溅射/血量线弹幕/miss气泡等）
    // 死亡画笔：日志播完后对最后一行做渐隐
    if (step.stageActions && step.stageActions.length > 0) {
        let brushed = false;
        for (const action of step.stageActions) {
            if (getActionFx(action) !== 'none' && getActionTiming(action) === 'afterText') {
                await applyStageActionToFX(c, action);
            }
            // 死亡画笔：attack/death/dot 任一致死动作都刷最后一行日志（gcd 防重复）
            if (!brushed && action.dead && (action.kind === 'attack' || action.kind === 'death' || action.kind === 'dot')) {
                const logDiv = document.getElementById('log');
                if (logDiv && logDiv.lastElementChild) {
                    brushed = true;
                    eventBus.emit(FX_SIGNALS.BRUSH_EFFECT, { el: logDiv.lastElementChild });
                }
            }
        }
    }

    // 死亡标记在日志播完后落地
    for (const uid of pendingDeaths) {
        const du = c.store.getState().units.find(u => u.uid === uid);
        if (du && !(du.state && du.state._isDead)) {
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_FLASH, uid: uid, flash: FLASH_TYPES.DEAD });
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: uid, _isDead: true });
        }
    }

    syncStoreFromStep(c, step);
}

export async function playBattle() {
    const c = getCtx();
    if (!c || !c.snapshot || !c.snapshot.ally || !c.snapshot.ally.length) return;
    const scheduler = new AnimationScheduler();
    c._scheduler = scheduler;
    c._removedUids = new Set();

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
        ...c.snapshot.ally.map(u => { let u2 = u.clone(); u2.hp = u2.maxHp; u2.alive = true; u2.state._isDead = false; u2.state._acted = false; u2.state._resting = false; u2.state._blocked = false; u2.camp = CAMP_TYPES.ALLY; return u2; }),
        ...c.snapshot.enemy.map(u => { let u2 = u.clone(); u2.hp = u2.maxHp; u2.alive = true; u2.state._isDead = false; u2.state._acted = false; u2.state._resting = false; u2.state._blocked = false; u2.camp = CAMP_TYPES.ENEMY; return u2; })
    ];
    c.store = createStore({ units: initialUnits, round: 1 }, battleReducer);
    GlobalStore.set('battleStore', c.store);
    const setRenderStoreFn = GlobalStore.getUIHandler('setRenderStore');
    if (setRenderStoreFn) setRenderStoreFn(c.store);
    setGridStore(c.store);
    setGridRenderCtx(c);
    c.updateUI();

    c.store.subscribe((state) => {
        if (!c.UI) return;

        if (!c._deathTimers) c._deathTimers = {};
        // 死亡单位 3 秒后才 REMOVE_UNIT，给死亡特效留时间
        for (const su of state.units) {
            if ((su.state && su.state._isDead || su.alive === false) && !c._deathTimers[su.uid]) {
                c._deathTimers[su.uid] = true;
                const uid = su.uid;
                setTimeout(() => {
                    delete c._deathTimers[uid];
                    if (c._removedUids) c._removedUids.add(uid);
                    if (c.store) c.store.dispatch({ type: STORE_ACTION_TYPES.REMOVE_UNIT, uid: uid });
                }, 3000);
            }
        }
    });

    rebuildUISnapshotFromStore(c);
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
        allAllies: c.snapshot.ally.map(u => u.clone())
    };
    if (c.snapshot._rngSeed !== undefined) {
        battleState._rng = new SeededRNG(c.snapshot._rngSeed);
    }
    // 蝶变方向由播放器弹窗获取
    const hasSisterAtStart = battleState.ally && battleState.ally.some(u => u.isXiaoZhaoSister && u.alive);
    if (hasSisterAtStart) {
        const { showFlyDirectionPopup } = await import('../ui/65main-battle.js');
        const direction = await new Promise(resolve => { showFlyDirectionPopup(resolve); });
        battleState.ally._flyDirection = direction || 'right';
    }
    let isBattleOver = false; let finalWinner = null; let finalStep = null;

    while (!isBattleOver) {
        if (abortSig && abortSig.aborted) return;

        const isFirstAttackRef = { value: true };
        const stepper = createRoundStepper(battleState, { ui: true, translateFacts: translateFactsToStageActions });
        let lastStep = null;

        // createRoundStepper 返回普通 generator，for...of 同步迭代
        for (const step of stepper) {
            if (abortSig && abortSig.aborted) return;
            await c.waitWhilePaused();
            lastStep = step;
            await playStep(c, step, isFirstAttackRef);

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
                const allyTeam = c.store.getState().units.filter(u => u.camp === CAMP_TYPES.ALLY && u.alive);
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
                    newBuff = { key: pick, target: CAMP_TYPES.ALLY, remaining: duration, name: CONFIG.BUFFS[pick].name };
                    if (c.store) {
                        const xiaoZhao = c.store.getState().units.find(u => u.isXiaoZhaoBrother && u.alive);
                        if (xiaoZhao) {
                            if (!xiaoZhao.state._permanentBuffs) Object.assign(xiaoZhao.state, { _permanentBuffs: [] });
                            xiaoZhao.state._permanentBuffs.push({ ...newBuff, remaining: Infinity });
                        }
                    }
                    if (pick === BUFF_TYPES.HOLY_FLAME) {
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

        const uiXiaoZhao = c.store ? c.store.getState().units.find(u => u.isXiaoZhaoBrother) : null;
        if (uiXiaoZhao && uiXiaoZhao.state._permanentBuffs && lastStep && lastStep.ally) {
            const engineXiaoZhao = lastStep.ally.find(u => u.isXiaoZhaoBrother);
            if (engineXiaoZhao) {
                Object.assign(engineXiaoZhao.state, { _permanentBuffs: uiXiaoZhao.state._permanentBuffs.map(b => ({ ...b })) });
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

        let aliveUnits = winState ? winState.filter(u => u.alive) : [];
        if (aliveUnits.length > 0) {
            aliveUnits.forEach(u => { c.store.dispatch({ type: STORE_ACTION_TYPES.SET_FLASH, uid: u.uid, flash: FLASH_TYPES.CHEER }); });
            await new Promise(r => setTimeout(r, GlobalStore.get('fastForwardActive') ? 100 : 800));
            if (c.spawnVictoryEffects) c.spawnVictoryEffects(winner, aliveUnits);
        }
        let winColor = winner === '明教' ? 'blue' : 'orange';
        if (c.gs === 'GAMEOVER') renderVictoryLine(`<span class="gold">🎉🏆 <span class="${winColor}">${winner}</span>获得最终胜利！ 🏆🎉</span><br>`);
        autoScrollLog();
        await new Promise(r => setTimeout(r, GlobalStore.get('fastForwardActive') ? 500 : 6000));
        rebuildUISnapshotFromStore(c);
        const showBattleReportFn = GlobalStore.getUIHandler('showBattleReport');
        if (showBattleReportFn && c.battleResultForInfo) {
            showBattleReportFn(c.UI, c.battleResultForInfo);
            // 全自动模式：3 秒后自动关闭战报，保证连关流程不受弹窗阻塞
            if (GlobalStore.get('autoLevel') === 'full-auto') {
                setTimeout(() => {
                    const overlay = document.getElementById('battleReportOverlay');
                    if (overlay) overlay.remove();
                    const float = document.getElementById('battleReportFloat');
                    if (float) float.remove();
                }, 3000);
            }
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