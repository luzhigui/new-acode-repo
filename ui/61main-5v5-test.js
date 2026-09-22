// V6.12.0 | ~44700 bytes | 2026-09-22 关卡循环扩到 7 关（第 7 关灭绝师太）：三处 6 → 7
export const VER = 'ui/61main-5v5-test.js V6.12.0';

import '../infra/54-global-store.js';
import { GlobalStore } from '../infra/54-global-store.js';
import '../modules/21error-capture.js';
import '../modules/30custom-effects.js';
import { CONFIG, STATE, loadGameData, VER as CFG_VER } from '../core/01config-5v5-test.js';
import { Unit, VER as VER_UNIT } from '../core/02unit.js';
import { VER as VER_UTILS } from '../core/03battle-utils.js';
import { stripTags, renderGrid, updateUI, setRenderStore, spawnVictoryEffects, clearLogExceptFirst, isUnitBenefitedByBuff, VER as UI_VER } from './62ui-render-5v5-test.js';
import { showDanmaku, showDamageFloat, showDodgeBubble, showHealFloat, VER as FX_VER } from '../fx/80fx-common-5v5-test.js';
import { showRangedArrow, VER as FA_VER } from '../fx/81fx-arrows-5v5-test.js';
import { showMeleeCrash, showMeleeDodge, showMeleeMiss, VER as FC_VER } from '../fx/82fx-crash-5v5-test.js';
import { playBattle, playLineText, clearAllEffects, handleBuffSummon, handleBuffDestroy, VER as BP_VER } from '../player/44battle-player-5v5-test.js';
import { showModal, showAlert, updateCoverVersion, copyLogToClipboard, initBugAndXiaoZhaoModes } from './60main-utils.js';
import { BUFF_TYPES, CAMP_TYPES } from '../infra/56-battle-enums.js';

// 拆分模块
import { getPlayerContext, getState, setState } from '../ui/63main-state.js';
import { resetBattleRuntime } from './69reset-runtime.js';
import { showMusicPanel, showVoteDialog, showCountdown } from './64main-dialogs.js';
import {
    doInitBattle, generateBuffChoices, createBuffObject, showBuffSelection,
    tickBuffDurations, getActiveBuffList,
    logTeamInfo, abortAll
} from './65main-battle.js';
import { initBGM, playBGM, setBGMVolume, fadeBGMTo, toggleBGM, updateBGMBtn, lowerBGM } from './66audio-control.js';
import { toggleDodgeEffect } from './67fx-trigger.js';
import { updateSpeedButtons, activateScrollSlowdown, restoreSpeedFromScroll, updateButtons, updateAutoModeButton, enableAllButtons, updateDebugUI, updateBuffSlots, bindCoverStart, bindCoverPvp, bindNetPvp, bindPauseButton, bindNextButton, bindDetailButton, bindDebugButton, bindBGButton, bindCrashModeButton, bindDodgeButton, bindAutoButton, bindSettleButton, bindStageSelectButton, bindVoteFloat, bindGridClick, bindCopyLogButton, initSpeedButtons } from './68ui-controls.js';
import * as net from '../infra/60-net-pvp.js';
import { stepAdjustStart, stepAdjustMove, stepBattleStart, initTutorial, resetTutorialDone } from './71tutorial.js';
import { isOpeningCgDone, showOpeningCg, resetOpeningCgDone } from './72opening-cg.js';

import { VER as VER_BUFF } from '../core/04buff-system.js';
import { VER as VER_HORSE } from '../core/05battle-horse.js';
import { VER as VER_CORE } from '../core/11battle-round.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import { setBattleRng, getBattleRng } from '../core/13battle-shared.js';
import { VER as VER_PLAYER_CORE, playBattleGuest } from '../player/42player-core.js';
import { handlePvpBuffSelection } from '../player/49battle-flow.js';
import { VER as VER_TEXT } from '../player/40player-text.js';
import { VER as VER_BUFF_UI } from '../player/41player-buff-ui.js';
import { addPermanentBuff, VER as VER_ELITE } from '../modules/20elite-skills.js';
// 精英组件注册（副作用：registerElite 注册到 08-elite-registry）
import '../modules/25elite-imperial.js';
import '../modules/26elite-sixsects.js';
import '../modules/27elite-mingjiao.js';
import { VER as VER_MAIN_UTILS } from './60main-utils.js';
import { createStore, battleReducer } from '../modules/24battle-store.js';
import { setGridStore } from '../render/32-grid-render.js';
// 2026-09-14 去 window 桥：直接 import，不再经 window.AudioManager
import { AudioManager } from '../modules/22audio-manager.js';

const _randLocal = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const C = CONFIG, S = STATE;

const LOG_LINE1 = '⚔️ 光明顶5v5对决 · 九宫格混战模式 ⚔️';

// 精英图鉴选人弹层：CG 之后、新手引导之前弹出，用户选定角色 → 提高该角色出场率（写 localStorage，29battle-init 读取加权）
// 2026-09-15 改为只弹一次：与开场CG同套路，选过就跳过（想重选走 dev-index 入口 或 清 localStorage）
const ELITE_GALLERY_DONE_KEY = 'ming_elite_gallery_done_5v5_test';
function isEliteGalleryDone() {
    try { return localStorage.getItem(ELITE_GALLERY_DONE_KEY) === '1'; } catch { return true; }
}
function markEliteGalleryDone() {
    try { localStorage.setItem(ELITE_GALLERY_DONE_KEY, '1'); } catch {}
}
function showEliteGallery(onDone) {
    if (isEliteGalleryDone()) { if (typeof onDone === 'function') onDone(); return; }
    const frame = document.createElement('iframe');
    frame.src = './展示与CG/精英展示-04-圣火单卡旋转-GLM5.3.html';
    frame.id = 'eliteGalleryFrame';
    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:100020;background:#03050a;';
    document.body.appendChild(frame);
    let closed = false;
    function close() {
        if (closed) return; closed = true;
        markEliteGalleryDone();
        window.removeEventListener('message', onMsg);
        try { frame.remove(); } catch {}
        if (typeof onDone === 'function') onDone();
    }
    function onMsg(e) {
        if (e.data && e.data.type === 'ming_elite_picked') close();
    }
    window.addEventListener('message', onMsg);
    frame.addEventListener('load', () => {});
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

// 2026-09-14 去重：实现唯一留在 infra/54，此处直接用 playerContext 版本，不再维护第二份
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

// ---- 联网对战阶段3：阵容 / 站位 / 海克斯双向 ----
// 从机收到的单位是普通对象（infra/60 reviveUnit 的产物，没有 Unit 方法），浅拷贝 + 单拷 state 即可
function clonePlainUnit(u) { return { ...u, state: { ...(u.state || {}) } }; }

// 从机不跑 doInitBattle，labelEnemy 的关卡文案没有别的地方会写（房主侧由 ui/65 写），统一走这里
function setGuestStageLabel(stage) {
    const n = stage || 1;
    const labelEnemy = document.getElementById('labelEnemy');
    if (labelEnemy) labelEnemy.textContent = n === 1 ? '六大派\n第一关' : `六大派\n第${n}关`;
}

// 把房主下发的阵容铺进 UI/snapshot，并进入摆位态（从机只摆六大派，网格权限见 68 bindGrid）
function applyNetLineup(lineup) {
    // 房主换关/开下一局重发阵容时，从机可能还卡在上一局的 playBattleGuest 循环里。
    // 直接 abort 旧循环 + 清残留 step，否则旧循环会接着播上一局的 step，最后还把 gs 打回 GAMEOVER
    const curCtx = getPlayerContext();
    if (curCtx && curCtx.abortController && !curCtx.abortController.signal.aborted) curCtx.abortController.abort();
    net.clearSteps();
    GlobalStore.set('fastForwardActive', false);
    GlobalStore.set('netGuestDone', false);

    const UI = getState.UI();
    UI.allyTeam = (lineup.ally || []).map(clonePlainUnit);
    UI.enemyTeam = (lineup.enemy || []).map(clonePlainUnit);
    UI.currentResult = null; UI.round = 0;
    const snap = getState.snapshot();
    snap.ally = (lineup.ally || []).map(clonePlainUnit);
    snap.enemy = (lineup.enemy || []).map(clonePlainUnit);
    setState.UI(UI); setState.snapshot(snap);

    // 2026-09-19 修「下一关从机画面不刷新」：renderGrid 取数 store 优先（32 的 getStore），
    // 上一局 playBattleGuest 留下的旧 battleStore 里还是残局阵容，只换 UI 队伍不换 store，
    // 格子画出来的永远是上一局 → 从机看着像「没收到数据」，实际数据早到了。
    // 与 playBattleGuest 同款重建：units 与 UI 队伍同引用，从机摆位改 pos 后渲染即刻生效；
    // 开战时 playBattleGuest 会再建一次，幂等无害。
    const seedUnits = [...UI.allyTeam, ...UI.enemyTeam];
    const newStore = createStore({ units: seedUnits, round: 1 }, battleReducer);
    GlobalStore.set('battleStore', newStore);
    setGridStore(newStore);
    setRenderStore(newStore);

    setStage(lineup.stage || 1);
    setGuestStageLabel(lineup.stage);
    GlobalStore.set('pvpMode', true);
    GlobalStore.set('netGuestReady', false);
    setState.autoLevel('auto'); setState.autoMode(true);
    setState.gs(S.IDLE); setState.isPaused(false);
    setState.adjustMode(true); setState.selectedAdjustPos(null);
    setState.activeBuffs([]); currentDoubleStrikeUid = null;
    isBattleStarting = false; hasLoggedTeam = false;
    // 联网从机：一进对局就注入本地 RNG。开局海克斯弹窗会调 createBuffObject（圣火令要抽 cols/rows），
    // 那时还没进 playBattleGuest，不在这里注入就会 null.nextInt 崩。
    // 本地 RNG 只保证不崩，战斗数据仍以房主下发的 step/activeBuffs 为准。
    setBattleRng(new SeededRNG(Date.now() % 1000000));
    // 联网对局不走新手引导（站位规则不同），顺手关掉可能已排队的开场引导，避免它压在海克斯弹窗上
    stepBattleStart();
    const overlay = document.getElementById('coverOverlay');
    if (overlay) overlay.style.display = 'none';
    clearLogExceptFirst(); clearAllEffects();
    updateUI();
    renderGrid('allyGrid', CAMP_TYPES.ALLY);
    renderGrid('enemyGrid', CAMP_TYPES.ENEMY);
    updateButtons(); updateSpeedButtons();
}

// 标题栏房间号角标由 68 的 setBadge 写（联网时它顶掉左侧标题），退出联网要在这里擦掉、把标题让回来
function clearNetBadge() {
    const header = document.querySelector('.header');
    if (header) header.classList.remove('net-mode');
    const badge = document.getElementById('netRoomBadge');
    if (badge) { badge.style.display = 'none'; badge.textContent = ''; badge.classList.remove('warn'); }
}

// 从封面开单机 / 本地双人前必须摘掉联网身份：残留 netRole 会让网格限权、视角翻转错乱（render/32 读 netRole）。
// 从机「返回封面」是故意保留连接的（等房主发下一关），只有玩家真去开别的模式才在这里断。
// 无条件 closeNetPvp：房主掉线后回封面时连接是留着的（等对手重连），不拆干净的话对手一「加入」
// 会把已经开单机的房主又拽回对局里
function exitNetIdentity() {
    clearNetBadge();
    net.closeNetPvp();
    GlobalStore.set('netRole', null);
    GlobalStore.set('netGuestReady', false);
    GlobalStore.set('netPeerReady', false);
    GlobalStore.set('netGuestDone', false);
    GlobalStore.set('fastForwardActive', false);
}

// 摆位实时同步：本地挪了人立刻把本阵营站位发给对面（未联网零副作用）。
// 由 68 的 bindGrid 在交换成功后经 UIHandler 调；只发自己管的那一队——房主明教、从机六大派
function syncNetPositions(camp) {
    const role = GlobalStore.get('netRole');
    if (!role) return;
    const UI = getState.UI();
    if (role === 'host' && camp === CAMP_TYPES.ALLY) {
        net.sendPosUpdate(CAMP_TYPES.ALLY, (UI.allyTeam || []).map(u => ({ uid: u.uid, pos: u.pos })));
    } else if (role === 'guest' && camp === CAMP_TYPES.ENEMY) {
        net.sendPosUpdate(CAMP_TYPES.ENEMY, (UI.enemyTeam || []).map(u => ({ uid: u.uid, pos: u.pos })));
    }
}
GlobalStore.setUIHandler('syncNetPositions', syncNetPositions);

// 收到对面的摆位同步：只按 uid 搬位置 + 重渲染那一队。
// 不碰 snapshot（65 里是 Object.freeze 的定稿，写它会抛）、不碰准备状态、不重置摆位态
function applyPosUpdate(msg) {
    const byUid = new Map((msg.positions || []).map(p => [p.uid, p.pos]));
    if (!byUid.size) return;
    const camp = msg.camp === CAMP_TYPES.ENEMY ? CAMP_TYPES.ENEMY : CAMP_TYPES.ALLY;
    const UI = getState.UI();
    const team = camp === CAMP_TYPES.ALLY ? UI.allyTeam : UI.enemyTeam;
    (team || []).forEach(u => { if (byUid.has(u.uid)) u.pos = byUid.get(u.uid); });
    setState.UI(UI);
    renderGrid(camp === CAMP_TYPES.ALLY ? 'allyGrid' : 'enemyGrid', camp);
}

// 房主：下发当前双方阵容（连接成功时、以及房主换关后都要重发）
// 重发即视为「对端准备失效」：换关后从机要重新摆位，开战按钮需再次等回传
function sendNetLineup() {
    if (GlobalStore.get('netRole') !== 'host') return;
    GlobalStore.set('netPeerReady', false);
    // 重发阵容 = 新一局：从机「本局播完」回执随之作废，房主「▶ 下一关」重新锁上
    GlobalStore.set('netGuestDone', false);
    const UI = getState.UI();
    net.sendLineup(getState.currentStage(), UI.allyTeam, UI.enemyTeam);
    updateButtons();
}
GlobalStore.setUIHandler('sendNetLineup', sendNetLineup);

// 房主：(重新)进入摆位态。从机首次加入、掉线重连、以及房主自己还卡在上一局战斗里，都走这里。
// 必须先掐掉本地战斗循环——不掐的话引擎会继续跑、继续发 step，刚连上的从机会收到一堆过期 step
function hostEnterAdjust() {
    const curCtx = getPlayerContext();
    if (curCtx && curCtx.abortController && !curCtx.abortController.signal.aborted) curCtx.abortController.abort();
    net.clearSteps();
    GlobalStore.set('fastForwardActive', false);
    GlobalStore.set('netPeerReady', false);
    setState.autoLevel('auto'); setState.autoMode(true);
    setState.isPaused(false);
    setState.gs(S.IDLE);
    setState.adjustMode(true); setState.selectedAdjustPos(null);
    setState.activeBuffs([]); currentDoubleStrikeUid = null;
    isBattleStarting = false; hasLoggedTeam = false;
    const overlay = document.getElementById('coverOverlay');
    if (overlay) overlay.style.display = 'none';
    gameStarted = true; coverRef.val = true;
    if (typeof AudioManager.init === 'function') AudioManager.init();
    sendNetLineup();
    updateUI();
    renderGrid('allyGrid', CAMP_TYPES.ALLY);
    renderGrid('enemyGrid', CAMP_TYPES.ENEMY);
    updateButtons(); updateSpeedButtons();
}



// 运行时监控

window.ALL_VERS = {
    config: CFG_VER,
    unit: VER_UNIT,
    utils: VER_UTILS,
    buff: VER_BUFF,
    horse: VER_HORSE,
    core: VER_CORE,
    player_core: VER_PLAYER_CORE,
    ui: UI_VER,
    fx_common: FX_VER
};

async function startApp() { updateCoverVersion(); }
startApp();

// DOM 初始化


// 确保初始化代码总能执行，解决模块加载时序
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initBugAndXiaoZhaoModes();
} else {
    document.addEventListener('DOMContentLoaded', initBugAndXiaoZhaoModes);
}

document.addEventListener('DOMContentLoaded', async function() {
    const controls = document.querySelector('.controls');
    if (controls) controls.style.zIndex = '100';

    if (!getState.UI().allyTeam.length) {
        setState.UI({ allyTeam: [], enemyTeam: [], currentResult: null, round: 0 });
        setState.snapshot({ ally: [], enemy: [] });
    }

    // 倍速按钮初始化（2026-09-14 改直接 import；原 window._initSpeedButtons 从未挂载 → 一直没执行）
    initSpeedButtons();

    // 任意按钮点击钩子注册到 UIHandler 通道（ui/68 的 6 个按钮经此调用）
    GlobalStore.setUIHandler('onAnyButtonClick', onAnyButtonClick);

    // 按钮事件绑定 → 68ui-controls.js
    // 开场流程：首次未看过 → 开场CG（72）→ 精英图鉴选人 → 新手分步引导（71）；已看过CG → 图鉴 → 引导
    bindCoverStart(coverRef, updateSpeedButtons, () => {
        exitNetIdentity();
        const toGuide = () => showEliteGallery(() => stepAdjustStart());
        if (isOpeningCgDone()) { toGuide(); return; }
        showOpeningCg(() => toGuide());
    });
    // PVP 本地双人对战：跳过 CG/图鉴/引导，直接进入双方同屏调整站位
    bindCoverPvp(() => {
        exitNetIdentity();
        gameStarted = true; coverRef.val = true;
        GlobalStore.set('pvpMode', true);
        setState.autoLevel('auto'); setState.autoMode(true);
        setState.gs(S.IDLE); setState.isPaused(false);
        setState.adjustMode(true); setState.selectedAdjustPos(null);
        setState.activeBuffs([]); currentDoubleStrikeUid = null;
        isBattleStarting = false; hasLoggedTeam = false;
        updateButtons(); updateUI(); updateSpeedButtons();
    });
    bindPauseButton(getState, setState, updateButtons);
    // 联网对战：封面建房/加入房间（仅点击时才下载 mqtt.js 并连 broker，单机玩法全程离线）
    // 阶段3：连接成功 → 双方进摆位态（房主下发阵容）；收到 lineup / buffAsk / start 各走各的分支
    bindNetPvp(net, (msg) => {
        if (!msg) return;
        // 房主：从机（重新）加入。走和首次连接同一条路——房主自己可能还卡在上一局的战斗循环里，
        // hostEnterAdjust 会先把本地战斗掐掉再重发阵容
        if (msg.t === 'guestJoin') {
            if (GlobalStore.get('netRole') !== 'host') return;
            hostEnterAdjust();
            return;
        }
        if (msg.t === 'lineup') { applyNetLineup(net.reviveLineup(msg.lineup || {})); return; }
        // 摆位实时同步：对面挪了人 → 只搬位置重渲染，不动准备状态（准备握手仍走 lineupReady）
        if (msg.t === 'posUpdate') { applyPosUpdate(msg); return; }
        if (msg.t === 'buffAsk') {
            // 从机：选项由房主下发（本机没有引擎 RNG），选完回传 key
            const showBuffPopup = GlobalStore.getUIHandler('showBuffPopup');
            const p = (typeof showBuffPopup === 'function')
                ? showBuffPopup(getPlayerContext(), CAMP_TYPES.ENEMY, msg.choices)
                : Promise.resolve(null);
            p.then(buff => net.sendBuffPick(buff ? buff.key : null));
            return;
        }
        if (msg.t === 'lineupReady') {
            // 房主：对手已回传六大派站位 → 合并进自己的 UI.enemyTeam，开战按钮解禁
            // 只改 UI.enemyTeam：snapshot.enemy 是 65 里 Object.freeze 的定稿（严格模式写它会抛，
            // 且规则本就要求"战斗进行中 snapshot 不反映当前态"），开战时 startBattle 会从 UI 重建 snap.enemy
            const UI = getState.UI();
            const byUid = new Map((msg.positions || []).map(p => [p.uid, p.pos]));
            (UI.enemyTeam || []).forEach(u => { if (byUid.has(u.uid)) u.pos = byUid.get(u.uid); });
            setState.UI(UI);
            GlobalStore.set('netPeerReady', true);
            renderGrid('enemyGrid', CAMP_TYPES.ENEMY);
            updateButtons();
            return;
        }
        if (msg.t === 'guestDone') {
            // 房主：从机本局演出播完了 → 解锁「▶ 下一关」，避免房主提前换关把从机画面切走
            GlobalStore.set('netGuestDone', true);
            updateButtons();
            return;
        }
        if (msg.t === 'start') {
            // 从机：房主开战 → 跳过 CG/图鉴/引导，只播演出不跑引擎
            const overlay = document.getElementById('coverOverlay');
            if (overlay) overlay.style.display = 'none';
            if (typeof AudioManager.init === 'function') AudioManager.init();
            if (typeof AudioManager.resumeAudioContext === 'function') AudioManager.resumeAudioContext();
            if (typeof AudioManager.play === 'function') AudioManager.play();
            gameStarted = true; coverRef.val = true;
            // 关卡兜底：房主选关时已发过 lineup，但 start 是「必定到达」的那条，据此补正关卡与左侧标签
            if (msg.stage) { setStage(msg.stage); setGuestStageLabel(msg.stage); }
            GlobalStore.set('pvpMode', true);
            setState.autoLevel('auto'); setState.autoMode(true);
            setState.gs(S.RUNNING); setState.isPaused(false);
            setState.adjustMode(false); setState.selectedAdjustPos(null);
            clearLogExceptFirst(); clearAllEffects();
            updateButtons(); updateUI(); updateSpeedButtons();
            playBattleGuest().catch(e => console.error('从机战斗异常', e));
            return;
        }
    }, (meta) => {
        // 连接成功：双方都进摆位态；房主额外下发阵容，且等对手回传后才能开战
        if (meta && meta.isHost) { hostEnterAdjust(); return; }
        // 2026-09-20 从机保险丝：身份（netRole=guest）刚落上就重画一遍，保证 guest-view 翻转即时生效。
        // 正常时序 accept 比 lineup 先到、applyNetLineup 渲染时身份已在（60 的 onGuestJoin 已调序）；
        // 这里兜的是消息乱序/重连等边角：哪怕阵容先到、先按房主视角画了，这一笔也会立刻翻正，
        // 不用等玩家点格子触发下一次 renderGrid 才突然换位。
        renderGrid('allyGrid', CAMP_TYPES.ALLY);
        renderGrid('enemyGrid', CAMP_TYPES.ENEMY);
    });
    bindNextButton(setState, updateButtons, enableAllButtons, updateSpeedButtons);
    bindDetailButton(getState, setState, showModal);
    bindDebugButton(setState, updateSpeedButtons, updateDebugUI, updateUI);
    bindBGButton(showMusicPanel);
    bindCrashModeButton();
    bindDodgeButton(toggleDodgeEffect);
    bindAutoButton(getState, setState);
    bindSettleButton(() => getState.currentStage(), { val: isBattleStarting }, getState, setState, updateBuffSlots, updateUI, updateButtons, enableAllButtons, updateSpeedButtons, updateScoreBadge, doInitBattle, abortAll, clearAllEffects, clearLogExceptFirst, setRenderStore, renderGrid);
    bindStageSelectButton(() => getState.currentStage(), getState, setState, updateBuffSlots, updateUI, updateButtons, enableAllButtons, updateScoreBadge, abortAll, clearLogExceptFirst, clearAllEffects, doInitBattle, showModal);
    bindVoteFloat();
    bindGridClick(getState, setState, updateUI);
    bindCopyLogButton(showModal, copyLogToClipboard);
    initTutorial(() => {
        resetOpeningCgDone();
        resetTutorialDone();
        showOpeningCg(() => showEliteGallery(() => stepAdjustStart()));
    });

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
            clearLogExceptFirst(); hasLoggedTeam=false; fadeBGMTo(0.1,2000); logTeamInfo('初始阵容', getState.UI(), getState.gs(), battleResultForInfo, getState.activeBuffs(), hasLoggedTeam); hasLoggedTeam = true;
            await showCountdown(TRASH_TALK_ALLY, TRASH_TALK_ENEMY, _randLocal, showDanmaku, autoScrollLog);
            let logDiv=document.getElementById('log'); logDiv.innerHTML+='<div class="separator">⚔️ 5v5对决开始 ⚔️</div>';
            autoScrollLog();
            // 选 Buff 前注入战斗 RNG：full-auto 与手动同源，保证同种子复现一致
            const _snap = getState.snapshot();
            setBattleRng(new SeededRNG(_snap?._rngSeed || Date.now()));
            if (GlobalStore.get('netRole') === 'host') {
                // 联网 PVP 阶段3：开局海克斯双向——房主统一发六大派选项，双方各选后合并
                await handlePvpBuffSelection(getPlayerContext(), getState.activeBuffs());
            } else if (GlobalStore.get('pvpMode')) {
                // PVP 本地双人对战：跳过海克斯 Buff 选择，保证双方对等
            } else if (getState.autoLevel() === 'full-auto') {
                const allKeys = Object.keys(C.BUFFS);
                const existing = getState.activeBuffs().map(b => b.key);
                const allyTeam = getState.UI().allyTeam || [];
                const available = allKeys.filter(k => {
                    if (existing.includes(k)) return false;
                    if (k === BUFF_TYPES.FORTIFY && !getState.activeBuffs().some(b => b.remaining > 0)) return false;
                    const requiredRole = C.BUFF_ROLE_REQUIREMENTS?.[k];
                    if (requiredRole && !allyTeam.some(u => u.alive && u.role === requiredRole)) return false;
                    return true;
                });
                if (available.length > 0) {
                    const rng = getBattleRng();
                    const pick = available[rng.nextInt(0, available.length - 1)];
                    const duration = C.BUFFS[pick].duration || C.BUFF_DURATION;
                    const buffs = getState.activeBuffs();
                    if (buffs.length >= 2) {
                        const shortest = buffs.reduce((a, b) => a.remaining < b.remaining ? a : b);
                        buffs.splice(buffs.indexOf(shortest), 1);
                    }
                    buffs.push(createBuffObject(pick, duration));
                    // 小昭永久海克斯备份
                    const allyTeam2 = getState.UI().allyTeam;
                    const xz = allyTeam2.find(u => u.isXiaoZhaoBrother);
                    if (xz) {
                        const extra = pick === BUFF_TYPES.HOLY_FLAME ? { col: rng.nextInt(1, 3), row: rng.nextInt(1, 3) } : {};
                        addPermanentBuff(xz, pick, C.BUFFS[pick].name, extra);
                    }
                    updateBuffSlots(getState.activeBuffs());
                    logDiv.innerHTML += `<span class="gold">✨ 获得Buff：${C.BUFFS[pick].name}（持续${duration}回合）</span><br>`;
                    autoScrollLog();
                }
            } else {
                await new Promise(resolve => { showBuffSelection(resolve, getState.activeBuffs(), -1, () => updateBuffSlots(getState.activeBuffs()), () => {}, autoScrollLog, getState.UI().allyTeam); });
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
                // 2026-09-16 冻结副本，不能冻 enemyList 本身：它紧接着要交给 UI，
                //   冻结后 resetBattleRuntime 写 _flash 会抛 "read only property"
                snap.enemy = Object.freeze(enemyList.map(u => Object.freeze(u.clone())));
                setState.snapshot(snap);
                const currentUI = getState.UI();
                currentUI.enemyTeam = enemyList;
                updateUI();
                stepBattleStart();
                await playBattle();
            } catch (e) {
                // 2026-09-16 #log 可能已被移除，catch 自身不能再崩（否则真错误被吞）
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
                doInitBattle(getState.currentStage(), pvpUI, pvpSnap, getState.activeBuffs(), -1, null);
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
            doInitBattle(getState.currentStage(), currentUI, currentSnapshot, getState.activeBuffs(), -1, currentDoubleStrikeUid);
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
                setState.adjustMode(true); setState.selectedAdjustPos(null); updateButtons(); updateUI(); if(window._refreshGlowCells)window._refreshGlowCells();
                stepAdjustMove();
            } else {
                setState.adjustMode(false); setState.selectedAdjustPos(null); isBattleStarting=true; updateButtons(); updateUI();
                if (GlobalStore.get('pvpMode')) {
                    // PVP 本地双人对战：双方站位已调完，跳过投票直接开战
                    startBattle('明教');
                } else if (getState.autoLevel() === 'full-auto') {
                    startBattle('明教');
                } else {
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
        doInitBattle(getState.currentStage(), getState.UI(), getState.snapshot(), getState.activeBuffs(), -1, currentDoubleStrikeUid);
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
        updateButtons();enableAllButtons();updateSpeedButtons();updateSpeedButtons();
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
        doInitBattle(getState.currentStage(), getState.UI(), getState.snapshot(), getState.activeBuffs(), -1, null);
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

    // 68ui-controls.js 的 GAMEOVER 分支（原班再战/随机重开）需要重置局部变量
    GlobalStore.setUIHandler('resetIsBattleStarting', () => { isBattleStarting = false; });
    // 68 的「返回封面」按钮（联网 GAMEOVER 时挂到 btnNext 上）需要回到封面流程
    GlobalStore.setUIHandler('goBackToCover', goBackToCover);
    // 房主掉线收口：回封面但保留房间——对手重新「加入」时 onGuestJoin 会走 hostEnterAdjust 把房主拉回摆位态
    GlobalStore.setUIHandler('hostWaitReconnect', () => goBackToCover({ keepNet: true }));

    // window 桥接统一收口：仅保留体检/测试跑器真正调用的一项（原 selectStage / forceStopGame /
    // doManualReset / getGameState 四个挂载点全库无引用，已删）。生产代码一律走 import 或 UIHandler。
    window.__DSH_TEST_API__ = {
        selectStage: (stage) => { if (stage === getState.currentStage()) return; forceStopGame(); switchToStageInternal(stage); }
    };





    try {
        updateButtons(); updateSpeedButtons(); updateDebugUI();
        setTimeout(() => updateCoverVersion(), 500);
        await loadGameData();
        doInitBattle(getState.currentStage(), getState.UI(), getState.snapshot(), getState.activeBuffs(), -1, currentDoubleStrikeUid);
        setState.UI(getState.UI());
        setState.snapshot(getState.snapshot());
        updateUI(); updateScoreBadge();
        document.getElementById('log').innerHTML = '<div class="separator">' + LOG_LINE1 + '</div>';
        document.getElementById('btnDetail').classList.toggle('active', getState.logLevel() !== 'brief');
        updateAutoModeButton();
        document.getElementById('btnDodgeToggle').classList.toggle('active', getState.dodgeEffectEnabled());
        document.getElementById('btnDodgeToggle').textContent = getState.dodgeEffectEnabled() ? '华丽' : '简单';
        document.getElementById('btnCrashMode').textContent = GlobalStore.get('crashMode') === 'fly' ? '🕊️飞走' : '👻虚影';
    } catch(e) {
        console.error('[光明顶5v5测试版] 初始化错误：', e.stack || e.message || e);
    }
});