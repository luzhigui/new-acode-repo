// V6.1.0 | 2026-09-13 统一时间层：打字等待改 clock.wait，删 waitWhilePaused；baseDuration 改为 1x 基准时长
export const VER = 'player/40player-text.js V6.1.0';

import { GlobalStore } from '../infra/54-global-store.js';
import { clock } from '../infra/52-clock.js';

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
    const baseDuration = forcedSpeed !== null ? forcedSpeed : 600;

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
        // 每字 1x 基准时长，下限 8ms（1x），避免长文字打得太快看不清
        let charDelay = baseDuration / Math.max(1, plain.length);
        if (charDelay < 8) charDelay = 8;
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
            await clock.wait(charDelay);
        }
        div.innerHTML = fullHtml + '<br>';
        c.autoScrollLog();
    }
    // 收尾：锚点文本未匹配到（异常）时兜底触发，避免飘字彻底丢失
    for (const p of pending) {
        if (!p.fired) { p.fired = true; try { p.cb(); } catch (e) {} }
    }
}