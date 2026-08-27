﻿// player/41player-buff-ui.js - 光明顶5v5 Buff横幅与handler
// V5.7.1 | ~5200 bytes| 2026-08-25 拒马召唤/销毁特效移交导演 stageAction，只播文本
export const VER = 'player/41player-buff-ui.js V5.7.1';

import { Unit } from '../core/02unit.js';
import { eventBus } from '../infra/50-event-bus.js';
import { FX_SIGNALS } from '../infra/55-fx-signals.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { findUnitByUid } from './47renderer.js';


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
    const gridId = unit?.camp === 'ally' ? 'allyGrid' : 'enemyGrid';
    const grid = document.getElementById(gridId);
    const order = unit?.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    const idx = unit ? order.indexOf(unit.pos) : -1;
    const cell = idx >= 0 && grid ? grid.children[idx] : null;
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
    await new Promise(r => setTimeout(r, 400));

    const badge = document.getElementById('scoreBadge');
    const badgeRect = badge ? badge.getBoundingClientRect() : null;
    if (badgeRect && cellRect) {
        icon.style.left = (badgeRect.left + badgeRect.width - 20) + 'px';
        icon.style.top = (badgeRect.top + badgeRect.height / 2) + 'px';
        icon.style.transform = 'translate(-50%, -50%) scale(0.8)';
        icon.style.opacity = '0.6';
    }
    await new Promise(r => setTimeout(r, 800));

    icon.remove();
    c.updateScoreBadge();
    GlobalStore.set('bulletTimeActive', false);
    c.isPaused = false;
}

export async function handleBuffSummon(c, entry, prevEntry) {
    c.UI.lastSnapshot = { ally: c.UI.allyTeam.map(u => ({...u})), enemy: c.UI.enemyTeam.map(u => ({...u})) };
    // 特效横幅已由导演 stageAction 'summon' 统一触发，此处只播文本
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
    document.getElementById('log').appendChild(div);
    c.autoScrollLog();
}

export async function handleBuffDestroy(c, entry, prevEntry) {
    c.UI.lastSnapshot = { ally: c.UI.allyTeam.map(u => ({...u})), enemy: c.UI.enemyTeam.map(u => ({...u})) };
    // REMOVE_UNIT / 特效横幅已由导演 stageAction 'destroy' 统一处理，此处只播文本
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
    document.getElementById('log').appendChild(div);
    c.autoScrollLog();
}

export async function handleBuffLeech(c, entry) {
    // 死代码：当前 playLogEntries 不再调用 handleBuffLeech（42player-core case 'buff-leech' 直接播文本），
    // 特效/文本走导演 stageAction；此处保留旧逻辑不参与枚举收敛
    // 治疗飘字已由导演 stageAction 'heal' 统一处理
    let bannerText = '🗡️ 嗜血狂刀！';
    if (entry.buffType === 'hotBlood') {
        bannerText = entry.isDouble ? '❤️‍🔥 热血奋战(翻倍)！' : '❤️ 热血奋战！';
    }
    c.isPaused = true;
    await eventBus.emit(FX_SIGNALS.BANNER, { text: bannerText });
    c.isPaused = false;
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
    document.getElementById('log').appendChild(div);
    c.autoScrollLog();
}