// fx/20fx-dodge-bullet.js - 光明顶5v5 闪避反击特效
// V4.0.0 | ~25000 bytes | 2026-06-29 09:29
export const VER = 'fx/20fx-dodge-bullet.js V4.0.0';

import { showComicBubble } from './15fx-common-5v5-test.js';

// ==================== 辅助函数 ====================
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function getCellElement(unit) {
    if (!unit || unit.pos == null) return null;
    const grid = document.getElementById(unit.camp === 'ally' ? 'allyGrid' : 'enemyGrid');
    if (!grid) return null;
    const order = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    const idx = order.indexOf(unit.pos);
    return idx >= 0 ? grid.children[idx] : null;
}

function createZigzagLightning() {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg"); svg.setAttribute("class", "lightning-split");
    svg.style.position = 'fixed'; svg.style.left = '0'; svg.style.top = '0';
    svg.style.width = '100%'; svg.style.height = '100%'; svg.style.pointerEvents = 'none';
    svg.style.zIndex = '9995';
    const w = innerWidth, h = innerHeight;
    const d = `M${w*0.95},${h*0.15} L${w*0.65},${h*0.25} L${w*0.8},${h*0.35} L${w*0.5},${h*0.45} L${w*0.65},${h*0.55} L${w*0.25},${h*0.65} L${w*0.05},${h*0.95}`;
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", d); path.setAttribute("stroke", "#FFD700");
    path.setAttribute("stroke-width", "4"); path.setAttribute("fill", "none");
    svg.appendChild(path); document.body.appendChild(svg);
    return svg;
}

function createFlameBehind(angle, offsetX, offsetY, parentLeft, parentTop) {
    const container = document.createElement('div'); container.className = 'flame-trail';
    container.style.position = 'fixed'; container.style.zIndex = '9997'; container.style.pointerEvents = 'none';
    container.style.transform = `rotate(${angle}rad)`;
    container.style.left = (parentLeft + offsetX) + 'px';
    container.style.top = (parentTop + offsetY) + 'px';
    const colors = ['#ff4500','#ff6600','#ff8800','#ffaa00','#ffcc00','#ffff00'];
    for (let i = 0; i < 10; i++) {
        const f = document.createElement('div'); f.className = 'flame-layer';
        f.style.position = 'absolute'; f.style.borderRadius = '50% 0 0 50%'; f.style.opacity = '0.8';
        f.style.width = (80 - i * 6) + 'px'; f.style.height = (16 - i) + 'px';
        f.style.left = (-80 + i * 5) + 'px'; f.style.top = (-8 + i * 0.5) + 'px';
        f.style.background = colors[i % 6];
        f.style.animation = 'flameFlicker 0.2s infinite alternate';
        container.appendChild(f);
    }
    document.body.appendChild(container);
    return container;
}

function updateFlamePosition(flame, parentLeft, parentTop, offsetX, offsetY) {
    flame.style.left = (parentLeft + offsetX) + 'px';
    flame.style.top = (parentTop + offsetY) + 'px';
}

function createWindSplit(x, y) {
    const lines = [];
    for (let i = 0; i < 12; i++) {
        const line = document.createElement('div'); line.className = 'wind-split';
        const offY = (i < 6) ? (-30 - i*5) : (10 + (i-6)*5);
        line.style.left = (x - 60) + 'px'; line.style.top = (y + offY) + 'px';
        line.style.position = 'fixed'; line.style.zIndex = '9998'; line.style.pointerEvents = 'none';
        line.style.width = '80px'; line.style.height = '2px';
        line.style.background = 'linear-gradient(to right, white, transparent)';
        line.style.opacity = '0.6';
        line.style.animation = 'windMove 0.6s linear infinite';
        document.body.appendChild(line); lines.push(line);
    }
    return lines;
}

function updateWindSplit(lines, cx, cy) {
    lines.forEach((l, i) => {
        const offY = (i < 6) ? (-30 - i*5) : (10 + (i-6)*5);
        l.style.left = (cx - 60) + 'px'; l.style.top = (cy + offY) + 'px';
    });
}

function createBgParticles(x, y) {
    const particles = [];
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div'); p.className = 'bg-particle';
        p.style.position = 'fixed'; p.style.width = '3px'; p.style.height = '3px';
        p.style.background = 'white'; p.style.borderRadius = '50%';
        p.style.opacity = '0.5'; p.style.zIndex = '9996'; p.style.pointerEvents = 'none';
        p.style.left = (x + (Math.random()-0.5)*200) + 'px';
        p.style.top = (y + (Math.random()-0.5)*100) + 'px';
        p.style.animation = 'particleMove 1s linear infinite';
        document.body.appendChild(p); particles.push(p);
    }
    return particles;
}

function createCounterStorm(x, y) {
    const container = document.createElement('div'); container.className = 'counter-storm';
    container.style.position = 'fixed'; container.style.zIndex = '9997'; container.style.pointerEvents = 'none';
    container.style.left = (x - 45) + 'px'; container.style.top = (y - 45) + 'px';
    for (let i = 0; i < 4; i++) {
        const ring = document.createElement('div'); ring.className = 'storm-ring';
        ring.style.position = 'absolute'; ring.style.width = '90px'; ring.style.height = '15px';
        ring.style.border = '2px solid rgba(255,255,255,0.9)'; ring.style.borderRadius = '50%';
        ring.style.transform = 'rotateX(75deg)';
        ring.style.animation = 'stormSpin 0.6s linear infinite';
        if (i > 0) ring.style.animationDelay = `-${i * 0.15}s`;
        container.appendChild(ring);
    }
    document.body.appendChild(container);
    return container;
}

function triggerShake() {
    document.body.classList.add('shake-screen');
    setTimeout(() => document.body.classList.remove('shake-screen'), 200);
}

// ==================== 子弹时间特效 ====================
export async function showDodgeBulletTime(attacker, defender, reboundDmg) {
    const TIMEOUT_MS = 18000;
    let isSkipped = false;
    let cleanupElements = [];
    const ctx = window._getPlayerContext ? window._getPlayerContext() : null;
    if (ctx) ctx.isPaused = true;
    let resolved = false;

    const timeoutId = setTimeout(() => {
        if (!resolved) { console.warn('[子弹时间] 超时，强制结束'); isSkipped = true; cleanup(); resolved = true; }
    }, TIMEOUT_MS);

    function cleanup() { cleanupElements.forEach(el => { if (el && el.parentNode) el.remove(); }); clearTimeout(timeoutId); }

    try {
        const aCell = getCellElement(attacker), dCell = getCellElement(defender);
        if (!aCell || !dCell) { cleanup(); return; }

        const pos = { ax: innerWidth * 0.09, ay: innerHeight * 0.16, dx: innerWidth * 0.64, dy: innerHeight * 0.68 };

        // 跳过按钮（固定在右下角，避免被特效遮挡）
        const skipBtn = document.createElement('div');
        skipBtn.className = 'skip-btn';
        skipBtn.textContent = '跳过';
        skipBtn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:10050;'
            + 'background:rgba(0,0,0,0.7);color:#ffd700;padding:8px 18px;'
            + 'border:2px solid #ffd700;border-radius:20px;font-weight:bold;'
            + 'font-size:14px;cursor:pointer;';
        skipBtn.addEventListener('click', () => { isSkipped = true; });
        document.body.appendChild(skipBtn);
        cleanupElements.push(skipBtn);

        // 黑幕
        const mask = document.createElement('div'); mask.className = 'bullet-mask';
        mask.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;'
            + 'background:rgba(0,0,0,0.92);z-index:9999;pointer-events:none;';
        document.body.appendChild(mask); cleanupElements.push(mask);
        const lightning = createZigzagLightning(); cleanupElements.push(lightning);
        await wait(300);
        if (isSkipped) { cleanup(); return; }
        // 直接使用深色背景，无需动画过渡
        await wait(200);
        if (isSkipped) { cleanup(); return; }

        // ===== 修正：格子克隆使用 cloneNode + bullet-clone 类 =====
        const cloneD = dCell.cloneNode(true); cloneD.classList.add('bullet-clone');
        const dRect = dCell.getBoundingClientRect();
        cloneD.style.position = 'fixed'; cloneD.style.width = dRect.width+'px'; cloneD.style.height = dRect.height+'px';
        cloneD.style.left = innerWidth + 'px'; cloneD.style.top = pos.dy - dRect.height/2 + 'px';
        cloneD.style.transform = 'scale(0.8)';
        cloneD.style.filter = 'drop-shadow(0 0 12px gold) drop-shadow(0 0 24px rgba(255,215,0,0.6))';
        cloneD.style.zIndex = '10001'; document.body.appendChild(cloneD); cleanupElements.push(cloneD);

        const defCenterX = pos.dx + dRect.width/2, defCenterY = pos.dy + dRect.height/2;
        const defInitialLeft = pos.dx;
        const defInitialTop = pos.dy - dRect.height/2;

        const cloneA = aCell.cloneNode(true); cloneA.classList.add('bullet-clone');
        const aRect = aCell.getBoundingClientRect();
        cloneA.style.position = 'fixed'; cloneA.style.margin = '0';
        cloneA.style.width = aRect.width+'px'; cloneA.style.height = aRect.height+'px';
        const startAX = pos.ax - innerWidth*0.06, startAY = pos.ay - innerHeight*0.06;
        cloneA.style.left = startAX + 'px'; cloneA.style.top = startAY + 'px';
        cloneA.style.zIndex = '10010'; cloneA.style.transform = 'scale(0.6)';
        document.body.appendChild(cloneA); cleanupElements.push(cloneA);

        // ===== 修正：“看招”气泡下移避免遮挡攻击者 =====
        const kanzhao = showComicBubble('看招！', startAX + 40, startAY + 10, '', 2500);
        cleanupElements.push(kanzhao);

        // 攻击者进场
        await new Promise(res => {
            const t0 = performance.now();
            function step(now) { if (isSkipped) { res(); return; }
                const t = Math.min(1, (now - t0) / 500);
                cloneA.style.left = (startAX + (pos.ax - startAX) * t) + 'px';
                cloneA.style.top = (startAY + (pos.ay - startAY) * t) + 'px';
                cloneA.style.transform = `scale(${0.6 + 0.5 * t})`;
                if (t < 1) requestAnimationFrame(step); else res(); }
            requestAnimationFrame(step);
        });
        if (isSkipped) { cleanup(); return; }

        await wait(100);
        if (isSkipped) { cleanup(); return; }

        // ===== 修正：“开打开打”气泡上移避免遮挡风暴 =====
        const bubbleY = defCenterY - dRect.height/2 - 80;
        const openBubble = showComicBubble('开打开打！', defCenterX, bubbleY, 'bubble-arrow-up', 3000);
        cleanupElements.push(openBubble);

        // 防御者进场
        await new Promise(res => {
            const t0 = performance.now();
            function step(now) { if (isSkipped) { res(); return; }
                const t = Math.min(1, (now - t0) / 500);
                cloneD.style.left = (innerWidth + (pos.dx - innerWidth) * t) + 'px';
                cloneD.style.transform = `scale(${0.8 + 0.4 * t})`;
                if (t < 1) requestAnimationFrame(step); else res(); }
            requestAnimationFrame(step);
        });
        if (isSkipped) { cleanup(); return; }

        await wait(600);
        if (isSkipped) { cleanup(); return; }

        // 屏息凝视阶段
        const glow = document.createElement('div'); glow.className = 'breath-glow'; cloneA.appendChild(glow);
        const storm = createCounterStorm(defCenterX, defCenterY); cleanupElements.push(storm);
        await wait(3000);
        if (isSkipped) { cleanup(); return; }

        glow.remove(); lightning.remove(); storm.remove();

        // 飞行阶段：火焰 + 气流 + 粒子
        const attackAngle = Math.atan2(pos.dy - pos.ay, pos.dx - pos.ax);
        const flameOffsetX = 10, flameOffsetY = 8;
        const flame = createFlameBehind(attackAngle, flameOffsetX, flameOffsetY, parseFloat(cloneA.style.left), parseFloat(cloneA.style.top));
        cleanupElements.push(flame);

        const windLines = createWindSplit(pos.ax, pos.ay); windLines.forEach(l => cleanupElements.push(l));
        const particles = createBgParticles(pos.ax, pos.ay); particles.forEach(p => cleanupElements.push(p));
        const shield = document.createElement('div'); shield.className = 'wind-shield';
        cloneA.appendChild(shield); cleanupElements.push(shield);

        // ===== 修正：火焰跟随使用动态坐标读取 =====
        const updateFlame = () => updateFlamePosition(flame, parseFloat(cloneA.style.left), parseFloat(cloneA.style.top), flameOffsetX, flameOffsetY);

        let shakeCount = 0;
        const shakeTimer = setInterval(() => {
            const offX = (Math.random()-0.5)*4, offY = (Math.random()-0.5)*4;
            cloneA.style.transform = `scale(${0.9 + shakeCount/150}) translate(${offX}px, ${offY}px)`;
            if (++shakeCount > 45) clearInterval(shakeTimer);
        }, 20);

        // 快速冲刺
        const startX = parseFloat(cloneA.style.left), startY = parseFloat(cloneA.style.top);
        const dx = pos.dx - pos.ax, dy = pos.dy - pos.ay;
        const midX = startX + dx * 0.65, midY = startY + dy * 0.65;
        await new Promise(res => {
            const dur = 1500, t0 = performance.now();
            function step(now) { if (isSkipped) { res(); return; }
                const t = Math.min(1, (now - t0) / dur);
                const cx = startX + (midX - startX) * t, cy = startY + (midY - startY) * t;
                cloneA.style.left = cx+'px'; cloneA.style.top = cy+'px';
                updateFlame();
                const ccx = cx + cloneA.offsetWidth/2, ccy = cy + cloneA.offsetHeight/2;
                updateWindSplit(windLines, ccx, ccy);
                if (t<1) requestAnimationFrame(step); else res(); }
            requestAnimationFrame(step);
        });
        if (isSkipped) { cleanup(); return; }

        // 慢速接近
        const slowX = midX + dx * 0.06, slowY = midY + dy * 0.06;
        clearInterval(shakeTimer); cloneA.style.transform = 'scale(1.1)';
        await new Promise(res => {
            const dur = 600, t0 = performance.now();
            function step(now) { if (isSkipped) { res(); return; }
                const t = Math.min(1, (now - t0) / dur);
                const cx = midX + (slowX - midX) * t, cy = midY + (slowY - midY) * t;
                cloneA.style.left = cx+'px'; cloneA.style.top = cy+'px';
                updateFlame();
                const ccx = cx + cloneA.offsetWidth/2, ccy = cy + cloneA.offsetHeight/2;
                updateWindSplit(windLines, ccx, ccy);
                if (t<1) requestAnimationFrame(step); else res(); }
            requestAnimationFrame(step);
        });
        if (isSkipped) { cleanup(); return; }

        flame.remove(); windLines.forEach(l=>l.remove()); particles.forEach(p=>p.remove()); shield.remove();

        // 防御者前顶
        cloneD.style.transition = 'transform 0.15s ease-out';
        cloneD.style.transform = 'scale(1.15) translate(10px, 10px)';
        await wait(150);
        if (isSkipped) { cleanup(); return; }
        cloneD.style.transition = 'transform 0.2s ease-in';
        cloneD.style.transform = 'scale(1.25) translate(-40px, -40px)';
        await wait(220);
        if (isSkipped) { cleanup(); return; }

        // 碰撞
        const colX = (parseFloat(cloneA.style.left) + parseFloat(cloneD.style.left)) / 2;
        const colY = (parseFloat(cloneA.style.top) + parseFloat(cloneD.style.top)) / 2;
        const shockwave = document.createElement('div'); shockwave.className = 'shockwave';
        shockwave.style.left = (colX - 40)+'px'; shockwave.style.top = (colY - 40)+'px';
        document.body.appendChild(shockwave); cleanupElements.push(shockwave);
        const dmg = document.createElement('div');
        dmg.textContent = '反击! ' + reboundDmg; dmg.style.position = 'fixed';
        dmg.style.left = colX + 'px'; dmg.style.top = colY + 'px';
        dmg.style.fontSize = '28px'; dmg.style.fontWeight = 'bold'; dmg.style.color = '#2ecc71';
        dmg.style.zIndex = '10025'; dmg.style.animation = 'dmgBounce 0.8s ease-out forwards';
        document.body.appendChild(dmg); cleanupElements.push(dmg);
        setTimeout(() => dmg.remove(), 800);
        triggerShake();

        // 攻击者震退
        const retX = parseFloat(cloneA.style.left), retY = parseFloat(cloneA.style.top);
        const retreatTotal = 300 + 800 + 800;
        const retreatStart = performance.now();
        const retreatSlow = 300, retreatSlowRatio = 0.06;
        const retreatAccel = 800, retreatAccelRatio = 0.2;
        const retreatFast = 800;

        await new Promise(res => {
            function step(now) { if (isSkipped) { res(); return; }
                const elapsed = now - retreatStart;
                if (elapsed >= retreatTotal) {
                    cloneA.style.left = (pos.ax + 30) + 'px';
                    cloneA.style.top = (pos.ay + 20) + 'px';
                    cloneA.style.transform = 'scale(0.5) rotate(180deg)';
                    res();
                    return;
                }
                let curX, curY, curTrans;
                if (elapsed < retreatSlow) {
                    const t = elapsed / retreatSlow;
                    curX = retX - dx * retreatSlowRatio * t;
                    curY = retY - dy * retreatSlowRatio * t;
                    curTrans = 'scale(1.0) rotate(-2deg)';
                } else if (elapsed < retreatSlow + retreatAccel) {
                    const t = (elapsed - retreatSlow) / retreatAccel;
                    const e = 1 - Math.pow(1 - t, 2);
                    curX = retX - dx * (retreatSlowRatio + retreatAccelRatio * e);
                    curY = retY - dy * (retreatSlowRatio + retreatAccelRatio * e);
                    curTrans = `scale(${1.0 - t*0.3}) rotate(${-2 - t*8}deg)`;
                } else {
                    const t = (elapsed - retreatSlow - retreatAccel) / retreatFast;
                    const baseX = retX - dx * (retreatSlowRatio + retreatAccelRatio);
                    const baseY = retY - dy * (retreatSlowRatio + retreatAccelRatio);
                    curX = baseX + (pos.ax + 30 - baseX) * t;
                    curY = baseY + (pos.ay + 20 - baseY) * t;
                    curTrans = `scale(${0.7 - t*0.2}) rotate(${t*180}deg)`;
                }
                cloneA.style.left = curX + 'px';
                cloneA.style.top = curY + 'px';
                cloneA.style.transform = curTrans;
                requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
        });
        if (isSkipped) { cleanup(); return; }

        cloneA.style.animation = 'remnantRotate 1.5s linear infinite';

        // ===== 新增：防御者返回动画 =====
        const returnDuration = 600;
        const returnStart = performance.now();
        const currentDLeft = parseFloat(cloneD.style.left);
        const currentDTop = parseFloat(cloneD.style.top);
        await new Promise(res => {
            function step(now) { if (isSkipped) { res(); return; }
                const t = Math.min(1, (now - returnStart) / returnDuration);
                const curLeft = currentDLeft + (defInitialLeft - currentDLeft) * t;
                const curTop = currentDTop + (defInitialTop - currentDTop) * t;
                cloneD.style.left = curLeft + 'px';
                cloneD.style.top = curTop + 'px';
                cloneD.style.transform = `scale(${0.9 + 0.1 * t})`;
                if (t < 1) requestAnimationFrame(step); else res(); }
            requestAnimationFrame(step);
        });
        if (isSkipped) { cleanup(); return; }

        // “哼，一个能打的都没有”
        const defBubbleY = defInitialTop + dRect.height + 20;
        const grinBubble = showComicBubble('哼，一个能打的都没有', defCenterX, defBubbleY, 'bubble-arrow-up', 4000);
        cleanupElements.push(grinBubble);

        // 攻击者飞走
        const flyAwayStartX = parseFloat(cloneA.style.left), flyAwayStartY = parseFloat(cloneA.style.top);
        const maxDistX = innerWidth * 0.10, maxDistY = innerHeight * 0.10;
        await new Promise(res => {
            const t0 = performance.now();
            function step(now) { if (isSkipped) { res(); return; }
                const t = Math.min(1, (now - t0) / 2000);
                const ease = t * t;
                cloneA.style.left = (flyAwayStartX - maxDistX * ease) + 'px';
                cloneA.style.top = (flyAwayStartY - maxDistY * ease) + 'px';
                const scale = Math.max(0.12, 0.5 * (1 - t * 0.76));
                cloneA.style.transform = `scale(${scale}) rotate(${t * 17 * 360}deg)`;
                cloneA.style.opacity = 1 - t * (1 - 0.4);
                if (t < 1) requestAnimationFrame(step); else res(); }
            requestAnimationFrame(step);
        });
        if (isSkipped) { cleanup(); return; }

        // “我一定会回来的”
        const attBubbleX = pos.ax + 60;
        const attBubbleY = pos.ay + 40;
        const returnBubble = showComicBubble('啊，我一定会回来的！', attBubbleX, attBubbleY, 'bubble-arrow-down', 5000);
        cleanupElements.push(returnBubble);

        await wait(3000);
        if (isSkipped) { cleanup(); return; }

        mask.classList.remove('active-full');
        cloneA.style.opacity = '0'; cloneD.style.opacity = '0';
        shockwave.style.opacity = '0';
        await wait(200);
        cleanup();
    } catch (e) {
        cleanup();
    } finally {
        window.bulletTimeActive = false;
        if (ctx) ctx.isPaused = false;
        clearTimeout(timeoutId);
        resolved = true;
    }
}