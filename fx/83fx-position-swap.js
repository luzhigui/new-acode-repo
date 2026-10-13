// fx/83fx-position-swap.js
// V6.2.1 | ~10200 bytes | 2026-10-13 红血两仪互换放慢（老板：太快了，一眨眼就完）：连线展开 300→480ms、☯ 脉冲 260→420ms、
//          脉冲后加 150ms「落印停顿」（☯ 在画面停留一瞬再对穿）、对穿 560→900ms；总时长 1.12s → 1.95s。
//          只动 connectLine 这一支（何太冲两仪互换），惑心互换的连闪分支（animatePositionSwap 原路径）保持不动。
// V6.2.0 | ~9907 bytes | 2026-10-12 红血两仪互换专属演出 animateLiangyiSwap（options.connectLine 分流）：金色连线展开 → 中点 ☯ 脉冲
//          → 两人沿连线对穿一次 → 落定 pop-in；全程 clock.animate 驱动（不手写 rAF），用完即清无残留
export const VER = 'fx/83fx-position-swap.js V6.2.1';

import { GlobalStore } from '../infra/54-global-store.js';
import { STORE_ACTION_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES } from '../infra/56-battle-enums.js';
import { getUnitCell, getCellByPos } from './90fx-ref-manager.js';
import { clock } from '../infra/52-clock.js';

function getCellElement(unit) {
    return getUnitCell(unit);
}

export async function animatePositionSwap(unit1, unit2, c, options = {}) {
    // 2026-10-12 两仪互换（红血）：connectLine 走专属「连线→对穿」演出（惑心互换保持原连闪动画不动）
    if (options.connectLine) return animateLiangyiSwap(unit1, unit2, c, options);
    const { skipDataChange, oldPositions } = options;
    let cell1, cell2;
    if (oldPositions) {
        cell1 = getCellByPos(unit1.camp, oldPositions[0]);
        cell2 = getCellByPos(unit2.camp, oldPositions[1]);
    } else {
        cell1 = getCellElement(unit1);
        cell2 = getCellElement(unit2);
    }
    if (!cell1 || !cell2) return;

    const pos1 = oldPositions ? oldPositions[0] : unit1.pos;
    const pos2 = oldPositions ? oldPositions[1] : unit2.pos;
    const rect1 = cell1.getBoundingClientRect();
    const rect2 = cell2.getBoundingClientRect();
    const dx = rect2.left + rect2.width/2 - (rect1.left + rect1.width/2);
    const dy = rect2.top + rect2.height/2 - (rect1.top + rect1.height/2);

    // ---- 阶段一：快速闪烁 3 次 ----
    cell1.classList.add('swap-flash');
    cell2.classList.add('swap-flash');
    for (let i = 0; i < 3; i++) {
        cell1.style.visibility = (i % 2 === 0) ? 'visible' : 'hidden';
        cell2.style.visibility = (i % 2 === 0) ? 'hidden' : 'visible';
        await clock.wait(150);
    }
    cell1.style.visibility = 'visible';
    cell2.style.visibility = 'visible';

    // ---- 阶段二：中速位移 2 次，间隔渐长 ----
    for (let i = 0; i < 2; i++) {
        const delay = 250 + i * 250;
        cell1.style.transform = `translate(${dx}px, ${dy}px)`;
        cell2.style.transform = `translate(${-dx}px, ${-dy}px)`;
        await clock.wait(delay);
        cell1.style.transform = 'translate(0,0)';
        cell2.style.transform = 'translate(0,0)';
        await clock.wait(delay);
    }

    // ---- 阶段三：最后一击，长定格 ----
    cell1.style.transform = `translate(${dx}px, ${dy}px)`;
    cell2.style.transform = `translate(${-dx}px, ${-dy}px)`;

    cell1.classList.remove('swap-flash');
    cell2.classList.remove('swap-flash');
    cell1.classList.add('swap-lock');
    cell2.classList.add('swap-lock');

    await clock.wait(900);

    cell1.classList.remove('swap-lock');
    cell2.classList.remove('swap-lock');

    cell1.style.opacity = '0';
    cell2.style.opacity = '0';
    await clock.wait(350);

    if (!skipDataChange) {
        if (c.store) {
            c.store.dispatch({ type: STORE_ACTION_TYPES.APPLY_EVENTS, events: [
                { eventType: UNIT_EVENT_TYPES.POS_CHANGE, uid: unit1.uid, pos: pos2 },
                { eventType: UNIT_EVENT_TYPES.POS_CHANGE, uid: unit2.uid, pos: pos1 }
            ]});
        } else {
            unit1.pos = pos2;
            unit2.pos = pos1;
        }
    }

    cell1.style.cssText = '';
    cell2.style.cssText = '';
    cell1.classList.remove('swap-flash', 'swap-lock');
    cell2.classList.remove('swap-flash', 'swap-lock');
    c.updateUI();

    const newCell1 = getCellElement(unit1);
    const newCell2 = getCellElement(unit2);
    if (newCell1) {
        newCell1.style.opacity = '0'; newCell1.style.transform = 'scale(0.85)';
        requestAnimationFrame(() => {
            newCell1.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            newCell1.style.opacity = '1'; newCell1.style.transform = 'scale(1)';
        });
    }
    if (newCell2) {
        newCell2.style.opacity = '0'; newCell2.style.transform = 'scale(0.85)';
        requestAnimationFrame(() => {
            newCell2.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            newCell2.style.opacity = '1'; newCell2.style.transform = 'scale(1)';
        });
    }
}

// ========== 2026-10-12 两仪互换（红血）专属演出 ==========
// 老板三点要求：①先连线再换（把两人"绑"上）②只换一次（不像惑心连闪反复）③好看。
// 编排：金色光束从 A 拉向 B（480ms）→ 中点 ☯ 弹出脉冲（420ms）→ 落印停顿（150ms）→ 两人沿连线对穿一次（900ms，线/☯同步淡出）
//   → 落定（dispatch POS_CHANGE → 清样式 → 重绘 → 新格 pop-in）。
// 全程 clock.animate 插值（铁律7：时间层走 clock，不手写 rAF）；一次性元素 data-fx="temporary" 用完即删。
const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
const easeInOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

// 新格 pop-in：透明+0.85 缩放进位（clock 驱动，结束即清，无残留）
function popInCell(cell) {
    if (!cell) return;
    cell.style.opacity = '0';
    cell.style.transform = 'scale(0.85)';
    clock.animate(200, (p) => {
        const e = easeOutCubic(p);
        cell.style.opacity = e.toFixed(2);
        cell.style.transform = `scale(${(0.85 + 0.15 * e).toFixed(3)})`;
    }).then(() => {
        cell.style.opacity = '';
        cell.style.transform = '';
    });
}

async function animateLiangyiSwap(unit1, unit2, c, options = {}) {
    const { skipDataChange, oldPositions } = options;
    let cell1, cell2;
    if (oldPositions) {
        cell1 = getCellByPos(unit1.camp, oldPositions[0]);
        cell2 = getCellByPos(unit2.camp, oldPositions[1]);
    } else {
        cell1 = getCellElement(unit1);
        cell2 = getCellElement(unit2);
    }
    if (!cell1 || !cell2) return;

    const pos1 = oldPositions ? oldPositions[0] : unit1.pos;
    const pos2 = oldPositions ? oldPositions[1] : unit2.pos;
    const rect1 = cell1.getBoundingClientRect();
    const rect2 = cell2.getBoundingClientRect();
    const c1x = rect1.left + rect1.width / 2, c1y = rect1.top + rect1.height / 2;
    const c2x = rect2.left + rect2.width / 2, c2y = rect2.top + rect2.height / 2;
    const dx = c2x - c1x, dy = c2y - c1y;
    const len = Math.hypot(dx, dy);
    const angDeg = Math.atan2(dy, dx) * 180 / Math.PI;
    const mx = (c1x + c2x) / 2, my = (c1y + c2y) / 2;

    // ① 金色连线展开（A 中心 → B 中心），两端格子同步起辉光
    const line = document.createElement('div');
    line.setAttribute('data-fx', 'temporary');
    line.style.cssText = `position:fixed;left:${c1x}px;top:${c1y}px;width:0;height:3px;
        transform-origin:0 50%;transform:translateY(-50%) rotate(${angDeg}deg);
        background:linear-gradient(90deg,rgba(255,220,120,0.15),rgba(255,214,96,0.95),rgba(255,150,60,0.95));
        box-shadow:0 0 12px rgba(255,180,60,0.9);border-radius:2px;z-index:10010;pointer-events:none;`;
    document.body.appendChild(line);
    await clock.animate(480, (p) => {
        const e = easeOutCubic(p);
        line.style.width = (len * e).toFixed(1) + 'px';
        const g = (0.25 + 0.75 * e).toFixed(2);
        cell1.style.boxShadow = `0 0 18px rgba(255,190,70,${g})`;
        cell2.style.boxShadow = `0 0 18px rgba(255,190,70,${g})`;
    });

    // ② 中点 ☯ 弹出脉冲（连接"落印"）
    const mark = document.createElement('div');
    mark.textContent = '☯';
    mark.setAttribute('data-fx', 'temporary');
    mark.style.cssText = `position:fixed;left:${mx}px;top:${my}px;font-size:30px;line-height:1;
        transform:translate(-50%,-50%) scale(0.4);opacity:0;z-index:10012;pointer-events:none;
        color:#ffe08a;text-shadow:0 0 12px rgba(255,170,0,0.95),0 0 26px rgba(210,80,0,0.65);`;
    document.body.appendChild(mark);
    await clock.animate(420, (p) => {
        const op = p < 0.5 ? p / 0.5 : 1;
        const sc = p < 0.6 ? 0.4 + 1.15 * (p / 0.6) : 1.55 - 0.55 * ((p - 0.6) / 0.4);
        mark.style.opacity = op.toFixed(2);
        mark.style.transform = `translate(-50%,-50%) scale(${sc.toFixed(2)})`;
    });
    // 2026-10-13 落印停顿：脉冲做完让 ☯ 在画面停一瞬，别紧接着就被对穿的淡出吃掉（老板：看不清）
    await clock.wait(150);

    // ③ 两人沿连线对穿一次（线/☯ 随穿越淡出）
    await clock.animate(900, (p) => {
        const e = easeInOutCubic(p);
        cell1.style.transform = `translate(${(dx * e).toFixed(1)}px, ${(dy * e).toFixed(1)}px)`;
        cell2.style.transform = `translate(${(-dx * e).toFixed(1)}px, ${(-dy * e).toFixed(1)}px)`;
        line.style.opacity = Math.max(0, 1 - p * 1.25).toFixed(2);
        mark.style.opacity = Math.max(0, 1 - p * 1.6).toFixed(2);
    });

    // ④ 落定：位置交回数据（POS_CHANGE 由本动画收尾统一 dispatch）→ 清样式 → 重绘 → 新格 pop-in
    if (!skipDataChange) {
        if (c.store) {
            c.store.dispatch({ type: STORE_ACTION_TYPES.APPLY_EVENTS, events: [
                { eventType: UNIT_EVENT_TYPES.POS_CHANGE, uid: unit1.uid, pos: pos2 },
                { eventType: UNIT_EVENT_TYPES.POS_CHANGE, uid: unit2.uid, pos: pos1 }
            ]});
        } else {
            unit1.pos = pos2;
            unit2.pos = pos1;
        }
    }
    if (line.parentNode) line.parentNode.removeChild(line);
    if (mark.parentNode) mark.parentNode.removeChild(mark);
    cell1.style.cssText = '';
    cell2.style.cssText = '';
    c.updateUI();
    popInCell(getCellByPos(unit1.camp, pos2));
    popInCell(getCellByPos(unit2.camp, pos1));
}