// player/504-player-play-step.js — 单步日志交错播放（stageAction 生命周期 + 逐条日志分发）
//   playStepInterleaved / playSingleLogEntry 整块迁入。三条播放路径（单机/从机/回放）共用本文件。
export const VER = 'player/504-player-play-step.js V1.1.2';

import { eventBus } from '../infra/101-event-bus.js';
import { FX_SIGNALS } from '../infra/105-fx-signals.js';
import { GlobalStore, getState } from '../infra/104-global-store.js';
import { STORE_ACTION_TYPES, FLASH_TYPES, STAGE_ACTION_TYPES, DROP_TYPES } from '../infra/106-battle-enums.js';

import { handleBuffSummon, handleBuffDestroy, handleHolyTokenDrop } from './502-player-buff-ui.js';
import { handleBuffText, handleInfo, handleRoundStart, handleRoundEnd, shouldStartNewGroup } from './508-event-handlers.js';
import { handleAttackGroup } from './509-attack-group.js';
import { appendLogHTML, renderSeparator } from './510-renderer.js';
import { setRound, syncStoreFromStep } from './506-player-step-sync.js';
import {
    prepareLogEntry, getActionTiming, getActionFx, hasStageWork,
    applyStageActionToStore, applyStageActionToFX, applyStageActionToStoreAfter
} from './505-player-stage-actions.js';

export async function playStepInterleaved(c, step, isFirstAttackRef) {
    const pendingDeaths = [];
    const actions = step.stageActions || [];
    const log = step.log || [];

    // 修复圣火不熄等「复活」在步首被 UI 忽略的问题：
    // 引擎在回合开始已经把他改活，但 UI 步末才同步。若清尸 timer 先触发，画面会先变空、再变尸体、最后才活。
    // 此处检测到「Store 里已死，但 step 里复活」的单位，立刻同步一次，让他当帧变成绿格。
    if (c.store && (step.ally || step.enemy)) {
        const storeUnits = c.store.getState().units || [];
        const stepUnits = [...(step.ally || []), ...(step.enemy || [])];
        let hasRevive = false;
        for (const su of stepUnits) {
            if (su.alive === true && su.state && !su.state._isDead) {
                const st = storeUnits.find(x => x.uid === su.uid);
                if (!st || st.alive === false || (st.state && st.state._isDead)) {
                    hasRevive = true;
                    break;
                }
            }
        }
        if (hasRevive) {
            syncStoreFromStep(c, step);
            if (typeof c.updateUI === 'function') c.updateUI(); // 强制重绘网格
        }
    }

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

            // 特效动作：打包成 fx 回调挂到 entry，整行开始播放时统一触发（不再等文字打到某个词）
            //   触发依据是数据里的 fx 字段（[{kind, amount}]），文案怎么改都不影响。
            if (entry && typeof entry === 'object' && !entry._fxSpecs && Array.isArray(entry.fx) && entry.fx.length > 0) {
                const fxActions = (actionsByFactIndex.get(factIndex) || []).filter(a => hasStageWork(a) && getActionTiming(a) === 'anchor');
                if (fxActions.length > 0) {
                    entry._fxSpecs = fxActions.map((a) => ({
                        cb: () => {
                            applyStageActionToStore(c, a, pendingDeaths);
                            applyStageActionToFX(c, a);
                            applyStageActionToStoreAfter(c, a, pendingDeaths);
                        }
                    }));
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

    // 顺序铁律（2026-11-07）：血归零 → 死亡特效 → 结算。
    //   syncStoreFromStep 是整步血量/生死的唯一权威落账点，必须排在死亡红叉之前：
    //   先 SET_UNITS（hp=0 + alive=false），再切 DEAD 态，避免「特效先播、血条还没归零」。
    syncStoreFromStep(c, step);

    for (const uid of pendingDeaths) {
        const du = c.store.getState().units.find(u => u.uid === uid);
        // 复活（圣火不熄）：引擎本步已报活，不再补死亡态
        if (du && du.alive !== false && !(du.state && du.state._isDead)) {
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_FLASH, uid: uid, flash: FLASH_TYPES.DEAD });
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: uid, _isDead: true });
        }
    }

    const hasDeathAction = actions.some(a => a.dead && (a.kind === STAGE_ACTION_TYPES.ATTACK || a.kind === STAGE_ACTION_TYPES.DEATH || a.kind === STAGE_ACTION_TYPES.DOT));
    if (hasDeathAction) {
        const logDiv = document.getElementById('log');
        if (logDiv && logDiv.lastElementChild) eventBus.emit(FX_SIGNALS.BRUSH_EFFECT, { el: logDiv.lastElementChild });
    }
}

async function playSingleLogEntry(c, entry, step, isFirstAttackRef, factIndex) {
    let lastEntryType = c._lastLogType || null;
    let abortSig = c.abortController ? c.abortController.signal : null;

    // 「只记账、不上屏」的条目（如惑心「无变化」）：条目已进 battleLog 供体检/复盘读取，
    //   但战斗日志不刷这一行；直接返回、不更新 _lastLogType，分组/分隔符表现与没有这条一样。
    if (entry.quiet) return { isBattleOver: false };

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
            // 六大派概率连击 uid：与明教分开存（render/403 按阵营取值），让六大派格子也能出 ⚡
            if (step.enemyDoubleStrikeUid) c.currentEnemyDoubleStrikeUid = step.enemyDoubleStrikeUid;
            lastEntryType = entry.type; break;
        case 'attack-group': {
            let result = await handleAttackGroup(c, entry, step, abortSig, isFirstAttackRef);
            lastEntryType = entry.type;
            if (result && result.isBattleOver) return result;
            break;
        }
        case 'round-end': await handleRoundEnd(c, entry, step.log || [], 0); lastEntryType = entry.type; break;

        default: break;
    }

    c._lastLogType = lastEntryType;
    return { isBattleOver: false };
}