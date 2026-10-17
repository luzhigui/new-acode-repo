// fx/90-hanlisa-charge.js — 寒离飒「蓄力」范围指示：明教 2 号格为顶点、朝敌方 7/9 张开的扇形
//   · 扇形由淡到深渐变（红棕），随蓄力推进逐渐加深（charging 1 → 2）
//   · 敌方 2/5/8（真伤格）叠白色内发光，4/6/7/9（半伤格）叠红棕底色
//   · 由 render/32 每次重绘后调用；单位不在蓄力态时自动清场
// V1.0.0 | ~2600 bytes | 2026-10-17 新建
export const VER = 'fx/90-hanlisa-charge.js V1.0.0';

const FAN_ID = 'hls-charge-fan';

function centerOf(uid) {
    const el = document.querySelector(`[data-uid="${uid}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}

function clearTint() {
    document.querySelectorAll('.hls-tint-true, .hls-tint-half').forEach(el => {
        el.style.boxShadow = '';
        el.style.backgroundColor = '';
        el.classList.remove('hls-tint-true', 'hls-tint-half');
    });
}

export function updateHanLiSaChargeFx(units) {
    const bf = document.getElementById('battlefield');
    const old = document.getElementById(FAN_ID);
    const hls = (units || []).find(u => u.isHanLiSa);
    const charging = hls && hls.alive && (hls.state._hlsCharging || 0) > 0;
    if (!bf || !charging) {
        if (old) old.remove();
        clearTint();
        return;
    }

    const apexUid = hls.pos === 2 ? hls.uid : (units.find(u => u.alive && u.pos === 2 && u.camp === hls.camp) || {}).uid;
    const e7 = units.find(u => u.alive && u.pos === 7 && u.camp !== hls.camp);
    const e9 = units.find(u => u.alive && u.pos === 9 && u.camp !== hls.camp);
    const apex = apexUid ? centerOf(apexUid) : null;
    const p7 = e7 ? centerOf(e7.uid) : null;
    const p9 = e9 ? centerOf(e9.uid) : null;
    if (!apex || !p7 || !p9) { if (old) old.remove(); return; }

    const br = bf.getBoundingClientRect();
    const ax = apex.x - br.left, ay = apex.y - br.top;
    const x7 = p7.x - br.left, y7 = p7.y - br.top;
    const x9 = p9.x - br.left, y9 = p9.y - br.top;
    // 蓄力推进（1 → 2）让扇形整体加深
    const strength = (hls.state._hlsCharging || 0) >= 2 ? 1 : 0.55;

    bf.style.position = bf.style.position || 'relative';
    const svgNS = 'http://www.w3.org/2000/svg';
    let svg = old;
    if (!svg) {
        svg = document.createElementNS(svgNS, 'svg');
        svg.id = FAN_ID;
        svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:1;';
        bf.appendChild(svg);
    }
    const pid = 'hlsFanGrad';
    svg.innerHTML = `
        <defs>
            <linearGradient id="${pid}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="rgba(150,74,42,${0.06 * strength})"/>
                <stop offset="60%" stop-color="rgba(150,74,42,${0.16 * strength})"/>
                <stop offset="100%" stop-color="rgba(139,58,30,${0.34 * strength})"/>
            </linearGradient>
        </defs>
        <polygon points="${ax},${ay} ${x7},${y7} ${x9},${y9}"
                 fill="url(#${pid})" stroke="rgba(139,58,30,${0.45 * strength})" stroke-width="1.5"/>`;

    // 真伤格（2/5/8）白色内发光；半伤格（4/6/7/9）红棕底色
    clearTint();
    const mark = (pos, cls, shadow, bg) => {
        const u = units.find(x => x.alive && x.pos === pos && x.camp !== hls.camp);
        if (!u) return;
        const el = document.querySelector(`[data-uid="${u.uid}"]`);
        if (!el) return;
        el.classList.add(cls);
        if (shadow) el.style.boxShadow = shadow;
        if (bg) el.style.backgroundColor = bg;
    };
    [2, 5, 8].forEach(p => mark(p, 'hls-tint-true', 'inset 0 0 10px 3px rgba(255,255,255,0.85)', 'rgba(255,255,255,0.12)'));
    [4, 6, 7, 9].forEach(p => mark(p, 'hls-tint-half', null, `rgba(139,58,30,${0.16 * strength})`));
}
