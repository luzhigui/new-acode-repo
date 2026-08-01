﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// ui/44ui-controls.js - 光明顶5v5 UI控制（倍速系统+按钮状态+事件绑定）
// V5.3.1 | ~22900 bytes| 2026-07-27 合并13main按钮绑定、Buff槽更新
export const VER = 'ui/44ui-controls.js V5.3.1';

import { getState, setState, gs } from './39main-state.js';
import { updateUI, renderGrid } from './14ui-render-5v5-test.js';
import { clearAllEffects } from '../player/10player-core.js';

// ==================== 倍速系统 ====================
let manualSpeedLock = false;
let manualSpeedValue = null;
let slideSpeedActive = true;
let preManualSpeedLock = false;
let preManualSpeedValue = null;

function getButtonBySpeedValue(val, isDebug) {
    if (val === 600) {
        return isDebug ? document.getElementById('btnSpeed2x') : document.getElementById('btnSpeed2');
    } else if (val === 100) {
        return document.getElementById('btnSpeed8x');
    } else if (val === 300) {
        return document.getElementById('btnSpeed4x');
    } else if (val === 1600) {
        return isDebug ? document.getElementById('btnSpeed05x') : document.getElementById('btnSpeed05');
    }
    return null;
}

function updateSpeedButtons() {
    const debugMode = getState.debugMode();
    const speed = getState.speed();
    const btn2 = document.getElementById('btnSpeed2');
    const btn05 = document.getElementById('btnSpeed05');
    const btn8x = document.getElementById('btnSpeed8x');
    const btn4x = document.getElementById('btnSpeed4x');
    const btn2x = document.getElementById('btnSpeed2x');
    const btn05x = document.getElementById('btnSpeed05x');
    const grpH = document.getElementById('speedGroupHigh');
    const grpL = document.getElementById('speedGroupLow');

    if (debugMode) {
        if(btn2) btn2.style.display='none';
        if(btn05) btn05.style.display='none';
        if(grpH) grpH.style.display='flex';
        if(grpL) grpL.style.display='flex';
    } else {
        if(btn2) btn2.style.display='';
        if(btn05) btn05.style.display='';
        if(grpH) grpH.style.display='none';
        if(grpL) grpL.style.display='none';
    }

    [btn2, btn05, btn8x, btn4x, btn2x, btn05x].forEach(b => {
        if (!b) return;
        b.classList.remove('active', 'semi-active');
    });

    if (!slideSpeedActive) {
        const btn05Target = debugMode ? btn05x : btn05;
        if (btn05Target) btn05Target.classList.add('active');
        if (manualSpeedLock && manualSpeedValue && manualSpeedValue !== 1600) {
            const lockedBtn = getButtonBySpeedValue(manualSpeedValue, debugMode);
            if (lockedBtn) lockedBtn.classList.add('semi-active');
        }
    } else if (manualSpeedLock) {
        const activeBtn = getButtonBySpeedValue(speed, debugMode);
        if (activeBtn) activeBtn.classList.add('active');
    }
}

export function updateBuffSlots(activeBuffs) {
    for (let i = 0; i < 2; i++) {
        let slot = document.getElementById('buffSlot' + i);
        if (!slot) continue;
        if (i < activeBuffs.length) {
            let buff = activeBuffs[i];
            slot.textContent = buff.name + '/' + buff.remaining + '回';
            slot.classList.add('glow');
        } else {
            slot.textContent = 'buff' + (i + 1);
            slot.classList.remove('glow');
        }
    }
}

function setSpeed(val, lock) {
    setState.speed(val);
    if (lock) {
        manualSpeedLock = true;
        manualSpeedValue = val;
        slideSpeedActive = true;
    }
    updateSpeedButtons();
}

function attachSpeedButton(id, speedVal) {
    let btn = document.getElementById(id); if (!btn) return;
    btn.addEventListener('click', function() {
        if (typeof window.onAnyButtonClick === 'function') window.onAnyButtonClick();
        if (btn.classList.contains('active')) {
            setState.speed(1000);
            manualSpeedLock = false;
            manualSpeedValue = null;
            slideSpeedActive = true;
            const ctx = window._getPlayerContext ? window._getPlayerContext() : null;
            if (ctx) {
                ctx.speed = 1000;
                if (ctx._scheduler) {
                    ctx._scheduler.paused = false;
                    ctx._scheduler.setSpeed(1);
                }
            }
            document.querySelectorAll('.controls button').forEach(b => {
                b.classList.remove('active', 'semi-active');
            });
            updateSpeedButtons();
        } else {
            setSpeed(speedVal, true);
        }
    });
}

function activateScrollSlowdown() {
    if (window.GlobalStore?.get('fastForwardActive')) return;
    const speed = getState.speed();
    if (speed === 1600) return;
    preManualSpeedLock = manualSpeedLock;
    preManualSpeedValue = manualSpeedValue;
    slideSpeedActive = false;
    setState.speed(1600);
    updateSpeedButtons();
}

function restoreSpeedFromScroll() {
    if (slideSpeedActive) return;
    slideSpeedActive = true;
    if (preManualSpeedLock) {
        manualSpeedLock = true;
        manualSpeedValue = preManualSpeedValue;
        setState.speed(preManualSpeedValue);
    } else {
        manualSpeedLock = false;
        manualSpeedValue = null;
        setState.speed(1000);
    }
    updateSpeedButtons();
    const ctx = window._getPlayerContext ? window._getPlayerContext() : null;
    if (ctx && ctx._scheduler) ctx._scheduler.setSpeed(1);
}

// 倍速按钮初始化延迟到 DOM 就绪后执行，避免循环依赖
function initSpeedButtons() {
    attachSpeedButton('btnSpeed2', 600);
    attachSpeedButton('btnSpeed8x', 100);
    attachSpeedButton('btnSpeed4x', 300);
    attachSpeedButton('btnSpeed2x', 600);
    attachSpeedButton('btnSpeed05', 1600);
    attachSpeedButton('btnSpeed05x', 1600);
    setState.speed(600);
    manualSpeedLock = true;
    manualSpeedValue = 600;
    slideSpeedActive = true;
    updateSpeedButtons();
}
window._initSpeedButtons = initSpeedButtons;

// ==================== 更新按钮状态 ====================
function updateButtons() {
    const S = { IDLE: 'IDLE', RUNNING: 'RUNNING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };
    const currentStage = getState.currentStage();
    let mainBtn=document.getElementById('btnMain'),nextBtn=document.getElementById('btnNext'),settleBtn=document.getElementById('btnSettle'),pauseBtn=document.getElementById('btnPause'),randomBtn=document.getElementById('btnRandom'),stageBtn=document.getElementById('btnStageSelect'),infoBtn=document.getElementById('btnInfo'),copyBtn=document.getElementById('copyLog');
    if(gs===S.IDLE){
        mainBtn.innerHTML=getState.adjustMode()?'▶ 开始<br><span style="font-size:8px;">(投票)</span>':'🔄 调整<br>站位';
        mainBtn.disabled=false;nextBtn.disabled=true;settleBtn.disabled=true;settleBtn.textContent='⏭ 快进到底';
        if(getState.adjustMode()){if(stageBtn)stageBtn.disabled=true;if(randomBtn)randomBtn.disabled=true;if(infoBtn)infoBtn.disabled=true;if(copyBtn)copyBtn.disabled=true;}else{if(stageBtn)stageBtn.disabled=false;if(randomBtn)randomBtn.disabled=false;if(infoBtn)infoBtn.disabled=false;if(copyBtn)copyBtn.disabled=false;}
    }else if(gs===S.GAMEOVER){
        mainBtn.innerHTML=currentStage>=6?'🔄 重新<br>开始':'▶ 下一关';mainBtn.disabled=false;
        nextBtn.innerHTML='🔄 原班再战';nextBtn.disabled=false;
        settleBtn.textContent='🎲 随机重开';settleBtn.disabled=false;
        if(stageBtn)stageBtn.disabled=false;
    }else{
        mainBtn.disabled=true;
        if(gs===S.RUNNING||gs===S.PAUSED){settleBtn.textContent='⏭ 快进到底';settleBtn.disabled=false;}else{settleBtn.disabled=true;}
    }
    if(window.bulletTimeActive){pauseBtn.textContent='⏸️ 暂停';pauseBtn.disabled=true;pauseBtn.classList.remove('active');nextBtn.disabled=true;if(stageBtn)stageBtn.disabled=true;if(randomBtn)randomBtn.disabled=true;}else if(gs===S.RUNNING){pauseBtn.textContent='⏸️ 暂停';pauseBtn.disabled=false;pauseBtn.classList.remove('active');}else if(gs===S.PAUSED){pauseBtn.textContent='▶ 继续';pauseBtn.disabled=false;pauseBtn.classList.add('active');}else{pauseBtn.disabled=true;pauseBtn.classList.remove('active');}
}

function enableAllButtons() { document.querySelectorAll('.controls button').forEach(b => b.disabled = false); updateButtons(); updateSpeedButtons(); }
function updateDebugUI() { let panel=document.getElementById('debugPanel'); const debugMode = getState.debugMode(); if(debugMode){if(panel)panel.style.display='flex';}else{if(panel)panel.style.display='none';} }

window.updateButtons = updateButtons;
window.enableAllButtons = enableAllButtons;
window.updateSpeedButtons = updateSpeedButtons;
window._activateScrollSlowdown = activateScrollSlowdown;
window._restoreSpeedFromScroll = restoreSpeedFromScroll;

// ==================== 按钮事件绑定（从 13main 迁移） ====================

export function bindCoverStart(gameStarted, updateSpeedButtons) {
    document.getElementById('coverStartBtn').addEventListener('click', function () {
        document.getElementById('coverOverlay').style.display = 'none';
        gameStarted.val = true;
        if (typeof window.AudioManager?.init === 'function') window.AudioManager.init();
        if (typeof window.AudioManager?.resumeAudioContext === 'function') window.AudioManager.resumeAudioContext();
        if (typeof window.AudioManager?.play === 'function') window.AudioManager.play();
        if (typeof window.AudioManager?.setVolume === 'function') window.AudioManager.setVolume(0.5);
        updateSpeedButtons();
    });
}

export function bindPauseButton(getState, setState, updateButtons) {
    document.getElementById('btnPause').addEventListener('click', function () {
        if (typeof window.onAnyButtonClick === 'function') window.onAnyButtonClick();
        if (getState.gs() === 'RUNNING') {
            setState.gs('PAUSED');
            setState.isPaused(true);
            window.bulletTimeActive = false;
            const ctx = window._getPlayerContext?.();
            if (ctx?._scheduler) ctx._scheduler.pause();
            document.body.classList.add('paused-animations');
        } else if (getState.gs() === 'PAUSED') {
            setState.gs('RUNNING');
            setState.isPaused(false);
            const ctx = window._getPlayerContext?.();
            if (ctx?._scheduler) ctx._scheduler.resume();
            document.body.classList.remove('paused-animations');
        }
        updateButtons();
    });
}

export function bindNextButton(setState, updateButtons) {
    document.getElementById('btnNext').addEventListener('click', function () {
        if (typeof window.onAnyButtonClick === 'function') window.onAnyButtonClick();
        if (getState.gs() === 'GAMEOVER') {
            clearAllEffects();
            GlobalStore.set('fastForwardActive', false);
            setState.gs('IDLE');
            setState.isPaused(false);
            setState.waitingForNextRound(false);
            setState.isBattleStarting(false);
            updateButtons();
            enableAllButtons();
            updateUI();
            renderGrid('allyGrid', 'ally');
            renderGrid('enemyGrid', 'enemy');
            return;
        }
        setState.waitingForNextRound(false);
        setState.gs('RUNNING');
        updateButtons();
    });
}

export function bindDetailButton(getState, setState, showModal) {
    document.getElementById('btnDetail').addEventListener('click', function () {
        const currentLevel = getState.logLevel();
        showModal('选择日志模式', [
            { text: '📋 详细', value: 'detailed', cls: 'buff' },
            { text: '📋 简要', value: 'brief', cls: 'buff' },
            { text: '🩺 调试', value: 'debug', cls: 'buff' }
        ], (choice) => {
            setState.logLevel(choice);
            this.textContent = choice === 'detailed' ? '详细' : (choice === 'brief' ? '简要' : '调试');
            if (window._renderAllLogs) window._renderAllLogs();
        });
    });
}

export function bindDebugButton(setState, updateSpeedButtons, updateDebugUI, updateUI) {
    document.getElementById('debugToggle').addEventListener('click', function () {
        if (typeof window.onAnyButtonClick === 'function') window.onAnyButtonClick();
        setState.debugMode(!getState.debugMode());
        const dm = getState.debugMode();
        this.classList.toggle('active', dm);
        this.textContent = 'V5.0';
        window.GlobalStore?.set('debugMode', dm);
        updateSpeedButtons();
        updateDebugUI();
        updateUI();
    });
}

export function bindBGButton(showMusicPanel) {
    document.getElementById('btnBGM').addEventListener('click', () => { showMusicPanel(); });
}

export function bindCrashModeButton() {
    document.getElementById('btnCrashMode').addEventListener('click', function () {
        const newMode = window.GlobalStore?.get('crashMode') === 'fly' ? 'ghost' : 'fly';
        window.GlobalStore?.set('crashMode', newMode);
        this.textContent = newMode === 'fly' ? '🕊️飞走' : '👻虚影';
    });
}

export function bindDodgeButton(toggleDodgeEffect) {
    document.getElementById('btnDodgeToggle').addEventListener('click', () => { toggleDodgeEffect(); });
}

export function bindSettleButton(currentStage, isBattleStarting, getState, setState, updateBuffSlots, updateUI, updateButtons, enableAllButtons, updateSpeedButtons, updateScoreBadge, doInitBattle, abortAll, clearAllEffects, clearLogExceptFirst, setRenderStore, renderGrid) {
    document.getElementById('btnSettle').addEventListener('click', async function () {
        if (typeof window.onAnyButtonClick === 'function') window.onAnyButtonClick();
        const gs = getState.gs();
        const S = { IDLE: 'IDLE', RUNNING: 'RUNNING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };
        if (gs === S.GAMEOVER) {
            clearAllEffects();
            GlobalStore.set('fastForwardActive', false);
            GlobalStore.set('battleStore', null);
            setRenderStore(null);
            const reportOverlay = document.getElementById('battleReportOverlay');
            if (reportOverlay) reportOverlay.remove();
            const reportFloat = document.getElementById('battleReportFloat');
            if (reportFloat) reportFloat.remove();
            const voteFloat = document.getElementById('voteFloat');
            if (voteFloat) voteFloat.style.display = 'none';
            const buffFloat = document.getElementById('buffFloatBtn');
            if (buffFloat) buffFloat.remove();
            setState.gs(S.IDLE);
            setState.isPaused(false);
            setState.waitingForNextRound(false);
            let currentUI = { allyTeam: [], enemyTeam: [], currentResult: null, round: 0, lastSnapshot: null };
            let snap = { ally: [], enemy: [] };
            doInitBattle(currentStage, currentUI, snap, [], -1, null);
            setState.UI(currentUI);
            setState.snapshot(snap);
            updateUI();
            renderGrid('allyGrid', 'ally');
            renderGrid('enemyGrid', 'enemy');
            updateButtons();
            enableAllButtons();
            updateSpeedButtons();
            updateScoreBadge();
            return;
        }
        window.GlobalStore?.set('fastForwardActive', true);
        setState.waitingForNextRound(false);
        window.GlobalStore?.set('skipBuffPopup', true);
        let ffCtx = window._getPlayerContext ? window._getPlayerContext() : null;
        if (ffCtx) {
            if (!ffCtx._originalSpeed) ffCtx._originalSpeed = ffCtx.speed;
            ffCtx.speed = 1;
            if (ffCtx._scheduler && ffCtx._scheduler.setSpeed) ffCtx._scheduler.setSpeed(50);
        }
        if (gs === S.PAUSED) {
            setState.gs(S.RUNNING);
            setState.isPaused(false);
            if (ffCtx && ffCtx._scheduler) ffCtx._scheduler.resume();
            document.body.classList.remove('paused-animations');
        }
        if (window.bulletTimeActive) window.bulletTimeActive = false;
        setState.waitingForNextRound(false);
        if (typeof window._restoreSpeedFromScroll === 'function') window._restoreSpeedFromScroll();
        updateButtons();
    });
}

export function bindAutoButton(getState, setState) {
    document.getElementById('btnAuto').addEventListener('click', function (e) {
        e.stopPropagation();
        const btn = this;
        const rect = btn.getBoundingClientRect();
        const existing = document.querySelector('.auto-menu-backdrop');
        if (existing) { existing.remove(); return; }
        const backdrop = document.createElement('div');
        backdrop.className = 'auto-menu-backdrop';
        backdrop.addEventListener('click', () => backdrop.remove());
        const menu = document.createElement('div');
        menu.className = 'auto-menu';
        menu.style.left = (rect.left - 10) + 'px';
        menu.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
        const levels = [
            { key: 'manual', label: '手动' },
            { key: 'auto', label: '自动' },
            { key: 'full-auto', label: '全自动' }
        ];
        const cur = getState.autoLevel?.() || 'auto';
        levels.forEach(l => {
            const mb = document.createElement('button');
            mb.textContent = l.label;
            if (cur === l.key) mb.classList.add('checked');
            mb.addEventListener('click', (ev) => {
                ev.stopPropagation();
                setState.autoLevel(l.key);
                const isManual = l.key === 'manual';
                const isFullAuto = l.key === 'full-auto';
                setState.autoMode(!isManual);
                btn.textContent = isManual ? '手动' : (isFullAuto ? '全自动' : '自动');
                btn.classList.toggle('active', !isManual);
                window._autoMode = !isManual;
                if (!isManual && getState.waitingForNextRound()) setState.waitingForNextRound(false);
                backdrop.remove();
            });
            menu.appendChild(mb);
        });
        backdrop.appendChild(menu);
        document.body.appendChild(backdrop);
    });
}

export function bindStageSelectButton(currentStage, getState, setState, updateBuffSlots, updateUI, updateButtons, enableAllButtons, updateScoreBadge, abortAll, clearLogExceptFirst, clearAllEffects, doInitBattle, showModal) {
    document.getElementById('btnStageSelect').addEventListener('click', () => {
        if (getState.gs() !== 'IDLE') return;
        const buttons = [];
        for (let i = 1; i <= 6; i++) { buttons.push({ text: i === currentStage ? `第${i}关 ◀` : `第${i}关`, value: i, cls: 'buff' }); }
        showModal('选择关卡', buttons, (stage) => {
            if (stage === currentStage) return;
            if (typeof window.onAnyButtonClick === 'function') window.onAnyButtonClick();
            const result = abortAll(null, getState.UI(), getState.waitingForNextRound(), false, getState.adjustMode(), getState.selectedAdjustPos(), getState.activeBuffs(), -1, null, () => updateBuffSlots(getState.activeBuffs()));
            setState.waitingForNextRound(result.waitingForNextRound);
            setState.adjustMode(result.adjustMode);
            setState.selectedAdjustPos(result.selectedAdjustPos);
            setState.activeBuffs(result.activeBuffs);
            clearLogExceptFirst();
            clearAllEffects();
            setState.currentStage(stage);
            doInitBattle(stage, getState.UI(), getState.snapshot(), getState.activeBuffs(), -1, null);
            setState.UI(getState.UI());
            setState.snapshot(getState.snapshot());
            updateUI();
            renderGrid('allyGrid', 'ally');
            renderGrid('enemyGrid', 'enemy');
            setState.gs('IDLE');
            updateButtons();
            enableAllButtons();
            updateScoreBadge();
        }, false, false);
    });
}

export function bindVoteFloat() {
    document.getElementById('voteFloat').addEventListener('click', function () {
        const overlay = document.getElementById('voteModalOverlay');
        if (overlay) { overlay.style.display = 'flex'; this.style.display = 'none'; }
    });
}

export function bindGridClick(getState, setState, updateUI) {
    document.getElementById('allyGrid').addEventListener('click', function (e) {
        if (!getState.adjustMode()) return;
        const cell = e.target.closest('.cell');
        if (!cell) return;
        const pos = parseInt(cell.dataset.pos);
        if (isNaN(pos)) return;
        const currentUI = getState.UI();
        const unit = currentUI.allyTeam.find(u => u.pos === pos);
        if (unit?.fixed) { cell.classList.add('cell-blocked'); setTimeout(() => cell.classList.remove('cell-blocked'), 500); return; }
        if (getState.selectedAdjustPos() === null) {
            setState.selectedAdjustPos(pos);
        } else {
            const targetUnit = currentUI.allyTeam.find(u => u.pos === pos);
            if (targetUnit?.fixed) { cell.classList.add('cell-blocked'); setTimeout(() => cell.classList.remove('cell-blocked'), 500); setState.selectedAdjustPos(null); updateUI(); return; }
            const posA = getState.selectedAdjustPos();
            const posB = pos;
            const unitA = currentUI.allyTeam.find(u => u.pos === posA);
            const unitB = currentUI.allyTeam.find(u => u.pos === posB);
            if (unitA?.fixed || unitB?.fixed) return;
            const zhang = currentUI.allyTeam.find(u => u.isZhang);
            if (zhang?.pos === 5) {
                const tempMap = {};
                currentUI.allyTeam.forEach(u => { if (u.alive || u._isDead) tempMap[u.pos] = u; });
                if (unitA) tempMap[posB] = unitA;
                if (unitB) tempMap[posA] = unitB;
                if (!unitB) delete tempMap[posA];
                if (!unitA) delete tempMap[posB];
                if (!tempMap[2]?.alive) {
                    const zhangCell = document.querySelector('#allyGrid .cell[data-pos="5"]');
                    if (zhangCell) { zhangCell.classList.add('cell-protected'); setTimeout(() => zhangCell.classList.remove('cell-protected'), 600); }
                    return;
                }
            }
            if (unitA) unitA.pos = posB;
            if (unitB) unitB.pos = posA;
            setState.selectedAdjustPos(null);
        }
        updateUI();
    });
}

export function bindCopyLogButton(showModal, copyLogToClipboard) {
    document.getElementById('copyLog').addEventListener('click', () => {
        showModal('选择复制类型', [
            { text: '📋 复制普通日志', value: 'normal', cls: 'buff' },
            { text: '📋 复制全部日志', value: 'all', cls: 'buff' },
            { text: '📋 复制最新15行', value: 'recent15', cls: 'buff' }
        ], (choice) => copyLogToClipboard(choice));
    });
}

// ==================== 导出 ====================
export { updateSpeedButtons, setSpeed, activateScrollSlowdown, restoreSpeedFromScroll, updateButtons, enableAllButtons, updateDebugUI };