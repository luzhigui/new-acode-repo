// ui/68ui-controls.js — 按钮事件绑定层（倍速在 77、按钮状态/buff 槽在 78、日志工具在 64）
// V7.9.2 | 2026-10-20 | ~25000 bytes
// `export {...} from` 只转出、不产生本模块局部绑定：本文件要用的符号必须显式 import（否则 ReferenceError）。
//   顶部 re-export 保住 61/63/75/76 的 import 点不变。
export const VER = 'ui/68ui-controls.js V7.9.2';

// 打断 63↔68 循环依赖：getState/setState 直接取自 infra/54（63 只做转发）
import { getState, setState, GlobalStore, getPlayerContext } from '../infra/54-global-store.js';
import { resetBattleTransientState } from '../core/17-state-keys.js';
import { updateUI, renderGrid, setRenderStore } from './62ui-render-5v5-test.js';
import { clearAllEffects } from '../player/42player-core.js';
import { resetBattleRuntime } from './74reset-runtime.js';
import { CAMP_TYPES } from '../infra/56-battle-enums.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { onAnyButtonClick, restoreSpeedFromScroll } from './77speed-controls.js';

// 77/78 拆出后的 re-export：61/63/75/76 的 import 点全部保持不变
export { updateSpeedButtons, setSpeed, activateScrollSlowdown, restoreSpeedFromScroll, initSpeedButtons } from './77speed-controls.js';
export { updateButtons, updateAutoModeButton, enableAllButtons, updateDebugUI, updateBuffSlots } from './78button-state.js';

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

    const say = (txt, color) => { line.textContent = txt; line.style.color = color || 'var(--c-tan)'; };
    const badge = document.getElementById('netRoomBadge');
    // 标题栏房间号角标：对局中封面是盖住的，房间号只能靠这里报给对手 / 掉线后照着重连
    // 联网对局时角标顶掉最左的「光明顶对战 5v5」标题（.header.net-mode），房间号就是左上角唯一标识
    const setBadge = (rid, warn) => {
        const header = document.querySelector('.header');
        if (header) header.classList.toggle('net-mode', !!rid);
        if (!badge) return;
        badge.textContent = rid ? (warn ? '⚠️ 掉线 ' : '🚪 ') + rid : '';
        badge.style.display = rid ? 'inline-block' : 'none';
        badge.classList.toggle('warn', !!warn);
    };
    // 连接状态一变，主按钮的含义就变了（等对手/开战/返回封面），必须跟着刷新
    const refresh = () => { const fn = GlobalStore.getUIHandler('updateButtons'); if (fn) fn(); };
    const onState = (status, meta) => {
        if (status === 'creating') say('正在建房…');
        else if (status === 'waiting') { say('房间已建好，把房间号发给对手：' + meta.roomId, 'var(--c-gold-bright)'); if (input) input.value = meta.roomId; setBadge(meta.roomId); }
        else if (status === 'joining') say('正在连接房主…');
        else if (status === 'connected') {
            // netRole 是全局对局身份：网格可点权限、buff 槽阵营都读它
            GlobalStore.set('netRole', meta && meta.isHost ? 'host' : 'guest');
            say('✅ 已连接对手' + (meta && meta.isHost ? '（你是房主）' : '（你是加入方）'), '#4ade80');
            setBadge(meta && meta.roomId);
            if (typeof onConnected === 'function') onConnected(meta || {});
        }
        else if (status === 'error') say('❌ ' + ((meta && meta.msg) || '连接失败'), '#ff6b6b');
        else {
            // 掉线（onPeerLost）：房间号必须留着——从机就是靠它回封面重新「加入」重连。
            // 先取房间号再回封面，因为 goBackToCover 会 closeNetPvp 把房间号清掉。
            const rid = net.currentRoomId() || (input ? input.value.trim() : '');
            const wasGuest = GlobalStore.get('netRole') === 'guest';
            GlobalStore.set('netRole', null);
            GlobalStore.set('netPeerReady', false);
            GlobalStore.set('netGuestDone', false);
            setBadge(rid, true);
            if (wasGuest) {
                // 从机：回封面并把房间号预填好，点一下「加入」就能重连。
                // 房主那边房间还挂着（MQTT 客户端没断），收到 join 会重新下发阵容，从机照旧进摆位态。
                if (input && rid) input.value = rid;
                const fnBack = GlobalStore.getUIHandler('goBackToCover');
                if (typeof fnBack === 'function') fnBack();
                say('⚠️ 与房主断开，房间号已填好，点「加入」重连', '#ff6b6b');
            } else {
                // 房主：同样回封面收口（否则 netRole 已清空，按钮会按"从机"分支走：
                // GAMEOVER 主按钮变「返回封面」、摆位态主按钮变「▶ 开战」还能一个人开打）。
                // 但连接要留着——房间没散，对手重新「加入」时 onGuestJoin 会把房主拉回摆位态
                const fnHost = GlobalStore.getUIHandler('hostWaitReconnect');
                if (typeof fnHost === 'function') fnHost();
                say(rid ? '⚠️ 与对手断开，房间号 ' + rid + ' 保留着，等对手重新加入' : '⚠️ 与对手断开', '#ff6b6b');
            }
        }
        refresh();
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
        } else if (getState.gs() === 'PAUSED') {
            setState.gs('RUNNING');
        }
        // 走统一的裁判逻辑
        const fnSync = GlobalStore.getUIHandler('syncPauseState');
        if (typeof fnSync === 'function') fnSync();
        else updateButtons();
    });
}

export function bindNextButton(setState, updateButtons, enableAllButtons, updateSpeedButtons) {
    document.getElementById('btnNext').addEventListener('click', function () {
        onAnyButtonClick();
        if (getState.gs() === 'GAMEOVER') {
            // 联网 GAMEOVER 下 btnNext 被复用为「返回封面」（原班再战只对单机有意义）
            if (GlobalStore.get('pvpMode')) {
                const fnBack = GlobalStore.getUIHandler('goBackToCover');
                if (typeof fnBack === 'function') fnBack();
                return;
            }
            resetBattleRuntime();
            setState.adjustMode(true);
            setState.selectedAdjustPos(null);
            const snap = getState.snapshot();
            const ctx = getPlayerContext();
            // 原班再战：恢复初始阵容（含全部单位、满血、初始属性），拒马不包含在内
            if (ctx && ctx._originalSnapshot) {
                // 跨局状态清洗（根因修复）：_originalSnapshot 克隆自「选完海克斯后的开战快照」
                //   （ui/61 L320 把 UI 队写进快照是当局合法路径），妹的 _permanentBuffs 等整场字段会被一并存档；
                //   不洗的话上局的巨马阵带进新局 → 第1回合蛛变就召拒马（老板 10-21 实锤）。恢复后统一
                //   resetBattleTransientState：保留基础数值/落位锚，局内累计（永久海克斯/回春层/精通/计数）全归零
                snap.ally = ctx._originalSnapshot.ally.map(u => resetBattleTransientState(u.clone()));
                snap.enemy = ctx._originalSnapshot.enemy.map(u => resetBattleTransientState(u.clone()));
                const currentUI = getState.UI();
                currentUI.allyTeam = snap.ally.map(u => u.clone());
                currentUI.enemyTeam = snap.enemy.map(u => u.clone());
                setState.UI(currentUI);
            }
            // 原班的只是阵容，战斗随机序列必须全新：snap 复用上局对象、带着旧 _rngSeed，
            //   不换的话 player/42 开战按旧种子重建 RNG，配合跨回合保 _rng 会从头到尾重演上一局。
            snap._rngSeed = Date.now();
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
            // 补同步高亮：原先只改文字不改 class，战斗中切「简要」按钮还是亮的（要开新一局才被 ui/61
            //   重新同步）。判据与 ui/61:878、体检 122health-utils:459 一致——「不是简要就亮」（详细/调试都亮）。
            this.classList.toggle('active', choice !== 'brief');
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
            // 随机重开=全新一局：freshSeed 丢弃上局种子走时间随机；新空 snap 本就无种子，传参仅为表意一致
            doInitBattle(stage, currentUI, snap, [], -1, null, true);
            setState.UI(currentUI);
            setState.snapshot(snap);
            // 状态复位（此前漏调，gs 停 GAMEOVER 致主按钮仍是「下一关」）：与原班再战分支同构，落地进摆位态
            setState.adjustMode(true);
            setState.selectedAdjustPos(null);
            setState.isPaused(false);
            setState.gs('IDLE');
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
        }
        if (gs === S.PAUSED) {
            setState.gs(S.RUNNING);
            setState.isPaused(false);
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
        // 扩到 7：第七关是灭绝师太关；2026-10-02 循环已全量放出第1-7关
        for (let i = 1; i <= 7; i++) { buttons.push({ text: i === currentStage ? `第${i}关 ◀` : `第${i}关`, value: i, cls: 'buff' }); }
        // 虚影/飞走并入选关弹窗（原头部按钮撤掉，低频功能收进角落）：值固定 crash-mode，选中即切换并关弹窗
        const crashMode = GlobalStore.get('crashMode') === 'fly' ? 'fly' : 'ghost';
        buttons.push({ text: crashMode === 'fly' ? '🕊️ 飞走模式 ✓' : '👻 虚影模式', value: 'crash-mode', cls: 'buff' });
        showModal('选择关卡', buttons, (choice) => {
            if (choice === 'crash-mode') {
                // 只切模式不换关：切完就地再开一次弹窗，省得用户重按
                const newMode = crashMode === 'fly' ? 'ghost' : 'fly';
                GlobalStore.set('crashMode', newMode);
                document.getElementById('btnStageSelect').click();
                return;
            }
            const stage = choice;
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
            doInitBattle(stage, getState.UI(), getState.snapshot(), getState.activeBuffs(), -1, null, true);
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
            // 联网摆位实时同步：交换成功就把本阵营站位发给对面。
            // 不发的话房主挪明教从机看不到（要等开战第一条 step 才跳正），从机「准备」后再挪人房主手里还是旧站位
            const fnSync = GlobalStore.getUIHandler('syncNetPositions');
            if (typeof fnSync === 'function') fnSync(camp);
        }
        updateUI();
    });
}

// 导出：bind* 全部为 export（顶部直接导出）；77/78 的符号经顶部 re-export 转出
