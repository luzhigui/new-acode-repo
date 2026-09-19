// V6.8.0 | ~33600 bytes | 2026-09-19 身份角标改贴队伍标签左下角（房→明教下、从→六大派下，彻底不受调试面板影响）+ 从机视角翻转（自己队伍在下）；阶段3：各管一队摆位 + 准备/等待按钮 + buff 槽按阵营
export const VER = 'ui/68ui-controls.js V6.8.0';

// 2026-09-14 打断 63↔68 循环依赖：getState/setState 直接取自 infra/54（63 只做转发）
import { getState, setState, GlobalStore, getPlayerContext } from '../infra/54-global-store.js';
import { updateUI, renderGrid, setRenderStore } from './62ui-render-5v5-test.js';
import { clearAllEffects } from '../player/42player-core.js';
import { resetBattleRuntime } from './69reset-runtime.js';
import { CAMP_TYPES } from '../infra/56-battle-enums.js';
import { buffsOfCamp } from '../modules/28buff-tools.js';
import { AudioManager } from '../modules/22audio-manager.js';

// 2026-09-14 统一任意按钮点击钩子：原先 6 处直接调 window.onAnyButtonClick，
// 而该函数从未挂到 window 上（定义在 ui/61 且未导出），属静默失效；改为走 UIHandler 通道。
function onAnyButtonClick() {
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

// buff 槽：联网从机显示自己（六大派）的海克斯，其余情况显示明教
// 注意第二参在 infra/54 的旧调用里传的是 selectedBuffIndex（恒为 -1），必须校验合法性再当 camp 用
export function updateBuffSlots(activeBuffs, camp) {
    const role = GlobalStore.get('netRole');
    const isCamp = camp === CAMP_TYPES.ALLY || camp === CAMP_TYPES.ENEMY;
    const target = isCamp ? camp : (role === 'guest' ? CAMP_TYPES.ENEMY : CAMP_TYPES.ALLY);
    const list = buffsOfCamp(activeBuffs, target);
    for (let i = 0; i < 2; i++) {
        let slot = document.getElementById('buffSlot' + i);
        if (!slot) continue;
        if (i < list.length) {
            let buff = list[i];
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
    } else {
        manualSpeedLock = false;
        manualSpeedValue = null;
        setState.speed(1000);
    }
    updateSpeedButtons();
}

// 倍速按钮初始化由 ui/61 在 DOM 就绪后调用（export，不再挂 window）
export function initSpeedButtons() {
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
}

// 联网身份：队伍标签左下角角标 + 从机视角翻转
// 房主角标贴在自己队伍（明教）标签下→"房"；从机执六大派→贴六大派标签下→"从"。
// 不放日志标题栏——调试面板 one↔flex 切换会把它挤飞，队伍标签下固定不动。
function updateNetIdentity() {
    const role = GlobalStore.get('netRole');
    const allyTag = document.getElementById('allyRoleTag');
    if (allyTag) { allyTag.textContent = role === 'host' ? '房' : ''; allyTag.style.color = '#ffd700'; }
    const enemyTag = document.getElementById('enemyRoleTag');
    if (enemyTag) { enemyTag.textContent = role === 'guest' ? '从' : ''; enemyTag.style.color = '#6cb6ff'; }
    // 从机执六大派：战场纵向翻转，自己队伍在下方
    const bf = document.getElementById('battlefield');
    if (bf) bf.classList.toggle('guest-view', role === 'guest');
}

// 更新按钮状态
function updateButtons() {
    updateNetIdentity();
    const gs = getState.gs();
    const S = { IDLE: 'IDLE', RUNNING: 'RUNNING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };
    const currentStage = getState.currentStage();
    updateAutoModeButton();
    let mainBtn=document.getElementById('btnMain'),nextBtn=document.getElementById('btnNext'),settleBtn=document.getElementById('btnSettle'),pauseBtn=document.getElementById('btnPause'),randomBtn=document.getElementById('btnRandom'),stageBtn=document.getElementById('btnStageSelect'),infoBtn=document.getElementById('btnInfo'),copyBtn=document.getElementById('copyLog');
    if(gs===S.IDLE){
        const netRole = GlobalStore.get('netRole');
        if(getState.adjustMode()){
            if(netRole==='guest'){
                // 从机：只摆六大派，摆完点「准备」回传站位
                const ready = GlobalStore.get('netGuestReady');
                mainBtn.innerHTML = ready ? '⏳ 等待<br>房主' : '✅ 准备';
                mainBtn.disabled = !!ready;
            }else if(netRole==='host'){
                // 房主：等从机回传站位后才能开战
                const peerReady = GlobalStore.get('netPeerReady');
                mainBtn.innerHTML = peerReady ? '▶ 开战' : '⏳ 等待<br>对手';
                mainBtn.disabled = !peerReady;
            }else{
                mainBtn.innerHTML = GlobalStore.get('pvpMode')?'▶ 开战':'▶ 开始<br><span style="font-size:8px;">(投票)</span>';
                mainBtn.disabled = false;
            }
        }else{
            mainBtn.innerHTML='🔄 调整<br>站位';mainBtn.disabled=false;
        }
        nextBtn.disabled=true;settleBtn.disabled=true;settleBtn.textContent='⏭ 快进到底';
        if(getState.adjustMode()){if((!GlobalStore.get('pvpMode')||netRole==='guest')&&stageBtn)stageBtn.disabled=true;if(randomBtn)randomBtn.disabled=true;if(infoBtn)infoBtn.disabled=true;if(copyBtn)copyBtn.disabled=true;}else{if(stageBtn)stageBtn.disabled=false;if(randomBtn)randomBtn.disabled=false;if(infoBtn)infoBtn.disabled=false;if(copyBtn)copyBtn.disabled=false;}
    }else if(gs===S.GAMEOVER){
        if(GlobalStore.get('pvpMode')){
            mainBtn.innerHTML='🏠 返回<br>封面';mainBtn.disabled=false;
            nextBtn.disabled=true;settleBtn.disabled=true;
            if(stageBtn)stageBtn.disabled=true;
            pauseBtn.disabled=true;pauseBtn.classList.remove('active');
            return;
        }
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

export function bindCoverStart(gameStarted, updateSpeedButtons, onStart) {
    document.getElementById('coverStartBtn').addEventListener('click', function () {
        document.getElementById('coverOverlay').style.display = 'none';
        gameStarted.val = true;
        if (typeof AudioManager.init === 'function') AudioManager.init();
        if (typeof AudioManager.resumeAudioContext === 'function') AudioManager.resumeAudioContext();
        if (typeof AudioManager.play === 'function') AudioManager.play();
        if (typeof AudioManager.setVolume === 'function') AudioManager.setVolume(0.5);
        updateSpeedButtons();
        if (typeof onStart === 'function') onStart();
    });
}

// PVP 本地双人对战入口：只关封面 + 初始化音频，不走开场CG/精英图鉴/新手引导
export function bindCoverPvp(onStartPvp) {
    const btn = document.getElementById('coverPvpBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
        document.getElementById('coverOverlay').style.display = 'none';
        if (typeof AudioManager.init === 'function') AudioManager.init();
        if (typeof AudioManager.resumeAudioContext === 'function') AudioManager.resumeAudioContext();
        if (typeof AudioManager.play === 'function') AudioManager.play();
        if (typeof AudioManager.setVolume === 'function') AudioManager.setVolume(0.5);
        if (typeof onStartPvp === 'function') onStartPvp();
    });
}

// 联网对战：封面三个控件（创建房间 / 输入房间号 / 加入）+ 状态行
// 联网对战入口（阶段3：阵容/站位/海克斯双向）
// onNetMsg(msg)：除 step 外的全部网络消息交给调用方处理（lineup / buffAsk / start）
// onConnected(meta)：连接成功回调（房主据此下发阵容，双方据此进摆位态）
export function bindNetPvp(net, onNetMsg, onConnected) {
    const createBtn = document.getElementById('netCreateBtn');
    const joinBtn = document.getElementById('netJoinBtn');
    const input = document.getElementById('netRoomInput');
    const line = document.getElementById('netStatusLine');
    if (!createBtn || !joinBtn || !line) return;

    const say = (txt, color) => { line.textContent = txt; line.style.color = color || '#b8a88a'; };
    const onState = (status, meta) => {
        if (status === 'creating') say('正在建房…');
        else if (status === 'waiting') { say('房间已建好，把房间号发给对手：' + meta.roomId, '#ffd700'); if (input) input.value = meta.roomId; }
        else if (status === 'joining') say('正在连接房主…');
        else if (status === 'connected') {
            // netRole 是全局对局身份：网格可点权限、buff 槽阵营都读它
            GlobalStore.set('netRole', meta && meta.isHost ? 'host' : 'guest');
            say('✅ 已连接对手' + (meta && meta.isHost ? '（你是房主）' : '（你是加入方）'), '#4ade80');
            if (typeof onConnected === 'function') onConnected(meta || {});
        }
        else if (status === 'error') say('❌ ' + ((meta && meta.msg) || '连接失败'), '#ff6b6b');
        else { GlobalStore.set('netRole', null); say(''); }
    };
    const onData = (msg) => {
        if (msg && msg.t === 'start') say('房主已开战，正在同步画面…', '#4ade80');
        if (typeof onNetMsg === 'function') onNetMsg(msg);
    };
    net.initNetPvp(onState, onData);

    createBtn.addEventListener('click', () => {
        // 输入框留空 → 自动生成房间号；填了 → 用作自定义房间号
        net.createRoom(null, null, input ? input.value : '');
    });
    joinBtn.addEventListener('click', () => {
        const rid = input ? input.value.trim() : '';
        if (!rid) { say('请先填房间号', '#ff6b6b'); return; }
        net.joinRoom(rid, null, null);
    });
}

export function bindPauseButton(getState, setState, updateButtons) {
    document.getElementById('btnPause').addEventListener('click', function () {
        onAnyButtonClick();
        if (getState.gs() === 'RUNNING') {
            setState.gs('PAUSED');
            setState.isPaused(true);
            GlobalStore.set('bulletTimeActive', true);
            document.body.classList.add('paused-animations');
        } else if (getState.gs() === 'PAUSED') {
            setState.gs('RUNNING');
            setState.isPaused(false);
            GlobalStore.set('bulletTimeActive', false);
            document.body.classList.remove('paused-animations');
        }
        updateButtons();
    });
}

export function bindNextButton(setState, updateButtons, enableAllButtons, updateSpeedButtons) {
    document.getElementById('btnNext').addEventListener('click', function () {
        onAnyButtonClick();
        if (getState.gs() === 'GAMEOVER') {
            resetBattleRuntime();
            setState.adjustMode(true);
            setState.selectedAdjustPos(null);
            const snap = getState.snapshot();
            const ctx = getPlayerContext();
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
            // _renderAllLogs 全库从未定义，删除无效调用
        });
    });
}

export function bindDebugButton(setState, updateSpeedButtons, updateDebugUI, updateUI) {
    document.getElementById('debugToggle').addEventListener('click', function () {
        onAnyButtonClick();
        setState.debugMode(!getState.debugMode());
        const dm = getState.debugMode();
        this.classList.toggle('active', dm);
        this.textContent = 'V6.0';
        GlobalStore.set('debugMode', dm);
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
        const newMode = GlobalStore.get('crashMode') === 'fly' ? 'ghost' : 'fly';
        GlobalStore.set('crashMode', newMode);
        this.textContent = newMode === 'fly' ? '🕊️飞走' : '👻虚影';
    });
}

export function bindDodgeButton(toggleDodgeEffect) {
    document.getElementById('btnDodgeToggle').addEventListener('click', () => { toggleDodgeEffect(); });
}

export function bindSettleButton(currentStageGetter, isBattleStarting, getState, setState, updateBuffSlots, updateUI, updateButtons, enableAllButtons, updateSpeedButtons, updateScoreBadge, doInitBattle, abortAll, clearAllEffects, clearLogExceptFirst, setRenderStore, renderGrid) {
    document.getElementById('btnSettle').addEventListener('click', async function () {
        onAnyButtonClick();
        const gs = getState.gs();
        const S = { IDLE: 'IDLE', RUNNING: 'RUNNING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };
        if (gs === S.GAMEOVER) {
            resetBattleRuntime();
            let currentUI = { allyTeam: [], enemyTeam: [], currentResult: null, round: 0 };
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
        GlobalStore.set('fastForwardActive', true);
        setState.waitingForNextRound(false);
        let ffCtx = getPlayerContext();
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
            onAnyButtonClick();
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
            // 联网房主换关 → 重发阵容，从机跟着换关摆位
            const fnLineup = GlobalStore.getUIHandler('sendNetLineup');
            if (typeof fnLineup === 'function') fnLineup();
        }, false, false);
    });
}

export function bindVoteFloat() {
    document.getElementById('voteFloat').addEventListener('click', function () {
        const overlay = document.getElementById('voteModalOverlay');
        if (overlay) { overlay.style.display = 'flex'; this.style.display = 'none'; }
    });
}

// 站位交换权限：
//   单机           → 只有明教网格可调
//   本地双人 PVP   → 两队都可调（同屏排兵）
//   联网 PVP       → 各管一队：房主只明教、从机只六大派
export function bindGridClick(getState, setState, updateUI) {
    bindGrid(getState, setState, updateUI, 'allyGrid', CAMP_TYPES.ALLY);
    bindGrid(getState, setState, updateUI, 'enemyGrid', CAMP_TYPES.ENEMY);
}

function bindGrid(getState, setState, updateUI, gridId, camp) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.addEventListener('click', function (e) {
        if (!getState.adjustMode()) return;
        const netRole = GlobalStore.get('netRole');
        if (netRole === 'host' && camp === CAMP_TYPES.ENEMY) return;
        if (netRole === 'guest' && camp === CAMP_TYPES.ALLY) return;
        if (!netRole && camp === CAMP_TYPES.ENEMY && !GlobalStore.get('pvpMode')) return;
        const cell = e.target.closest('.cell');
        if (!cell) return;
        const pos = parseInt(cell.dataset.pos);
        if (isNaN(pos)) return;
        const currentUI = getState.UI();
        const team = camp === CAMP_TYPES.ENEMY ? currentUI.enemyTeam : currentUI.allyTeam;
        const unit = team.find(u => u.pos === pos);
        if (unit?.fixed) { cell.classList.add('cell-blocked'); setTimeout(() => cell.classList.remove('cell-blocked'), 500); return; }
        if (getState.selectedAdjustPos() === null) {
            setState.selectedAdjustPos(pos);
        } else {
            const targetUnit = team.find(u => u.pos === pos);
            if (targetUnit?.fixed) { cell.classList.add('cell-blocked'); setTimeout(() => cell.classList.remove('cell-blocked'), 500); setState.selectedAdjustPos(null); updateUI(); return; }
            const posA = getState.selectedAdjustPos();
            const posB = pos;
            const unitA = team.find(u => u.pos === posA);
            const unitB = team.find(u => u.pos === posB);
            if (unitA?.fixed || unitB?.fixed) return;
            // 张无忌 5 号位保护仅明教适用
            if (camp === CAMP_TYPES.ALLY) {
                const zhang = team.find(u => u.isZhang);
                if (zhang?.pos === 5) {
                    const tempMap = {};
                    team.forEach(u => { if (u.alive || u.state._isDead) tempMap[u.pos] = u; });
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