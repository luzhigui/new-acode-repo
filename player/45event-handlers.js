// player/45event-handlers.js - 光明顶5v5 事件处理器函数族
// V5.7.2 | ~25600 bytes| 2026-08-26 特效单轨收尾：handleInfo/handleBuffReboundFortify 残留特效全移交导演 stageAction，本文件纯文本
export const VER = 'player/45event-handlers.js V5.7.2';

import { isBlocked } from '../core/03battle-utils.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { GlobalStore, getState } from '../infra/54-global-store.js';
import { appendLogHTML, appendLogElement, autoScrollLog, updateRoundDisplay, renderSeparator, playLogLine, appendHiddenDetail } from './47renderer.js';

export async function handleBuffText(c, entry, delayMs = 0) {
    // buff-bonus/swap/push/rebound-fortify 四个入口同构：特效已由导演 stageAction 统一触发，此处只播文本
    appendLogHTML(entry.text + '<br>');
    if (delayMs > 0) {
        await new Promise(r=>setTimeout(r, GlobalStore.get('fastForwardActive') ? 1 : delayMs));
    }
}

export async function handleInfo(c, entry) {
    if (entry.fastEntry) {
        appendLogHTML(entry.text + '<br>');
        updateRoundDisplay(`📜 日志（第${c.UI.round}回合）`);
        return;
    }

    // 蝴蝶附身/飞回、蜘蛛升空/降落动画已由导演 stageAction 'flyMode' 统一触发
    // 连击横幅/新婚爱心/白骨爪/死亡画笔/乾坤加攻飘字/张无忌台词弹幕等特效已全部移交导演 stageAction（见 31/42），此处只播文本

    if(entry.isZhangSwitch&&entry.unit){
        renderSeparator();
        await playLogLine(entry.text);
    }
    else {
        await playLogLine(entry.text);
    }
    updateRoundDisplay(`📜 日志（第${c.UI.round}回合）`);
}

export async function handleRoundStart(c, entry, isFirstAttackRef) {
    c.UI.round = parseInt(entry.text.match(/\d+/)[0])||1;
    if (isFirstAttackRef) isFirstAttackRef.value = true;
    appendLogHTML(entry.text + '<br>');
    updateRoundDisplay(`📜 日志（第${c.UI.round}回合）`);
    await new Promise(r=>setTimeout(r, GlobalStore.get('fastForwardActive') ? 1 : c.speed/3));
}

export async function handleRoundEnd(c, entry, log, i) {
    appendLogHTML(entry.text + '<br>');
    updateRoundDisplay(`📜 日志（第${c.UI.round}回合）`);
    if (c.updateBuffSlots) { c.updateBuffSlots(); }
    if (window._refreshGlowCells) window._refreshGlowCells();
    await new Promise(r=>setTimeout(r,c.speed/3));
}

export function shouldStartNewGroup(entry, lastType) {
    if (!lastType) return false;
    if (entry.needsSeparator) return true;
    return false;
}