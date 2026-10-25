// player/46attack-group.js — 攻击组播放（文本逐行 + 格子闪示 + 血条/死亡态）
// 受击黄闪按「本击是否溢杀」分档：伤害直接把血打空（isDead 且 hpAfter<=0）→ 黄闪 600ms 即上死亡态，
//   不等整段战报播完；血量没打空、靠斩杀/处决才死的 → 维持原时长，死亡落地由 player/42 步末 pendingDeaths 统一处理。
// 特效已全部移交 stageActions，本文件只负责文本与格子闪示。
// V6.2.0 | 2026-10-25 无锚点 info/detail 改整行直出（不逐字），行间隔改 clock.waitReal 真实毫秒；
//   白骨爪 / 带 _anchorSpecs 的行仍逐字跟特效
// V6.1.2 | 2026-10-25 | ~10500 bytes | 攻击组行间隔接表现参数表（lineGap，按当前 speed 档位）
export const VER = 'player/46attack-group.js V6.2.0';

import { GlobalStore, getState } from '../infra/54-global-store.js';
import { getPerfParam } from '../core/23perf-params.js';
import { STORE_ACTION_TYPES, FLASH_TYPES, CAMP_TYPES, UNIT_EVENT_TYPES } from '../infra/56-battle-enums.js';
import { appendLogHTML, autoScrollLog, updateRoundDisplay, playLogLine, appendHiddenDetail, findUnitByUid } from './47renderer.js';
import { showBoneClaw } from '../fx/81fx-arrows-5v5-test.js';
import { showDamageFloat, showMeditateEffect } from '../fx/80fx-common-5v5-test.js';
import { markGridShake } from '../render/32-grid-render.js';
import { clock } from '../infra/52-clock.js';

export async function handleAttackGroup(c, entry, roundResult, abortSig, isFirstAttackRef) {
    let unitA = findUnitByUid(c, entry.uidA);
    let unitD = entry.uidD ? findUnitByUid(c, entry.uidD) : null;

    // 加 !isEndlessBreath：生生不息无目标（uidD=null），不是异常
    if (!entry.isBlock && !entry.isMiss && !entry.isDodge && !entry.isEndlessBreath && (!unitA || !unitD)) {
        appendLogHTML(`<span class="gray">${entry.attackerName || entry.uidA || '未知'} 攻击 ${entry.targetName || entry.uidD || '未知'}，但目标已不存在</span><br>`);
    }

    if (unitA && entry.isRest && c.store) {
        c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _resting: true });
        // 休息特效 3 秒后自动清除
        clock.wait(3000).then(() => {
            if (!c.store) return;
            const cur = c.store.getState().units.find(u => u.uid === unitA.uid);
            if (cur && cur.state && cur.state._resting) {
                c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _resting: false });
            }
        });
    }

    // 生生不息：金圈闪 1.2s（区别于拒马 😴），复用 cell-cheer 类
    if (unitA && entry.isEndlessBreath) {
        showMeditateEffect(unitA);
    }

    if (unitA && entry.isBlock && c.store) {
        c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _acted: true, _blocked: true });
    }

    // 生生不息不闪蓝（它不是攻击，走自己的金圈）
    if (unitA && !entry.isBlock && !entry.isDodge && !entry.isEndlessBreath) {
        // 闪避反击时攻击者只显示眩晕，由 DODGE stage action 处理
        if (c.store) c.store.dispatch({ type: STORE_ACTION_TYPES.SET_FLASH, uid: unitA.uid, flash: FLASH_TYPES.ATTACK });
    }

    const textEntries = entry.entries || [];
    // 受击黄闪不再单独猜时长——文字已改真实毫秒，猜出来的数必然对不上，
    //   结果就是「文字还没播完、黄闪已经没了」。
    //   现在的规则：非溢杀一路挂到本组文字播完（函数末尾统一 CLEAR_UNIT_FLASH）；
    //   溢杀 = 本击直接把血打空，600ms 后提前上死亡态，不等战报播完。
    const isOverkill = !!(unitD && entry.isDead === true
        && typeof entry.hpAfter === 'number' && entry.hpAfter <= 0);

    await clock.wait(200);
    if (abortSig && abortSig.aborted) return { isBattleOver: false };

    if (unitD && !entry.isMiss && !entry.isDodge && c.store) {
        c.store.dispatch({ type: STORE_ACTION_TYPES.SET_FLASH, uid: unitD.uid, flash: FLASH_TYPES.DEFEND });
    }
    // 受击方 flash：只有溢杀需要中途定时（600ms 后上死亡态）；
    //   非溢杀不设定时器，黄闪挂到函数末尾统一清。
    //   defTimerCancelled 保留：abort 或提前结束时让溢杀定时器失效（clock.waitReal 不可取消）。
    let defTimerCancelled = false;
    if (isOverkill && unitD && c.store) {
        clock.waitReal(600).then(() => {
            if (defTimerCancelled) return;
            if (!c.store || !unitD) return;
            // 与 player/42 步末落地同两条 dispatch；那里有 `!_isDead` 守卫，不会重复落地
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_FLASH, uid: unitD.uid, flash: FLASH_TYPES.DEAD });
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitD.uid, _isDead: true });
        });
    }

    let lastDiv = null;
    for (const entry2 of textEntries) {
        if (abortSig && abortSig.aborted) { defTimerCancelled = true; return { isBattleOver: false }; }
        // 畸形防御：裸 fact 条目（缺 text）或 null 不应让整场战斗播放崩溃；跳过并告警，便于定位上游漏渲染
        if (!entry2 || entry2.text == null) {
            console.warn('[handleAttackGroup] 跳过无法渲染的日志条目（缺 text）:', entry2);
            continue;
        }
        const logLevel = getState.logLevel();
        if (logLevel === 'brief' && entry2.type === 'detail') { appendHiddenDetail(entry2.text); continue; }

        if (entry2.type === 'damage-text') {
            lastDiv = await playLogLine(entry2.text, 1200);
            continue;
        }

        // 无锚点 info/detail（攻盾/坚盾/乾坤大挪移/波动/计算等）整行直接出，不逐字。
        //   行间隔用 waitReal(lineGap)，参数表填多少就是真实多少毫秒。
        //   白骨爪（isClawHit/clawFast）和有 _anchorSpecs 的不在此列——它们需要逐字跟特效。
        if ((entry2.type === 'info' || entry2.type === 'detail')
            && !entry2.isClawHit && !entry2.clawFast
            && !(entry2._anchorSpecs && entry2._anchorSpecs.length)) {
            appendLogHTML(entry2.text + '<br>');
            await clock.waitReal(getPerfParam('lineGap', GlobalStore.get('speed') || 300) || 120);
            continue;
        }

        // 成昆幻影识破：播到这条 log 时触发成昆闪一下（PHANTOM_REVEAL fact 带过来的 uid）
        //   清死重：本块曾连注释一字不差写两遍（外部AI清单#1），删其一
        if (entry2.phantomFlashUid && c.store) {
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: entry2.phantomFlashUid, _phantomFlash: true });
        }

        // 九阴白骨爪：每条爪击日志快速触发飞爪动画，不阻塞日志推进
        if (entry2.isClawHit) {
            const clawAttacker = findUnitByUid(c, entry2.clawAttackerUid);
            const clawTarget = findUnitByUid(c, entry2.clawTargetUid);
            if (clawAttacker && clawTarget) {
                showBoneClaw(clawAttacker, clawTarget, null, { isExecute: entry2.isExecute });
                // 爪击伤害飘字（快进跳过）——一位小数兜底，浮点尾巴不上面板
                if (!GlobalStore.get('fastForwardActive') && entry2.dmg > 0) {
                    showDamageFloat(clawTarget, Math.round(entry2.dmg * 10) / 10);
                }
            }
        }

        // combat-text/damage-text 基准 1200ms；爪击行 500ms（≈单爪动画时长，两者同步不互等）；
        // 乾坤衍生随爪条目 350ms（无动画可等，比爪更快翻过——节奏"一条接一条"）；其他 600ms
        const forcedSpeed = entry2.isClawHit ? 500
            : entry2.clawFast ? 350
            : (entry2.type === 'combat-text' || entry2.type === 'damage-text') ? 1200 : 600;
        await playLogLine(entry2.text, forcedSpeed);
        if (!c.userScrolled) autoScrollLog();

        // 逐次更新目标血量：每击后立即同步 store，让血条跟着掉
        if (entry2.isClawHit && entry2.hpAfter !== undefined && entry2.clawTargetUid && c.store) {
            c.store.dispatch({
                type: STORE_ACTION_TYPES.HP_CHANGE,
                unitUid: entry2.clawTargetUid,
                payload: { hp: Math.max(0, entry2.hpAfter) }
            });
            // 逐爪抖动：跟飞箭命中同一个函数（markGridShake），同一套观感。
            //   必须在 dispatch 之后调——重绘会清掉内联 transform，先调等于白调。
            markGridShake(entry2.clawTargetUid, 250);
        }

        // 爪击/随爪衍生条目之间极短间隔，形成连续快打节奏
        if (entry2.isClawHit || entry2.clawFast) {
            await clock.wait(60);
        }

        // clawFast（随爪乾坤衍生）不吃这 120ms 行距——随爪节奏由上面的 60ms 间隔独占，防止双重等待
        if ((entry2.type === 'detail' || entry2.type === 'info' || entry2.type === 'buff-bonus' || entry2.type === 'buff-splash') && !entry2.clawFast) {
            await clock.waitReal(getPerfParam('lineGap', GlobalStore.get('speed') || 300) || 120);
        }
    }

    await clock.wait(200);
    defTimerCancelled = true;
    if (unitA && !unitA.state._isDead && c.store) {
        c.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: unitA.uid });
        if (!entry.isBlock && !entry.isDodge && !entry.isLinkAttack) {
            c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unitA.uid, _acted: true });
        }
    }
    if (unitD && !entry.isMiss && !entry.isDead && !unitD.state._isDead && c.store) {
        c.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: unitD.uid });
    }

    updateRoundDisplay(`📜 日志（第${(c.store ? c.store.getState().round : (c.UI && c.UI.round)) || 1}回合）`);

    // 血量事件延迟到特效快结束才应用，避免与受击特效冲突
    // 修击退剧透：POS_CHANGE 不随攻击组提前落账——原先是攻击组末尾就把击退/换位的位置写进
    // store（格子瞬移），随后的 PUSH/POS_SWAP 特效纯属重播 = 剧透。位置的唯一即时写入点=对应 fx 动画
    // 收尾（fx/83/84 落定后自 dispatch POS_CHANGE）；无专属动画的路径由步末 syncStoreFromStep 兜底。
    if (entry._events && entry._events.length > 0) {
        const evts = entry._events.filter(ev => ev.eventType !== UNIT_EVENT_TYPES.POS_CHANGE);
        if (evts.length > 0) c.store.dispatch({ type: STORE_ACTION_TYPES.APPLY_EVENTS, events: evts });
    }

    if (entry.isDead && c.store) {
        const liveUnits = c.store.getState().units;
        const allyAlive = liveUnits.some(u => u.camp === CAMP_TYPES.ALLY && u.alive);
        const enemyAlive = liveUnits.some(u => u.camp === CAMP_TYPES.ENEMY && u.alive);
        if (!allyAlive || !enemyAlive) return { isBattleOver: true };
    }
    return { isBattleOver: false };
}