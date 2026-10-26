// V6.4.0 | 2026-10-26 | 去锚定化：不再按文字位置匹配锚点，特效回调改为整行开始即统一触发（fx 数据驱动）；
//   删掉 pending / playedPlainLen / charMsAnchor，逐字统一读 charMs
// V6.3.0 | 2026-10-25 | ~3900 bytes | 锚点行读 charMsAnchor、普通行读 charMs；逐字等待改 clock.waitReal（真实毫秒）
export const VER = 'player/40player-text.js V6.4.0';

import { GlobalStore } from '../infra/54-global-store.js';
import { clock } from '../infra/52-clock.js';
import { getPerfParam } from '../core/23perf-params.js';

let ctx = null;
function getCtx() {
    if (!ctx) ctx = GlobalStore.get('playerContext');
    return ctx;
}

export function setPlayerContext(c) { ctx = c; }

// 立即触发本行全部特效回调（整行开始统一触发；飘字函数内部自行判断快进跳过）
function fireAllFx(fxSpecs) {
    if (!fxSpecs || fxSpecs.length === 0) return;
    for (const spec of fxSpecs) {
        if (spec && spec.cb) { try { spec.cb(); } catch (e) { console.error('[playLineText] fx 回调出错:', e); } }
    }
}

// 逐字播放 HTML 文本；分隔符/快进直接显示完整文本
export async function playLineText(text, div, forcedSpeed = null, fxSpecs = null) {
    // 分隔符/系统信息直接显示
    if (text.includes('separator') || text.includes('class="purple small"') || text.includes('class="blue small"') || text.includes('class="red small"') || text.includes('class="gray small"') || text.includes('class="gold small"') || text.includes('class="green small"')) {
        div.innerHTML = text + '<br>';
        fireAllFx(fxSpecs);
        return;
    }
    // 快进直接显示全文
    if (GlobalStore.get('fastForwardActive')) {
        div.innerHTML = text + '<br>';
        fireAllFx(fxSpecs);
        return;
    }
    const c = getCtx();
    let plain = text.replace(/<[^>]+>/g, '');
    let htmlIdx = 0, fullHtml = '';
    // 特效改为「整行开始时统一触发」，不再靠文字位置匹配：
    //   锚点靠 plain.indexOf 找文案，文案一改就静默失效；改成由数据里的 fx 字段驱动。
    fireAllFx(fxSpecs);
    // baseDuration 是 1x 基准毫秒：整行打完的总时长；倍速由 clock 统一缩放
    const baseDuration = forcedSpeed !== null ? forcedSpeed : 250;
    // 每字时长：参数表优先（charMs），取不到回落到旧逻辑（行基准 / 字数，8ms 下限）
    const speedKey = (c && c.speed) || 300;
    const charMsParam = getPerfParam('charMs', speedKey);

    while (htmlIdx < text.length) {
        if (c.abortController && c.abortController.signal.aborted) return;
        // 参数表配了就用它（每字多少 ms，与倍速绑定，不看行总时长）；
        //   未配置（charMs<=0）时回落旧逻辑：行基准 / 字数，8ms 下限
        let charDelay;
        if (charMsParam > 0) {
            charDelay = charMsParam;
        } else {
            charDelay = baseDuration / Math.max(1, plain.length);
            if (charDelay < 8) charDelay = 8;
        }
        if (text[htmlIdx] === '<') {
            let tag = '';
            while (text[htmlIdx] !== '>') { tag += text[htmlIdx]; htmlIdx++; }
            tag += '>';
            fullHtml += tag;
            htmlIdx++;
        } else {
            fullHtml += text[htmlIdx];
            htmlIdx++;
            await clock.waitReal(charDelay);
        }
        div.innerHTML = fullHtml + '<br>';
        c.autoScrollLog();
    }
}
