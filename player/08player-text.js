// 08player-text.js - 光明顶对战 5v5 文字播放器
// 修正：统一版本号导出为 VER
export const VER = '08player-text.js V1.0.0';

let ctx = null;
function getCtx() {
    if (!ctx) ctx = window._getPlayerContext();
    return ctx;
}

export function setPlayerContext(c) { ctx = c; }

export async function playLineText(text, div) {
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
        else{fullHtml+=text[htmlIdx];htmlIdx++;await new Promise(r=>setTimeout(r,charDelay));}
        div.innerHTML=fullHtml+'<br>';
        c.autoScrollLog();
    }
}