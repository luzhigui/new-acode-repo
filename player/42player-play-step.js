// player/42player-play-step.js — 单步日志交错播放（stageAction 生命周期 + 逐条日志分发）
// V1.0.0 | 2026-10-18 | ~9800 bytes
//   playStepInterleaved / playSingleLogEntry 整块迁入。三条播放路径（单机/从机/回放）共用本文件。
export const VER = 'player/42player-play-step.js V1.0.0';

import { eventBus } from '../infra/50-event-bus.js';
import { FX_SIGNALS } from '../infra/55-fx-signals.js';
import { GlobalStore, getState } from '../infra/54-global-store.js';
import { STORE_ACTION_TYPES, FLASH_TYPES, STAGE_ACTION_TYPES, DROP_TYPES } from '../infra/56-battle-enums.js';

import { handleBuffSummon, handleBuffDestroy, handleHolyTokenDrop } from './41player-buff-ui.js';
import { handleBuffText, handleInfo, handleRoundStart, handleRoundEnd, shouldStartNewGroup } from './45event-handlers.js';
import { handleAttackGroup } from './46attack-group.js';
import { appendLogHTML, renderSeparator } from './47renderer.js';
import { setRound, syncStoreFromStep } from './42player-step-sync.js';
import {
    prepareLogEntry, getActionTiming, getActionFx, hasStageWork,
    applyStageActionToStore, applyStageActionToFX, applyStageActionToStoreAfter
} from './42player-stage-actions.js';

export async function playStepInterleaved(c, step, isFirstAttackRef) {
    const pendingDeaths = [];
    const actions = step.stageActions || [];
    const log = step.log || [];

    // 原始 fact 累积：供 ui/64 的走势分析直接消费（不经渲染层反推）
    const _bf = GlobalStore.get('battleFacts');
    if (Array.isArray(_bf)) { for (const _e of log) _bf.push(_e); }

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
            const beforeActions = (actionsByFactIndex.get(factIndex) || []).filter(a => hasStageWork(a) && getActionTiming(a) === 'beforeText');
            for (const action of beforeActions) await runAction(action);
            const afterActions = (actionsByFactIndex.get(factIndex) || []).filter(a => hasStageWork(a) && getActionTiming(a) === 'afterText');
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
                const beforeActions = (actionsByFactIndex.get(factIndex) || []).filter(a => hasStageWork(a) && getActionTiming(a) === 'beforeText');
                for (const action of beforeActions) {
                    applyStageActionToStore(c, action, pendingDeaths);
                    if (action.nonBlocking) applyStageActionToFX(c, action);
                    else await applyStageActionToFX(c, action);
                    applyStageActionToStoreAfter(c, action, pendingDeaths);
                }
            }

            // 锚点动作：打包成 anchorSpecs 挂到 entry，由 playLineText 打到锚点文本时触发
            if (entry && typeof entry === 'object' && !entry._anchorSpecs && Array.isArray(entry.fxAnchors) && entry.fxAnchors.length > 0) {
                const anchorActions = (actionsByFactIndex.get(factIndex) || []).filter(a => hasStageWork(a) && getActionTiming(a) === 'anchor');
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
                const afterActions = (actionsByFactIndex.get(factIndex) || []).filter(a => hasStageWork(a) && getActionTiming(a) === 'afterText');
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