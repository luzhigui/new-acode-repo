// ui/80perf-panel.js — 自定义档（8x）参数面板
// 每项一个四档滑块：慢(0.5x) / 正常(2x) / 快(4x) / 极快(8x)，默认全停「正常」。
//   滑块位置 → 直接取参数表对应列的出厂值，不改出厂表本身。
// 第一行「未进表倍率」：控制所有未进参数表的演出（蝶变/换位/击退等），四档 0.5/1/2/4。
// 头/中/底三段：标题+倍率固定顶部，滑块区滚动，按钮固定底部。
// V3.1.0 | 2026-10-26 | 18 项参数标签可点弹预览：独立计时（面板打开时游戏时钟冻结，不能用 clock）、
//   pv-* 独立样式（不复用 fixed 的弹幕类与 6.2dvh 的格子类）；后三项（冲刺/轰拳/子弹时间）标注「示意」
// V3.0.1 | 2026-10-26 | 跟随 core/23 去锚定化：删「锚点行每字」、加「效果行停留」（lineGapFx）
// V3.0.0 | 2026-10-26 | 四档滑块 + 未进表倍率 + 三段布局 + 清单按钮
// V2.0.2 | 2026-10-26 | 滑块行加高（40px 行高 / 24px 滑块）+ 弹窗高度 88vh→72vh
export const VER = 'ui/80perf-panel.js V3.1.0';

import { GlobalStore } from '../infra/54-global-store.js';
import { clock } from '../infra/52-clock.js';
import { getPerfParams, setPerfParams, resetPerfParams, getNoTableScale, setNoTableScale, resetNoTableScale } from '../core/23perf-params.js';

const TIER = '50';           // 自定义档 = 8x
const LS_KEY = 'ming_perf_custom_8x_v1';

// ══════════════════════════════════════════════════════════════
// 参数预览（点标签弹出演示）
//   面板打开时游戏时钟冻结（isPaused），所以这里全部用独立的
//   setTimeout / requestAnimationFrame，不走 clock。
//   样式也不复用游戏类（.danmaku-bubble 是 fixed、.cell 是 6.2dvh），
//   统一 pv-* 前缀，注入一次。
// ══════════════════════════════════════════════════════════════
let _pvStyleInjected = false;
function injectPvStyle() {
    if (_pvStyleInjected) return;
    _pvStyleInjected = true;
    const st = document.createElement('style');
    st.id = 'pvStyle';
    st.textContent = `
.pv-ov { position:fixed; inset:0; background:rgba(0,0,0,.72); z-index:100060;
         display:none; align-items:center; justify-content:center; }
.pv-ov.show { display:flex; }
.pv-box { width:92vw; max-width:400px; background:#fdf5e6; border:3px double #8b7355;
          border-radius:12px; overflow:hidden; box-shadow:0 12px 40px rgba(0,0,0,.55); }
.pv-head { padding:10px 12px 8px; text-align:center; border-bottom:1px solid #e8d5b0; }
.pv-t { font-size:13px; font-weight:bold; color:#5c4033; }
.pv-s { font-size:10px; color:#8b7355; margin-top:3px; line-height:1.55; }
.pv-stage { position:relative; height:150px; background:#d9d0b5; margin:8px;
            border:2px solid #b8a88a; border-radius:6px; overflow:hidden; }
.pv-foot { padding:6px 12px 10px; font-size:10px; color:#8b7355; text-align:center; }
.pv-cell { position:absolute; left:12px; top:54px; width:76px; height:40px;
           background:#e8e6e0; border:2px solid #bbb; border-radius:5px;
           display:flex; align-items:center; justify-content:center;
           font-size:9px; color:#555; }
.pv-line { position:absolute; left:98px; right:10px; top:46px; font-size:11px;
           line-height:1.6; color:#333; }
.pv-log { position:absolute; left:98px; right:8px; top:22px; bottom:8px;
          font-size:10px; line-height:1.55; color:#333; overflow:hidden; }
.pv-row { margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pv-mover { position:absolute; top:64px; width:34px; height:26px; border-radius:4px;
            border:2px solid #0d47a1; }
.pv-float { position:absolute; font-size:13px; font-weight:bold; white-space:nowrap;
            pointer-events:none; animation-name:pvFloatUp;
            animation-timing-function:ease-out; animation-fill-mode:forwards; }
.pv-float.dmg { color:#c0392b; }
.pv-float.heal { color:#2e7d32; }
.pv-float.atk { color:#d2691e; }
@keyframes pvFloatUp {
    0%   { opacity:0; transform:translateY(0) scale(.8); }
    12%  { opacity:1; transform:translateY(-7px) scale(1.1); }
    65%  { opacity:1; }
    100% { opacity:0; transform:translateY(-30px) scale(.95); }
}
.pv-bubble { position:absolute; left:14px; font-size:11px; font-weight:bold;
             padding:5px 10px; border-radius:6px; background:rgba(30,110,180,.85);
             color:#fff; white-space:nowrap; box-shadow:0 3px 10px rgba(0,0,0,.3);
             opacity:0; animation-name:pvBubbleIn;
             animation-timing-function:ease-out; animation-fill-mode:forwards; }
@keyframes pvBubbleIn {
    0%   { opacity:0; transform:translate(4px,0) scale(.7); }
    15%  { opacity:1; transform:translate(0,0) scale(1.05); }
    25%  { transform:translate(0,0) scale(1); }
    100% { opacity:1; transform:translate(0,0) scale(1); }
}
.pv-num { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
          font-size:44px; font-weight:bold; color:#ffd700;
          text-shadow:0 0 20px rgba(255,215,0,.8); }
.pv-chip { position:absolute; border-radius:4px; }
.pv-sweep { position:absolute; top:30px; left:0; height:8px; border-radius:4px;
            background:linear-gradient(90deg,rgba(255,215,0,.2),#ffd700); }
.pv-fan { position:absolute; left:12px; top:75px; width:0; height:0;
          border-radius:50%; transform-origin:0 50%;
          background:radial-gradient(ellipse at 0% 50%, rgba(255,215,0,.9), rgba(255,150,60,.35) 45%, transparent 75%); }
.pv-label { cursor:pointer; text-decoration:underline dotted #1e6bb8;
            text-underline-offset:3px; }
.pv-label:active { color:#0d4f8b; }
`;
    document.head.appendChild(st);
}

// ── 预览计时器（独立于游戏时钟）──
let _pvTimers = [];
let _pvRaf = 0;
function pvClear() {
    _pvTimers.forEach(clearTimeout); _pvTimers = [];
    if (_pvRaf) { cancelAnimationFrame(_pvRaf); _pvRaf = 0; }
    const st = document.getElementById('pvStage');
    if (st) st.innerHTML = '';
}
function pvLater(fn, ms) { _pvTimers.push(setTimeout(fn, ms)); }

function pvMake(stage, cls, css, html) {
    const d = document.createElement('div');
    d.className = cls;
    if (css) d.style.cssText = css;
    if (html) d.innerHTML = html;
    stage.appendChild(d);
    return d;
}
function pvCell(stage, txt) { return pvMake(stage, 'pv-cell', null, txt || '明教 张无忌'); }

// 飘字：CSS 动画跑 life 毫秒，到时移除
function pvFloat(stage, x, y, txt, kind, life) {
    const el = pvMake(stage, 'pv-float ' + (kind || 'dmg'),
        `left:${x}px;top:${y}px;animation-duration:${life}ms;`, txt);
    pvLater(() => { if (el.parentNode) el.remove(); }, life + 120);
    return el;
}
// 气泡：出现后按 life 消失（无淡出，与游戏一致）
function pvBubble(stage, y, txt, life) {
    const el = pvMake(stage, 'pv-bubble',
        `top:${y}px;animation-duration:${Math.min(600, life * 0.4)}ms;`, txt);
    el.style.opacity = '1';
    pvLater(() => { if (el.parentNode) el.remove(); }, life);
    return el;
}
// 横向飞行：从 x0 到 x1，dur 毫秒
function pvFly(stage, dur, color, onEnd) {
    const w = stage.clientWidth || 320;
    const box = pvMake(stage, 'pv-mover', `background:${color || '#1e6bb8'};`);
    const x0 = 12, x1 = Math.max(x0 + 40, w - 46);
    const t0 = performance.now();
    const step = () => {
        const p = Math.min(1, (performance.now() - t0) / Math.max(16, dur));
        box.style.left = (x0 + (x1 - x0) * p) + 'px';
        if (p < 1) _pvRaf = requestAnimationFrame(step);
        else { box.style.opacity = '0'; if (onEnd) onEnd(); }
    };
    step();
}

// ── 18 项演示定义。run(stage, v, done)：v = 当前 8x 档实际值 ──
const PERF_PREVIEW = {
    charMs: {
        title: '每字时长',
        sub: (v) => `每字 ${v}ms，28 字整行约 ${28 * v}ms（真实毫秒，不吃倍速）`,
        run(stage, v, done) {
            const line = pvMake(stage, 'pv-line');
            const txt = '明教 张无忌(攻34 血135) → 六大派 少林弟子(防22 血54)';
            const t0 = performance.now(), total = txt.length * v;
            const step = () => {
                const p = Math.min(1, (performance.now() - t0) / total);
                line.textContent = txt.slice(0, Math.floor(txt.length * p));
                if (p < 1) _pvRaf = requestAnimationFrame(step);
                else done();
            };
            step();
        }
    },

    lineGap: {
        title: '行间隔',
        sub: (v) => `普通行停 ${v}ms，5 行共约 ${5 * v}ms（波动/计算/破防这类）`,
        run(stage, v, done) {
            const box = pvMake(stage, 'pv-log');
            const L = [
                '波动：攻34→38 防22→26 减伤2',
                '计算：38×(38/(38+26)) = 22.56',
                '🗡️ 张无忌 破防：少林弟子 防御 -2',
                '☄️ 流星赶月加深：少林弟子 额外-20',
                '🎯 目标已眩晕，本回合无法行动'
            ];
            let i = 0;
            const next = () => {
                if (i >= L.length) return done();
                pvMake(box, 'pv-row', null, L[i++]);
                pvLater(next, v);
            };
            next();
        }
    },

    lineGapFx: {
        title: '效果行停留',
        sub: (v) => `效果行停 ${v}ms（回血/加攻/乾坤这类，比普通行慢 9 倍）`,
        run(stage, v, done) {
            pvCell(stage);
            const box = pvMake(stage, 'pv-log');
            const L = [
                { t: '☀️ 九阳神功回复+12，135→147', f: ['💚+12', 'heal'] },
                { t: '⚔️ 乾坤衍生：攻击+2', f: ['⚔+2', 'atk'] },
                { t: '🛡️ 坚盾：防御+1（已叠1/4）', f: ['🛡+1', 'atk'] }
            ];
            let i = 0;
            const next = () => {
                if (i >= L.length) return done();
                const it = L[i++];
                pvMake(box, 'pv-row', null, it.t);
                pvFloat(stage, 20 + Math.random() * 8, 50 - Math.random() * 6, it.f[0], it.f[1], 1200);
                pvLater(next, v);
            };
            next();
        }
    },

    floatLife: {
        title: '飘字存活',
        sub: (v) => `飘字停留 ${v}ms；每 200ms 连出 3 个，看能叠几层`,
        run(stage, v, done) {
            pvCell(stage);
            ['💥-16', '💥-27', '💥-17'].forEach((t, i) => {
                pvLater(() => pvFloat(stage, 94 + i * 4, 46 - i * 3, t, 'dmg', v), i * 200);
            });
            pvLater(done, 400 + v);
        }
    },

    bubbleLife: {
        title: '气泡存活',
        sub: (v) => `气泡停留 ${v}ms；每 300ms 连出 2 个（击杀弹幕/闪避气泡）`,
        run(stage, v, done) {
            pvCell(stage);
            pvLater(() => pvBubble(stage, 20, '六大派也不过如此！', v), 0);
            pvLater(() => pvBubble(stage, 58, '闪避！', v), 300);
            pvLater(done, 300 + v);
        }
    },

    moveDur: {
        title: '位移总时长',
        sub: (v) => {
            const s = getPerfParams().moveStart['50'] || 0;
            return `总 ${v}ms = 起手 ${s}ms + 飞行 ${Math.max(40, v - s)}ms`;
        },
        run(stage, v, done) {
            pvCell(stage);
            const s = getPerfParams().moveStart['50'] || 0;
            pvLater(() => pvFly(stage, Math.max(40, v - s), '#1e6bb8', done), s);
        }
    },

    moveStart: {
        title: '位移起手',
        sub: (v) => `起手停顿 ${v}ms 后才开始飞（半压缩：高倍速下不会压成 0）`,
        run(stage, v, done) {
            pvCell(stage);
            const cell = stage.querySelector('.pv-cell');
            cell.style.transition = `transform ${Math.max(80, v)}ms ease-out`;
            cell.style.transform = 'scale(1.12)';
            pvLater(() => { cell.style.transform = 'scale(1)'; }, v);
            pvLater(() => pvFly(stage, 260, '#1e6bb8', done), v);
        }
    },

    crashSpeed: {
        title: '飞撞速度',
        sub: (v) => `固定飞 300px，耗时 ≈ ${Math.round(300 / v)}ms（越大越快）`,
        run(stage, v, done) { pvCell(stage); pvLater(() => pvFly(stage, Math.max(60, 300 / v), '#1e6bb8', done), 80); }
    },

    arrowSpeed: {
        title: '飞箭速度',
        sub: (v) => `固定飞 400px，耗时 ≈ ${Math.round(400 / v)}ms`,
        run(stage, v, done) { pvCell(stage); pvLater(() => pvFly(stage, Math.max(60, 400 / v), '#8B4513', done), 80); }
    },

    meteorSpeed: {
        title: '流星速度',
        sub: (v) => `固定飞 500px，耗时 ≈ ${Math.round(500 / v)}ms（带金色尾迹）`,
        run(stage, v, done) {
            pvCell(stage);
            const trail = pvMake(stage, 'pv-sweep', 'width:0;opacity:.0;');
            pvLater(() => { trail.style.opacity = '.85'; }, 40);
            pvLater(() => pvFly(stage, Math.max(60, 500 / v), '#FFD700', done), 80);
        }
    },

    clawSpeed: {
        title: '白骨爪速度',
        sub: (v) => `近距离飞 250px，耗时 ≈ ${Math.round(250 / v)}ms（近处也不卡）`,
        run(stage, v, done) { pvCell(stage); pvLater(() => pvFly(stage, Math.max(60, 250 / v), '#8e44ad', done), 80); }
    },

    clawStart: {
        title: '白骨爪起手',
        sub: (v) => `爪子凝结 ${v}ms，然后飞出去`,
        run(stage, v, done) {
            pvCell(stage);
            const c = pvMake(stage, 'pv-chip', 'left:70px;top:60px;width:26px;height:26px;background:#8e44ad;opacity:.2;border-radius:50%;');
            const t0 = performance.now();
            const step = () => {
                const p = Math.min(1, (performance.now() - t0) / Math.max(40, v));
                c.style.opacity = String(0.2 + 0.8 * p);
                c.style.transform = `scale(${0.4 + 0.6 * p})`;
                if (p < 1) _pvRaf = requestAnimationFrame(step);
                else { c.remove(); pvFly(stage, 260, '#8e44ad', done); }
            };
            step();
        }
    },

    closeHitDur: {
        title: '贴身图标时长',
        sub: (v) => `同格/相邻格近战：飞 ${Math.round(v / 3)}ms → 停 ${Math.round(v / 3)}ms → 淡出 ${Math.round(v / 3)}ms`,
        run(stage, v, done) {
            const cell = pvCell(stage);
            const seg = Math.max(60, Math.round(v / 3));
            const icon = pvMake(stage, 'pv-chip', `left:${cell.offsetLeft + cell.offsetWidth - 6}px;top:56px;width:30px;height:30px;background:#1e6bb8;border:2px solid #0d47a1;opacity:0;`);
            pvLater(() => {
                icon.style.transition = `transform ${seg}ms ease-out, opacity ${seg}ms`;
                icon.style.transform = 'translateX(34px)';
                icon.style.opacity = '1';
            }, 20);
            pvLater(() => { icon.style.opacity = '0'; }, seg * 2);
            pvLater(done, seg * 3);
        }
    },

    countdownTick: {
        title: '倒计时每跳',
        sub: (v) => `3-2-1 每跳 ${v}ms，共约 ${Math.round(v * 3.6)}ms`,
        run(stage, v, done) {
            const nums = ['3', '2', '1'];
            let i = 0;
            const next = () => {
                if (i >= nums.length) return done();
                const el = pvMake(stage, 'pv-num', null, nums[i++]);
                pvLater(() => { if (el.parentNode) el.remove(); }, v);
                pvLater(next, v + Math.round(v * 0.7));
            };
            next();
        }
    },

    corpseDelay: {
        title: '清尸延迟',
        sub: (v) => `死亡后格子保持 ${v}ms 才清空（期间红底 ✕）`,
        run(stage, v, done) {
            const cell = pvCell(stage);
            cell.style.background = '#e74c3c';
            cell.style.color = '#fff';
            cell.textContent = '✕';
            pvLater(() => {
                cell.style.background = '#e8e6e0';
                cell.style.color = '#999';
                cell.textContent = '空';
            }, v);
            pvLater(done, v + 300);
        }
    },

    dashDur: {
        title: '冲刺演出（示意）',
        sub: (v) => `完整冲刺约 ${v}ms；真实演出含残影/超冲/震屏，此处只示意节奏`,
        run(stage, v, done) {
            pvCell(stage);
            const g1 = pvMake(stage, 'pv-chip', 'left:20px;top:58px;width:32px;height:28px;background:rgba(30,107,184,.35);');
            pvLater(() => { g1.remove(); pvFly(stage, v, '#1e6bb8', done); }, Math.round(v * 0.25));
        }
    },

    burstDur: {
        title: '轰拳爆发（示意）',
        sub: (v) => `完整爆发约 ${v}ms；真实演出含扇形冲击/碎冰/吸血，此处只示意节奏`,
        run(stage, v, done) {
            pvCell(stage);
            const fan = pvMake(stage, 'pv-fan', 'width:0;height:0;');
            const t0 = performance.now();
            const step = () => {
                const p = Math.min(1, (performance.now() - t0) / Math.max(100, v));
                const w = 30 + 200 * p;
                fan.style.width = w + 'px';
                fan.style.height = (18 + 90 * p) + 'px';
                fan.style.opacity = String(1 - p * 0.85);
                if (p < 1) _pvRaf = requestAnimationFrame(step);
                else done();
            };
            step();
        }
    },

    bulletDur: {
        title: '子弹时间（示意）',
        sub: (v) => `整段约 ${v}ms；真实演出含黑幕/克隆对峙/冲撞，此处只示意总长`,
        run(stage, v, done) {
            const w = stage.clientWidth || 320;
            const a = pvMake(stage, 'pv-chip', `left:0;top:52px;width:28px;height:30px;background:#1e6bb8;`);
            const b = pvMake(stage, 'pv-chip', `left:${w - 28}px;top:82px;width:28px;height:30px;background:#ffd700;`);
            const t0 = performance.now();
            const step = () => {
                const p = Math.min(1, (performance.now() - t0) / Math.max(200, v));
                const mid = (w - 56) / 2;
                a.style.left = (mid * Math.min(1, p * 2)) + 'px';
                b.style.left = (w - 28 - mid * Math.min(1, p * 2)) + 'px';
                if (p >= 1) { a.remove(); b.remove(); done(); }
                else _pvRaf = requestAnimationFrame(step);
            };
            step();
        }
    }
};

// ── 弹窗外壳 ──
let _pvCloseTimer = 0;
function openPreview(key) {
    const def = PERF_PREVIEW[key];
    if (!def) return;
    injectPvStyle();
    closePreview(true);

    const v = (getPerfParams()[key] || {})['50'] || 0;

    const ov = document.createElement('div');
    ov.className = 'pv-ov';
    ov.id = 'pvOverlay';
    ov.innerHTML =
        '<div class="pv-box">' +
        '<div class="pv-head"><div class="pv-t"></div><div class="pv-s"></div></div>' +
        '<div class="pv-stage" id="pvStage"></div>' +
        '<div class="pv-foot">点击任意处关闭</div>' +
        '</div>';
    ov.addEventListener('click', () => closePreview());
    document.body.appendChild(ov);

    ov.querySelector('.pv-t').textContent = (LABELS[key] || key) + ' · ' + v;
    ov.querySelector('.pv-s').innerHTML = def.sub ? def.sub(v) : '';
    ov.classList.add('show');

    const stage = ov.querySelector('#pvStage');

    // 兜底：最长 12 秒强制关闭（bulletDur 上限 8000 + 缓冲）
    _pvCloseTimer = setTimeout(() => closePreview(), 12000);

    try {
        def.run(stage, v, () => {
            clearTimeout(_pvCloseTimer);
            _pvCloseTimer = setTimeout(() => closePreview(), 600);
        });
    } catch (e) {
        console.error('[prefPanel] 预览出错:', key, e);
        closePreview();
    }
}

function closePreview(silent) {
    if (_pvCloseTimer) { clearTimeout(_pvCloseTimer); _pvCloseTimer = 0; }
    pvClear();
    const ov = document.getElementById('pvOverlay');
    if (ov && ov.parentNode) ov.remove();
    if (!silent) { /* 关闭后不恢复运行：面板还开着 */ }
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

// 当前每项的刻度索引（0~3），默认 1 = 正常
let _stops = {};

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return;
        // 旧版存档存的是原始数值（毫秒 / px per ms），不是 0~3 刻度 —— 整份作废，按默认「正常」走
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
        for (const k of Object.keys(LABELS)) out[k] = _stops[k] ?? 1;
        localStorage.setItem(LS_KEY, JSON.stringify(out));
        return true;
    } catch (e) { return false; }
}

// 把某一项的刻度索引换算成参数表对应列的值，写进 '50' 列
function applyStop(key, idx) {
    const stop = STOPS[idx];
    if (!stop) return;
    const params = getPerfParams();
    const row = params[key];
    if (!row) return;
    const v = row[stop.key];
    if (typeof v !== 'number') return;
    const patch = {};
    patch[key] = {};
    patch[key][TIER] = v;
    setPerfParams(patch);
}

function applyAllStops() {
    for (const k of Object.keys(LABELS)) {
        if (_stops[k] == null) _stops[k] = 1;
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
    title.textContent = '⚙ 自定义档（8x）';
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
        label.className = 'pv-label';
        label.style.cssText = 'font-size:11px;color:#5c4033;width:78px;flex-shrink:0;';
        label.addEventListener('click', (ev) => {
            ev.stopPropagation();
            openPreview(key);
        });

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0'; slider.max = '3'; slider.step = '1';
        slider.value = String(_stops[key] ?? 1);
        slider.style.cssText = 'flex:1;accent-color:#b8860b;min-width:0;height:26px;';

        const val = document.createElement('span');
        val.style.cssText = 'font-size:11px;color:#8b7355;width:34px;text-align:right;flex-shrink:0;';
        val.textContent = STOPS[_stops[key] ?? 1].label;

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
        if (!confirm('恢复所有项为「正常」并清掉本地存档？')) return;
        try { localStorage.removeItem(LS_KEY); } catch (e) {}
        _stops = {};
        resetNoTableScale();
        resetPerfParams();
        applyAllStops();            // 刻度落地：让面板显示的「正常」与实际值一致
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
applyAllStops();   // 把刻度落地成 '50' 列的实际值（出厂时全停「正常」，等价于 2x 档的值）
