// ui/723-hex-active.js — 圣火令主动使用（一局一次）
//   流程：
//     掉落 → player/502 动画结束调 onHolyTokenDrop → 右下角待用图标 + 横幅
//     点「继续」（PAUSED→RUNNING 或 waitingForNextRound→RUNNING）→ onContinueForHex → 飞入中央
//     拖动中央 slot → 落红血单位 → 本地预演 + submitHexAction 入队 → 下一 makeStep 引擎消费
//   状态机：idle → pending → centered → dragging → used
export const VER = 'ui/723-hex-active.js V1.0.0';

import { GlobalStore } from '../infra/104-global-store.js';
import { submitHexAction } from '../core/210-battle-round.js';

const LOW_HP = 0.30;
const EXEC_HP = 0.10;

let hexState = 'idle';
let dragging = false;
let hoverCell = null;
let slotCenter = { x: 0, y: 0 };
let _flyingIn = false;

const $ = (id) => document.getElementById(id);

// ═══ 掉落：横幅 + 右下角待用图标 ═══
export function onHolyTokenDrop() {
    if (hexState === 'used') return;
    if (hexState !== 'idle' && hexState !== 'pending') return;
    hexState = 'pending';

    const b = $('hexBanner');
    if (b) { b.classList.add('visible'); setTimeout(() => b.classList.remove('visible'), 1800); }

    const p = $('hexPending');
    if (p) { p.classList.add('visible'); p.onclick = triggerFlyIn; }

    pushLogTip('🔥 获得 1 枚圣火令 · 点「继续」后可用');

    // autoMode 下没有「点继续」的时机，3 秒后自动飞入
    setTimeout(() => {
        if (hexState === 'pending') triggerFlyIn();
    }, 3000);
}

function pushLogTip(text) {
    const log = $('log');
    if (!log) return;
    const d = document.createElement('div');
    d.innerHTML = `<span class="gold">${text}</span>`;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
}

// ═══ 继续：待用图标飞入中央 ═══
export function onContinueForHex() {
    if (hexState === 'pending') triggerFlyIn();
}

function triggerFlyIn() {
    if (hexState !== 'pending' || _flyingIn) return;
    _flyingIn = true;

    const p = $('hexPending');
    const bf = $('battlefield');
    if (!p || !bf) { _flyingIn = false; return; }

    const pr = p.getBoundingClientRect();
    const startX = pr.left + pr.width / 2, startY = pr.top + pr.height / 2;
    const bfRect = bf.getBoundingClientRect();
    const targetX = bfRect.left + bfRect.width / 2;
    const targetY = bfRect.top + bfRect.height / 2;

    const flyer = document.createElement('div');
    flyer.style.cssText = `position:fixed;z-index:190;width:60px;height:60px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;font-size:30px;
        background:radial-gradient(circle at 35% 30%, #ffe066, #d97706 70%, #7a3a00);
        border:2.5px solid #ffd700;box-shadow:0 0 32px rgba(255,215,0,1),0 8px 24px rgba(0,0,0,0.6);
        color:#fff;pointer-events:none;left:${startX - 30}px;top:${startY - 30}px;`;
    flyer.textContent = '🔥';
    document.body.appendChild(flyer);

    const DUR = 520, t0 = performance.now();
    function step(now) {
        const p2 = Math.min(1, (now - t0) / DUR);
        const e = p2 < 0.5 ? 2 * p2 * p2 : 1 - Math.pow(-2 * p2 + 2, 2) / 2;
        const arc = Math.sin(Math.PI * p2) * 40;
        const cx = startX + (targetX - startX) * e;
        const cy = startY + (targetY - startY) * e - arc;
        flyer.style.left = (cx - 30) + 'px';
        flyer.style.top = (cy - 30) + 'px';
        flyer.style.transform = `scale(${1 + 0.18 * Math.sin(Math.PI * p2)})`;
        if (p2 < 1) requestAnimationFrame(step);
        else {
            flyer.remove();
            p.classList.remove('visible');
            const slot = $('hexSlot');
            if (!slot) { _flyingIn = false; return; }
            slot.style.left = (targetX - bfRect.left) + 'px';
            slot.style.top = (targetY - bfRect.top) + 'px';
            slot.classList.add('visible');
            void slot.offsetWidth;
            slot.classList.add('landing');
            setTimeout(() => {
                slot.classList.remove('landing');
                slotCenter = { x: targetX, y: targetY };
                hexState = 'centered';
                slot.onpointerdown = onDown;
                _flyingIn = false;
            }, 520);
        }
    }
    requestAnimationFrame(step);
}

// ═══ 拖动 ═══
function onDown(e) {
    if (hexState !== 'centered') return;
    e.preventDefault();
    dragging = true;
    hexState = 'dragging';
    $('hexSlot').classList.add('dragging');
    const sr = $('hexSlot').getBoundingClientRect();
    slotCenter = { x: sr.left + sr.width / 2, y: sr.top + sr.height / 2 };
    const ghost = $('hexGhost');
    ghost.classList.add('visible');
    ghost.style.left = (e.clientX - 30) + 'px';
    ghost.style.top = (e.clientY - 30) + 'px';
    $('hexLinkSvg').classList.add('visible');
    updateLink(e.clientX, e.clientY);
    startFlowDots();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
}

function onMove(e) {
    if (!dragging) return;
    const ghost = $('hexGhost');
    ghost.style.left = (e.clientX - 30) + 'px';
    ghost.style.top = (e.clientY - 30) + 'px';
    updateLink(e.clientX, e.clientY);
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el && el.closest && el.closest('.cell');
    if (cell !== hoverCell) {
        clearHover();
        hoverCell = cell;
        if (cell && !cell.classList.contains('empty')) {
            const mode = getMode(cell);
            if (mode) cell.classList.add(mode === 'heal' ? 'hex-drop-heal' : 'hex-drop-dmg');
            else cell.classList.add('hex-drop-invalid');
        }
    }
    const mode = hoverCell ? getMode(hoverCell) : null;
    const tip = $('hexTip');
    if (mode) {
        tip.textContent = mode === 'heal' ? '💚 松手：恢复 30% 生命' : '💥 松手：造成 15% 真伤';
        tip.className = 'visible ' + mode;
        tip.style.left = (e.clientX + 16) + 'px';
        tip.style.top = (e.clientY + 20) + 'px';
    } else {
        tip.className = '';
    }
}

function onUp() {
    if (!dragging) return;
    dragging = false;
    $('hexSlot').classList.remove('dragging');
    $('hexLinkSvg').classList.remove('visible');
    $('hexGhost').classList.remove('visible');
    $('hexTip').className = '';
    stopFlowDots();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    const mode = hoverCell ? getMode(hoverCell) : null;
    if (mode) {
        applyEffect(hoverCell, mode);
        clearHover();
        hoverCell = null;
        return;
    }
    const wasInvalid = hoverCell && !hoverCell.classList.contains('empty');
    clearHover();
    hoverCell = null;
    hexState = 'centered';
    if (wasInvalid) showToast('❌ 该目标未红血，不可使用', 1300);
}

function updateLink(px, py) {
    const cx = slotCenter.x, cy = slotCenter.y;
    const mx = (cx + px) / 2;
    const my = (cy + py) / 2 - 50;
    const d = `M ${cx} ${cy} Q ${mx} ${my} ${px} ${py}`;
    $('hexLinkPath').setAttribute('d', d);
    $('hexLinkGlow').setAttribute('d', d);
    $('hexLinkCore').setAttribute('d', d);
    $('hexLinkHead').setAttribute('cx', px);
    $('hexLinkHead').setAttribute('cy', py);
}

let _flowRaf = 0, _flowT0 = 0;
const FLOW_DOT_COUNT = 4;
function startFlowDots() {
    const dots = $('hexFlowDots');
    dots.innerHTML = '';
    for (let i = 0; i < FLOW_DOT_COUNT; i++) {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('r', '4');
        c.setAttribute('class', 'hex-flow-dot');
        dots.appendChild(c);
    }
    _flowT0 = performance.now();
    const all = dots.querySelectorAll('.hex-flow-dot');
    function tick(now) {
        if (!dragging) return;
        const path = $('hexLinkPath');
        const len = path.getTotalLength();
        if (len < 1) { _flowRaf = requestAnimationFrame(tick); return; }
        const offset = ((now - _flowT0) / 900) % 1;
        all.forEach((c, i) => {
            const t = (offset + i / FLOW_DOT_COUNT) % 1;
            const pt = path.getPointAtLength(t * len);
            c.setAttribute('cx', pt.x);
            c.setAttribute('cy', pt.y);
            c.setAttribute('opacity', String(0.4 + 0.6 * Math.sin(t * Math.PI)));
        });
        _flowRaf = requestAnimationFrame(tick);
    }
    _flowRaf = requestAnimationFrame(tick);
}
function stopFlowDots() {
    if (_flowRaf) cancelAnimationFrame(_flowRaf);
    _flowRaf = 0;
    $('hexFlowDots').innerHTML = '';
}

function getMode(cell) {
    const hp = +cell.dataset.hp;
    const maxHp = +cell.dataset.maxHp;
    if (hp / maxHp >= LOW_HP) return null;
    return cell.dataset.camp === 'ally' ? 'heal' : 'dmg';
}

function clearHover() {
    document.querySelectorAll('.hex-drop-heal, .hex-drop-dmg, .hex-drop-invalid').forEach(c => {
        c.classList.remove('hex-drop-heal', 'hex-drop-dmg', 'hex-drop-invalid');
    });
}

// ═══ 生效：本地预演 + 引擎队列 ═══
function applyEffect(cell, mode) {
    const uid = cell.dataset.uid;
    const hp = +cell.dataset.hp;
    const maxHp = +cell.dataset.maxHp;

    // 本地预演（血条 + toast；引擎下一步消费时数值一致，不会回跳）
    let newHp;
    if (mode === 'heal') {
        const heal = Math.floor(maxHp * 0.30);
        newHp = Math.min(maxHp, hp + heal);
        showToast(`💚 恢复 ${heal} 点生命`, 1600);
    } else {
        const dmg = Math.floor(maxHp * 0.15);
        const isExec = (hp / maxHp) < EXEC_HP;
        newHp = isExec ? 0 : Math.max(0, hp - dmg);
        showToast(isExec ? `💥 ${dmg} 真伤 + 斩杀` : `💥 ${dmg} 点真实伤害`, 1600);
    }
    cell.dataset.hp = newHp;
    const bar = cell.querySelector('.hp-bar-inner');
    if (bar) bar.style.height = ((newHp / maxHp) * 100) + '%';
    if (newHp / maxHp < LOW_HP) cell.classList.add('low-hp');
    else cell.classList.remove('low-hp');

    // 引擎队列
    submitHexAction(uid, mode);

    // 本局已用：slot 消失
    hexState = 'used';
    const slot = $('hexSlot');
    slot.classList.remove('visible', 'landing');
    slot.style.cssText = '';

    // 圣火令 -1
    const tc = document.querySelector('.token-badge');
    if (tc) {
        const cur = parseInt(tc.textContent.replace(/\D/g, '')) || 0;
        setTimeout(() => { tc.textContent = `🔥 ${Math.max(0, cur - 1)}`; }, 300);
    }
}

// ═══ Toast ═══
let _tTimer = 0;
function showToast(msg, ms) {
    let el = $('hexToast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'hexToast';
        el.style.cssText = `position:fixed;left:50%;bottom:16%;transform:translateX(-50%);
            padding:8px 16px;border-radius:8px;background:rgba(20,12,4,0.96);color:#ffd700;
            border:1px solid #ffd700;font-size:12px;font-weight:bold;z-index:300;
            pointer-events:none;opacity:0;transition:opacity .2s;white-space:nowrap;
            box-shadow:0 4px 16px rgba(0,0,0,0.6);`;
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(_tTimer);
    _tTimer = setTimeout(() => { el.style.opacity = '0'; }, ms || 1500);
}

// ═══ 跨局重置 ═══
GlobalStore.on('gs', (v) => {
    if (v === 'IDLE') {
        hexState = 'idle';
        _flyingIn = false;
        const p = $('hexPending'); if (p) p.classList.remove('visible');
        const s = $('hexSlot'); if (s) { s.classList.remove('visible', 'landing', 'dragging'); s.style.cssText = ''; }
        const tip = $('hexTip'); if (tip) tip.className = '';
    }
});

// ═══ UIHandler 注册 ═══
GlobalStore.setUIHandler('onHolyTokenDrop', onHolyTokenDrop);
GlobalStore.setUIHandler('onContinueForHex', onContinueForHex);