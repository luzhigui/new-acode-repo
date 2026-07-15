// ui/44ui-controls.js - 光明顶5v5 UI控制（倍速系统+按钮状态）
// V5.0.1 | ~3500 bytes | 2026-07-07
export const VER = 'ui/44ui-controls.js V5.0.1';

import { getState, setState, gs } from './39main-state.js';
import { updateUI } from './14ui-render-5v5-test.js';
import { onAnyButtonClick } from './13main-5v5-test.js';

// ==================== 倍速系统 ====================
let manualSpeedLock = false;
let manualSpeedValue = null;
let slideSpeedActive = true;
let preManualSpeedLock = false;
let preManualSpeedValue = null;

function getButtonBySpeedValue(val, isDebug) {
    if (val === 500) {
        return isDebug ? document.getElementById('btnSpeed2x') : document.getElementById('btnSpeed2');
    } else if (val === 143) {
        return document.getElementById('btnSpeed7x');
    } else if (val === 250) {
        return document.getElementById('btnSpeed4x');
    } else if (val === 1800) {
        return isDebug ? document.getElementById('btnSpeed05x') : document.getElementById('btnSpeed05');
    }
    return null;
}

function updateSpeedButtons() {
    const debugMode = getState.debugMode();
    const speed = getState.speed();
    const btn2 = document.getElementById('btnSpeed2');
    const btn05 = document.getElementById('btnSpeed05');
    const btn7x = document.getElementById('btnSpeed7x');
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

    [btn2, btn05, btn7x, btn4x, btn2x, btn05x].forEach(b => {
        if (!b) return;
        b.classList.remove('active', 'semi-active');
    });

    if (!slideSpeedActive) {
        // 滚动慢放中：0.5x 高亮
        const btn05Target = debugMode ? btn05x : btn05;
        if (btn05Target) btn05Target.classList.add('active');
        // 如果之前手动锁定了非0.5x倍速，半高亮
        if (manualSpeedLock && manualSpeedValue && manualSpeedValue !== 1800) {
            const lockedBtn = getButtonBySpeedValue(manualSpeedValue, debugMode);
            if (lockedBtn) lockedBtn.classList.add('semi-active');
        }
    } else if (manualSpeedLock) {
        // 正常播放且有手动锁定：亮对应按钮
        const activeBtn = getButtonBySpeedValue(speed, debugMode);
        if (activeBtn) activeBtn.classList.add('active');
    }
    // 其他情况：所有按钮不高亮
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
        if (typeof onAnyButtonClick === 'function') onAnyButtonClick();
        if (btn.classList.contains('active')) {
            // 取消高亮，恢复常速500，并强制同步播放器
            setState.speed(500);
            manualSpeedLock = false;
            manualSpeedValue = null;
            slideSpeedActive = true;
            // 强制重置播放器速度
            const ctx = window._getPlayerContext ? window._getPlayerContext() : null;
            if (ctx) {
                ctx.speed = 500;
                if (ctx._scheduler) {
                    ctx._scheduler.paused = false;
                    ctx._scheduler.setSpeed(1);
                }
            }
            // 立即清除所有按钮高亮状态，防止残留
            document.querySelectorAll('.controls button').forEach(b => {
                b.classList.remove('active', 'semi-active');
            });
            updateSpeedButtons();
        } else {
            // 切换至该倍速
            setSpeed(speedVal, true);
        }
    });
}

function activateScrollSlowdown() {
    if (window._fastForwardActive) return;
    const speed = getState.speed();
    if (speed === 1800) return;
    // 保存当前状态
    preManualSpeedLock = manualSpeedLock;
    preManualSpeedValue = manualSpeedValue;
    slideSpeedActive = false;
    setState.speed(1800);
    updateSpeedButtons();
}

function restoreSpeedFromScroll() {
    // 如果 slideSpeedActive 已经是 true，说明没有进入过慢放状态，不需要恢复
    if (slideSpeedActive) return;
    slideSpeedActive = true;
    if (preManualSpeedLock) {
        manualSpeedLock = true;
        manualSpeedValue = preManualSpeedValue;
        setState.speed(preManualSpeedValue);
    } else {
        manualSpeedLock = false;
        manualSpeedValue = null;
        setState.speed(500);
    }
    updateSpeedButtons();
    const ctx = window._getPlayerContext ? window._getPlayerContext() : null;
    if (ctx && ctx._scheduler) ctx._scheduler.setSpeed(1);
}

// 初始化倍速按钮
attachSpeedButton('btnSpeed2', 500);
attachSpeedButton('btnSpeed7x', 143);
attachSpeedButton('btnSpeed4x', 250);
attachSpeedButton('btnSpeed2x', 500);
attachSpeedButton('btnSpeed05', 1800);
attachSpeedButton('btnSpeed05x', 1800);

// 初始默认 2 倍速高亮
setSpeed(500, true);
updateSpeedButtons();

// ==================== 更新按钮状态 ====================
function updateButtons() {
    const S = { IDLE: 'IDLE', RUNNING: 'RUNNING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };
    const currentStage = getState.currentStage();
    let mainBtn=document.getElementById('btnMain'),nextBtn=document.getElementById('btnNext'),settleBtn=document.getElementById('btnSettle'),pauseBtn=document.getElementById('btnPause'),randomBtn=document.getElementById('btnRandom'),stageBtn=document.getElementById('btnStageSelect'),infoBtn=document.getElementById('btnInfo'),copyBtn=document.getElementById('copyLog');
    if(gs===S.IDLE){mainBtn.innerHTML=getState.adjustMode()?'▶ 开始<br><span style="font-size:8px;">(投票)</span>':'🔄 调整<br>站位';mainBtn.disabled=false;nextBtn.disabled=true;if(getState.adjustMode()){if(stageBtn)stageBtn.disabled=true;if(randomBtn)randomBtn.disabled=true;if(infoBtn)infoBtn.disabled=true;if(copyBtn)copyBtn.disabled=true;}else{if(stageBtn)stageBtn.disabled=false;if(randomBtn)randomBtn.disabled=false;if(infoBtn)infoBtn.disabled=false;if(copyBtn)copyBtn.disabled=false;}}else if(gs===S.GAMEOVER){mainBtn.innerHTML=currentStage>=6?'🔄 重新<br>开始':'▶ 下一关';mainBtn.disabled=false;nextBtn.disabled=true;}else{mainBtn.disabled=true;}if(gs===S.RUNNING||gs===S.PAUSED){settleBtn.textContent='⏭ 快进到底';settleBtn.disabled=false;}else if(gs===S.GAMEOVER){settleBtn.textContent='🔄 重新挑战';settleBtn.disabled=false;}else{settleBtn.disabled=true;}if(window.bulletTimeActive){pauseBtn.textContent='⏸️ 暂停';pauseBtn.disabled=true;pauseBtn.classList.remove('active');nextBtn.disabled=true;if(stageBtn)stageBtn.disabled=true;if(randomBtn)randomBtn.disabled=true;}else if(gs===S.RUNNING){pauseBtn.textContent='⏸️ 暂停';pauseBtn.disabled=false;pauseBtn.classList.remove('active');}else if(gs===S.PAUSED){pauseBtn.textContent='▶ 继续';pauseBtn.disabled=false;pauseBtn.classList.add('active');}else{pauseBtn.disabled=true;pauseBtn.classList.remove('active');}
}

function enableAllButtons() { document.querySelectorAll('.controls button').forEach(b => b.disabled = false); updateButtons(); }
function updateDebugUI() { let panel=document.getElementById('debugPanel'); const debugMode = getState.debugMode(); if(debugMode){if(panel)panel.style.display='flex';}else{if(panel)panel.style.display='none';} }

// ==================== 导出 ====================
export { updateSpeedButtons, setSpeed, activateScrollSlowdown, restoreSpeedFromScroll, updateButtons, enableAllButtons, updateDebugUI };

// 挂载到 window 供其他模块调用
window.updateButtons = updateButtons;
window.enableAllButtons = enableAllButtons;
window.updateSpeedButtons = updateSpeedButtons;
window._activateScrollSlowdown = activateScrollSlowdown;
window._restoreSpeedFromScroll = restoreSpeedFromScroll;