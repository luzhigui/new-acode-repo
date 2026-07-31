﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// player/08player-text.js - 光明顶5v5 文字播放器
// V5.2.1 | ~1437 bytes | 2026-07-05
export const VER = 'player/08player-text.js V5.2.1';

let ctx = null;
function getCtx() {
    if (!ctx) ctx = window._getPlayerContext();
    return ctx;
}

export function setPlayerContext(c) { ctx = c; }

export async function playLineText(text, div, forcedSpeed = null) {
    // 分隔符、系统信息、瞬时提示直接显示，不走逐字动画
    if (text.includes('separator') || text.includes('class="purple small"') || text.includes('class="blue small"') || text.includes('class="red small"') || text.includes('class="gray small"') || text.includes('class="gold small"') || text.includes('class="green small"')) {
        div.innerHTML = text + '<br>';
        return;
    }
    // 快进到底时跳过逐字动画，直接显示完整文本
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
            const ctx2 = getCtx();
            if (ctx2 && ctx2._scheduler) {
                await new Promise(r => ctx2._scheduler.schedule('text', charDelay, r));
            } else {
                await new Promise(r => setTimeout(r, charDelay));
            }
        }
        div.innerHTML=fullHtml+'<br>';
        c.autoScrollLog();
    }
}