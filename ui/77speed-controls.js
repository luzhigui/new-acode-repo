// ui/77speed-controls.js — 倍速控制系统（按钮高亮 / 手动锁 / 滚动降速）
// V1.3.0 | 2026-10-26 8x 档时钟锁「未进表倍率」：点 8x 不再让 clock 按 600/50=12 倍跑，
//   改 clock.setTimescale(getNoTableScale())，未进表演出速度由面板第一行统一控制。
// V1.2.0 | 2026-10-25 8x 按钮改造：点它 = 切 8x + 暂停 + 打开表现参数面板（ui/80 经 UIHandler openPerfPanel 注册），
//   不再走通用 attachSpeedButton 绑定（关闭面板即恢复运行）。
// V1.1.1 | 2026-10-25 | 全局 ×2：所有按钮值减半（原速 600→300、快 300→150、极快 100→50、慢 1600→800）；
//   点已亮的按钮 → 变回 1 倍速（原速 300）并清所有高亮（"取消"入口）。
export const VER = 'ui/77speed-controls.js V1.3.0';

import { getState, setState, GlobalStore } from '../infra/54-global-store.js';
import { clock } from '../infra/52-clock.js';
import { getNoTableScale } from '../core/23perf-params.js';

// 统一任意按钮点击钩子：原先 6 处直接调 window.onAnyButtonClick，
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

// 速度值（V1.1.0 全局 ×2）：
//   300 = 原速（2x 按钮）· 150 = 快（4x 按钮）· 50 = 极快（8x 按钮）· 800 = 慢（0.5x 按钮）
function getButtonBySpeedValue(val, isDebug) {
    if (val === 300) {
        return isDebug ? document.getElementById('btnSpeed2x') : document.getElementById('btnSpeed2');
    } else if (val === 50) {
        return document.getElementById('btnSpeed8x');
    } else if (val === 150) {
        return document.getElementById('btnSpeed4x');
    } else if (val === 800) {
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
        if (manualSpeedLock && manualSpeedValue && manualSpeedValue !== 800) {
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
        // V1.1.1：点已亮的按钮 → 变回 1 倍速（原速 300）并清所有高亮（用户要求恢复"取消"入口）
        if (btn.classList.contains('active')) {
            // 取消高亮 = 1 倍速（400）：比 2x（300）慢 1.33 倍，且不点亮任何按钮
            setState.speed(400);
            manualSpeedLock = false;
            manualSpeedValue = null;
            slideSpeedActive = true;
            const ctx = GlobalStore.get('playerContext');
            if (ctx) ctx.speed = 400;
            document.querySelectorAll('.controls button').forEach(b => {
                b.classList.remove('active', 'semi-active');
            });
            updateSpeedButtons();
            return;
        }
        setSpeed(speedVal, true);
    });
}

function activateScrollSlowdown() {
    if (GlobalStore.get('fastForwardActive')) return;
    const speed = getState.speed();
    if (speed === 800) return;  // 已经是慢速档
    preManualSpeedLock = manualSpeedLock;
    preManualSpeedValue = manualSpeedValue;
    slideSpeedActive = false;
    setState.speed(800);
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
        // 跨关倍速保持：74reset-runtime 每场战斗重置都会调本函数，
        //   用户手动选过倍速但本次未滚动过日志时 preManualSpeed* 是初始空值，
        //   这里优先尊重当前手动锁定值；完全没手动选过倍速才落回默认 300
        setState.speed(manualSpeedValue);
    } else {
        manualSpeedLock = false;
        manualSpeedValue = null;
        setState.speed(300);
    }
    updateSpeedButtons();
}

// 倍速按钮初始化由 ui/61 在 DOM 就绪后调用（export，不再挂 window）
function initSpeedButtons() {
    attachSpeedButton('btnSpeed2', 300);
    // 8x 按钮改造：点它 = 切到 8x + 暂停 + 打开参数面板（面板由 ui/80 注册 openPerfPanel）
    const btn8x = document.getElementById('btnSpeed8x');
    if (btn8x) {
        btn8x.addEventListener('click', () => {
            onAnyButtonClick();
            setSpeed(50, true);
            // 自定义档：时钟不再按 600/50=12 倍跑，改由「未进表倍率」决定第 B 类演出的速度。
            //   进表的项各自读参数表，与时钟无关。这样 8x 档下没有任何不受控的计时。
            clock.setTimescale(getNoTableScale());
            // 不再在按钮层强行暂停，全部交给 openPanel 去判断和接管
            const fn = GlobalStore.getUIHandler('openPerfPanel');
            if (typeof fn === 'function') fn();
        });
    }
    attachSpeedButton('btnSpeed4x', 150);
    attachSpeedButton('btnSpeed2x', 300);
    attachSpeedButton('btnSpeed05', 800);
    attachSpeedButton('btnSpeed05x', 800);
    setState.speed(300);
    manualSpeedLock = true;
    manualSpeedValue = 300;
    slideSpeedActive = true;
    updateSpeedButtons();
}

export { updateSpeedButtons, setSpeed, activateScrollSlowdown, restoreSpeedFromScroll, initSpeedButtons };