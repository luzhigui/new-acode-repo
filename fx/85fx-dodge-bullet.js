// V6.1.0 | ~26100 bytes | 2026-09-09 特效层解耦：移除原格样式保存/恢复，clone 后即脱离；原格隐藏由 store/renderGrid 驱动
export const VER = 'fx/85fx-dodge-bullet.js V6.1.0';

import { showComicBubble } from './80fx-common-5v5-test.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { STORE_ACTION_TYPES, CAMP_TYPES } from '../infra/56-battle-enums.js';
import { snapshotUnitCellRobust, getUnitCell } from './90fx-ref-manager.js';

function wait(ms) { return new Promise(r => setTimeout(r, GlobalStore.get('fastForwardActive') ? 1 : ms)); }

function createZigzagLightning() {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "lightning-split");
    svg.setAttribute('data-fx', 'temporary');
    svg.style.position = 'fixed'; svg.style.left = '0'; svg.style.top = '0';
    svg.style.width = '100%'; svg.style.height = '100%'; svg.style.pointerEvents = 'none';
    svg.style.zIndex = '9995';
    const w = innerWidth, h = innerHeight;
    const d = `M${w*0.95},${h*0.15} L${w*0.65},${h*0.25} L${w*0.8},${h*0.35} L${w*0.5},${h*0.45} L${w*0.65},${h*0.55} L${w*0.25},${h*0.65} L${w*0.05},${h*0.95}`;
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", d);
    path.setAttribute("stroke", "#FFD700");
    path.setAttribute("stroke-width", "4");
    path.setAttribute("fill", "none");
    svg.appendChild(path);
    document.body.appendChild(svg);
    return svg;
}

function createFlameBehind(angle, offsetX, offsetY, parentLeft, parentTop) {
    const container = document.createElement('div');
    container.className = 'flame-trail';
    container.style.position = 'fixed'; container.style.zIndex = '10015'; container.style.pointerEvents = 'none';
    container.style.transform = `rotate(${angle}rad)`;
    container.style.left = (parentLeft + offsetX) + 'px';
    container.style.top = (parentTop + offsetY) + 'px';
    const colors = ['#ff4500','#ff6600','#ff8800','#ffaa00','#ffcc00','#ffff00'];
    for (let i = 0; i < 10; i++) {
        const f = document.createElement('div');
        f.className = 'flame-layer';
        f.style.position = 'absolute'; f.style.borderRadius = '50% 0 0 50%'; f.style.opacity = '0.8';
        f.style.width = (90 - i * 6) + 'px'; f.style.height = (18 - i * 1) + 'px';
        f.style.left = (-180 + i * 10) + 'px'; f.style.top = (-18 + i * 1) + 'px';
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
        const line = document.createElement('div');
        line.className = 'wind-split';
        const offY = (i < 6) ? (-30 - i*5) : (10 + (i-6)*5);
        line.style.left = (x - 60) + 'px'; line.style.top = (y + offY) + 'px';
        line.style.position = 'fixed'; line.style.zIndex = '9998'; line.style.pointerEvents = 'none';
        line.style.width = '80px'; line.style.height = '2px';
        line.style.background = 'linear-gradient(to right, white, transparent)';
        line.style.opacity = '0.6';
        line.style.animation = 'windMove 0.6s linear infinite';
        document.body.appendChild(line);
        lines.push(line);
    }
    return lines;
}

function updateWindSplit(lines, cx, cy) {
    lines.forEach((l, i) => {
        const offY = (i < 6) ? (-30 - i*5) : (10 + (i-6)*5);
        l.style.left = (cx - 60) + 'px';
        l.style.top = (cy + offY) + 'px';
    });
}

function createBgParticles(x, y) {
    const particles = [];
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.className = 'bg-particle';
        p.style.position = 'fixed'; p.style.width = '3px'; p.style.height = '3px';
        p.style.background = 'white'; p.style.borderRadius = '50%';
        p.style.opacity = '0.5'; p.style.zIndex = '9996'; p.style.pointerEvents = 'none';
        p.style.left = (x + (Math.random()-0.5)*200) + 'px';
        p.style.top = (y + (Math.random()-0.5)*100) + 'px';
        p.style.animation = 'particleMove 1s linear infinite';
        document.body.appendChild(p);
        particles.push(p);
    }
    return particles;
}

function createCounterStorm(x, y) {
    const container = document.createElement('div');
    container.className = 'counter-storm';
    container.style.position = 'fixed'; container.style.zIndex = '10060'; container.style.pointerEvents = 'none';
    container.style.left = (x - 45) + 'px'; container.style.top = (y - 20) + 'px';
    container.style.width = '90px'; container.style.height = '40px';
    container.style.transformStyle = 'preserve-3d';
    container.style.transform = 'rotateX(75deg)';
    for (let i = 0; i < 4; i++) {
        const ring = document.createElement('div');
        ring.className = 'storm-ring';
        ring.style.position = 'absolute'; ring.style.left = '0px'; ring.style.top = (i * 12) + 'px';
        ring.style.width = '90px'; ring.style.height = '10px';
        ring.style.setProperty('border', '3px solid #ffffff', 'important');
        ring.style.setProperty('border-radius', '50%', 'important');
        ring.style.setProperty('box-shadow', '0 0 8px #ffffff, 0 0 20px rgba(255,255,255,0.5)', 'important');
        if (i > 0) ring.style.animationDelay = `-${i * 0.15}s`;
        container.appendChild(ring);
    }
    const hammerLeft = document.createElement('div');
    hammerLeft.style.cssText = 'position:absolute;left:0px;top:5px;width:8px;height:8px;background:white;border-radius:50%;box-shadow:0 0 8px white;';
    container.appendChild(hammerLeft);
    const hammerRight = document.createElement('div');
    hammerRight.style.cssText = 'position:absolute;right:0px;top:5px;width:8px;height:8px;background:white;border-radius:50%;box-shadow:0 0 8px white;';
    container.appendChild(hammerRight);
    document.body.appendChild(container);
    return container;
}

function triggerShake() {
    document.body.classList.add('shake-screen');
    setTimeout(() => document.body.classList.remove('shake-screen'), 200);
}

// 构建克隆体：基于 innerHTML 与固定样式，不继承原格任何状态
function buildClone(innerHTML, rect, extraCSS) {
    const clone = document.createElement('div');
    clone.setAttribute('data-fx', 'temporary');
    clone.classList.add('bullet-clone');
    clone.innerHTML = innerHTML;
    clone.style.cssText = `
        position: fixed;
        left: ${rect.left}px;
        top: ${rect.top}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        z-index: 10050;
        margin: 0;
        transform: none;
        pointer-events: none;
        display: flex;
        border: 2px solid #bbb;
        border-radius: 5px;
        box-sizing: border-box;
        ${extraCSS || ''}
    `;
    document.body.appendChild(clone);
    return clone;
}

// 子弹时间特效
export async function showDodgeBulletTime(attacker, defender, reboundDmg) {
    const TIMEOUT_MS = 18000;
    let isSkipped = false;
    let cleanupElements = [];
    const ctx = GlobalStore.get('playerContext');
    if (ctx) ctx.isPaused = true;
    let resolved = false;

    const timeoutId = setTimeout(() => {
        if (!resolved) { console.warn('[子弹时间] 超时，强制结束'); isSkipped = true; cleanup(); resolved = true; }
    }, TIMEOUT_MS);

    let cloneA = null;
    let cloneD = null;

    function cleanup() {
        cleanupElements.forEach(el => { if (el && el.parentNode) el.remove(); });
        clearTimeout(timeoutId);
        if (cloneA) { cloneA.remove(); cloneA = null; }
        if (cloneD) { cloneD.remove(); cloneD = null; }
        if (ctx && ctx.store) {
            if (attacker) {
                ctx.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: attacker.uid, _flyMode: null });
                ctx.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: attacker.uid });
                Object.assign(attacker.state, { _flyMode: null });
            }
            if (defender) {
                ctx.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: defender.uid, _flyMode: null });
                ctx.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: defender.uid });
                Object.assign(defender.state, { _flyMode: null });
            }
            ctx.updateUI();
        }
    }

    try {
        const cellA = getUnitCell(attacker);
        const cellD = getUnitCell(defender);
        if (!cellA || !cellD) { cleanup(); return; }

        // 必须在任何 await 之前读取 rect 和 innerHTML，同时 clone
        const rectA = snapshotUnitCellRobust(attacker);
        const rectD = snapshotUnitCellRobust(defender);
        if (!rectA || !rectD) { cleanup(); return; }
        const htmlA = cellA.innerHTML;
        const htmlD = cellD.innerHTML;

        // 设置 _flyMode，让 renderGrid 重建时隐藏原格（fly 模式透明，ghost 模式虚影）
        const flyMode = GlobalStore.get('crashMode') || 'ghost';
        if (ctx && ctx.store) {
            Object.assign(attacker.state, { _flyMode: flyMode });
            Object.assign(defender.state, { _flyMode: flyMode });
            ctx.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: attacker.uid });
            ctx.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: defender.uid });
            ctx.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: attacker.uid, _acted: true, _flyMode: flyMode });
            ctx.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: defender.uid, _acted: true, _flyMode: flyMode });
            ctx.updateUI();
        }

        const pos = { ax: innerWidth * 0.09, ay: innerHeight * 0.16, dx: innerWidth * 0.64, dy: innerHeight * 0.68 };

        // 跳过按钮
        const skipBtn = document.createElement('div');
        skipBtn.className = 'skip-btn';
        skipBtn.textContent = '跳过';
        skipBtn.style.cssText = 'position:fixed;bottom:12%;right:8%;z-index:99999;'
            + 'color:rgba(255,255,255,0.7);font-size:18px;font-weight:bold;'
            + 'cursor:pointer;pointer-events:auto;transform:rotate(-30deg);'
            + 'text-align:center;line-height:1;letter-spacing:2px;';
        skipBtn.addEventListener('click', () => {
            isSkipped = true;
            cleanup();
            resolved = true;
            GlobalStore.set('bulletTimeActive', false);
            if (ctx) ctx.isPaused = false;
        });
        document.body.appendChild(skipBtn);
        cleanupElements.push(skipBtn);

        // 阶段1：闪电劈开画面，进入子弹时间
        const lightning = createZigzagLightning();
        cleanupElements.push(lightning);
        await wait(400);
        if (isSkipped) { cleanup(); return; }

        // 黑幕
        const mask = document.createElement('div');
        mask.className = 'bullet-mask';
        mask.setAttribute('data-fx', 'temporary');
        mask.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;'
            + 'background:rgba(0,0,0,0.92);z-index:9999;pointer-events:none;';
        document.body.appendChild(mask);
        cleanupElements.push(mask);
        await wait(200);
        if (isSkipped) { cleanup(); return; }

        // 反击者克隆体（从右侧飞入）
        cloneD = buildClone(htmlD, rectD, `
            left: ${innerWidth}px;
            top: ${pos.dy - rectD.height/2}px;
            width: ${rectD.width}px;
            height: ${rectD.height}px;
            transform: scale(0.8);
            filter: drop-shadow(0 0 8px #00bcd4) drop-shadow(0 0 20px rgba(0,188,212,0.5));
            background: #ffd700;
            border: 3px solid #b8860b;
        `);
        cloneD.querySelectorAll('*').forEach(el => { el.style.color = '#1a1a1a'; });
        cleanupElements.push(cloneD);

        const defCenterX = pos.dx + rectD.width/2;
        const defCenterY = pos.dy + rectD.height/2;
        const defInitialLeft = pos.dx;
        const defInitialTop = pos.dy - rectD.height/2;

        // 攻击者克隆体
        cloneA = buildClone(htmlA, rectA, `
            left: ${pos.ax - innerWidth*0.06}px;
            top: ${pos.ay - innerHeight*0.06}px;
            width: ${rectA.width}px;
            height: ${rectA.height}px;
            transform: scale(0.6);
            background: #1e6bb8;
            border: 3px solid #0d47a1;
        `);
        cloneA.querySelectorAll('*').forEach(el => { el.style.color = '#ffffff'; });
        cleanupElements.push(cloneA);

        const startAX = pos.ax - innerWidth*0.06;
        const startAY = pos.ay - innerHeight*0.06;

        const kanzhao = showComicBubble('看招！', startAX + 40, startAY + 10, '', 2500);
        if (kanzhao) kanzhao.setAttribute('data-fx', 'temporary');
        cleanupElements.push(kanzhao);

        // 攻击者进场
        await new Promise(res => {
            const t0 = performance.now();
            function step(now) {
                if (isSkipped) { res(); return; }
                const t = Math.min(1, (now - t0) / 500);
                cloneA.style.left = (startAX + (pos.ax - startAX) * t) + 'px';
                cloneA.style.top = (startAY + (pos.ay - startAY) * t) + 'px';
                cloneA.style.transform = `scale(${0.6 + 0.5 * t})`;
                if (t < 1) requestAnimationFrame(step);
                else res();
            }
            requestAnimationFrame(step);
        });
        if (isSkipped) { cleanup(); return; }

        await wait(100);
        if (isSkipped) { cleanup(); return; }

        const bubbleY = defCenterY - rectD.height/2 - 100;
        const openBubble = showComicBubble('开打开打！', defCenterX, bubbleY, 'bubble-arrow-up', 3000);
        if (openBubble) openBubble.setAttribute('data-fx', 'temporary');
        cleanupElements.push(openBubble);

        // 防御者进场
        await new Promise(res => {
            const t0 = performance.now();
            function step(now) {
                if (isSkipped) { res(); return; }
                const t = Math.min(1, (now - t0) / 500);
                cloneD.style.left = (innerWidth + (pos.dx - innerWidth) * t) + 'px';
                cloneD.style.transform = `scale(${0.8 + 0.4 * t})`;
                if (t < 1) requestAnimationFrame(step);
                else res();
            }
            requestAnimationFrame(step);
        });
        if (isSkipped) { cleanup(); return; }

        await wait(600);
        if (isSkipped) { cleanup(); return; }

        // 屏息凝视
        const glow = document.createElement('div');
        glow.className = 'breath-glow';
        cloneA.appendChild(glow);
        const cloneDRect = cloneD.getBoundingClientRect();
        const stormCX = cloneDRect.left + cloneDRect.width / 2;
        const stormCY = cloneDRect.top - 10;
        const storm = createCounterStorm(stormCX, stormCY);
        storm.setAttribute('data-fx', 'temporary');
        cleanupElements.push(storm);
        document.body.appendChild(storm);
        await wait(3000);
        if (isSkipped) { cleanup(); return; }

        glow.remove();
        lightning.remove();
        storm.remove();

        // 阶段2：攻击者带着火焰和风压高速冲刺接近
        const attackAngle = Math.atan2(pos.dy - pos.ay, pos.dx - pos.ax);
        const flameOffsetX = -25, flameOffsetY = -2;
        const flame = createFlameBehind(attackAngle, flameOffsetX, flameOffsetY, parseFloat(cloneA.style.left), parseFloat(cloneA.style.top));
        if (flame) flame.setAttribute('data-fx', 'temporary');
        cleanupElements.push(flame);

        const windLines = createWindSplit(pos.ax, pos.ay);
        windLines.forEach(l => cleanupElements.push(l));
        const particles = createBgParticles(pos.ax, pos.ay);
        particles.forEach(p => cleanupElements.push(p));
        const shield = document.createElement('div');
        shield.className = 'wind-shield';
        cloneA.appendChild(shield);
        cleanupElements.push(shield);

        const updateFlame = () => updateFlamePosition(flame, parseFloat(cloneA.style.left), parseFloat(cloneA.style.top), flameOffsetX, flameOffsetY);

        let shakeCount = 0;
        const shakeTimer = setInterval(() => {
            const offX = (Math.random()-0.5)*4;
            const offY = (Math.random()-0.5)*4;
            cloneA.style.transform = `scale(${0.9 + shakeCount/150}) translate(${offX}px, ${offY}px)`;
            if (++shakeCount > 45) clearInterval(shakeTimer);
        }, 20);

        // 快速冲刺
        const startX = parseFloat(cloneA.style.left);
        const startY = parseFloat(cloneA.style.top);
        const dx = pos.dx - pos.ax;
        const dy = pos.dy - pos.ay;
        const midX = startX + dx * 0.65;
        const midY = startY + dy * 0.65;
        await new Promise(res => {
            const dur = 1500, t0 = performance.now();
            function step(now) {
                if (isSkipped) { res(); return; }
                const t = Math.min(1, (now - t0) / dur);
                const cx = startX + (midX - startX) * t;
                const cy = startY + (midY - startY) * t;
                cloneA.style.left = cx+'px';
                cloneA.style.top = cy+'px';
                updateFlame();
                const ccx = cx + cloneA.offsetWidth/2;
                const ccy = cy + cloneA.offsetHeight/2;
                updateWindSplit(windLines, ccx, ccy);
                if (t<1) requestAnimationFrame(step);
                else res();
            }
            requestAnimationFrame(step);
        });
        if (isSkipped) { cleanup(); return; }

        // 慢速接近
        const slowX = midX + dx * 0.06;
        const slowY = midY + dy * 0.06;
        clearInterval(shakeTimer);
        cloneA.style.transform = 'scale(1.1)';
        await new Promise(res => {
            const dur = 600, t0 = performance.now();
            function step(now) {
                if (isSkipped) { res(); return; }
                const t = Math.min(1, (now - t0) / dur);
                const cx = midX + (slowX - midX) * t;
                const cy = midY + (slowY - midY) * t;
                cloneA.style.left = cx+'px';
                cloneA.style.top = cy+'px';
                updateFlame();
                const ccx = cx + cloneA.offsetWidth/2;
                const ccy = cy + cloneA.offsetHeight/2;
                updateWindSplit(windLines, ccx, ccy);
                if (t<1) requestAnimationFrame(step);
                else res();
            }
            requestAnimationFrame(step);
        });
        if (isSkipped) { cleanup(); return; }

        flame.remove();
        windLines.forEach(l=>l.remove());
        particles.forEach(p=>p.remove());
        shield.remove();

        // 防御者前顶
        cloneD.style.transition = 'transform 0.15s ease-out';
        cloneD.style.transform = 'scale(1.15) translate(10px, 10px)';
        await wait(150);
        if (isSkipped) { cleanup(); return; }
        cloneD.style.transition = 'transform 0.2s ease-in';
        cloneD.style.transform = 'scale(1.25) translate(-40px, -40px)';
        await wait(220);
        if (isSkipped) { cleanup(); return; }

        // 阶段3：双方碰撞
        const colX = (parseFloat(cloneA.style.left) + parseFloat(cloneD.style.left)) / 2;
        const colY = (parseFloat(cloneA.style.top) + parseFloat(cloneD.style.top)) / 2;
        const shockwave = document.createElement('div');
        shockwave.className = 'shockwave';
        shockwave.setAttribute('data-fx', 'temporary');
        shockwave.style.left = (colX - 40)+'px';
        shockwave.style.top = (colY - 40)+'px';
        shockwave.style.zIndex = '10040';
        document.body.appendChild(shockwave);
        cleanupElements.push(shockwave);
        const dmg = document.createElement('div');
        dmg.textContent = '反击! ' + reboundDmg;
        dmg.style.position = 'fixed';
        dmg.style.left = colX + 'px';
        dmg.style.top = colY + 'px';
        dmg.style.fontSize = '28px';
        dmg.style.fontWeight = 'bold';
        dmg.style.color = '#2ecc71';
        dmg.style.zIndex = '10025';
        dmg.style.animation = 'dmgBounce 0.8s ease-out forwards';
        document.body.appendChild(dmg);
        cleanupElements.push(dmg);
        setTimeout(() => dmg.remove(), 800);
        triggerShake();

        // 阶段4：攻击者被反震击飞
        const retX = parseFloat(cloneA.style.left);
        const retY = parseFloat(cloneA.style.top);
        const retreatTotal = 300 + 800 + 800;
        const retreatStart = performance.now();
        const retreatSlow = 300, retreatSlowRatio = 0.06;
        const retreatAccel = 800, retreatAccelRatio = 0.2;
        const retreatFast = 800;

        await new Promise(res => {
            function step(now) {
                if (isSkipped) { res(); return; }
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

        // 防御者返回动画
        const returnDuration = 600;
        const returnStart = performance.now();
        const currentDLeft = parseFloat(cloneD.style.left);
        const currentDTop = parseFloat(cloneD.style.top);
        await new Promise(res => {
            function step(now) {
                if (isSkipped) { res(); return; }
                const t = Math.min(1, (now - returnStart) / returnDuration);
                const curLeft = currentDLeft + (defInitialLeft - currentDLeft) * t;
                const curTop = currentDTop + (defInitialTop - currentDTop) * t;
                cloneD.style.left = curLeft + 'px';
                cloneD.style.top = curTop + 'px';
                cloneD.style.transform = `scale(${0.9 + 0.1 * t})`;
                if (t < 1) requestAnimationFrame(step);
                else res();
            }
            requestAnimationFrame(step);
        });
        if (isSkipped) { cleanup(); return; }

        const defBubbleY = defInitialTop + rectD.height + 20;
        const grinBubble = showComicBubble('哼，一个能打的都没有', defCenterX, defBubbleY, 'bubble-arrow-up', 4000);
        cleanupElements.push(grinBubble);

        // 攻击者飞走
        const flyAwayStartX = parseFloat(cloneA.style.left);
        const flyAwayStartY = parseFloat(cloneA.style.top);
        const maxDistX = innerWidth * 0.10;
        const maxDistY = innerHeight * 0.10;
        await new Promise(res => {
            const t0 = performance.now();
            function step(now) {
                if (isSkipped) { res(); return; }
                const t = Math.min(1, (now - t0) / 2000);
                const ease = t * t;
                cloneA.style.left = (flyAwayStartX - maxDistX * ease) + 'px';
                cloneA.style.top = (flyAwayStartY - maxDistY * ease) + 'px';
                const scale = Math.max(0.12, 0.5 * (1 - t * 0.76));
                cloneA.style.transform = `scale(${scale}) rotate(${t * 17 * 360}deg)`;
                cloneA.style.opacity = 1 - t * (1 - 0.4);
                if (t < 1) requestAnimationFrame(step);
                else res();
            }
            requestAnimationFrame(step);
        });
        if (isSkipped) { cleanup(); return; }

        const attBubbleX = pos.ax + 60;
        const attBubbleY = pos.ay + 40;
        const returnBubble = showComicBubble('啊，我一定会回来的！', attBubbleX, attBubbleY, 'bubble-arrow-down', 5000);
        cleanupElements.push(returnBubble);

        await wait(3000);
        if (isSkipped) { cleanup(); return; }

        mask.classList.remove('active-full');
        cloneA.style.opacity = '0';
        cloneD.style.opacity = '0';
        shockwave.style.opacity = '0';
        await wait(200);

        cleanup();
    } catch (e) {
        cleanup();
    } finally {
        GlobalStore.set('bulletTimeActive', false);
        if (ctx) ctx.isPaused = false;
        clearTimeout(timeoutId);
        resolved = true;
    }
}