// ui/80perf-panel.js — 自定义档（8x）参数面板
// 每项一个四档滑块：慢(0.5x) / 正常(2x) / 快(4x) / 极快(8x)，默认取 DEFAULT_STOPS（出厂调定值）。
//   滑块位置 → 直接取参数表对应列的出厂值，不改出厂表本身。
// 第一行「未进表倍率」：控制所有未进参数表的演出（蝶变/换位/击退等），四档 0.5/1/2/4。
// 头/中/底三段：标题+倍率固定顶部，滑块区滚动，按钮固定底部。
// V3.4.0 | 2026-10-27 | 四档改为独立绝对值表 PV_TIERS（中间=用户实机值，左右按比例重算）；
//   修「正常档落进 core 散列后与相邻档重复/反序」7 项；不再从 core 四列拼档
// V3.3.0 | 2026-10-27 | 修手机端两故障：①预览层豁免 paused-animations（窗口不可见）
//   ②预览遮罩 stopPropagation（关预览连带关面板、解除暂停）③「正常」档固化用户实机值（V3.4.0 已并入 PV_TIERS）
// V3.2.1 | 2026-10-27 | 新增 DEFAULT_STOPS 出厂默认刻度（用户实机调定 18 项）；恢复默认/导入缺项均回落此表
// V3.2.0 | 2026-10-26 | 预览样式/剧本改成网页端 demo 定版：羊皮纸弹窗、双格战场、18 项各带独立演出，
//   样式与动画曲线照抄 demo（类名统一加 pv- 前缀防污染游戏页），值仍取 getPerfParams()[k]['50']
// V3.1.0 | 2026-10-26 | 18 项参数标签可点弹预览：独立计时（面板打开时游戏时钟冻结，不能用 clock）、
//   pv-* 独立样式（不复用 fixed 的弹幕类与 6.2dvh 的格子类）；后三项（冲刺/轰拳/子弹时间）标注「示意」
// V3.0.1 | 2026-10-26 | 跟随 core/23 去锚定化：删「锚点行每字」、加「效果行停留」（lineGapFx）
// V3.0.0 | 2026-10-26 | 四档滑块 + 未进表倍率 + 三段布局 + 清单按钮
// V2.0.2 | 2026-10-26 | 滑块行加高（40px 行高 / 24px 滑块）+ 弹窗高度 88vh→72vh
export const VER = 'ui/80perf-panel.js V3.4.0';

import { GlobalStore } from '../infra/54-global-store.js';
import { clock } from '../infra/52-clock.js';
import { getPerfParams, setPerfParams, resetPerfParams, getNoTableScale, setNoTableScale, resetNoTableScale } from '../core/23perf-params.js';

const TIER = '50';           // 自定义档 = 8x
const LS_KEY = 'ming_perf_custom_8x_v1';

// ══════════════════════════════════════════════════════════════
// 参数预览（点标签弹出演示）—— 样式与剧本照抄网页端 demo
//   面板打开时游戏时钟冻结（isPaused），故全部走独立的 setTimeout / rAF，不用 clock。
//   demo 是独立页面，类名极其通用（.ov/.box/.unit/.bar…），直接注入游戏 head 会全局污染，
//   这里一律加 pv- 前缀；样式数值、动画曲线、关键帧节奏均与 demo 一致。
// ══════════════════════════════════════════════════════════════
let _pvStyleInjected = false;
function injectPvStyle() {
    if (_pvStyleInjected) return;
    _pvStyleInjected = true;
    const st = document.createElement('style');
    st.id = 'pvStyle';
    st.textContent = `
.pv-ov{
  --paper:#fdf5e6; --line:#e8d5b0; --brown:#5c4033; --gold:#b8860b;
  --blue:#1e6bb8; --red:#c0392b; --green:#2e7d32; --purple:#8e44ad;
  --txt:#3a3226; --mute:#8b7355;
  position:fixed; inset:0; z-index:100060; padding:16px;
  display:none; align-items:center; justify-content:center;
  background:rgba(18,13,9,.68);
  -webkit-backdrop-filter:blur(3px); backdrop-filter:blur(3px);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  color:var(--txt);
}
.pv-ov,.pv-ov *{box-sizing:border-box}
.pv-ov.show{display:flex}

.pv-box{
  width:100%;max-width:360px;
  background:var(--paper);
  border-radius:14px;overflow:hidden;
  box-shadow:
    0 0 0 1px rgba(139,115,85,.5),
    0 0 0 4px rgba(253,245,230,.1),
    0 20px 60px rgba(0,0,0,.65);
  animation:pvBoxIn .22s cubic-bezier(.2,.9,.3,1);
}
@keyframes pvBoxIn{from{opacity:0;transform:scale(.94) translateY(8px)}to{opacity:1;transform:none}}

.pv-bhead{
  padding:12px 16px 10px;text-align:center;
  background:linear-gradient(180deg,#fffaf0,var(--paper));
  border-bottom:1px solid var(--line);
}
.pv-bt{font-size:13.5px;font-weight:700;color:var(--brown);letter-spacing:.3px}
.pv-bt em{font-style:normal;color:var(--gold);font-variant-numeric:tabular-nums}
.pv-bs{font-size:10.5px;color:var(--mute);margin-top:4px;line-height:1.6}

.pv-stage{
  position:relative;height:158px;margin:11px;
  border-radius:10px;overflow:hidden;
  border:1.5px solid #c9b998;
  background:
    linear-gradient(rgba(139,115,85,.055) 1px,transparent 1px) 0 0/100% 27px,
    linear-gradient(90deg,rgba(139,115,85,.055) 1px,transparent 1px) 0 0/27px 100%,
    radial-gradient(ellipse at 50% 22%,#f2ead8,#dfd2b7);
  box-shadow:inset 0 2px 9px rgba(120,90,50,.16);
}
.pv-bfoot{
  padding:0 16px 13px;font-size:10px;color:#a0906f;text-align:center;
  letter-spacing:.2px;
}

.pv-unit{
  position:absolute;width:66px;height:40px;border-radius:6px;
  display:flex;align-items:center;justify-content:center;
  font-size:9.5px;font-weight:600;color:#6b5b45;
  background:linear-gradient(180deg,#fffdf6,#efe9da);
  border:1.5px solid #c2b191;
  box-shadow:0 2px 5px rgba(90,70,40,.16),inset 0 1px 0 #fff;
  transition:background .2s,border-color .2s;
}
.pv-unit.enemy{color:#8a5c3a}
.pv-unit.dead{
  background:linear-gradient(180deg,#e8756a,#c0392b) !important;
  border-color:#8f2a1f !important;color:#fff !important;
}

.pv-logbox{
  position:absolute;inset:0;padding:10px 13px;
  font-size:10px;line-height:1.85;color:#4a4033;
  overflow:hidden;
}
.pv-logline{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pv-logline.dim{color:#9a8f7d}
.pv-logline.green{color:var(--green)}
.pv-logline.orange{color:#c06a10}
.pv-logline.gray{color:#8e8878}
.pv-logline .hl{color:#1a1610;font-weight:600}

.pv-flyer{
  position:absolute;z-index:5;pointer-events:none;
  will-change:transform,left,top;
}
.pv-flyer.block{
  width:32px;height:26px;border-radius:5px;
  background:linear-gradient(180deg,#4a90d9,var(--blue));
  border:2px solid #0d4f8b;
  box-shadow:0 2px 6px rgba(20,60,110,.35);
}
.pv-flyer.arrow{width:26px;height:0}
.pv-flyer.arrow i{
  position:absolute;left:0;top:-1.5px;width:26px;height:3px;
  background:linear-gradient(90deg,rgba(139,69,19,.25),#8B4513);
  border-radius:2px;
}
.pv-flyer.arrow i::after{
  content:"";position:absolute;right:-7px;top:-4px;
  border-left:9px solid #6b3a12;
  border-top:5.5px solid transparent;
  border-bottom:5.5px solid transparent;
}
.pv-flyer.meteor i{background:linear-gradient(90deg,rgba(255,200,60,0),#FFD700)}
.pv-flyer.meteor i::after{border-left-color:#e0a800}
.pv-flyer.meteor{filter:drop-shadow(0 0 6px rgba(255,190,40,.9))}
.pv-flyer.claw{
  width:30px;height:30px;border-radius:50%;
  background:radial-gradient(circle at 36% 32%,#c48ee0,var(--purple));
  border:2px solid #5e2a7a;
  box-shadow:0 0 10px rgba(142,68,173,.55);
}

.pv-pop{
  position:absolute;z-index:6;font-size:13px;font-weight:800;
  white-space:nowrap;pointer-events:none;
  transform:translate(-50%,0);
  animation:pvPopUp cubic-bezier(.2,.8,.3,1) forwards;
  text-shadow:0 1px 2px rgba(255,255,255,.6);
}
.pv-pop.dmg{color:var(--red)}
.pv-pop.heal{color:var(--green)}
.pv-pop.atk{color:#c06a10}
@keyframes pvPopUp{
  0%{opacity:0;transform:translate(-50%,2px) scale(.65)}
  16%{opacity:1;transform:translate(-50%,-9px) scale(1.15)}
  70%{opacity:1;transform:translate(-50%,-17px) scale(1)}
  100%{opacity:0;transform:translate(-50%,-32px) scale(.92)}
}

.pv-bub{
  position:absolute;left:14px;z-index:6;
  font-size:11px;font-weight:700;color:#fff;
  padding:5px 11px;border-radius:7px;
  white-space:nowrap;pointer-events:none;
  background:linear-gradient(180deg,#3f8fd8,#1e6bb8);
  box-shadow:0 3px 10px rgba(20,60,110,.3);
  opacity:0;
  animation:pvBubIn .18s cubic-bezier(.2,.9,.3,1) forwards;
}
.pv-bub.gray{background:linear-gradient(180deg,#9a9a9a,#7a7a7a)}
@keyframes pvBubIn{
  from{opacity:0;transform:translate(5px,0) scale(.75)}
  to{opacity:1;transform:translate(0,0) scale(1)}
}

.pv-cd{
  position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  font-size:56px;font-weight:800;color:var(--gold);
  text-shadow:0 0 24px rgba(255,215,0,.55),0 2px 6px rgba(0,0,0,.2);
  pointer-events:none;
  animation:pvCdPop .3s cubic-bezier(.2,.9,.3,1) forwards;
}
@keyframes pvCdPop{from{opacity:0;transform:translate(-50%,-50%) scale(1.6)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}

.pv-fan{
  position:absolute;left:16px;top:79px;height:0;width:0;
  border-radius:0 50% 50% 0;transform-origin:0 50%;
  background:radial-gradient(ellipse at 0% 50%,rgba(255,215,0,.95),rgba(255,150,60,.4) 42%,rgba(255,120,30,0) 76%);
  pointer-events:none;z-index:4;
}

.pv-ring{
  position:absolute;border-radius:50%;
  border:2px solid rgba(255,255,255,.9);
  box-shadow:0 0 14px rgba(255,255,255,.7);
  pointer-events:none;z-index:5;
}

.pv-ghost{
  position:absolute;width:32px;height:26px;border-radius:5px;
  background:rgba(30,107,184,.28);
  border:1.5px solid rgba(30,107,184,.4);
  pointer-events:none;z-index:3;
}

.pv-bar{
  position:absolute;left:16px;right:16px;bottom:16px;height:7px;
  border-radius:4px;background:rgba(139,115,85,.18);overflow:hidden;
}
.pv-bar i{
  display:block;height:100%;width:0;border-radius:4px;
  background:linear-gradient(90deg,#ffd76a,#e0a800);
}

/* 面板行标签（在 .pv-ov 作用域外，颜色写死不用变量） */
.pv-lbl{
  cursor:pointer;position:relative;
  border-bottom:1px dashed rgba(30,107,184,.45);
  padding-bottom:1px;transition:color .15s;
}
.pv-lbl:active{color:#1e6bb8}
.pv-lbl::after{
  content:"▸";font-size:8px;color:#1e6bb8;
  position:absolute;right:-2px;top:2px;opacity:.55;
}

/* 预览层豁免暂停：面板打开时 body 有 paused-animations，会把预览的入场动画冻在
   opacity:0，表现为「只看到背景变暗、窗口不存在」。这里只对预览子树恢复播放。 */
body.paused-animations .pv-ov,
body.paused-animations .pv-ov *,
body.paused-animations .pv-ov *::before,
body.paused-animations .pv-ov *::after {
    animation-play-state: running !important;
}
`;
    document.head.appendChild(st);
}

// ── 预览引擎（独立于游戏时钟）──
let _pvTimers = [];
let _pvRaf = 0;
function pvClear() {
    _pvTimers.forEach(clearTimeout); _pvTimers = [];
    if (_pvRaf) { cancelAnimationFrame(_pvRaf); _pvRaf = 0; }
    const st = document.getElementById('pvStage');
    if (st) st.innerHTML = '';
}
function pvLater(fn, ms) { _pvTimers.push(setTimeout(fn, ms)); }

function pvEl(host, cls, css, html) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    if (css) d.style.cssText = css;
    if (html != null) d.innerHTML = html;
    host.appendChild(d);
    return d;
}

// 取 8x 档当前实际值（预览与真值同源）
function pvVal(k) { return (getPerfParams()[k] || {})['50'] || 0; }

/* 两格战场：左明教 / 右六大派 */
function pvField(stage) {
    const w = stage.clientWidth || 330;
    const L = pvEl(stage, 'pv-unit', 'left:12px;top:58px', '明教');
    const R = pvEl(stage, 'pv-unit enemy', `left:${w - 12 - 66}px;top:58px`, '六大派');
    return {
        L, R, w,
        x0: 12 + 66,               // 左格右缘
        x1: w - 12 - 66 - 32,      // 右格左缘 - 飞行物宽
    };
}

function pvLogbox(stage) { return pvEl(stage, 'pv-logbox'); }

/* 飘字：CSS 动画跑 life 毫秒，到时移除 */
function pvFloat(stage, x, y, text, cls, life) {
    const d = pvEl(stage, 'pv-pop ' + cls,
        `left:${x}px;top:${y}px;animation-duration:${life}ms`, text);
    pvLater(() => { if (d.parentNode) d.remove(); }, life + 150);
    return d;
}

/* 横向飞行：kind = block / arrow / meteor / claw */
function pvFly(stage, kind, x0, x1, y, dur, onEnd) {
    const cls = {
        block: 'pv-flyer block',
        arrow: 'pv-flyer arrow',
        meteor: 'pv-flyer arrow meteor',
        claw: 'pv-flyer claw'
    }[kind];
    const inner = (kind === 'arrow' || kind === 'meteor') ? '<i></i>' : '';
    const d = pvEl(stage, cls, `left:${x0}px;top:${y}px`, inner);
    const t0 = performance.now();
    const step = () => {
        const p = Math.min(1, (performance.now() - t0) / Math.max(30, dur));
        const e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        d.style.left = (x0 + (x1 - x0) * e) + 'px';
        if (p < 1) _pvRaf = requestAnimationFrame(step);
        else { d.style.opacity = '0'; d.style.transition = 'opacity .12s'; if (onEnd) onEnd(); }
    };
    _pvRaf = requestAnimationFrame(step);
    return d;
}

// 标题是否带 ms 后缀：四个 px/ms 速度项不带
const PV_MS = new Set(['charMs', 'lineGap', 'lineGapFx', 'floatLife', 'bubbleLife',
    'moveDur', 'moveStart', 'clawStart', 'closeHitDur', 'dashDur', 'burstDur',
    'bulletDur', 'countdownTick', 'corpseDelay']);

// ── 18 项演示。run(stage, v, done)：v = 当前 8x 档实际值 ──
const PV = {

    /* ① 每字时长 */
    charMs(stage, v, done) {
        const box = pvLogbox(stage);
        const txt = '明教 张无忌(攻34 血135) → 六大派 少林弟子(防22 血54)';
        const line = pvEl(box, 'pv-logline');
        const t0 = performance.now(), total = txt.length * v;
        const step = () => {
            const p = Math.min(1, (performance.now() - t0) / total);
            line.textContent = txt.slice(0, Math.ceil(txt.length * p));
            if (p < 1) _pvRaf = requestAnimationFrame(step);
            else pvLater(done, 260);
        };
        step();
    },

    /* ② 行间隔 */
    lineGap(stage, v, done) {
        const box = pvLogbox(stage);
        const L = [
            ['波动：攻34→38 防22→26 减伤2', 'gray'],
            ['计算：38×(38/(38+26)) = 22.56', 'gray'],
            ['🗡️ 张无忌 破防：少林弟子 防御 -2', 'gray'],
            ['☄️ 流星赶月加深：少林弟子 额外-20', 'orange'],
            ['🎯 目标已眩晕，本回合无法行动', 'gray'],
        ];
        let i = 0;
        const tick = () => {
            if (i >= L.length) return pvLater(done, 200);
            const d = pvEl(box, 'pv-logline ' + L[i][1]);
            d.textContent = L[i][0];
            i++;
            pvLater(tick, v);
        };
        tick();
    },

    /* ③ 效果行停留 */
    lineGapFx(stage, v, done) {
        const f = pvField(stage);
        const box = pvLogbox(stage);
        const L = [
            ['☀️ 九阳神功回复+12，135→147', '💚+12', 'heal'],
            ['⚔️ 乾坤衍生：攻击+2', '⚔+2', 'atk'],
            ['🛡️ 坚盾：防御+1（已叠1/4）', '🛡+1', 'atk'],
        ];
        let i = 0;
        const tick = () => {
            if (i >= L.length) return pvLater(done, 200);
            const d = pvEl(box, 'pv-logline green');
            d.textContent = L[i][0];
            pvFloat(stage, f.w - 45, 46, L[i][1], L[i][2], 1200);
            i++;
            pvLater(tick, v);
        };
        tick();
    },

    /* ④ 飘字存活 */
    floatLife(stage, v, done) {
        const f = pvField(stage);
        ['💥-16', '💥-27', '💥-17'].forEach((t, i) => {
            pvLater(() => pvFloat(stage, f.w - 45 + (i - 1) * 3, 46 - i * 3, t, 'dmg', v), i * 200);
        });
        pvLater(done, 400 + v);
    },

    /* ⑤ 气泡存活 */
    bubbleLife(stage, v, done) {
        pvField(stage);
        const b1 = pvEl(stage, 'pv-bub', 'top:22px', '六大派也不过如此！');
        pvLater(() => { if (b1.parentNode) b1.remove(); }, v);
        const b2 = pvEl(stage, 'pv-bub gray', 'top:62px', '闪避！');
        pvLater(() => { if (b2.parentNode) b2.remove(); }, v);
        pvLater(done, 300 + v);
    },

    /* ⑥ 位移总时长 */
    moveDur(stage, v, done) {
        const f = pvField(stage);
        const s = pvVal('moveStart');
        const flyDur = Math.max(40, v - s);
        pvLater(() => pvFly(stage, 'block', f.x0, f.x1, 62, flyDur, () => pvLater(done, 200)), s);
    },

    /* ⑦ 位移起手 */
    moveStart(stage, v, done) {
        const f = pvField(stage);
        f.L.style.transition = `transform ${Math.max(80, v)}ms cubic-bezier(.3,.9,.4,1)`;
        f.L.style.transform = 'scale(1.1)';
        pvLater(() => { f.L.style.transform = 'scale(1)'; }, v);
        pvLater(() => pvFly(stage, 'block', f.x0, f.x1, 62, 320, () => pvLater(done, 200)), v);
    },

    /* ⑧ 飞撞速度 */
    crashSpeed(stage, v, done) {
        const f = pvField(stage);
        const dist = f.x1 - f.x0;
        pvLater(() => pvFly(stage, 'block', f.x0, f.x1, 62, dist / v, () => pvLater(done, 200)), 120);
    },

    /* ⑨ 飞箭速度 */
    arrowSpeed(stage, v, done) {
        const f = pvField(stage);
        const dist = f.x1 - f.x0;
        pvLater(() => pvFly(stage, 'arrow', f.x0, f.x1, 72, dist / v, () => pvLater(done, 200)), 120);
    },

    /* ⑩ 流星速度 */
    meteorSpeed(stage, v, done) {
        const f = pvField(stage);
        const dist = f.x1 - f.x0;
        pvLater(() => pvFly(stage, 'meteor', f.x0, f.x1, 72, dist / v, () => {
            const r = pvEl(stage, 'pv-ring', `left:${f.w - 12 - 66 + 20}px;top:62px;width:26px;height:26px`);
            const t0 = performance.now();
            const st = () => {
                const p = Math.min(1, (performance.now() - t0) / 520);
                r.style.transform = `scale(${1 + p * 2.4})`;
                r.style.opacity = String(1 - p);
                if (p < 1) _pvRaf = requestAnimationFrame(st);
                else if (r.parentNode) r.remove();
            };
            st();
            pvLater(done, 520);
        }), 120);
    },

    /* ⑪ 白骨爪速度 */
    clawSpeed(stage, v, done) {
        const f = pvField(stage);
        const dist = f.x1 - f.x0;
        pvLater(() => pvFly(stage, 'claw', f.x0, f.x1, 62, dist / v, () => pvLater(done, 200)), 120);
    },

    /* ⑫ 白骨爪起手 */
    clawStart(stage, v, done) {
        const f = pvField(stage);
        const c = pvEl(stage, 'pv-flyer claw', `left:${f.x0 - 4}px;top:62px;opacity:.15;transform:scale(.35)`);
        const t0 = performance.now();
        const st = () => {
            const p = Math.min(1, (performance.now() - t0) / Math.max(60, v));
            c.style.opacity = String(.15 + .85 * p);
            c.style.transform = `scale(${.35 + .65 * p})`;
            if (p < 1) _pvRaf = requestAnimationFrame(st);
            else { if (c.parentNode) c.remove(); pvFly(stage, 'claw', f.x0, f.x1, 62, 300, () => pvLater(done, 200)); }
        };
        st();
    },

    /* ⑬ 贴身图标 */
    closeHitDur(stage, v, done) {
        const f = pvField(stage);
        const seg = Math.max(60, Math.round(v / 3));
        const ic = pvEl(stage, 'pv-flyer block', `left:${f.x0 + 6}px;top:62px;opacity:0;transform:scale(.7)`);
        pvLater(() => {
            ic.style.transition = `all ${seg}ms cubic-bezier(.3,.9,.4,1)`;
            ic.style.left = (f.x1 - 10) + 'px';
            ic.style.opacity = '1';
            ic.style.transform = 'scale(1)';
        }, 40);
        pvLater(() => { ic.style.opacity = '0'; ic.style.transition = `opacity ${seg}ms`; }, seg * 2);
        pvLater(done, seg * 3 + 60);
    },

    /* ⑭ 冲刺演出（示意） */
    dashDur(stage, v, done) {
        const f = pvField(stage);
        const bar = pvEl(stage, 'pv-bar', '', '<i></i>');
        const fill = bar.querySelector('i');
        const t0 = performance.now();
        // 残影
        pvLater(() => {
            for (let i = 0; i < 3; i++) {
                const g = pvEl(stage, 'pv-ghost', `left:${f.x0 + i * 10}px;top:62px;opacity:${.5 - i * .14}`);
                pvLater(() => { if (g.parentNode) g.remove(); }, 700);
            }
        }, Math.round(v * .3));
        const st = () => {
            const p = Math.min(1, (performance.now() - t0) / v);
            fill.style.width = (p * 100) + '%';
            if (p < 1) _pvRaf = requestAnimationFrame(st);
            else pvLater(done, 200);
        };
        st();
        pvLater(() => pvFly(stage, 'block', f.x0, f.x1, 62, Math.round(v * .55), () => {}), Math.round(v * .32));
    },

    /* ⑮ 轰拳爆发（示意） */
    burstDur(stage, v, done) {
        const f = pvField(stage);
        const bar = pvEl(stage, 'pv-bar', '', '<i></i>');
        const fill = bar.querySelector('i');
        const fan = pvEl(stage, 'pv-fan', 'height:2px;width:2px;opacity:0');
        const t0 = performance.now();
        const st = () => {
            const p = Math.min(1, (performance.now() - t0) / v);
            fill.style.width = (p * 100) + '%';
            // 扇形：0~45% 铺开，之后淡出
            if (p < .45) {
                const q = p / .45;
                fan.style.width = (30 + 210 * q) + 'px';
                fan.style.height = (14 + 96 * q) + 'px';
                fan.style.opacity = String(.85 * q);
            } else {
                fan.style.opacity = String(.85 * (1 - (p - .45) / .55));
            }
            if (p < 1) _pvRaf = requestAnimationFrame(st);
            else { if (fan.parentNode) fan.remove(); pvLater(done, 200); }
        };
        st();
        // 命中格闪红 + 飘字
        pvLater(() => {
            f.R.style.background = 'linear-gradient(180deg,#e8756a,#c0392b)';
            f.R.style.color = '#fff';
            pvFloat(stage, f.w - 45, 46, '−420', 'dmg', 900);
            pvLater(() => { f.R.style.background = ''; f.R.style.color = ''; }, 420);
        }, Math.round(v * .42));
    },

    /* ⑯ 子弹时间（示意） */
    bulletDur(stage, v, done) {
        const f = pvField(stage);
        const bar = pvEl(stage, 'pv-bar', '', '<i></i>');
        const fill = bar.querySelector('i');
        // 舞台压暗
        const mask = pvEl(stage, '', 'position:absolute;inset:0;background:rgba(0,0,0,.55);z-index:2;opacity:0');
        const t0 = performance.now();
        const st = () => {
            const p = Math.min(1, (performance.now() - t0) / v);
            fill.style.width = (p * 100) + '%';
            mask.style.opacity = String(p < .1 ? p * 5 : (p > .88 ? (1 - p) / .12 : 1));
            if (p < 1) _pvRaf = requestAnimationFrame(st);
            else pvLater(done, 200);
        };
        st();
        // 双方对冲 + 冲击环
        pvLater(() => {
            pvFly(stage, 'block', f.x0, f.w / 2 - 46, 62, Math.round(v * .34), () => {});
            const b = pvEl(stage, 'pv-flyer block',
                `left:${f.x1}px;top:62px;background:linear-gradient(180deg,#ffd76a,#d4a017);border-color:#a07c00`);
            const bx0 = f.x1, bx1 = f.w / 2 + 16;
            const t1 = performance.now();
            const st2 = () => {
                const p = Math.min(1, (performance.now() - t1) / (v * .34));
                b.style.left = (bx0 + (bx1 - bx0) * p) + 'px';
                if (p < 1) _pvRaf = requestAnimationFrame(st2);
                else {
                    const r = pvEl(stage, 'pv-ring', `left:${f.w / 2 - 24}px;top:60px;width:48px;height:48px`);
                    const t2 = performance.now();
                    const st3 = () => {
                        const q = Math.min(1, (performance.now() - t2) / 420);
                        r.style.transform = `scale(${1 + q * 2})`;
                        r.style.opacity = String(1 - q);
                        if (q < 1) _pvRaf = requestAnimationFrame(st3);
                        else if (r.parentNode) r.remove();
                    };
                    st3();
                    pvLater(() => { if (b.parentNode) b.remove(); }, 420);
                }
            };
            st2();
        }, Math.round(v * .18));
    },

    /* ⑰ 倒计时每跳 */
    countdownTick(stage, v, done) {
        const nums = ['3', '2', '1'];
        let i = 0;
        const tick = () => {
            if (i >= nums.length) return pvLater(done, 260);
            const d = pvEl(stage, 'pv-cd', '', nums[i]);
            pvLater(() => { if (d.parentNode) d.remove(); }, v);
            i++;
            pvLater(tick, v + Math.round(v * .7));
        };
        tick();
    },

    /* ⑱ 清尸延迟 */
    corpseDelay(stage, v, done) {
        const f = pvField(stage);
        f.R.classList.add('dead');
        f.R.textContent = '✕';
        pvLater(() => {
            f.R.classList.remove('dead');
            f.R.textContent = '六大派';
        }, v);
        pvLater(done, v + 300);
    },
};

/* 副标题（按值动态算） */
function pvSubtitle(k, v, stage) {
    const fmt = n => Math.round(n);
    const w = (stage && stage.clientWidth) || 330;
    switch (k) {
        case 'charMs':        return `每字 ${v}ms ｜ 28 字整行约 ${fmt(28 * v)}ms`;
        case 'lineGap':       return `每行停 ${v}ms ｜ 5 行共约 ${fmt(5 * v)}ms`;
        case 'lineGapFx':     return `效果行停 ${v}ms ｜ 每行带飘字，比普通行慢约 9 倍`;
        case 'floatLife':     return `飘字停留 ${v}ms ｜ 每 200ms 连出 3 个`;
        case 'bubbleLife':    return `气泡停留 ${v}ms ｜ 每 300ms 连出 2 个`;
        case 'moveDur':       return `总 ${v}ms = 起手 ${pvVal('moveStart')}ms + 飞行 ${fmt(Math.max(40, v - pvVal('moveStart')))}ms`;
        case 'moveStart':     return `起手停顿 ${v}ms 后才飞 ｜ 半压缩：高倍速下不会压成 0`;
        case 'crashSpeed':    return `速度 ${v}px/ms ｜ 飞满整条轨道约 ${fmt((w - 152) / v)}ms`;
        case 'arrowSpeed':    return `速度 ${v}px/ms ｜ 飞满整条轨道约 ${fmt((w - 152) / v)}ms`;
        case 'meteorSpeed':   return `速度 ${v}px/ms ｜ 落点有冲击环，约 ${fmt((w - 152) / v)}ms 命中`;
        case 'clawSpeed':     return `速度 ${v}px/ms ｜ 飞满整条轨道约 ${fmt((w - 152) / v)}ms`;
        case 'clawStart':     return `凝结 ${v}ms 后飞出`;
        case 'closeHitDur':   return `共 ${v}ms ｜ 飞 ${fmt(v / 3)} → 停 ${fmt(v / 3)} → 淡出 ${fmt(v / 3)}`;
        case 'dashDur':       return `完整冲刺约 ${v}ms（示意，真演出含残影/超冲/震屏）`;
        case 'burstDur':      return `完整爆发约 ${v}ms（示意，真演出含扇形/碎冰/吸血）`;
        case 'bulletDur':     return `整段约 ${v}ms（示意，真演出含黑幕/克隆对峙/冲撞）`;
        case 'countdownTick': return `3-2-1 每跳 ${v}ms ｜ 共约 ${fmt(v * 3.6)}ms`;
        case 'corpseDelay':   return `死亡后保持 ${v}ms 才清空`;
        default: return '';
    }
}

// ── 弹窗外壳 ──
let _pvCloseTimer = 0;
function openPV(key) {
    if (!PV[key]) return;
    injectPvStyle();
    closePV();

    const v = pvVal(key);

    const ov = document.createElement('div');
    ov.className = 'pv-ov';
    ov.id = 'pvOverlay';
    ov.innerHTML =
        '<div class="pv-box">' +
        '<div class="pv-bhead"><div class="pv-bt"></div><div class="pv-bs"></div></div>' +
        '<div class="pv-stage" id="pvStage"></div>' +
        '<div class="pv-bfoot">点击任意处关闭</div>' +
        '</div>';
    // stopPropagation：预览遮罩在面板遮罩之上，不拦会冒泡到面板 →
    //   面板误判「点空白」把自己关掉，顺带解除 isPaused，游戏就跑起来了。
    ov.addEventListener('click', (e) => { e.stopPropagation(); closePV(); });
    document.body.appendChild(ov);

    const stage = ov.querySelector('#pvStage');
    // 先让 stage 可见，才能量出 clientWidth
    ov.classList.add('show');

    const unit = PV_MS.has(key) ? 'ms' : '';
    ov.querySelector('.pv-bt').innerHTML =
        (LABELS[key] || key) + ' <em>· ' + v + unit + '</em>';
    ov.querySelector('.pv-bs').textContent = pvSubtitle(key, v, stage);

    // 兜底：最长 12 秒强制关闭
    _pvCloseTimer = setTimeout(() => closePV(), 12000);

    pvLater(() => {
        try {
            PV[key](stage, v, () => closePV());
        } catch (e) {
            console.error('[perfPanel] 预览出错:', key, e);
            closePV();
        }
    }, 30);
}

function closePV() {
    if (_pvCloseTimer) { clearTimeout(_pvCloseTimer); _pvCloseTimer = 0; }
    pvClear();
    const ov = document.getElementById('pvOverlay');
    if (ov && ov.parentNode) ov.remove();
}

// 四档刻度：滑块停 0/1/2/3，分别取参数表这四列的出厂值
const STOPS = [
    { idx: 0, label: '慢',   key: '800' },
    { idx: 1, label: '正常', key: '300' },   // 正常 = 2x（用户日常档）
    { idx: 2, label: '快',   key: '150' },
    { idx: 3, label: '极快', key: '50'  },
];

const LABELS = {
    charMs: '每字时长', lineGap: '行间隔', lineGapFx: '效果行停留',
    floatLife: '飘字存活', bubbleLife: '气泡存活',
    moveDur: '位移总时长', moveStart: '位移起手',
    crashSpeed: '飞撞速度', arrowSpeed: '飞箭速度', meteorSpeed: '流星速度',
    clawSpeed: '白骨爪速度', clawStart: '白骨爪起手',
    closeHitDur: '贴身图标',
    dashDur: '冲刺演出', burstDur: '轰拳爆发', bulletDur: '子弹时间',
    countdownTick: '倒计时每跳', corpseDelay: '清尸延迟',
};

// 第 B 类清单（未进表、跟随倍速的演出）。由扫描结果填入，供「ⓘ」按钮展示。
//   列在这里只是给人看，不参与计算——速度由「未进表倍率」统一控制。
const NO_TABLE_LIST = [
    '蝶变飞出 / 飞回（fx/86）', '蛛变升天 / 降落（fx/86）',
    '蛛袭扑击（fx/86）', '惑心换位（fx/83）',
    '击退 / 推挤（fx/84）', '狮吼冲击波（fx/91）',
    '胖远桥金锥 / 打歪（fx/92）', '护罩碎裂（fx/95）',
    '死亡画笔 / 各类横幅气泡（fx/88 · fx/80）',
    '寒离飒蓄力起手（fx/90）', '动作层连击 / 起跳收尾（render/39）',
    'Buff 面板提示 / 事件提示（player/41 · player/45）',
];

// 四档绝对值 [慢, 正常, 快, 极快]。
//   中间 = 用户实机调定的那套；左右围绕中间重算：
//     时长类（越大越慢）慢 ×2 / 快 ×0.6 / 极快 ×0.4
//     速度类（越大越快）慢 ×0.4 / 快 ×1.6 / 极快 ×2.4
//   为什么不再从 core 四列拼：core 的 '800'/'400'/'300'/'150' 是历史上逐项手调的散值，
//   中间档落进去会与相邻档重复或反序（实测 7 项：行间隔/效果行停留/飘字存活/气泡存活/
//   位移总时长/位移起手/清尸延迟），四档必须由一张表统一给出，保证严格单调。
const PV_TIERS = Object.freeze({
    charMs:        [48, 24, 14, 10],
    lineGap:       [20, 10, 6, 4],
    lineGapFx:     [224, 112, 67, 45],
    floatLife:     [1300, 650, 390, 260],
    bubbleLife:    [1400, 700, 420, 280],
    moveDur:       [2000, 1000, 600, 400],
    moveStart:     [180, 90, 54, 36],
    crashSpeed:    [0.18, 0.45, 0.72, 1.08],
    arrowSpeed:    [1.60, 4.00, 6.40, 9.60],
    meteorSpeed:   [0.52, 1.30, 2.08, 3.12],
    clawSpeed:     [0.52, 1.30, 2.08, 3.12],
    clawStart:     [240, 120, 72, 48],
    closeHitDur:   [1400, 700, 420, 280],
    dashDur:       [3400, 1700, 1020, 680],
    burstDur:      [4600, 2300, 1380, 920],
    bulletDur:     [6000, 3000, 1800, 1200],
    countdownTick: [800, 400, 240, 160],
    corpseDelay:   [6000, 3000, 1800, 1200],
});

// 出厂默认刻度（用户实机调定）：0=慢 1=正常 2=快 3=极快
//   与 core/23 的 '50' 列无关——面板加载时 applyAllStops() 会按这张表把 '50' 列写成对应档位的值。
const DEFAULT_STOPS = Object.freeze({
    charMs: 1,
    lineGap: 1,
    lineGapFx: 1,
    floatLife: 1,
    bubbleLife: 1,
    moveDur: 1,
    moveStart: 1,
    crashSpeed: 1,
    arrowSpeed: 1,
    meteorSpeed: 1,
    clawSpeed: 1,
    clawStart: 1,
    closeHitDur: 1,
    dashDur: 1,
    burstDur: 1,
    bulletDur: 1,
    countdownTick: 1,
    corpseDelay: 1,
});

// 当前每项的刻度索引（0~3）；无存档 / 恢复默认时取 DEFAULT_STOPS
let _stops = Object.assign({}, DEFAULT_STOPS);

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return;
        // 旧版存档存的是原始数值（毫秒 / px per ms），不是 0~3 刻度 —— 整份作废，按出厂默认刻度走
        let valid = true;
        for (const k of Object.keys(data)) {
            if (k === '_noTableScale') continue;
            if (!LABELS[k] || typeof data[k] !== 'number') continue;
            const n = data[k];
            if (!(n >= 0 && n <= 3) || n !== Math.floor(n)) { valid = false; break; }
        }
        if (!valid) return;
        if (typeof data._noTableScale === 'number') setNoTableScale(data._noTableScale);
        for (const k of Object.keys(data)) {
            if (k === '_noTableScale') continue;
            if (LABELS[k] && typeof data[k] === 'number') _stops[k] = data[k];
        }
    } catch (e) { /* 坏档忽略 */ }
}

function saveToStorage() {
    try {
        const out = { _noTableScale: getNoTableScale() };
        for (const k of Object.keys(LABELS)) out[k] = _stops[k] ?? DEFAULT_STOPS[k] ?? 1;
        localStorage.setItem(LS_KEY, JSON.stringify(out));
        return true;
    } catch (e) { return false; }
}

// 把某一项的刻度索引换算成参数表对应列的值，写进 '50' 列
function applyStop(key, idx) {
    const tiers = PV_TIERS[key];
    if (!tiers) return;
    const v = tiers[idx];
    if (typeof v !== 'number') return;
    const patch = {};
    patch[key] = {};
    patch[key][TIER] = v;
    setPerfParams(patch);
}

function applyAllStops() {
    for (const k of Object.keys(LABELS)) {
        if (_stops[k] == null) _stops[k] = DEFAULT_STOPS[k] ?? 1;
        applyStop(k, _stops[k]);
    }
}

function makeBtn(text, bg, onClick) {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `flex:1;padding:9px 2px;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:bold;background:${bg};color:#fff;`;
    b.onclick = onClick;
    return b;
}

function openPanel() {
    const old = document.getElementById('perfPanelOverlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'perfPanelOverlay';
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '100040';

    const box = document.createElement('div');
    box.className = 'modal-box';
    // 三段布局：flex 竖排，中间区 flex:1 + overflow
    box.style.cssText = 'max-width:420px;width:94vw;height:72vh;padding:0;text-align:left;display:flex;flex-direction:column;overflow:hidden;';

    // ── 头（固定） ──
    const head = document.createElement('div');
    head.style.cssText = 'flex-shrink:0;padding:14px 14px 10px;border-bottom:2px solid #e8d5b0;';
    const title = document.createElement('div');
    title.textContent = '⚙ 自定义档（8x） v3.3.0';
    title.style.cssText = 'font-size:15px;font-weight:bold;color:#5c4033;text-align:center;margin-bottom:10px;';
    head.appendChild(title);

    // 第一行：未进表倍率
    const nr = document.createElement('div');
    nr.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;';
    const nrLabel = document.createElement('span');
    nrLabel.textContent = '未进表倍率';
    nrLabel.style.cssText = 'font-size:11px;color:#5c4033;width:86px;flex-shrink:0;';
    const nrSel = document.createElement('select');
    nrSel.style.cssText = 'flex:1;padding:5px;border:1px solid #ccc;border-radius:5px;font-size:12px;background:#fff;';
    [[0.5,'0.5 慢'],[1,'1 原速'],[2,'2 快'],[4,'4 极快']].forEach(([v, t]) => {
        const o = document.createElement('option');
        o.value = String(v); o.textContent = t;
        if (Math.abs(getNoTableScale() - v) < 0.001) o.selected = true;
        nrSel.appendChild(o);
    });
    nrSel.onchange = () => {
        const v = parseFloat(nrSel.value);
        setNoTableScale(v);
        // 立即生效：当前就在自定义档，直接改时钟倍率，不必重开面板/重切档位
        if (GlobalStore.get('speed') === 50) clock.setTimescale(getNoTableScale());
    };
    nr.appendChild(nrLabel); nr.appendChild(nrSel);
    head.appendChild(nr);

    const info = document.createElement('div');
    info.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 0 0;';
    const infoBtn = makeBtn('ⓘ 哪些不进表', '#8b7355', () => {
        alert('以下演出不进参数表，速度由上面的「未进表倍率」统一控制：\n\n' + NO_TABLE_LIST.map(s => '· ' + s).join('\n'));
    });
    infoBtn.style.cssText += 'font-size:10px;padding:5px 2px;';
    info.appendChild(infoBtn);
    head.appendChild(info);
    box.appendChild(head);

    // ── 中（滚动） ──
    const mid = document.createElement('div');
    mid.style.cssText = 'flex:1;overflow-y:auto;padding:4px 14px;';

    for (const key of Object.keys(LABELS)) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:9px 2px;min-height:44px;border-bottom:1px solid #eee;';

        const label = document.createElement('span');
        label.textContent = LABELS[key];
        // 可点：弹出该项的演示（值取当前 8x 档实际生效值）
        label.className = 'pv-lbl';
        label.style.cssText = 'font-size:11px;color:#5c4033;width:78px;flex-shrink:0;';
        label.addEventListener('click', (ev) => {
            ev.stopPropagation();
            openPV(key);
        });

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0'; slider.max = '3'; slider.step = '1';
        slider.value = String(_stops[key] ?? DEFAULT_STOPS[key] ?? 1);
        slider.style.cssText = 'flex:1;accent-color:#b8860b;min-width:0;height:26px;';

        const val = document.createElement('span');
        val.style.cssText = 'font-size:11px;color:#8b7355;width:34px;text-align:right;flex-shrink:0;';
        val.textContent = STOPS[_stops[key] ?? DEFAULT_STOPS[key] ?? 1].label;

        slider.oninput = () => {
            const idx = Math.max(0, Math.min(3, parseInt(slider.value, 10) || 0));
            _stops[key] = idx;
            val.textContent = STOPS[idx].label;
            applyStop(key, idx);
        };

        row.append(label, slider, val);
        mid.appendChild(row);
    }
    box.appendChild(mid);

    // ── 底（固定） ──
    const foot = document.createElement('div');
    foot.style.cssText = 'flex-shrink:0;padding:10px 14px 14px;border-top:2px solid #e8d5b0;background:var(--c-panel,#fdf5e6);';

    const row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;gap:6px;';
    row1.appendChild(makeBtn('💾 保存', '#4caf50', () => {
        alert(saveToStorage() ? '✅ 已保存' : '保存失败');
    }));
    row1.appendChild(makeBtn('📤 导出', '#1e6bb8', exportJson));
    row1.appendChild(makeBtn('📥 导入', '#8e44ad', importJson));
    foot.appendChild(row1);

    const row2 = document.createElement('div');
    row2.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
    row2.appendChild(makeBtn('↺ 恢复默认', '#95a5a6', () => {
        if (!confirm('恢复所有项为出厂默认并清掉本地存档？')) return;
        try { localStorage.removeItem(LS_KEY); } catch (e) {}
        _stops = Object.assign({}, DEFAULT_STOPS);
        resetNoTableScale();
        resetPerfParams();
        applyAllStops();            // 必须：resetPerfParams 把 '50' 列还原成 core 出厂值，
                                    //   不跑这一步，面板显示的刻度与实际生效值会脱节
        clock.setTimescale(getNoTableScale());
        overlay.remove();
        openPanel();
    }));
    row2.appendChild(makeBtn('关闭', '#666', closePanel));
    foot.appendChild(row2);

    box.appendChild(foot);

    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePanel(); });
    document.body.appendChild(overlay);
}

function closePanel() {
    const overlay = document.getElementById('perfPanelOverlay');
    if (overlay) overlay.remove();
    if (GlobalStore.get('isPaused')) {
        GlobalStore.set('isPaused', false);
        GlobalStore.set('bulletTimeActive', false);
        document.body.classList.remove('paused-animations');
    }
}

function exportJson() {
    const out = { _noTableScale: getNoTableScale() };
    for (const k of Object.keys(LABELS)) out[k] = _stops[k] ?? 1;
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'custom-8x-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function importJson() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        try {
            const data = JSON.parse(await f.text());
            if (typeof data._noTableScale === 'number') setNoTableScale(data._noTableScale);
            // 先复位到出厂默认，再用文件里有的项覆盖（缺项 → 新默认，不再落到「正常」）
            _stops = Object.assign({}, DEFAULT_STOPS);
            for (const k of Object.keys(data)) {
                if (k === '_noTableScale') continue;
                if (LABELS[k] && typeof data[k] === 'number') _stops[k] = Math.max(0, Math.min(3, data[k] | 0));
            }
            applyAllStops();
            if (GlobalStore.get('speed') === 50) clock.setTimescale(getNoTableScale());
            const overlay = document.getElementById('perfPanelOverlay');
            if (overlay) overlay.remove();
            openPanel();
            alert('✅ 已导入');
        } catch (e) { alert('导入失败: ' + e.message); }
    };
    inp.click();
}

GlobalStore.setUIHandler('openPerfPanel', openPanel);

loadFromStorage();
applyAllStops();   // 把刻度落地成 '50' 列的实际值（无存档 = DEFAULT_STOPS）
