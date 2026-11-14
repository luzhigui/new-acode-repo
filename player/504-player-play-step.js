// player/504-player-play-step.js — 单步日志交错播放（stageAction 生命周期 + 逐条日志分发）
//   playStepInterleaved / playSingleLogEntry 整块迁入。三条播放路径（单机/从机/回放）共用本文件。
export const VER = 'player/504-player-play-step.js V1.1.2';

import { eventBus } from '../infra/101-event-bus.js';
import { FX_SIGNALS } from '../infra/105-fx-signals.js';
import { GlobalStore, getState } from '../infra/104-global-store.js';
import { STORE_ACTION_TYPES, FLASH_TYPES, STAGE_ACTION_TYPES, DROP_TYPES, LOG_ENTRY_TYPES } from '../infra/106-battle-enums.js';

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
    // Bug5 同组横幅判据按 factIndex 记，而 factIndex 是「每步内」索引，跨步会重号。
    //   每步开头清一次，避免上一步末尾的 PUSH 和本步第一个 PUSH 恰好同号时
    //   被误判成同一组、横幅被跳过。
    c._lastPangBannerGroupKey = null;

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
    //   倒针静默重演（c.isRewinding）时跳过 FX：历史死亡画笔/飘字不许重放
    const runAction = async (action) => {
        applyStageActionToStore(c, action, pendingDeaths);
        // 同一 factIndex 内连续多条 PUSH：只弹一次 banner。
        //   8 号位特例产生 3 条 PUSH（崩飞 u5/u2 + 轰飞 victim），原逻辑每条都弹 1.5s 横幅，
        //   三连弹 4.5s 就是「磨蹭」的主要来源。
        const prev = c._lastPangBannerGroupKey;
        const key = action.kind === STAGE_ACTION_TYPES.PUSH && action.factIndex != null ? action.factIndex : null;
        if (!c.isRewinding && getActionFx(action) !== 'none') {
            if (action.kind === STAGE_ACTION_TYPES.PUSH && key === prev) {
                // 同组内的第 2/3 条 PUSH：跳过 banner，只走位移（fx 里 banner 与位移是分开的两段）
                await applyStageActionToFX(c, { ...action, skipBanner: true });
            } else {
                await applyStageActionToFX(c, action);
                c._lastPangBannerGroupKey = key;
            }
        }
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
                    if (!c.isRewinding) {
                        if (action.nonBlocking) applyStageActionToFX(c, action);
                        else await applyStageActionToFX(c, action);
                    }
                    applyStageActionToStoreAfter(c, action, pendingDeaths);
                    if (c._rewindCue) await c._rewindCue('beforeText', action);   // 倒针停点：文字前动作后
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
                            if (!c.isRewinding) applyStageActionToFX(c, a);
                            applyStageActionToStoreAfter(c, a, pendingDeaths);
                        }
                    }));
                }
            }

            await playSingleLogEntry(c, entry, step, isFirstAttackRef, factIndex);
            if (c._rewindCue) await c._rewindCue('anchor', entry);   // 倒针停点：图中锚点动作后

            if (!processedAfterIndexes.has(factIndex)) {
                processedAfterIndexes.add(factIndex);
                const afterActions = (actionsByFactIndex.get(factIndex) || []).filter(a => hasStageWork(a) && getActionTiming(a) === 'afterText');
                for (const action of afterActions) {
                    await runAction(action);
                    if (c._rewindCue) await c._rewindCue('afterText', action);   // 倒针停点：文字后动作后
                }
            }
        }
    }

    for (const action of actions) {
        if (action.factIndex == null || !actionsByFactIndex.has(action.factIndex)) {
            applyStageActionToStore(c, action, pendingDeaths);
            if (!c.isRewinding && getActionFx(action) !== 'none') await applyStageActionToFX(c, action);
            applyStageActionToStoreAfter(c, action, pendingDeaths);
        }
    }

    // 顺序铁律（2026-11-07）：血归零 → 死亡特效 → 结算。
    //   syncStoreFromStep 是整步血量/生死的唯一权威落账点，必须排在死亡红叉之前：
    //   先 SET_UNITS（hp=0 + alive=false），再切 DEAD 态，避免「特效先播、血条还没归零」。
    syncStoreFromStep(c, step);
    if (c._rewindCue) await c._rewindCue('settle', step);   // 倒针停点：整步落账后

    for (const uid of pendingDeaths) {
        const du = c.store.getState().units.find(u => u.uid === uid);
        // 复活（圣火不熄）：引擎本步已报活，不再补死亡态
        if (du && du.alive !== false && !(du.state && du.state._isDead)) {
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_FLASH, uid: uid, flash: FLASH_TYPES.DEAD });
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: uid, _isDead: true });
        }
    }

    const hasDeathAction = actions.some(a => a.dead && (a.kind === STAGE_ACTION_TYPES.ATTACK || a.kind === STAGE_ACTION_TYPES.DEATH || a.kind === STAGE_ACTION_TYPES.DOT));
    if (c._rewindCue) await c._rewindCue('death', step);   // 倒针停点：死亡红叉后
    if (hasDeathAction && !c.isRewinding) {   // 倒针静默重演时不刷历史死亡红墨
        const logDiv = document.getElementById('log');
        if (logDiv && logDiv.lastElementChild) eventBus.emit(FX_SIGNALS.BRUSH_EFFECT, { el: logDiv.lastElementChild });
    }
}

// 倒针逐段重演复用点：单条日志走与主流程完全相同的播放（掉血飘字/血条/黄闪/日志打字）
export async function playSingleLogEntry(c, entry, step, isFirstAttackRef, factIndex) {
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

        default:
            // A3 护栏：LOG_ENTRY_TYPES 白名单里有的 type，switch 必须覆盖到 case。
            //   漏了 case → 真播不出这一行（727 回看走白名单反而有），两边漂移。
            //   去重挂在函数属性上，只在首次命中时报一次，不刷屏。
            if (LOG_ENTRY_TYPES.includes(entry.type)) {
                if (!playSingleLogEntry._warnedMissingCase) playSingleLogEntry._warnedMissingCase = new Set();
                if (!playSingleLogEntry._warnedMissingCase.has(entry.type)) {
                    playSingleLogEntry._warnedMissingCase.add(entry.type);
                    console.error(`[player/504] switch 漏了 case: '${entry.type}'（在 LOG_ENTRY_TYPES 白名单内，但本 switch 未处理，真播与回看会漂移）`);
                }
            }
            break;
    }

    c._lastLogType = lastEntryType;
    // B 方案（2026-11-12）：SKILL_ANNOUNCE entry（pushSkillAnnounce 挂的 _entryFrozen）播完立即同步攻防血，
    //   与 509 handleAttackGroup 内同款逻辑，覆盖「公告在攻击组外、走 504 单行播放」的路径。
    if (c.store && entry && entry._entryFrozen && Array.isArray(entry._entryFrozen)) {
        for (const f of entry._entryFrozen) {
            if (!f || !f.uid) continue;
            c.store.dispatch({
                type: STORE_ACTION_TYPES.HP_CHANGE,
                unitUid: f.uid,
                payload: { atk: f.atk, def: f.def, maxHp: f.maxHp, hp: f.hp, alive: f.alive }
            });
        }
    }
    return { isBattleOver: false };
}