export const VER = 'player/45event-handlers.js V6.1.0';

import { isBlocked } from '../core/03battle-utils.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { GlobalStore, getState } from '../infra/54-global-store.js';
import { appendLogHTML, appendLogElement, autoScrollLog, updateRoundDisplay, renderSeparator, playLogLine, appendHiddenDetail } from './47renderer.js';
import { readRound } from './42player-core.js';
import { clock } from '../infra/52-clock.js';
import { getPerfParam } from '../core/23perf-params.js';
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

    const fxSpecs = entry._fxSpecs || null;

    if(entry.isZhangSwitch&&entry.unitUid){
        renderSeparator();
    }

    // 系统提示行：直接瞬间出整行文字，不逐字播放（解决字数多时过于拖沓的问题）
    appendLogHTML(entry.text + '<br>');
    
    // 手动触发可能挂载的特效
    if (fxSpecs) {
        for (const spec of fxSpecs) {
            if (spec && spec.cb) { try { spec.cb(); } catch (e) { console.error('[handleInfo] fx 回调出错:', e); } }
        }
    }
    
    // 瞬间出完之后，给一个极短的系统行间隔（比普通计算行还要快）
    const gap = getPerfParam('lineGapSys', GlobalStore.get('speed') || 300) || 20;
    await clock.waitReal(gap);

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