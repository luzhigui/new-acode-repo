// ui/75net-session.js — 联网对战会话（从 61main 拆出，2026-10-10 ui/61 减负批）
// V1.0.0 | 内容逐字照搬 61：clonePlainUnit/setGuestStageLabel/applyNetLineup/clearNetBadge/exitNetIdentity/
//   syncNetPositions/applyPosUpdate/sendNetLineup/hostEnterAdjust + 消息分发（onNetMessage/onNetAccept）。
//   61 的模块级闭包变量（gameStarted/coverRef/currentDoubleStrikeUid/isBattleStarting/hasLoggedTeam）
//   通过 installNetSession(ctx) 注入：applyNetLineup/hostEnterAdjust 定义在 install 闭包内，
//   标志位写点经 ctx 回调走（纯写无读点，时序等价）——搬家不改行为，61 那边照旧读得到。
import { GlobalStore, getPlayerContext } from '../infra/54-global-store.js';
import { getState, setState } from './63main-state.js';
import { renderGrid, updateUI, setRenderStore, clearLogExceptFirst } from './62ui-render-5v5-test.js';
import { clearAllEffects } from '../player/44battle-player-5v5-test.js';
import { updateButtons, updateSpeedButtons } from './68ui-controls.js';
import { CAMP_TYPES } from '../infra/56-battle-enums.js';
import { STATE as S } from '../core/01config-5v5-test.js';
import * as net from '../infra/60-net-pvp.js';
import { SeededRNG } from '../infra/51-core-utils.js';
import { setBattleRng } from '../core/13battle-shared.js';
import { createStore, battleReducer } from '../modules/24battle-store.js';
import { setGridStore } from '../render/32-grid-render.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { playBattleGuest } from '../player/42player-core.js';
import { stepBattleStart } from './71tutorial.js';

export const VER = 'ui/75net-session.js V1.0.0';

// 纯数据化单位（与 76replay-entry 共用）：从机/回放的 steps 里恢复出的 plain object 再浅拷一份，断引用
// ---- 联网对战阶段3：阵容 / 站位 / 海克斯双向 ----
// 从机收到的单位是普通对象（infra/60 reviveUnit 的产物，没有 Unit 方法），浅拷贝 + 单拷 state 即可
// 2026-10-08 V7.5.20 跨局泄漏修复（老板 22:04 报「妹哪来的巨马」）：回放/联机灌入的单位浅拷时
//   **洗掉妹的永久海克斯清单**（_permanentBuffs）——这清单是「本局内不过期」语义，跨局残留=上局记忆
//   泄漏进新局（回放把旧单位灌回现场且不清场，妹带着上局永久巨马阵，新局 R1 就出马）。
//   本局选的海克斯照常走 handleBuffSelection/addPermanentBuff 写入，不受影响；只杀跨局残留。
//   引擎消费点（modules/27 妹组件马生成、core/12 流云身法）读不到旧条目即恢复默认行为。
export function clonePlainUnit(u) {
    const state = { ...(u.state || {}) };
    if (u.isXiaoZhaoBrother && Array.isArray(state._permanentBuffs)) delete state._permanentBuffs;
    return { ...u, state };
}

// 从机不跑 doInitBattle，labelEnemy 的关卡文案没有别的地方会写（房主侧由 ui/65 写），统一走这里
export function setGuestStageLabel(stage) {
    const n = stage || 1;
    const labelEnemy = document.getElementById('labelEnemy');
    if (labelEnemy) labelEnemy.textContent = n === 1 ? '六大派\n第一关' : `六大派\n第${n}关`;
}

// 标题栏房间号角标由 68 的 setBadge 写（联网时它顶掉左侧标题），退出联网要在这里擦掉、把标题让回来
// export：61 的 goBackToCover（返回封面）直接调
export function clearNetBadge() {
    const header = document.querySelector('.header');
    if (header) header.classList.remove('net-mode');
    const badge = document.getElementById('netRoomBadge');
    if (badge) { badge.style.display = 'none'; badge.textContent = ''; badge.classList.remove('warn'); }
}

// 从封面开单机 / 本地双人前必须摘掉联网身份：残留 netRole 会让网格限权、视角翻转错乱（render/32 读 netRole）。
// 从机「返回封面」是故意保留连接的（等房主发下一关），只有玩家真去开别的模式才在这里断。
// 无条件 closeNetPvp：房主掉线后回封面时连接是留着的（等对手重连），不拆干净的话对手一「加入」
// 会把已经开单机的房主又拽回对局里
export function exitNetIdentity() {
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
// export：61 的 btnNext 从机分支直接调（不走 UIHandler 的路径）
export function sendNetLineup() {
    if (GlobalStore.get('netRole') !== 'host') return;
    GlobalStore.set('netPeerReady', false);
    // 重发阵容 = 新一局：从机「本局播完」回执随之作废，房主「▶ 下一关」重新锁上
    GlobalStore.set('netGuestDone', false);
    const UI = getState.UI();
    net.sendLineup(getState.currentStage(), UI.allyTeam, UI.enemyTeam);
    updateButtons();
}

/**
 * 装配联网会话：挂 UIHandler（syncNetPositions/sendNetLineup）并返回 bindNetPvp 需要的两个回调。
 * ctx（61 注入，写它自己的闭包变量）：
 *   - resetBattleFlags()：清 currentDoubleStrikeUid/isBattleStarting/hasLoggedTeam
 *   - markGameStarted()：置 gameStarted=true + coverRef.val=true
 * applyNetLineup/hostEnterAdjust 的函数体与 61 原文逐字一致，仅三处标志位行经 ctx 回调。
 */
export function installNetSession(ctx) {
    const _resetFlags = ctx.resetBattleFlags || (() => {});
    const _markGameStarted = ctx.markGameStarted || (() => {});

    // 房主下发的阵容灌进从机：abort 旧循环 + UI/快照/store 全套重建 + 进摆位态
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
        // 格子画出来的永远是上一局 → 从机看着像「没收到数据」，
        // 与 playBattleGuest 同款重建：units 与 UI 队伍同引用，从机摆位改 pos 后渲染即刻生效；
        // 开战时 playBattleGuest 会再建一次，幂等无害。
        const seedUnits = [...UI.allyTeam, ...UI.enemyTeam];
        const newStore = createStore({ units: seedUnits, round: 1 }, battleReducer);
        GlobalStore.set('battleStore', newStore);
        setGridStore(newStore);
        setRenderStore(newStore);

        setState.currentStage(lineup.stage || 1);
        setGuestStageLabel(lineup.stage);
        GlobalStore.set('pvpMode', true);
        GlobalStore.set('netGuestReady', false);
        setState.autoLevel('auto'); setState.autoMode(true);
        setState.gs(S.IDLE); setState.isPaused(false);
        setState.adjustMode(true); setState.selectedAdjustPos(null);
        setState.activeBuffs([]);
        _resetFlags();
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
        setState.activeBuffs([]);
        _resetFlags();
        const overlay = document.getElementById('coverOverlay');
        if (overlay) overlay.style.display = 'none';
        _markGameStarted();
        if (typeof AudioManager.init === 'function') AudioManager.init();
        sendNetLineup();
        updateUI();
        renderGrid('allyGrid', CAMP_TYPES.ALLY);
        renderGrid('enemyGrid', CAMP_TYPES.ENEMY);
        updateButtons(); updateSpeedButtons();
    }

    GlobalStore.setUIHandler('syncNetPositions', syncNetPositions);
    GlobalStore.setUIHandler('sendNetLineup', sendNetLineup);

    const onNetMessage = (msg) => {
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
            _markGameStarted();
            // 关卡兜底：房主选关时已发过 lineup，但 start 是「必定到达」的那条，据此补正关卡与左侧标签
            if (msg.stage) { setState.currentStage(msg.stage); setGuestStageLabel(msg.stage); }
            GlobalStore.set('pvpMode', true);
            setState.autoLevel('auto'); setState.autoMode(true);
            setState.gs(S.RUNNING); setState.isPaused(false);
            setState.adjustMode(false); setState.selectedAdjustPos(null);
            clearLogExceptFirst(); clearAllEffects();
            updateButtons(); updateUI(); updateSpeedButtons();
            playBattleGuest().catch(e => console.error('从机战斗异常', e));
            return;
        }
    };

    // 连接成功：双方都进摆位态；房主额外下发阵容，且等对手回传后才能开战
    const onNetAccept = (meta) => {
        if (meta && meta.isHost) { hostEnterAdjust(); return; }
        // 2026-09-20 从机保险丝：身份（netRole=guest）刚落上就重画一遍，保证 guest-view 翻转即时生效。
        // 正常时序 accept 比 lineup 先到、applyNetLineup 渲染时身份已在（60 的 onGuestJoin 已调序）；
        // 这里兜的是消息乱序/重连等边角：哪怕阵容先到、先按房主视角画了，这一笔也会立刻翻正，
        // 不用等玩家点格子触发下一次 renderGrid 才突然换位。
        renderGrid('allyGrid', CAMP_TYPES.ALLY);
        renderGrid('enemyGrid', CAMP_TYPES.ENEMY);
    };

    return { exitNetIdentity, clearNetBadge, onNetMessage, onNetAccept };
}
