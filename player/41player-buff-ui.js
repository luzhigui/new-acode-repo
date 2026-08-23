﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// player/41player-buff-ui.js - 光明顶5v5 Buff横幅与handler
// V5.6.0 | ~5600 bytes| 2026-08-21 弹窗拆至ui/70buff-dialog.js，只留handler
export const VER = 'player/41player-buff-ui.js V5.6.0';

import { Unit } from '../core/02unit.js';
import { showHealFloat, showBuffBanner } from '../fx/87fx-manager.js';
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

    // 放大旋转
    await new Promise(r => {
        requestAnimationFrame(() => {
            icon.style.transform = 'translate(-50%, -50%) scale(1.5) rotate(360deg)';
            r();
        });
    });
    await new Promise(r => setTimeout(r, 400));

    // 飘到积分徽章
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
    // 拒马单位已由 unit-add 事件添加，此函数只负责横幅与日志文本
    // 保留 lastSnapshot 快照，后续可改为从 Store 计算，暂时保留直接赋值
    c.UI.lastSnapshot = { ally: c.UI.allyTeam.map(u => ({...u})), enemy: c.UI.enemyTeam.map(u => ({...u})) };
    if (entry.horseTaunt) {
        // 连续出拒马时稍作停顿，避免两匹同时弹幕太突兀
        if (prevEntry && prevEntry.type === 'buff-summon' && prevEntry.horseTaunt) {
            await new Promise(r => setTimeout(r, 600));
        }
        // 先让格子渲染出来
        c.updateUI(c.UI);
        // 再暂停播弹幕，弹幕结束后格子已经在了
        c.isPaused = true;
        await showBuffBanner('🐴 拒马阵！' + entry.horseTaunt);
        c.isPaused = false;
    }
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
    document.getElementById('log').appendChild(div);
    c.autoScrollLog();
}

export async function handleBuffDestroy(c, entry, prevEntry) {
    // 通过 Store dispatch 移除单位
    c.store.dispatch({ type: 'REMOVE_UNIT', uid: entry.horseUid });
    // 保留 lastSnapshot 快照
    c.UI.lastSnapshot = { ally: c.UI.allyTeam.map(u => ({...u})), enemy: c.UI.enemyTeam.map(u => ({...u})) };
    c.isPaused = true;
    await showBuffBanner('🐴 拒马已销毁');
    c.isPaused = false;
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
    document.getElementById('log').appendChild(div);
    c.autoScrollLog();
}

export async function handleBuffLeech(c, entry) {
    // 只负责飘字和横幅，不修改血量（血量已由引擎事件同步到 Store）
    let healUnit = findUnitByUid(c, entry.healUnitUid);
    if (healUnit && entry.healAmount) {
        showHealFloat(healUnit, entry.healAmount);
    }
    let bannerText = '🗡️ 嗜血狂刀！';
    if (entry.buffType === 'hotBlood') {
        bannerText = entry.isDouble ? '❤️‍🔥 热血奋战(翻倍)！' : '❤️ 热血奋战！';
    }
    c.isPaused = true;
    await showBuffBanner(bannerText);
    c.isPaused = false;
    let div=document.createElement('div');div.innerHTML=entry.text+'<br>';
    document.getElementById('log').appendChild(div);
    c.autoScrollLog();
}