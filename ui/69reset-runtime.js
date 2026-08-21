// ui/69reset-runtime.js - 光明顶5v5 战斗重置清理统一入口
// V5.5.1 | ~2196 bytes| 2026-08-19 import 路径合并至 infra/51-core-utils
export const VER = 'ui/69reset-runtime.js V5.5.1';

import { GlobalStore } from '../infra/54-global-store.js';
import { setRenderStore } from './62ui-render-5v5-test.js';
import { clearEliteDodgeRules } from '../core/12battle-attack-steps.js';
import { flushBattleEvents } from '../infra/51-core-utils.js';

function removeIfExists(id) {
    const el = document.getElementById(id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
}

/**
 * 统一战斗重置：清除所有战场运行时状态、DOM 残留、视觉标记
 * 在切关、原班再战、随机重开、强停时调用
 */
export function resetBattleRuntime({ restoreSpeed = true } = {}) {
    // 1. 清 Store 和渲染引用
    GlobalStore.set('battleStore', null);
    setRenderStore(null);

    // 2. 清闪避规则与事件缓冲
    clearEliteDodgeRules();
    flushBattleEvents();

    // 3. 清全局标记
    GlobalStore.set('fastForwardActive', false);
    GlobalStore.set('bulletTimeActive', false);
    GlobalStore.set('scrollSlowdown', false);
    GlobalStore.set('skipBuffPopup', false);
    GlobalStore.set('waitingForNextRound', false);
    GlobalStore.set('isBattleStarting', false);
    GlobalStore.set('adjustMode', false);
    GlobalStore.set('selectedAdjustPos', null);
    GlobalStore.set('activeBuffs', []);
    GlobalStore.set('selectedBuffIndex', -1);
    GlobalStore.set('currentDoubleStrikeUid', null);

    // 4. 清弹窗和浮动按钮
    ['battleReportOverlay', 'battleReportFloat', 'buffFloatBtn', 'voteModalOverlay'].forEach(removeIfExists);
    const voteFloat = document.getElementById('voteFloat');
    if (voteFloat) voteFloat.style.display = 'none';
    document.querySelectorAll('.danmaku-bubble').forEach(el => { if (el.parentNode) el.parentNode.removeChild(el); });
    document.querySelectorAll('[data-fx="temporary"]').forEach(el => { if (el.parentNode) el.parentNode.removeChild(el); });
    document.querySelectorAll('.cell-cheer').forEach(cell => cell.classList.remove('cell-cheer'));
    document.querySelectorAll('.grid.victory-border').forEach(grid => grid.classList.remove('victory-border'));

    // 5. 清单位视觉标记与休息计时
    const UI = GlobalStore.get('UI');
    if (UI && UI.allyTeam && UI.enemyTeam) {
        [...UI.allyTeam, ...UI.enemyTeam].forEach(u => {
            u._flash = null;
            u.state._acted = false;
            u.state._resting = false;
            u.state._blocked = false;
            u.state._isDead = false;
            u.alive = true;
            u.hp = u.maxHp;
            u.state._stunned = false;
            if (u._restingTimer) {
                clearTimeout(u._restingTimer);
                u._restingTimer = null;
            }
        });
    }

    // 6. 恢复倍速
    if (restoreSpeed) {
        const fn = GlobalStore.getUIHandler('restoreSpeedFromScroll'); if (fn) fn();
    }
    // 重置 isBattleStarting 局部变量
    const fnReset = GlobalStore.getUIHandler('resetIsBattleStarting'); if (fnReset) fnReset();
}