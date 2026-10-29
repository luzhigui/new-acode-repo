export const VER = 'player/45event-handlers.js V6.1.0';

import { isBlocked } from '../core/03battle-utils.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { GlobalStore, getState } from '../infra/54-global-store.js';
import { appendLogHTML, appendLogElement, autoScrollLog, updateRoundDisplay, renderSeparator, playLogLine, appendHiddenDetail } from './47renderer.js';
import { readRound } from './42player-core.js';
import { clock } from '../infra/52-clock.js';
import { STORE_ACTION_TYPES } from '../infra/56-battle-enums.js';

// 收口（外部AI清单#15）：currentRound 与 42.readRound 逐字等价，删本地版改引单源

export async function handleBuffText(c, entry, delayMs = 0) {
    // 特效已由 stageAction 触发，此处只播文本
    appendLogHTML(entry.text + '<br>');
    if (delayMs > 0) {
        await clock.wait(delayMs);
    }
}

export async function handleInfo(c, entry) {
    if (entry.fastEntry) {
        appendLogHTML(entry.text + '<br>');
        updateRoundDisplay(`📜 日志（第${readRound(c)}回合）`);
        return;
    }

    // 飞行/附身动画已由 stageAction 触发
    // 连击横幅/新婚爱心/白骨爪/死亡画笔/乾坤加攻飘字/张无忌台词弹幕等特效已全部移交导演 stageAction（见 31/42），此处只播文本
    const fxSpecs = entry._fxSpecs || null;

    if(entry.isZhangSwitch&&entry.unitUid){
        renderSeparator();
        await playLogLine(entry.text, null, fxSpecs);
    }
    else {
        await playLogLine(entry.text, null, fxSpecs);
    }
    updateRoundDisplay(`📜 日志（第${readRound(c)}回合）`);
}

export async function handleRoundStart(c, entry, isFirstAttackRef) {
    // 回合数唯一账本 battleStore（原 c.UI.round 冗余副本已删）
    const _r = parseInt(entry.text.match(/\d+/)[0]) || 1;
    if (c.store) c.store.dispatch({ type: STORE_ACTION_TYPES.SET_ROUND, round: _r });
    if (isFirstAttackRef) isFirstAttackRef.value = true;
    appendLogHTML(entry.text + '<br>');
    updateRoundDisplay(`📜 日志（第${readRound(c)}回合）`);
    await clock.wait(200);
}

export async function handleRoundEnd(c, entry, log, i) {
    appendLogHTML(entry.text + '<br>');
    updateRoundDisplay(`📜 日志（第${readRound(c)}回合）`);
    if (c.updateBuffSlots) { c.updateBuffSlots(); }
    if (window._refreshGlowCells) window._refreshGlowCells();
    await clock.wait(200);
}

export function shouldStartNewGroup(entry, lastType) {
    if (!lastType) return false;
    // 回合开始后紧跟的攻击组不画分隔符：没有系统消息（buff 摘要/蛛变/召唤）垫场时，
    //   「第N回合开始」下一行直接是攻击组，中间再插一条「- - - - -」读起来多余。
    //   有系统消息时 lastType 是它们的类型（info/buff-summary…），此处不拦，分隔符照常画——
    //   系统消息行与攻击组之间仍需要分隔。
    if (lastType === 'round-start') return false;
    if (entry.needsSeparator) return true;
    return false;
}