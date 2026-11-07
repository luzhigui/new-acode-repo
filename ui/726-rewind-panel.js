// ui/726-rewind-panel.js — 倒针面板（默认开，暂停时才露入口）：入口按钮 + 底部小面板
//   默认不需要任何地址参数；?rewind=0 或 localStorage.gmd_rewind='0' 可彻底关掉（不建 DOM、不起定时器）。
import { GlobalStore } from '../infra/104-global-store.js';
import { STATE } from '../core/201-config-5v5-test.js';
import {
    isRewindEnabled, isActive, getView, enterReview, exitReview,
    prevStep, nextStep, prevCue, nextCue, pausePlay, resumePlay, fastForward
} from '../modules/390-rewind-core.js';

const BTN_STYLE = 'min-width:44px;min-height:40px;padding:6px 8px;border-radius:8px;border:1px solid #c9a227;background:#1e1e22;color:#f5d76e;font-size:14px;line-height:1;';

let _entry = null;
let _bar = null;
let _status = null;
let _playBtn = null;
let _timer = null;
let _entering = false;

function injectStyle() {
    if (document.getElementById('rewind-style')) return;
    const st = document.createElement('style');
    st.id = 'rewind-style';
    st.textContent = `
      /* 手机竖屏：入口浮在底部操作条上方居中，避开浏览器地址栏/安全区；z-index 压过所有 FX 层 */
      #rewind-entry{position:fixed;left:50%;transform:translateX(-50%);
        bottom:calc(96px + env(safe-area-inset-bottom,0px));z-index:2147483000;
        ${BTN_STYLE}min-width:96px;min-height:44px;font-size:15px;opacity:.92}
      #rewind-bar{position:fixed;left:6px;right:6px;
        bottom:calc(6px + env(safe-area-inset-bottom,0px));z-index:2147483001;display:none;
        box-sizing:border-box;max-width:calc(100vw - 12px);max-height:42vh;overflow:auto;
        background:rgba(18,18,22,.96);border:1px solid #c9a227;border-radius:10px;
        padding:8px 8px calc(8px + env(safe-area-inset-bottom,0px));box-shadow:0 4px 18px rgba(0,0,0,.6);}
      #rewind-bar .rw-row{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
      #rewind-bar button{${BTN_STYLE}min-width:52px;min-height:42px}
      #rewind-status{color:#e8e8e8;font-size:12px;text-align:center;margin:2px 0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #rewind-bar .rw-close{background:#3a1414;color:#ff9c9c;border-color:#7a2a2a}
    `;
    document.head.appendChild(st);
}

function stopEvent(el) {
    for (const ev of ['touchstart', 'touchend', 'mousedown', 'click']) {
        el.addEventListener(ev, (e) => e.stopPropagation());
    }
}

function makeEntry() {
    if (_entry) return _entry;
    _entry = document.createElement('button');
    _entry.id = 'rewind-entry';
    _entry.textContent = '⏪ 倒针';
    _entry.title = '回看本局已打的步骤（调试）';
    _entry.style.display = 'none';   // 首次 tick 前先藏住，避免 IDLE 闪一下
    stopEvent(_entry);
    _entry.addEventListener('click', onEnter);
    document.body.appendChild(_entry);
    return _entry;
}

async function onEnter() {
    if (_entering || isActive()) return;
    _entering = true;
    if (_entry) _entry.textContent = '⏪ 准备…';
    const r = await enterReview();
    _entering = false;
    if (_entry) _entry.textContent = '⏪ 倒针';
    if (!r.ok) { alert('倒针：' + (r.msg || '暂不可用')); return; }
    showBar();
    renderStatus();
}

function makeBar() {
    if (_bar) return _bar;
    _bar = document.createElement('div');
    _bar.id = 'rewind-bar';
    _status = document.createElement('div');
    _status.id = 'rewind-status';
    _bar.appendChild(_status);

    const row = document.createElement('div');
    row.className = 'rw-row';
    const btn = (text, fn, cls) => {
        const b = document.createElement('button');
        b.textContent = text;
        if (cls) b.className = cls;
        stopEvent(b);
        b.addEventListener('click', (e) => { e.stopPropagation(); fn(); renderStatus(); });
        row.appendChild(b);
        return b;
    };
    btn('⏮ 步', prevStep);
    btn('步 ⏭', nextStep);
    btn('◀ 段', prevCue);
    btn('段 ▶', nextCue);
    _playBtn = btn('▶ 播放', () => {
        const v = getView();
        if (v.playing) pausePlay();
        else resumePlay();
        renderStatus();
    });
    btn('⏩ 到底', () => { fastForward(); });
    btn('✕', () => { exitReview({ resume: false }); hideBar(); }, 'rw-close');

    _bar.appendChild(row);
    stopEvent(_bar);
    document.body.appendChild(_bar);
    return _bar;
}

function showBar() { makeBar().style.display = 'block'; }
function hideBar() { if (_bar) _bar.style.display = 'none'; }

function renderStatus() {
    if (!_status) return;
    const v = getView();
    if (!v.active) { hideBar(); return; }
    const cueNo = Math.min(v.cueIdx + 1, Math.max(1, v.cueCount));
    _status.textContent = `第 ${v.stepIdx + 1}/${v.stepCount} 步 · 段 ${cueNo}/${v.cueCount} · ${v.label || ''}`;
    if (_playBtn) _playBtn.textContent = v.playing ? '⏸ 停' : '▶ 播放';
}

function inBattle() {
    const gs = GlobalStore.get('gs');
    return gs === STATE.RUNNING || gs === STATE.PAUSED;
}

function pausedNow() {
    return GlobalStore.get('gs') === STATE.PAUSED || GlobalStore.get('isPaused') === true;
}

function tick() {
    const battleOn = inBattle();
    // 入口只在「战斗中 + 已暂停」露头：不暂停不打扰正常游玩
    const showEntry = battleOn && !isActive() && pausedNow();
    if (_entry) _entry.style.display = showEntry ? 'block' : 'none';
    if (!battleOn && isActive()) { exitReview({ resume: false }); hideBar(); }
    if (isActive()) renderStatus();
    else hideBar();
}

export function initRewindPanel() {
    if (!isRewindEnabled()) return;   // 默认关：不建 DOM、不起定时器
    injectStyle();
    makeEntry();
    _timer = setInterval(tick, 300);
}

if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRewindPanel, { once: true });
    } else {
        initRewindPanel();
    }
}
