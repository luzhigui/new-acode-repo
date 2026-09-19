// V6.0.0 | 2026-08-26 删除 handleBuffLeech 死函数
export const VER = 'player/41player-buff-ui.js V6.0.0';

import { Unit } from '../core/02unit.js';
import { eventBus } from '../infra/50-event-bus.js';
import { FX_SIGNALS } from '../infra/55-fx-signals.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { findUnitByUid } from './47renderer.js';
import { CAMP_TYPES } from '../infra/56-battle-enums.js';
import { clock } from '../infra/52-clock.js';
import { getCellByPos } from '../fx/90fx-ref-manager.js';


let ctx = null;
function getCtx() {
    if (!ctx) ctx = GlobalStore.get('playerContext');
    return ctx;
}

export function setBuffUIContext(c) { ctx = c; }

export async function handleHolyTokenDrop(c, entry) {
    c.isPaused = true;
    GlobalStore.set('bulletTimeActive', true);

    const unit = findUnitByUid(c, entry.unitUid);
    // 2026-09-19 联网从机视角修复：格子查找走 90 的 dataset.pos 匹配（视角无关），
    // 原先本地背的固定顺序表在从机视角（行序镜像）下会把圣火令图标扔错格子
    const cell = unit ? getCellByPos(unit.camp, unit.pos) : null;
    const cellRect = cell ? cell.getBoundingClientRect() : null;

    const icon = document.createElement('div');
    icon.setAttribute('data-fx', 'temporary');
    icon.textContent = '🔥';
    icon.style.cssText = `
        position: fixed; z-index: 10030; pointer-events: none;
        font-size: 40px; filter: drop-shadow(0 0 10px rgba(255,215,0,0.9));
        transition: all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    `;
    if (cellRect) {
        icon.style.left = (cellRect.left + cellRect.width / 2) + 'px';
        icon.style.top = (cellRect.top + cellRect.height / 2) + 'px';
        icon.style.transform = 'translate(-50%, -50%) scale(0.5)';
    }
    document.body.appendChild(icon);

    await new Promise(r => {
        requestAnimationFrame(() => {
            icon.style.transform = 'translate(-50%, -50%) scale(1.5) rotate(360deg)';
            r();
        });
    });
    await clock.wait(400);

    const badge = document.getElementById('scoreBadge');
    const badgeRect = badge ? badge.getBoundingClientRect() : null;
    if (badgeRect && cellRect) {
        icon.style.left = (badgeRect.left + badgeRect.width - 20) + 'px';
        icon.style.top = (badgeRect.top + badgeRect.height / 2) + 'px';
        icon.style.transform = 'translate(-50%, -50%) scale(0.8)';
        icon.style.opacity = '0.6';
    }
    await clock.wait(800);

    icon.remove();
    c.updateScoreBadge();
    GlobalStore.set('bulletTimeActive', false);
    c.isPaused = false;
}

export async function handleBuffSummon(c, entry, prevEntry) {
    // 2026-09-14 状态三轨收敛：删除 c.UI.lastSnapshot（只写不读的死拷贝，第 4 份状态）
    // 结算数据唯一来源为 battleStore，渲染层按 uid 现查
    // 特效已由 stageAction 触发，此处只播文本
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
    document.getElementById('log').appendChild(div);
    c.autoScrollLog();
}

export async function handleBuffDestroy(c, entry, prevEntry) {
    // 同上：lastSnapshot 已删
    // REMOVE_UNIT / 特效横幅已由导演 stageAction 'destroy' 统一处理，此处只播文本
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
    document.getElementById('log').appendChild(div);
    c.autoScrollLog();
}