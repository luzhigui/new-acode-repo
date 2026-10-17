// fx/90-hanlisa-charge.js — 寒离飒「蓄力」扇形指示（常驻）
//   · 扇面顶点 = #allyGrid [data-pos=2] 格心，两翼 = #enemyGrid [data-pos=7] / [data-pos=9] 格心
//     （按格子的 data-pos 取，不看该格上有没有单位——空位也照样画，扇面全程笼罩战场）
//   · 蓄力期间常驻扇面，由一个 clock tween 把浓度由 0.35 渐深到 1.0（描边同步加粗）
//   · 扇面形制＝变体A（老板自 demo tools/126 选定）：弧边（非直边三角）+ 金→冰蓝线性渐变 + 柔光（feGaussianBlur）
//   · 真伤格（敌 2/5/8）白内发光、半伤格（敌 4/6/7/9）红棕底；色浓度走 CSS 变量 --hls-a
// V1.3.0 | 2026-10-17 扇面形制改「变体A」：直边三角 → 弧边 + 金→冰蓝渐变 + 柔光 + 金色描边（与 fx/93 同风格）
// V1.2.0 | 2026-10-17 爆发演出交 fx/93（FX_SIGNALS.HANLISA_BURST），删本文件 900ms 爆发段与 _hlsBurstAt 读取
// V1.1.0 | ~5.4 KB | 2026-10-17 修「扇形完全不显示」（旧版按 7/9 格上有没有单位去找坐标，
//          敌方 9 号位空位即整场不画）+ 补爆发长演出（对标腕豪蓄力轰拳：命中动画明显长于普攻）
// V1.0.0 | ~2.6 KB | 2026-10-17 新建
import { clock } from '../infra/52-clock.js';

export const VER = 'fx/90-hanlisa-charge.js V1.3.0';

const SVGNS = 'http://www.w3.org/2000/svg';
const FAN_ID = 'hls-charge-fan';
const STYLE_ID = 'hls-charge-style';
const DARKEN_MS = 2600;   // 蓄力浓度由浅到深的基础时长（1x）
const TRUE_POS = [2, 5, 8];   // 敌方真伤格
const HALF_POS = [4, 6, 7, 9]; // 敌方半伤格

let _geom = null;         // 本次扇面的屏幕坐标（bf 局部坐标）
let _strength = 0.35;     // 扇面当前浓度
let _phase = null;        // 本次蓄力所处阶段（1 = 起手、2 = 凝聚回合），阶段切换时浓度重头渐深
let _darkening = false;

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
.hls-tint-true { box-shadow: inset 0 0 10px 3px rgba(255,255,255,0.85) !important; background-color: rgba(255,255,255,0.12) !important; }
.hls-tint-half { background-color: rgba(139,58,30, var(--hls-a, 0.16)) !important; }`;
    document.head.appendChild(s);
}

function cellOf(gridId, pos) {
    return document.querySelector(`#${gridId} [data-pos="${pos}"]`);
}

function centerOf(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function clearTint() {
    document.querySelectorAll('.hls-tint-true, .hls-tint-half').forEach(el => {
        el.classList.remove('hls-tint-true', 'hls-tint-half');
        el.style.boxShadow = '';
        el.style.backgroundColor = '';
        el.style.removeProperty('--hls-a');
    });
}

// 明教 2 号格 → 敌方 7/9 格 三点坐标（bf 局部坐标）；任一点取不到（网格未渲）返回 null
function geometryOf(bf) {
    const apex = centerOf(cellOf('allyGrid', 2));
    const p7 = centerOf(cellOf('enemyGrid', 7));
    const p9 = centerOf(cellOf('enemyGrid', 9));
    if (!apex || !p7 || !p9) return null;
    const br = bf.getBoundingClientRect();
    return {
        ax: apex.x - br.left, ay: apex.y - br.top,
        x7: p7.x - br.left, y7: p7.y - br.top,
        x9: p9.x - br.left, y9: p9.y - br.top
    };
}

// 扇面形制＝变体A：外缘取弧（沿两翼夹角采样 26 段，非直边三角）+ 金→冰蓝线性渐变 + 柔光 + 金色描边
function paintFan() {
    if (!_geom) return;
    const svg = document.getElementById(FAN_ID);
    if (!svg) return;
    const { ax, ay, x7, y7, x9, y9 } = _geom;
    const k = _strength;
    // 弧边：顶点 → 两翼夹角扇扫，半径取到 7 号格
    const R = Math.max(Math.hypot(x7 - ax, y7 - ay), 1);
    const a0 = Math.atan2(y7 - ay, x7 - ax);
    const a1 = Math.atan2(y9 - ay, x9 - ax);
    let d = a1 - a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const pts = [];
    const N = 26;
    for (let i = 0; i <= N; i++) {
        const a = a0 + d * (i / N);
        pts.push(`${(ax + Math.cos(a) * R).toFixed(1)} ${(ay + Math.sin(a) * R).toFixed(1)}`);
    }
    const dPath = `M ${ax.toFixed(1)} ${ay.toFixed(1)} L ${pts.join(' L ')} Z`;
    const mx = (x7 + x9) / 2, my = (y7 + y9) / 2;
    svg.innerHTML = `
        <defs>
            <linearGradient id="hlsFanGrad" gradientUnits="userSpaceOnUse" x1="${ax}" y1="${ay}" x2="${mx}" y2="${my}">
                <stop offset="0%"   stop-color="rgba(255,196,72,${(0.14 * k).toFixed(3)})"/>
                <stop offset="55%"  stop-color="rgba(255,150,60,${(0.42 * k).toFixed(3)})"/>
                <stop offset="100%" stop-color="rgba(127,199,255,${(0.34 * k).toFixed(3)})"/>
            </linearGradient>
            <filter id="hlsFanBlur" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="${(2 + 5 * k).toFixed(1)}"/>
            </filter>
        </defs>
        <path d="${dPath}" fill="url(#hlsFanGrad)" filter="url(#hlsFanBlur)"
              stroke="rgba(255,224,150,${(0.5 * k).toFixed(3)})" stroke-width="${(1.6 + 2.0 * k).toFixed(2)}"/>`;
}

function markCells() {
    clearTint();
    TRUE_POS.forEach(p => { const el = cellOf('enemyGrid', p); if (el) el.classList.add('hls-tint-true'); });
    HALF_POS.forEach(p => {
        const el = cellOf('enemyGrid', p);
        if (!el) return;
        el.classList.add('hls-tint-half');
        el.style.setProperty('--hls-a', (0.16 * _strength).toFixed(3));
    });
}

// 浓度由浅到深（clock tween，不吃普通 rAF/setTimeout）
function startDarken() {
    if (_darkening) return;
    _darkening = true;
    clock.animate(DARKEN_MS, p => {
        if (!_geom) return;           // 蓄力已结束：不再改浓度/上色
        _strength = 0.35 + 0.65 * p;
        paintFan();
        markCells();
    }).then(() => { _darkening = false; });
}

export function updateHanLiSaChargeFx(units) {
    const bf = document.getElementById('battlefield');
    if (!bf) return;
    ensureStyle();
    const hls = (units || []).find(u => u.isHanLiSa);
    const st = (hls && hls.state) || {};
    const charging = !!(hls && hls.alive && (st._hlsCharging || 0) > 0);

    bf.style.position = bf.style.position || 'relative';

    // 扇面
    const fan = document.getElementById(FAN_ID);
    if (!charging) {
        if (fan) fan.remove();
        _geom = null; _phase = null; _strength = 0.35;
        clearTint();
        return;
    }
    const geom = geometryOf(bf);
    if (!geom) { if (fan) fan.remove(); _geom = null; return; }
    _geom = geom;
    if (!fan) {
        const svg = document.createElementNS(SVGNS, 'svg');
        svg.id = FAN_ID;
        svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:1;overflow:visible;';
        bf.appendChild(svg);
    }
    const phase = (st._hlsCharging || 0) >= 2 ? 2 : 1;
    if (_phase !== phase) { _phase = phase; _strength = 0.35; }  // 进入凝聚回合：浓度重头渐深
    paintFan();
    markCells();
    startDarken();
}
