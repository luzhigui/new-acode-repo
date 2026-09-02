// player/42player-core.js - 光明顶5v5 战斗播放器核心
// V5.7.5 | ~42250 bytes| 2026-08-26 posSwap 补惑心横幅；summon 拼 horseTaunt 台词
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
import { getEliteState, setEliteState } from '../core/18-elite-state.js';
import { syncStateToUI } from '../core/17-state-keys.js';
import { handleBuffBonus, handleBuffSwap, handleBuffPush, handleBuffReboundFortify, handleInfo, handleRoundStart, handleRoundEnd, shouldStartNewGroup } from './45event-handlers.js';
import { handleAttackGroup } from './46attack-group.js';
import { getLogDiv, appendLogHTML, appendLogElement, autoScrollLog, updateRoundDisplay, renderSeparator, renderRoundStart, renderRoundEnd, renderInfoLine, renderVictoryLine, setBtnDisabled, setBtnText, initRenderer, initLogScrollControls, showScoreFloat, findUnitByUid } from './47renderer.js';
import { updateGridUI, setGridStore } from '../render/32-grid-render.js';
import { setGridRenderCtx } from '../render/32-grid-render.js';
import { AnimationScheduler } from './43animation-scheduler.js';
import { renderLog } from '../render/30-fact-renderer.js';
import { STAGE_ACTION_DEFS } from '../render/31-stage-actions.js';

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
                case 'buff-bonus':           await handleBuffBonus(c, entry); lastEntryType = entry.type; break;
                case 'buff-swap':            await handleBuffSwap(c, entry); lastEntryType = entry.type; break;
                case 'buff-push':            await handleBuffPush(c, entry); lastEntryType = entry.type; break;
                case 'buff-summary':         { appendLogHTML(entry.text + '<br>'); if(entry.buffType==='elite_xingfen'){let song = c.store ? c.store.getState().units.find(u => u.name === '宋青书') : null; if(song)c.store.dispatch({type: STORE_ACTION_TYPES.SET_VISUAL,uid:song.uid,_hasXingFen:true});} lastEntryType = entry.type; } break;
                case 'buff-rebound-fortify': await handleBuffReboundFortify(c, entry); lastEntryType = entry.type; break;
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

// 查表派发：原 switch 纯搬运（合并 case 拆独立键、default 丢弃），行为逐字一致
const STAGE_ACTION_STORE_HANDLERS = {
    [STAGE_ACTION_TYPES.ATTACK]: (c, action, pendingDeaths) => {
        // 死亡标记不在 stageAction 阶段落地（会抢在攻击动画前显示死亡格），
        // 收集后由 playStep 在日志播完统一落地；近战另有 88 飞撞回调在动画结束时兜底
        if (action.dead && action.targetUid && pendingDeaths) pendingDeaths.push(action.targetUid);
    },
    [STAGE_ACTION_TYPES.DOT]: (c, action, pendingDeaths) => {
        if (action.dead && action.targetUid && pendingDeaths) pendingDeaths.push(action.targetUid);
    },
    [STAGE_ACTION_TYPES.EXECUTE]: (c, action, pendingDeaths) => {
        if (action.dead && action.targetUid && pendingDeaths) pendingDeaths.push(action.targetUid);
    },
    [STAGE_ACTION_TYPES.SPIDER_STRIKE]: (c, action, pendingDeaths) => {
        if (action.dead && action.targetUid && pendingDeaths) pendingDeaths.push(action.targetUid);
    },
    [STAGE_ACTION_TYPES.DODGE]: (c, action, pendingDeaths) => {
        // ★ 闪避反击后攻击者必须进入眩晕态，并在 store 里同步，否则渲染层读不到 _stunned，
        //   职业图标不会切换成 😵（renderGrid 里 isStunned 判断依赖 state._stunned）。
        //   同时清除攻击者 flash，避免闪避前残留的 attack/defend 蓝色或黄色特效。
        if (action.actorUid) {
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: action.actorUid, _stunned: true, _acted: true });
            c.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: action.actorUid });
        }
        if (action.dead && action.actorUid && pendingDeaths) pendingDeaths.push(action.actorUid);
    },
    [STAGE_ACTION_TYPES.POS_SWAP]: (c, action, pendingDeaths) => {
        if (action.actorUid && action.targetUid) {
            c.store.dispatch({ type: STORE_ACTION_TYPES.APPLY_EVENTS, events: [
                { eventType: UNIT_EVENT_TYPES.POS_CHANGE, uid: action.actorUid, pos: action.oldPosB },
                { eventType: UNIT_EVENT_TYPES.POS_CHANGE, uid: action.targetUid, pos: action.oldPosA }
            ]});
        }
    },
    [STAGE_ACTION_TYPES.TRANSFORM]: (c, action, pendingDeaths) => {
        // 张无忌切近战：解除休息态（SPIDER_TRANSFORM 无副作用）
        if (action.actorUid && action.danmaku) {
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: action.actorUid, _resting: false });
        }
    },
    [STAGE_ACTION_TYPES.PUSH]: (c, action, pendingDeaths) => {
        if (action.actorUid && action.targetUid) {
            c.store.dispatch({ type: STORE_ACTION_TYPES.APPLY_EVENTS, events: [
                { eventType: UNIT_EVENT_TYPES.POS_CHANGE, uid: action.actorUid, pos: action.newPos },
                { eventType: UNIT_EVENT_TYPES.POS_CHANGE, uid: action.targetUid, pos: action.oldPos }
            ]});
        } else if (action.actorUid && action.newPos != null) {
            c.store.dispatch({ type: STORE_ACTION_TYPES.APPLY_EVENTS, events: [
                { eventType: UNIT_EVENT_TYPES.POS_CHANGE, uid: action.actorUid, pos: action.newPos }
            ]});
        }
    },
    [STAGE_ACTION_TYPES.SUMMON]: (c, action, pendingDeaths) => {
        if (action.actorUid) {
            const unit = c.store.getState().units.find(u => u.uid === action.actorUid);
            if (unit) {
                c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unit.uid, _acted: false });
            }
        }
    },
    [STAGE_ACTION_TYPES.DESTROY]: (c, action, pendingDeaths) => {
        if (action.success && action.actorUid) {
            c.store.dispatch({ type: STORE_ACTION_TYPES.REMOVE_UNIT, uid: action.actorUid });
        }
    },
    [STAGE_ACTION_TYPES.ROUND_START]: (c, action, pendingDeaths) => {
        c.store.getState().units.forEach(u => {
            if (u.alive) c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: u.uid, _acted: false });
        });
    },
};

function applyStageActionToStore(c, action, pendingDeaths) {
    if (!c.store || !action) return;
    const handler = STAGE_ACTION_STORE_HANDLERS[action.kind];
    if (handler) handler(c, action, pendingDeaths);
}

// 查表派发：原 switch 纯搬运（default 丢弃），行为逐字一致；含 await 的 case 保留 async
const STAGE_ACTION_FX_HANDLERS = {
    [STAGE_ACTION_TYPES.SPIDER_STRIKE]: async (c, action) => {
        const spiderUnit = findUnitByUid(c, action.actorUid);
        const strikeTarget = findUnitByUid(c, action.targetUid);
        if (spiderUnit && strikeTarget) {
            c.isPaused = true;
            GlobalStore.set('bulletTimeActive', true);
            await eventBus.emit(FX_SIGNALS.SPIDER_STRIKE, { spiderUnit, strikeTarget });
            GlobalStore.set('bulletTimeActive', false);
            c.isPaused = false;
        }
    },
    [STAGE_ACTION_TYPES.HEAL]: (c, action) => {
        const healUnit = findUnitByUid(c, action.targetUid);
        if (healUnit && action.amount) {
            eventBus.emit(FX_SIGNALS.HEAL_FLOAT, { unit: healUnit, amount: action.amount });
        }
    },
    [STAGE_ACTION_TYPES.DODGE]: async (c, action) => {
        const attacker = findUnitByUid(c, action.actorUid);
        const dodger = findUnitByUid(c, action.targetUid);
        if (attacker && action.reboundDmg && !GlobalStore.get('fastForwardActive')) {
            eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: attacker, dmg: action.reboundDmg });
        }
        // 华丽模式：子弹时间；简单模式：气泡
        if (c.dodgeEffectEnabled && attacker && dodger) {
            c.isPaused = true; GlobalStore.set('isPaused', true); GlobalStore.set('bulletTimeActive', true);
            await eventBus.emit(FX_SIGNALS.CRITICAL_BANNER, { text: '✨闪避反击✨' });
            // ★ 子弹时间必须走直接 await，不能走 eventBus 异步通道：
            //   emit 是同步调用（infra/50-event-bus.js），不等待监听器返回的 Promise，
            //   否则动画后台并行播放、战斗继续推进。主循环 await 阻塞，动画播完才恢复。
            const { showDodgeBulletTime } = await import('../fx/85fx-dodge-bullet.js');
            await showDodgeBulletTime(attacker, dodger, action.reboundDmg || 0);
            GlobalStore.set('bulletTimeActive', false); GlobalStore.set('isPaused', false); c.isPaused = false;
        } else if (attacker) {
            eventBus.emit(FX_SIGNALS.DODGE_BUBBLE, { unit: attacker, text: '闪避！' });
            // ★ 简单模式闪避反击：近战攻击者需补发 TRIGGER 信号，触发飞撞击退动画。
            //    _triggerFX 里 isDodge=true 且 dodgeEffectEnabled=false 时，会调用 showMeleeDodge(闪避者, 攻击者)，
            //    实现"飞撞过去 → 被击退回来"的完整动画。远程攻击者不走飞撞，只保持气泡提示。
            if (attacker.role !== ROLE_TYPES.RANGED && dodger) {
                eventBus.emit(FX_SIGNALS.TRIGGER, {
                    fxSnapshot: action.fx || null,
                    unitA: attacker,
                    unitD: dodger,
                    isDead: false,
                    isDodge: true,
                    isMiss: false,
                    isBlock: false,
                    dmg: action.reboundDmg || 0,
                    waveTaunt: null,
                    waveUnitUid: null,
                    waveUnit: null,
                    attackerRole: attacker.role
                });
            }
        }
        // ★ 闪避反击结束后，攻击者格子应进入眩晕显示（😵 图标），这里只是确保特效期间不残留样式；
        //   实际状态同步已由 store handler 完成，此处不重复写，避免与 store 双写冲突。
    },
    [STAGE_ACTION_TYPES.MISS]: (c, action) => {
        const attacker = findUnitByUid(c, action.actorUid);
        const target = findUnitByUid(c, action.targetUid);
        if (attacker && !GlobalStore.get('fastForwardActive')) {
            eventBus.emit(FX_SIGNALS.DODGE_BUBBLE, { unit: attacker, text: '未命中' });
            // 近战/飞行未命中补发飞撞击打动画（远程保持气泡即可）
            if (attacker.role !== ROLE_TYPES.RANGED && target) {
                eventBus.emit(FX_SIGNALS.TRIGGER, {
                    fxSnapshot: action.fx || null,
                    unitA: attacker,
                    unitD: target,
                    isDead: false,
                    isDodge: false,
                    isMiss: true,
                    isBlock: false,
                    dmg: 0,
                    waveTaunt: null,
                    waveUnitUid: null,
                    waveUnit: null,
                    attackerRole: attacker.role
                });
            }
        }
    },
    [STAGE_ACTION_TYPES.ATTACK]: async (c, action) => {
        const attacker = findUnitByUid(c, action.actorUid);
        const target = findUnitByUid(c, action.targetUid);
        // 苦练蓄力特效
        if (action.isKuLianAttack && attacker) {
            const team = c.store.getState().units.filter(u => u.camp === attacker.camp);
            eventBus.emit(FX_SIGNALS.KULIAN, { unit: attacker, team });
            await new Promise(r => setTimeout(r, 1200));
        }
        // 飞撞/箭矢/台词弹幕（统一由 fx/88 的 _triggerFX 消费）
        if (attacker && target && action.attackerRole) {
            eventBus.emit(FX_SIGNALS.TRIGGER, {
                fxSnapshot: action.fx,
                unitA: attacker,
                unitD: target,
                isDead: action.dead,
                isDodge: false,
                isMiss: false,
                isBlock: false,
                dmg: action.dmg,
                waveTaunt: action.waveTaunt || null,
                waveUnitUid: action.waveUnitUid || null,
                waveUnit: action.waveUnit || null,
                attackerRole: action.attackerRole
            });
        }
    },
    [STAGE_ACTION_TYPES.REBOUND]: async (c, action) => {
        // 反伤：只飘字，不触发飞撞/箭矢/音效；严阵以待带横幅（fortifyRebound）
        if (action.bannerText && !GlobalStore.get('fastForwardActive')) {
            c.isPaused = true; GlobalStore.set('bulletTimeActive', true);
            await eventBus.emit(FX_SIGNALS.BANNER, { text: action.bannerText });
            GlobalStore.set('bulletTimeActive', false); c.isPaused = false;
        }
        const target = findUnitByUid(c, action.targetUid);
        if (target && action.dmg && !GlobalStore.get('fastForwardActive')) {
            eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: target, dmg: action.dmg });
        }
    },
    [STAGE_ACTION_TYPES.DOT]: (c, action) => {
        const target = findUnitByUid(c, action.targetUid);
        if (target && action.dmg && !GlobalStore.get('fastForwardActive')) {
            eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: target, dmg: action.dmg });
        }
    },
    [STAGE_ACTION_TYPES.EXECUTE]: (c, action) => {
        const target = findUnitByUid(c, action.targetUid);
        if (target && action.dmg && !GlobalStore.get('fastForwardActive')) {
            eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: target, dmg: action.dmg });
        }
    },
    [STAGE_ACTION_TYPES.BANNER]: async (c, action) => {
        // 通用横幅（概率连击等）
        // ★ 必须直接 await showBuffBanner：eventBus.emit 为同步派发（infra/50，监听器 Promise 被丢弃），
        //   走 emit 则 isPaused 立即复位、横幅后台空转，视觉上"刷一下就过去"；直接 await 才能真正阻塞主循环
        if (action.text && !GlobalStore.get('fastForwardActive')) {
            c.isPaused = true; GlobalStore.set('bulletTimeActive', true);
            const { showBuffBanner } = await import('../fx/87fx-manager.js');
            await showBuffBanner(action.text);
            GlobalStore.set('bulletTimeActive', false); c.isPaused = false;
        }
    },
    [STAGE_ACTION_TYPES.SPLASH]: (c, action) => {
        if (action.splashUids && action.splashDmg && !GlobalStore.get('fastForwardActive')) {
            action.splashUids.forEach(uid => {
                const t = findUnitByUid(c, uid);
                if (t) eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: t, dmg: action.splashDmg });
            });
        }
    },
    // 换位/击退/召唤/销毁/飞行特效已由导演 stageAction 统一触发（下方 case）
    [STAGE_ACTION_TYPES.PUSH]: async (c, action) => {
        const target = findUnitByUid(c, action.actorUid);
        if (!target) return;
        c.isPaused = true; GlobalStore.set('bulletTimeActive', true);
        await eventBus.emit(FX_SIGNALS.BANNER, { text: '🦅 乘风突袭！' });
        if (action.targetUid) {
            const behind = findUnitByUid(c, action.targetUid);
            if (behind) {
                await eventBus.emit(FX_SIGNALS.PUSH_SWAP, { target, behind, c, opts: { skipDataChange: true } });
            }
        } else {
            await eventBus.emit(FX_SIGNALS.PUSH_BACK, { target, c, newPos: action.newPos, opts: { skipDataChange: true } });
        }
        GlobalStore.set('bulletTimeActive', false); c.isPaused = false;
    },
    [STAGE_ACTION_TYPES.POS_SWAP]: async (c, action) => {
        const unitA = findUnitByUid(c, action.actorUid);
        const unitB = findUnitByUid(c, action.targetUid);
        if (unitA && unitB) {
            c.isPaused = true; GlobalStore.set('bulletTimeActive', true);
            // ★ 换位动画同样直接 await：原 eventBus.emit(POSITION_SWAP) 同步派发不等待动画完成。
            //   惑心判定横幅已由 MIND_CONTROL_BANNER → BANNER 动作独立播放（两条判定各一条），
            //   此处只负责换位特效，成功判定时紧跟在判定横幅之后
            const { animatePositionSwap } = await import('../fx/87fx-manager.js');
            await animatePositionSwap(unitA, unitB, c, {
                skipDataChange: true,
                oldPositions: (action.oldPosA != null && action.oldPosB != null) ? [action.oldPosA, action.oldPosB] : null
            });
            GlobalStore.set('bulletTimeActive', false); c.isPaused = false;
        }
    },
    [STAGE_ACTION_TYPES.BUFF_EFFECT]: async (c, action) => {
        const attacker = findUnitByUid(c, action.attackerUid);
        const target = findUnitByUid(c, action.targetUid);
        const primary = findUnitByUid(c, action.primaryUid);
        if (action.effectType === BUFF_EFFECT_TYPES.SPLASH && attacker && primary && action.splashUids && action.splashUids.length > 0) {
            const splashTargets = action.splashUids.map(uid => findUnitByUid(c, uid)).filter(u => u);
            if (splashTargets.length > 0) {
                // 乘风突袭：风爪 + 专属横幅，不放箭、不延时；否则走流星箭雨
                if (action.buffType === BUFF_SUBTYPES.WIND_ASSAULT) {
                    c.isPaused = true; GlobalStore.set('bulletTimeActive', true);
                    await eventBus.emit(FX_SIGNALS.BANNER, { text: '🦅 乘风突袭！' });
                    splashTargets.forEach(u => eventBus.emit(FX_SIGNALS.WIND_CLAW, { unit: u }));
                    GlobalStore.set('bulletTimeActive', false); c.isPaused = false;
                } else {
                    c.isPaused = true; GlobalStore.set('bulletTimeActive', true);
                    await eventBus.emit(FX_SIGNALS.BANNER, { text: '☄️ 流星赶月！' });
                    eventBus.emit(FX_SIGNALS.SPLASH_ARROWS, { attacker, primary, targets: splashTargets, speed: c.speed, isPausedFn: () => c.isPaused });
                    splashTargets.forEach((st, i) => { setTimeout(() => AudioManager.playSfx(attacker.role || ROLE_TYPES.RANGED), i * 120); });
                    GlobalStore.set('bulletTimeActive', false); c.isPaused = false;
                    await new Promise(r => setTimeout(r, GlobalStore.get('fastForwardActive') ? 1 : 600));
                }
            }
        } else if (action.effectType === BUFF_EFFECT_TYPES.BONE_CLAW && attacker && target) {
            if (action.dmg && !GlobalStore.get('fastForwardActive')) {
                eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: target, dmg: action.dmg });
            }
            eventBus.emit(FX_SIGNALS.BONE_CLAW, { attacker, target, speed: c.speed, isPausedFn: () => c.isPaused, opts: { isExecute: action.isExecute } });
            // 每个爪击依次播放，避免多爪动画同时启动重叠
            if (!GlobalStore.get('fastForwardActive')) {
                await new Promise(r => setTimeout(r, Math.max(600, c.speed * 1.2)));
            }
        } else if (action.effectType === BUFF_EFFECT_TYPES.ATK_BUFF && target && action.gain) {
            eventBus.emit(FX_SIGNALS.ATK_BUFF_FLOAT, { unit: target, gain: action.gain });
        } else if (action.effectType === BUFF_EFFECT_TYPES.XIN_HUN) {
            // 新婚快乐：宋青书/周芷若爱心 + 扣血飘字
            const song = c.store ? c.store.getState().units.find(u => u.name === '宋青书') : null;
            const zhou = findUnitByUid(c, action.targetUid);
            if (song) eventBus.emit(FX_SIGNALS.HEART_EFFECT, { unit: song });
            if (zhou) eventBus.emit(FX_SIGNALS.HEART_EFFECT, { unit: zhou });
            if (zhou && zhou.alive) eventBus.emit(FX_SIGNALS.PINK_FLASH, { unit: zhou });
            if (zhou && action.dmg && !GlobalStore.get('fastForwardActive')) {
                eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: zhou, dmg: action.dmg });
            }
        }
    },
    [STAGE_ACTION_TYPES.HP_PCT_DANMAKU]: (c, action) => {
        const target = findUnitByUid(c, action.targetUid);
        if (target && action.text && !GlobalStore.get('fastForwardActive')) {
            eventBus.emit(FX_SIGNALS.DANMAKU, { unit: target, text: action.text });
        }
    },
    [STAGE_ACTION_TYPES.SUMMON]: async (c, action) => {
        const horse = findUnitByUid(c, action.actorUid);
        if (horse) {
            c.isPaused = true;
            await eventBus.emit(FX_SIGNALS.BANNER, { text: '🐴 拒马阵！' + (action.taunt || '') });
            c.isPaused = false;
        }
    },
    [STAGE_ACTION_TYPES.DESTROY]: async (c, action) => {
        if (action.success && action.actorUid) {
            c.isPaused = true;
            await eventBus.emit(FX_SIGNALS.BANNER, { text: '🐴 拒马已销毁' });
            c.isPaused = false;
        }
    },
    [STAGE_ACTION_TYPES.TRANSFORM]: (c, action) => {
        // 变身/切形态：张无忌弹幕（zhangSwitch），蛛变无特效
        const unit = findUnitByUid(c, action.actorUid);
        if (action.danmaku && unit && !GlobalStore.get('fastForwardActive')) {
            eventBus.emit(FX_SIGNALS.DANMAKU, { unit, text: action.danmaku });
        }
    },
    [STAGE_ACTION_TYPES.FLY_MODE]: (c, action) => {
        const unit = findUnitByUid(c, action.actorUid);
        if (!unit) return;
        // butterflyAttach / butterflyReturn / spiderFly / spiderReturn 等由 31 翻译，
        // 特效按 originalFactType 区分
        if (action.originalFactType === FLY_MODE_TYPES.BUTTERFLY_ATTACH) {
            const host = findUnitByUid(c, action.hostUid);
            if (host) eventBus.emit(FX_SIGNALS.BUTTERFLY_FLY_OUT, { sister: unit, host });
        } else if (action.originalFactType === FLY_MODE_TYPES.BUTTERFLY_RETURN) {
            const host = findUnitByUid(c, action.hostUid);
            if (host) eventBus.emit(FX_SIGNALS.BUTTERFLY_FLY_BACK, { host, sister: unit });
        } else if (action.originalFactType === FLY_MODE_TYPES.SPIDER_FLY) {
            eventBus.emit(FX_SIGNALS.SPIDER_ASCEND, { unit });
        } else if (action.originalFactType === FLY_MODE_TYPES.SPIDER_RETURN) {
            eventBus.emit(FX_SIGNALS.SPIDER_DESCEND, { unit });
        }
    },
};

async function applyStageActionToFX(c, action) {
    if (!action) return;
    const handler = STAGE_ACTION_FX_HANDLERS[action.kind];
    if (handler) await handler(c, action);
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

// 调度表读取器：timing 只从 STAGE_ACTION_DEFS 取，播放器不手写 switch
function getActionTiming(action) {
    const def = STAGE_ACTION_DEFS[action && action.kind];
    if (!def) return 'beforeText';
    return typeof def.timing === 'function' ? def.timing(action) : (def.timing || 'beforeText');
}

function getActionFx(action) {
    const def = STAGE_ACTION_DEFS[action && action.kind];
    return def ? def.fx : 'sync';
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
            // ★ 连击第一击：本攻击后（跳过其自身 afterText 特效）紧跟"概率连击"横幅时，等飞撞/飞箭播完再放行，
            //   否则横幅 isPaused 会冻结还在半空的飞撞（第二击也没了特效）
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
    // 死亡画笔：attack 为 beforeText，此处遍历全部 stageActions 捕获 attack+dead，
    // 对日志最后一行（被击杀的文本行）做画笔渐隐，时序在日志播完后，与原文案一致
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

    // 死亡标记统一在日志播完后落地：时序为 攻击动画/文本 → 死亡特效 → 掉血同步
    for (const uid of pendingDeaths) {
        const du = c.store.getState().units.find(u => u.uid === uid);
        if (du && !(du.state && du.state._isDead)) {
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_FLASH, uid: uid, flash: FLASH_TYPES.DEAD });
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: uid, _isDead: true });
        }
    }

    if (step.events && step.events.length > 0) {
        c.store.dispatch({ type: STORE_ACTION_TYPES.APPLY_EVENTS, events: step.events });
    }
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
    // 启动前获取蝶变方向（引擎层不再弹窗；弹窗属 UI 职责，由播放器层完成）
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
        const stepper = createRoundStepper(battleState);
        let lastStep = null;

        // ★ 同步化后 createRoundStepper 返回普通 generator，用 for...of 同步迭代；
        //   每步内的等待与播放仍保留异步，保证游戏逐格动画不变。
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
                            if (!getEliteState(xiaoZhao.uid)._permanentBuffs) setEliteState(xiaoZhao.uid, { _permanentBuffs: [] });
                            getEliteState(xiaoZhao.uid)._permanentBuffs.push({ ...newBuff, remaining: Infinity });
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
        if (uiXiaoZhao && getEliteState(uiXiaoZhao.uid)._permanentBuffs && lastStep && lastStep.ally) {
            const engineXiaoZhao = lastStep.ally.find(u => u.isXiaoZhaoBrother);
            if (engineXiaoZhao) {
                setEliteState(engineXiaoZhao.uid, { _permanentBuffs: getEliteState(uiXiaoZhao.uid)._permanentBuffs.map(b => ({ ...b })) });
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