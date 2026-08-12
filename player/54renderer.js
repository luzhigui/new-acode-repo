// player/54renderer.js - 光明顶5v5 播放器渲染层
// V5.4.0 | ~3300 bytes| 2026-08-10 从10player-core提取DOM操作
export const VER = 'player/54renderer.js V5.4.0';

let _ctx = null;
export function setRenderCtx(c) { _ctx = c; }
function ctx() { return _ctx || (window._getPlayerContext ? window._getPlayerContext() : GlobalStore.get('playerContext')); }

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