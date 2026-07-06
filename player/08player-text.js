// player/08player-text.js - 光明顶5v5 文字播放器
// V4.0.0 | ~1437 bytes | 2026-07-05
export const VER = 'player/08player-text.js V4.0.0';

let ctx = null;
function getCtx() {
    if (!ctx) ctx = window._getPlayerContext();
    return ctx;
}

export function setPlayerContext(c) { ctx = c; }

export async function playLineText(text, div) {
    // 分隔符直接显示，不走逐字动画
    if (text.includes('separator')) {
        div.innerHTML = text + '<br>';
        return;
    }
    const c = getCtx(); let plain = text.replace(/<[^>]+>/g, ''); let htmlIdx=0,fullHtml='';
    let minCharDelay = 30;
    if (c.speed <= 143) minCharDelay = 2;
    else if (c.speed <= 250) minCharDelay = 5;
    else if (c.speed <= 500) minCharDelay = 10;
    
    while(htmlIdx<text.length){
        if(c.abortController&&c.abortController.signal.aborted)return;
        await c.waitWhilePaused();
        let charDelay = c.speed / plain.length;
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