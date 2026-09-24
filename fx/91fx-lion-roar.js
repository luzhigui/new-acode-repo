// V6.0.0 | 2026-09-24 雄狮振奋咆哮：雄狮格金色冲击波三环扩散 + 「吼」字升起，己方全体金光脉冲
export const VER = 'fx/91fx-lion-roar.js V6.0.0';

import { clock } from '../infra/52-clock.js';

// 格子金光脉冲：正弦呼吸两下，只动 box-shadow（与苦练金圈同套路，不改 border 不位移）
function glowPulse(grid, durationMs, peak = 0.75) {
    clock.animate(durationMs, (p) => {
        const g = Math.sin(p * Math.PI * 2) * (1 - p);
        grid.style.boxShadow = g > 0.05 ? `0 0 16px rgba(255,190,0,${(peak * g).toFixed(2)})` : '';
        if (p >= 1) grid.style.boxShadow = '';
    });
}

// 雄狮格：三道金色冲击波环递次扩散 + 「吼」字升起
function roarAtLion(unit) {
    const grid = document.querySelector(`[data-uid="${unit.uid}"]`);
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    for (let i = 0; i < 3; i++) {
        const ring = document.createElement('div');
        ring.setAttribute('data-fx', 'temporary');
        ring.style.cssText = `
            position:fixed; left:${cx}px; top:${cy}px;
            width:12px; height:12px; margin:-6px 0 0 -6px;
            border:2px solid rgba(255,200,40,0.9); border-radius:50%;
            z-index:10010; pointer-events:none; opacity:0;
            filter: drop-shadow(0 0 6px rgba(255,180,0,0.8));
        `;
        document.body.appendChild(ring);
        clock.wait(i * 130).then(() => {
            clock.animate(650, (p) => {
                const size = 12 + p * (rect.width * 2.2 + 60);
                ring.style.width = size + 'px';
                ring.style.height = size + 'px';
                ring.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
                ring.style.opacity = (1 - p).toFixed(2);
            }).then(() => { if (ring.parentNode) ring.remove(); });
        });
    }

    const word = document.createElement('div');
    word.setAttribute('data-fx', 'temporary');
    word.textContent = '吼';
    word.style.cssText = `
        position:fixed; left:${cx}px; top:${cy - rect.height * 0.6}px;
        transform:translate(-50%,-50%);
        font-size:28px; font-weight:900; color:#ffd700;
        text-shadow:0 0 12px rgba(255,160,0,0.9), 0 2px 4px rgba(0,0,0,0.8);
        z-index:10011; pointer-events:none; opacity:0;
    `;
    document.body.appendChild(word);
    clock.animate(900, (p) => {
        let op, sc, ty;
        if (p <= 0.25) { const t = p / 0.25; op = t; sc = 0.5 + 0.7 * t; ty = -10 * t; }
        else if (p <= 0.7) { const t = (p - 0.25) / 0.45; op = 1; sc = 1.2; ty = -10 - 18 * t; }
        else { const t = (p - 0.7) / 0.3; op = 1 - t; sc = 1.2 - 0.2 * t; ty = -28; }
        word.style.opacity = op;
        word.style.transform = `translate(-50%, calc(-50% + ${ty}px)) scale(${sc})`;
    }).then(() => { if (word.parentNode) word.remove(); });

    glowPulse(grid, 900, 0.8);
}

export function showLionRoar(unit, team) {
    if (unit) roarAtLion(unit);
    (team || []).forEach(member => {
        if (!member.alive || member.isHorse) return;
        if (unit && member.uid === unit.uid) return;
        const grid = document.querySelector(`[data-uid="${member.uid}"]`);
        if (!grid) return;
        glowPulse(grid, 900, 0.55);
    });
}
