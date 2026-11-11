export const VER = 'ui/715-reset-runtime.js V7.5.15';

import { GlobalStore } from '../infra/104-global-store.js';
import { setRenderStore } from './703-ui-render-5v5-test.js';
import { clearEliteDodgeRules } from '../core/221-registry-dodge.js';
import { flushBattleEvents } from '../infra/102-core-utils.js';
// 弹幕池重置函数：与删除 DOM 配合，防止对象池持有游离元素
import { resetDanmakuPool, resetFloatTables } from '../fx/601-fx-common-5v5-test.js';
import { clearAllView } from '../infra/110-view-sheet.js';

function removeIfExists(id) {
    const el = document.getElementById(id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
}

// 统一战斗重置：清理运行时状态、DOM 残留、视觉标记
export function resetBattleRuntime({ restoreSpeed = true } = {}) {
    // 1. 清 Store 和渲染引用
    GlobalStore.set('battleStore', null);
    setRenderStore(null);
    // 阵亡摘格 timer 清理（store 清空之后做，见文件头）：3 秒后自执行的游离任务不跨局
    const ctx = GlobalStore.get('playerContext');
    if (ctx && ctx._deathTimers) {
        for (const uid of Object.keys(ctx._deathTimers)) { clearTimeout(ctx._deathTimers[uid]); delete ctx._deathTimers[uid]; }
    }

    // 2. 清闪避规则与事件缓冲
    clearEliteDodgeRules();
    flushBattleEvents();

    // 3. 清全局标记
    GlobalStore.set('battleHistory', null);
    GlobalStore.set('usedBuffKeys', []);
    GlobalStore.set('fastForwardActive', false);
    GlobalStore.set('bulletTimeActive', false);
    GlobalStore.set('scrollSlowdown', false);
    GlobalStore.set('skipBuffPopup', false);
    GlobalStore.set('waitingForNextRound', false);
    GlobalStore.set('isBattleStarting', false);
    GlobalStore.set('adjustMode', false);
    GlobalStore.set('selectedAdjustPos', null);
    GlobalStore.set('activeBuffs', []);
    // 妹永久账本（329 recordXiaoZhaoPermanentBuff 写、503 playBattle 读）必须每局清空，
    //   否则新局一开场妹就带着上局的永久海克斯
    GlobalStore.set('xiaoZhaoPermanentBuffs', []);
    GlobalStore.set('selectedBuffIndex', -1);
    GlobalStore.set('currentDoubleStrikeUid', null);
    // 79/93 联动标记：跨局防残留。从机/回放/简单模式下 79 不弹，标记必须干净；
    //   华丽模式下上一发 79 演完、93 被快进跳过时标记会残留 true，靠这里在新局开始前清掉。
    GlobalStore.set('hlsAimPlayedThisTurn', false);
    // 小昭姊/妹摆位切换的备份单位：跨局必须清，否则新局开局若抽到小昭，
    //   第一次切形态会取到上一局的旧单位（属性/职业全是上一局的）
    GlobalStore.set('xiaoZhaoBackup', null);
    // 众志成城九人满员彩蛋标记：跨局必须清，否则第二局再也弹不出来
    try { globalThis.__unityFullBannerShown = false; } catch (e) {}

    // 4. 清弹窗和浮动按钮
    ['battleReportOverlay', 'battleReportFloat', 'buffFloatBtn', 'voteModalOverlay'].forEach(removeIfExists);
    const voteFloat = document.getElementById('voteFloat');
    if (voteFloat) voteFloat.style.display = 'none';
    // 弹幕重置：调用池重置函数（内部会移除 DOM 并重建池），
    //   不能只删 DOM——对象池仍持引用会导致后续弹幕全部失效
    resetDanmakuPool();
    // 浮动飘字三张表（掉血叠层 / 回血叠层 / 四类飘字避让）按 uid 记账，跨局必须清
    resetFloatTables();
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