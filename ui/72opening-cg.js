// ui/72opening-cg.js - 开场CG（三幕黑屏文字 + 圣火令剪影 + 合成BGM，首次进游戏播放）
// V6.1.0 | 2026-09-09 新增圣火令剪影（随幕倾斜/复燃/怒燃）、Web Audio 合成配乐（drone+战鼓按幕调速）、点按逐行推进/长按跳过
// 集成点：61main-5v5-test.js bindCoverStart 的 onStart 里，showStartGuide() 之前
// 适配：字号/元素锚 vmin（视口短边），360 宽长屏手机 ~ 电脑横屏同一构图
// 交互：点按=逐行推进文字（全行后切幕）；长按(>400ms)=跳过本幕；右上角「跳过」随时结束；声音在首次点击后启动；播完或跳过均记 localStorage
export const VER = 'ui/72opening-cg.js V6.1.0';

const DONE_KEY = 'ming_opening_cg_done_5v5_test';

export function isOpeningCgDone() {
    try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return true; }
}
export function markOpeningCgDone() {
    try { localStorage.setItem(DONE_KEY, '1'); } catch {}
}
export function resetOpeningCgDone() {
    try { localStorage.removeItem(DONE_KEY); } catch {}
}

/* ---------- 三幕数据（文案 / 情绪 / 特殊行） ---------- */
const ACTS = [
    {
        mood: 'dying',
        chapter: '第一幕 · 圣火将熄',
        lines: [
            { t: '元末乱世，正邪不两立。' },
            { t: '六大派合围光明顶，' },
            { t: '明教血战三日、十不存三——' },
            { t: '圣火将熄', big: true }
        ]
    },
    {
        mood: 'rising',
        chapter: '第二幕 · 临危受命',
        sigil: '明',
        lines: [
            { t: '危亡之际，你继任明教教主，' },
            { t: '执圣火令，号令群雄——' },
            { heroes: ['张无忌', '韦一笑', '殷天正'] },
            { t: '各路豪杰，尽归麾下。' }
        ]
    },
    {
        mood: 'blazing',
        chapter: '第三幕 · 点将开战',
        lines: [
            { t: '战鼓已响，山门在望。' },
            { t: '教主，点将布阵，守住这最后的圣火——' },
            { t: '让他们见识明教的怒火！', big: true, fire: true }
        ]
    }
];

/* 火星数量 per mood */
const MOOD_SPARKS = { dying: 10, rising: 16, blazing: 26 };

/* ---------- 圣火令 SVG ---------- */
const CUP_SVG = '<svg viewBox="0 0 120 240" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><linearGradient id="cupG" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#e6c46b"/><stop offset=".5" stop-color="#c9a34b"/>' +
    '<stop offset="1" stop-color="#8a6d2f"/></linearGradient></defs>' +
    '<rect x="54" y="70" width="12" height="152" rx="5" fill="url(#cupG)"/>' +
    '<rect x="54" y="112" width="12" height="3.5" fill="#8a6d2f"/>' +
    '<rect x="54" y="132" width="12" height="3.5" fill="#8a6d2f"/>' +
    '<rect x="54" y="152" width="12" height="3.5" fill="#8a6d2f"/>' +
    '<circle cx="60" cy="54" r="17" fill="none" stroke="#e6c46b" stroke-width="5"/>' +
    '<path class="cg-flame" d="M60 16 C 74 32 75 48 60 54 C 45 48 46 32 60 16 Z" fill="#ffb347"/>' +
    '<path d="M38 204 L82 204 L92 226 L28 226 Z" fill="#6d5526"/>' +
    '</svg>';

/* ---------- 样式（一次性注入，选择器均以 #cgOverlay 收口） ---------- */
const STYLE_CSS = `
#cgOverlay{position:fixed;inset:0;background:#000;z-index:100010;overflow:hidden;cursor:pointer;
  font-family:'LXGW WenKai','KaiTi','STKaiti','Noto Serif SC',serif;
  -webkit-user-select:none;user-select:none;transition:opacity .95s ease;
  touch-action:manipulation;}
#cgOverlay.hide{opacity:0;pointer-events:none;}

/* 星 */
#cgStars i{position:absolute;width:2px;height:2px;border-radius:50%;background:#fff;
  animation:cgStarTwinkle 3s ease-in-out infinite;}
@keyframes cgStarTwinkle{0%,100%{opacity:var(--tw,.15);}50%{opacity:calc(var(--tw,.15)*2.4);}}

/* 战场红光（第三幕） */
#cgWarGlow{position:absolute;left:50%;bottom:26%;transform:translateX(-50%);
  width:130vmin;height:52vmin;border-radius:50%;
  background:radial-gradient(ellipse at center,rgba(255,45,25,.14),transparent 62%);
  opacity:0;z-index:1;}
#cgOverlay[data-mood="blazing"] #cgWarGlow{animation:cgFadeIn 2.4s ease forwards;}

/* 山（远/近两层剪影） */
.cg-mountain{position:absolute;left:0;right:0;bottom:0;}
.cg-mountain.m1{height:36%;background:#060606;z-index:2;
  clip-path:polygon(0 100%,0 62%,12% 70%,25% 42%,38% 66%,52% 26%,64% 60%,78% 46%,90% 72%,100% 52%,100% 100%);}
.cg-mountain.m2{height:18%;background:#000;z-index:5;
  clip-path:polygon(0 100%,0 80%,15% 92%,30% 72%,50% 94%,65% 76%,82% 90%,100% 78%,100% 100%);}

/* 火：光晕（远山前、近山后）+ 火核（山脊上） */
#cgFireGlow{position:absolute;left:50%;bottom:12%;transform:translateX(-50%);
  width:min(78vmin,520px);height:min(40vmin,280px);border-radius:50%;
  background:radial-gradient(ellipse at center,rgba(255,140,45,.5),rgba(200,60,12,.22) 46%,transparent 70%);
  filter:blur(20px);z-index:3;}
#cgFireCore{position:absolute;left:50%;bottom:19%;transform:translateX(-50%);
  width:min(22vmin,150px);height:min(15vmin,105px);border-radius:50%;
  background:radial-gradient(ellipse at 50% 62%,rgba(255,235,150,.95),rgba(255,130,40,.75) 45%,transparent 72%);
  filter:blur(8px);z-index:6;}

/* 火光三态：将熄挣扎 / 复燃回稳 / 旺盛燃烧 */
#cgOverlay[data-mood="dying"] #cgFireGlow{animation:cgFireDying 3.2s ease-in-out infinite;}
@keyframes cgFireDying{0%{opacity:.95;}18%{opacity:.48;}32%{opacity:.66;}46%{opacity:.4;}62%{opacity:.9;}78%{opacity:.58;}100%{opacity:.95;}}
#cgOverlay[data-mood="rising"] #cgFireGlow{animation:cgFireRising 3.6s ease-in-out infinite;}
@keyframes cgFireRising{0%,100%{opacity:.78;}50%{opacity:1;}}
#cgOverlay[data-mood="blazing"] #cgFireGlow{animation:cgFireBlazing 1.7s ease-in-out infinite;}
@keyframes cgFireBlazing{0%{opacity:.92;}30%{opacity:1;}60%{opacity:.8;}100%{opacity:.92;}}
#cgOverlay[data-mood="dying"] #cgFireCore{animation:cgCoreCalm 1.4s ease-in-out infinite;}
#cgOverlay[data-mood="rising"] #cgFireCore{animation:cgCoreCalm 1.1s ease-in-out infinite;}
#cgOverlay[data-mood="blazing"] #cgFireCore{animation:cgCoreBlaze .55s ease-in-out infinite;}
@keyframes cgCoreCalm{0%,100%{opacity:.75;}50%{opacity:1;}}
@keyframes cgCoreBlaze{0%,100%{opacity:.85;}50%{opacity:1;}}

/* 火星 */
#cgSparks i{position:absolute;border-radius:50%;box-shadow:0 0 6px rgba(255,150,60,.8);
  opacity:0;z-index:6;animation:cgSparkRise 4s linear infinite;}
@keyframes cgSparkRise{0%{opacity:0;transform:translate(0,0) scale(1);}
  10%{opacity:.95;}55%{opacity:.5;}
  100%{opacity:0;transform:translate(var(--sx,0px),var(--sy,-40vh)) scale(.15);}}

/* 圣火令（剪影，随幕：斜倒→回正→怒燃） */
.cg-cup{position:absolute;left:50%;bottom:7%;z-index:8;
  width:min(30vmin,170px);transition:transform 1.6s ease,filter 1.6s ease;}
.cg-cup svg{display:block;width:100%;height:auto;
  filter:drop-shadow(0 0 18px rgba(255,150,50,.38));}
.cg-flame{transform-origin:50% 100%;
  animation:cgFlameDance 2.4s ease-in-out infinite;}
@keyframes cgFlameDance{0%,100%{transform:scale(1) rotate(0deg);}
  25%{transform:scale(1.08) rotate(-2deg);}55%{transform:scale(.94) rotate(1.6deg);}
  80%{transform:scale(1.05) rotate(-1deg);}}
#cgOverlay[data-mood="dying"] .cg-cup{transform:translateX(-50%) rotate(-9deg) translateY(14px);
  filter:brightness(.5) saturate(.7);}
#cgOverlay[data-mood="dying"] .cg-flame{animation-duration:3.4s;opacity:.4;}
#cgOverlay[data-mood="rising"] .cg-cup{transform:translateX(-50%) rotate(0deg) translateY(4px);}
#cgOverlay[data-mood="blazing"] .cg-cup{
  animation:cgCupBlaze .7s ease-in-out infinite;
  filter:brightness(1.22) saturate(1.15) drop-shadow(0 0 26px rgba(255,130,40,.55));}
#cgOverlay[data-mood="blazing"] .cg-flame{animation-duration:1.1s;opacity:1;}
@keyframes cgCupBlaze{0%,100%{transform:translateX(-50%) translateY(0);}
  25%{transform:translateX(-50%) translateY(-1.5px);}
  60%{transform:translateX(-50%) translateY(.8px);}}

/* 文字区 */
#cgText{position:absolute;top:13%;left:50%;transform:translateX(-50%);
  width:min(86vw,900px);text-align:center;z-index:7;transition:opacity .65s ease;}
#cgText.out{opacity:0;}
.cg-chapter{font-size:clamp(11px,3vmin,26px);letter-spacing:.5em;text-indent:.5em;
  color:rgba(255,200,140,.5);margin:0 0 1.6em;opacity:0;
  animation:cgLineIn 1s ease-out var(--d,0s) forwards;}
.cg-line{font-size:clamp(17px,5.2vmin,44px);line-height:1.95;color:#d8cfc0;margin:0 0 .3em;
  opacity:0;animation:cgLineIn 1.15s ease-out var(--d,0s) forwards;
  text-shadow:0 2px 12px rgba(0,0,0,.9);}
.cg-line.big{font-size:clamp(34px,11.5vmin,96px);font-weight:700;
  letter-spacing:.26em;text-indent:.26em;color:#ffc266;margin-top:.45em;
  animation:cgLineIn 1.9s ease-out var(--d,0s) forwards,cgEmber 3.4s ease-in-out var(--emberDelay,2.2s) infinite;
  text-shadow:0 0 14px rgba(255,150,50,.5),0 0 38px rgba(255,110,30,.3);}
.cg-line.big.fire{color:#ff9a4d;
  text-shadow:0 0 16px rgba(255,120,40,.65),0 0 44px rgba(255,80,20,.4);}
.cg-line.cg-heroes{animation:none;opacity:1;}
.cg-heroes span{display:inline-block;opacity:0;margin:0 .34em;color:#e8c27a;
  text-shadow:0 0 12px rgba(255,180,80,.4);
  animation:cgLineIn .9s ease-out var(--d,0s) forwards;}
.cg-heroes .sep{color:rgba(232,194,122,.45);
  animation:cgSepIn .6s ease-out var(--d,0s) forwards;}
@keyframes cgSepIn{to{opacity:.55;}}
#cgSigil{font-size:clamp(64px,17vmin,150px);line-height:1;color:#f0c268;margin:0 0 .22em;
  opacity:0;text-shadow:0 0 20px rgba(255,170,60,.5),0 0 52px rgba(255,120,30,.35);
  animation:cgLineIn 1.6s ease-out var(--d,0s) forwards,cgSigilBreath 3.6s ease-in-out 1.6s infinite;}
@keyframes cgSigilBreath{0%,100%{text-shadow:0 0 20px rgba(255,170,60,.5),0 0 52px rgba(255,120,30,.35);}
  50%{text-shadow:0 0 30px rgba(255,190,80,.75),0 0 70px rgba(255,130,40,.5);}}
@keyframes cgLineIn{from{opacity:0;transform:translateY(16px);filter:blur(6px);}
  to{opacity:1;transform:translateY(0);filter:blur(0);}}
@keyframes cgEmber{0%,100%{text-shadow:0 0 14px rgba(255,150,50,.5),0 0 38px rgba(255,110,30,.3);}
  50%{text-shadow:0 0 22px rgba(255,170,60,.8),0 0 52px rgba(255,120,30,.5);}}
@keyframes cgFadeIn{to{opacity:1;}}

/* 跳过 & 继续 */
#cgSkip{position:absolute;top:calc(10px + env(safe-area-inset-top,0px));
  right:calc(12px + env(safe-area-inset-right,0px));z-index:9;
  background:rgba(255,255,255,.04);color:rgba(255,255,255,.55);
  border:1px solid rgba(255,255,255,.22);border-radius:999px;
  font-size:clamp(11px,2.6vmin,18px);letter-spacing:.2em;padding:.45em 1.1em .45em 1.3em;
  font-family:inherit;cursor:pointer;}
#cgSkip:hover{color:#fff;border-color:rgba(255,200,120,.6);}
#cgHint{position:absolute;bottom:5%;left:0;right:0;text-align:center;
  font-size:clamp(11px,2.9vmin,24px);letter-spacing:.28em;color:rgba(216,207,192,.85);
  opacity:0;z-index:9;}
#cgHint.show{animation:cgHintBreath 2.6s ease-in-out infinite;}
@keyframes cgHintBreath{0%,100%{opacity:.22;}50%{opacity:.75;}}
`;

/* ---------- Web Audio 合成 BGM（drone + 战鼓，按幕调速） ---------- */
const audio = { ctx: null, master: null, droneGain: null, muted: false, drumTimer: null, drumStart: null, drumInterval: 2600 };

function drumBeat(vol) {
    if (!audio.ctx) return;
    const len = audio.ctx.sampleRate * 0.5;
    const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.ctx.createBufferSource();
    src.buffer = buf;
    const f = audio.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 220;
    const v = audio.ctx.createGain();
    v.gain.setValueAtTime(vol, audio.ctx.currentTime);
    v.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + 0.55);
    src.connect(f); f.connect(v); v.connect(audio.master);
    src.start();
}

function startAudio() {
    if (audio.ctx) {
        if (audio.ctx.state === 'suspended') audio.ctx.resume();
        return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audio.ctx = new AC();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0;
    audio.master.connect(audio.ctx.destination);

    const g = audio.ctx.createGain();
    audio.droneGain = g;
    g.gain.value = 0.16;
    g.connect(audio.master);
    [55, 82.41].forEach((f, i) => {
        const o = audio.ctx.createOscillator();
        o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = f;
        const og = audio.ctx.createGain();
        og.gain.value = i === 0 ? 0.7 : 0.3;
        o.connect(og); og.connect(g);
        o.start();
    });
    audio.ctx.resume().then(() => {
        audio.master.gain.linearRampToValueAtTime(audio.muted ? 0 : 0.22, audio.ctx.currentTime + 1.2);
        audio.drumStart = audio.ctx.currentTime;
        const loop = () => {
            audio.drumTimer = setTimeout(() => { drumBeat(0.5); loop(); }, audio.drumInterval);
        };
        loop();
    });
}

function setAudioMood(mood) {
    if (!audio.ctx) return;
    audio.drumInterval = mood === 'dying' ? 3200 : (mood === 'rising' ? 2100 : 1150);
    if (audio.droneGain) {
        const tar = mood === 'blazing' ? 0.24 : 0.16;
        audio.droneGain.gain.linearRampToValueAtTime(tar, audio.ctx.currentTime + 1.0);
    }
    if (mood === 'blazing') drumBeat(0.7); /* 第三幕开场鼓 */
}

/* ---------- 引擎 ---------- */
let _active = null;

export function showOpeningCg(onDone) {
    if (_active) return; // 防重入
    startAudio(); // 若仍在用户手势栈内可立即出声，否则等首次点击（startAudio 在 suspended 时会 resume）

    // 样式只注入一次
    if (!document.getElementById('cgStyles')) {
        const st = document.createElement('style');
        st.id = 'cgStyles';
        st.textContent = STYLE_CSS;
        document.head.appendChild(st);
    }

    const overlay = document.createElement('div');
    overlay.id = 'cgOverlay';
    overlay.dataset.mood = 'dying';
    overlay.innerHTML = [
        '<div id="cgStars"></div>',
        '<div id="cgWarGlow"></div>',
        '<div class="cg-mountain m1"></div>',
        '<div id="cgFireGlow"></div>',
        '<div id="cgFireCore"></div>',
        '<div class="cg-mountain m2"></div>',
        '<div class="cg-cup">' + CUP_SVG + '</div>',
        '<div id="cgSparks"></div>',
        '<div id="cgText"></div>',
        '<button id="cgSkip" type="button">跳过 ›</button>',
        '<div id="cgHint"></div>'
    ].join('');
    document.body.appendChild(overlay);

    const text = overlay.querySelector('#cgText');
    const hint = overlay.querySelector('#cgHint');
    const sparksBox = overlay.querySelector('#cgSparks');

    const ctx = { overlay, text, hint, act: 0, rowIdx: 0, rows: [], linesReady: false, switching: false, readyTimer: null, done: false, downAt: 0 };
    _active = ctx;

    /* 星（一次性） */
    const starsBox = overlay.querySelector('#cgStars');
    for (let i = 0; i < 14; i++) {
        const s = document.createElement('i');
        s.style.left = (Math.random() * 96 + 2) + '%';
        s.style.top = (Math.random() * 40 + 2) + '%';
        const d = 2 + Math.random() * 4;
        s.style.setProperty('--tw', (0.06 + Math.random() * 0.2).toFixed(2));
        s.style.animationDuration = d.toFixed(1) + 's';
        s.style.animationDelay = (-Math.random() * d).toFixed(1) + 's';
        s.style.transform = 'scale(' + (0.6 + Math.random() * 0.9).toFixed(2) + ')';
        starsBox.appendChild(s);
    }

    /* 火星（按幕重建：数量/节奏随情绪） */
    function buildSparks(mood) {
        sparksBox.innerHTML = '';
        const n = MOOD_SPARKS[mood] || 12;
        const colors = ['#ffd27d', '#ffb347', '#ff8c42', '#ff6b35'];
        const fast = mood === 'blazing';
        for (let i = 0; i < n; i++) {
            const sp = document.createElement('i');
            sp.style.left = 'calc(50% + ' + ((Math.random() * 120 - 60) | 0) + 'px)';
            sp.style.bottom = (14 + Math.random() * 10) + '%';
            sp.style.background = colors[i % colors.length];
            const dur = (fast ? 2.2 : 3.2) + Math.random() * (fast ? 2.5 : 4);
            sp.style.setProperty('--sx', ((Math.random() * 140 - 70) | 0) + 'px');
            sp.style.setProperty('--sy', '-' + (32 + (Math.random() * 32 | 0)) + 'vh');
            sp.style.animationDuration = dur.toFixed(1) + 's';
            sp.style.animationDelay = (-Math.random() * dur).toFixed(1) + 's';
            const sz = (fast ? 2 : 1.6) + Math.random() * 2.6;
            sp.style.width = sz.toFixed(1) + 'px';
            sp.style.height = sz.toFixed(1) + 'px';
            sparksBox.appendChild(sp);
        }
    }

    function setHint(txt) { hint.textContent = txt; hint.classList.add('show'); }
    function clearHint() { hint.classList.remove('show'); }

    /* 渲染一幕：收集本幕各行（章节/台词/人名/字印），返回 ready 时刻（秒） */
    function renderAct(idx) {
        const a = ACTS[idx];
        ctx.act = idx;
        ctx.rowIdx = 0;
        ctx.rows = [];
        ctx.linesReady = false;
        ctx.switching = false;
        clearHint();
        overlay.dataset.mood = a.mood;
        setAudioMood(a.mood);
        buildSparks(a.mood);
        text.classList.remove('out');
        text.innerHTML = '';
        setHint('— 点击：逐行推进 · 长按：跳过本幕 —');

        let t = 0.6;

        if (a.sigil) {
            const sg = document.createElement('div');
            sg.id = 'cgSigil';
            sg.textContent = a.sigil;
            sg.style.setProperty('--d', '0.4s');
            text.appendChild(sg);
            ctx.rows.push(sg);
        }

        const ch = document.createElement('p');
        ch.className = 'cg-chapter';
        ch.textContent = a.chapter;
        ch.style.setProperty('--d', t + 's');
        text.appendChild(ch);
        ctx.rows.push(ch);
        t += 0.6;

        for (const ln of a.lines) {
            if (ln.heroes) {
                const p = document.createElement('p');
                p.className = 'cg-line cg-heroes';
                let d = t + 0.5;
                ln.heroes.forEach((name, i) => {
                    if (i > 0) {
                        const sep = document.createElement('span');
                        sep.className = 'sep';
                        sep.textContent = '·';
                        sep.style.setProperty('--d', Math.max(0.05, d - 0.35) + 's');
                        p.appendChild(sep);
                    }
                    const s = document.createElement('span');
                    s.textContent = name;
                    s.style.setProperty('--d', d + 's');
                    p.appendChild(s);
                    ctx.rows.push(s);
                    d += 0.75;
                });
                t = d + 0.1;
                text.appendChild(p);
            } else {
                const p = document.createElement('p');
                p.className = 'cg-line' + (ln.big ? ' big' : '') + (ln.fire ? ' fire' : '');
                p.textContent = ln.t;
                const dur = ln.big ? 1.9 : 1.15;
                const gap = ln.big ? 0.6 : 0.45;
                p.style.setProperty('--d', (t + gap) + 's');
                if (ln.big) p.style.setProperty('--emberDelay', (t + gap + dur) + 's');
                t += gap + dur;
                text.appendChild(p);
                ctx.rows.push(p);
            }
        }

        ctx.readyTimer = setTimeout(() => {
            ctx.linesReady = true;
            setHint(ctx.act === ACTS.length - 1 ? '— 点击任意处 · 开战 —' : '— 点击任意处继续 —');
        }, (t + 0.4) * 1000);
    }

    /* 点按：优先逐行reveal，全行后进入切幕/结束 */
    function revealNext() {
        if (ctx.rowIdx < ctx.rows.length) {
            const el = ctx.rows[ctx.rowIdx];
            el.style.setProperty('--d', '0s');
            el.style.setProperty('--emberDelay', '0.5s');
            el.style.animationDuration = '0.4s';
            ctx.rowIdx++;
        }
        if (ctx.rowIdx >= ctx.rows.length) {
            ctx.linesReady = true;
            setHint(ctx.act === ACTS.length - 1 ? '— 点击任意处 · 开战 —' : '— 点击任意处继续 —');
        }
    }

    /* 长按：整幕跳过 */
    function skipAct() {
        if (ctx.done || ctx.switching) return;
        clearTimeout(ctx.readyTimer);
        if (ctx.act < ACTS.length - 1) nextAct();
        else finish();
    }

    function nextAct() {
        ctx.switching = true;
        clearHint();
        text.classList.add('out');
        setTimeout(() => renderAct(ctx.act + 1), 650);
    }

    function finish() {
        if (ctx.done) return;
        ctx.done = true;
        clearTimeout(ctx.readyTimer);
        startAudio();
        overlay.classList.add('hide');
        setTimeout(() => {
            overlay.remove();
            _active = null;
            markOpeningCgDone();
            if (typeof onDone === 'function') onDone();
        }, 1000);
    }

    /* 按/松分离：>400ms = 长按跳过本幕；否则点按（首击顺带开声） */
    overlay.addEventListener('pointerdown', () => {
        ctx.downAt = Date.now();
    });
    overlay.addEventListener('pointerup', (e) => {
        if (ctx.done || ctx.switching) return;
        const dt = Date.now() - ctx.downAt;
        e.preventDefault();
        if (dt >= 400) { skipAct(); return; }
        startAudio(); /* 首次点击开声 */
        if (!ctx.linesReady) { revealNext(); return; }
        if (ctx.act < ACTS.length - 1) nextAct();
        else finish();
    });

    overlay.querySelector('#cgSkip').addEventListener('click', (e) => {
        e.stopPropagation();
        finish();
    });

    renderAct(0);
}