// ui/74opening-cg-shadow.js - 开场CG·皮影戏「光明顶风云」（全新创作，与 72 黑屏 / 73 电影 / 水墨长卷均不同）
// V6.0.0 | 2026-09-09 消化既有三家后另起炉灶：剪影角色动画叙事，非静态布景+文字淡入
// 预估字节数：≈ 28 KB
// 风格：暖黄牛皮纸幕布 / 黑色剪影动态走位（旗队合围→教主登顶→五虎列阵→冲锋决战）/ 圣火为唯一彩色 / 竖排诗句 + 朱红钤印
// 交互：全屏点击=快进/下一幕；右上角「跳过」随时结束；播完或跳过均记 localStorage（独立 key，与 72 互不干扰）
// 集成点：如需接入，61main-5v5-test.js 改一行 import 即可（暂未接入）
export const VER = 'ui/74opening-cg-shadow.js V6.0.0';

const DONE_KEY = 'ming_opening_cg_shadow_done_5v5_test';

export function isOpeningCgDone() {
    try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return true; }
}
export function markOpeningCgDone() {
    try { localStorage.setItem(DONE_KEY, '1'); } catch {}
}
export function resetOpeningCgDone() {
    try { localStorage.removeItem(DONE_KEY); } catch {}
}

/* ---------- 三幕脚本 ---------- */
const ACTS = [
    {
        mood: 'dying',
        poem: '烽烟四合 · 孤峰将倾',
        lines: [
            { t: '六大派会师西域，围光明顶如铁桶。' },
            { t: '山巅圣火将熄——' }
        ]
    },
    {
        mood: 'rising',
        poem: '圣火令出 · 群雄归心',
        lines: [
            { t: '危亡之际，你执圣火令继任教主，' },
            { t: '五虎列阵，共守孤峰。' }
        ]
    },
    {
        mood: 'blazing',
        poem: '鼓角争鸣 · 圣火重燃',
        lines: [
            { t: '拂晓，六派卷土重来。' },
            { t: '教主，点将布阵，迎敌——' }
        ]
    }
];

const BIG_WORDS = { dying: '', rising: '明', blazing: '战' };

/* ---------- 样式 ---------- */
const STYLE_CSS = `
#cgShadowOverlay{position:fixed;inset:0;z-index:100010;overflow:hidden;cursor:pointer;
  background:radial-gradient(circle at 50% 30%,#241a10,#0d0906 78%);
  font-family:'LXGW WenKai','KaiTi','STKaiti','Noto Serif SC',serif;
  -webkit-user-select:none;user-select:none;transition:opacity .9s ease;}
#cgShadowOverlay.hide{opacity:0;pointer-events:none;}
#cgShadowOverlay.thump{animation:cgThump .35s ease-out;}
@keyframes cgThump{30%{transform:translate(1px,3px);}60%{transform:translate(-1px,-1px);}}

/* ---- 皮影幕布 ---- */
#shadowStage{position:absolute;left:3vmin;right:3vmin;top:5vmin;bottom:5vmin;overflow:hidden;
  border-radius:1.2vmin;
  background:radial-gradient(120% 90% at 50% -8%,#f7e3ac,#e2bc72 46%,#c69a4e 76%,#a87f35);
  box-shadow:inset 0 0 14vmin rgba(74,44,12,.5),inset 0 0 3vmin rgba(90,55,15,.35),0 0 5vmin rgba(0,0,0,.65);
  -webkit-user-select:none;user-select:none;}
#shadowStage::before{content:'';position:absolute;inset:0;z-index:60;pointer-events:none;
  background:radial-gradient(130% 110% at 50% 18%,transparent 46%,rgba(84,50,14,.28) 88%,rgba(60,34,8,.5));
  box-shadow:inset 0 0 8vmin rgba(80,46,12,.35);}
#shadowStage::after{content:'';position:absolute;inset:0;z-index:61;pointer-events:none;opacity:.5;
  background-image:radial-gradient(rgba(90,55,15,.09) 1px,transparent 1.3px);background-size:4px 4px;}

/* 顶部灯晕 */
#shadowLamp{position:absolute;left:50%;top:-14vmin;transform:translateX(-50%);z-index:1;
  width:90vmin;height:34vmin;border-radius:50%;pointer-events:none;
  background:radial-gradient(ellipse at center,rgba(255,246,214,.9),rgba(255,236,180,.4) 55%,transparent 75%);}

/* 月 */
#shadowMoon{position:absolute;left:9%;top:8%;z-index:2;width:7vmin;height:7vmin;border-radius:50%;
  background:radial-gradient(circle at 38% 34%,#fdf3cf,#e8cf8f 70%,#c9ab64);
  box-shadow:0 0 4vmin rgba(255,235,170,.55);opacity:0;}
.scene.active #shadowMoon{animation:cgMoonIn 1.6s ease-out .2s forwards;}
@keyframes cgMoonIn{to{opacity:.95;}}

/* 皮影山（多层黑剪影，靠下） */
.mtn{position:absolute;left:-2%;right:-2%;bottom:0;background:#2b1d0b;z-index:3;}
.mtn.m1{height:30%;clip-path:polygon(0 100%,0 52%,6% 66%,14% 40%,24% 62%,34% 30%,45% 58%,56% 26%,66% 54%,76% 36%,86% 62%,94% 44%,100% 58%,100% 100%);}
.mtn.m2{height:18%;background:#241608;z-index:6;clip-path:polygon(0 100%,0 70%,10% 84%,20% 62%,32% 80%,44% 58%,56% 78%,66% 60%,78% 80%,90% 64%,100% 76%,100% 100%);}
.mtn.m3{height:10%;background:#1c1006;z-index:9;clip-path:polygon(0 100%,0 80%,14% 92%,28% 74%,44% 90%,58% 72%,72% 88%,86% 76%,100% 86%,100% 100%);}

/* 云（半透明棕） */
.cloud{position:absolute;z-index:4;height:6vmin;border-radius:50%;background:rgba(84,54,20,.5);
  filter:blur(6px);opacity:0;animation:cgCloudDrift var(--t,26s) ease-in-out infinite alternate;}
.scene.active .cloud{animation:cgCloudIn 2.2s ease-out .5s forwards,cgCloudDrift var(--t,26s) ease-in-out 2.2s infinite alternate;}
@keyframes cgCloudIn{to{opacity:.8;}}
@keyframes cgCloudDrift{from{transform:translateX(-3vw);}to{transform:translateX(4vw);}}

/* ---- 皮影小人（纯 CSS 剪影） ---- */
.fig{position:absolute;z-index:7;background:#2a1d0c;filter:drop-shadow(0 .4vmin .3vmin rgba(0,0,0,.25));
  width:3.4vmin;height:11vmin;}
.fig .head{position:absolute;top:0;left:50%;transform:translateX(-50%);width:2.6vmin;height:2.6vmin;border-radius:50%;background:#2a1d0c;}
.fig .body{position:absolute;top:2.6vmin;left:50%;transform:translateX(-50%);width:3.4vmin;height:4.4vmin;
  background:#2a1d0c;border-radius:1.7vmin 1.7vmin .5vmin .5vmin;}
.fig .leg{position:absolute;top:7vmin;width:1.3vmin;height:3.8vmin;background:#2a1d0c;border-radius:1vmin;
  transform-origin:top center;}
.fig .leg.l{left:50%;margin-left:-1.5vmin;animation:figWalk .4s ease-in-out infinite alternate;}
.fig .leg.r{left:50%;margin-left:.2vmin;animation:figWalk .4s ease-in-out infinite alternate-reverse;}
@keyframes figWalk{from{transform:rotate(16deg);}to{transform:rotate(-16deg);}}
.fig .arm{position:absolute;top:3.2vmin;left:50%;width:3vmin;height:.8vmin;background:#2a1d0c;border-radius:1vmin;
  transform-origin:left center;animation:armSwing .5s ease-in-out infinite alternate;}
@keyframes armSwing{from{transform:rotate(-24deg);}to{transform:rotate(24deg);}}
.fig.walkL{animation:figMarchL var(--w,.6s) linear var(--dl,0s) infinite alternate;}
.fig.walkR{animation:figMarchR var(--w,.6s) linear var(--dl,0s) infinite alternate;}
@keyframes figMarchL{from{transform:translateX(0);}to{transform:translateX(-1.6vmin);}}
@keyframes figMarchR{from{transform:translateX(0);}to{transform:translateX(1.6vmin);}}

/* 旗手：小人 + 旗杆 + 三角旗 */
.bearer{position:absolute;bottom:var(--by,14%);z-index:7;opacity:0;}
.scene.active .bearer{animation:cgBearIn .7s ease-out var(--d,0s) forwards;}
@keyframes cgBearIn{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:translateY(0);}}
.bearer .pole{position:absolute;left:2.4vmin;top:-9vmin;width:.6vmin;height:11vmin;background:#241708;border-radius:1px;}
.bearer .flag{position:absolute;left:2.9vmin;top:-9.6vmin;width:5vmin;height:3.6vmin;background:#221505;
  clip-path:polygon(0 0,100% 0,82% 50%,100% 100%,0 100%);transform-origin:left center;
  display:flex;align-items:center;justify-content:center;
  writing-mode:vertical-rl;font-size:clamp(8px,1.7vmin,12px);color:#d9c190;letter-spacing:.1em;
  padding:.2em 0;box-sizing:border-box;
  animation:cgFlagW .8s ease-in-out infinite alternate;}
@keyframes cgFlagW{from{transform:skewY(0);}to{transform:skewY(-5deg);}}
.bearer .fig{left:1.4vmin;bottom:0;}

/* 六大派队伍（第一幕：两侧列队合围） */
.armyL{position:absolute;left:0;bottom:12%;z-index:7;opacity:0;
  animation:cgMarchInL 2.6s cubic-bezier(.3,.05,.4,1) .4s forwards;}
@keyframes cgMarchInL{from{transform:translateX(-46vw);opacity:0;}to{transform:translateX(0);opacity:1;}}
.armyR{position:absolute;right:0;bottom:12%;z-index:7;opacity:0;
  animation:cgMarchInR 2.6s cubic-bezier(.3,.05,.4,1) .4s forwards;}
@keyframes cgMarchInR{from{transform:translateX(46vw);opacity:0;}to{transform:translateX(0);opacity:1;}}
.armyL .bearer{--by:14%;}
.armyR .bearer{--by:14%;}
.armyR .bearer .fig{animation-direction:reverse;}

/* 教主剪影（第二幕：自山脚升上山顶） */
#shadowLeader{position:absolute;left:50%;bottom:30%;transform:translateX(-50%);z-index:10;opacity:0;}
.scene.active #shadowLeader{animation:cgLeaderRise 1.9s cubic-bezier(.22,.8,.3,1) .6s forwards;}
@keyframes cgLeaderRise{from{opacity:0;transform:translate(-50%,9vmin);}to{opacity:1;transform:translate(-50%,0);}}
#shadowLeader .fig{width:8vmin;height:14vmin;}
#shadowLeader .fig .head{width:4.4vmin;height:4.4vmin;}
#shadowLeader .fig .body{top:4.4vmin;width:6.6vmin;height:7.6vmin;border-radius:3.3vmin 3.3vmin 1vmin 1vmin;}
#shadowLeader .fig .cape{position:absolute;top:3vmin;left:50%;transform:translateX(-50%);
  width:9vmin;height:11vmin;background:#1d1206;
  clip-path:polygon(0 0,100% 0,100% 100%,50% 72%,0 100%);}
#shadowLeader .fig .arm{top:5.6vmin;width:6vmin;height:1vmin;animation:none;}
#shadowLeader .fig .leg{top:12vmin;height:4.6vmin;animation:none;}
#shadowLeader .fig .leg.l{transform:rotate(8deg);}
#shadowLeader .fig .leg.r{transform:rotate(-8deg);}

/* 圣火令（教主手中红光） */
#shadowLing{position:absolute;left:50%;bottom:35%;transform:translateX(-50%);z-index:11;width:2vmin;height:7vmin;
  background:linear-gradient(90deg,#7a1f14,#d84a2a 50%,#7a1f14);opacity:0;
  animation:cgLingIn .8s ease-out 1.9s forwards,cgLingGlow 1.6s ease-in-out 2.2s infinite;}
@keyframes cgLingIn{to{opacity:.95;}}
@keyframes cgLingGlow{0%,100%{box-shadow:0 0 1vmin rgba(255,120,40,.5);}50%{box-shadow:0 0 2.6vmin rgba(255,150,60,.9);}}

/* 五虎将（第二幕：山腰列阵，小号剪影） */
.heroRow{position:absolute;left:50%;bottom:22%;transform:translateX(-50%);z-index:8;
  display:flex;gap:4vmin;align-items:flex-end;opacity:0;}
.scene.active .heroRow{animation:cgHeroRowIn 1.4s cubic-bezier(.3,1.2,.5,1) 1.1s forwards;}
@keyframes cgHeroRowIn{from{opacity:0;transform:translate(-50%,4vmin);}to{opacity:1;transform:translate(-50%,0);}}
.heroRow .fig{position:relative;width:4.6vmin;height:9vmin;}
.heroRow .name{position:absolute;bottom:-2.4em;left:50%;transform:translateX(-50%);
  font-size:clamp(10px,2.2vmin,16px);color:#5a4020;white-space:nowrap;letter-spacing:.14em;font-weight:700;}
.heroRow .fig .head{width:3vmin;height:3vmin;}
.heroRow .fig .body{top:3vmin;width:4vmin;height:5vmin;}
.heroRow .fig .leg{top:8vmin;height:3vmin;animation:none;}
.heroRow .fig .leg.l{transform:rotate(10deg);}
.heroRow .fig .leg.r{transform:rotate(-10deg);}
.heroRow .fig .arm{animation:none;}

/* 冲锋（第三幕：两排交错跑过） */
.chargeL{position:absolute;left:0;bottom:16%;z-index:7;opacity:0;
  animation:cgChargeL 3s linear var(--dl,.5s) infinite;}
@keyframes cgChargeL{0%{transform:translateX(-46vw);opacity:0;}8%{opacity:1;}92%{opacity:1;}100%{transform:translateX(46vw);opacity:0;}}
.chargeR{position:absolute;right:0;bottom:16%;z-index:7;opacity:0;
  animation:cgChargeR 3.2s linear var(--dl,.8s) infinite;}
@keyframes cgChargeR{0%{transform:translateX(46vw);opacity:0;}8%{opacity:1;}92%{opacity:1;}100%{transform:translateX(-46vw);opacity:0;}}

/* 箭矢 */
.arrow{position:absolute;z-index:8;width:7vmin;height:.38vmin;background:#241708;border-radius:2px;
  opacity:0;transform-origin:right center;
  animation:cgArrowFly var(--w,1.1s) linear var(--dl,0s) infinite;}
@keyframes cgArrowFly{0%{opacity:0;transform:translate(0,0) rotate(var(--ang,-14deg));}
  12%{opacity:.95;}85%{opacity:.8;}100%{opacity:0;transform:translate(var(--dx,52vw),var(--dy,4vmin)) rotate(var(--ang,-14deg));}}

/* ---- 圣火（幕布上唯一色彩） ---- */
.sacred-fire{position:absolute;left:50%;bottom:38%;transform:translateX(-50%);z-index:5;
  width:13vmin;height:18vmin;pointer-events:none;}
.sacred-fire .halo{position:absolute;left:50%;top:56%;transform:translate(-50%,-50%);
  width:30vmin;height:20vmin;border-radius:50%;
  background:radial-gradient(ellipse,rgba(255,150,50,.55),transparent 68%);filter:blur(9px);
  animation:fireHalo 1.6s ease-in-out infinite;}
@keyframes fireHalo{0%,100%{opacity:.75;}50%{opacity:1;}}
.sacred-fire .core{position:absolute;left:50%;bottom:0;transform:translateX(-50%);
  width:9vmin;height:14vmin;border-radius:50% 50% 46% 54%/66% 62% 38% 34%;
  background:radial-gradient(circle at 50% 74%,#ffe9b0,#ff9c3f 52%,rgba(255,120,30,0) 78%);
  filter:blur(1px);animation:fireDance 1.1s ease-in-out infinite;}
@keyframes fireDance{0%,100%{transform:translateX(-50%) scaleY(1) rotate(-2deg);}
  50%{transform:translateX(-50%) scaleY(1.12) rotate(2deg);}}
.sacred-fire.dying{opacity:.62;transform:translateX(-50%) scale(.55);
  animation:fireDim 1.7s ease-in-out infinite;}
.sacred-fire.dying .halo{animation:none;opacity:.5;}
.sacred-fire.dying .core{animation:fireDance 1.5s ease-in-out infinite;}
@keyframes fireDim{0%,100%{opacity:.62;}45%{opacity:.34;}70%{opacity:.55;}}

/* ---- 文字区（竖排诗句 + 大字） ---- */
#shadowWords{position:absolute;left:6%;top:12%;z-index:20;margin:0;pointer-events:none;
  writing-mode:vertical-rl;letter-spacing:.4em;color:#3a2a12;
  font-size:clamp(14px,3.6vmin,26px);font-weight:700;
  -webkit-mask-image:linear-gradient(180deg,#000 44%,transparent 56%);
  -webkit-mask-size:100% 240%;-webkit-mask-position:0 100%;-webkit-mask-repeat:no-repeat;
  mask-image:linear-gradient(180deg,#000 44%,transparent 56%);
  mask-size:100% 240%;mask-position:0 100%;mask-repeat:no-repeat;
  animation:cgShadowWrite 1.3s ease-out var(--d,0s) forwards;
  text-shadow:0 1px 2px rgba(255,244,214,.4);}
@keyframes cgShadowWrite{from{-webkit-mask-position:0 100%;mask-position:0 100%;}
  to{-webkit-mask-position:0 0;mask-position:0 0;}}

#shadowBig{position:absolute;right:10%;top:20%;z-index:20;margin:0;pointer-events:none;
  writing-mode:vertical-rl;font-size:clamp(64px,17vmin,150px);line-height:1.05;font-weight:700;
  color:#8f2a1c;text-shadow:0 0 3vmin rgba(179,53,43,.4),0 2px 3px rgba(255,244,214,.35);
  opacity:0;animation:cgShadowBigIn 1.8s cubic-bezier(.22,.8,.3,1) var(--d,0s) forwards;}
@keyframes cgShadowBigIn{from{opacity:0;transform:scale(1.5) rotate(3deg);filter:blur(8px);}
  to{opacity:.96;transform:scale(1) rotate(0);filter:blur(0);}}

/* 朱红钤印 */
#shadowSeal{position:absolute;right:8%;bottom:12%;z-index:20;width:9vmin;height:9vmin;
  display:flex;align-items:center;justify-content:center;
  border:.5vmin solid #a3331f;border-radius:.8vmin;color:#a3331f;
  font-size:5.6vmin;font-weight:700;background:rgba(179,53,43,.08);
  opacity:0;transform:scale(2.4) rotate(-14deg);}
#shadowSeal.stamp{animation:cgShadowSealIn .5s cubic-bezier(.2,1.3,.4,1) forwards;}
@keyframes cgShadowSealIn{0%{opacity:0;transform:scale(2.4) rotate(-14deg);}
  55%{opacity:.96;transform:scale(.94) rotate(-5deg);}
  100%{opacity:.92;transform:scale(1) rotate(-5deg);}}

/* 幕间淡出 */
.scene{position:absolute;inset:0;z-index:2;opacity:0;pointer-events:none;transition:opacity .8s ease;}
.scene.active{opacity:1;}

/* ---- 跳过 & 提示（暖色调适配） ---- */
#cgShadowSkip{position:absolute;top:calc(10px + env(safe-area-inset-top,0px));
  right:calc(12px + env(safe-area-inset-right,0px));z-index:40;opacity:0;
  animation:cgShadowUi .5s ease-out 1.2s both;
  background:rgba(58,40,16,.18);color:rgba(58,40,16,.8);
  border:1px solid rgba(58,40,16,.45);border-radius:999px;
  font-size:clamp(11px,2.6vmin,17px);letter-spacing:.2em;
  padding:.45em 1.1em .45em 1.3em;font-family:inherit;cursor:pointer;}
@keyframes cgShadowUi{to{opacity:1;}}
#cgShadowSkip:hover{color:#2c1e0a;border-color:#a3331f;}
#cgShadowHint{position:absolute;bottom:6%;left:0;right:0;text-align:center;z-index:40;
  font-size:clamp(11px,2.8vmin,22px);letter-spacing:.3em;color:rgba(58,40,16,.85);opacity:0;}
#cgShadowHint.show{animation:cgShadowHintB 2.6s ease-in-out infinite;}
@keyframes cgShadowHintB{0%,100%{opacity:.25;}50%{opacity:.8;}}

/* 降级：减少动态 */
@media (prefers-reduced-motion:reduce){
  #cgShadowOverlay.thump,.fig .leg,.fig .arm,
  .bearer .flag,.sacred-fire,.cloud,.arrow{animation:none;}
  #shadowLamp,#shadowMoon{display:none;}
  .armyL,.armyR{animation-duration:.4s;}
  .chargeL,.chargeR{animation:none;opacity:0;}
}
`;

/* ---------- 引擎 ---------- */
let _active = null;

export function showOpeningCg(onDone) {
    if (_active) return; // 防重入

    if (!document.getElementById('cgShadowStyles')) {
        const st = document.createElement('style');
        st.id = 'cgShadowStyles';
        st.textContent = STYLE_CSS;
        document.head.appendChild(st);
    }

    const overlay = document.createElement('div');
    overlay.id = 'cgShadowOverlay';
    overlay.innerHTML = `
        <div id="shadowStage">
            <div id="shadowLamp"></div>
            <div class="mtn m1"></div>
            <div class="mtn m2"></div>
            <div class="mtn m3"></div>
            <div class="cloud" style="left:14%;top:20%;width:22vmin;--t:24s;"></div>
            <div class="cloud" style="left:52%;top:14%;width:30vmin;--t:31s;"></div>
            <div id="shadowMoon"></div>
            <div class="scene" id="shadowScene0"></div>
            <div class="scene" id="shadowScene1"></div>
            <div class="scene" id="shadowScene2"></div>
            <div class="sacred-fire" id="shadowFire"></div>
            <p id="shadowWords"></p>
            <p id="shadowBig"></p>
            <div id="shadowSeal">明</div>
        </div>
        <button id="cgShadowSkip" type="button">跳过 ›</button>
        <div id="cgShadowHint"></div>
    `;
    document.body.appendChild(overlay);

    const hint = overlay.querySelector('#cgShadowHint');
    const words = overlay.querySelector('#shadowWords');
    const big = overlay.querySelector('#shadowBig');
    const seal = overlay.querySelector('#shadowSeal');
    const fire = overlay.querySelector('#shadowFire');

    const ctx = { overlay, hint, words, big, seal, fire,
                  act: 0, ready: false, done: false, gen: 0, timers: [] };
    _active = ctx;

    /* 定时器统一走 gen 守卫 */
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

    /* --- 剪影小人 --- */
    function buildFig(leader) {
        const f = el('div', 'fig');
        f.append(el('div', 'head'), el('div', 'body'),
                 el('div', 'leg l'), el('div', 'leg r'), el('div', 'arm'));
        if (leader) f.append(el('div', 'cape'));
        return f;
    }

    /* --- 旗手 --- */
    function buildBearer(name) {
        const b = el('div', 'bearer');
        b.append(el('div', 'pole'), el('div', 'flag', name), buildFig());
        return b;
    }

    /* --- 第一幕：六大派列队合围 --- */
    function buildScene0(sec) {
        const armyL = el('div', 'armyL');
        const armyR = el('div', 'armyR');
        const names = ['少林', '武当', '峨嵋', '华山', '崆峒', '昆仑'];
        names.forEach(function (n, i) {
            const b = buildBearer(n);
            b.style.setProperty('--d', (0.3 + i * 0.28).toFixed(2) + 's');
            (i < 3 ? armyL : armyR).appendChild(b);
        });
        sec.appendChild(armyL);
        sec.appendChild(armyR);
    }

    /* --- 第二幕：教主登顶 + 五虎列阵 --- */
    function buildScene1(sec) {
        const leader = el('div');
        leader.id = 'shadowLeader';
        leader.appendChild(buildFig('leader'));
        sec.appendChild(leader);

        const ling = el('div');
        ling.id = 'shadowLing';
        sec.appendChild(ling);

        const row = el('div', 'heroRow');
        ['张无忌', '杨逍', '韦一笑', '殷天正', '谢逊'].forEach(function (n) {
            const wrap = buildFig();
            wrap.classList.add('hero');
            wrap.appendChild(el('div', 'name', n));
            row.appendChild(wrap);
        });
        sec.appendChild(row);
    }

    /* --- 第三幕：冲锋 + 箭矢 --- */
    function buildScene2(sec) {
        [0, 1, 2].forEach(function (i) {
            const cL = el('div', 'chargeL');
            const cR = el('div', 'chargeR');
            cL.style.setProperty('--dl', (i * 0.7).toFixed(1) + 's');
            cR.style.setProperty('--dl', (i * 0.7 + 0.3).toFixed(1) + 's');
            cL.appendChild(buildFig());
            cR.appendChild(buildFig());
            sec.appendChild(cL);
            sec.appendChild(cR);
        });
        for (let i = 0; i < 5; i++) {
            const a = el('div', 'arrow');
            a.style.left = (6 + Math.random() * 20) + '%';
            a.style.top = (14 + Math.random() * 34) + '%';
            a.style.setProperty('--ang', (-8 - Math.random() * 12).toFixed(1) + 'deg');
            a.style.setProperty('--dx', '46vw');
            a.style.setProperty('--dy', (2 + Math.random() * 6).toFixed(1) + 'vmin');
            a.style.setProperty('--w', (0.9 + Math.random() * 0.6).toFixed(2) + 's');
            a.style.setProperty('--dl', (Math.random() * 1.2).toFixed(2) + 's');
            sec.appendChild(a);
        }
    }

    const scenes = [buildScene0, buildScene1, buildScene2];

    function setHint(txt) { hint.textContent = txt; hint.classList.add('show'); }
    function clearHint() { hint.classList.remove('show'); }
    function lastHint() { return ctx.act === ACTS.length - 1 ? '— 点击 · 出征 —' : '— 点击任意处继续 —'; }

    function stampSeal() {
        if (seal.classList.contains('stamp')) return;
        seal.classList.add('stamp');
        overlay.classList.add('thump');
        later(400, function () { overlay.classList.remove('thump'); });
    }

    function renderAct(idx) {
        const a = ACTS[idx];
        ctx.act = idx;
        ctx.ready = false;
        clearHint();

        /* 幕切换 */
        for (let i = 0; i < scenes.length; i++) {
            overlay.querySelector('#shadowScene' + i).classList.toggle('active', i === idx);
        }

        /* 圣火状态 */
        fire.className = 'sacred-fire' + (a.mood === 'dying' ? ' dying' : '');

        /* 文字 */
        words.textContent = a.poem;
        words.style.setProperty('--d', '0.5s');
        words.style.animation = 'none';
        void words.offsetWidth;
        words.style.animation = '';

        big.textContent = BIG_WORDS[idx];
        if (big.textContent) {
            big.style.setProperty('--d', (1.2 + ACTS[idx].lines.length * 0.1).toFixed(2) + 's');
            big.style.animation = 'none';
            void big.offsetWidth;
            big.style.animation = '';
        } else {
            big.style.animation = 'none';
            big.style.opacity = '0';
        }

        if (idx === ACTS.length - 1) {
            seal.classList.remove('stamp');
            later((2.4 + a.lines.length) * 1000, stampSeal);
        }

        const dur = 2.6 + a.lines.length * 1.1;
        later((dur * 0.55) * 1000, function () {
            if (!ctx.ready) setHint('— 点击任意处 · 快进 —');
        });
        later((dur + 0.5) * 1000, function () {
            ctx.ready = true;
            setHint(lastHint());
        });
    }

    function fastForward() {
        words.style.animation = 'none';
        words.style.setProperty('--d', '0.05s');
        void words.offsetWidth;
        words.style.animation = '';
        if (big.textContent) {
            big.style.animation = 'none';
            big.style.setProperty('--d', '0.1s');
            void big.offsetWidth;
            big.style.animation = '';
        }
        if (ctx.act === ACTS.length - 1) stampSeal();
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
        if (ctx.act < ACTS.length - 1) { ctx.gen++; renderAct(ctx.act + 1); }
        else finish();
    });
    overlay.querySelector('#cgShadowSkip').addEventListener('click', function (e) {
        e.stopPropagation();
        finish();
    });

    /* 启动：预建三幕布景 */
    for (let i = 0; i < scenes.length; i++) {
        scenes[i](overlay.querySelector('#shadowScene' + i));
    }
    renderAct(0);
}