// player/42player-core.js — 战斗播放入口（单机/从机/回放）+ clock 桥接 + 收尾结算
// V7.0.0 | ~21000 bytes | 2026-10-18 拆分（纯搬移，零行为改动）：
//   本文件此前把四件事塞在一起（step 同步 / fact→动作翻译 / 单步播放 / 三个入口+收尾）。
//   现按 42 族号拆出三个子文件（与 26elite-sixsects-* / 27elite-mingjiao-* / 38-actions-translate-* 同款）：
//     · 42player-step-sync.js    syncStoreFromStep / readRound / setRound / setupDeathTimers
//     · 42player-stage-actions.js prepareLogEntry / getActionTiming / getActionFx / hasStageWork / applyStageActionTo{Store,FX,StoreAfter}
//     · 42player-play-step.js    playStepInterleaved / playSingleLogEntry
//   本文件保留：clock 桥接（installClockBridge）+ 三个入口 + finishBattle + readRound re-export。
//   全部对外导出（playBattle / playBattleGuest / playBattleReplay / readRound / clearAllEffects）
//   路径不变——44/45/61/68/75/76 的 import 点零改动。
// ── 更早版本历史见 记录-更改履历.md
export const VER = 'player/42player-core.js V7.0.0';

import { SeededRNG } from '../infra/51-core-utils.js';
import { setBattleRng, setPresentationRng } from '../core/13battle-shared.js';
import { createRoundStepper } from '../core/11battle-round.js';
import { GlobalStore, getState, setState, getPlayerContext } from '../infra/54-global-store.js';
import { createStore, battleReducer } from '../modules/24battle-store.js';
import { STORE_ACTION_TYPES, FLASH_TYPES, CAMP_TYPES } from '../infra/56-battle-enums.js';

import { autoScrollLog, updateRoundDisplay, renderSeparator, renderVictoryLine, setBtnDisabled, initRenderer, initLogScrollControls, showScoreFloat } from './47renderer.js';
import { setGridStore } from '../render/32-grid-render.js';
import { setGridRenderCtx } from '../render/32-grid-render.js';
import { clock } from '../infra/52-clock.js';
import { translateFactsToStageActions } from '../render/31-stage-actions.js';
import { buildBattleReportData, computeVoteResult, grantClearRewards } from './48battle-report.js';
import { handleBuffSelection, handlePvpBuffSelection, handleFlyDirection, handleHanlisaAim } from './49battle-flow.js';
import * as net from '../infra/60-net-pvp.js';
import { startBattleRecording, feedBattleStep, finishBattleRecording } from './50battle-export.js';
import { speakVictory } from '../modules/31voice-commentary.js';

import { readRound, setupDeathTimers } from './42player-step-sync.js';
import { playStepInterleaved } from './42player-play-step.js';

function getCtx() { return getPlayerContext(); }

export { clearAllEffects } from './47renderer.js';
export { readRound } from './42player-step-sync.js';

// clock 桥接：单机 / 从机 / 回放三条路的「倍速·暂停·快进」接线完全同构，统一收口在此。
// 此前三份逐字重复，回放版还多一行 setTimescale（GlobalStore.set('speed') 的 effect 已自动执行）。
function installClockBridge(c) {
    clock.reset();
    clock.start();
    clock.setTimescale(600 / (c.speed || 600));
    GlobalStore.effect('speed', (v) => clock.setTimescale(600 / (v || 600)));
    GlobalStore.effect('isPaused', (v) => { if (v) clock.pause(); else clock.resume(); });
    // 守卫：值没变不折腾。finishBattle 收尾无条件 set(false)，没开过快进的局也会走还原分支，
    // 不守会把手动 8x/4x 打完后冲回默认 2x。clock.fastForward 初始即 false，守卫安全。
    GlobalStore.effect('fastForwardActive', (isActive) => {
        if (isActive === clock.fastForward) return;
        clock.setFastForward(isActive);
        if (isActive) {
            if (!c._originalSpeed) c._originalSpeed = c.speed;
            c.speed = 1;
        } else {
            const restored = c._originalSpeed || 600;
            c.speed = restored;
            GlobalStore.set('speed', restored);   // effect('speed') 已自动 setTimescale
            c._originalSpeed = null;              // 还原后清档，防跨局捕获旧速度
            const fn = GlobalStore.getUIHandler('updateSpeedButtons'); if (fn) fn();
        }
    });
}

export async function playBattle() {
    const c = getCtx();
    if (!c || !c.snapshot || !c.snapshot.ally || !c.snapshot.ally.length) return;

    c._removedUids = new Set();

    // 统一时间源：clock 驱动全部 wait/animate；倍速/暂停/快进收口 installClockBridge
    installClockBridge(c);

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
    // 捎带当前关卡号：房主选关时虽已发过 lineup，但 start 是「必定到达」的那条消息，
    // 从机据此补正关卡与左侧标签，避免 lineup 丢包后从机一直停在第 1 关
    const netLinked = net.isNetHost() && net.isConnected();
    if (netLinked) net.sendStart(GlobalStore.get('currentStage'));

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
        battleState.ally._flyDirection = direction || 'left';
    }
    let isBattleOver = false; let finalWinner = null; let finalStep = null;

    // 2026-09-16 回合历史快照：每回合末存一份定稿（含 buff），供回放/存档/教学读取
    // schema 约定：单位为 clone() 快照（state 字段走 core/17 V2 schema）；快照结构体带 version 便于未来演进
    const SNAPSHOT_VERSION = 1;
    const roundHistory = [];

    // 2026-09-25 战报导出：开一条录制（单机/房主同路；从机在 playBattleGuest 单独喂）
    startBattleRecording({ stage: GlobalStore.get('currentStage'), mode: netLinked ? 'pvp-host' : 'single', seed: c.snapshot._rngSeed });

    while (!isBattleOver) {
        if (abortSig && abortSig.aborted) return;
        const isFirstAttackRef = { value: true };
        const stepper = createRoundStepper(battleState, { ui: true, translateFacts: translateFactsToStageActions });
        let lastStep = null;

        for (const step of stepper) {
            if (abortSig && abortSig.aborted) return;
            lastStep = step;
            if (battleState.activeBuffs) c.activeBuffs = battleState.activeBuffs.map(b => ({ ...b }));
            // 联网对战阶段2：房主跑完一步就发给从机（从机只播，不跑引擎）；阶段3 捎带 activeBuffs；快进状态一起捎带
            if (netLinked) net.sendStep(step, c.activeBuffs, getState.speed(), GlobalStore.get('fastForwardActive'));
            feedBattleStep(step, c.activeBuffs);   // 2026-09-25 战报导出：与联机同源同净化
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
        // 2026-10-19 蓄意轰拳：蓄力到期时在回合结束处强停全屏，黑幕按住-拖-松手选瞄准位（华丽模式专属；
        //   简单/全自动/快进不弹，由 modules/27 结算随机前排兜底）
        await handleHanlisaAim(c, battleState);

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

        // 2026-10-02 跨回合必须带上同一颗 _rng：漏带会让 11 兜底用 Date.now() 重新播种，
        // 从第 2 回合起同种子不可复现（与 06 批量路径「同一 rng 同序列」口径对齐）
        battleState = { ally: lastStep.ally, enemy: lastStep.enemy, round: battleState.round + 1, activeBuffs: nextActiveBuffs, allAllies: battleState.allAllies, _rng: battleState._rng };

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
    // 2026-09-25 战报导出：收尾定稿（写死胜负/回合数），战报弹窗的「保存战报」从这里取
    finishBattleRecording(finalWinner);
    // 2026-10-01 语音解说：胜负一句话收口（清队列插队播）
    try { speakVictory(finalWinner); } catch (e) { /* 解说失败不影响结算 */ }
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
        // 2026-10-13 胜利横幅去重：有存活单位时 ui/62 spawnVictoryEffects 已在台词后输出横幅，此处不再重复；
        //   仅当无存活单位（spawnVictoryEffects 未被调用）时兜底输出一行。
        if (c.gs === 'GAMEOVER' && aliveUnits.length === 0) renderVictoryLine(`<span class="gold">🎉🏆 <span class="${winColor}">${winner}</span>获得最终胜利！ 🏆🎉</span><br>`);
        autoScrollLog();
        await clock.wait(6000);
        const showBattleReportFn = GlobalStore.getUIHandler('showBattleReport');
        if (showBattleReportFn && c.battleResultForInfo) {
            showBattleReportFn(c.battleResultForInfo);
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

    // 时间层与房主一致：从机本地控制演出节奏，不影响房主（快进跟随由 installClockBridge 注册）
    installClockBridge(c);

    // 从机主循环的刹车：房主重发 lineup（换关/开下一局）时由 ui/61 调 abort()，
    // 否则旧循环会继续播上一局的残留 step，最后还会把 gs 打回 GAMEOVER
    c.abortController = new AbortController();
    const abortSig = c.abortController.signal;
    c._battleEnded = false;

    // 从机 store 用摆位阵容垫底：原来给空数组 + 紧接着 c.updateUI()，会先渲染出一片空格子，
    // 要等房主跑完海克斯、发出第一条 step 才恢复 —— 这就是「开战瞬间画面突然消失一下」。
    // 第一条 step 一到仍会被 syncStoreFromStep 整套覆盖。
    const seedUnits = [...((c.UI && c.UI.allyTeam) || []), ...((c.UI && c.UI.enemyTeam) || [])];
    c.store = createStore({ units: seedUnits, round: 1 }, battleReducer);
    GlobalStore.set('battleStore', c.store);
    const setRenderStoreFn = GlobalStore.getUIHandler('setRenderStore');
    if (setRenderStoreFn) setRenderStoreFn(c.store);
    setGridStore(c.store);
    setGridRenderCtx(c);
    c.updateUI();

    // 阵亡清除（与房主共用）：从机没有这段，格子上尸体会永远赖着
    setupDeathTimers(c);

    // 从机不跑引擎，但演出层（getAttackTaunt / getKillTaunt 选台词等）仍会取表现 RNG，
    // 不注入就会 null.nextInt 崩。本地 RNG 仅供演出文案，不影响战斗结果（结果全部来自房主的 step）
    setBattleRng(new SeededRNG(Date.now() % 1000000));
    setPresentationRng(new SeededRNG(Date.now() % 1000000 + 1));

    initRenderer(c);
    updateRoundDisplay('📜 日志（第1回合）');
    initLogScrollControls(c);

    const isFirstAttackRef = { value: true };
    let isBattleOver = false, finalWinner = null, finalStep = null, firstStep = true;

    // 2026-09-25 战报导出：从机也录一份（step 是房主发来的净化数据，喂回去即可）
    startBattleRecording({ stage: null, mode: 'pvp-guest', seed: null });

    while (!isBattleOver) {
        if (abortSig.aborted) return;
        const step = await net.recvStep();
        // 房主换关/开下一局时会 abort + 清队列，recvStep 立刻返回 null——那是「本局作废」，必须直接退出，
        // 不能再往下走 finishBattle 结算（会把 61 刚设好的 IDLE 又打回 GAMEOVER，下一局开局就乱）
        if (!step) { if (abortSig.aborted) return; break; }   // 断线：recvStep 返回 null，避免主循环挂死
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
        // 跟随房主快进：两端都 12x，房主冲到底时从机不会还在慢慢播
        if (!!step.ff !== !!GlobalStore.get('fastForwardActive')) GlobalStore.set('fastForwardActive', !!step.ff);
        // 与房主一致：每回合重置「是否本回合首次攻击」
        if ((step.log || []).some(e => e && e.factType === 'roundStart')) isFirstAttackRef.value = true;
        feedBattleStep(step, step.activeBuffs || c.activeBuffs);   // 2026-09-25 战报导出：从机喂房主发来的 step
        await playStepInterleaved(c, step, isFirstAttackRef);
        await clock.wait(300);
        if (step.winner) { finalWinner = step.winner; isBattleOver = true; }
    }

    await finishBattle(c, finalStep, finalWinner, []);

    // 播完回执：房主的「▶ 下一关」要等这个才解锁，否则会在从机还在演出时把画面切走
    // 断线时 publish 返回 false，无副作用
    net.sendGuestDone();
}

/**
 * 回放入口（2026-09-25）：从战报文件播放整场。
 * 与 playBattleGuest 同构——不跑引擎，数据源从「网络 step」换成「文件 steps」。
 * 调用方（ui/61 startReplayFromFile）负责：abort 旧循环、UI 队伍/store 重建、关封面、gs=RUNNING。
 */
export async function playBattleReplay(report) {
    const c = getCtx();
    if (!c) return;
    if (!report || !Array.isArray(report.steps) || report.steps.length === 0) {
        console.error('[playBattleReplay] 战报文件无效（无 steps）');
        return;
    }

    c._removedUids = new Set();

    // 时间层与从机一致：本地控制演出节奏（installClockBridge 收口；回放版原多一行 setTimescale 冗余，靠 effect 已自动执行）
    installClockBridge(c);

    // 演出 RNG：与从机同款，只管台词等表现层不崩
    setBattleRng(new SeededRNG(Date.now() % 1000000));
    setPresentationRng(new SeededRNG(Date.now() % 1000000 + 1));

    // 阵亡清除：没有这段，格子上尸体会永远赖着（与从机同款）
    setupDeathTimers(c);

    initRenderer(c);
    updateRoundDisplay('📜 日志（第1回合·回放）');
    initLogScrollControls(c);

    const isFirstAttackRef = { value: true };
    let finalWinner = null, finalStep = null, firstStep = true;

    for (const step of report.steps) {
        const abortSig = c.abortController ? c.abortController.signal : null;
        if (abortSig && abortSig.aborted) return;
        if (firstStep) {
            // 与从机同款：战报要用的开局快照从首步取（回合开始态）
            firstStep = false;
            c.snapshot = { ally: step.ally, enemy: step.enemy };
        }
        finalStep = step;
        if (step.activeBuffs) {
            c.activeBuffs = step.activeBuffs;
            if (c.updateBuffSlots) c.updateBuffSlots();
        }
        if (step.speed && step.speed !== getState.speed()) setState.speed(step.speed);
        if (!!step.ff !== !!GlobalStore.get('fastForwardActive')) GlobalStore.set('fastForwardActive', !!step.ff);
        if ((step.log || []).some(e => e && e.factType === 'roundStart')) isFirstAttackRef.value = true;
        await playStepInterleaved(c, step, isFirstAttackRef);
        await clock.wait(300);
        if (step.winner) { finalWinner = step.winner; break; }
    }

    await finishBattle(c, finalStep, finalWinner, []);
}