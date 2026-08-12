﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿// fx/15fx-common-5v5-test.js - 光明顶5v5 基础特效池
// V5.4.0 | ~17300 bytes| 2026-07-05
export const VER = 'fx/15fx-common-5v5-test.js V5.4.0';

const POOL = {}; const POOL_SIZES = { danmaku: 8, dmgFloat: 6, dodge: 4, healFloat: 4, atkBuffFloat: 4, buffBanner: 2 };
function initPool(type, createFn) { if (!POOL[type]) { POOL[type] = { available: [], active: [] }; for (let i = 0; i < POOL_SIZES[type]; i++) { let el = createFn(); el.style.display = 'none'; document.body.appendChild(el); POOL[type].available.push(el); } } }

function acquireFromPool(type, setupFn, duration) {
    if (!POOL[type]) return;
    let pool = POOL[type], el;
    if (pool.available.length > 0) {
        el = pool.available.pop();
    } else if (pool.active.length > 0) {
        el = pool.active.shift();
        if (el._timeoutId) clearTimeout(el._timeoutId);
    } else {
        // 对象池耗尽，临时创建一个新元素，用完即弃
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
    if (duration > 0) {
        el._timeoutId = setTimeout(() => { releaseToPool(type, el); }, duration);
    }
}
function releaseToPool(type, el) { if (!POOL[type]) return; let pool = POOL[type], idx = pool.active.indexOf(el); if (idx >= 0) { pool.active.splice(idx, 1); el.style.display = 'none'; el._timeoutId = null; pool.available.push(el); } }

function createDanmakuEl() { let b = document.createElement('div'); b.className = 'danmaku-bubble'; return b; }
initPool('danmaku', createDanmakuEl);
export function showDanmaku(unit, text) { let gridId = unit.camp === 'ally' ? 'allyGrid' : 'enemyGrid', grid = document.getElementById(gridId), cells = grid.children; let displayOrder = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9], idx = displayOrder.indexOf(unit.pos); if (idx >= 0 && cells[idx]) { let rect = cells[idx].getBoundingClientRect(); acquireFromPool('danmaku', (bubble) => { bubble.textContent = text; bubble.className = 'danmaku-bubble'; bubble.classList.add(unit.camp==='ally'?'ally':'enemy'); bubble.style.left=(rect.left-4)+'px'; bubble.style.top=(rect.top+rect.height*0.35)+'px'; bubble.style.transform='translate(-100%, -50%)'; }, 3500); } }

function createDmgFloatEl() { let d = document.createElement('div'); d.className = 'dmg-float'; return d; }
initPool('dmgFloat', createDmgFloatEl);
export function showDamageFloat(unit, dmg) { let gridId = unit.camp === 'ally' ? 'allyGrid' : 'enemyGrid', grid = document.getElementById(gridId), cells = grid.children; let displayOrder = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9], idx = displayOrder.indexOf(unit.pos); if (idx >= 0 && cells[idx]) { let rect = cells[idx].getBoundingClientRect(); acquireFromPool('dmgFloat', (dmgEl) => { dmgEl.textContent = '-'+dmg; dmgEl.style.right=(window.innerWidth-rect.right+4)+'px'; dmgEl.style.top=(rect.top-4)+'px'; }, 1400); } }

function createDodgeBubbleEl() { let b = document.createElement('div'); b.className = 'dodge-bubble'; return b; }
initPool('dodge', createDodgeBubbleEl);
export function showDodgeBubble(unit, text) { let gridId = unit.camp === 'ally' ? 'allyGrid' : 'enemyGrid', grid = document.getElementById(gridId), cells = grid.children; let displayOrder = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9], idx = displayOrder.indexOf(unit.pos); if (idx >= 0 && cells[idx]) { let rect = cells[idx].getBoundingClientRect(); acquireFromPool('dodge', (bubble) => { bubble.textContent=text; bubble.style.left=(rect.left+rect.width/2)+'px'; bubble.style.top=(rect.top-8)+'px'; }, 1600); } }

function createHealFloatEl() { let d = document.createElement('div'); d.className = 'heal-float'; return d; }
initPool('healFloat', createHealFloatEl);
export function showHealFloat(unit, heal) { let gridId = unit.camp === 'ally' ? 'allyGrid' : 'enemyGrid', grid = document.getElementById(gridId), cells = grid.children; let displayOrder = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9], idx = displayOrder.indexOf(unit.pos); if (idx >= 0 && cells[idx]) { let rect = cells[idx].getBoundingClientRect(); acquireFromPool('healFloat', (healEl) => { healEl.textContent = '+' + heal; // 定位到格子外面左上角：右锚定到格子左边缘-4，让文字向左生长；顶部高于格子4px
            healEl.style.left = (rect.left + 12) + 'px'; healEl.style.right = 'auto'; healEl.style.top = (rect.top - 4) + 'px'; healEl.style.transform = 'translate(-100%, -100%)'; }, 1400); } }

// 攻击力增加飘字
function createAtkBuffFloatEl() { let d = document.createElement('div'); d.className = 'heal-float'; d.style.color = '#ff8c00'; return d; }
initPool('atkBuffFloat', createAtkBuffFloatEl);
export function showAtkBuffFloat(unit, atk) { let gridId = unit.camp === 'ally' ? 'allyGrid' : 'enemyGrid', grid = document.getElementById(gridId), cells = grid.children; let displayOrder = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9], idx = displayOrder.indexOf(unit.pos); if (idx >= 0 && cells[idx]) { let rect = cells[idx].getBoundingClientRect(); acquireFromPool('atkBuffFloat', (el) => { el.textContent = '+' + atk; el.style.left = (rect.left + 48) + 'px'; el.style.right = 'auto'; el.style.top = (rect.top - 4) + 'px'; el.style.transform = 'translate(-100%, -100%)'; el.style.zIndex = '10004'; }, 1400); } }

function _executeBrush(div) { if (!div) return; let oldOverlay = div.querySelector('.brush-overlay'); if (oldOverlay) oldOverlay.remove(); div.style.width = 'auto'; div.offsetHeight; div.style.width = '100%'; div.style.minWidth = '100%'; let logEl = document.getElementById('log'), paddingLeft = 6; if (logEl) { let cs = getComputedStyle(logEl), pl = parseFloat(cs.paddingLeft); if (!isNaN(pl) && pl > 0) paddingLeft = pl; } let overlay = document.createElement('div'); overlay.className = 'brush-overlay'; overlay.style.position = 'absolute'; overlay.style.left = (-paddingLeft) + 'px'; overlay.style.top = '0'; overlay.style.width = 'calc(100% + ' + (paddingLeft*2) + 'px)'; overlay.style.height = '100%'; overlay.style.pointerEvents = 'none'; div.style.position = 'relative'; div.appendChild(overlay); let start = null; function animate(ts) { if (!start) start = ts; let progress = (ts - start) / 600; if (progress >= 1) { overlay.style.width = 'calc(100% + ' + (paddingLeft*2) + 'px)'; overlay.style.opacity = '0.6'; } else { overlay.style.width = (progress * 100) + '%'; requestAnimationFrame(animate); } } requestAnimationFrame(animate); }
export function applyBrushEffect(div) { _executeBrush(div); }
export function applyBrushEffectOnHeal(div, nextDiv) { _executeBrush(div); if (nextDiv) _executeBrush(nextDiv); }

// ==================== 通用受击反馈：缩小+颤动+短闪 ====================
// 飞箭/溅射/白骨爪/飞撞/近身通用
export function applyImpactShrink(cell, durationMs, getPausedFn, opts) {
    if (GlobalStore.get('fastForwardActive') || !cell) return;
    opts = opts || {};
    let bgColor = opts.bgColor || '#ffd700';
    let bgDuration = opts.bgDuration || Math.min(200, durationMs);
    let originalTransform = cell.style.transform || '';
    let originalTransition = cell.style.transition || '';
    let originalBg = cell.style.background || '';
    cell.style.transition = 'background 0.1s ease';
    cell.style.background = bgColor;
    let bgCleared = false;
    let start = null;
    function shake(ts) {
        if (getPausedFn && getPausedFn()) { requestAnimationFrame(shake); return; }
        if (!start) start = ts;
        let elapsed = ts - start;
        if (elapsed >= durationMs) {
            cell.style.transform = originalTransform;
            cell.style.transition = originalTransition;
            if (!bgCleared) { cell.style.background = originalBg; bgCleared = true; }
            return;
        }
        let progress = elapsed / durationMs;
        let decay = 1 - progress;
        let scale = 0.88 + 0.12 * progress;
        let offsetX = (Math.random() - 0.5) * 4 * decay;
        let offsetY = (Math.random() - 0.5) * 4 * decay;
        cell.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        if (!bgCleared && elapsed > bgDuration) {
            cell.style.background = originalBg;
            bgCleared = true;
        }
        requestAnimationFrame(shake);
    }
    requestAnimationFrame(shake);
}

/**
 * 乘风突袭波及爪痕特效
 */
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
            background: linear-gradient(to right, rgba(255,215,0,0.95), rgba(255,180,0,0.3));
            transform: rotate(${angle}deg);
            z-index:10010; pointer-events:none;
            border-radius: 1px;
            filter: drop-shadow(0 0 6px rgba(255,215,0,0.9)) drop-shadow(0 0 2px rgba(0,0,0,0.4));
            animation: clawSlash 0.5s ease-out forwards;
            animation-delay: ${i * 0.08}s;
        `;
        document.body.appendChild(claw);
        setTimeout(() => { if (claw.parentNode) claw.remove(); }, 600);
    }
}
export function showKuLianEffect(unit, team) {
    team.forEach(member => {
        if (!member.alive || member.isHorse) return;
        let grid = document.querySelector(`[data-uid="${member.uid}"]`);
        if (!grid) return;

        let muscle = document.createElement('div');
        muscle.setAttribute('data-fx', 'temporary');
        muscle.innerHTML = '💪';
        muscle.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:20px;z-index:10005;pointer-events:none;opacity:0;transition:opacity 0.3s, transform 0.3s;';
        grid.style.position = 'relative';
        grid.appendChild(muscle);

        requestAnimationFrame(() => {
            muscle.style.opacity = '1';
            muscle.style.transform = 'translate(-50%, -120%)';
        });

        const blinks = member.uid === unit.uid ? 3 : 2;
        let blinkCount = 0;
        const blinkInterval = setInterval(() => {
            grid.style.transition = 'box-shadow 0.3s';
            grid.style.boxShadow = grid.style.boxShadow === '0 0 12px rgba(255,215,0,0.7)' ? '' : '0 0 12px rgba(255,215,0,0.7)';
            blinkCount++;
            if (blinkCount >= blinks * 2) {
                clearInterval(blinkInterval);
                grid.style.boxShadow = '';
                grid.style.transition = '';
            }
        }, 400);

        setTimeout(() => { muscle.style.opacity = '0'; }, 1500);
        setTimeout(() => { if (muscle.parentNode) muscle.remove(); }, 2000);
    });
}

// ==================== 全屏横幅 ====================
function createBuffBannerEl() { let d = document.createElement('div'); d.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:2.5rem;font-weight:bold;color:#ffd700;z-index:10030;pointer-events:none;text-shadow:0 0 20px rgba(255,215,0,0.8);white-space:nowrap;animation:bannerPop 1.5s ease-out forwards;'; return d; }
initPool('buffBanner', createBuffBannerEl);

export async function showBuffBanner(text) {
    return new Promise(resolve => {
        let resolved = false;
        const finish = () => { if (!resolved) { resolved = true; resolve(); } };

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

        const ctxB = window._getPlayerContext ? window._getPlayerContext() : null;
        if (ctxB && ctxB._scheduler) {
            ctxB._scheduler.schedule('banner', 1500, finish);
            ctxB._scheduler.schedule('banner', 3000, finish); // 最终保险
        } else {
            setTimeout(finish, 1500);
            setTimeout(finish, 3000);
        }
    });
}

// 大型横幅，用于闪避反击等重要事件，不走对象池，独立创建
export function showCriticalBanner(text) {
    return new Promise(resolve => {
        const banner = document.createElement('div');
        banner.textContent = text;
        banner.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:3.5rem;font-weight:bold;color:#FFD700;z-index:10050;pointer-events:none;text-shadow:0 0 30px rgba(255,215,0,0.9), 0 0 10px black;white-space:nowrap;animation:bannerPop 2.5s ease-out forwards;';
        document.body.appendChild(banner);
        const ctx = window._getPlayerContext ? window._getPlayerContext() : null;
        if (ctx && ctx._scheduler) {
            ctx._scheduler.schedule('banner', 2500, () => {
                if (banner.parentNode) banner.remove();
                resolve();
            });
        } else {
            setTimeout(() => {
                if (banner.parentNode) banner.remove();
                resolve();
            }, 2500);
        }
    });
}

// ==================== 通用气泡 ====================
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
    setTimeout(() => {
        bubble.style.transition = 'opacity 0.3s'; bubble.style.opacity = '0';
        setTimeout(() => bubble.remove(), 300);
    }, 4000);
    return bubble;
}
// 新婚爱心特效（在格子中间显示淡粉红爱心）
export function showHeartEffect(unit) {
    let grid = document.querySelector(`[data-uid="${unit.uid}"]`);
    if (!grid) return;

    let heart = document.createElement('div');
    // 去掉了 newlywed-heart 类名，防止被其他 CSS 覆盖
    heart.setAttribute('data-fx', 'temporary');
    heart.innerHTML = '💖';
    // 提高了 z-index 到 9999，并给父级 grid 加了相对定位保证
    grid.style.position = 'relative'; 
    heart.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:24px;color:#FFB6C1;text-shadow:0 0 8px #FFB6C1;z-index:9999;opacity:0;transition:opacity 0.3s, transform 0.3s;pointer-events:none;';
    grid.appendChild(heart);
    
    requestAnimationFrame(() => { 
        heart.style.opacity = '1'; 
        heart.style.transform = 'translate(-50%, -120%)'; 
    });
    
    setTimeout(() => { heart.style.opacity = '0'; }, 1500);
    setTimeout(() => { if (heart.parentNode) heart.parentNode.removeChild(heart); }, 2000);
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
    let blinks = 0;
    let interval = setInterval(() => {
        flash.style.opacity = flash.style.opacity === '0' ? '1' : '0';
        blinks++;
        if (blinks >= 4) { clearInterval(interval); flash.style.opacity = '0'; setTimeout(() => { if (flash.parentNode) flash.parentNode.removeChild(flash); }, 300); }
    }, 150);
}
