// ui/77speed-controls.js — 倍速控制系统（ui/68 拆分·批 1）
// V1.0.0 | ~6160 bytes | 2026-10-14 从 ui/68ui-controls.js 拆出：倍速系统整块迁入（5 个模块级状态 +
//   getButtonBySpeedValue/updateSpeedButtons/setSpeed/attachSpeedButton/activateScrollSlowdown/
//   restoreSpeedFromScroll/initSpeedButtons），外加 onAnyButtonClick 辅助（原 68 私有，
//   68 绑定层的 5 个 bind* 也从这里取用）。行为零变化，纯搬移。
export const VER = 'ui/77speed-controls.js V1.0.0';

import { getState, setState, GlobalStore } from '../infra/54-global-store.js';

// 2026-09-14 统一任意按钮点击钩子：原先 6 处直接调 window.onAnyButtonClick，
// 而该函数从未挂到 window 上（定义在 ui/61 且未导出），属静默失效；改为走 UIHandler 通道。
export function onAnyButtonClick() {
    const fn = GlobalStore.getUIHandler('onAnyButtonClick');
    if (typeof fn === 'function') fn();
}

// 倍速系统
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
        onAnyButtonClick();
        if (btn.classList.contains('active')) {
            setState.speed(1000);
            manualSpeedLock = false;
            manualSpeedValue = null;
            slideSpeedActive = true;
            const ctx = GlobalStore.get('playerContext');
            if (ctx) {
                ctx.speed = 1000;
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
    if (GlobalStore.get('fastForwardActive')) return;
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
    } else if (manualSpeedLock && manualSpeedValue) {
        // V7.8.1 | 2026-10-02 跨关倍速保持：74reset-runtime（原 69，10-08 改号）每场战斗重置都会调本函数，
        //   用户手动选过倍速但本次未滚动过日志时 preManualSpeed* 是初始空值，
        //   原 else 分支把倍速打回默认并清锁 → "上一关4倍速、下一关变回默认"。
        //   这里优先尊重当前手动锁定值；完全没手动选过倍速才落回默认 1000
        setState.speed(manualSpeedValue);
    } else {
        manualSpeedLock = false;
        manualSpeedValue = null;
        setState.speed(1000);
    }
    updateSpeedButtons();
}

// 倍速按钮初始化由 ui/61 在 DOM 就绪后调用（export，不再挂 window）
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

export { updateSpeedButtons, setSpeed, activateScrollSlowdown, restoreSpeedFromScroll, initSpeedButtons };
