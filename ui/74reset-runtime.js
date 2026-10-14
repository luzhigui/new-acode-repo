// V7.5.13 | ~4040 bytes | 2026-10-14 重开补清阵亡摘格 timer：player/42 setupDeathTimers 的 3 秒 timer 挂在
//   playerContext 上，不清则跨局存活——store 已清时到点触发即空指针（player/42:148 Cannot read
//   properties of null (reading 'getState')），且可能误摘新一局同 uid 的活格（player/42 timer 入口守卫同源）
// V7.5.12 | ~3308 bytes | 2026-10-08 改号 69→74（同号双文件：69-role-cards 占 69），逻辑零改动
export const VER = 'ui/74reset-runtime.js V7.5.13';

import { GlobalStore } from '../infra/54-global-store.js';
import { setRenderStore } from './62ui-render-5v5-test.js';
import { clearEliteDodgeRules } from '../core/12battle-attack-steps.js';
import { flushBattleEvents } from '../infra/51-core-utils.js';
// 弹幕池重置函数：与删除 DOM 配合，防止对象池持有游离元素
import { resetDanmakuPool } from '../fx/80fx-common-5v5-test.js';
import { clearAllView } from '../infra/61-view-sheet.js';

function removeIfExists(id) {
    const el = document.getElementById(id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
}

// 统一战斗重置：清理运行时状态、DOM 残留、视觉标记
export function resetBattleRuntime({ restoreSpeed = true } = {}) {
    // 1. 清 Store 和渲染引用
    GlobalStore.set('battleStore', null);
    setRenderStore(null);
    // 2026-10-14 阵亡摘格 timer 清理（store 清空之后做，见文件头）：3 秒后自执行的游离任务不跨局
    const ctx = GlobalStore.get('playerContext');
    if (ctx && ctx._deathTimers) {
        for (const uid of Object.keys(ctx._deathTimers)) { clearTimeout(ctx._deathTimers[uid]); delete ctx._deathTimers[uid]; }
    }

    // 2. 清闪避规则与事件缓冲
    clearEliteDodgeRules();
    flushBattleEvents();

    // 3. 清全局标记
    GlobalStore.set('battleHistory', null);
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
    // 弹幕重置：调用池重置函数（内部会移除 DOM 并重建池），
    //   不能只删 DOM——对象池仍持引用会导致后续弹幕全部失效
    resetDanmakuPool();
    clearAllView();
    document.querySelectorAll('[data-fx="temporary"]').forEach(el => { if (el.parentNode) el.parentNode.removeChild(el); });
    document.querySelectorAll('.cell-cheer').forEach(cell => cell.classList.remove('cell-cheer'));
    document.querySelectorAll('.grid.victory-border').forEach(grid => grid.classList.remove('victory-border'));

    // 5. 清单位视觉标记与休息计时
    const UI = GlobalStore.get('UI');
    if (UI && UI.allyTeam && UI.enemyTeam) {
        [...UI.allyTeam, ...UI.enemyTeam].forEach(u => {
            u.state._acted = false;
            u.state._resting = false;
            u.state._blocked = false;
            u.state._isDead = false;
            u.alive = true;
            u.hp = u.maxHp;
            u.state._stunned = false;
        });
    }

    // 6. 恢复倍速
    if (restoreSpeed) {
        const fn = GlobalStore.getUIHandler('restoreSpeedFromScroll'); if (fn) fn();
    }
    // 重置 isBattleStarting 局部变量
    const fnReset = GlobalStore.getUIHandler('resetIsBattleStarting'); if (fnReset) fnReset();
}