// ui/31main-5v5-test.js - 光明顶5v5 主控模块
// V5.4.0 | ~24200 bytes| 2026-07-07 拆分音频到42、特效到43、倍速+按钮到44
export const VER = 'ui/31main-5v5-test.js V5.4.0';

import '../modules/18global-store.js';
import '../modules/16error-capture.js';
import { CONFIG, STATE, KILL_TAUNT, ENEMY_M, loadGameData, VER as CFG_VER } from '../core/01config-5v5-test.js';
import { Unit, VER as VER_UNIT } from '../core/02unit.js';
import { getRandomTaunt, getKillTaunt, getZhangNearTaunt, makeFXSnapshot, VER as VER_UTILS } from '../core/03battle-utils.js';
import { stripTags, renderGrid, updateUI, setRenderStore, spawnVictoryEffects, clearLogExceptFirst, isUnitBenefitedByBuff, VER as UI_VER } from './32ui-render-5v5-test.js';
import { showDanmaku, showDamageFloat, showDodgeBubble, showHealFloat, VER as FX_VER } from '../fx/39fx-common-5v5-test.js';
import { showRangedArrow, VER as FA_VER } from '../fx/40fx-arrows-5v5-test.js';
import { showMeleeCrash, showMeleeDodge, showMeleeMiss, VER as FC_VER } from '../fx/41fx-crash-5v5-test.js';
import { playBattle, playLineText, clearAllEffects, handleBuffSummon, handleBuffDestroy, handleBuffLeech, VER as BP_VER } from '../player/27battle-player-5v5-test.js';
import { showModal, showAlert, updateCoverVersion, copyLogToClipboard, initBugAndXiaoZhaoModes } from './30main-utils.js';

// 拆分模块
import { getPlayerContext, getState, setState, gs } from '../ui/33main-state.js';
import { showBattleReport, showMusicPanel, showVoteDialog, showCountdown } from './34main-dialogs.js';
import {
    doInitBattle, generateBuffChoices, createBuffObject, showBuffSelection,
    tickBuffDurations, getActiveBuffList,
    logTeamInfo, abortAll
} from './35main-battle.js';
import { initBGM, playBGM, setBGMVolume, fadeBGMTo, toggleBGM, updateBGMBtn, lowerBGM } from './36audio-control.js';
import { toggleDodgeEffect, _triggerFX } from './37fx-trigger.js';
import { updateSpeedButtons, activateScrollSlowdown, restoreSpeedFromScroll, updateButtons, updateAutoModeButton, enableAllButtons, updateDebugUI, updateBuffSlots, bindCoverStart, bindPauseButton, bindNextButton, bindDetailButton, bindDebugButton, bindBGButton, bindCrashModeButton, bindDodgeButton, bindAutoButton, bindSettleButton, bindStageSelectButton, bindVoteFloat, bindGridClick, bindCopyLogButton } from './38ui-controls.js';

import { VER as VER_BUFF } from '../core/04buff-system.js';
import { VER as VER_HORSE } from '../core/05battle-horse.js';
import { VER as VER_CORE } from '../core/11battle-round.js';
import { SeededRNG } from '../core/07-rng.js';
import { setBattleRng } from '../core/13battle-shared.js';
import { VER as VER_PLAYER_CORE } from '../player/26player-core.js';
import { VER as VER_TEXT } from '../player/24player-text.js';
import { VER as VER_BUFF_UI } from '../player/25player-buff-ui.js';
import { addPermanentBuff, VER as VER_ELITE } from '../modules/15elite-skills.js';
// 精英组件注册（副作用：registerElite 注册到 08-elite-registry）
import '../modules/20elite-imperial.js';
import '../modules/21elite-sixsects.js';
import '../modules/22elite-mingjiao.js';
import { VER as VER_MAIN_UTILS } from './30main-utils.js';

const _randLocal = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const C = CONFIG, S = STATE, KT = KILL_TAUNT;

const LOG_LINE1 = '⚔️ 光明顶5v5对决 · 九宫格混战模式 ⚔️';

// ==================== 局部状态（仅 UI 控制，不包含 activeBuffs） ====================
let debugMode = false, speed = 500, userScrolled = false;
let abortController = null;
let battleResultForInfo = null, resettleCount = 0;
let gameStarted = false;
let hasLoggedTeam = false;
let isBattleStarting = false;
let currentStage = 1;
function setStage(v) { currentStage = v; GlobalStore.set('currentStage', v); }
function getStage() { return currentStage; }
GlobalStore.set('crashMode', 'fly');

let currentDoubleStrikeUid = null;
let runtimeMonitorActive = false;
let runtimeMonitorInterval = null;

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

const ALL_BUFF_KEYS = Object.keys(C.BUFFS);

function debugLog(msg) { if (!debugMode) return; let logDiv = document.getElementById('log'); let wrapper = document.createElement('div'); wrapper.innerHTML = `<span class="debug">[调试] ${msg}</span><br>`; logDiv.appendChild(wrapper); logDiv.scrollTop = logDiv.scrollHeight; }

async function waitWhilePaused() { while (getState.isPaused()) { await new Promise(r => setTimeout(r, 100)); } }

function updateScoreBadge() {
    const score = GlobalStore.get('voteScore');
    const token = GlobalStore.get('holyToken');
    const displayScore = (score === null || score === undefined) ? 0 : score;
    const displayToken = (token === null || token === undefined) ? 0 : token;
    document.getElementById('scoreBadge').innerHTML = `🏆 ${displayScore}分 🔥${displayToken}`;
}
export function onAnyButtonClick() { if (!gameStarted) return; const AudioManager = window.AudioManager; if (AudioManager && AudioManager.enabled && AudioManager.audio && AudioManager.audio.volume > 0.3) lowerBGM(); }
function autoScrollLog() { if (userScrolled) return; let logDiv = document.getElementById('log'); if (logDiv) logDiv.scrollTop = logDiv.scrollHeight; }
function onLogUserScroll() { let logDiv = document.getElementById('log'); if (!logDiv) return; let threshold = 10; let distToBottom = logDiv.scrollHeight - logDiv.scrollTop - logDiv.clientHeight; userScrolled = distToBottom > threshold; }



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
window._swapAllyPositions = swapAllyPositions;



// ==================== 运行时监控 ====================


function stopRuntimeMonitor() {
    runtimeMonitorActive = false;
    if (runtimeMonitorInterval) { clearInterval(runtimeMonitorInterval); runtimeMonitorInterval = null; }
    const logDiv = document.getElementById('log');
    logDiv.innerHTML += `<span class="gray">[体检] 静默监控已停止</span><br>`;
    autoScrollLog();
}

async function startApp() { updateCoverVersion(); }
startApp();

// ==================== DOM 初始化 ====================


// ★ 确保初始化代码总能执行（解决 ES 模块加载时序导致 DOMContentLoaded 漏掉的问题）
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initBugAndXiaoZhaoModes();
} else {
    document.addEventListener('DOMContentLoaded', initBugAndXiaoZhaoModes);
}

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

document.addEventListener('DOMContentLoaded', async function() {
    const controls = document.querySelector('.controls');
    if (controls) controls.style.zIndex = '100';

    if (!getState.UI().allyTeam.length) {
        setState.UI({ allyTeam: [], enemyTeam: [], currentResult: null, round: 0, lastSnapshot: null });
        setState.snapshot({ ally: [], enemy: [] });
    }

    // 倍速按钮初始化（从 44 延迟加载，解决循环依赖）
    if (typeof window._initSpeedButtons === 'function') window._initSpeedButtons();

    // 按钮事件绑定 → 38ui-controls.js
    bindCoverStart({ val: gameStarted }, updateSpeedButtons);
    bindPauseButton(getState, setState, updateButtons);
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

    document.getElementById('btnMain').addEventListener('click', async function(){
        onAnyButtonClick();

        // 全自动/手动共用战斗启动流程
        const startBattle = async (choice) => {
            clearLogExceptFirst(); hasLoggedTeam=false; fadeBGMTo(0.1,2000); logTeamInfo('初始阵容', getState.UI(), gs, battleResultForInfo, getState.activeBuffs(), hasLoggedTeam); hasLoggedTeam = true;
            await showCountdown(TRASH_TALK_ALLY, TRASH_TALK_ENEMY, _randLocal, showDanmaku, autoScrollLog);
            let logDiv=document.getElementById('log'); logDiv.innerHTML+='<div class="separator">⚔️ 5v5对决开始 ⚔️</div>';
            autoScrollLog();
            if (getState.autoLevel() === 'full-auto') {
                const allKeys = Object.keys(C.BUFFS);
                const existing = getState.activeBuffs().map(b => b.key);
                const allyTeam = getState.UI().allyTeam || [];
                const available = allKeys.filter(k => {
                    if (existing.includes(k)) return false;
                    if (k === 'fortify' && !getState.activeBuffs().some(b => b.remaining > 0)) return false;
                    const requiredRole = C.BUFF_ROLE_REQUIREMENTS?.[k];
                    if (requiredRole && !allyTeam.some(u => u.alive && u.role === requiredRole)) return false;
                    return true;
                });
                if (available.length > 0) {
                    const pick = available[_randLocal(0, available.length - 1)];
                    const duration = C.BUFFS[pick].duration || C.BUFF_DURATION;
                    const buffs = getState.activeBuffs();
                    if (buffs.length >= 2) {
                        const shortest = buffs.reduce((a, b) => a.remaining < b.remaining ? a : b);
                        buffs.splice(buffs.indexOf(shortest), 1);
                    }
                    buffs.push(createBuffObject(pick, duration));
                    // 小昭永久海克斯备份
                    const allyTeam = getState.UI().allyTeam;
                    const xz = allyTeam.find(u => u.isXiaoZhao);
                    if (xz) {
                        const extra = pick === 'holyFlame' ? { col: _randLocal(1, 3), row: _randLocal(1, 3) } : {};
                        addPermanentBuff(xz, pick, C.BUFFS[pick].name, extra);
                    }
                    updateBuffSlots(getState.activeBuffs());
                    logDiv.innerHTML += `<span class="gold">✨ 获得Buff：${C.BUFFS[pick].name}（持续${duration}回合）</span><br>`;
                    autoScrollLog();
                }
            } else {
                // 选 Buff 前注入战斗 RNG：showBuffSelection 的洗牌需要确定性 RNG（与 doInitBattle 同源）
                const _snap = getState.snapshot();
                setBattleRng(new SeededRNG(_snap?._rngSeed || Date.now()));
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
                let enemyList = snap.enemy.map(u => u.clone());
                for (let unit of enemyList) {
                    if (unit.pos === -1 || unit.pos == null) {
                        if (freePositions.length > 0) { unit.pos = freePositions[_randLocal(0, freePositions.length - 1)]; unit._originalPos = unit.pos; freePositions = freePositions.filter(p => p !== unit.pos); }
                        else { unit.pos = 1 + _randLocal(0, 8); unit._originalPos = unit.pos; }
                    }
                }
                snap.enemy = Object.freeze(enemyList.map(u => Object.freeze(u)));
                setState.snapshot(snap);
                const currentUI = getState.UI();
                currentUI.enemyTeam = enemyList;
                updateUI();
                await playBattle();

                let ctx = window._getPlayerContext();
                if (ctx && ctx.battleResultForInfo) {
                    showBattleReport(ctx.UI, ctx.battleResultForInfo);
                    if (getState.autoLevel() === 'full-auto') {
                        setTimeout(() => {
                            const overlay = document.getElementById('battleReportOverlay');
                            if (overlay) overlay.remove();
                            const float = document.getElementById('battleReportFloat');
                            if (float) float.remove();
                        }, 3000);
                    }
                }
            } catch (e) {
                let logDiv=document.getElementById('log'); let errorDiv=document.createElement('div');
                errorDiv.innerHTML=`<span class="red">❌ 战斗异常中断：${e.message || e}</span><br>`;
                logDiv.appendChild(errorDiv); logDiv.scrollTop=logDiv.scrollHeight;
                console.error('战斗异常', e);
            } finally {
                abortController=null;
            }
            updateButtons();
            if (getState.autoLevel() === 'full-auto' && gs === 'GAMEOVER') {
                setTimeout(() => {
                    if (currentStage < 6) document.getElementById('btnMain').click();
                }, 3500);
            }
        };

        // ==================== GAMEOVER：下一关 / 重新开始 ====================
        if(gs===S.GAMEOVER){
            // 清理旧战斗的 UI 残留
            const reportOverlay = document.getElementById('battleReportOverlay');
            if (reportOverlay) reportOverlay.remove();
            const reportFloat = document.getElementById('battleReportFloat');
            if (reportFloat) reportFloat.remove();
            const voteFloat = document.getElementById('voteFloat');
            if (voteFloat) voteFloat.style.display = 'none';
            const buffFloat = document.getElementById('buffFloatBtn');
            if (buffFloat) buffFloat.remove();
            document.querySelectorAll('.danmaku-bubble').forEach(el => el.remove());
            GlobalStore.set('fastForwardActive', false);
            GlobalStore.set('battleStore', null);
            setRenderStore(null);
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
            renderGrid('allyGrid', 'ally');
            renderGrid('enemyGrid', 'enemy');
            // 全自动模式直接进入调整状态，让接下来的自动点击能直接开始战斗
            setState.adjustMode(getState.autoLevel() === 'full-auto');
            setState.gs(S.IDLE);
            setState.isPaused(false);
            isBattleStarting = false;
            updateButtons();
            enableAllButtons();
            updateSpeedButtons();
            // 全自动模式：自动触发第二次点击，从 IDLE 进入战斗
            if (getState.autoLevel() === 'full-auto') {
                setTimeout(() => {
                    document.getElementById('btnMain').click();
                }, 800);
            }
            return;
        }

        if(gs===S.IDLE&&!isBattleStarting){
            if(!getState.adjustMode()){
                if(getState.autoLevel() === 'full-auto') {
                    // 全自动：跳过调整，直接进入战斗
                    setState.adjustMode(false); setState.selectedAdjustPos(null); isBattleStarting=true; updateButtons(); updateUI();
                    startBattle('明教');
                    return;
                }
                setState.adjustMode(true); setState.selectedAdjustPos(null); updateButtons(); updateUI(); if(window._refreshGlowCells)window._refreshGlowCells();
            } else {
                setState.adjustMode(false); setState.selectedAdjustPos(null); isBattleStarting=true; updateButtons(); updateUI();
                if (getState.autoLevel() === 'full-auto') {
                    startBattle('明教');
                } else {
                    showVoteDialog(startBattle, window._battleHasZhang);
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
        // 清除旧的 Store 引用，防止 renderGrid 访问无效 Store
        GlobalStore.set('battleStore', null);
        setRenderStore(null);
        try { updateUI(); } catch(e){}
        // 清理可能残留的战报弹窗和浮动按钮
        const reportOverlay = document.getElementById('battleReportOverlay');
        if (reportOverlay) reportOverlay.remove();
        const reportFloat = document.getElementById('battleReportFloat');
        if (reportFloat) reportFloat.remove();
        if (typeof restoreSpeedFromScroll === 'function') restoreSpeedFromScroll();
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

    window.selectStage = (stage)=>{ if(stage===currentStage)return; forceStopGame(); switchToStageInternal(stage); };
    window.forceStopGame = forceStopGame;
    window.doManualReset = doManualReset;
    window.getGameState = ()=>({ gs, currentStage, isPaused: getState.isPaused(), isBattleStarting, allyCount: getState.UI().allyTeam.length, enemyCount: getState.UI().enemyTeam.length });
    window._activateScrollSlowdown = activateScrollSlowdown;
    window._restoreSpeedFromScroll = restoreSpeedFromScroll;
    // 38ui-controls.js 的 GAMEOVER 分支（原班再战/随机重开）需要重置局部变量
    window._resetIsBattleStarting = () => { isBattleStarting = false; };





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