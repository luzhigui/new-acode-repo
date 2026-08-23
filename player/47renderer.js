// player/47renderer.js - 光明顶5v5 播放器渲染层
// V5.5.0 | ~5600 bytes| 2026-08-14 DOM操作收口，新增 playLogLine/appendHiddenDetail
export const VER = 'player/47renderer.js V5.5.0';

import { GlobalStore } from '../infra/54-global-store.js';
import { playLineText } from './40player-text.js';

let _ctx = null;
export function setRenderCtx(c) { _ctx = c; }
function ctx() { return _ctx || GlobalStore.get('playerContext'); }

/**
 * UI 层单源化第一步：从 battleStore 实时查找单位
 * store 未就绪时回退到 c.UI 快照，保证迁移期兼容
 */
export function findUnitByUid(c, uid) {
    if (!uid) return null;
    if (c && c.store) {
        const su = c.store.getState().units.find(u => u.uid === uid);
        if (su) return su;
    }
    const ui = (c && c.UI) || {};
    const all = (ui.allyTeam || []).concat(ui.enemyTeam || []);
    return all.find(u => u.uid === uid) || null;
}

// ==================== 日志区 DOM 操作 ====================

export function getLogDiv() { return document.getElementById('log'); }

export function appendLogHTML(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    getLogDiv().appendChild(div);
    autoScrollLog();
}

export function appendLogElement(el) {
    getLogDiv().appendChild(el);
    autoScrollLog();
}

// 创建一行日志并逐字播放，返回创建的元素
export async function playLogLine(text, forcedSpeed = null) {
    let div = document.createElement('div');
    appendLogElement(div);
    await playLineText(text, div, forcedSpeed);
    return div;
}

// 简要模式下隐藏 detail 日志
export function appendHiddenDetail(text) {
    const div = document.createElement('div');
    div.className = 'detail-hidden';
    div.innerHTML = text + '<br>';
    appendLogElement(div);
}

export function autoScrollLog() {
    const c = ctx();
    if (c && c.userScrolled) return;
    const log = getLogDiv();
    if (log) log.scrollTop = log.scrollHeight;
}

export function updateRoundDisplay(text) {
    const el = document.getElementById('roundDisplay');
    if (el) el.innerText = text;
}

// ==================== 分隔符 ====================

export function renderSeparator() {
    const div = document.createElement('div');
    div.innerHTML = '<span class="separator">- - - - -</span><br>';
    getLogDiv().appendChild(div);
    autoScrollLog();
}

// ==================== 回合开始/结束 ====================

export function renderRoundStart(text) {
    appendLogHTML(text + '<br>');
}

export function renderRoundEnd(text) {
    appendLogHTML(text + '<br>');
}

// ==================== 信息行 ====================

export function renderInfoLine(text) {
    appendLogHTML(text + '<br>');
}

// ==================== 战斗结束 ====================

export function renderVictoryLine(html) {
    getLogDiv().innerHTML += html;
    getLogDiv().scrollTop = getLogDiv().scrollHeight;
}

// ==================== 按钮状态 ====================

export function setBtnDisabled(id, disabled) {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = disabled;
}

export function setBtnText(id, text) {
    const btn = document.getElementById(id);
    if (btn) {
        if (text.includes('<br>')) btn.innerHTML = text;
        else btn.textContent = text;
    }
}

// ==================== 初始化 ====================

export function initRenderer(c) {
    setRenderCtx(c);
}

// ==================== 特效清理 ====================

export function clearAllEffects() {
    document.querySelectorAll('[data-fx="temporary"]').forEach(el => { if (el.parentNode) el.parentNode.removeChild(el); });
    document.querySelectorAll('.cell-cheer').forEach(cell => cell.classList.remove('cell-cheer'));
    document.querySelectorAll('.grid.victory-border').forEach(grid => grid.classList.remove('victory-border'));
}

// ==================== 日志滚动控制 ====================

export function initLogScrollControls(c) {
    const logDiv = getLogDiv();
    if (!logDiv) return;
    const btn = document.createElement('div');
    btn.id = 'backToBottomBtn';
    btn.style.cssText = 'position:absolute;right:8px;bottom:60px;width:32px;height:32px;background:rgba(0,0,0,0.6);color:#ffd700;border-radius:50%;display:none;align-items:center;justify-content:center;font-size:18px;cursor:pointer;z-index:20;';
    btn.innerHTML = '↓';
    btn.addEventListener('click', () => {
        logDiv.scrollTop = logDiv.scrollHeight;
        c.userScrolled = false;
        btn.style.display = 'none';
        const fn = GlobalStore.getUIHandler('restoreSpeedFromScroll'); if (fn) fn();
        const mainCtx = ctx();
        if (mainCtx && mainCtx.speed) c.speed = mainCtx.speed;
        else c.speed = 500;
    });
    logDiv.parentElement.appendChild(btn);
    logDiv.addEventListener('scroll', () => {
        const distToBottom = logDiv.scrollHeight - logDiv.scrollTop - logDiv.clientHeight;
        if (distToBottom > 50) {
            c.userScrolled = true;
            btn.style.display = 'flex';
            GlobalStore.set('scrollSlowdown', true);
            const fn = GlobalStore.getUIHandler('activateScrollSlowdown'); if (fn) fn();
        } else {
            c.userScrolled = false;
            btn.style.display = 'none';
            const fn = GlobalStore.getUIHandler('restoreSpeedFromScroll'); if (fn) fn();
        }
    });
}

// ==================== 积分浮动 ====================

export function showScoreFloat(earnPoints) {
    const badge = document.getElementById('scoreBadge');
    if (!badge) return;
    const floatEl = document.createElement('span');
    floatEl.className = 'score-float';
    floatEl.textContent = (earnPoints > 0 ? '+' : '') + earnPoints + '🏆';
    badge.appendChild(floatEl);
    setTimeout(() => { if (floatEl.parentNode) floatEl.parentNode.removeChild(floatEl); }, 3500);
    const c = ctx();
    if (c && c.updateScoreBadge) setTimeout(() => c.updateScoreBadge(), 3500);
}