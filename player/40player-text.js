// V5.5.0 | ~2700 bytes | 2026-07-05
export const VER = 'player/40player-text.js V5.5.0';

import { GlobalStore } from '../infra/54-global-store.js';

let ctx = null;
function getCtx() {
    if (!ctx) ctx = GlobalStore.get('playerContext');
    return ctx;
}

export function setPlayerContext(c) { ctx = c; }

// 逐字播放 HTML 文本；分隔符/快进直接显示完整文本
export async function playLineText(text, div, forcedSpeed = null) {
    // 分隔符/系统信息直接显示
    if (text.includes('separator') || text.includes('class="purple small"') || text.includes('class="blue small"') || text.includes('class="red small"') || text.includes('class="gray small"') || text.includes('class="gold small"') || text.includes('class="green small"')) {
        div.innerHTML = text + '<br>';
        return;
    }
    // 快进直接显示全文
    if (GlobalStore.get('fastForwardActive')) {
        div.innerHTML = text + '<br>';
        return;
    }
    const c = getCtx(); let plain = text.replace(/<[^>]+>/g, ''); let htmlIdx=0,fullHtml='';
    const effectiveSpeed = forcedSpeed !== null ? forcedSpeed : c.speed;
    let minCharDelay = 20;
    if (effectiveSpeed <= 143) minCharDelay = 2;
    else if (effectiveSpeed <= 250) minCharDelay = 4;
    else if (effectiveSpeed <= 500) minCharDelay = 8;
    
    while(htmlIdx<text.length){
        if(c.abortController&&c.abortController.signal.aborted)return;
        await c.waitWhilePaused();
        let charDelay = effectiveSpeed / plain.length;
        if (charDelay < minCharDelay) charDelay = minCharDelay;
        if(text[htmlIdx]==='<'){let tag='';while(text[htmlIdx]!=='>'){tag+=text[htmlIdx];htmlIdx++;}tag+='>';fullHtml+=tag;htmlIdx++;}
        else{
            fullHtml+=text[htmlIdx];htmlIdx++;
            // 使用 setTimeout 而非 scheduler，避免 isPaused 时 scheduler 不 tick 导致死锁
            await new Promise(r => setTimeout(r, charDelay));
        }
        div.innerHTML=fullHtml+'<br>';
        c.autoScrollLog();
    }
}