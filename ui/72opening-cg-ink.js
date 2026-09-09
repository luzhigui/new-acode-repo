// ui/72opening-cg-ink.js - 开场CG·水墨长卷（开卷三幕，首次进游戏播放）
// V6.0.0 | 2026-09-09 由 code20260909.html demo 升级为正式模块，替代 72opening-cg.js 黑屏文字版
// 预估字节数：≈ 33 KB
// 集成点：61main-5v5-test.js bindCoverStart 的 onStart 里，showStartGuide() 之前
// 适配：字号/元素锚 vmin（视口短边），360 宽长屏手机 ~ 电脑横屏同一构图
// 交互：全屏点击=快进文字/下一幕；右上角「跳过」随时结束；播完或跳过均记 localStorage
// 特性：宣纸开卷 / SVG 湍流滤镜毛边山水 / 毛笔"写出"文字 / 六派军旗 / 五虎名签 / 朱砂钤印 / 火星粒子
export const VER = 'ui/72opening-cg-ink.js V6.0.0';

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

/* ---------- 时序常量 ---------- */
const PAN = 1.7;     // 幕间运镜时长（秒）
const UNROLL = 1.3;  // 开卷时长（秒）

/* ---------- 三幕文案 ---------- */
const ACTS = [
    {
        chapter: '壹 · 兵临孤峰',
        lines: [
            { t: '元至正年间，群雄并起，江湖失序。' },
            { t: '六大派会师西域，围光明顶如铁桶。' },
            { t: '血战三日，明教弟子十不存一。' },
            { t: '圣火将熄', big: true }
        ]
    },
    {
        chapter: '贰 · 临危受命',
        lines: [
            { t: '危亡之际，你执圣火令，继任教主——' },
            { ming: '明' },
            { slips: ['张无忌', '杨逍', '韦一笑', '殷天正', '谢逊'] },
            { t: '侠义所聚，圣火复明。' }
        ]
    },
    {
        chapter: '叁 · 决战光明顶',
        seal: true,
        lines: [
            { t: '翌日拂晓，六派卷土重来。' },
            { t: '山巅之上——' },
            { t: '圣火，重燃！', big: true, fire: true },
            { t: '教主，点将布阵，迎敌！' }
        ]
    }
];

/* 六大派军旗（第一幕） */
const ARMY = [
    { x: '7%',  y: '13%', h: '12vmin',   s: 1.05, name: '少林' },
    { x: '18%', y: '17%', h: '10.5vmin', s: 0.92, name: '武当' },
    { x: '28%', y: '11%', h: '11vmin',   s: 1.0,  name: '峨嵋' },
    { x: '38%', y: '15%', h: '9.5vmin',  s: 0.85, name: '华山' },
    { x: '47%', y: '12%', h: '10vmin',   s: 0.9,  name: '崆峒' },
    { x: '56%', y: '16%', h: '9vmin',    s: 0.8,  name: '昆仑' }
];

/* 山形剪影 */
const FAR1 = 'polygon(0 100%,0 58%,5% 66%,11% 48%,17% 62%,24% 42%,31% 58%,38% 44%,45% 64%,52% 40%,60% 60%,67% 46%,74% 64%,81% 42%,88% 60%,94% 50%,100% 58%,100% 100%)';
const FAR2 = 'polygon(0 100%,0 70%,7% 78%,14% 60%,21% 74%,29% 56%,37% 72%,45% 62%,53% 78%,61% 58%,69% 74%,77% 64%,85% 78%,93% 66%,100% 74%,100% 100%)';
const PANEL_POLY = [
    { mid:  'polygon(0 100%,0 38%,10% 55%,22% 30%,33% 52%,44% 24%,58% 48%,70% 20%,82% 44%,92% 30%,100% 40%,100% 100%)',
      near: 'polygon(0 100%,0 55%,14% 78%,30% 50%,47% 82%,60% 58%,76% 88%,90% 66%,100% 78%,100% 100%)',
      snow: 'polygon(65% 29%,67.5% 24%,70% 20%,72.5% 25%,75% 30%,73% 28%,71.5% 31%,69.5% 28%,67% 32%)' },
    { mid:  'polygon(0 100%,0 30%,12% 48%,24% 22%,38% 44%,52% 18%,66% 42%,80% 26%,90% 46%,100% 34%,100% 100%)',
      near: 'polygon(0 100%,0 62%,18% 82%,36% 56%,55% 86%,72% 60%,88% 80%,100% 66%,100% 100%)' },
    { mid:  'polygon(0 100%,0 34%,9% 52%,20% 26%,31% 50%,45% 22%,56% 44%,68% 16%,80% 40%,91% 28%,100% 44%,100% 100%)',
      near: 'polygon(0 100%,0 58%,12% 80%,28% 54%,44% 84%,58% 62%,74% 90%,88% 64%,100% 76%,100% 100%)',
      snow: 'polygon(63% 26%,66% 21%,68% 16%,70.5% 22%,73% 27%,70.5% 25%,68.5% 28%,66% 25%,64% 28%)' }
];

/* ---------- 样式 ---------- */
const STYLE_CSS = `
#cgOverlay{position:fixed;inset:0;z-index:100010;overflow:hidden;cursor:pointer;
  background:#14100c;font-family:'LXGW WenKai','KaiTi','STKaiti','Noto Serif SC',serif;
  -webkit-user-select:none;user-select:none;transition:opacity .9s ease;}
#cgOverlay.hide{opacity:0;pointer-events:none;}
#cgOverlay.thump{animation:cgThump .35s ease-out;}
@keyframes cgThump{30%{transform:translate(1px,3px);}60%{transform:translate(-1px,-1px);}}

/* 开卷：右半被卷轴遮住，向右展开 */
#cgScroll{position:absolute;inset:0;overflow:hidden;
  clip-path:inset(0 50% 0 0);animation:cgUnroll 1.25s .08s cubic-bezier(.55,.06,.35,1) forwards;}
@keyframes cgUnroll{to{clip-path:inset(0 0 0 0);}}
#cgRod{position:absolute;top:-2%;bottom:-2%;left:calc(50% - 1.6vmin);width:3.2vmin;z-index:30;
  background:linear-gradient(90deg,#20160c,#5c4732 40%,#8a6a44 50%,#3a2a18 78%,#17100a);
  border-radius:1vmin;box-shadow:0 0 2.4vmin rgba(40,24,8,.55);
  animation:cgRod 1.3s .08s cubic-bezier(.55,.06,.35,1) forwards;}
@keyframes cgRod{0%{transform:translateX(0);}80%{opacity:1;}
  100%{transform:translateX(54vw);opacity:0;}}

/* 纸 */
#cgPaper{position:absolute;inset:0;background:linear-gradient(180deg,#f3ecd8,#e9debf 70%,#e2d5b2);}
#cgGrain{position:absolute;inset:0;opacity:.55;pointer-events:none;
  background-image:radial-gradient(rgba(90,64,28,.055) 1px,transparent 1.3px);background-size:4px 4px;}
#cgVign{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(115% 95% at 50% 42%,transparent 52%,rgba(112,82,38,.22) 100%);
  box-shadow:inset 0 0 16vmin rgba(96,66,26,.22);}

/* 双层世界（近景 100vw/幕，远景半速视差） */
.cg-world{position:absolute;top:0;bottom:0;left:0;width:300vw;}
#cgFar{z-index:1;transition:transform ${PAN}s cubic-bezier(.45,.05,.25,1);}
#cgNear{z-index:2;transition:transform ${PAN}s cubic-bezier(.45,.05,.25,1);}
#cgFar .cg-mtn{filter:none;}
#cgFar .fm1{height:30%;background:rgba(122,112,92,.40);clip-path:${FAR1};}
#cgFar .fm2{height:22%;background:rgba(146,135,112,.32);clip-path:${FAR2};}

/* 远山雾带 */
.cg-mist{position:absolute;height:9vmin;border-radius:50%;z-index:2;
  background:rgba(244,238,222,.85);filter:blur(14px);
  animation:cgMist var(--t,30s) ease-in-out infinite alternate;}
@keyframes cgMist{from{transform:translateX(-4vw);}to{transform:translateX(5vw);}}

/* 近景山（毛边来自湍流置换滤镜） */
.cg-panel{position:absolute;top:0;bottom:0;width:100vw;}
.cg-mtn{position:absolute;left:0;right:0;bottom:0;filter:url(#cgInk);}
.cg-mtn.m-mid {height:34%;background:rgba(70,63,50,.92);z-index:2;}
.cg-mtn.m-snow{height:34%;background:rgba(252,250,242,.92);z-index:3;}
.cg-mtn.m-near{height:16%;background:rgba(36,32,26,.96);z-index:4;}

/* 雁阵 */
.cg-birdfly{position:absolute;z-index:6;animation:cgFly var(--t,30s) linear var(--dl,0s) infinite;}
@keyframes cgFly{from{transform:translate(-8vw,0);}to{transform:translate(108vw,-4vh);}}
.cg-bird{width:2.4vmin;height:1.1vmin;position:relative;animation:cgBob 3.4s ease-in-out infinite alternate;}
.cg-bird::before,.cg-bird::after{content:'';position:absolute;top:0;width:52%;height:100%;
  border-top:.34vmin solid rgba(72,62,46,.8);border-radius:50% 50% 0 0;}
.cg-bird::before{left:0;transform:rotate(14deg);}
.cg-bird::after{right:0;transform:rotate(-14deg);}
@keyframes cgBob{from{transform:translateY(0);}to{transform:translateY(-1.2vmin);}}

/* 六派军旗 */
.cg-army{position:absolute;inset:0;z-index:3;pointer-events:none;}
.cg-banner{position:absolute;bottom:var(--y,12%);left:var(--x,10%);
  transform-origin:bottom center;transform:scale(var(--s,1));opacity:0;
  animation:cgBannerUp .6s ease-out var(--d,0s) forwards;}
@keyframes cgBannerUp{from{opacity:0;transform:scale(var(--s,1)) translateY(8px);}
  to{opacity:1;transform:scale(var(--s,1)) translateY(0);}}
.cg-banner i{display:block;width:.55vmin;height:var(--h,13vmin);background:#2e2620;border-radius:1px;}
.cg-banner b{position:absolute;left:.5vmin;top:-.2em;width:4.2vmin;height:6vmin;
  background:#3a3024;color:rgba(240,232,214,.88);font-weight:400;
  clip-path:polygon(0 0,100% 0,100% 100%,50% 74%,0 100%);
  writing-mode:vertical-rl;font-size:clamp(9px,1.85vmin,13px);letter-spacing:.14em;
  padding:.5em .2em 0;box-sizing:border-box;transform-origin:top left;
  animation:cgFlag var(--sw,3s) ease-in-out calc(var(--d,0s) + .6s) infinite alternate;}
@keyframes cgFlag{from{transform:skewY(0) rotate(0);}to{transform:skewY(-3deg) rotate(1.5deg);}}

/* 圣火（全卷唯一点彩；dim=将熄） */
.cg-flame{position:absolute;z-index:3;transform:translateX(-50%);
  width:calc(14vmin*var(--fs,1));height:calc(21vmin*var(--fs,1));
  filter:grayscale(var(--g,0)) brightness(var(--b,1)) url(#cgFire);}
.cg-flame.dim{--fs:.55;--g:.78;--b:.72;}
.cg-flame b{position:absolute;left:50%;bottom:0;transform:translateX(-50%);
  border-radius:46% 54% 52% 48%/62% 58% 42% 38%;}
.cg-flame .f1{width:42%;height:52%;bottom:4%;
  background:radial-gradient(closest-side at 50% 72%,#fff3cf,#ffd267 52%,rgba(255,150,40,0) 74%);
  animation:cgMorphA .9s ease-in-out infinite;}
.cg-flame .f2{width:66%;height:78%;
  background:radial-gradient(closest-side at 50% 70%,rgba(255,178,64,.95),rgba(240,110,30,.55) 55%,rgba(230,90,20,0) 76%);
  animation:cgMorphB 1.25s ease-in-out infinite;}
.cg-flame .f3{width:100%;height:100%;
  background:radial-gradient(closest-side at 50% 66%,rgba(224,88,26,.75),rgba(200,60,18,.4) 52%,rgba(190,50,15,0) 74%);
  animation:cgMorphA 1.6s ease-in-out infinite reverse;}
@keyframes cgMorphA{0%,100%{transform:translateX(-50%) scaleY(1) rotate(-2deg);
    border-radius:46% 54% 52% 48%/62% 58% 42% 38%;}
  50%{transform:translateX(-50%) scaleY(1.08) rotate(2deg);
    border-radius:54% 46% 48% 52%/68% 52% 48% 32%;}}
@keyframes cgMorphB{0%,100%{transform:translateX(-50%) scaleY(.96) rotate(1.5deg);}
  50%{transform:translateX(-50%) scaleY(1.1) rotate(-2deg);}}

/* 火星（第三幕） */
.cg-ember{position:absolute;z-index:4;border-radius:50%;filter:blur(.4px);opacity:0;
  background:radial-gradient(circle,#ffd9a0,#e06422 60%,rgba(200,60,18,0));
  animation:cgEmber var(--t,3s) linear var(--dl,0s) infinite;}
@keyframes cgEmber{0%{opacity:0;transform:translate(0,0) scale(1);}
  12%{opacity:.9;}70%{opacity:.45;}
  100%{opacity:0;transform:translate(var(--sx,2vmin),-26vh) scale(.2);}}

/* 文字：竖排章节 + 毛笔"写出"（mask 扫描） */
.cg-chap{position:absolute;left:5.5%;top:12%;z-index:8;margin:0;
  writing-mode:vertical-rl;letter-spacing:.42em;
  font-size:clamp(13px,3.4vmin,24px);color:#4c4436;
  -webkit-mask-image:linear-gradient(180deg,#000 44%,transparent 56%);
  -webkit-mask-size:100% 240%;-webkit-mask-position:0 100%;-webkit-mask-repeat:no-repeat;
  mask-image:linear-gradient(180deg,#000 44%,transparent 56%);
  mask-size:100% 240%;mask-position:0 100%;mask-repeat:no-repeat;
  animation:cgVWrite 1.2s ease-out var(--d,0s) forwards;}
@keyframes cgVWrite{from{-webkit-mask-position:0 100%;mask-position:0 100%;}
  to{-webkit-mask-position:0 0;mask-position:0 0;}}

.cg-copy{position:absolute;top:10.5%;left:50%;transform:translateX(-50%);
  width:min(86vw,880px);text-align:center;z-index:7;}
.cg-line{font-size:clamp(16px,4.6vmin,40px);line-height:2.05;color:#2f2a22;margin:0 0 .25em;
  -webkit-mask-image:linear-gradient(90deg,#000 45%,transparent 55%);
  -webkit-mask-size:220% 100%;-webkit-mask-position:100% 0;-webkit-mask-repeat:no-repeat;
  mask-image:linear-gradient(90deg,#000 45%,transparent 55%);
  mask-size:220% 100%;mask-position:100% 0;mask-repeat:no-repeat;
  animation:cgWrite var(--wd,1.05s) ease-out var(--d,0s) forwards;}
@keyframes cgWrite{from{-webkit-mask-position:100% 0;mask-position:100% 0;}
  to{-webkit-mask-position:0 0;mask-position:0 0;}}
.cg-line.big{font-size:clamp(30px,10vmin,84px);font-weight:700;
  letter-spacing:.24em;text-indent:.24em;color:#3a2f22;margin-top:.35em;--wd:1.6s;}
.cg-line.big.fire{color:#bf3a24;} /* 全卷唯一纯朱大字 */

/* "明"大字 + 圣火令红签 */
.cg-ming{display:flex;align-items:flex-end;justify-content:center;gap:1.4vmin;margin:.1em 0 .2em;}
.cg-ming b{font-size:clamp(56px,15vmin,130px);line-height:1.05;font-weight:700;color:#2c2620;
  -webkit-mask-image:linear-gradient(90deg,#000 45%,transparent 55%);
  -webkit-mask-size:220% 100%;-webkit-mask-position:100% 0;-webkit-mask-repeat:no-repeat;
  mask-image:linear-gradient(90deg,#000 45%,transparent 55%);
  mask-size:220% 100%;mask-position:100% 0;mask-repeat:no-repeat;
  animation:cgWrite 1.8s ease-out var(--d,0s) forwards;}
.cg-ming .ling{writing-mode:vertical-rl;font-size:clamp(11px,2.4vmin,18px);letter-spacing:.3em;
  color:#f6efdd;background:#b3352b;padding:.55em .3em;border-radius:2px;
  box-shadow:0 1px 4px rgba(120,30,20,.35);opacity:0;
  animation:cgPop .5s ease-out var(--d,0s) forwards;}
@keyframes cgPop{from{opacity:0;transform:rotate(8deg) translateY(6px);}
  to{opacity:.95;transform:rotate(2deg) translateY(0);}}

/* 五虎名签（木牌式，呼应 5v5） */
.cg-slips{display:flex;justify-content:center;gap:2.6vmin;margin:1em 0 .4em;}
.cg-slips .slip{--r:0deg;position:relative;writing-mode:vertical-rl;
  font-size:clamp(13px,3vmin,24px);letter-spacing:.22em;color:#33291d;
  background:rgba(252,247,233,.75);border:1px solid rgba(70,52,30,.5);
  padding:.7em .28em .55em;border-radius:2px;box-shadow:0 2px 6px rgba(90,64,28,.18);
  opacity:0;animation:cgSlip .55s cubic-bezier(.3,1.4,.5,1) var(--d,0s) forwards;}
.cg-slips .slip::before{content:'';position:absolute;top:.32em;left:50%;
  transform:translateX(-50%);width:.42em;height:.42em;border-radius:50%;
  background:#b3352b;opacity:.85;}
.cg-slips .slip:nth-child(odd){--r:-1.6deg;}
.cg-slips .slip:nth-child(even){--r:1.8deg;}
@keyframes cgSlip{from{opacity:0;transform:translateY(16px) rotate(4deg);}
  to{opacity:.96;transform:translateY(0) rotate(var(--r));}}

/* 落款钤印 */
.cg-seal{width:10vmin;height:10vmin;margin:1.2em 12% 0 auto;
  display:flex;align-items:center;justify-content:center;
  border:.5vmin solid #b3352b;border-radius:4px;color:#b3352b;
  font-size:6.4vmin;font-weight:700;background:rgba(179,53,43,.06);
  filter:url(#cgSeal);opacity:0;transform:scale(2.6) rotate(-16deg);}
.cg-seal.stamp{animation:cgSealIn .5s cubic-bezier(.2,1.3,.4,1) forwards;}
@keyframes cgSealIn{0%{opacity:0;transform:scale(2.6) rotate(-16deg);}
  55%{opacity:.95;transform:scale(.92) rotate(-7deg);}
  100%{opacity:.92;transform:scale(1) rotate(-7deg);}}

/* 跳过 & 提示 */
#cgSkip{position:absolute;top:calc(10px + env(safe-area-inset-top,0px));
  right:calc(12px + env(safe-area-inset-right,0px));z-index:40;opacity:0;
  animation:cgFadeUi .5s ease-out 1.2s both;
  background:rgba(255,252,244,.4);color:rgba(60,48,32,.75);
  border:1px solid rgba(70,52,30,.45);border-radius:999px;
  font-size:clamp(11px,2.6vmin,17px);letter-spacing:.2em;
  padding:.45em 1.1em .45em 1.3em;font-family:inherit;cursor:pointer;}
@keyframes cgFadeUi{to{opacity:1;}}
#cgSkip:hover{color:#2c2113;border-color:#b3352b;}
#cgHint{position:absolute;bottom:5.5%;left:0;right:0;text-align:center;z-index:20;
  font-size:clamp(11px,2.8vmin,22px);letter-spacing:.3em;color:rgba(70,56,38,.9);opacity:0;}
#cgHint.show{animation:cgHintB 2.6s ease-in-out infinite;}
@keyframes cgHintB{0%,100%{opacity:.25;}50%{opacity:.85;}}

/* 降级：减少动态 */
@media (prefers-reduced-motion:reduce){
  #cgScroll{animation-duration:.01s;}
  #cgRod{display:none;}
  #cgFar,#cgNear{transition-duration:.4s;}
  #cgSkip{animation-duration:.01s;animation-delay:0s;}
  .cg-banner b,.cg-flame b,.cg-ember,.cg-mist,.cg-birdfly,.cg-bird,
  #cgOverlay.thump{animation:none;}
  .cg-flame b{transform:translateX(-50%);}
  .cg-ember{display:none;}
}
`;

/* ---------- 引擎 ---------- */
let _active = null;

export function showOpeningCg(onDone) {
    if (_active) return; // 防重入

    if (!document.getElementById('cgInkStyles')) {
        const st = document.createElement('style');
        st.id = 'cgInkStyles';
        st.textContent = STYLE_CSS;
        document.head.appendChild(st);
    }

    const overlay = document.createElement('div');
    overlay.id = 'cgOverlay';
    overlay.innerHTML = `
        <div id="cgScroll">
            <svg width="0" height="0" style="position:absolute" aria-hidden="true">
              <defs>
                <filter id="cgInk" x="-5%" y="-5%" width="110%" height="110%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.011 0.045" numOctaves="3" seed="7" result="n"/>
                  <feDisplacementMap in="SourceGraphic" in2="n" scale="12"/>
                </filter>
                <filter id="cgFire" x="-60%" y="-60%" width="220%" height="220%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.05 0.12" numOctaves="2" seed="3" result="n">
                    <animate attributeName="baseFrequency" values="0.05 0.12;0.07 0.16;0.05 0.12" dur="1.3s" repeatCount="indefinite"/>
                  </feTurbulence>
                  <feDisplacementMap in="SourceGraphic" in2="n" scale="10"/>
                </filter>
                <filter id="cgSeal" x="-15%" y="-15%" width="130%" height="130%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.15" numOctaves="2" seed="11" result="n"/>
                  <feDisplacementMap in="SourceGraphic" in2="n" scale="4"/>
                </filter>
              </defs>
            </svg>
            <div id="cgPaper"></div>
            <div class="cg-world" id="cgFar">
                <div class="cg-mtn fm1"></div>
                <div class="cg-mtn fm2"></div>
                <div class="cg-mist" style="left:8%;bottom:24%;width:60vw;--t:26s;"></div>
                <div class="cg-mist" style="left:42%;bottom:19%;width:44vw;--t:34s;"></div>
            </div>
            <div class="cg-world" id="cgNear"></div>
            <div id="cgRod"></div>
        </div>
        <div id="cgGrain"></div>
        <div id="cgVign"></div>
        <button id="cgSkip" type="button">跳过 ›</button>
        <div id="cgHint"></div>`;
    document.body.appendChild(overlay);

    const near = overlay.querySelector('#cgNear');
    const far = overlay.querySelector('#cgFar');
    const hint = overlay.querySelector('#cgHint');

    const ctx = { overlay, near, far, hint,
                  act: 0, ready: false, done: false, gen: 0, timers: [] };
    _active = ctx;

    /* 定时器统一走 gen 守卫：切幕/结束后，旧幕挂起回调自动作废 */
    function later(ms, fn) {
        const g = ctx.gen;
        const id = setTimeout(function () {
            if (!ctx.done && g === ctx.gen) fn();
        }, ms);
        ctx.timers.push(id);
        return id;
    }

    const el = function (tag, cls, txt) {
        const d = document.createElement(tag);
        if (cls) d.className = cls;
        if (txt != null) d.textContent = txt;
        return d;
    };

    /* --- 布景 --- */
    function buildFlame(sec, opt) {
        const f = el('div', 'cg-flame' + (opt.dim ? ' dim' : ''));
        f.style.left = opt.left;
        f.style.bottom = opt.bottom;
        f.style.setProperty('--fs', opt.fs);
        f.append(el('b', 'f3'), el('b', 'f2'), el('b', 'f1'));
        sec.appendChild(f);
        if (opt.embers) {
            for (let i = 0; i < 9; i++) {
                const e = el('i', 'cg-ember');
                e.style.left = 'calc(' + opt.left + ' + ' + ((Math.random() * 16 - 8) | 0) + 'vmin)';
                e.style.bottom = 'calc(' + opt.bottom + ' + ' + (Math.random() * 8) + 'vmin)';
                const sz = (1.2 + Math.random() * 1.8).toFixed(1);
                e.style.width = sz + 'vmin';
                e.style.height = sz + 'vmin';
                e.style.setProperty('--sx', ((Math.random() * 8 - 4) | 0) + 'vmin');
                e.style.setProperty('--t', (2.4 + Math.random() * 1.8).toFixed(1) + 's');
                e.style.setProperty('--dl', (-Math.random() * 4).toFixed(1) + 's');
                sec.appendChild(e);
            }
        }
    }

    function buildArmy(sec) {
        const box = el('div', 'cg-army');
        ARMY.forEach(function (a, i) {
            const b = el('div', 'cg-banner');
            b.style.setProperty('--x', a.x);
            b.style.setProperty('--y', a.y);
            b.style.setProperty('--h', a.h);
            b.style.setProperty('--s', a.s);
            b.style.setProperty('--d', (UNROLL + 0.35 + i * 0.14).toFixed(2) + 's');
            const flag = el('b', null, a.name);
            flag.style.setProperty('--sw', (2.6 + Math.random() * 1.2).toFixed(1) + 's');
            b.append(el('i'), flag);
            box.appendChild(b);
        });
        sec.appendChild(box);
    }

    function buildBirds(sec) {
        for (let i = 0; i < 4; i++) {
            const w = el('div', 'cg-birdfly');
            w.style.top = (10 + Math.random() * 12) + '%';
            w.style.setProperty('--t', (24 + Math.random() * 14).toFixed(0) + 's');
            w.style.setProperty('--dl', (-Math.random() * 20).toFixed(1) + 's');
            w.appendChild(el('div', 'cg-bird'));
            sec.appendChild(w);
        }
    }

    function buildFarBanners(sec) {
        [['8%', '15%'], ['18%', '24%'], ['27%', '17%'], ['36%', '21%']].forEach(function (p, i) {
            const b = el('div', 'cg-banner');
            b.style.setProperty('--x', p[0]);
            b.style.setProperty('--y', p[1]);
            b.style.setProperty('--h', '8vmin');
            b.style.setProperty('--s', 0.5);
            b.style.setProperty('--d', (PAN + 0.3 + i * 0.12).toFixed(2) + 's');
            b.append(el('i'), el('b', null, '六派'));
            sec.appendChild(b);
        });
    }

    function buildPanel(i) {
        const sec = el('section', 'cg-panel');
        sec.style.left = (i * 100) + 'vw';
        const P = PANEL_POLY[i];
        const mk = function (cls, cp) {
            const d = el('div', 'cg-mtn ' + cls);
            d.style.clipPath = cp;
            sec.appendChild(d);
        };
        mk('m-mid', P.mid);
        if (P.snow) mk('m-snow', P.snow);
        mk('m-near', P.near);
        if (i === 0) {
            buildArmy(sec);
            buildBirds(sec);
            buildFlame(sec, { left: '70%', bottom: '26%', fs: 0.5, dim: true });
        }
        if (i === 2) {
            buildFarBanners(sec);
            buildFlame(sec, { left: '68%', bottom: '27%', fs: 1.5, embers: true });
        }
        return sec;
    }

    /* --- 文案 --- */
    function buildCopy(panel, idx, base) {
        const a = ACTS[idx];
        const chap = el('p', 'cg-chap', a.chapter);
        chap.style.setProperty('--d', (base + 0.1).toFixed(2) + 's');
        panel.appendChild(chap);

        const copy = el('div', 'cg-copy');
        let t = 0.45;
        for (const ln of a.lines) {
            if (ln.ming) {
                const wrap = el('div', 'cg-ming');
                const b = el('b', null, ln.ming);
                b.style.setProperty('--d', (t + 0.3).toFixed(2) + 's');
                const tag = el('span', 'ling', '圣火令');
                tag.style.setProperty('--d', (t + 1.4).toFixed(2) + 's');
                wrap.append(b, tag);
                copy.appendChild(wrap);
                t += 2.1;
            } else if (ln.slips) {
                const row = el('div', 'cg-slips');
                ln.slips.forEach(function (n, k) {
                    const s = el('span', 'slip', n);
                    s.style.setProperty('--d', (t + k * 0.16).toFixed(2) + 's');
                    row.appendChild(s);
                });
                t += 0.16 * ln.slips.length + 0.5;
                copy.appendChild(row);
            } else {
                const wd = ln.big ? 1.6 : 1.05;
                const p = el('p', 'cg-line' + (ln.big ? ' big' : '') + (ln.fire ? ' fire' : ''), ln.t);
                p.style.setProperty('--d', (t + 0.35).toFixed(2) + 's');
                p.style.setProperty('--wd', wd + 's');
                copy.appendChild(p);
                t += 0.35 + wd;
            }
        }
        if (a.seal) copy.appendChild(el('div', 'cg-seal', '明'));
        panel.appendChild(copy);
        return t;
    }

    function setHint(txt) { hint.textContent = txt; hint.classList.add('show'); }
    function clearHint() { hint.classList.remove('show'); }
    function lastHint() {
        return ctx.act === ACTS.length - 1 ? '— 点击 · 出征 —' : '— 点击任意处继续 —';
    }

    function stampSeal() {
        const cur = ctx.near.children[ctx.act];
        if (!cur) return;
        const seal = cur.querySelector('.cg-seal');
        if (!seal || seal.classList.contains('stamp')) return;
        seal.classList.add('stamp');
        overlay.classList.add('thump');
        later(400, function () { overlay.classList.remove('thump'); });
    }

    function gotoAct(i) {
        ctx.act = i;
        ctx.gen++;
        ctx.ready = false;
        clearHint();
        far.style.transform = 'translateX(' + (-i * 50) + 'vw)';
        near.style.transform = 'translateX(' + (-i * 100) + 'vw)';
        const base = PAN + 0.35;
        const dur = buildCopy(ctx.near.children[i], i, base);
        later((base - 0.2) * 1000, function () {
            if (!ctx.ready) setHint('— 点击任意处 · 快进 —');
        });
        later((base + dur + 0.45) * 1000, function () {
            ctx.ready = true;
            setHint(lastHint());
            if (ACTS[i].seal) later(500, stampSeal);
        });
    }

    function fastForward() {
        const sec = ctx.near.children[ctx.act];
        sec.querySelectorAll('.cg-copy *, .cg-chap').forEach(function (n) {
            if (n.style.getPropertyValue('--d')) n.style.setProperty('--d', '0.05s');
            if (n.style.getPropertyValue('--wd')) n.style.setProperty('--wd', '0.3s');
        });
        if (ACTS[ctx.act].seal) stampSeal();
        ctx.ready = true;
        later(420, function () { setHint(lastHint()); });
    }

    function finish() {
        if (ctx.done) return;
        ctx.done = true;
        ctx.gen++;
        ctx.timers.forEach(clearTimeout);
        overlay.classList.add('hide');
        setTimeout(function () {
            window.removeEventListener('keydown', onKey);
            overlay.remove();
            _active = null;
            markOpeningCgDone();
            if (typeof onDone === 'function') onDone();
        }, 950);
    }

    function onKey(e) {
        if (e.key === 'Escape') { finish(); return; }
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); overlay.click(); }
    }
    window.addEventListener('keydown', onKey);

    overlay.addEventListener('click', function () {
        if (ctx.done) return;
        if (!ctx.ready) { fastForward(); return; }
        if (ctx.act < ACTS.length - 1) gotoAct(ctx.act + 1);
        else finish();
    });
    overlay.querySelector('#cgSkip').addEventListener('click', function (e) {
        e.stopPropagation();
        finish();
    });

    /* --- 启动 --- */
    for (let i = 0; i < ACTS.length; i++) near.appendChild(buildPanel(i));
    ctx.gen++;
    const base0 = UNROLL + 0.3;
    const dur0 = buildCopy(near.children[0], 0, base0);
    later((base0 + 1.6) * 1000, function () {
        if (!ctx.ready) setHint('— 点击任意处 · 快进 —');
    });
    later((base0 + dur0 + 0.45) * 1000, function () {
        ctx.ready = true;
        setHint(lastHint());
    });
}