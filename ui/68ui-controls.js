// V5.5.0 | 2026-08-14 移除回放导入区块
export const VER = 'ui/68ui-controls.js V5.5.0';

import { getState, setState } from './63main-state.js';
import { updateUI, renderGrid, setRenderStore } from './62ui-render-5v5-test.js';
import { clearAllEffects } from '../player/42player-core.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { resetBattleRuntime } from './69reset-runtime.js';
import { CAMP_TYPES } from '../infra/56-battle-enums.js';

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
            const ctx = GlobalStore.get('playerContext');
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
    const ctx = GlobalStore.get('playerContext');
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

// 自动模式按钮同步
// btnAuto 文本/高亮必须实时反映真实 autoLevel。原实现只在玩家点菜单时更新文本，
// 外部(如体检)直接改 GlobalStore 的 autoLevel 时按钮会显示失真 → 属真 UI 缺陷，此处统一兜底。
const AUTO_LABELS = { manual: '手动', auto: '自动', 'full-auto': '全自动' };
function updateAutoModeButton() {
    const btn = document.getElementById('btnAuto');
    if (!btn) return;
    const lvl = getState.autoLevel?.() || 'auto';
    btn.textContent = AUTO_LABELS[lvl] || '自动';
    btn.classList.toggle('active', lvl !== 'manual');
    window._autoMode = lvl !== 'manual';
}

// 更新按钮状态
function updateButtons() {
    const gs = getState.gs();
    const S = { IDLE: 'IDLE', RUNNING: 'RUNNING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };
    const currentStage = getState.currentStage();
    updateAutoModeButton();
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
        pauseBtn.disabled=true;pauseBtn.classList.remove('active');
        return;
    }else{
        mainBtn.disabled=true;
        if(gs===S.RUNNING||gs===S.PAUSED){settleBtn.textContent='⏭ 快进到底';settleBtn.disabled=false;}else{settleBtn.disabled=true;}
    }
    if(GlobalStore.get('bulletTimeActive') && gs !== S.GAMEOVER && gs !== S.PAUSED){pauseBtn.textContent='⏸️ 暂停';pauseBtn.disabled=true;pauseBtn.classList.remove('active');nextBtn.disabled=true;if(stageBtn)stageBtn.disabled=true;if(randomBtn)randomBtn.disabled=true;}else if(gs===S.RUNNING){pauseBtn.textContent='⏸️ 暂停';pauseBtn.disabled=false;pauseBtn.classList.remove('active');}else if(gs===S.PAUSED){pauseBtn.textContent='▶ 继续';pauseBtn.disabled=false;pauseBtn.classList.add('active');}else{pauseBtn.disabled=true;pauseBtn.classList.remove('active');}
}

function enableAllButtons() { document.querySelectorAll('.controls button').forEach(b => b.disabled = false); updateButtons(); updateSpeedButtons(); }
function updateDebugUI() { let panel=document.getElementById('debugPanel'); const debugMode = getState.debugMode(); if(debugMode){if(panel)panel.style.display='flex';}else{if(panel)panel.style.display='none';} }



// 按钮事件绑定

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
            GlobalStore.set('bulletTimeActive', true);
            const ctx = window._getPlayerContext?.();
            if (ctx?._scheduler) ctx._scheduler.pause();
            document.body.classList.add('paused-animations');
        } else if (getState.gs() === 'PAUSED') {
            setState.gs('RUNNING');
            setState.isPaused(false);
            GlobalStore.set('bulletTimeActive', false);
            const ctx = window._getPlayerContext?.();
            if (ctx?._scheduler) ctx._scheduler.resume();
            document.body.classList.remove('paused-animations');
        }
        updateButtons();
    });
}

export function bindNextButton(setState, updateButtons, enableAllButtons, updateSpeedButtons) {
    document.getElementById('btnNext').addEventListener('click', function () {
        if (typeof window.onAnyButtonClick === 'function') window.onAnyButtonClick();
        if (getState.gs() === 'GAMEOVER') {
            resetBattleRuntime();
            setState.adjustMode(true);
            setState.selectedAdjustPos(null);
            const snap = getState.snapshot();
            const ctx = window._getPlayerContext?.();
            // 原班再战：恢复初始阵容（含全部单位、满血、初始属性），拒马不包含在内
            if (ctx && ctx._originalSnapshot) {
                snap.ally = ctx._originalSnapshot.ally.map(u => u.clone());
                snap.enemy = ctx._originalSnapshot.enemy.map(u => u.clone());
                const currentUI = getState.UI();
                currentUI.allyTeam = ctx._originalSnapshot.ally.map(u => u.clone());
                currentUI.enemyTeam = ctx._originalSnapshot.enemy.map(u => u.clone());
                setState.UI(currentUI);
            }
            setState.snapshot(snap);
            setState.gs('IDLE');
            updateButtons();
            if (typeof enableAllButtons === 'function') enableAllButtons();
            if (typeof updateSpeedButtons === 'function') updateSpeedButtons();
            updateUI();
            renderGrid('allyGrid', CAMP_TYPES.ALLY);
            renderGrid('enemyGrid', CAMP_TYPES.ENEMY);
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

export function bindSettleButton(currentStageGetter, isBattleStarting, getState, setState, updateBuffSlots, updateUI, updateButtons, enableAllButtons, updateSpeedButtons, updateScoreBadge, doInitBattle, abortAll, clearAllEffects, clearLogExceptFirst, setRenderStore, renderGrid) {
    document.getElementById('btnSettle').addEventListener('click', async function () {
        if (typeof window.onAnyButtonClick === 'function') window.onAnyButtonClick();
        const gs = getState.gs();
        const S = { IDLE: 'IDLE', RUNNING: 'RUNNING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };
        if (gs === S.GAMEOVER) {
            resetBattleRuntime();
            let currentUI = { allyTeam: [], enemyTeam: [], currentResult: null, round: 0, lastSnapshot: null };
            let snap = { ally: [], enemy: [] };
            const stage = typeof currentStageGetter === 'function' ? currentStageGetter() : currentStageGetter;
            doInitBattle(stage, currentUI, snap, [], -1, null);
            setState.UI(currentUI);
            setState.snapshot(snap);
            updateUI();
            renderGrid('allyGrid', CAMP_TYPES.ALLY);
            renderGrid('enemyGrid', CAMP_TYPES.ENEMY);
            updateButtons();
            enableAllButtons();
            updateSpeedButtons();
            updateScoreBadge();
            return;
        }
        window.GlobalStore?.set('fastForwardActive', true);
        setState.waitingForNextRound(false);
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
        if (GlobalStore.get('bulletTimeActive')) GlobalStore.set('bulletTimeActive', false);
        setState.waitingForNextRound(false);
        restoreSpeedFromScroll();
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

export function bindStageSelectButton(currentStageGetter, getState, setState, updateBuffSlots, updateUI, updateButtons, enableAllButtons, updateScoreBadge, abortAll, clearLogExceptFirst, clearAllEffects, doInitBattle, showModal) {
    document.getElementById('btnStageSelect').addEventListener('click', () => {
        if (getState.gs() !== 'IDLE') return;
        const currentStage = typeof currentStageGetter === 'function' ? currentStageGetter() : currentStageGetter;
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
            renderGrid('allyGrid', CAMP_TYPES.ALLY);
            renderGrid('enemyGrid', CAMP_TYPES.ENEMY);
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
                currentUI.allyTeam.forEach(u => { if (u.alive || u.state._isDead) tempMap[u.pos] = u; });
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
        // 移除已有弹窗
        const existing = document.getElementById('logPanelOverlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'logPanelOverlay';
        overlay.className = 'modal-overlay';
        overlay.style.background = 'rgba(0,0,0,0.7)';

        const box = document.createElement('div');
        box.className = 'modal-box';
        box.style.cssText = 'max-width:340px;background:#1a1a2e;color:#eee;padding:20px;position:relative;border:2px solid #ffd700;border-radius:12px;';

        // 标题
        const title = document.createElement('div');
        title.textContent = '📋 日志工具';
        title.style.cssText = 'color:#ffd700;font-size:16px;font-weight:bold;margin-bottom:16px;text-align:center;';
        box.appendChild(title);

        // ── 日志复制区 ──
        const copySection = document.createElement('div');
        copySection.style.cssText = 'margin-bottom:12px;';
        copySection.innerHTML = '<div style="color:#aaa;font-size:11px;margin-bottom:6px;">📝 日志复制</div>';

        const copyBtns = [
            { text: '📋 普通日志', value: 'normal', desc: '不含体检/版本信息' },
            { text: '📋 全部日志', value: 'all', desc: '包含所有内容' },
            { text: '📋 最新15行', value: 'recent15', desc: '最近15条记录' }
        ];
        copyBtns.forEach(b => {
            const btn = document.createElement('button');
            btn.textContent = b.text;
            btn.title = b.desc;
            btn.style.cssText = 'display:block;width:100%;margin-bottom:4px;padding:8px;background:#2a2a4e;color:#eee;border:1px solid #555;border-radius:6px;font-size:12px;cursor:pointer;text-align:left;';
            btn.onclick = () => {
                overlay.remove();
                copyLogToClipboard(b.value);
            };
            copySection.appendChild(btn);
        });
        box.appendChild(copySection);

        // ── 分隔线 ──
        const divider = document.createElement('div');
        divider.style.cssText = 'border-top:1px solid #444;margin:12px 0;';
        box.appendChild(divider);

        // ── 关闭按钮 ──
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '关闭';
        closeBtn.style.cssText = 'display:block;width:100%;padding:8px;background:#444;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;';
        closeBtn.onclick = () => overlay.remove();
        box.appendChild(closeBtn);

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    });
}

// 导出
export { updateSpeedButtons, setSpeed, activateScrollSlowdown, restoreSpeedFromScroll, updateButtons, updateAutoModeButton, enableAllButtons, updateDebugUI };