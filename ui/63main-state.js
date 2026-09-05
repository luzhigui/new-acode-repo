// V5.5.0 | 2026-08-14 getPlayerContext 下沉至 infra/54
export const VER = 'ui/63main-state.js V5.5.0';

import { STATE } from '../core/01config-5v5-test.js';
import { GlobalStore } from '../infra/54-global-store.js';

import { updateUI, spawnVictoryEffects, setRenderStore } from './62ui-render-5v5-test.js';
import { tickBuffDurations as _tickBuffDurations } from './65main-battle.js';
import { updateBuffSlots, updateButtons, enableAllButtons, updateSpeedButtons, activateScrollSlowdown, restoreSpeedFromScroll } from './68ui-controls.js';
import { showBattleReport } from './64main-dialogs.js';
import { showBuffPopup } from './70buff-dialog.js';
import { AudioManager } from '../modules/22audio-manager.js';

const S = STATE;

// 模块级变量初始化到 GlobalStore
GlobalStore.set('gs', S.IDLE);
GlobalStore.set('autoMode', true);
GlobalStore.set('autoLevel', 'auto');
GlobalStore.set('debugMode', false);
GlobalStore.set('isPaused', false);
GlobalStore.set('speed', 500);
GlobalStore.set('userScrolled', false);
GlobalStore.set('abortController', null);
GlobalStore.set('waitingForNextRound', false);
GlobalStore.set('logLevel', 'detailed');
GlobalStore.set('battleResultForInfo', null);
GlobalStore.set('gameStarted', false);
GlobalStore.set('isBattleStarting', false);
GlobalStore.set('adjustMode', false);
GlobalStore.set('selectedAdjustPos', null);
GlobalStore.set('currentStage', 1);
GlobalStore.set('dodgeEffectEnabled', true);
GlobalStore.set('selectedBuffIndex', -1);
GlobalStore.set('currentDoubleStrikeUid', null);
GlobalStore.set('activeBuffs', []);
GlobalStore.set('snapshot', { ally: [], enemy: [] });
GlobalStore.set('UI', { allyTeam: [], enemyTeam: [], currentResult: null, round: 0, lastSnapshot: null });

// gs 已统一由 GlobalStore 管理，不再需要模块级变量和同步函数

// 状态读写已移至 infra/54
export { getState, setState } from '../infra/54-global-store.js';

// 玩家上下文已移至 infra/54
export { getPlayerContext } from '../infra/54-global-store.js';

// window 桥接注册：注册 UI 方法给 player 调用
// 供 getPlayerContext 通过 window 引用
GlobalStore.setUIHandler('updateUI', updateUI);
GlobalStore.setUIHandler('setRenderStore', setRenderStore);
GlobalStore.setUIHandler('spawnVictoryEffects', spawnVictoryEffects);
GlobalStore.setUIHandler('updateBuffSlots', (buffs, idx) => updateBuffSlots(buffs, idx));
GlobalStore.setUIHandler('tickBuffDurations', () => {
    const activeBuffs = GlobalStore.get('activeBuffs') || [];
    const result = _tickBuffDurations(activeBuffs, GlobalStore.get('selectedBuffIndex'), () => updateBuffSlots(GlobalStore.get('activeBuffs')));
    GlobalStore.set('activeBuffs', result.activeBuffs);
    GlobalStore.set('selectedBuffIndex', result.selectedBuffIndex);
    if (typeof GlobalStore.getUIHandler('updateBuffSlots') === 'function') GlobalStore.getUIHandler('updateBuffSlots')();
});
GlobalStore.setUIHandler('fadeBGMTo', (targetVol, durationMs) => { AudioManager.fadeTo(targetVol, durationMs); });
GlobalStore.setUIHandler('showBattleReport', showBattleReport);
GlobalStore.setUIHandler('showBuffPopup', showBuffPopup);
GlobalStore.setUIHandler('updateButtons', updateButtons);
GlobalStore.setUIHandler('enableAllButtons', enableAllButtons);
GlobalStore.setUIHandler('updateSpeedButtons', updateSpeedButtons);
GlobalStore.setUIHandler('activateScrollSlowdown', activateScrollSlowdown);
GlobalStore.setUIHandler('restoreSpeedFromScroll', restoreSpeedFromScroll);