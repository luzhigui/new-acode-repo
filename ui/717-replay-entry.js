// ui/717-replay-entry.js — 战报回放入口（从 61main 拆出）
// V1.1.1 | 2026-11-10 下线存档：新手引导（原 ui/712-tutorial.js）搬 archive/，本文件 stepBattleStart 改为
//           就地空实现（调用点未动）。恢复见 archive/README.md「二」。
export const VER = 'ui/717-replay-entry.js V1.1.1';
import { GlobalStore, getPlayerContext } from '../infra/104-global-store.js';
import { getState, setState } from './704-main-state.js';
import { renderGrid, updateUI, setRenderStore, clearLogExceptFirst } from './703-ui-render-5v5-test.js';
import { clearAllEffects } from '../player/507-battle-player-5v5-test.js';
import { updateButtons, updateSpeedButtons } from './709-ui-controls.js';
import { CAMP_TYPES } from '../infra/106-battle-enums.js';
import { STATE as S } from '../core/201-config-5v5-test.js';
import { SeededRNG } from '../infra/102-core-utils.js';
import { setBattleRng } from '../core/214-battle-shared.js';
import { createStore, battleReducer } from '../modules/306-battle-store.js';
import { setGridStore } from '../render/403-grid-render.js';
import { AudioManager } from '../modules/304-audio-manager.js';
import { playBattleReplay } from '../player/503-player-core.js';
import { rehydrateReport, migrateReport, CURRENT_REPORT_VERSION } from '../player/513-battle-export.js';
// 2026-11-10 下线存档：新手引导已搬 archive/712-tutorial.js（恢复见 archive/README.md）；空实现保调用点不动
const stepBattleStart = () => {};
import { clonePlainUnit, setGuestStageLabel } from './716-net-session.js';
// 会话初始化公共件（与 ui/75net-session 共用）：重建 store + 收尾渲染各一行
import { rebuildSessionStore, finalizeSessionRender } from './714-session-common.js';

// 61 注入的闭包变量写点（enterReplay 用）：
//   markGameStarted()：gameStarted = true; coverRef.val = true
//   resetBattleFlags()：isBattleStarting = false; hasLoggedTeam = false
let _ctx = { markGameStarted: () => {}, resetBattleFlags: () => {} };

export function installReplayEntry(ctx) {
    _ctx = {
        markGameStarted: (ctx && ctx.markGameStarted) || (() => {}),
        resetBattleFlags: (ctx && ctx.resetBattleFlags) || (() => {})
    };
}

// 挂 UIHandler 通道：ui/64 的「📂 播放战报文件」按钮经 GlobalStore 取本函数，而不是 import 本文件。
//   原因：64 已被 63 import（showBattleReport），而本文件与 75 都要 import 63 取 getState/setState——
//   64 一旦 import 本文件就形成 63→64→76→63 的环。走通道后 64 不 import 本文件，ui 内部环归零。
//   （函数声明会提升，此处注册即可直接引用。）
GlobalStore.setUIHandler('startReplayFromFile', startReplayFromFile);

// 回放入口：选战报文件 → 校验 → 进回放（与联机从机同构，数据源是文件里的 steps）
export async function startReplayFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        let report;
        try {
            report = JSON.parse(await file.text());
        } catch (e) {
            alert('❌ 战报文件读取失败：' + (e && e.message ? e.message : e));
            return;
        }
        if (!report || report.format !== 'ming-battle-replay' || !Array.isArray(report.steps) || report.steps.length === 0) {
            alert('❌ 不是有效的战报文件（需含 format:"ming-battle-replay" 和 steps）');
            return;
        }
        // 版本看章：老文件（含没盖 version 章的 v1.0）顺搬家链升上来照放；
        // 比游戏新的文件拒收——硬读会放到一半炸，不如一句人话。
        const fileVer = report.version || 1;
        if (fileVer > CURRENT_REPORT_VERSION) {
            alert(`❌ 这份战报是更新版本的游戏录的（文件 v${fileVer}，当前游戏支持到 v${CURRENT_REPORT_VERSION}），先升级游戏再放`);
            return;
        }
        enterReplay(rehydrateReport(migrateReport(report)));   // 先搬家（格式年代）再还原（增量→全量）；v1.1 增量文件在此还原成全量（v1.0 全量文件原样通过）
    };
    input.click();
}

function enterReplay(report) {
    // 打断可能还在跑的旧战斗循环（与 applyNetLineup 同款）
    const curCtx = getPlayerContext();
    if (curCtx && curCtx.abortController && !curCtx.abortController.signal.aborted) curCtx.abortController.abort();
    GlobalStore.set('fastForwardActive', false);
    GlobalStore.set('pvpMode', false);

    // 首步 = 回合开始态：UI 队伍 / 开局快照 / store 都从这里长出来（与从机 applyNetLineup 同款重建）
    const first = report.steps[0];
    const UI = getState.UI();
    UI.allyTeam = (first.ally || []).map(clonePlainUnit);
    UI.enemyTeam = (first.enemy || []).map(clonePlainUnit);
    UI.currentResult = null; UI.round = 0;
    const snap = getState.snapshot();
    snap.ally = (first.ally || []).map(clonePlainUnit);
    snap.enemy = (first.enemy || []).map(clonePlainUnit);
    setState.UI(UI); setState.snapshot(snap);

    const c = getPlayerContext();
    if (c) c.snapshot = snap;

    rebuildSessionStore({ allyTeam: UI.allyTeam, enemyTeam: UI.enemyTeam });

    setState.autoLevel('auto'); setState.autoMode(true);
    setState.gs(S.RUNNING); setState.isPaused(false);
    setState.adjustMode(false); setState.selectedAdjustPos(null);
    setState.activeBuffs([]);
    _ctx.markGameStarted();
    _ctx.resetBattleFlags();
    // 回放不跑引擎：本地 RNG 只保证演出层不崩
    setBattleRng(new SeededRNG(Date.now() % 1000000));
    stepBattleStart();
    const overlay = document.getElementById('coverOverlay');
    if (overlay) overlay.style.display = 'none';
    finalizeSessionRender();
    if (report.meta && report.meta.stage) setGuestStageLabel(report.meta.stage);

    playBattleReplay(report).catch(e => console.error('回放异常', e));
}
