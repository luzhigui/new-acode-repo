﻿﻿﻿﻿﻿﻿﻿﻿// fx/21fx-butterfly-spider.js - 光明顶5v5 蝶蛛双生特效
// V5.2.1 | 从实验室移植，蝴蝶飞走/飞回 + 蜘蛛升天/降下
export const VER = 'fx/21fx-butterfly-spider.js V5.2.1';

function wait(ms) { return new Promise(r => setTimeout(r, window._fastForwardActive ? 1 : ms)); }

function getCellElement(unit) {
    if (!unit || unit.pos == null) return null;
    const grid = document.getElementById(unit.camp === 'ally' ? 'allyGrid' : 'enemyGrid');
    if (!grid) return null;
    const order = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    const idx = order.indexOf(unit.pos);
    return idx >= 0 ? grid.children[idx] : null;
}

function getCellCenter(unit) {
    if (!unit?.pos) return null;
    const cell = getCellElement(unit);
    if (!cell) return null;
    const rect = cell.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height };
}

/**
 * 🦋 蝴蝶飞出 — 姐姐附身到宿主
 */
export async function showButterflyFlyOut(fromUnit, toUnit) {
    const fromCell = getCellElement(fromUnit);
    const toCell = getCellElement(toUnit);
    if (!fromCell || !toCell) return;
    const fromCenter = getCellCenter(fromUnit);
    const toCenter = getCellCenter(toUnit);
    if (!fromCenter || !toCenter) return;

    fromCell.style.transition = 'transform 0.3s ease, opacity 0.3s';
    fromCell.style.transform = 'scale(0.8)';
    fromCell.style.opacity = '0.4';

    const butterfly = document.createElement('div');
    butterfly.setAttribute('data-fx', 'temporary');
    butterfly.style.cssText = 'position:fixed;z-index:10010;pointer-events:none;font-size:32px;filter:drop-shadow(0 0 8px rgba(255,105,180,0.8));';
    butterfly.textContent = '🦋';
    butterfly.style.left = fromCenter.x + 'px';
    butterfly.style.top = fromCenter.y + 'px';
    butterfly.style.transform = 'translate(-50%, -50%)';
    document.body.appendChild(butterfly);

    const startX = fromCenter.x, startY = fromCenter.y;
    const endX = toCenter.x, endY = toCenter.y;
    const dx = endX - startX, dy = endY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const duration = 600;
    const startTime = performance.now();

    await new Promise(res => {
        function step(ts) {
            const elapsed = ts - startTime;
            const t = Math.min(1, elapsed / duration);
            const perpX = -dy / dist, perpY = dx / dist;
            const waveAmplitude = 12 * Math.sin(t * Math.PI * 4);
            const curX = startX + dx * t + perpX * waveAmplitude;
            const curY = startY + dy * t + perpY * waveAmplitude;
            butterfly.style.left = curX + 'px';
            butterfly.style.top = curY + 'px';
            const scale = 1 + 0.15 * Math.sin(elapsed * 0.03);
            butterfly.style.transform = `translate(-50%, -50%) scale(${scale})`;
            if (t < 1) requestAnimationFrame(step);
            else res();
        }
        requestAnimationFrame(step);
    });

    butterfly.style.transition = 'transform 0.2s ease, opacity 0.2s';
    butterfly.style.transform = 'translate(-50%, -50%) scale(0.8)';
    butterfly.style.opacity = '0.6';
    toCell.classList.add('pink-flash');
    await wait(300);
    butterfly.remove();
    toCell.classList.remove('pink-flash');

    fromCell.style.transform = 'scale(1)';
    fromCell.style.opacity = '1';
}

/**
 * 🦋 蝴蝶飞回 — 回合结束姐姐从宿主飞回原位
 */
export async function showButterflyFlyBack(hostUnit, toUnit) {
    const hostCell = getCellElement(hostUnit);
    const toCell = getCellElement(toUnit);
    if (!hostCell || !toCell) return;
    const hostCenter = getCellCenter(hostUnit);
    const toCenter = getCellCenter(toUnit);
    if (!hostCenter || !toCenter) return;

    hostCell.classList.add('pink-flash');
    setTimeout(() => hostCell.classList.remove('pink-flash'), 600);

    const butterfly = document.createElement('div');
    butterfly.setAttribute('data-fx', 'temporary');
    butterfly.style.cssText = 'position:fixed;z-index:10010;pointer-events:none;font-size:32px;filter:drop-shadow(0 0 8px rgba(255,105,180,0.8));';
    butterfly.textContent = '🦋';
    butterfly.style.left = hostCenter.x + 'px';
    butterfly.style.top = hostCenter.y + 'px';
    butterfly.style.transform = 'translate(-50%, -50%)';
    document.body.appendChild(butterfly);

    const startX = hostCenter.x, startY = hostCenter.y;
    const endX = toCenter.x, endY = toCenter.y;
    const dx = endX - startX, dy = endY - startY;
    const duration = 700;
    const startTime = performance.now();

    await new Promise(res => {
        function step(ts) {
            const elapsed = ts - startTime;
            const t = Math.min(1, elapsed / duration);
            const curX = startX + dx * t;
            const curY = startY + dy * t - 8 * Math.sin(t * Math.PI * 3);
            butterfly.style.left = curX + 'px';
            butterfly.style.top = curY + 'px';
            const scale = 1 + 0.1 * Math.sin(elapsed * 0.04);
            butterfly.style.transform = `translate(-50%, -50%) scale(${scale})`;
            if (t < 1) requestAnimationFrame(step);
            else res();
        }
        requestAnimationFrame(step);
    });

    butterfly.style.transition = 'opacity 0.2s';
    butterfly.style.opacity = '0';
    await wait(200);
    butterfly.remove();
}

/**
 * 🕷️ 蜘蛛升天 — 妹妹飞天
 */
export async function showSpiderAscend(fromUnit) {
    const fromCell = getCellElement(fromUnit);
    if (!fromCell) return;
    const fromCenter = getCellCenter(fromUnit);
    if (!fromCenter) return;

    fromCell.classList.add('purple-flash');
    setTimeout(() => fromCell.classList.remove('purple-flash'), 600);

    fromCell.style.opacity = '0';
    fromCell.style.transform = 'scale(0.8)';

    const ghost = fromCell.cloneNode(true);
    ghost.setAttribute('data-fx', 'temporary');
    ghost.style.cssText = `
        position: fixed; left: ${fromCenter.x - fromCenter.width/2}px; top: ${fromCenter.y - fromCenter.height/2}px;
        width: ${fromCenter.width}px; height: ${fromCenter.height}px;
        z-index: 10008; pointer-events: none;
        display: flex; align-items: center; gap: 4px;
        background: #e8e6e0; border: 2px solid #9b59b6; border-radius: 5px;
        opacity: 1; transform: scale(1);
    `;
    ghost.innerHTML = fromCell.innerHTML;
    document.body.appendChild(ghost);

    const spider = document.createElement('div');
    spider.setAttribute('data-fx', 'temporary');
    spider.style.cssText = 'position:fixed;z-index:10010;pointer-events:none;font-size:32px;filter:drop-shadow(0 0 8px rgba(155,89,182,0.8));';
    spider.textContent = '🕷️';
    spider.style.left = fromCenter.x + 'px';
    spider.style.top = fromCenter.y + 'px';
    spider.style.transform = 'translate(-50%, -50%)';
    document.body.appendChild(spider);

    const silks = [];
    for (let i = 0; i < 2; i++) {
        const silk = document.createElement('div');
        silk.setAttribute('data-fx', 'temporary');
        silk.style.cssText = 'position:fixed;z-index:10009;pointer-events:none;background:rgba(255,255,255,0.5);width:1.5px;';
        silk.style.left = (fromCenter.x - 1 + i * 2) + 'px';
        silk.style.top = (fromCenter.y - 150) + 'px';
        silk.style.height = '150px';
        document.body.appendChild(silk);
        silks.push(silk);
    }

    const startX = fromCenter.x;
    const startY = fromCenter.y;
    const duration = 800;
    const startTime = performance.now();

    await new Promise(res => {
        function step(ts) {
            const elapsed = ts - startTime;
            const t = Math.min(1, elapsed / duration);
            const curX = startX + 1 * t;
            const curY = startY - 20 * t;
            const scale = 1 - t * 0.9;
            const opacity = 1 - t * 0.8;
            spider.style.left = curX + 'px';
            spider.style.top = curY + 'px';
            spider.style.transform = `translate(-50%, -50%) scale(${scale})`;
            spider.style.opacity = opacity;
            ghost.style.transform = `scale(${scale})`;
            ghost.style.opacity = opacity * 0.8;
            silks.forEach(silk => {
                silk.style.left = (curX - 1) + 'px';
                silk.style.top = (curY - 150) + 'px';
                silk.style.height = '150px';
            });
            if (t < 1) requestAnimationFrame(step);
            else res();
        }
        requestAnimationFrame(step);
    });

    spider.remove();
    ghost.remove();
    silks.forEach(s => s.remove());
    fromCell.style.opacity = '1';
    fromCell.style.transform = 'scale(1)';
}

/**
 * 🕷️ 蜘蛛降下 — 回合结束妹妹落下
 */
export async function showSpiderDescend(toUnit) {
    const toCell = getCellElement(toUnit);
    if (!toCell) return;
    const toCenter = getCellCenter(toUnit);
    if (!toCenter) return;

    const startX = toCenter.x + 20;
    const startY = toCenter.y - 100;
    const spider = document.createElement('div');
    spider.setAttribute('data-fx', 'temporary');
    spider.style.cssText = 'position:fixed;z-index:10010;pointer-events:none;font-size:32px;filter:drop-shadow(0 0 8px rgba(155,89,182,0.8));';
    spider.textContent = '🕷️';
    spider.style.left = startX + 'px';
    spider.style.top = startY + 'px';
    spider.style.transform = 'translate(-50%, -50%) scale(0.25)';
    spider.style.opacity = '0.6';
    document.body.appendChild(spider);

    const silk = document.createElement('div');
    silk.setAttribute('data-fx', 'temporary');
    silk.style.cssText = 'position:fixed;z-index:10009;pointer-events:none;background:rgba(255,255,255,0.5);width:1.5px;';
    silk.style.left = startX + 'px';
    silk.style.top = startY + 'px';
    silk.style.height = '0px';
    document.body.appendChild(silk);

    const endY = toCenter.y;
    const duration = 600;
    const startTime = performance.now();

    await new Promise(res => {
        function step(ts) {
            const elapsed = ts - startTime;
            const t = Math.min(1, elapsed / duration);
            const curX = startX + (toCenter.x - startX) * t;
            const curY = startY + (endY - startY) * t;
            const scale = 0.25 + t * 0.75;
            spider.style.left = curX + 'px';
            spider.style.top = curY + 'px';
            spider.style.transform = `translate(-50%, -50%) scale(${scale})`;
            silk.style.left = curX + 'px';
            silk.style.top = startY + 'px';
            silk.style.height = (curY - startY) + 'px';
            if (t < 1) requestAnimationFrame(step);
            else res();
        }
        requestAnimationFrame(step);
    });

    spider.remove();
    silk.remove();
    toCell.classList.add('purple-flash');
    setTimeout(() => toCell.classList.remove('purple-flash'), 600);
}

/**
 * 🕷️ 蜘蛛爆炸 — 妹妹落地后发射蜘蛛到目标头上爆炸
 */
export async function showSpiderStrike(fromUnit, toUnit) {
    const fromCell = getCellElement(fromUnit);
    const toCell = getCellElement(toUnit);
    if (!fromCell || !toCell) return;
    const fromCenter = getCellCenter(fromUnit);
    const toCenter = getCellCenter(toUnit);
    if (!fromCenter || !toCenter) return;

    const spider = document.createElement('div');
    spider.setAttribute('data-fx', 'temporary');
    spider.style.cssText = 'position:fixed;z-index:10020;pointer-events:none;font-size:28px;filter:drop-shadow(0 0 6px rgba(200,50,50,0.9));transition:none;';
    spider.textContent = '🕷️';
    spider.style.left = fromCenter.x + 'px';
    spider.style.top = fromCenter.y + 'px';
    spider.style.transform = 'translate(-50%, -50%)';
    document.body.appendChild(spider);

    const startX = fromCenter.x, startY = fromCenter.y;
    const endX = toCenter.x, endY = toCenter.y;
    const duration = 700;
    const startTime = performance.now();

    await new Promise(res => {
        function step(ts) {
            const elapsed = ts - startTime;
            const t = Math.min(1, elapsed / duration);
            const curX = startX + (endX - startX) * t;
            const curY = startY + (endY - startY) * t - 30 * Math.sin(t * Math.PI);
            spider.style.left = curX + 'px';
            spider.style.top = curY + 'px';
            spider.style.transform = `translate(-50%, -50%) scale(${1 + t * 0.3})`;
            if (t < 1) requestAnimationFrame(step);
            else res();
        }
        requestAnimationFrame(step);
    });

    // 爆炸：放大变红碎开
    spider.style.transition = 'transform 0.3s ease-out, opacity 0.3s';
    spider.style.transform = 'translate(-50%, -50%) scale(2.5)';
    spider.style.filter = 'drop-shadow(0 0 15px rgba(255,0,0,1)) brightness(0.4) sepia(1) saturate(3) hue-rotate(-20deg)';
    spider.style.opacity = '0';
    toCell.classList.add('red-flash');
    setTimeout(() => toCell.classList.remove('red-flash'), 500);

    // 碎片粒子
    const cx = endX, cy = endY;
    const shards = [];
    for (let i = 0; i < 10; i++) {
        const shard = document.createElement('div');
        const angle = (i / 10) * Math.PI * 2;
        const dist = 25 + Math.random() * 35;
        shard.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:6px;height:6px;background:#ff2020;z-index:10021;pointer-events:none;border-radius:1px;box-shadow:0 0 6px rgba(255,0,0,0.8);transition:transform 0.6s ease-out, opacity 0.6s;`;
        document.body.appendChild(shard);
        requestAnimationFrame(() => {
            shard.style.transform = `translate(${Math.cos(angle)*dist}px, ${Math.sin(angle)*dist}px) scale(0.2)`;
            shard.style.opacity = '0';
        });
        shards.push(shard);
    }

    await wait(600);
    spider.remove();
    shards.forEach(s => { if (s.parentNode) s.remove(); });
}