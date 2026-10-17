// fx/90-hanlisa-charge.js — 寒离飒「蓄力」扇形指示 + 爆发演出
//   · 扇面顶点 = #allyGrid [data-pos=2] 格心，两翼 = #enemyGrid [data-pos=7] / [data-pos=9] 格心
//     （按格子的 data-pos 取，不看该格上有没有单位——空位也照样画，扇面全程笼罩战场）
//   · 蓄力期间常驻扇面，由一个 clock tween 把浓度由 0.35 渐深到 1.0（描边同步加粗）
//   · 真伤格（敌 2/5/8）白内发光、半伤格（敌 4/6/7/9）红棕底；色浓度走 CSS 变量 --hls-a
//   · 爆发：modules/27elite-mingjiao-hanlisa.js 结算时写 state._hlsBurstAt = clock.now，
//     本模块按逻辑时间接续播 900ms（扇面白光炸开 + 顶点冲击环 + 命中格白闪），播完自清、不写 state
// V1.1.0 | ~5.4 KB | 2026-10-17 修「扇形完全不显示」（旧版按 7/9 格上有没有单位去找坐标，
//          敌方 9 号位空位即整场不画）+ 补爆发长演出（对标腕豪蓄力轰拳：命中动画明显长于普攻）
// V1.0.0 | ~2.6 KB | 2026-10-17 新建
import { clock } from '../infra/52-clock.js';

export const VER = 'fx/90-hanlisa-charge.js V1.1.0';

const SVGNS = 'http://www.w3.org/2000/svg';
const FAN_ID = 'hls-charge-fan';
const BURST_ID = 'hls-charge-burst';
const STYLE_ID = 'hls-charge-style';
const DARKEN_MS = 2600;   // 蓄力浓度由浅到深的基础时长（1x）
const BURST_MS = 900;     // 爆发演出时长（1x）——明显长于普攻的命中动画
const TRUE_POS = [2, 5, 8];   // 敌方真伤格
const HALF_POS = [4, 6, 7, 9]; // 敌方半伤格

let _geom = null;         // 本次扇面的屏幕坐标（bf 局部坐标）
let _strength = 0.35;     // 扇面当前浓度
let _phase = null;        // 本次蓄力所处阶段（1 = 起手、2 = 凝聚回合），阶段切换时浓度重头渐深
let _darkening = false;
let _bursting = false;

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
.hls-tint-true { box-shadow: inset 0 0 10px 3px rgba(255,255,255,0.85) !important; background-color: rgba(255,255,255,0.12) !important; }
.hls-tint-half { background-color: rgba(139,58,30, var(--hls-a, 0.16)) !important; }
.hls-burst-flash { animation: hlsBurstFlash ${BURST_MS}ms ease-out 1 both; }
@keyframes hlsBurstFlash {
    0%   { box-shadow: inset 0 0 30px 14px rgba(255,255,255,0.95); }
    60%  { box-shadow: inset 0 0 18px 6px rgba(255,220,190,0.55); }
    100% { box-shadow: inset 0 0 0 0 rgba(255,255,255,0); }
}`;
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

function paintFan() {
    if (!_geom) return;
    const svg = document.getElementById(FAN_ID);
    if (!svg) return;
    const { ax, ay, x7, y7, x9, y9 } = _geom;
    const k = _strength;
    const gid = 'hlsFanGrad';
    svg.innerHTML = `
        <defs>
            <linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${ax}" y1="${ay}" x2="${(x7 + x9) / 2}" y2="${(y7 + y9) / 2}">
                <stop offset="0%"   stop-color="rgba(150,74,42,${(0.08 * k).toFixed(3)})"/>
                <stop offset="55%"  stop-color="rgba(150,74,42,${(0.20 * k).toFixed(3)})"/>
                <stop offset="100%" stop-color="rgba(139,58,30,${(0.42 * k).toFixed(3)})"/>
            </linearGradient>
        </defs>
        <polygon points="${ax},${ay} ${x7},${y7} ${x9},${y9}"
                 fill="url(#${gid})" stroke="rgba(139,58,30,${(0.5 * k).toFixed(3)})"
                 stroke-width="${(1.5 + 1.5 * k).toFixed(2)}"/>`;
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

// 爆发演出：扇面白光炸开 + 顶点冲击环 + 冲拳方向光带 + 命中格白闪
function playBurst(bf, startP) {
    const g = geometryOf(bf);
    if (!g) return;
    _bursting = true;
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.id = BURST_ID;
    svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2;overflow:visible;';
    bf.appendChild(svg);

    const flashCells = [...TRUE_POS, ...HALF_POS];
    flashCells.forEach(p => { const el = cellOf('enemyGrid', p); if (el) el.classList.add('hls-burst-flash'); });

    const { ax, ay, x7, y7, x9, y9 } = g;
    const midx = (x7 + x9) / 2, midy = (y7 + y9) / 2;
    const draw = t => {
        const fade = Math.max(0, 1 - t);
        const spread = 1 + 0.35 * t;                     // 冲击沿扇形向外扩张
        const sx7 = ax + (x7 - ax) * spread, sy7 = ay + (y7 - ay) * spread;
        const sx9 = ax + (x9 - ax) * spread, sy9 = ay + (y9 - ay) * spread;
        svg.innerHTML = `
            <polygon points="${ax},${ay} ${sx7},${sy7} ${sx9},${sy9}"
                     fill="rgba(255,255,255,${(0.55 * fade).toFixed(3)})"
                     stroke="rgba(255,236,214,${(0.95 * fade).toFixed(3)})"
                     stroke-width="${(10 * fade + 2).toFixed(1)}"/>
            <line x1="${ax}" y1="${ay}" x2="${midx}" y2="${midy}"
                  stroke="rgba(255,214,180,${(0.6 * fade).toFixed(3)})"
                  stroke-width="${(8 * fade + 1).toFixed(1)}" stroke-linecap="round"/>
            <circle cx="${ax}" cy="${ay}" r="${(8 + 150 * t).toFixed(1)}" fill="none"
                    stroke="rgba(255,255,255,${(0.85 * fade).toFixed(3)})"
                    stroke-width="${(6 * fade + 1).toFixed(1)}"/>`;
    };
    draw(startP);
    clock.animate(BURST_MS * (1 - startP), p => draw(startP + (1 - startP) * p)).then(() => {
        svg.remove();
        _bursting = false;
        flashCells.forEach(p => { const el = cellOf('enemyGrid', p); if (el) el.classList.remove('hls-burst-flash'); });
    });
}

export function updateHanLiSaChargeFx(units) {
    const bf = document.getElementById('battlefield');
    if (!bf) return;
    ensureStyle();
    const hls = (units || []).find(u => u.isHanLiSa);
    const st = (hls && hls.state) || {};
    const charging = !!(hls && hls.alive && (st._hlsCharging || 0) > 0);

    bf.style.position = bf.style.position || 'relative';

    // ① 爆发（独立于蓄力态：结算那一步 _hlsCharging 已清零）
    const since = st._hlsBurstAt ? clock.now - st._hlsBurstAt : -1;
    if (since >= 0 && since < BURST_MS && !_bursting) playBurst(bf, since / BURST_MS);

    // ② 扇面
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
