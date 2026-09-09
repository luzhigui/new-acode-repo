// ui/74opening-cg-shadow.js - 开场CG·皮影戏「光明顶风云」（重制版：真皮影味）
// V6.0.1 | 2026-09-09 重制：暗场+亮幕戏台 / 镂空雕刻 / 关节铰接 / 操纵杆 / 侧脸头饰
// 与画卷本质区分：画卷=整幅纸面；皮影=暗场中央亮幕、小人被杆挑着动
// 预估字节数：≈ 34 KB
// 交互：全屏点击=快进/下一幕；右上角「跳过」随时结束；播完或跳过均记 localStorage（独立 key）
// 集成点：如需接入，61main-5v5-test.js 改一行 import 即可（暂未接入）
export const VER = 'ui/74opening-cg-shadow.js V6.0.1';

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
        board: '烽烟四合 · 孤峰将倾',
        lines: [
            { t: '六大派会师西域，围光明顶如铁桶。' },
            { t: '山巅圣火将熄——' }
        ]
    },
    {
        mood: 'rising',
        board: '圣火令出 · 群雄归心',
        lines: [
            { t: '危亡之际，你执圣火令继任教主，' },
            { t: '五虎列阵，共守孤峰。' }
        ]
    },
    {
        mood: 'blazing',
        board: '鼓角争鸣 · 圣火重燃',
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
  background:radial-gradient(circle at 50% 42%,#2c1f12,#0a0706 72%);
  font-family:'LXGW WenKai','KaiTi','STKaiti','Noto Serif SC',serif;
  -webkit-user-select:none;user-select:none;transition:opacity .9s ease;}
#cgShadowOverlay.hide{opacity:0;pointer-events:none;}
#cgShadowOverlay.thump{animation:cgThump .35s ease-out;}
@keyframes cgThump{30%{transform:translate(1px,3px);}60%{transform:translate(-1px,-1px);}}

/* ---- 戏台：暗场中一块亮幕 ---- */
#shadowStage{position:absolute;left:9%;right:9%;top:9%;bottom:7%;overflow:hidden;
  background:radial-gradient(115% 105% at 50% 40%,#f8e6b4,#e6c07a 52%,#c0934a 82%,#8a6528);
  box-shadow:0 0 0 .7vmin #3a2814,0 0 0 1.5vmin #201308,0 0 9vmin rgba(0,0,0,.85);
  -webkit-user-select:none;user-select:none;}
/* 亮幕布纹（半透竖织纹 + 四周焦化） */
#shadowStage::before{content:'';position:absolute;inset:0;z-index:61;pointer-events:none;
  background:repeating-linear-gradient(90deg,rgba(74,44,12,.045) 0 2px,transparent 2px 9px);
  box-shadow:inset 0 0 9vmin rgba(66,38,8,.4),inset 0 0 2vmin rgba(66,38,8,.3);}
/* 灯光中心 */
#shadowLamp{position:absolute;left:50%;top:-16vmin;transform:translateX(-50%);z-index:1;
  width:80vmin;height:36vmin;border-radius:50%;pointer-events:none;
  background:radial-gradient(ellipse at center,rgba(255,248,222,.95),rgba(255,238,186,.45) 55%,transparent 78%);
  animation:cgLampGlow 2.6s ease-in-out infinite;}
@keyframes cgLampGlow{0%,100%{opacity:.85;}50%{opacity:1;}}

/* 戏台框：顶檐 / 左右幕帘 / 台沿 */
#shadowEave{position:absolute;top:-1.4vmin;left:-1.4vmin;right:-1.4vmin;height:2.6vmin;z-index:50;
  background:linear-gradient(#66421e,#3a2814 60%,#241708);border-radius:.4vmin;
  box-shadow:0 .5vmin .8vmin rgba(0,0,0,.55);}
#shadowEave::after{content:'';position:absolute;left:50%;top:100%;transform:translateX(-50%);
  width:18vmin;height:.8vmin;background:linear-gradient(#8a5a26,#4a2c14);}
.curtain{position:absolute;top:0;bottom:0;width:7vmin;z-index:48;
  background:linear-gradient(90deg,#5a3416,#2c1a0a 82%);opacity:.94;}
.curtain.l{left:0;border-right:1px solid rgba(120,70,25,.6);}
.curtain.r{right:0;border-left:1px solid rgba(120,70,25,.6);}
#shadowApron{position:absolute;bottom:-1.2vmin;left:-1.4vmin;right:-1.4vmin;height:2.2vmin;z-index:49;
  background:linear-gradient(#3a2814,#241708 70%);border-radius:.3vmin;
  box-shadow:0 -.4vmin .8vmin rgba(0,0,0,.5);}

/* 戏台匾额（顶部题字） */
#shadowBoard{position:absolute;top:2.2vmin;left:0;right:0;z-index:20;margin:0;text-align:center;
  color:#7a4a1a;font-size:clamp(15px,3.4vmin,26px);font-weight:700;letter-spacing:.35em;text-indent:.35em;
  text-shadow:0 1px 2px rgba(255,246,214,.55);opacity:0;
  animation:cgBoardIn 1s ease-out var(--d,0s) forwards;}
@keyframes cgBoardIn{from{opacity:0;transform:translateY(-1.2vmin);}to{opacity:1;transform:translateY(0);}}

/* ---- 皮影道具：镂空雕刻风 ---- */
/* 山：深色雕版，内部挖亮色镂空孔 */
.mtn{position:absolute;left:-2%;right:-2%;bottom:0;background:#2b1d0b;z-index:3;}
.mtn .pore{position:absolute;background:#d9b06a;border-radius:50%;opacity:.8;filter:blur(.5px);}
.mtn.m1{height:26%;clip-path:polygon(0 100%,0 52%,6% 66%,14% 40%,24% 62%,34% 30%,45% 58%,56% 26%,66% 54%,76% 36%,86% 62%,94% 44%,100% 58%,100% 100%);}
.mtn.m2{height:15%;background:#241608;z-index:6;clip-path:polygon(0 100%,0 70%,10% 84%,20% 62%,32% 80%,44% 58%,56% 78%,66% 60%,78% 80%,90% 64%,100% 76%,100% 100%);}
.mtn.m3{height:9%;background:#1c1006;z-index:9;clip-path:polygon(0 100%,0 80%,14% 92%,28% 74%,44% 90%,58% 72%,72% 88%,86% 76%,100% 86%,100% 100%);}

/* 云：镂空月牙刻 */
.cloud{position:absolute;z-index:4;height:5vmin;border-radius:50%;opacity:0;
  filter:drop-shadow(0 0 1px rgba(80,45,12,.35));}
.cloud .cb{position:absolute;inset:0;border-radius:50%;background:rgba(84,54,20,.5);}
.cloud .hole{position:absolute;background:#e6c07a;border-radius:50%;filter:blur(.6px);opacity:.85;}
.scene.active .cloud{animation:cgCloudIn 2.2s ease-out .5s forwards,cgCloudDrift var(--t,26s) ease-in-out 2.2s infinite alternate;}
@keyframes cgCloudIn{to{opacity:.8;}}
@keyframes cgCloudDrift{from{transform:translateX(-3vw);}to{transform:translateX(4vw);}}

/* ---- 皮影小人：侧脸 + 头饰 + 镂空 + 关节 + 操纵杆 ---- */
.puppet{position:absolute;z-index:7;width:5vmin;height:13.5vmin;
  filter:drop-shadow(0 .5vmin .4vmin rgba(50,25,5,.28));
  animation:puppetJiggle .85s ease-in-out infinite;}
@keyframes puppetJiggle{0%,100%{transform:translateY(0) rotate(-.7deg);}22%{transform:translateY(-1.25vmin) rotate(.6deg);}32%{transform:translateY(-.4vmin) rotate(.4deg);}55%{transform:translateY(-1.35vmin) rotate(.7deg);}68%{transform:translateY(-.3vmin) rotate(-.3deg);}}
.puppet *{position:absolute;background:#241709;}

/* 发髻/头冠 */
.puppet .hair{left:1.15vmin;top:-.5vmin;width:2.8vmin;height:2.2vmin;border-radius:60% 60% 40% 40% / 80% 80% 20% 20%;}
.puppet .hair::after{content:'';position:absolute;left:50%;top:-.7vmin;transform:translateX(-50%);
  width:.7vmin;height:.7vmin;border-radius:50%;background:#1c1006;}

/* 侧脸（朝右）：额头→鼻→唇→下巴 */
.puppet .head{left:.9vmin;top:.4vmin;width:3.4vmin;height:3.8vmin;
  clip-path:polygon(40% 0,74% 2%,90% 8%,100% 26%,94% 38%,100% 52%,92% 66%,84% 74%,82% 88%,58% 100%,34% 98%,24% 84%,16% 66%,20% 44%,10% 26%,24% 12%);
  background:#241709;}

/* 镂空眼：亮幕色挖洞 */
.puppet .eye{left:1.85vmin;top:1.45vmin;width:1.1vmin;height:.75vmin;border-radius:50%;
  background:#fff6d8;box-shadow:0 0 .7vmin #ffe9a8,0 0 1.4vmin rgba(255,240,170,.85);}

/* 躯干：袍子 + 甲片镂空 */
.puppet .torso{left:.35vmin;top:3.9vmin;width:4.3vmin;height:5.6vmin;
  clip-path:polygon(0 0,100% 0,92% 100%,50% 88%,8% 100%);
  background:
    radial-gradient(circle at 28% 32%,#ffedb0 0 9%,transparent 10%),
    radial-gradient(circle at 72% 32%,#ffedb0 0 9%,transparent 10%),
    radial-gradient(circle at 28% 50%,#ffedb0 0 7%,transparent 8%),
    radial-gradient(circle at 72% 50%,#ffedb0 0 7%,transparent 8%),
    radial-gradient(circle at 50% 68%,#ffedb0 0 6%,transparent 7%),
    #241709;}
.puppet .belt{left:.35vmin;top:6.4vmin;width:4.3vmin;height:1vmin;background:#1c1006;}
.puppet .slot{left:50%;transform:translateX(-50%);width:1.15vmin;height:1.25vmin;border-radius:1px;
  background:#ffe9a8;opacity:1;box-shadow:0 0 .5vmin rgba(255,238,170,.8);}
.puppet .slot.s1{top:5vmin;}
.puppet .slot.s2{top:7vmin;}
.puppet .slot.s3{top:8.4vmin;width:1.4vmin;height:.5vmin;}

/* 四肢：铰接在躯干，机械摆动 */
.puppet .arm{top:4.5vmin;width:3.2vmin;height:.85vmin;border-radius:2px;background:#1c1006;}
.puppet .arm.l{left:-2.7vmin;transform-origin:right center;animation:armL 1s ease-in-out infinite;}
.puppet .arm.r{right:-2.7vmin;transform-origin:left center;animation:armR 1s ease-in-out infinite;}
@keyframes armL{0%,100%{transform:rotate(14deg);}35%{transform:rotate(54deg);}45%{transform:rotate(40deg);}80%{transform:rotate(50deg);}}
@keyframes armR{0%,100%{transform:rotate(-14deg);}35%{transform:rotate(-54deg);}45%{transform:rotate(-40deg);}80%{transform:rotate(-50deg);}}
.puppet .leg{top:9.2vmin;width:1.4vmin;height:4vmin;border-radius:2px;background:#1c1006;
  transform-origin:top center;}
.puppet .leg.l{left:1vmin;animation:legL .6s ease-in-out infinite;}
.puppet .leg.r{right:1vmin;animation:legR .6s ease-in-out infinite;}
@keyframes legL{0%{transform:rotate(22deg);}42%{transform:rotate(-15deg);}55%{transform:rotate(-7deg);}100%{transform:rotate(21deg);}}
@keyframes legR{0%{transform:rotate(-22deg);}42%{transform:rotate(15deg);}55%{transform:rotate(7deg);}100%{transform:rotate(-21deg);}}

/* 操纵杆：细签从人物背后挑着（皮影标志） */
.puppet .rod{left:50%;bottom:6.5vmin;width:.5vmin;height:11vmin;background:#241709;opacity:.85;
  transform-origin:bottom center;z-index:-1;}
.puppet .rod::after{content:'';position:absolute;top:-.9vmin;left:50%;transform:translateX(-50%);
  width:1.5vmin;height:1.5vmin;border-radius:50%;background:#241709;}
.puppet.rodL .rod{transform:rotate(-30deg);}
.puppet.rodR .rod{transform:rotate(30deg);}

/* 行进（父级位移，由场景控制） */

/* 旗手：杆 + 三角旗 */
.bearer{position:absolute;bottom:var(--by,10%);z-index:7;opacity:0;}
.scene.active .bearer{animation:cgBearIn .7s ease-out var(--d,0s) forwards;}
@keyframes cgBearIn{from{opacity:0;transform:translateY(1.4vmin);}to{opacity:1;transform:translateY(0);}}
.bearer .pole{position:absolute;left:2.2vmin;top:-7.6vmin;width:.55vmin;height:9.4vmin;background:#1c1006;border-radius:1px;}
.bearer .flag{position:absolute;left:2.6vmin;top:-8.2vmin;width:4.8vmin;height:3.6vmin;background:#221505;
  clip-path:polygon(0 0,100% 0,80% 50%,100% 100%,0 100%);transform-origin:left center;
  display:flex;align-items:center;justify-content:center;
  writing-mode:vertical-rl;font-size:clamp(8px,1.7vmin,12px);color:#d9c190;letter-spacing:.1em;
  padding:.2em 0;box-sizing:border-box;
  animation:cgFlagW .8s ease-in-out infinite alternate;}
@keyframes cgFlagW{from{transform:skewY(0);}to{transform:skewY(-6deg);}}
.bearer .puppet{left:.8vmin;bottom:0;}

/* 六大派队伍（第一幕：两侧列队合围） */
.armyL{position:absolute;left:0;bottom:11%;z-index:7;opacity:0;
  animation:cgMarchInL 2.6s cubic-bezier(.3,.05,.4,1) .4s forwards;}
@keyframes cgMarchInL{from{transform:translateX(-46vw);opacity:0;}to{transform:translateX(0);opacity:1;}}
.armyR{position:absolute;right:0;bottom:11%;z-index:7;opacity:0;
  animation:cgMarchInR 2.6s cubic-bezier(.3,.05,.4,1) .4s forwards;}
@keyframes cgMarchInR{from{transform:translateX(46vw);opacity:0;}to{transform:translateX(0);opacity:1;}}

/* 教主（第二幕：自山脚升上山顶，大号皮影） */
#shadowLeader{position:absolute;left:50%;bottom:30%;transform:translateX(-50%);z-index:10;opacity:0;}
.scene.active #shadowLeader{animation:cgLeaderRise 1.9s cubic-bezier(.22,.8,.3,1) .6s forwards;}
@keyframes cgLeaderRise{from{opacity:0;transform:translate(-50%,9vmin);}to{opacity:1;transform:translate(-50%,0);}}
#shadowLeader .puppet{width:9vmin;height:18vmin;animation:none;}
#shadowLeader .puppet .hair{left:2.9vmin;top:-.8vmin;width:4.6vmin;height:3.2vmin;}
#shadowLeader .puppet .head{left:2.7vmin;top:.7vmin;width:5.2vmin;height:5.6vmin;
  clip-path:polygon(46% 0,72% 4%,88% 20%,100% 32%,94% 46%,100% 58%,86% 70%,80% 86%,60% 100%,34% 98%,28% 74%,20% 56%,24% 36%,14% 22%,32% 10%);}
#shadowLeader .puppet .eye{left:4.3vmin;top:2vmin;width:1.2vmin;height:.8vmin;}
#shadowLeader .puppet .torso{left:.9vmin;top:6.2vmin;width:7.2vmin;height:8.6vmin;
  clip-path:polygon(0 0,100% 0,94% 100%,50% 86%,6% 100%);}
#shadowLeader .puppet .belt{left:.9vmin;top:10vmin;width:7.2vmin;height:1.5vmin;}
#shadowLeader .puppet .slot.s1{top:7.8vmin;width:1.3vmin;height:1.5vmin;}
#shadowLeader .puppet .slot.s2{top:11vmin;}
#shadowLeader .puppet .slot.s3{top:13vmin;width:2vmin;height:.7vmin;}
#shadowLeader .puppet .arm{top:7vmin;width:5.6vmin;height:1.2vmin;}
#shadowLeader .puppet .arm.l{left:-4.4vmin;animation:none;transform:rotate(6deg);}
#shadowLeader .puppet .arm.r{right:-4.4vmin;animation:none;transform:rotate(-6deg);}
#shadowLeader .puppet .leg{top:14.6vmin;width:2.2vmin;height:4.4vmin;animation:none;}
#shadowLeader .puppet .leg.l{left:2.1vmin;transform:rotate(7deg);}
#shadowLeader .puppet .leg.r{right:2.1vmin;transform:rotate(-7deg);}
#shadowLeader .puppet .cape{left:.2vmin;top:5vmin;width:11vmin;height:12vmin;background:#1a0f05;
  clip-path:polygon(0 0,100% 0,100% 100%,50% 70%,0 100%);z-index:-2;}
#shadowLeader .puppet .rod{left:50%;bottom:9vmin;height:14vmin;transform:rotate(-26deg);}

/* 圣火令（教主手中红光贴片） */
#shadowLing{position:absolute;left:50%;bottom:33.5%;transform:translateX(-50%);z-index:11;width:2.2vmin;height:8vmin;
  background:linear-gradient(90deg,#7a1f14,#e05a2a 50%,#7a1f14);opacity:0;
  animation:cgLingIn .8s ease-out 2s forwards,cgLingGlow 1.6s ease-in-out 2.3s infinite;}
@keyframes cgLingIn{to{opacity:.95;}}
@keyframes cgLingGlow{0%,100%{box-shadow:0 0 1.2vmin rgba(255,120,40,.5);}50%{box-shadow:0 0 3vmin rgba(255,150,60,.95);}}

/* 五虎将（第二幕：山腰列阵） */
.heroRow{position:absolute;left:50%;bottom:17%;transform:translateX(-50%);z-index:8;
  display:flex;gap:3.6vmin;align-items:flex-end;opacity:0;}
.scene.active .heroRow{animation:cgHeroRowIn 1.4s cubic-bezier(.3,1.2,.5,1) 1.1s forwards;}
@keyframes cgHeroRowIn{from{opacity:0;transform:translate(-50%,4vmin);}to{opacity:1;transform:translate(-50%,0);}}
.heroRow .puppet{position:relative;width:5vmin;height:12vmin;animation:none;}
.heroRow .puppet .hair{left:1.1vmin;top:-.5vmin;width:2.9vmin;height:2.3vmin;}
.heroRow .puppet .head{left:1vmin;top:.5vmin;width:3.2vmin;height:3.6vmin;}
.heroRow .puppet .eye{left:1.95vmin;top:1.55vmin;}
.heroRow .puppet .torso{left:.4vmin;top:4vmin;width:4.4vmin;height:5.4vmin;}
.heroRow .puppet .belt{left:.4vmin;top:6.4vmin;width:4.4vmin;height:1vmin;}
.heroRow .puppet .slot.s1{top:5.1vmin;}
.heroRow .puppet .slot.s2{top:7vmin;}
.heroRow .puppet .slot.s3{top:8.3vmin;width:1.4vmin;height:.5vmin;}
.heroRow .puppet .arm{top:4.6vmin;width:3.2vmin;height:.85vmin;animation:none;}
.heroRow .puppet .arm.l{left:-2.7vmin;transform:rotate(18deg);}
.heroRow .puppet .arm.r{right:-2.7vmin;transform:rotate(-18deg);}
.heroRow .puppet .leg{top:9.4vmin;height:3.6vmin;animation:none;}
.heroRow .puppet .leg.l{left:1vmin;transform:rotate(10deg);}
.heroRow .puppet .leg.r{right:1vmin;transform:rotate(-10deg);}
.heroRow .name{position:absolute;bottom:-2.4em;left:50%;transform:translateX(-50%);
  font-size:clamp(10px,2.2vmin,16px);color:#5a4020;white-space:nowrap;letter-spacing:.14em;font-weight:700;}

/* 冲锋（第三幕：两排交错） */
.chargeL{position:absolute;left:0;bottom:14%;z-index:7;opacity:0;
  animation:cgChargeL 3s linear var(--dl,.5s) infinite;}
@keyframes cgChargeL{0%{transform:translateX(-46vw);opacity:0;}8%{opacity:1;}92%{opacity:1;}100%{transform:translateX(46vw);opacity:0;}}
.chargeR{position:absolute;right:0;bottom:14%;z-index:7;opacity:0;
  animation:cgChargeR 3.2s linear var(--dl,.8s) infinite;}
@keyframes cgChargeR{0%{transform:translateX(46vw);opacity:0;}8%{opacity:1;}92%{opacity:1;}100%{transform:translateX(-46vw);opacity:0;}}
.chargeL .puppet{transform-origin:50% 100%;}
.chargeR .puppet{transform-origin:50% 100%;}

/* 箭矢 */
.arrow{position:absolute;z-index:8;width:6.5vmin;height:.38vmin;background:#241709;border-radius:2px;
  opacity:0;transform-origin:right center;
  animation:cgArrowFly var(--w,1.1s) linear var(--dl,0s) infinite;}
.arrow::after{content:'';position:absolute;right:-.5vmin;top:50%;transform:translateY(-50%);
  border:.35vmin solid transparent;border-left:.7vmin solid #241709;}
@keyframes cgArrowFly{0%{opacity:0;transform:translate(0,0) rotate(var(--ang,-14deg));}
  12%{opacity:.95;}85%{opacity:.8;}100%{opacity:0;transform:translate(var(--dx,52vw),var(--dy,4vmin)) rotate(var(--ang,-14deg));}}

/* ---- 圣火（亮幕上唯一彩色贴片） ---- */
.sacred-fire{position:absolute;left:50%;bottom:36%;transform:translateX(-50%);z-index:5;
  width:13vmin;height:19vmin;pointer-events:none;}
.sacred-fire .halo{position:absolute;left:50%;top:58%;transform:translate(-50%,-50%);
  width:36vmin;height:25vmin;border-radius:50%;
  background:radial-gradient(ellipse,rgba(255,120,30,.9),rgba(255,80,16,.45) 52%,transparent 72%);filter:blur(7px);
  animation:fireHalo 1.6s ease-in-out infinite;}
@keyframes fireHalo{0%,100%{opacity:.75;}50%{opacity:1;}}
.sacred-fire .core{position:absolute;left:50%;bottom:0;transform:translateX(-50%);
  width:9.5vmin;height:16vmin;
  background:radial-gradient(circle at 50% 76%,#fff7d8,#ff8a24 40%,#e5400e 66%,rgba(230,64,14,0) 82%);
  clip-path:polygon(50% 0,62% 22%,78% 14%,72% 38%,100% 34%,78% 58%,96% 72%,66% 72%,72% 100%,34% 88%,42% 64%,8% 74%,26% 50%,0 42%,28% 34%,14% 14%,42% 22%);
  filter:blur(1px) drop-shadow(0 0 2.4vmin rgba(255,110,20,.95));
  animation:fireDance 1.1s ease-in-out infinite;}
@keyframes fireDance{0%,100%{transform:translateX(-50%) scaleY(1) rotate(-2deg);}
  50%{transform:translateX(-50%) scaleY(1.12) rotate(2deg);}}
.sacred-fire.dying{opacity:.62;transform:translateX(-50%) scale(.55);
  animation:fireDim 1.7s ease-in-out infinite;}
.sacred-fire.dying .halo{animation:none;opacity:.5;}
.sacred-fire.dying .core{animation:fireDance 1.5s ease-in-out infinite;}
@keyframes fireDim{0%,100%{opacity:.62;}45%{opacity:.34;}70%{opacity:.55;}}

/* ---- 台词（幕布内下方横排，区别于画卷竖排题字） ---- */
#shadowWords{position:absolute;left:0;right:0;bottom:4.5vmin;z-index:20;margin:0;text-align:center;
  color:#5a3a14;font-size:clamp(13px,3vmin,22px);letter-spacing:.28em;text-indent:.28em;font-weight:700;
  text-shadow:0 1px 2px rgba(255,246,214,.5);opacity:0;pointer-events:none;
  animation:cgShadowWords 1s ease-out var(--d,0s) forwards;}
@keyframes cgShadowWords{from{opacity:0;transform:translateY(.8vmin);}to{opacity:1;transform:translateY(0);}}

/* 大字（明/战）：皮影刻字感 */
#shadowBig{position:absolute;left:0;right:0;top:30%;z-index:20;margin:0;text-align:center;pointer-events:none;
  font-size:clamp(64px,18vmin,160px);line-height:1;font-weight:700;color:#8f2a1c;
  text-shadow:0 0 4vmin rgba(179,53,43,.45),0 2px 3px rgba(255,244,214,.35);
  opacity:0;animation:cgShadowBigIn 1.8s cubic-bezier(.22,.8,.3,1) var(--d,0s) forwards;}
@keyframes cgShadowBigIn{from{opacity:0;transform:scale(1.5) rotate(3deg);filter:blur(8px);}
  to{opacity:.96;transform:scale(1) rotate(0);filter:blur(0);}}

/* 朱红钤印（戏班落款） */
#shadowSeal{position:absolute;right:9%;bottom:5%;z-index:20;width:8vmin;height:8vmin;
  display:flex;align-items:center;justify-content:center;
  border:.5vmin solid #a3331f;border-radius:.7vmin;color:#a3331f;
  font-size:5.2vmin;font-weight:700;background:rgba(179,53,43,.08);
  opacity:0;transform:scale(2.4) rotate(-14deg);}
#shadowSeal.stamp{animation:cgShadowSealIn .5s cubic-bezier(.2,1.3,.4,1) forwards;}
@keyframes cgShadowSealIn{0%{opacity:0;transform:scale(2.4) rotate(-14deg);}
  55%{opacity:.96;transform:scale(.94) rotate(-5deg);}
  100%{opacity:.92;transform:scale(1) rotate(-5deg);}}

/* 幕间淡出 */
.scene{position:absolute;inset:0;z-index:2;opacity:0;pointer-events:none;transition:opacity .8s ease;}
.scene.active{opacity:1;}

/* ---- 跳过 & 提示（深场适配） ---- */
#cgShadowSkip{position:absolute;top:calc(10px + env(safe-area-inset-top,0px));
  right:calc(12px + env(safe-area-inset-right,0px));z-index:40;opacity:0;
  animation:cgShadowUi .5s ease-out 1.2s both;
  background:rgba(240,214,160,.14);color:rgba(240,214,160,.85);
  border:1px solid rgba(240,214,160,.45);border-radius:999px;
  font-size:clamp(11px,2.6vmin,17px);letter-spacing:.2em;
  padding:.45em 1.1em .45em 1.3em;font-family:inherit;cursor:pointer;}
@keyframes cgShadowUi{to{opacity:1;}}
#cgShadowSkip:hover{color:#f8e6b4;border-color:#b3352b;}
#cgShadowHint{position:absolute;bottom:2.5%;left:0;right:0;text-align:center;z-index:40;
  font-size:clamp(11px,2.8vmin,22px);letter-spacing:.3em;color:rgba(240,214,160,.8);opacity:0;}
#cgShadowHint.show{animation:cgShadowHintB 2.6s ease-in-out infinite;}
@keyframes cgShadowHintB{0%,100%{opacity:.25;}50%{opacity:.8;}}

/* 降级：减少动态 */
@media (prefers-reduced-motion:reduce){
  #cgShadowOverlay.thump,.puppet,.puppet .arm,.puppet .leg,
  .bearer .flag,.sacred-fire,.cloud,.arrow,.chargeL,.chargeR{animation:none;}
  #shadowLamp{display:none;}
  .armyL,.armyR{animation-duration:.4s;}
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
            <div class="mtn m1" id="mtn1"></div>
            <div class="mtn m2" id="mtn2"></div>
            <div class="mtn m3" id="mtn3"></div>
            <div class="cloud" id="cloud1" style="left:12%;top:18%;width:24vmin;height:6vmin;--t:24s;"></div>
            <div class="cloud" id="cloud2" style="left:54%;top:12%;width:32vmin;height:7vmin;--t:31s;"></div>
            <div class="scene" id="shadowScene0"></div>
            <div class="scene" id="shadowScene1"></div>
            <div class="scene" id="shadowScene2"></div>
            <div class="sacred-fire" id="shadowFire">
                <div class="halo"></div>
                <div class="core"></div>
            </div>
            <p id="shadowWords"></p>
            <p id="shadowBig"></p>
            <div id="shadowSeal">明</div>
            <div id="shadowBoard"></div>
            <div id="shadowEave"></div>
            <div class="curtain l"></div>
            <div class="curtain r"></div>
            <div id="shadowApron"></div>
        </div>
        <button id="cgShadowSkip" type="button">跳过 ›</button>
        <div id="cgShadowHint"></div>
    `;
    document.body.appendChild(overlay);

    const hint = overlay.querySelector('#cgShadowHint');
    const words = overlay.querySelector('#shadowWords');
    const big = overlay.querySelector('#shadowBig');
    const seal = overlay.querySelector('#shadowSeal');
    const board = overlay.querySelector('#shadowBoard');
    const fire = overlay.querySelector('#shadowFire');

    const ctx = { overlay, hint, words, big, seal, board, fire,
                  act: 0, ready: false, done: false, gen: 0, timers: [] };
    _active = ctx;

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

    /* 给山填镂空孔 */
    function poreMountains() {
        const holes = [[7, 32], [13, 50], [22, 40], [30, 24], [42, 40], [55, 22], [63, 46], [76, 30], [88, 46]];
        [['mtn1', 9], ['mtn2', 6], ['mtn3', 4]].forEach(function (pair, li) {
            const m = document.getElementById(pair[0]);
            for (let i = 0; i < pair[1]; i++) {
                const p = el('div', 'pore');
                const h = holes[(li * 3 + i) % holes.length];
                const s = 0.8 + Math.random() * 1.1;
                p.style.left = (h[0] + (Math.random() * 14 - 7)) + '%';
                p.style.bottom = (h[1] + (Math.random() * 22 - 8)) + '%';
                p.style.width = s + 'vmin';
                p.style.height = s * 0.8 + 'vmin';
                m.appendChild(p);
            }
        });
        /* 云镂空 */
        [['cloud1', 3], ['cloud2', 4]].forEach(function (pair) {
            const c = document.getElementById(pair[0]);
            const cb = el('div', 'cb');
            c.appendChild(cb);
            for (let i = 0; i < pair[1]; i++) {
                const h = el('div', 'hole');
                const s = 1.2 + Math.random() * 1.4;
                h.style.left = (10 + Math.random() * 70) + '%';
                h.style.top = (20 + Math.random() * 50) + '%';
                h.style.width = s + 'vmin';
                h.style.height = s * 0.7 + 'vmin';
                c.appendChild(h);
            }
        });
    }

    /* --- 皮影小人（关节 + 镂空 + 操纵杆） --- */
    function buildPuppet(leader) {
        const p = el('div', 'puppet');
        p.appendChild(el('div', 'hair'));
        p.appendChild(el('div', 'head'));
        p.appendChild(el('div', 'eye'));
        p.appendChild(el('div', 'torso'));
        p.appendChild(el('div', 'belt'));
        p.appendChild(el('div', 'slot s1'));
        p.appendChild(el('div', 'slot s2'));
        p.appendChild(el('div', 'slot s3'));
        p.appendChild(el('div', 'arm l'));
        p.appendChild(el('div', 'arm r'));
        p.appendChild(el('div', 'leg l'));
        p.appendChild(el('div', 'leg r'));
        const rod = el('div', 'rod');
        p.appendChild(rod);
        if (leader) {
            p.appendChild(el('div', 'cape'));
            p.classList.add('rodL');
        } else {
            p.classList.add(Math.random() < 0.5 ? 'rodL' : 'rodR');
        }
        return p;
    }

    /* --- 旗手 --- */
    function buildBearer(name) {
        const b = el('div', 'bearer');
        b.append(el('div', 'pole'), el('div', 'flag', name), buildPuppet());
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
        leader.appendChild(buildPuppet(true));
        sec.appendChild(leader);

        const ling = el('div');
        ling.id = 'shadowLing';
        sec.appendChild(ling);

        const row = el('div', 'heroRow');
        ['张无忌', '杨逍', '韦一笑', '殷天正', '谢逊'].forEach(function (n) {
            const wrap = buildPuppet();
            wrap.classList.add('hero');
            wrap.appendChild(el('div', 'name', n));
            row.appendChild(wrap);
        });
        sec.appendChild(row);
    }

    /* --- 第三幕：冲锋 + 箭矢 --- */
    function buildScene2(sec) {
        [0, 1, 2, 3, 4].forEach(function (i) {
            const cL = el('div', 'chargeL');
            const cR = el('div', 'chargeR');
            cL.style.setProperty('--dl', (i * 0.5 + Math.random() * 0.3).toFixed(2) + 's');
            cR.style.setProperty('--dl', (i * 0.5 + 0.25 + Math.random() * 0.3).toFixed(2) + 's');
            cL.appendChild(buildPuppet());
            cR.appendChild(buildPuppet());
            sec.appendChild(cL);
            sec.appendChild(cR);
        });
        for (let i = 0; i < 12; i++) {
            const a = el('div', 'arrow');
            a.style.left = (4 + Math.random() * 30) + '%';
            a.style.top = (10 + Math.random() * 42) + '%';
            a.style.setProperty('--ang', (-6 - Math.random() * 14).toFixed(1) + 'deg');
            a.style.setProperty('--dx', '50vw');
            a.style.setProperty('--dy', (2 + Math.random() * 8).toFixed(1) + 'vmin');
            a.style.setProperty('--w', (0.8 + Math.random() * 0.5).toFixed(2) + 's');
            a.style.setProperty('--dl', (Math.random() * 1.1).toFixed(2) + 's');
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

        for (let i = 0; i < scenes.length; i++) {
            overlay.querySelector('#shadowScene' + i).classList.toggle('active', i === idx);
        }

        fire.className = 'sacred-fire' + (a.mood === 'dying' ? ' dying' : '');

        board.textContent = a.board;
        board.style.setProperty('--d', '0.3s');
        board.style.animation = 'none';
        void board.offsetWidth;
        board.style.animation = '';

        words.textContent = '';
        /* 台词逐条呈现 */
        a.lines.forEach(function (ln, k) {
            later((0.7 + k * 0.55) * 1000, function () {
                words.textContent = ln.t;
                words.style.animation = 'none';
                void words.offsetWidth;
                words.style.animation = '';
            });
        });

        big.textContent = BIG_WORDS[a.mood];
        if (big.textContent) {
            big.style.setProperty('--d', (1.2 + a.lines.length * 0.1).toFixed(2) + 's');
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
        if (board.textContent) {
            board.style.animation = 'none';
            board.style.setProperty('--d', '0.05s');
            void board.offsetWidth;
            board.style.animation = '';
        }
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

    poreMountains();
    for (let i = 0; i < scenes.length; i++) {
        scenes[i](overlay.querySelector('#shadowScene' + i));
    }
    renderAct(0);
}