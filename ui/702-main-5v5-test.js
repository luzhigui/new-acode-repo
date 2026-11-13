// ui/702-main-5v5-test.js — 主入口总装配（开场流程 / 战斗启动 / 关卡推进 / 返回封面）
// V6.14.6 | 2026-11-10 下线存档：新手引导（原 ui/712-tutorial.js）与开场CG（原 ui/713-opening-cg.js）搬 archive/， 精英图鉴选人弹层 showEliteGallery 改为直接放行（原 524KB 嵌页 展示与CG/精英展示-04 一并搬 archive/）。 全部改为就地空实现，调用点未动；恢复方式见 archive/README.md 与 archive/702-showEliteGallery.snippet.js。
export const VER = 'ui/702-main-5v5-test.js V6.14.6';

import '../infra/104-global-store.js';
import { GlobalStore } from '../infra/104-global-store.js';
import '../modules/303-error-capture.js';
import '../modules/301-reg-mechanics.js';   // 机制装配统一入口（25/26/27/30 顶层副作用注册）
import { CONFIG, STATE, loadGameData, loadHexEnhanceData, VER as CFG_VER } from '../core/201-config-5v5-test.js';
import { Unit, VER as VER_UNIT } from '../core/202-unit.js';
import { VER as VER_UTILS } from '../core/203-battle-utils.js';
import { stripTags, renderGrid, updateUI, setRenderStore, spawnVictoryEffects, clearLogExceptFirst, isUnitBenefitedByBuff, VER as UI_VER } from './703-ui-render-5v5-test.js';
import { VER as VER_RENDER } from '../render/403-grid-render.js';
import { showDanmaku, showDamageFloat, showDodgeBubble, showHealFloat, VER as FX_VER } from '../fx/601-fx-common-5v5-test.js';
import { showRangedArrow, VER as FA_VER } from '../fx/602-fx-arrows-5v5-test.js';
import { showMeleeCrash, showMeleeDodge, showMeleeMiss, VER as FC_VER } from '../fx/603-fx-crash-5v5-test.js';
import { playBattle, playLineText, clearAllEffects, VER as BP_VER } from '../player/507-battle-player-5v5-test.js';   // 清死import：handleBuff 两名在本文函数体零使用（真身在 41，42 内部调用）
import { showModal, showAlert, updateCoverVersion, copyLogToClipboard, initDevFlags } from './701-main-utils.js';
import { BUFF_TYPES, CAMP_TYPES } from '../infra/106-battle-enums.js';
import './724-zhang-target-picker.js';

// 拆分模块
import { getPlayerContext, getState, setState } from '../ui/704-main-state.js';
import { resetBattleRuntime } from './715-reset-runtime.js';
import { showMusicPanel, showVoteDialog, showCountdown } from './705-main-dialogs.js';
import {
    doInitBattle, generateBuffChoices, createBuffObject, showBuffSelection,
    tickBuffDurations, getActiveBuffList,
    logTeamInfo, abortAll
} from './706-main-battle.js';
import { setBGMVolume, fadeBGMTo, lowerBGM } from './707-audio-control.js';
import { toggleFxPanel, syncFxButton } from './708-fx-trigger.js';
import { updateSpeedButtons, activateScrollSlowdown, restoreSpeedFromScroll, updateButtons, updateAutoModeButton, enableAllButtons, updateDebugUI, updateBuffSlots, bindCoverStart, bindNetPvp, bindPauseButton, bindNextButton, bindDebugButton, bindBGButton, bindDodgeButton, bindSettleButton, bindStageSelectButton, bindVoteFloat, bindXiaoZhaoSwitchButton, bindGridClick, initSpeedButtons } from './709-ui-controls.js';
import { bindCopyLogButton } from './705-main-dialogs.js';
import * as net from '../infra/109-net-pvp.js';
// 2026-11-10 下线存档：新手引导（原 ui/712-tutorial.js）与开场 CG（原 ui/713-opening-cg.js）已搬 archive/。
//   这里改为就地空实现，**调用点一行都不用改**（stepBuff 等被 5 处调用，逐个删比改 import 风险大）。
//   恢复方式见 archive/README.md「二」，那里列了全部 6 处 import + 这篇的改法。
const stepAdjustStart = () => {};
const stepAdjustMove = () => {};
const stepVoteOpen = () => {};
const stepCountdown = () => {};
const stepBuff = () => {};
const stepBattleStart = () => {};
// 注：原 initTutorial / resetTutorialDone 两个导出已无调用点（「❓」按钮连同绑定一起下线），故不再保留空实现。
const isOpeningCgDone = () => true;      // 恒真 = 永远当作「CG 已看过」，启动流程直接进下一步
const showOpeningCg = (onDone) => { if (typeof onDone === 'function') onDone(); };

import { VER as VER_BUFF } from '../core/204-buff-system.js';
import { VER as VER_HORSE } from '../core/205-battle-horse.js';
import { VER as VER_CORE } from '../core/210-battle-round.js';
import { SeededRNG } from '../infra/102-core-utils.js';
import { setBattleRng, getBattleRng } from '../core/214-battle-shared.js';
import { VER as VER_PLAYER_CORE } from '../player/503-player-core.js';
import { installNetSession, sendNetLineup, clearNetBadge } from './716-net-session.js';
import { installReplayEntry } from './717-replay-entry.js';
import './723-hex-active.js';   // 圣火令主动（2026-11-13）：顶层副作用注册 UIHandler
import { handlePvpBuffSelection, handleEnemyAutoBuffSelection } from '../player/512-battle-flow.js';
import { VER as VER_TEXT } from '../player/501-player-text.js';
import { VER as VER_BUFF_UI } from '../player/502-player-buff-ui.js';
import { addPermanentBuff, VER as VER_ELITE } from '../modules/302-elite-skills.js';
// 妹永久账本写入：开局选 buff 在这里，每 3 回合选 buff 在 player/512，两条路径共用同一函数
import { recordXiaoZhaoPermanentBuff } from '../modules/329-buff-tools.js';
// 精英组件注册已并入 ../modules/301-reg-mechanics.js（registerElite 副作用统一装配）
import { VER as VER_MAIN_UTILS } from './701-main-utils.js';
// 去 window 桥：直接 import，不再经 window.AudioManager
import { AudioManager } from '../modules/304-audio-manager.js';

const _randLocal = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const C = CONFIG, S = STATE;

const LOG_LINE1 = '⚔️ 光明顶5v5对决 · 九宫格混战模式 ⚔️';

// 精英图鉴选人弹层（2026-11-10 下线存档）
//   老板：图鉴现在不怎么用了 → 连同它在 展示与CG/ 里那个 524 KB 的嵌页一起下线。
//   原实现是弹一个指向 './展示与CG/精英展示-04-圣火单卡旋转-GLM5.3.html' 的 iframe，
//   选完把 ming_elite_pick_5v5 写进 localStorage、供 modules/330 建队时加权。
//   现在直接放行（不弹、不写），启动流程照常往后走；想恢复就把 archive/702-showEliteGallery.snippet.js
//   里的原实现贴回来（那个文件里连 524 KB 嵌页的路径都留着）。
//   ⚠️ 已知副作用（下线前就存在，非本次引入）：330 的 rate 加权只对「张无忌」一个键生效，
//      选韦一笑/小昭写了也不读。图鉴下线后这条失效路径自然不再被触发，不必单独修。
function showEliteGallery(onDone) {
    if (typeof onDone === 'function') onDone();
    return;
}

// UI 局部状态（不含 activeBuffs）
let speed = 500, userScrolled = false;
let abortController = null;
let battleResultForInfo = null;
let gameStarted = false;
let hasLoggedTeam = false;
let isBattleStarting = false;
// 封面开关引用：bindCoverStart 要读它，hostEnterAdjust / start 分支要写它。
// 原先声明在 DOMContentLoaded 闭包里，而 hostEnterAdjust 在模块作用域 → 从机重连时抛 ReferenceError: coverRef is not defined
const coverRef = { val: gameStarted };
// 关卡号唯一源 = GlobalStore.currentStage（68 的选关弹窗直接写它）。
// 这里原来还有个模块局部变量，68 选关后局部不更新 → 房主下发给从机的还是旧关卡号
function setStage(v) { setState.currentStage(v); }
GlobalStore.set('crashMode', 'fly');

let currentDoubleStrikeUid = null;

// 拆分批：联网会话/回放入口搬去 75/76，闭包标志位在这里注入（搬家零行为漂移）
const netSession = installNetSession({
    resetBattleFlags: () => { currentDoubleStrikeUid = null; isBattleStarting = false; hasLoggedTeam = false; },
    markGameStarted: () => { gameStarted = true; coverRef.val = true; }
});
installReplayEntry({
    resetBattleFlags: () => { isBattleStarting = false; hasLoggedTeam = false; },
    markGameStarted: () => { gameStarted = true; coverRef.val = true; }
});

const savedScore = localStorage.getItem('ming_vote_score_5v5_test');
if (savedScore !== null) {
    GlobalStore.set('voteScore', parseInt(savedScore, 10));
}
const savedToken = localStorage.getItem('ming_holy_token_5v5_test');
if (savedToken !== null) {
    GlobalStore.set('holyToken', parseInt(savedToken, 10));
}
GlobalStore.set('voteChoice', null); GlobalStore.set('battleHasZhang', false); GlobalStore.set('debugMode', false);

const TRASH_TALK_ALLY = ['明教必胜！六大派受死！','光明顶，我守定了！','六大派也不过如此！','来战！明教弟子，何惧！','今日便让尔等见识魔教之威！'];
const TRASH_TALK_ENEMY = ['魔教余孽，今日必灭！','少林武当，放马过来！','邪魔歪道，不足为惧！','今日便要踏平光明顶！'];

// 去重：实现唯一留在 infra/54，此处直接用 playerContext 版本，不再维护第二份
const updateScoreBadge = () => { const ctx = getPlayerContext(); if (ctx && ctx.updateScoreBadge) ctx.updateScoreBadge(); };
export function onAnyButtonClick() { if (!gameStarted) return; if (AudioManager && AudioManager.enabled && parseFloat(localStorage.getItem('ming_bgm_volume') || '0.5') > 0.3) lowerBGM(); }
function autoScrollLog() { if (userScrolled) return; let logDiv = document.getElementById('log'); if (logDiv) logDiv.scrollTop = logDiv.scrollHeight; }

function swapAllyPositions(posA, posB) {
    const currentUI = getState.UI();
    let unitA = currentUI.allyTeam.find(u => u.pos === posA); let unitB = currentUI.allyTeam.find(u => u.pos === posB);
    if (unitA && unitA.fixed) return; if (unitB && unitB.fixed) return;
    let zhang = currentUI.allyTeam.find(u => u.isZhang);
    if (zhang && zhang.pos === 5) {
        let tempMap = {}; currentUI.allyTeam.forEach(u => { if (u.alive || u.state._isDead) tempMap[u.pos] = u; });
        if (unitA) tempMap[posB] = unitA; if (unitB) tempMap[posA] = unitB;
        if (unitA && !unitB) delete tempMap[posA]; if (!unitA && unitB) delete tempMap[posB];
        if (!tempMap[2] || !tempMap[2].alive) {
            let zhangUnit = currentUI.allyTeam.find(u => u.isZhang && u.pos === 5);
            if (zhangUnit) { let zhangCell = document.querySelector(`#allyGrid .cell[data-pos="5"]`); if (zhangCell) { zhangCell.classList.add('cell-protected'); setTimeout(() => zhangCell.classList.remove('cell-protected'), 600); } showDanmaku(zhangUnit, '前方不可无人！'); }
            return;
        }
    }
    if (unitA) { unitA.pos = posB; }
    if (unitB) { unitB.pos = posA; }
    updateUI();
}
GlobalStore.setUIHandler('swapAllyPositions', swapAllyPositions);

window.ALL_VERS = {
    config: CFG_VER,
    unit: VER_UNIT,
    utils: VER_UTILS,
    buff: VER_BUFF,
    horse: VER_HORSE,
    core: VER_CORE,
    player_core: VER_PLAYER_CORE,
    ui: UI_VER,
    render: VER_RENDER,
    fx_common: FX_VER
};

async function startApp() { updateCoverVersion(); }
startApp();

// DOM 初始化

// 模块脚本（deferred）求值时 readyState 必为 complete/interactive，直接初始化；
//   原 else 分支引用的旧名 initBugAndXiaoZhaoModes 已在 60main-utils→701 改名时漏改，且该分支不可达，删除。
initDevFlags();

document.addEventListener('DOMContentLoaded', async function() {
    const controls = document.querySelector('.controls');
    if (controls) controls.style.zIndex = '100';

    if (!getState.UI().allyTeam.length) {
        setState.UI({ allyTeam: [], enemyTeam: [], currentResult: null, round: 0 });
        setState.snapshot({ ally: [], enemy: [] });
    }

    // 倍速按钮初始化
    initSpeedButtons();

    // 任意按钮点击钩子注册到 UIHandler 通道（ui/68 的 6 个按钮经此调用）
    GlobalStore.setUIHandler('onAnyButtonClick', onAnyButtonClick);
    import('./719-button-state.js').then(m => GlobalStore.setUIHandler('syncPauseState', m.syncPauseState));

    // 按钮事件绑定 → 709-ui-controls.js
    // 开场流程：首次未看过 → 开场CG（72）→ 精英图鉴选人 → 新手分步引导（71）；已看过CG → 图鉴 → 引导
    const coverStartFlow = () => {
        netSession.exitNetIdentity();
        const toGuide = () => showEliteGallery(() => stepAdjustStart());
        if (isOpeningCgDone()) { toGuide(); return; }
        showOpeningCg(() => toGuide());
    };
    // 普通开始：显式清 enemyAutoHex，防上一局新模式残留
    bindCoverStart(coverRef, updateSpeedButtons, () => {
        GlobalStore.set('enemyAutoHex', false);
        coverStartFlow();
    });
    // 六大派海克斯模式：同一套启动流程，只多一个标志位
    bindCoverStart(coverRef, updateSpeedButtons, () => {
        GlobalStore.set('enemyAutoHex', true);
        coverStartFlow();
    }, 'btnGameEnemyHex');
    bindPauseButton(getState, setState, updateButtons);
    // 联网对战：封面建房/加入房间（仅点击时才下载 mqtt.js 并连 broker，单机玩法全程离线）
    // 阶段3：连接成功 → 双方进摆位态（房主下发阵容）；收到 lineup / buffAsk / start 各走各的分支
    // 联网对战：封面建房/加入房间（仅点击时才下载 mqtt.js 并连 broker，单机玩法全程离线）
    // 阶段3：连接成功 → 双方进摆位态（房主下发阵容）；收到 lineup / buffAsk / start 各走各的分支。
    //   消息分发本体已拆去 ui/716-net-session.js（installNetSession 返回的回调）
    bindNetPvp(net, netSession.onNetMessage, netSession.onNetAccept);
    bindNextButton(setState, updateButtons, enableAllButtons, updateSpeedButtons);
    bindDebugButton(setState, updateSpeedButtons, updateDebugUI, updateUI);
    bindBGButton(showMusicPanel);
    bindDodgeButton(toggleFxPanel);
    bindSettleButton(() => getState.currentStage(), { val: isBattleStarting }, getState, setState, updateBuffSlots, updateUI, updateButtons, enableAllButtons, updateSpeedButtons, updateScoreBadge, doInitBattle, abortAll, clearAllEffects, clearLogExceptFirst, setRenderStore, renderGrid);
    bindStageSelectButton(() => getState.currentStage(), getState, setState, updateBuffSlots, updateUI, updateButtons, enableAllButtons, updateScoreBadge, abortAll, clearLogExceptFirst, clearAllEffects, doInitBattle, showModal);
    bindVoteFloat();
    bindXiaoZhaoSwitchButton();   // 小昭姊/妹摆位切换悬浮按钮（只在摆位阶段显示）
    bindGridClick(getState, setState, updateUI);
    bindCopyLogButton(showModal, copyLogToClipboard);
    // 2026-11-10 下线存档：原 initTutorial(cb) 的作用是给头部「❓」按钮绑点击——
    //   战斗中弹「⚔️ 规则一览」，战斗外重播分步引导。引导已搬 archive/712-tutorial.js，
    //   那个「❓」按钮（index.html 的 #btnTutorial）也一并从页面删除，故这里不再需要任何绑定。
    //   恢复时：把按钮 HTML 贴回 index.html 头部（见 archive/README.md 表格），并把下面这段换回 initTutorial(...)。

    document.getElementById('btnMain').addEventListener('click', async function(){
        onAnyButtonClick();

        // 联网从机摆位态：点「准备」→ 回传六大派站位，等房主开战
        if (GlobalStore.get('netRole') === 'guest' && getState.adjustMode()) {
            const UI = getState.UI();
            net.sendLineupReady((UI.enemyTeam || []).map(u => ({ uid: u.uid, pos: u.pos })));
            GlobalStore.set('netGuestReady', true);
            updateButtons();
            return;
        }

        // 全自动/手动共用战斗启动流程
        const startBattle = async (choice) => {
            // 修原班再战走势分析串局：battleLog 只在 doInitBattle（下一关/重开）和中止时清，
            //   原班再战两口都不走，第二局的条目会接在第一局后面——走势分析按回合号并账，伤害/击杀双份。
            //   开战是所有对局的公共漏斗，在这里跟 DOM 日志（clearLogExceptFirst）一起清内存日志。
            GlobalStore.set('battleLog', []);
            GlobalStore.set('battleFacts', []);
            clearLogExceptFirst(); hasLoggedTeam=false; fadeBGMTo(0.1,2000); logTeamInfo('初始阵容', getState.UI(), getState.gs(), battleResultForInfo, getState.activeBuffs(), hasLoggedTeam); hasLoggedTeam = true;
            stepCountdown();
            await showCountdown(TRASH_TALK_ALLY, TRASH_TALK_ENEMY, _randLocal, showDanmaku, autoScrollLog);
            let logDiv=document.getElementById('log'); logDiv.innerHTML+='<div class="separator">⚔️ 5v5对决开始 ⚔️</div>';
            autoScrollLog();
            // 选 Buff 前注入战斗 RNG：full-auto 与手动同源，保证同种子复现一致
            const _snap = getState.snapshot();
            setBattleRng(new SeededRNG(_snap?._rngSeed || Date.now()));
            // 张无忌专属（2026-11-13）：开局张无忌在队弹三选一。
            //   审核修正两道门：①联机跳过（host/guest 各自弹窗选不同项=失同步）②full-auto 跳过
            //   （弹窗会卡死自动跑批；评测口径不含此专属海克斯）
            if (!GlobalStore.get('netRole') && getState.autoLevel() !== 'full-auto') {
                const _zAlly = getState.UI().allyTeam || [];
                if (_zAlly.some(u => u.isZhang && u.alive)) {
                    const { showZhangExclusivePopup } = await import('./711-buff-dialog.js');
                    const picked = await showZhangExclusivePopup(_zAlly, false);
                    if (picked) {
                        const { createBuffObject } = await import('../modules/329-buff-tools.js');
                        const zhangBuff = createBuffObject(picked, null, CAMP_TYPES.ALLY, _zAlly);
                        getState.activeBuffs().push(zhangBuff);
                        // 选项「快来护驾」：立即召唤
                        if (picked === BUFF_TYPES.ZHANG_RESCUE) {
                            const { summonZhangRescue } = await import('../modules/302-elite-skills.js');
                            summonZhangRescue(_zAlly, null);
                        }
                        logDiv.innerHTML += `<span class="gold">☀️ 张无忌获得专属：${zhangBuff.name}</span><br>`;
                        autoScrollLog();
                    }
                }
            }
            if (GlobalStore.get('netRole') === 'host') {
                // 联网 PVP 阶段3：开局海克斯双向——房主统一发六大派选项，双方各选后合并
                await handlePvpBuffSelection(getPlayerContext(), getState.activeBuffs());
            } else if (getState.autoLevel() === 'full-auto') {
                const showBuffPopup = GlobalStore.getUIHandler('showBuffPopup');
                const newBuff = typeof showBuffPopup === 'function' ? await showBuffPopup(getPlayerContext(), CAMP_TYPES.ALLY, null, true, false) : null;
                if (newBuff) {
                    const buffs = getState.activeBuffs();
                    if (buffs.length >= 2) {
                        const shortest = buffs.reduce((a, b) => a.remaining < b.remaining ? a : b);
                        buffs.splice(buffs.indexOf(shortest), 1);
                    }
                    buffs.push(newBuff);
                    // 妹永久账本：开局选的 buff 也要记。原来只有每 3 回合那条路径（512）记，
                    //   开局这条完全不写——妹账本永远空、永久机制从开局就死。
                    recordXiaoZhaoPermanentBuff(newBuff);
                    updateBuffSlots(getState.activeBuffs());
                    logDiv.innerHTML += `<span class="gold">✨ 获得Buff：${newBuff.name}（${newBuff.permanent ? '整局' : '持续' + newBuff.remaining + '回合'}）</span><br>`;
                    autoScrollLog();
                }
                // 双海克斯模式：明教选完后，六大派也自动选一次（开局）
                if (GlobalStore.get('enemyAutoHex') && GlobalStore.get('netRole') !== 'host') {
                    await handleEnemyAutoBuffSelection(getPlayerContext(), getState.activeBuffs());
                }
            } else {
                stepBuff();
                // 统一走 70 弹窗（手选，且是战前状态）
                const showBuffPopup = GlobalStore.getUIHandler('showBuffPopup');
                const newBuff = typeof showBuffPopup === 'function' ? await showBuffPopup(getPlayerContext(), CAMP_TYPES.ALLY, null, false, false) : null;
                if (newBuff) {
                    const buffs = getState.activeBuffs();
                    if (buffs.length >= 2) {
                        let shortest = buffs.reduce((a, b) => a.remaining < b.remaining ? a : b);
                        buffs.splice(buffs.indexOf(shortest), 1);
                    }
                    buffs.push(newBuff);
                    // 妹永久账本：同上，开局手选这条路径也必须写
                    recordXiaoZhaoPermanentBuff(newBuff);
                    updateBuffSlots(getState.activeBuffs());
                    let logDiv = document.getElementById('log');
                    if (logDiv) {
                        logDiv.innerHTML += `<span class="gold">✨ 获得Buff：${newBuff.name}（${newBuff.permanent ? '整局' : '持续' + newBuff.remaining + '回合'}）</span><br>`;
                        autoScrollLog();
                    }
                }
                // 双海克斯模式：明教选完后，六大派也自动选一次（开局）
                if (GlobalStore.get('enemyAutoHex') && GlobalStore.get('netRole') !== 'host') {
                    await handleEnemyAutoBuffSelection(getPlayerContext(), getState.activeBuffs());
                }
            }
            await new Promise(r=>setTimeout(r,600));
            try {
                setState.gs(S.RUNNING); updateButtons(); document.getElementById('btnNext').disabled=true;
                abortController=new AbortController();
                // 必须同步进 ctx：playBattle 读的是 c.abortController（第377行），只给局部变量的话
                // 引擎拿不到 signal，中途 abort 无效（联网断线重连要靠它把房主的战斗掐掉）
                setState.abortController(abortController);
                const snap = getState.snapshot();
                snap.ally = getState.UI().allyTeam.map(u=>u.clone());
                let occupiedPositions = new Set(snap.ally.map(u => u.pos));
                let freePositions = [1,2,3,4,5,6,7,8,9].filter(p => !occupiedPositions.has(p));
                // 与明教对称：敌方阵容取自 UI.enemyTeam，PVP 下玩家调整过的站位才能生效
                // （doInitBattle 里 snapshot.enemy 与 UI.enemyTeam 是两份独立克隆，不能读 snapshot）
                let enemyList = getState.UI().enemyTeam.map(u => u.clone());
                for (let unit of enemyList) {
                    if (unit.pos === -1 || unit.pos == null) {
                        if (freePositions.length > 0) { unit.pos = freePositions[_randLocal(0, freePositions.length - 1)]; unit.state._originalPos = unit.pos; freePositions = freePositions.filter(p => p !== unit.pos); }
                        else { unit.pos = 1 + _randLocal(0, 8); unit.state._originalPos = unit.pos; }
                    }
                }
                // 冻结副本，不能冻 enemyList 本身：它紧接着要交给 UI，
                //   冻结后 resetBattleRuntime 写 _flash 会抛 "read only property"
                snap.enemy = Object.freeze(enemyList.map(u => Object.freeze(u.clone())));
                setState.snapshot(snap);
                const currentUI = getState.UI();
                currentUI.enemyTeam = enemyList;
                updateUI();
                stepBattleStart();
                await playBattle();
            } catch (e) {
                // #log 可能已被移除，catch 自身不能再崩（否则真错误被吞）
                console.error('战斗异常', e);
                const logDiv = document.getElementById('log');
                if (logDiv) {
                    const errorDiv = document.createElement('div');
                    errorDiv.innerHTML = `<span class="red">❌ 战斗异常中断：${e.message || e}</span><br>`;
                    logDiv.appendChild(errorDiv);
                    logDiv.scrollTop = logDiv.scrollHeight;
                }
            } finally {
                abortController=null;
                setState.abortController(null);
            }
            updateButtons();
            if (getState.autoLevel() === 'full-auto' && getState.gs() === 'GAMEOVER' && !GlobalStore.get('pvpMode')) {
                setTimeout(() => {
                    if (getState.currentStage() < 7) document.getElementById('btnMain').click();
                }, 3500);
            }
        };

        // GAMEOVER：下一关 / 重新开始；PVP 下房主可连续打下一关（从机由房主下发的 lineup 带回摆位态）
        if(getState.gs()===S.GAMEOVER){
            if(GlobalStore.get('pvpMode')){
                // 从机没有关卡权威：打完只能等房主下发新阵容，或自己退出
                if(GlobalStore.get('netRole') !== 'host'){ goBackToCover(); return; }
                resetBattleRuntime();
                clearLogExceptFirst(); clearAllEffects(); hasLoggedTeam=false;

                // 关卡推进
                const curStagePvp = GlobalStore.get('currentStage');
                if(curStagePvp >= 7){
                    setStage(1);
                    GlobalStore.set('_hasPlayedFair', false);
                } else {
                    setStage(curStagePvp + 1);
                }

                // 重置状态并生成新阵容
                currentDoubleStrikeUid = null;
                const pvpUI = getState.UI();
                const pvpSnap = getState.snapshot();
                setState.snapshot({ ally: [], enemy: [] });
                setState.activeBuffs([]);
                doInitBattle(getState.currentStage(), pvpUI, pvpSnap, getState.activeBuffs(), -1, null, true);
                setState.UI(pvpUI);
                setState.snapshot(pvpSnap);
                updateUI();
                updateScoreBadge();
                renderGrid('allyGrid', CAMP_TYPES.ALLY);
                renderGrid('enemyGrid', CAMP_TYPES.ENEMY);
                setState.adjustMode(true);
                setState.selectedAdjustPos(null);
                setState.gs(S.IDLE);
                setState.isPaused(false);
                isBattleStarting = false;
                updateButtons();
                enableAllButtons();
                updateSpeedButtons();
                // 重发阵容：从机收到后回到摆位态；房主按钮变「⏳ 等待对手」，等回传后才能开战
                sendNetLineup();
                return;
            }
            resetBattleRuntime();
            clearLogExceptFirst(); clearAllEffects(); hasLoggedTeam=false;

            // 关卡推进
            const curStage = GlobalStore.get('currentStage');
            if(curStage >= 7){
                setStage(1);
                GlobalStore.set('_hasPlayedFair', false);
            } else {
                setStage(curStage + 1);
            }

            // 重置状态并生成新阵容
            let currentUI = getState.UI();
            let currentSnapshot = getState.snapshot();
            setState.snapshot({ ally: [], enemy: [] });
            setState.activeBuffs([]);
            doInitBattle(getState.currentStage(), currentUI, currentSnapshot, getState.activeBuffs(), -1, currentDoubleStrikeUid, true);
            setState.UI(currentUI);
            setState.snapshot(currentSnapshot);
            updateUI();
            updateScoreBadge();
            renderGrid('allyGrid', CAMP_TYPES.ALLY);
            renderGrid('enemyGrid', CAMP_TYPES.ENEMY);
            // 全自动模式直接进入调整状态，让接下来的自动点击能直接开始战斗
            setState.adjustMode(getState.autoLevel() === 'full-auto');
            setState.gs(S.IDLE);
            setState.isPaused(false);
            isBattleStarting = false;
            updateButtons();
            enableAllButtons();
            updateSpeedButtons();
            // 全自动模式：自动触发第二次点击，从 IDLE 进入战斗
            if (getState.autoLevel() === 'full-auto' && !GlobalStore.get('pvpMode')) {
                setTimeout(() => {
                    document.getElementById('btnMain').click();
                }, 800);
            }
            return;
        }

        if(getState.gs()===S.IDLE&&!isBattleStarting){
            if(!getState.adjustMode()){
                if(getState.autoLevel() === 'full-auto') {
                    // 全自动：跳过调整，直接进入战斗
                    setState.adjustMode(false); setState.selectedAdjustPos(null); isBattleStarting=true; updateButtons(); updateUI();
                    startBattle('明教');
                    return;
                }
                setState.adjustMode(true); setState.selectedAdjustPos(null); updateButtons(); updateUI();
                stepAdjustMove();
            } else {
                setState.adjustMode(false); setState.selectedAdjustPos(null); isBattleStarting=true; updateButtons(); updateUI();
                if (getState.autoLevel() === 'full-auto') {
                    startBattle('明教');
                } else {
                    stepVoteOpen();
                    showVoteDialog(startBattle, GlobalStore.get('battleHasZhang'));
                }
            }
        }
    });

    function switchToStageInternal(stage){
    if (stage === getState.currentStage()) { forceStopGame(); setState.gs(S.IDLE); updateButtons(); enableAllButtons(); updateUI(); return; }
        onAnyButtonClick();
        let result = abortAll(abortController, getState.UI(), getState.waitingForNextRound(), isBattleStarting, getState.adjustMode(), getState.selectedAdjustPos(), getState.activeBuffs(), -1, currentDoubleStrikeUid, () => updateBuffSlots(getState.activeBuffs()));
        abortController = result.abortController; setState.waitingForNextRound(result.waitingForNextRound); isBattleStarting = result.isBattleStarting; setState.adjustMode(result.adjustMode); setState.selectedAdjustPos(result.selectedAdjustPos); setState.activeBuffs(result.activeBuffs); currentDoubleStrikeUid = result.currentDoubleStrikeUid;
        clearLogExceptFirst(); clearAllEffects(); hasLoggedTeam=false;
        setStage(stage);
        doInitBattle(getState.currentStage(), getState.UI(), getState.snapshot(), getState.activeBuffs(), -1, currentDoubleStrikeUid, true);
        setState.UI(getState.UI());
        setState.snapshot(getState.snapshot());
        updateUI(); setState.gs(S.IDLE); updateButtons(); enableAllButtons(); updateScoreBadge();
    }

    function forceStopGame(){
        const currentUI = getState.UI();
        if(!currentUI || !currentUI.allyTeam.length) return;
        let result = abortAll(abortController, currentUI, getState.waitingForNextRound(), isBattleStarting, getState.adjustMode(), getState.selectedAdjustPos(), getState.activeBuffs(), -1, currentDoubleStrikeUid, () => updateBuffSlots(getState.activeBuffs()));
        abortController = result.abortController; setState.waitingForNextRound(result.waitingForNextRound); isBattleStarting = result.isBattleStarting; setState.adjustMode(result.adjustMode); setState.selectedAdjustPos(result.selectedAdjustPos); setState.activeBuffs(result.activeBuffs); currentDoubleStrikeUid = result.currentDoubleStrikeUid;
        setState.gs(S.IDLE);setState.isPaused(false);setState.waitingForNextRound(false);isBattleStarting=false;
        try { updateUI(); } catch(e){}
        updateButtons();enableAllButtons();updateSpeedButtons();   // 清死重：连调两次删其一
    }

    function doManualReset(){
        setState.activeBuffs([]); setState.snapshot({ally:[],enemy:[]}); currentDoubleStrikeUid=null;
        forceStopGame();
        doInitBattle(getState.currentStage(), getState.UI(), getState.snapshot(), getState.activeBuffs(), -1, currentDoubleStrikeUid);
        setState.UI(getState.UI());
        setState.snapshot(getState.snapshot());
        updateUI();
        setState.gs(S.IDLE);updateButtons();enableAllButtons();
    }

    // PVP 战斗结束：退出 PVP 并回到封面，复位到普通模式初始状态
    // opts.keepNet：保留 MQTT 连接（只回封面，不拆房间）——掉线收口时用，等对手重新「加入」
    function goBackToCover(opts){
        const keepNet = !!(opts && opts.keepNet);
        // 从机主循环必须先掐掉：不 abort 的话旧循环会接着跑完 finishBattle，在封面上画出胜负
        const curCtx = getPlayerContext();
        if (curCtx && curCtx.abortController && !curCtx.abortController.signal.aborted) curCtx.abortController.abort();
        // 联网从机：只回封面、不断连——房主点「下一关」会重发 lineup，从机靠这条被拉回摆位态；
        // 断连的话房主那边等于打单机，下一关永远同步不过来。
        // 房主主动退出 / 单机路径：拆掉房间并擦角标，把左侧标题让回来
        const asGuest = GlobalStore.get('netRole') === 'guest';
        if (!asGuest && !keepNet) {
            // 残留 netRole 会让单机网格不可点（render/32 按 netRole 限权），必须一起清
            net.closeNetPvp();
            GlobalStore.set('netRole', null);
            clearNetBadge();
        } else if (keepNet) {
            // 连接留着等对手重连，但身份要清：不清的话按钮还会按主/从分支走，语义错乱
            GlobalStore.set('netRole', null);
        }
        GlobalStore.set('netGuestReady', false);
        GlobalStore.set('netPeerReady', false);
        GlobalStore.set('netGuestDone', false);
        GlobalStore.set('fastForwardActive', false);
        resetBattleRuntime();
        forceStopGame();
        GlobalStore.set('pvpMode', false);
        currentDoubleStrikeUid = null;
        isBattleStarting = false; hasLoggedTeam = false;
        setStage(1); GlobalStore.set('_hasPlayedFair', false);
        doInitBattle(getState.currentStage(), getState.UI(), getState.snapshot(), getState.activeBuffs(), -1, null, true);
        setState.UI(getState.UI());
        setState.snapshot(getState.snapshot());
        updateUI(); renderGrid('allyGrid', CAMP_TYPES.ALLY); renderGrid('enemyGrid', CAMP_TYPES.ENEMY);
        updateScoreBadge();
        const logDiv = document.getElementById('log');
        if (logDiv) logDiv.innerHTML = '<div class="separator">' + LOG_LINE1 + '</div>';
        gameStarted = false; coverRef.val = false;
        document.getElementById('coverOverlay').style.display = 'flex';
        updateButtons(); enableAllButtons(); updateSpeedButtons();
    }

    // 709-ui-controls.js 的 GAMEOVER 分支（原班再战/随机重开）需要重置局部变量
    GlobalStore.setUIHandler('resetIsBattleStarting', () => { isBattleStarting = false; });
    // 68 的「返回封面」按钮（联网 GAMEOVER 时挂到 btnNext 上）需要回到封面流程
    GlobalStore.setUIHandler('goBackToCover', goBackToCover);
    // 房主掉线收口：回封面但保留房间——对手重新「加入」时 onGuestJoin 会走 hostEnterAdjust 把房主拉回摆位态
    GlobalStore.setUIHandler('hostWaitReconnect', () => goBackToCover({ keepNet: true }));

    // window 桥接统一收口：仅保留体检/测试跑器真正调用的一项（原 selectStage / forceStopGame /
    // doManualReset / getGameState 四个挂载点全库无引用，已删）。生产代码一律走 import 或 UIHandler。
    window.__DSH_TEST_API__ = {
        selectStage: (stage) => { if (stage === getState.currentStage()) return; forceStopGame(); switchToStageInternal(stage); },
        // 补挂：体检改 autoLevel 后同步右下角模式按钮。121 原调 w.updateAutoModeButton
        // 是无效应（该函数从未挂 window，try/catch 静默吞），按钮一直显示旧模式文案
        syncAutoModeButton: () => updateAutoModeButton()
    };

    // Bug 现场切片（对症精简，目标 1~2KB）：
    //   自动记录 → 只带报错涉及的 1~2 个单位 + 相关状态字段；
    //   手动记录 → 带场上十人一行简表（名字/血/攻/防/站位/存活）。
    //   两种都带：回合、当前 buff、最近 5 条战斗日志、播放进度、面板/加速状态、版本、时间。
    function flattenBugLog(entries) {
        return (entries || []).map(e => {
            if (!e) return '';
            if (typeof e === 'string') return e;
            const parts = [];
            if (Array.isArray(e.entries)) {
                e.entries.forEach(x => { if (x && x.text) parts.push(stripTags(String(x.text))); });
            } else if (e.text) {
                parts.push(stripTags(String(e.text)));
            }
            return parts.join(' ').replace(/\s+/g, ' ').trim();
        }).filter(Boolean);
    }

    function buildTargetedBugContext(hintText, opts) {
        const hint = String(hintText || '');
        const manual = !!(opts && opts.mode === 'manual');
        const pickedUids = Array.isArray(opts && opts.picked) ? opts.picked : [];
        const ui = getState.UI();
        const all = [...((ui && ui.allyTeam) || []), ...((ui && ui.enemyTeam) || [])].filter(Boolean);
        const byUid = new Map(all.map(u => [u.uid, u]));
        const facts = (GlobalStore.get('battleFacts') || []).slice(-5);
        const battleLog = GlobalStore.get('battleLog') || [];
        const recentLog = flattenBugLog(battleLog.slice(-5)).map(s => s.slice(0, 60));

        // 自动记录：报错文字点名的单位 → 最近 fact 里出现过的单位 → 最近日志点名的单位 → 前两个存活
        let picked = all.filter(u => u.name && hint.includes(u.name)).slice(0, 2);
        if (!picked.length) {
            const uids = new Set();
            const collect = (o, depth) => {
                if (!o || typeof o !== 'object' || depth > 3) return;
                if (typeof o.uid === 'string' && o.uid && byUid.has(o.uid)) uids.add(o.uid);
                if (Array.isArray(o)) { o.forEach(v => collect(v, depth + 1)); return; }
                for (const k of Object.keys(o)) {
                    const v = o[k];
                    if (v && typeof v === 'object') collect(v, depth + 1);
                }
            };
            facts.forEach(f => collect(f && f.data, 0));
            picked = [...uids].map(uid => byUid.get(uid)).filter(Boolean).slice(0, 2);
        }
        if (!picked.length) {
            const logText = recentLog.join(' ');
            picked = all.filter(u => u.name && logText.includes(u.name)).slice(0, 2);
        }
        if (!picked.length) picked = all.filter(u => u.alive).slice(0, 2);
        const focused = pickedUids.map(uid => byUid.get(uid)).filter(Boolean);
        if (manual && focused.length) picked = focused.slice(0, 2);
        picked = picked.filter(Boolean);

        // 只留与报错相关的状态字段；没命中就取前 5 个活跃字段
        const activeKeysOf = (u) => Object.keys(u.state || {}).filter(k => {
            const v = u.state[k];
            if (v === null || v === undefined || v === 0 || v === false) return false;
            return !(Array.isArray(v) && !v.length);
        });
        const activeKeys = new Set();
        picked.forEach(u => activeKeysOf(u).forEach(k => activeKeys.add(k)));
        const related = [...activeKeys].filter(k => hint.includes(k));
        const compactVal = (v) => {
            if (v === null || v === undefined || typeof v === 'number' || typeof v === 'boolean') return v;
            if (typeof v === 'string') return v.length > 40 ? v.slice(0, 40) + '…' : v;
            let s;
            try { s = JSON.stringify(v); } catch (e) { s = String(v); }
            if (s && s.length <= 60) return v;                 // 小对象/小数组保持结构，避免转义后更肥
            return s ? s.slice(0, 60) + '…' : v;
        };
        const compactUnit = (u, withState) => {
            const out = {
                name: u.name, camp: u.camp, pos: u.pos,
                hp: u.hp, maxHp: u.maxHp, alive: !!u.alive
            };
            if (withState) {
                const keys = activeKeysOf(u);
                const use = (related.length ? related.filter(k => keys.includes(k)) : keys).slice(0, 5);
                const st = {};
                use.forEach(k => { st[k] = compactVal(u.state[k]); });
                out.state = st;
            }
            return out;
        };

        const units = manual
            ? all.slice(0, 10).map(u => [
                u.name, u.camp === 'ally' ? '明' : '六',
                u.hp, u.maxHp, u.atk, u.def, u.pos, u.alive ? 1 : 0
            ])
            : picked.slice(0, 2).map(u => compactUnit(u, true));

        const buffs = (getState.activeBuffs() || []).slice(-8).map(b => ({
            key: b.key, name: b.name, target: b.target, remaining: b.remaining
        }));

        // 出错位置：报错文字里点到过的 buff/技能名；没有就退回最近一条日志
        let skill = null;
        try {
            const buffCfg = CONFIG.BUFFS || {};
            for (const k of Object.keys(buffCfg)) {
                const cfg = buffCfg[k];
                if (cfg && cfg.name && hint.includes(cfg.name)) { skill = cfg.name; break; }
            }
        } catch (e) { skill = null; }
        if (!skill && related.length) {
            const cfg = CONFIG.BUFFS && CONFIG.BUFFS[related[0]];
            skill = (cfg && cfg.name) || related[0];
        }

        const out = {
            ver: VER,
            cfgVer: CFG_VER,
            stage: getState.currentStage(),
            round: ui && ui.round,
            gs: getState.gs(),
            paused: !!GlobalStore.get('isPaused'),
            speed: GlobalStore.get('speed'),
            nextRound: !!getState.waitingForNextRound(),
            adjustMode: !!getState.adjustMode(),
            buffIndex: GlobalStore.get('selectedBuffIndex'),
            playStep: battleLog.length,
            factTotal: (GlobalStore.get('battleFacts') || []).length,
            mode: manual ? 'manual' : 'auto',
            where: { skill: skill, lastAction: recentLog[recentLog.length - 1] || null },
            actions: facts.map(f => f && f.factType).filter(Boolean),
            log: recentLog,
            buffs: buffs,
            units: units,
            autoLevel: getState.autoLevel()
        };
        if (manual) {
            out.unitFields = ['名字', '阵营', '血', '血上限', '攻', '防', '站位', '存活'];
            if (focused.length) out.focus = focused.map(u => u.name);
        }
        return out;
    }

    // 手动记录的角色选择：把场上十人（名字/阵营/站位）发给 303 面板
    window.__BUG_UNITS__ = () => {
        try {
            const ui = getState.UI();
            return [...((ui && ui.allyTeam) || []), ...((ui && ui.enemyTeam) || [])]
                .filter(Boolean).slice(0, 10)
                .map(u => ({ uid: u.uid, name: u.name, camp: u.camp, pos: u.pos, alive: !!u.alive }));
        } catch (e) { return []; }
    };

    // Bug 快照：303 错误捕获面板的「🐞」会调用它。
    //   默认 opts.targeted → 对症切片（1~2KB）；opts.full → 旧的全量档，只在「下载完整报告」时用。
    window.__BUG_CONTEXT__ = (opts) => {
        const full = !!(opts && opts.full);
        if (opts && opts.targeted) {
            return buildTargetedBugContext(opts.hint, { mode: opts.mode, picked: opts.picked });
        }
        const limit = (opts && Number(opts.limit)) || (full ? 200 : 25);
        const domChars = full ? 30000 : 6000;
        const ui = getState.UI();
        const snap = getState.snapshot();
        // 单位只留排查必需的字段：原版把整个 u.state 塞进来，里面全是 buff 数组，最占体积
        const slimUnit = (u) => u ? ({
            uid: u.uid, name: u.name, camp: u.camp, pos: u.pos,
            hp: u.hp, maxHp: u.maxHp, alive: u.alive, atk: u.atk, def: u.def, role: u.role,
            // 只留状态里"有值"的键，空数组/0 全丢弃 —— 一个单位能从 ~300 字符压到 ~120
            state: (() => {
                const s = u.state || {};
                const o = {};
                for (const k of Object.keys(s)) {
                    const v = s[k];
                    if (v === null || v === undefined || v === 0 || v === false) continue;
                    if (Array.isArray(v) && !v.length) continue;
                    o[k] = v;
                }
                return o;
            })()
        }) : null;
        const take = (arr, n) => (Array.isArray(arr) ? arr.slice(-n) : []);
        const out = {
            stage: getState.currentStage(),
            round: ui && ui.round,
            gs: getState.gs(),
            autoLevel: getState.autoLevel(),
            netRole: GlobalStore.get('netRole'),
            adjustMode: getState.adjustMode(),
            activeBuffs: take(getState.activeBuffs(), 10),
            ally: (ui.allyTeam || []).map(slimUnit),
            enemy: (ui.enemyTeam || []).map(slimUnit),
            battleLog: take(GlobalStore.get('battleLog'), limit),
            battleFacts: take(GlobalStore.get('battleFacts'), limit),
            domLogText: (() => { const el = document.getElementById('log'); return el ? el.innerText.slice(-domChars) : ''; })()
        };
        // 快照只在全量档附带：95% 的情况和 ally/enemy 重复，白占一半体积
        if (full) {
            out.snapshotAlly = take(snap && snap.ally, 12).map(slimUnit);
            out.snapshotEnemy = take(snap && snap.enemy, 12).map(slimUnit);
        }
        return out;
    };

    try {
        updateButtons(); updateSpeedButtons(); updateDebugUI();
        setTimeout(() => updateCoverVersion(), 500);
        await Promise.all([loadGameData(), loadHexEnhanceData()]);
        doInitBattle(getState.currentStage(), getState.UI(), getState.snapshot(), getState.activeBuffs(), -1, currentDoubleStrikeUid);
        setState.UI(getState.UI());
        setState.snapshot(getState.snapshot());
        updateUI(); updateScoreBadge();
        document.getElementById('log').innerHTML = '<div class="separator">' + LOG_LINE1 + '</div>';
        updateAutoModeButton();
        syncFxButton();   // 按钮文案跟着「是否有任意特效开着」走（派生 dodgeEffectEnabled）
        // 虚影/飞走按钮已并入选关弹窗，此处不再刷新其文案
    } catch(e) {
        console.error('[光明顶5v5测试版] 初始化错误：', e.stack || e.message || e);
    }
});