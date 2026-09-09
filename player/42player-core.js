// player/42player-core.js
// V6.0.0 | 2026-09-06 播放器调度重构：按 factIndex 交错日志与特效，修复特效/日志错位
// V6.0.0 | 2026-09-07 属性词条化：syncStoreFromStep 保留 _mods，渲染由 getStat 现算
export const VER = 'player/42player-core.js V6.0.0';

import { eventBus } from '../infra/50-event-bus.js';
import { FX_SIGNALS } from '../infra/55-fx-signals.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { handleBuffSummon, handleBuffDestroy, handleHolyTokenDrop } from './41player-buff-ui.js';
import { createRoundStepper } from '../core/11battle-round.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import { GlobalStore, getState, getPlayerContext } from '../infra/54-global-store.js';
import { createStore, battleReducer } from '../modules/24battle-store.js';
import { STORE_ACTION_TYPES, STAGE_ACTION_TYPES, BUFF_SUBTYPES, BUFF_EFFECT_TYPES, FLY_MODE_TYPES, UNIT_EVENT_TYPES, DROP_TYPES, FLASH_TYPES, CAMP_TYPES, ROLE_TYPES } from '../infra/56-battle-enums.js';
import { syncStateToUI } from '../core/17-state-keys.js';
import { handleBuffText, handleInfo, handleRoundStart, handleRoundEnd, shouldStartNewGroup } from './45event-handlers.js';
import { handleAttackGroup } from './46attack-group.js';
import { getLogDiv, appendLogHTML, appendLogElement, autoScrollLog, updateRoundDisplay, renderSeparator, renderRoundStart, renderRoundEnd, renderInfoLine, renderVictoryLine, setBtnDisabled, setBtnText, initRenderer, initLogScrollControls, showScoreFloat, findUnitByUid } from './47renderer.js';
import { updateGridUI, setGridStore } from '../render/32-grid-render.js';
import { setGridRenderCtx } from '../render/32-grid-render.js';
import { AnimationScheduler } from './43animation-scheduler.js';
import { renderLog } from '../render/30-fact-renderer.js';
import { STAGE_ACTION_DEFS, translateFactsToStageActions } from '../render/31-stage-actions.js';
import { buildBattleReportData, computeVoteResult, grantClearRewards } from './48battle-report.js';
import { handleBuffSelection, handleFlyDirection } from './49battle-flow.js';

function getCtx() { return getPlayerContext(); }

export { clearAllEffects } from './47renderer.js';

function prepareLogEntry(entry) {
    if (!entry || !entry.factType) return entry;
    const rendered = renderLog(entry.factType, entry.data);
    if (Array.isArray(rendered)) return rendered;
    if (rendered && typeof rendered === 'object') {
        const extra = {};
        for (const k in entry) { if (k !== 'factType' && k !== 'data') extra[k] = entry[k]; }
        return Object.assign({}, rendered, extra);
    }
    return rendered;
}

function getActionTiming(action) {
    const def = STAGE_ACTION_DEFS[action && action.kind];
    if (!def) return 'beforeText';
    return typeof def.timing === 'function' ? def.timing(action) : (def.timing || 'beforeText');
}

function getActionFx(action) {
    const def = STAGE_ACTION_DEFS[action && action.kind];
    return def && def.fx ? 'has' : 'none';
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
        return { ...su, state: copyState, _mods: su._mods ? { atk: [...su._mods.atk], def: [...su._mods.def], maxHp: [...su._mods.maxHp] } : { atk: [], def: [], maxHp: [] } };
    };
    c.UI.allyTeam = storeUnits.filter(u => u.camp === CAMP_TYPES.ALLY).map(cloneUnit);
    c.UI.enemyTeam = storeUnits.filter(u => u.camp === CAMP_TYPES.ENEMY).map(cloneUnit);
}

function syncStoreFromStep(c, step) {
    if (!c.store || !step) return;
    const oldState = c.store.getState();
    const oldUnitsMap = new Map((oldState.units || []).map(u => [u.uid, u]));
    const preservedTopFields = ['_hasXingFen', '_hasKuaiLe'];
    const units = [...step.ally, ...step.enemy]
        .filter(u => !(c._removedUids && c._removedUids.has(u.uid)))
        .map(u => {
            const unit = { ...u };
            const oldUnit = oldUnitsMap.get(u.uid);
            if (oldUnit) {
                for (const field of preservedTopFields) { if (oldUnit[field] !== undefined) unit[field] = oldUnit[field]; }
            }
            if (u._mods) unit._mods = { atk: [...u._mods.atk], def: [...u._mods.def], maxHp: [...u._mods.maxHp] };
            else unit._mods = { atk: [], def: [], maxHp: [] };
            return unit;
        });
    c.store.dispatch({ type: STORE_ACTION_TYPES.SET_UNITS, units });
}

async function playStepInterleaved(c, step, isFirstAttackRef) {
    const pendingDeaths = [];
    const actions = step.stageActions || [];
    const log = step.log || [];

    const actionsByFactIndex = new Map();
    for (const action of actions) {
        const idx = action.factIndex;
        if (!actionsByFactIndex.has(idx)) actionsByFactIndex.set(idx, []);
        actionsByFactIndex.get(idx).push(action);
    }
    const processedBeforeIndexes = new Set();
    const processedAfterIndexes = new Set();

    for (let i = 0; i < log.length; i++) {
        const rawEntry = log[i];
        let entries = prepareLogEntry(rawEntry);
        if (entries === null || entries === undefined) {
            const factIndex = i;
            const beforeActions = (actionsByFactIndex.get(factIndex) || []).filter(a => getActionFx(a) !== 'none' && getActionTiming(a) !== 'afterText');
            for (const action of beforeActions) { applyStageActionToStore(c, action, pendingDeaths); await applyStageActionToFX(c, action); }
            const afterActions = (actionsByFactIndex.get(factIndex) || []).filter(a => getActionFx(a) !== 'none' && getActionTiming(a) === 'afterText');
            for (const action of afterActions) { applyStageActionToStore(c, action, pendingDeaths); await applyStageActionToFX(c, action); }
            continue;
        }
        if (!Array.isArray(entries)) entries = [entries];
        const _battleLog = GlobalStore.get('battleLog');
        if (Array.isArray(_battleLog)) { for (const entry of entries) { if (entry) _battleLog.push(entry); } }

        for (let j = 0; j < entries.length; j++) {
            const entry = entries[j];
            const factIndex = i;

            if (!processedBeforeIndexes.has(factIndex)) {
                processedBeforeIndexes.add(factIndex);
                const beforeActions = (actionsByFactIndex.get(factIndex) || []).filter(a => getActionFx(a) !== 'none' && getActionTiming(a) !== 'afterText');
                for (const action of beforeActions) {
                    applyStageActionToStore(c, action, pendingDeaths);
                    if (action.nonBlocking) applyStageActionToFX(c, action);
                    else await applyStageActionToFX(c, action);
                }
            }

            await playSingleLogEntry(c, entry, step, isFirstAttackRef, factIndex);

            if (!processedAfterIndexes.has(factIndex)) {
                processedAfterIndexes.add(factIndex);
                const afterActions = (actionsByFactIndex.get(factIndex) || []).filter(a => getActionFx(a) !== 'none' && getActionTiming(a) === 'afterText');
                for (const action of afterActions) { applyStageActionToStore(c, action, pendingDeaths); await applyStageActionToFX(c, action); }
            }
        }
    }

    for (const action of actions) {
        if (action.factIndex == null || !actionsByFactIndex.has(action.factIndex)) {
            applyStageActionToStore(c, action, pendingDeaths);
            if (getActionFx(action) !== 'none') await applyStageActionToFX(c, action);
        }
    }

    for (const uid of pendingDeaths) {
        const du = c.store.getState().units.find(u => u.uid === uid);
        if (du && !(du.state && du.state._isDead)) {
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_FLASH, uid: uid, flash: FLASH_TYPES.DEAD });
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: uid, _isDead: true });
        }
    }

    const hasDeathAction = actions.some(a => a.dead && (a.kind === STAGE_ACTION_TYPES.ATTACK || a.kind === STAGE_ACTION_TYPES.DEATH || a.kind === STAGE_ACTION_TYPES.DOT));
    if (hasDeathAction) {
        const logDiv = document.getElementById('log');
        if (logDiv && logDiv.lastElementChild) eventBus.emit(FX_SIGNALS.BRUSH_EFFECT, { el: logDiv.lastElementChild });
    }

    syncStoreFromStep(c, step);
}

async function playSingleLogEntry(c, entry, step, isFirstAttackRef, factIndex) {
    let lastEntryType = c._lastLogType || null;
    let abortSig = c.abortController ? c.abortController.signal : null;

    if (shouldStartNewGroup(entry, lastEntryType)) renderSeparator();

    switch (entry.type) {
        case 'info':
            if (entry.dropKind === DROP_TYPES.TOKEN) { await handleHolyTokenDrop(c, entry); lastEntryType = entry.type; break; }
            await handleInfo(c, entry); lastEntryType = entry.type; break;
        case 'buff-summon': await handleBuffSummon(c, entry, null); lastEntryType = entry.type; break;
        case 'buff-destroy': await handleBuffDestroy(c, entry, null); lastEntryType = entry.type; break;
        case 'buff-leech': case 'buff-splash': appendLogHTML(entry.text + '<br>'); lastEntryType = entry.type; break;
        case 'buff-bonus': case 'buff-swap': case 'buff-push': await handleBuffText(c, entry); lastEntryType = entry.type; break;
        case 'buff-summary':
            appendLogHTML(entry.text + '<br>');
            if (entry.buffType === 'elite_xingfen') {
                let song = c.store ? c.store.getState().units.find(u => u.name === '宋青书') : null;
                if (song) c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: song.uid, _hasXingFen: true });
            }
            lastEntryType = entry.type; break;
        case 'buff-rebound-fortify': await handleBuffText(c, entry, c.speed / 2); lastEntryType = entry.type; break;
        case 'round-start':
            if (step.roundResult && step.roundResult.events && step.roundResult.events.length > 0) {
                c.store.dispatch({ type: STORE_ACTION_TYPES.APPLY_EVENTS, events: step.roundResult.events });
                step.roundResult.events = [];
            }
            await handleRoundStart(c, entry, isFirstAttackRef);
            if (step.doubleStrikeUid) c.currentDoubleStrikeUid = step.doubleStrikeUid;
            lastEntryType = entry.type; break;
        case 'attack-group': {
            let result = await handleAttackGroup(c, entry, step, abortSig, isFirstAttackRef);
            lastEntryType = entry.type;
            if (result && result.isBattleOver) return result;
            break;
        }
        case 'round-end': await handleRoundEnd(c, entry, step.log || [], 0); lastEntryType = entry.type; break;
        case 'signal':
            if (getState.logLevel() === 'debug') appendLogHTML(entry.text + '<br>');
            lastEntryType = entry.type; break;
        default: break;
    }

    c._lastLogType = lastEntryType;
    return { isBattleOver: false };
}

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
                if (Array.isArray(rendered)) { log.splice(i, 1, ...rendered); i -= 1; continue; }
                if (rendered && typeof rendered === 'object') {
                    const extra = {};
                    for (const k in entry) { if (k !== 'factType' && k !== 'data') extra[k] = entry[k]; }
                    entry = Object.assign({}, rendered, extra);
                } else { entry = rendered; }
                if (!entry) continue;
            }
            { const _battleLog = GlobalStore.get('battleLog'); if (Array.isArray(_battleLog)) _battleLog.push(entry); }
            if (shouldStartNewGroup(entry, lastEntryType)) renderSeparator();
            switch (entry.type) {
                case 'info': if (entry.dropKind === DROP_TYPES.TOKEN) await handleHolyTokenDrop(c, entry); else await handleInfo(c, entry); lastEntryType = entry.type; break;
                case 'buff-summon': await handleBuffSummon(c, entry, i > 0 ? log[i - 1] : null); lastEntryType = entry.type; break;
                case 'buff-destroy': await handleBuffDestroy(c, entry, i > 0 ? log[i - 1] : null); lastEntryType = entry.type; break;
                case 'buff-leech': case 'buff-splash': appendLogHTML(entry.text + '<br>'); lastEntryType = entry.type; break;
                case 'buff-bonus': case 'buff-swap': case 'buff-push': await handleBuffText(c, entry); lastEntryType = entry.type; break;
                case 'buff-summary': appendLogHTML(entry.text + '<br>'); if (entry.buffType === 'elite_xingfen') { const song = c.store ? c.store.getState().units.find(u => u.name === '宋青书') : null; if (song) c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: song.uid, _hasXingFen: true }); } lastEntryType = entry.type; break;
                case 'buff-rebound-fortify': await handleBuffText(c, entry, c.speed / 2); lastEntryType = entry.type; break;
                case 'round-start': if (roundResult && roundResult.events && roundResult.events.length > 0) { c.store.dispatch({ type: STORE_ACTION_TYPES.APPLY_EVENTS, events: roundResult.events }); roundResult.events = []; } await handleRoundStart(c, entry, isFirstAttackRef); if (roundResult && roundResult.doubleStrikeUid) c.currentDoubleStrikeUid = roundResult.doubleStrikeUid; lastEntryType = entry.type; break;
                case 'attack-group': { const result = await handleAttackGroup(c, entry, roundResult, abortSig, isFirstAttackRef); lastEntryType = entry.type; if (result && result.isBattleOver) return result; break; }
                case 'round-end': await handleRoundEnd(c, entry, log, i); lastEntryType = entry.type; break;
                case 'signal': if (getState.logLevel() === 'debug') appendLogHTML(entry.text + '<br>'); lastEntryType = entry.type; break;
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
        if (c.isPaused) { GlobalStore.set('bulletTimeActive', true); lastTime = now; if (!c._battleEnded) requestAnimationFrame(frameLoop); return; }
        scheduler.paused = false;
        scheduler.tick(Math.min(now - lastTime, 100));
        lastTime = now;
        if (!c._battleEnded) requestAnimationFrame(frameLoop);
    }
    requestAnimationFrame(frameLoop);

    let abortSig = c.abortController ? c.abortController.signal : null;
    c._battleEnded = false;

    const preferredVolume = parseFloat(localStorage.getItem('ming_bgm_volume') || '0.5');
    if (typeof AudioManager !== 'undefined' && AudioManager.setVolume) AudioManager.fadeTo(preferredVolume, 1500);

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

    c._originalSnapshot = { ally: c.snapshot.ally.map(u => u.clone()), enemy: c.snapshot.enemy.map(u => u.clone()) };
    let battleState = {
        ally: c.snapshot.ally.map(u => u.clone()),
        enemy: c.snapshot.enemy.map(u => u.clone()),
        round: 1,
        activeBuffs: c.activeBuffs ? c.activeBuffs.map(b => ({...b})) : [],
        allAllies: c.snapshot.ally.map(u => u.clone())
    };
    if (c.snapshot._rngSeed !== undefined) battleState._rng = new SeededRNG(c.snapshot._rngSeed);
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

        for (const step of stepper) {
            if (abortSig && abortSig.aborted) return;
            await c.waitWhilePaused();
            lastStep = step;
            if (battleState.activeBuffs) c.activeBuffs = battleState.activeBuffs.map(b => ({ ...b }));
            await playStepInterleaved(c, step, isFirstAttackRef);
            await new Promise(r => setTimeout(r, GlobalStore.get('fastForwardActive') ? 1 : Math.max(100, c.speed / 2)));
            if (step.winner) { finalWinner = step.winner; isBattleOver = true; break; }
        }

        if (isBattleOver) { finalStep = lastStep; break; }

        let nextActiveBuffs = c.activeBuffs ? c.activeBuffs.map(b => ({...b, remaining: b.remaining - 1})).filter(b => b.remaining > 0) : [];
        c.activeBuffs = nextActiveBuffs;
        if (c.updateBuffSlots) c.updateBuffSlots();
        if (battleState.round % 3 === 0 && battleState.round > 0) {
            nextActiveBuffs = await handleBuffSelection(c, nextActiveBuffs);
        }

        await handleFlyDirection(c, lastStep, battleState.round);

        const uiXiaoZhao = c.store ? c.store.getState().units.find(u => u.isXiaoZhaoBrother) : null;
        if (uiXiaoZhao && uiXiaoZhao.state._permanentBuffs && lastStep && lastStep.ally) {
            const engineXiaoZhao = lastStep.ally.find(u => u.isXiaoZhaoBrother);
            if (engineXiaoZhao) Object.assign(engineXiaoZhao.state, { _permanentBuffs: uiXiaoZhao.state._permanentBuffs.map(b => ({ ...b })) });
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
    grantClearRewards(winner, c.currentStage);
    if (winner === '明教' || winner === '六大派') {
        renderSeparator();
        c.battleResultForInfo = buildBattleReportData(finalStep, c.snapshot, winner);

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
        renderSeparator();
        renderVictoryLine('<span class="gray">🤝 平局！积分不变</span><br>');
        autoScrollLog();
    }

    let mainCtx = getPlayerContext();
    if (mainCtx && mainCtx.activeBuffs) mainCtx.activeBuffs = [];
    if (mainCtx && mainCtx.updateBuffSlots) mainCtx.updateBuffSlots();
    GlobalStore.set('glowColors', -1);

    const voteChoice = GlobalStore.get('voteChoice');
    const result = computeVoteResult(winner, voteChoice, GlobalStore.get('battleHasZhang'), GlobalStore.get('voteScore'));
    if (result.voteMsg) {
        if (c.gs === 'GAMEOVER') renderVictoryLine(result.voteMsg + '<br>');
    }
    GlobalStore.set('voteScore', result.newScore);
    if (result.earnPoints !== 0) showScoreFloat(result.earnPoints);
    if (result.shouldPersist) {
        localStorage.setItem('ming_vote_score_5v5_test', String(result.newScore));
    }
    GlobalStore.set('voteChoice', null);
    c._battleEnded = true;
    c.abortController = null;
    c.store = null;
    if (c._scheduler) { c._scheduler.setSpeed(1); c._scheduler = null; }
}