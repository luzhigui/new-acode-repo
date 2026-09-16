// V6.1.0 | 2026-09-13 统一时间层：setTimeout/setInterval 全换 clock，对象池回收用 seq token
export const VER = 'fx/80fx-common-5v5-test.js V6.1.0';

import { CAMP_TYPES } from '../infra/56-battle-enums.js';
import { snapshotUnitCell } from './90fx-ref-manager.js';
import { clock } from '../infra/52-clock.js';

const POOL = {}; const POOL_SIZES = { danmaku: 8, dmgFloat: 6, dodge: 4, healFloat: 4, atkBuffFloat: 4, buffBanner: 2 };
function initPool(type, createFn) { if (!POOL[type]) { POOL[type] = { available: [], active: [] }; for (let i = 0; i < POOL_SIZES[type]; i++) { let el = createFn(); el.style.display = 'none'; document.body.appendChild(el); POOL[type].available.push(el); } } }

function acquireFromPool(type, setupFn, duration) {
    if (!POOL[type]) return;
    let pool = POOL[type], el;
    if (pool.available.length > 0) {
        el = pool.available.pop();
    } else if (pool.active.length > 0) {
        el = pool.active.shift();
    } else {
        // 对象池耗尽，buffBanner 允许临时补一个；其余直接放弃
        if (type === 'buffBanner') {
            el = createBuffBannerEl();
        } else {
            return;
        }
    }
    if (!el) return;
    setupFn(el);
    el.style.display = '';
    pool.active.push(el);
    // 回收：用 seq token 判断是否已被复用；clock.wait 不可取消，靠 token 拦旧回调
    el._releaseSeq = (el._releaseSeq || 0) + 1;
    const seq = el._releaseSeq;
    if (duration > 0) {
        clock.wait(duration).then(() => {
            if (el._releaseSeq !== seq) return;
            releaseToPool(type, el);
        });
    }
}
function releaseToPool(type, el) { if (!POOL[type]) return; let pool = POOL[type], idx = pool.active.indexOf(el); if (idx >= 0) { pool.active.splice(idx, 1); el.style.display = 'none'; pool.available.push(el); } }

function createDanmakuEl() { let b = document.createElement('div'); b.className = 'danmaku-bubble'; return b; }
initPool('danmaku', createDanmakuEl);
// 弹幕池重置：战斗重置时必须调用，清空池内引用并重建 DOM
export function resetDanmakuPool() {
    const pool = POOL['danmaku'];
    if (!pool) return;
    [...pool.available, ...pool.active].forEach(el => {
        if (el.parentNode) el.parentNode.removeChild(el);
    });
    POOL['danmaku'] = { available: [], active: [] };
    for (let i = 0; i < POOL_SIZES.danmaku; i++) {
        let el = createDanmakuEl();
        el.style.display = 'none';
        document.body.appendChild(el);
        POOL['danmaku'].available.push(el);
    }
}
export function showDanmaku(unit, text) {
    const rect = snapshotUnitCell(unit);
    if (!rect) return;
    acquireFromPool('danmaku', (bubble) => {
        bubble.textContent = text;
        bubble.className = 'danmaku-bubble';
        bubble.classList.add(unit.camp===CAMP_TYPES.ALLY?'ally':'enemy');
        bubble.style.left=(rect.left-4)+'px';
        bubble.style.top=(rect.top+rect.height*0.35)+'px';
        bubble.style.transform='translate(-100%, -50%)';
    }, 3500);
}

function createDmgFloatEl() { let d = document.createElement('div'); d.className = 'dmg-float'; return d; }
initPool('dmgFloat', createDmgFloatEl);
export function showDamageFloat(unit, dmg) {
    const rect = snapshotUnitCell(unit);
    if (!rect) return;
    acquireFromPool('dmgFloat', (dmgEl) => {
        dmgEl.textContent = '-'+dmg;
        dmgEl.style.right=(window.innerWidth-rect.right+4)+'px';
        dmgEl.style.top=(rect.top-4)+'px';
    }, 1400);
}

function createDodgeBubbleEl() { let b = document.createElement('div'); b.className = 'dodge-bubble'; return b; }
initPool('dodge', createDodgeBubbleEl);
export function showDodgeBubble(unit, text) {
    const rect = snapshotUnitCell(unit);
    if (!rect) return;
    acquireFromPool('dodge', (bubble) => {
        bubble.textContent=text;
        bubble.style.left=(rect.left+rect.width/2)+'px';
        bubble.style.top=(rect.top-8)+'px';
    }, 1600);
}

function createHealFloatEl() { let d = document.createElement('div'); d.className = 'heal-float'; return d; }
initPool('healFloat', createHealFloatEl);

// 2026-09-16 同单位回血飘字短时错位：九阳+热血同时回血时两条飘字原先完全重叠
const _healFloatStack = new Map();
const HEAL_STACK_WINDOW = 900;   // ms：同单位在此窗口内的第 N 条上移
const HEAL_STACK_MAX = 3;        // 最多错 3 层，第 4 条回到原位
const HEAL_STACK_STEP = 20;      // 每层上移像素

export function showHealFloat(unit, heal) {
    const rect = snapshotUnitCell(unit);
    if (!rect) return;
    const now = Date.now();
    let rec = _healFloatStack.get(unit.uid);
    if (!rec || now - rec.lastAt > HEAL_STACK_WINDOW) rec = { count: 0, lastAt: now };
    rec.count = (rec.count % HEAL_STACK_MAX) + 1;
    rec.lastAt = now;
    _healFloatStack.set(unit.uid, rec);
    const stackOffset = (rec.count - 1) * HEAL_STACK_STEP;
    acquireFromPool('healFloat', (healEl) => {
        healEl.textContent = '+' + heal;
        healEl.style.left = (rect.left + 12) + 'px';
        healEl.style.right = 'auto';
        healEl.style.top = (rect.top - 4 - stackOffset) + 'px';
        healEl.style.transform = 'translate(-100%, -100%)';
    }, 1400);
}

// 攻击力增加飘字
function createAtkBuffFloatEl() { let d = document.createElement('div'); d.className = 'heal-float'; d.style.color = '#ff8c00'; return d; }
initPool('atkBuffFloat', createAtkBuffFloatEl);
export function showAtkBuffFloat(unit, atk) {
    const rect = snapshotUnitCell(unit);
    if (!rect) return;
    acquireFromPool('atkBuffFloat', (el) => {
        el.textContent = '+' + atk;
        el.style.left = (rect.left + 48) + 'px';
        el.style.right = 'auto';
        el.style.top = (rect.top - 4) + 'px';
        el.style.transform = 'translate(-100%, -100%)';
        el.style.zIndex = '10004';
    }, 1400);
}

// 死亡画笔：600ms 展开覆盖层，clock 驱动
function _executeBrush(div) {
    if (!div) return;
    let oldOverlay = div.querySelector('.brush-overlay');
    if (oldOverlay) oldOverlay.remove();
    div.style.width = 'auto';
    div.offsetHeight;
    div.style.width = '100%';
    div.style.minWidth = '100%';
    let logEl = document.getElementById('log'), paddingLeft = 6;
    if (logEl) { let cs = getComputedStyle(logEl), pl = parseFloat(cs.paddingLeft); if (!isNaN(pl) && pl > 0) paddingLeft = pl; }
    let overlay = document.createElement('div');
    overlay.className = 'brush-overlay';
    overlay.style.position = 'absolute';
    overlay.style.left = (-paddingLeft) + 'px';
    overlay.style.top = '0';
    overlay.style.width = '0';
    overlay.style.height = '100%';
    overlay.style.pointerEvents = 'none';
    div.style.position = 'relative';
    div.appendChild(overlay);
    clock.animate(600, (p) => {
        if (p >= 1) {
            overlay.style.width = 'calc(100% + ' + (paddingLeft*2) + 'px)';
            overlay.style.opacity = '0.6';
        } else {
            overlay.style.width = (p * 100) + '%';
        }
    });
}
export function applyBrushEffect(div) { _executeBrush(div); }
export function applyBrushEffectOnHeal(div, nextDiv) { _executeBrush(div); if (nextDiv) _executeBrush(nextDiv); }

// 乘风突袭波及爪痕特效（视觉由 CSS 动画承担，clock 只负责移除时机）
export function showWindClaw(unit) {
    let grid = document.querySelector(`[data-uid="${unit.uid}"]`);
    if (!grid) return;

    const rect = grid.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    for (let i = 0; i < 3; i++) {
        const claw = document.createElement('div');
        claw.setAttribute('data-fx', 'temporary');
        const angle = -30 + Math.random() * 20;
        const len = 20 + Math.random() * 15;
        const thickness = 1 + Math.random() * 2.5;
        const offsetX = (Math.random() - 0.5) * 20;
        const offsetY = (Math.random() - 0.5) * 20;
        claw.style.cssText = `
            position:fixed; left:${cx + offsetX}px; top:${cy + offsetY}px;
            width:${len}px; height:${thickness}px;
            background: linear-gradient(to right, rgba(45,45,50,0.95), rgba(15,15,20,0.35));
            transform: rotate(${angle}deg);
            z-index:10010; pointer-events:none;
            border-radius: 1px;
            filter: drop-shadow(0 0 5px rgba(255,255,255,0.55)) drop-shadow(0 0 2px rgba(0,0,0,0.7));
            animation: clawSlash 0.5s ease-out forwards;
            animation-delay: ${i * 0.08}s;
        `;
        document.body.appendChild(claw);
        clock.wait(600).then(() => { if (claw.parentNode) claw.remove(); });
    }
}

// 苦练：全队 💪 上浮 + 金圈闪烁
export function showKuLianEffect(unit, team) {
    team.forEach(member => {
        if (!member.alive || member.isHorse) return;
        let grid = document.querySelector(`[data-uid="${member.uid}"]`);
        if (!grid) return;

        let muscle = document.createElement('div');
        muscle.setAttribute('data-fx', 'temporary');
        muscle.innerHTML = '💪';
        muscle.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:20px;z-index:10005;pointer-events:none;opacity:0;';
        grid.style.position = 'relative';
        grid.appendChild(muscle);

        // clock 驱动的上浮：0→0.3 淡入上升到 -120%，0.3→0.8 缓升，0.8→1 淡出
        clock.animate(1500, (p) => {
            let op, ty;
            if (p <= 0.3) { const t = p / 0.3; op = t; ty = -50 - 70 * t; }
            else if (p <= 0.8) { const t = (p - 0.3) / 0.5; op = 1; ty = -120 - 10 * t; }
            else { const t = (p - 0.8) / 0.2; op = 1 - t; ty = -130 - 30 * t; }
            muscle.style.opacity = op;
            muscle.style.transform = `translate(-50%, ${ty}%)`;
        });

        // 金圈闪烁：blinks*2 次相位切换，clock 驱动
        const totalBlinks = (member.uid === unit.uid ? 3 : 2) * 2;
        let lastPhase = -1;
        clock.animate(totalBlinks * 400, (p) => {
            const phase = Math.min(totalBlinks - 1, Math.floor(p * totalBlinks));
            if (phase !== lastPhase) {
                lastPhase = phase;
                grid.style.boxShadow = (phase % 2 === 0) ? '0 0 12px rgba(255,215,0,0.7)' : '';
            }
            if (p >= 1) grid.style.boxShadow = '';
        });

        clock.wait(2000).then(() => { if (muscle.parentNode) muscle.remove(); });
    });
}

// 全屏横幅
function createBuffBannerEl() { let d = document.createElement('div'); d.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:2.5rem;font-weight:bold;color:#ffd700;z-index:10030;pointer-events:none;text-shadow:0 0 20px rgba(255,215,0,0.8);white-space:nowrap;animation:bannerPop 1.5s ease-out forwards;'; return d; }
initPool('buffBanner', createBuffBannerEl);

export async function showBuffBanner(text) {
    return new Promise(resolve => {
        try {
            acquireFromPool('buffBanner', (banner) => {
                if (!banner) return;
                banner.textContent = text;
                banner.style.animation = 'none';
                banner.offsetHeight;
                banner.style.animation = 'bannerPop 1.5s ease-out forwards';
            }, 1500);
        } catch (e) {
            console.error('showBuffBanner 对象池异常:', e);
        }
        // 阻塞横幅：clock.wait 在暂停时挂起、快进时立即完成，不会死锁
        clock.wait(1500).then(resolve);
    });
}

// 大型横幅，用于闪避反击等重要事件，不走对象池，独立创建
export function showCriticalBanner(text) {
    return new Promise(resolve => {
        const banner = document.createElement('div');
        banner.textContent = text;
        banner.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:3.5rem;font-weight:bold;color:#FFD700;z-index:10050;pointer-events:none;text-shadow:0 0 30px rgba(255,215,0,0.9), 0 0 10px black;white-space:nowrap;animation:bannerPop 2.5s ease-out forwards;';
        document.body.appendChild(banner);
        clock.wait(2500).then(() => {
            if (banner.parentNode) banner.remove();
            resolve();
        });
    });
}

// 通用气泡
export function showComicBubble(text, x, y, className) {
    const bubble = document.createElement('div');
    bubble.className = `comic-bubble ${className}`; bubble.textContent = text;
    bubble.style.left = x + 'px'; bubble.style.top = y + 'px';
    bubble.style.transform = 'translate(-50%, -50%)';
    bubble.style.position = 'fixed'; bubble.style.zIndex = '10030';
    bubble.style.background = 'white'; bubble.style.border = '2px solid #FFD700';
    bubble.style.borderRadius = '20px'; bubble.style.padding = '10px 20px';
    bubble.style.fontWeight = 'bold'; bubble.style.fontSize = '16px';
    bubble.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
    bubble.style.pointerEvents = 'none'; bubble.style.whiteSpace = 'nowrap';
    bubble.style.animation = 'bubbleIn 0.3s ease-out';
    bubble.setAttribute('data-fx', 'temporary');
    document.body.appendChild(bubble);
    clock.wait(4000).then(() => {
        bubble.style.transition = 'opacity 0.3s'; bubble.style.opacity = '0';
        clock.wait(300).then(() => bubble.remove());
    });
    return bubble;
}

// 新婚爱心特效（在格子中间显示淡粉红爱心）
export function showHeartEffect(unit) {
    let grid = document.querySelector(`[data-uid="${unit.uid}"]`);
    if (!grid) return;

    let heart = document.createElement('div');
    heart.setAttribute('data-fx', 'temporary');
    heart.innerHTML = '💖';
    grid.style.position = 'relative';
    heart.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:24px;color:#FFB6C1;text-shadow:0 0 8px #FFB6C1;z-index:9999;opacity:0;transition:opacity 0.3s, transform 0.3s;pointer-events:none;';
    grid.appendChild(heart);

    requestAnimationFrame(() => {
        heart.style.opacity = '1';
        heart.style.transform = 'translate(-50%, -120%)';
    });

    clock.wait(1500).then(() => { heart.style.opacity = '0'; });
    clock.wait(2000).then(() => { if (heart.parentNode) heart.parentNode.removeChild(heart); });
}

// 快乐掉血闪动特效（淡红色闪动）
export function showPinkFlash(unit) {
    let grid = document.querySelector(`[data-uid="${unit.uid}"]`);
    if (!grid) return;
    let flash = document.createElement('div');
    flash.className = 'pink-flash';
    flash.setAttribute('data-fx', 'temporary');
    flash.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(255, 105, 180, 0.4);z-index:9;pointer-events:none;opacity:0;';
    grid.appendChild(flash);
    let lastPhase = -1;
    clock.animate(600, (p) => {
        const phase = Math.min(3, Math.floor(p * 4));
        if (phase !== lastPhase) {
            lastPhase = phase;
            flash.style.opacity = (phase % 2 === 0) ? '1' : '0';
        }
        if (p >= 1) {
            flash.style.opacity = '0';
            clock.wait(300).then(() => { if (flash.parentNode) flash.parentNode.removeChild(flash); });
        }
    });
}