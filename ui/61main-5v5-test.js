// V6.2.0 | ~27500 bytes | 2026-09-19 接入联网对战阶段1（封面创建/加入房间）
// V6.1.0 | ~27000 bytes | 2026-09-19 本地双人对战入口 bindCoverPvp
// V6.0.1 | 2026-09-11 ALL_VERS 赋值前移到 startApp 之前，保证 updateCoverVersion 动态版本列表在读取前已写入
export const VER = 'ui/61main-5v5-test.js V6.2.0';

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
import { VER as VER_PLAYER_CORE } from '../player/42player-core.js';
import { VER as VER_TEXT } from '../player/40player-text.js';
import { VER as VER_BUFF_UI } from '../player/41player-buff-ui.js';
import { addPermanentBuff, VER as VER_ELITE } from '../modules/20elite-skills.js';
// 精英组件注册（副作用：registerElite 注册到 08-elite-registry）
import '../modules/25elite-imperial.js';
import '../modules/26elite-sixsects.js';
import '../modules/27elite-mingjiao.js';
import { VER as VER_MAIN_UTILS } from './60main-utils.js';
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
let currentStage = 1;
function setStage(v) { currentStage = v; GlobalStore.set('currentStage', v); }
function getStage() { return currentStage; }
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
    const coverRef = { val: gameStarted };
    bindCoverStart(coverRef, updateSpeedButtons, () => {
        const toGuide = () => showEliteGallery(() => stepAdjustStart());
        if (isOpeningCgDone()) { toGuide(); return; }
        showOpeningCg(() => toGuide());
    });
    // PVP 本地双人对战：跳过 CG/图鉴/引导，直接进入双方同屏调整站位
    bindCoverPvp(() => {
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
    // 联网对战·阶段1：封面建房/加入房间（仅点击时才下载 PeerJS，单机玩法全程离线）
    bindNetPvp(net);
    bindNextButton(setState, updateButtons, enableAllButtons, updateSpeedButtons);
    bindDetailButton(getState, setState, showModal);
    bindDebugButton(setState, updateSpeedButtons, updateDebugUI, updateUI);
    bindBGButton(showMusicPanel);
    bindCrashModeButton();
    bindDodgeButton(toggleDodgeEffect);
    bindAutoButton(getState, setState);
    bindSettleButton(() => currentStage, { val: isBattleStarting }, getState, setState, updateBuffSlots, updateUI, updateButtons, enableAllButtons, updateSpeedButtons, updateScoreBadge, doInitBattle, abortAll, clearAllEffects, clearLogExceptFirst, setRenderStore, renderGrid);
    bindStageSelectButton(() => currentStage, getState, setState, updateBuffSlots, updateUI, updateButtons, enableAllButtons, updateScoreBadge, abortAll, clearLogExceptFirst, clearAllEffects, doInitBattle, showModal);
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

        // 全自动/手动共用战斗启动流程
        const startBattle = async (choice) => {
            clearLogExceptFirst(); hasLoggedTeam=false; fadeBGMTo(0.1,2000); logTeamInfo('初始阵容', getState.UI(), getState.gs(), battleResultForInfo, getState.activeBuffs(), hasLoggedTeam); hasLoggedTeam = true;
            await showCountdown(TRASH_TALK_ALLY, TRASH_TALK_ENEMY, _randLocal, showDanmaku, autoScrollLog);
            let logDiv=document.getElementById('log'); logDiv.innerHTML+='<div class="separator">⚔️ 5v5对决开始 ⚔️</div>';
            autoScrollLog();
            // 选 Buff 前注入战斗 RNG：full-auto 与手动同源，保证同种子复现一致
            const _snap = getState.snapshot();
            setBattleRng(new SeededRNG(_snap?._rngSeed || Date.now()));
            if (GlobalStore.get('pvpMode')) {
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
            }
            updateButtons();
            if (getState.autoLevel() === 'full-auto' && getState.gs() === 'GAMEOVER' && !GlobalStore.get('pvpMode')) {
                setTimeout(() => {
                    if (currentStage < 6) document.getElementById('btnMain').click();
                }, 3500);
            }
        };

        // GAMEOVER：下一关 / 重新开始；PVP 下改为返回封面
        if(getState.gs()===S.GAMEOVER){
            if(GlobalStore.get('pvpMode')){ goBackToCover(); return; }
            resetBattleRuntime();
            clearLogExceptFirst(); clearAllEffects(); hasLoggedTeam=false;

            // 关卡推进
            const curStage = GlobalStore.get('currentStage');
            if(curStage >= 6){
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
            doInitBattle(currentStage, currentUI, currentSnapshot, getState.activeBuffs(), -1, currentDoubleStrikeUid);
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
    if (stage === currentStage) { forceStopGame(); setState.gs(S.IDLE); updateButtons(); enableAllButtons(); updateUI(); return; }
        onAnyButtonClick();
        let result = abortAll(abortController, getState.UI(), getState.waitingForNextRound(), isBattleStarting, getState.adjustMode(), getState.selectedAdjustPos(), getState.activeBuffs(), -1, currentDoubleStrikeUid, () => updateBuffSlots(getState.activeBuffs()));
        abortController = result.abortController; setState.waitingForNextRound(result.waitingForNextRound); isBattleStarting = result.isBattleStarting; setState.adjustMode(result.adjustMode); setState.selectedAdjustPos(result.selectedAdjustPos); setState.activeBuffs(result.activeBuffs); currentDoubleStrikeUid = result.currentDoubleStrikeUid;
        clearLogExceptFirst(); clearAllEffects(); hasLoggedTeam=false;
        currentStage=stage;
        GlobalStore.set('currentStage', stage);
        doInitBattle(currentStage, getState.UI(), getState.snapshot(), getState.activeBuffs(), -1, currentDoubleStrikeUid);
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
        doInitBattle(currentStage, getState.UI(), getState.snapshot(), getState.activeBuffs(), -1, currentDoubleStrikeUid);
        setState.UI(getState.UI());
        setState.snapshot(getState.snapshot());
        updateUI();
        setState.gs(S.IDLE);updateButtons();enableAllButtons();
    }

    // PVP 战斗结束：退出 PVP 并回到封面，复位到普通模式初始状态
    function goBackToCover(){
        resetBattleRuntime();
        forceStopGame();
        GlobalStore.set('pvpMode', false);
        currentDoubleStrikeUid = null;
        isBattleStarting = false; hasLoggedTeam = false;
        setStage(1); GlobalStore.set('_hasPlayedFair', false);
        doInitBattle(currentStage, getState.UI(), getState.snapshot(), getState.activeBuffs(), -1, null);
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

    // window 桥接统一收口：仅保留体检/测试跑器真正调用的一项（原 selectStage / forceStopGame /
    // doManualReset / getGameState 四个挂载点全库无引用，已删）。生产代码一律走 import 或 UIHandler。
    window.__DSH_TEST_API__ = {
        selectStage: (stage) => { if (stage === currentStage) return; forceStopGame(); switchToStageInternal(stage); }
    };





    try {
        updateButtons(); updateSpeedButtons(); updateDebugUI();
        setTimeout(() => updateCoverVersion(), 500);
        await loadGameData();
        doInitBattle(currentStage, getState.UI(), getState.snapshot(), getState.activeBuffs(), -1, currentDoubleStrikeUid);
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