// ui/714-session-common.js — 联网从机 / 战报回放共用的会话初始化件
// 背景：ui/75net-session 的 applyNetLineup 和 ui/76replay-entry 的 enterReplay 各抄了一份
//   「重建 battleStore + 收尾渲染」的骨架。改一处漏一处 = 「联网好了回放坏了」。
//   抽到这里，两边各调一行。
// 不抽的部分（差异太大，硬抽参数会爆炸）：
//   · abort 旧循环：75 要 abort + net.clearSteps()，76 只 abort
//   · 网络标志（netGuestReady / netGuestDone / pvpMode）：只 75 有
//   · 阶段/自动模式/gs 状态：75 是 IDLE + adjustMode(true)，76 是 RUNNING + adjustMode(false)
//   · 开播调用：75 由 'start' 消息触发 playBattleGuest，76 直接调 playBattleReplay
export const VER = 'ui/714-session-common.js V1.0.0';

import { GlobalStore } from '../infra/104-global-store.js';
import { renderGrid, updateUI, setRenderStore, clearLogExceptFirst } from './703-ui-render-5v5-test.js';
import { updateButtons, updateSpeedButtons } from './709-ui-controls.js';
import { clearAllEffects } from '../player/507-battle-player-5v5-test.js';
import { createStore, battleReducer } from '../modules/306-battle-store.js';
import { setGridStore } from '../render/403-grid-render.js';
import { CAMP_TYPES } from '../infra/106-battle-enums.js';

/**
 * 用一对队伍重建 battleStore，并接到渲染层。
 * 调用时机：75 / 76 把 UI.allyTeam / UI.enemyTeam 灌好之后、调收尾渲染之前。
 * 返回值：新建的 store（若调用方还需要继续 dispatch）。
 */
export function rebuildSessionStore({ allyTeam, enemyTeam }) {
    const seedUnits = [...(allyTeam || []), ...(enemyTeam || [])];
    const store = createStore({ units: seedUnits, round: 1 }, battleReducer);
    GlobalStore.set('battleStore', store);
    setGridStore(store);
    setRenderStore(store);
    return store;
}

/**
 * 会话初始化收尾：清日志、清特效、重画两网格、刷新按钮。
 * 调用时机：store 重建 + 状态位设好之后、开播之前。
 */
export function finalizeSessionRender() {
    clearLogExceptFirst();
    clearAllEffects();
    updateUI();
    renderGrid('allyGrid', CAMP_TYPES.ALLY);
    renderGrid('enemyGrid', CAMP_TYPES.ENEMY);
    updateButtons();
    updateSpeedButtons();
}