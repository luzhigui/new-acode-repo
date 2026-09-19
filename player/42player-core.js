// ~33500 bytes | V6.6.0 | 2026-09-19 阵亡清除抽成 setupDeathTimers 并接到从机（从机尸体不再赖场）；方案A：房主 step 捎带倍速、从机跟随；从机注入本地战斗RNG；阶段3：step 捎带 activeBuffs、回合末海克斯走 handlePvpBuffSelection
export const VER = 'player/42player-core.js V6.6.0';

import { eventBus } from '../infra/50-event-bus.js';
import { FX_SIGNALS } from '../infra/55-fx-signals.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { handleBuffSummon, handleBuffDestroy, handleHolyTokenDrop } from './41player-buff-ui.js';
import { createRoundStepper } from '../core/11battle-round.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import { setBattleRng } from '../core/13battle-shared.js';
import { GlobalStore, getState, setState, getPlayerContext } from '../infra/54-global-store.js';
import { createStore, battleReducer } from '../modules/24battle-store.js';
import { STORE_ACTION_TYPES, STAGE_ACTION_TYPES, BUFF_SUBTYPES, BUFF_EFFECT_TYPES, FLY_MODE_TYPES, UNIT_EVENT_TYPES, DROP_TYPES, FLASH_TYPES, CAMP_TYPES, ROLE_TYPES } from '../infra/56-battle-enums.js';

import { handleBuffText, handleInfo, handleRoundStart, handleRoundEnd, shouldStartNewGroup } from './45event-handlers.js';
import { handleAttackGroup } from './46attack-group.js';
import { appendLogHTML, appendLogElement, autoScrollLog, updateRoundDisplay, renderSeparator, renderVictoryLine, setBtnDisabled, setBtnText, initRenderer, initLogScrollControls, showScoreFloat, findUnitByUid } from './47renderer.js';
import { updateGridUI, setGridStore } from '../render/32-grid-render.js';
import { setGridRenderCtx } from '../render/32-grid-render.js';
import { clock } from '../infra/52-clock.js';
import { renderLog } from '../render/30-fact-renderer.js';
import { STAGE_ACTION_DEFS, translateFactsToStageActions } from '../render/31-stage-actions.js';
import { buildBattleReportData, computeVoteResult, grantClearRewards } from './48battle-report.js';
import { handleBuffSelection, handlePvpBuffSelection, handleFlyDirection } from './49battle-flow.js';
import * as net from '../infra/60-net-pvp.js';

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

function applyStageActionToStoreAfter(c, action, pendingDeaths) {
    if (!c.store || !action) return;
    const def = STAGE_ACTION_DEFS[action.kind];
    if (def && def.storeAfter) def.storeAfter(c, action, pendingDeaths);
}



/**
 * UI 只读视图（2026-09-14 状态三轨收敛）。
 * 播放期间 c.UI.allyTeam/enemyTeam 是 battleStore 的一份冗余拷贝，随时可能落后一步。
 * 所有战斗期读点改走本函数：store 有位就现取，没有（开局前/战斗结束后清场）才回退 c.UI。
 * c.UI 仍可写（开局前造队、赛后面板要一份脱离 store 的定稿快照），但不再是读取路径。
 */
export function getUIView(c) {
    const ctx = c || getCtx();
    const fallback = (ctx && ctx.UI) || { allyTeam: [], enemyTeam: [], round: 0, currentResult: null };
    const store = ctx && ctx.store;
    if (!store) return { allyTeam: fallback.allyTeam || [], enemyTeam: fallback.enemyTeam || [], round: fallback.round || 0, currentResult: fallback.currentResult || null, lastSnapshot: fallback.lastSnapshot || null };
    const units = store.getState().units || [];
    return {
        allyTeam: units.filter(u => u.camp === CAMP_TYPES.ALLY),
        enemyTeam: units.filter(u => u.camp === CAMP_TYPES.ENEMY),
        round: store.getState().round || fallback.round || 0,
        currentResult: fallback.currentResult || null,
        lastSnapshot: fallback.lastSnapshot || null
    };
}

function syncStoreFromStep(c, step) {
    if (!c.store || !step) return;
    const oldState = c.store.getState();
    const oldUnitsMap = new Map((oldState.units || []).map(u => [u.uid, u]));
    const preservedTopFields = ['_hasXingFen', '_hasKuaiLe', '_renderFlyMode'];
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

function readRound(c) {
    // 2026-09-14 状态三轨收敛：回合数唯一来源 battleStore；store 未就绪时回退 c.UI.round（开局前）
    if (c && c.store) {
        const r = c.store.getState().round;
        if (r) return r;
    }
    return (c && c.UI && c.UI.round) || 1;
}

function setRound(c, round) {
    if (!c || !round) return;
    if (c.store) c.store.dispatch({ type: STORE_ACTION_TYPES.SET_ROUND, round });
}

/**
 * 阵亡清除：单位 _isDead/alive=false 后 3 秒从 store 移除，尸体与死亡特效随之消失。
 * 房主从机都必须挂——从机不跑引擎，但 syncStoreFromStep 同样会把带 _isDead 的单位灌进 store，
 * 少了这段，从机格子上的尸体会一直赖着不走（且不会进 _removedUids，下一步又被灌回来）。
 */
function setupDeathTimers(c) {
    c._deathTimers = {};
    c.store.subscribe((state) => {
        if (!c.UI) return;
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
}

async function playStepInterleaved(c, step, isFirstAttackRef) {
    const pendingDeaths = [];
    const actions = step.stageActions || [];
    const log = step.log || [];

    // 回合数写入唯一账本（battleStore），渲染层经 readRound 现取
    const roundEntry = log.find(e => e && e.factType === 'roundStart');
    if (roundEntry && roundEntry.data && roundEntry.data.round) setRound(c, roundEntry.data.round);

    const actionsByFactIndex = new Map();
    for (const action of actions) {
        const idx = action.factIndex;
        if (!actionsByFactIndex.has(idx)) actionsByFactIndex.set(idx, []);
        actionsByFactIndex.get(idx).push(action);
    }
    const processedBeforeIndexes = new Set();
    const processedAfterIndexes = new Set();

    // action 完整生命周期：store(前置) → fx(演出) → storeAfter(收尾)
    const runAction = async (action) => {
        applyStageActionToStore(c, action, pendingDeaths);
        if (getActionFx(action) !== 'none') await applyStageActionToFX(c, action);
        applyStageActionToStoreAfter(c, action, pendingDeaths);
    };

    for (let i = 0; i < log.length; i++) {
        const rawEntry = log[i];
        let entries = prepareLogEntry(rawEntry);
        if (entries === null || entries === undefined) {
            const factIndex = i;
            const beforeActions = (actionsByFactIndex.get(factIndex) || []).filter(a => getActionFx(a) !== 'none' && getActionTiming(a) === 'beforeText');
            for (const action of beforeActions) await runAction(action);
            const afterActions = (actionsByFactIndex.get(factIndex) || []).filter(a => getActionFx(a) !== 'none' && getActionTiming(a) === 'afterText');
            for (const action of afterActions) await runAction(action);
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
                const beforeActions = (actionsByFactIndex.get(factIndex) || []).filter(a => getActionFx(a) !== 'none' && getActionTiming(a) === 'beforeText');
                for (const action of beforeActions) {
                    applyStageActionToStore(c, action, pendingDeaths);
                    if (action.nonBlocking) applyStageActionToFX(c, action);
                    else await applyStageActionToFX(c, action);
                    applyStageActionToStoreAfter(c, action, pendingDeaths);
                }
            }

            // 锚点动作：打包成 anchorSpecs 挂到 entry，由 playLineText 打到锚点文本时触发
            if (entry && typeof entry === 'object' && !entry._anchorSpecs && Array.isArray(entry.fxAnchors) && entry.fxAnchors.length > 0) {
                const anchorActions = (actionsByFactIndex.get(factIndex) || []).filter(a => getActionFx(a) !== 'none' && getActionTiming(a) === 'anchor');
                if (anchorActions.length > 0) {
                    entry._anchorSpecs = anchorActions.map(a => {
                        const idx = a.anchorIndex || 0;
                        const anchorText = entry.fxAnchors[idx] || '';
                        return {
                            text: anchorText,
                            cb: () => {
                                applyStageActionToStore(c, a, pendingDeaths);
                                applyStageActionToFX(c, a);
                                applyStageActionToStoreAfter(c, a, pendingDeaths);
                            }
                        };
                    }).filter(s => s.text);
                }
            }

            await playSingleLogEntry(c, entry, step, isFirstAttackRef, factIndex);

            if (!processedAfterIndexes.has(factIndex)) {
                processedAfterIndexes.add(factIndex);
                const afterActions = (actionsByFactIndex.get(factIndex) || []).filter(a => getActionFx(a) !== 'none' && getActionTiming(a) === 'afterText');
                for (const action of afterActions) await runAction(action);
            }
        }
    }

    for (const action of actions) {
        if (action.factIndex == null || !actionsByFactIndex.has(action.factIndex)) {
            applyStageActionToStore(c, action, pendingDeaths);
            if (getActionFx(action) !== 'none') await applyStageActionToFX(c, action);
            applyStageActionToStoreAfter(c, action, pendingDeaths);
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
                let song = c.store ? c.store.getState().units.find(u => u.isSongQingshu) : null;
                if (song) c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: song.uid, _hasXingFen: true });
            }
            lastEntryType = entry.type; break;
        case 'buff-rebound-fortify': await handleBuffText(c, entry, 200); lastEntryType = entry.type; break;
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
                case 'buff-rebound-fortify': await handleBuffText(c, entry, 200); lastEntryType = entry.type; break;
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

    c._removedUids = new Set();

    // 统一时间源：clock 驱动全部 wait/animate；倍速/暂停/快进集中在此同步
    clock.reset();
    clock.start();
    clock.setTimescale(600 / (c.speed || 600));
    GlobalStore.effect('speed', (v) => clock.setTimescale(600 / (v || 600)));
    GlobalStore.effect('isPaused', (v) => { if (v) clock.pause(); else clock.resume(); });

    GlobalStore.effect('fastForwardActive', (isActive) => {
        clock.setFastForward(isActive);
        if (isActive) {
            if (!c._originalSpeed) c._originalSpeed = c.speed;
            c.speed = 1;
        } else {
            const restored = c._originalSpeed || 600;
            c.speed = restored;
            GlobalStore.set('speed', restored);
            const fn = GlobalStore.getUIHandler('updateSpeedButtons'); if (fn) fn();
        }
    });

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

    // 联网对战阶段2：房主通知从机进入战斗（未联网时零副作用）
    const netLinked = net.isNetHost() && net.isConnected();
    if (netLinked) net.sendStart();

    setupDeathTimers(c);

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

    // 2026-09-16 回合历史快照：每回合末存一份定稿（含 buff），供回放/存档/教学读取
    // schema 约定：单位为 clone() 快照（state 字段走 core/17 V2 schema）；快照结构体带 version 便于未来演进
    const SNAPSHOT_VERSION = 1;
    const roundHistory = [];

    while (!isBattleOver) {
        if (abortSig && abortSig.aborted) return;
        const isFirstAttackRef = { value: true };
        const stepper = createRoundStepper(battleState, { ui: true, translateFacts: translateFactsToStageActions });
        let lastStep = null;

        for (const step of stepper) {
            if (abortSig && abortSig.aborted) return;
            lastStep = step;
            if (battleState.activeBuffs) c.activeBuffs = battleState.activeBuffs.map(b => ({ ...b }));
            // 联网对战阶段2：房主跑完一步就发给从机（从机只播，不跑引擎）；阶段3 捎带 activeBuffs
            if (netLinked) net.sendStep(step, c.activeBuffs, getState.speed());
            await playStepInterleaved(c, step, isFirstAttackRef);
            await clock.wait(300);
            if (step.winner) { finalWinner = step.winner; isBattleOver = true; break; }
        }

        if (isBattleOver) { finalStep = lastStep; break; }

        let nextActiveBuffs = c.activeBuffs ? c.activeBuffs.map(b => ({...b, remaining: b.remaining - 1})).filter(b => b.remaining > 0) : [];
        c.activeBuffs = nextActiveBuffs;
        if (c.updateBuffSlots) c.updateBuffSlots();
        if (battleState.round % 3 === 0 && battleState.round > 0) {
            // 联网 PVP 阶段3：双方各选各的（房主统一发选项，从机回传后合并）
            nextActiveBuffs = netLinked
                ? await handlePvpBuffSelection(c, nextActiveBuffs)
                : await handleBuffSelection(c, nextActiveBuffs);
        }

        await handleFlyDirection(c, lastStep, battleState.round);

        const uiXiaoZhao = c.store ? c.store.getState().units.find(u => u.isXiaoZhaoBrother) : null;
        if (uiXiaoZhao && uiXiaoZhao.state._permanentBuffs && lastStep && lastStep.ally) {
            const engineXiaoZhao = lastStep.ally.find(u => u.isXiaoZhaoBrother);
            if (engineXiaoZhao) Object.assign(engineXiaoZhao.state, { _permanentBuffs: uiXiaoZhao.state._permanentBuffs.map(b => ({ ...b })) });
        }
        // 回合定稿：此刻 lastStep 是整回合的最终态，nextActiveBuffs 是下回合将要生效的 buff
        roundHistory.push({
            version: SNAPSHOT_VERSION,
            round: battleState.round,
            ally: lastStep.ally.map(u => u.clone()),
            enemy: lastStep.enemy.map(u => u.clone()),
            activeBuffs: nextActiveBuffs.map(b => ({
                ...b,
                ...(b.cols ? { cols: [...b.cols] } : {}),
                ...(b.rows ? { rows: [...b.rows] } : {})
            }))
        });

        battleState = { ally: lastStep.ally, enemy: lastStep.enemy, round: battleState.round + 1, activeBuffs: nextActiveBuffs, allAllies: battleState.allAllies };

        if (c.autoMode || GlobalStore.get('fastForwardActive')) {
            await clock.wait(300);
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

    await finishBattle(c, finalStep, finalWinner, roundHistory);
}

// 收尾（房主/从机共用）：胜负结算 → 胜利特效 → 战报 → 投票积分 → 历史落库
async function finishBattle(c, finalStep, finalWinner, roundHistory) {
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
            await clock.wait(800);
            if (c.spawnVictoryEffects) c.spawnVictoryEffects(winner, aliveUnits);
        }
        let winColor = winner === '明教' ? 'blue' : 'orange';
        if (c.gs === 'GAMEOVER') renderVictoryLine(`<span class="gold">🎉🏆 <span class="${winColor}">${winner}</span>获得最终胜利！ 🏆🎉</span><br>`);
        autoScrollLog();
        await clock.wait(6000);
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
    // 2026-09-16 历史落库：唯一入口，resetBattleRuntime 清场时一并清掉
    GlobalStore.set('battleHistory', roundHistory);
    c._battleEnded = true;
    c.abortController = null;
    clock.stop();
}

/**
 * 联网对战·阶段2 从机入口。
 * 从机不跑引擎，只把房主发来的 step 播出来——数据源从「本地 stepper」换成「网络 step」，
 * 播放链路（playStepInterleaved）与收尾（finishBattle）与房主完全共用。
 * 房主侧的回合间操作（选 Buff、小昭飞向）都由房主定，从机只管等下一条 step。
 */
export async function playBattleGuest() {
    const c = getCtx();
    if (!c) return;

    c._removedUids = new Set();

    // 时间层与房主一致：从机本地控制演出节奏，不影响房主
    clock.reset();
    clock.start();
    clock.setTimescale(600 / (c.speed || 600));
    GlobalStore.effect('speed', (v) => clock.setTimescale(600 / (v || 600)));
    GlobalStore.effect('isPaused', (v) => { if (v) clock.pause(); else clock.resume(); });

    c.abortController = new AbortController();
    const abortSig = c.abortController.signal;
    c._battleEnded = false;

    // 从机 store 先空着：第一条 step 一到就被房主的整套单位覆盖（syncStoreFromStep 全量替换）
    c.store = createStore({ units: [], round: 1 }, battleReducer);
    GlobalStore.set('battleStore', c.store);
    const setRenderStoreFn = GlobalStore.getUIHandler('setRenderStore');
    if (setRenderStoreFn) setRenderStoreFn(c.store);
    setGridStore(c.store);
    setGridRenderCtx(c);
    c.updateUI();

    // 阵亡清除（与房主共用）：从机没有这段，格子上尸体会永远赖着
    setupDeathTimers(c);

    // 从机不跑引擎，但演出层（getAttackTaunt / getKillTaunt 选台词等）仍会取战斗 RNG，
    // 不注入就会 null.nextInt 崩。本地 RNG 仅供演出文案，不影响战斗结果（结果全部来自房主的 step）
    setBattleRng(new SeededRNG(Date.now() % 1000000));

    initRenderer(c);
    updateRoundDisplay('📜 日志（第1回合）');
    initLogScrollControls(c);

    const isFirstAttackRef = { value: true };
    let isBattleOver = false, finalWinner = null, finalStep = null, firstStep = true;

    while (!isBattleOver) {
        if (abortSig.aborted) return;
        const step = await net.recvStep();
        if (!step) break;   // 断线：recvStep 返回 null，避免主循环挂死
        if (firstStep) {
            // 房主没单独传 snapshot，战报要用，就从首步（回合开始态）取一份
            firstStep = false;
            c.snapshot = { ally: step.ally, enemy: step.enemy };
        }
        finalStep = step;
        // 阶段3：房主捎带 activeBuffs → 从机 buff 槽显示六大派自己的海克斯
        if (step.activeBuffs) {
            c.activeBuffs = step.activeBuffs;
            if (c.updateBuffSlots) c.updateBuffSlots();
        }
        // 方案A：跟随房主倍速。setState.speed 会经 GlobalStore.effect('speed') 自动改 clock.timescale，
        // 两端节奏一致后 step 不会积压，从机也就不会跑到房主前面
        if (step.speed && step.speed !== getState.speed()) setState.speed(step.speed);
        // 与房主一致：每回合重置「是否本回合首次攻击」
        if ((step.log || []).some(e => e && e.factType === 'roundStart')) isFirstAttackRef.value = true;
        await playStepInterleaved(c, step, isFirstAttackRef);
        await clock.wait(300);
        if (step.winner) { finalWinner = step.winner; isBattleOver = true; }
    }

    await finishBattle(c, finalStep, finalWinner, []);
}