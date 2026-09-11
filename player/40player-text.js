// V6.0.0 | ~2700 bytes | 2026-07-05
export const VER = 'player/40player-text.js V6.0.0';

import { GlobalStore } from '../infra/54-global-store.js';

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
    const c = getCtx(); let plain = text.replace(/<[^>]+>/g, ''); let htmlIdx=0,fullHtml='';
    const effectiveSpeed = forcedSpeed !== null ? forcedSpeed : c.speed;
    let minCharDelay = 20;
    if (effectiveSpeed <= 143) minCharDelay = 2;
    else if (effectiveSpeed <= 250) minCharDelay = 4;
    else if (effectiveSpeed <= 500) minCharDelay = 8;
    
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
    
    while(htmlIdx<text.length){
        if(c.abortController&&c.abortController.signal.aborted)return;
        await c.waitWhilePaused();
        let charDelay = effectiveSpeed / plain.length;
        if (charDelay < minCharDelay) charDelay = minCharDelay;
        if(text[htmlIdx]==='<'){let tag='';while(text[htmlIdx]!=='>'){tag+=text[htmlIdx];htmlIdx++;}tag+='>';fullHtml+=tag;htmlIdx++;}
        else{
            fullHtml+=text[htmlIdx];htmlIdx++;
            playedPlainLen++;
            for (const p of pending) {
                if (!p.fired && playedPlainLen >= p.triggerAt) {
                    p.fired = true;
                    try { p.cb(); } catch (e) { console.error('[playLineText] 锚点回调出错:', e); }
                }
            }
            // 使用 setTimeout 而非 scheduler，避免 isPaused 时 scheduler 不 tick 导致死锁
            await new Promise(r => setTimeout(r, charDelay));
        }
        div.innerHTML=fullHtml+'<br>';
        c.autoScrollLog();
    }
    // 收尾：锚点文本未匹配到（异常）时兜底触发，避免飘字彻底丢失
    for (const p of pending) {
        if (!p.fired) { p.fired = true; try { p.cb(); } catch (e) {} }
    }
}