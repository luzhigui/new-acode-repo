// fx/15fx-common-5v5-test.js - 光明顶5v5 基础特效池
// V4.0.0 | ~380 lines | 2026-06-29 09:29
export const VER = 'fx/15fx-common-5v5-test.js V4.0.0';

const POOL = {}; const POOL_SIZES = { danmaku: 8, dmgFloat: 6, dodge: 4, healFloat: 4, buffBanner: 2 };
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
export function showHealFloat(unit, heal) { let gridId = unit.camp === 'ally' ? 'allyGrid' : 'enemyGrid', grid = document.getElementById(gridId), cells = grid.children; let displayOrder = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9], idx = displayOrder.indexOf(unit.pos); if (idx >= 0 && cells[idx]) { let rect = cells[idx].getBoundingClientRect(); acquireFromPool('healFloat', (healEl) => { healEl.textContent = '+' + heal; healEl.style.left = (rect.left + rect.width * 0.3) + 'px'; healEl.style.top = (rect.top - 4) + 'px'; }, 1400); } }

function _executeBrush(div) { if (!div) return; let oldOverlay = div.querySelector('.brush-overlay'); if (oldOverlay) oldOverlay.remove(); div.style.width = 'auto'; div.offsetHeight; div.style.width = '100%'; div.style.minWidth = '100%'; let logEl = document.getElementById('log'), paddingLeft = 6; if (logEl) { let cs = getComputedStyle(logEl), pl = parseFloat(cs.paddingLeft); if (!isNaN(pl) && pl > 0) paddingLeft = pl; } let overlay = document.createElement('div'); overlay.className = 'brush-overlay'; overlay.style.position = 'absolute'; overlay.style.left = (-paddingLeft) + 'px'; overlay.style.top = '0'; overlay.style.width = 'calc(100% + ' + (paddingLeft*2) + 'px)'; overlay.style.height = '100%'; overlay.style.pointerEvents = 'none'; div.style.position = 'relative'; div.appendChild(overlay); let start = null; function animate(ts) { if (!start) start = ts; let progress = (ts - start) / 600; if (progress >= 1) { overlay.style.width = 'calc(100% + ' + (paddingLeft*2) + 'px)'; overlay.style.opacity = '0.6'; } else { overlay.style.width = (progress * 100) + '%'; requestAnimationFrame(animate); } } requestAnimationFrame(animate); }
export function applyBrushEffect(div) { _executeBrush(div); }
export function applyBrushEffectOnHeal(div, nextDiv) { _executeBrush(div); if (nextDiv) _executeBrush(nextDiv); }

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

        setTimeout(finish, 1500);
        setTimeout(finish, 3000); // 最终保险
    });
}

// 大型横幅，用于闪避反击等重要事件，不走对象池，独立创建
export function showCriticalBanner(text) {
    return new Promise(resolve => {
        const banner = document.createElement('div');
        banner.textContent = text;
        banner.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:3.5rem;font-weight:bold;color:#FFD700;z-index:10050;pointer-events:none;text-shadow:0 0 30px rgba(255,215,0,0.9), 0 0 10px black;white-space:nowrap;animation:bannerPop 2.5s ease-out forwards;';
        document.body.appendChild(banner);
        setTimeout(() => {
            if (banner.parentNode) banner.remove();
            resolve();
        }, 2500);
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
    document.body.appendChild(bubble);
    setTimeout(() => {
        bubble.style.transition = 'opacity 0.3s'; bubble.style.opacity = '0';
        setTimeout(() => bubble.remove(), 300);
    }, 4000);
    return bubble;
}