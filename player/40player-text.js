// V6.3.0 | 2026-10-25 | ~3900 bytes | 锚点行读 charMsAnchor、普通行读 charMs；逐字等待改 clock.waitReal（真实毫秒，
//   不再被 timescale 二次缩放）
// V6.2.0 | 2026-09-24 | ~3800 bytes
export const VER = 'player/40player-text.js V6.3.0';

import { GlobalStore } from '../infra/54-global-store.js';
import { clock } from '../infra/52-clock.js';
import { getPerfParam } from '../core/23perf-params.js';

let ctx = null;
function getCtx() {
    if (!ctx) ctx = GlobalStore.get('playerContext');
    return ctx;
}

export function setPlayerContext(c) { ctx = c; }

// 逐字播放 HTML 文本；分隔符/快进直接显示完整文本
// 立即触发所有锚点（分隔符/快进时用，飘字函数内部自行判断快进跳过）
function fireAllAnchors(anchorSpecs) {
    if (!anchorSpecs || anchorSpecs.length === 0) return;
    for (const spec of anchorSpecs) {
        if (spec && spec.cb) { try { spec.cb(); } catch (e) { console.error('[playLineText] 锚点回调出错:', e); } }
    }
}

export async function playLineText(text, div, forcedSpeed = null, anchorSpecs = null) {
    // 分隔符/系统信息直接显示
    if (text.includes('separator') || text.includes('class="purple small"') || text.includes('class="blue small"') || text.includes('class="red small"') || text.includes('class="gray small"') || text.includes('class="gold small"') || text.includes('class="green small"')) {
        div.innerHTML = text + '<br>';
        fireAllAnchors(anchorSpecs);
        return;
    }
    // 快进直接显示全文
    if (GlobalStore.get('fastForwardActive')) {
        div.innerHTML = text + '<br>';
        fireAllAnchors(anchorSpecs);
        return;
    }
    const c = getCtx();
    let plain = text.replace(/<[^>]+>/g, '');
    let htmlIdx = 0, fullHtml = '';
    // baseDuration 是 1x 基准毫秒：整行打完的总时长；倍速由 clock 统一缩放
    // 无锚点行快速打出（250ms）：锚点行才需要逐字同步特效（600ms），普通行没有字位要等
    const hasAnchors = !!(anchorSpecs && anchorSpecs.some(s => s && s.text && s.cb && plain.indexOf(s.text) >= 0));
    const baseDuration = forcedSpeed !== null ? forcedSpeed : (hasAnchors ? 600 : 250);
    // 每字时长：参数表优先（charMs 普通行 / charMsAnchor 锚点行），取不到回落到旧逻辑（行基准 / 字数，8ms 下限）
    //   必须在 hasAnchors 之后算——锚点行和普通行读不同参数
    const speedKey = (c && c.speed) || 300;
    // 锚点行用 charMsAnchor（更快），普通行用 charMs
    const charMsParam = getPerfParam(hasAnchors ? 'charMsAnchor' : 'charMs', speedKey);

    // 锚点：在纯文本里定位每个锚点文本的结束位置，打到该位置时触发
    const pending = [];
    if (anchorSpecs && anchorSpecs.length > 0) {
        for (const spec of anchorSpecs) {
            if (!spec || !spec.text || !spec.cb) continue;
            const idx = plain.indexOf(spec.text);
            if (idx >= 0) pending.push({ triggerAt: idx + spec.text.length, cb: spec.cb, fired: false });
        }
    }
    let playedPlainLen = 0;

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
            playedPlainLen++;
            for (const p of pending) {
                if (!p.fired && playedPlainLen >= p.triggerAt) {
                    p.fired = true;
                    try { p.cb(); } catch (e) { console.error('[playLineText] 锚点回调出错:', e); }
                }
            }
            await clock.waitReal(charDelay);
        }
        div.innerHTML = fullHtml + '<br>';
        c.autoScrollLog();
    }
    // 收尾：锚点文本未匹配到（异常）时兜底触发，避免飘字彻底丢失
    for (const p of pending) {
        if (!p.fired) { p.fired = true; try { p.cb(); } catch (e) {} }
    }
}