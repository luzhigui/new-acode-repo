// V1.0.1 | ~4300 bytes | 2026-09-26 胖远桥两技能演出：正义国字脸（朝对手张开的扇形金锥三道 + 「你过来啊！～」台词气泡 + 全体被嘲讽者红闪😤）、年轻气盛（出手前上半身侧倾甩歪 + 😵）
export const VER = 'fx/92fx-pang-antics.js V1.0.1';

import { clock } from '../infra/52-clock.js';
import { getUnitCell } from './90fx-ref-manager.js';

// 锥/闪一律「从自身格指向对手行」：按阵营 team-row 的行序定朝向（首个 team-row = 上排）。
// 不写死上下：联网从机视角下 32-grid-render 会互换两阵营行序（见 fx/90 L11-13），写死必反。
function foeFacingDeg(cell) {
    const rows = document.querySelectorAll('.battlefield .team-row');
    if (!rows.length || !cell.closest) return 0;
    return rows[0] === cell.closest('.team-row') ? 0 : 180;   // 0 = 锥朝下，180 = 锥朝上
}

// 扇形金锥三道：锥尖贴自身格边、朝对手行张开，递次扩散渐隐（91 环形冲击波的定向版）。
// 元素 box 恒从锥尖向下延伸 H，朝上时 rotate(180deg) 让绘制区翻上去；transform-origin 锁锥尖。
function roarCones(cell, deg) {
    const rect = cell.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const W = 220, H = 135, DEG = 78;
    const halfPx = Math.tan(DEG / 2 * Math.PI / 180) * H;
    const l = (50 + halfPx / W * 100).toFixed(2);
    const r = (50 - halfPx / W * 100).toFixed(2);
    const tipY = deg === 0 ? rect.bottom - 6 : rect.top + 6;
    for (let i = 0; i < 3; i++) {
        const cone = document.createElement('div');
        cone.setAttribute('data-fx', 'temporary');
        cone.style.cssText = `position:fixed; left:${cx - W / 2}px; top:${tipY}px; width:${W}px; height:${H}px;`
            + `clip-path:polygon(50% 0%, ${l}% 100%, ${r}% 100%); pointer-events:none; z-index:10010;`
            + `background:radial-gradient(ellipse 60% 90% at 50% 0%, rgba(255,214,90,0.85) 0%, rgba(255,180,30,0.38) 52%, rgba(255,170,20,0) 80%);`
            + `transform-origin:50% 0%; transform:scale(0.25) rotate(${deg}deg); opacity:0.95; will-change:transform,opacity;`;
        document.body.appendChild(cone);
        clock.wait(i * 140).then(() => clock.animate(700, (p) => {
            cone.style.transform = `scale(${(0.25 + 1.05 * p).toFixed(3)}) rotate(${deg}deg)`;
            cone.style.opacity = (0.95 * (1 - p * p)).toFixed(2);
        })).then(() => { if (cone.parentNode) cone.remove(); });
    }
}

// 头顶台词气泡：弹入 → 停 → 淡出上飘
function speechBubble(cell, text) {
    const rect = cell.getBoundingClientRect();
    const wrap = document.createElement('div');
    wrap.setAttribute('data-fx', 'temporary');
    wrap.style.cssText = `position:fixed; left:${rect.left + rect.width / 2}px; top:${rect.top - 10}px;`
        + `transform:translate(-50%,-100%); z-index:10012; pointer-events:none; opacity:0; will-change:transform,opacity;`;
    wrap.innerHTML = `<div style="background:#fff;border:2px solid #5c4033;border-radius:8px;padding:3px 9px;font-size:13px;font-weight:900;color:#c0392b;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.25);">${text}</div>`
        + `<div style="width:0;height:0;margin:0 auto;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid #5c4033;"></div>`;
    document.body.appendChild(wrap);
    clock.animate(1150, (p) => {
        let op = 1, sc = 1, ty = 0;
        if (p < 0.12) { const t = p / 0.12; sc = 0.6 + 0.4 * (1 - (1 - t) * (1 - t)); }
        else if (p > 0.82) { const t = (p - 0.82) / 0.18; op = 1 - t; ty = -6 * t; }
        wrap.style.opacity = op.toFixed(2);
        wrap.style.transform = `translate(-50%, calc(-100% + ${ty}px)) scale(${sc.toFixed(3)})`;
    }).then(() => { if (wrap.parentNode) wrap.remove(); });
}

// 被嘲讽者：红边脉冲两下（只动 box-shadow，不改 border 不位移）+ 头顶冒 😤
function tauntFlash(unit) {
    const cell = getUnitCell(unit);
    if (!cell) return;
    const rect = cell.getBoundingClientRect();
    const emoji = document.createElement('div');
    emoji.setAttribute('data-fx', 'temporary');
    emoji.textContent = '😤';
    emoji.style.cssText = `position:fixed; left:${rect.left + rect.width / 2}px; top:${rect.top - rect.height * 0.15}px;`
        + `transform:translate(-50%,-50%); font-size:20px; z-index:10011; pointer-events:none; opacity:0; will-change:transform,opacity;`;
    document.body.appendChild(emoji);
    clock.animate(800, (p) => {
        emoji.style.opacity = (p < 0.25 ? p / 0.25 : 1 - Math.max(0, (p - 0.6) / 0.4)).toFixed(2);
        emoji.style.transform = `translate(-50%, calc(-50% - ${(8 + 16 * p).toFixed(1)}px))`;
    }).then(() => { if (emoji.parentNode) emoji.remove(); });
    clock.animate(800, (p) => {
        const g = Math.sin(p * Math.PI * 2) * (1 - p);
        cell.style.boxShadow = g > 0.05 ? `0 0 20px 3px rgba(255,60,60,${(0.62 * g).toFixed(2)})` : '';
    }).then(() => { cell.style.boxShadow = ''; });
}

// 正义国字脸：金锥三道（朝对手）+ 台词气泡 + 全体被嘲讽者红闪😤。
// 被嘲讽者按站位分 1-3 / 4-6 / 7-9 三波错帧，形成从近到远铺开的涟漪。
export function showPangTaunt(pang, foes) {
    const cell = getUnitCell(pang);
    if (!cell) return;
    roarCones(cell, foeFacingDeg(cell));
    speechBubble(cell, '你过来啊！～');
    const list = (foes || []).filter(u => u && u.alive);
    [[1, 2, 3], [4, 5, 6], [7, 8, 9]].forEach((poses, wi) => {
        clock.wait(300 + wi * 130).then(() => {
            list.filter(u => poses.includes(u.pos)).forEach(tauntFlash);
        });
    });
}

// 年轻气盛（打歪）：出手前上半身侧倾甩歪 6° 回弹 + 头顶 😵。
//   与 data-flash 蓝底高亮共存：旋转同时叠 scale(1.1) 制造「扑空放大」感。
export function showPangClumsy(pang) {
    const cell = getUnitCell(pang);
    if (!cell) return;
    const rect = cell.getBoundingClientRect();
    const face = document.createElement('div');
    face.setAttribute('data-fx', 'temporary');
    face.textContent = '😵';
    face.style.cssText = `position:fixed; left:${rect.left + rect.width / 2}px; top:${rect.top - rect.height * 0.15}px;`
        + `transform:translate(-50%,-50%); font-size:22px; z-index:10011; pointer-events:none; opacity:0; will-change:transform,opacity;`;
    document.body.appendChild(face);
    clock.animate(900, (p) => {
        face.style.opacity = (p < 0.2 ? p / 0.2 : 1 - Math.max(0, (p - 0.6) / 0.4)).toFixed(2);
        face.style.transform = `translate(-50%, calc(-50% - ${(8 + 20 * p).toFixed(1)}px))`;
    }).then(() => { if (face.parentNode) face.remove(); });

    cell.style.transformOrigin = 'bottom center';
    clock.animate(300, (p) => {
        let ang;
        if (p < 0.4) ang = 6 * (p / 0.4);
        else { const t = (p - 0.4) / 0.6; ang = 6 * (1 - t) * (1 - t); }
        cell.style.transform = `rotate(${ang}deg) scale(1.1)`;
    }).then(() => { cell.style.transform = ''; });
}
