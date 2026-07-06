// fx/16fx-arrows-5v5-test.js - 光明顶5v5 飞箭+白骨爪特效
// V4.1.1 | ~14000 bytes | 2026-07-06 新增 showBoneClaw、接入通用受击反馈
export const VER = 'fx/16fx-arrows-5v5-test.js V4.1.1';

import { applyImpactShrink } from './15fx-common-5v5-test.js';

function applyWholeShake(elements, durationMs, basePositions, angle, getPausedFn, onComplete) {
    let start = null;
    function shake(ts) { if (getPausedFn && getPausedFn()) { requestAnimationFrame(shake); return; } if (!start) start = ts; let elapsed = ts - start; if (elapsed >= durationMs) { for (let i = 0; i < elements.length; i++) { elements[i].style.left = basePositions[i].x + 'px'; elements[i].style.top = basePositions[i].y + 'px'; elements[i].style.transform = `rotate(${angle}rad)`; } if (onComplete) onComplete(); return; } let progress = elapsed / durationMs, decay = 1 - progress; let offsetX = (Math.random() - 0.5) * 3 * decay, offsetY = (Math.random() - 0.5) * 3 * decay; for (let i = 0; i < elements.length; i++) { elements[i].style.left = (basePositions[i].x + offsetX) + 'px'; elements[i].style.top = (basePositions[i].y + offsetY) + 'px'; } requestAnimationFrame(shake); }
    requestAnimationFrame(shake);
}

export function showRangedArrow(unitA, unitD, speed, getPausedFn, isMeteor = false) {
    let gridAId = unitA.camp==='ally'?'allyGrid':'enemyGrid', gridDId = unitD.camp==='ally'?'allyGrid':'enemyGrid';
    let gridA = document.getElementById(gridAId), gridD = document.getElementById(gridDId);
    let orderA = unitA.camp==='enemy'?[7,8,9,4,5,6,1,2,3]:[1,2,3,4,5,6,7,8,9], orderD = unitD.camp==='enemy'?[7,8,9,4,5,6,1,2,3]:[1,2,3,4,5,6,7,8,9];
    let idxA = orderA.indexOf(unitA.pos), idxD = orderD.indexOf(unitD.pos);
    if(idxA<0||idxD<0||!gridA.children[idxA]||!gridD.children[idxD]) return;
    let rA = gridA.children[idxA].getBoundingClientRect(), rD = gridD.children[idxD].getBoundingClientRect();
    let sx=rA.left+rA.width/2, sy=rA.top+rA.height/2, ex=rD.left+rD.width/2, ey=rD.top+rD.height/2;
    let dx=ex-sx, dy=ey-sy, dist=Math.sqrt(dx*dx+dy*dy); if(dist<1) return;
    let angle = Math.atan2(dy, dx);

    // 流星赶月参数
    let arrowLen = isMeteor ? 45 : 40;
    let arrowColor = isMeteor ? '#FFD700' : '#8B4513';
    let arrowThick = isMeteor ? 3 : 2;
    let headSize = isMeteor ? 10 : 8;
    let chargeTime = 500 * (speed / 1000);
    let flyDuration = isMeteor ? 400 : 600 * (speed / 1000);
    let pauseAfterHit = isMeteor ? 1200 : 600 * (speed / 1000);

    let bowIcon = document.createElement('div'); bowIcon.style.position = 'fixed'; bowIcon.style.left = (sx-12)+'px'; bowIcon.style.top = (sy-20)+'px'; bowIcon.style.fontSize = '22px'; bowIcon.style.zIndex = '10002'; bowIcon.style.pointerEvents = 'none'; bowIcon.textContent = '🏹';
    if (isMeteor) { bowIcon.style.filter = 'drop-shadow(0 0 6px gold)'; }
    document.body.appendChild(bowIcon);
    let bowStart = null;
    function animateBow(ts) { if (getPausedFn && getPausedFn()) { requestAnimationFrame(animateBow); return; } if (!bowStart) bowStart = ts; let p = Math.min(1, (ts - bowStart) / chargeTime); let scale = 1 + 0.15 * Math.sin(p * Math.PI); bowIcon.style.transform = `scale(${scale})`; if (p < 1) { requestAnimationFrame(animateBow); } else { if (bowIcon.parentNode) bowIcon.remove(); launchArrow(); } }
    requestAnimationFrame(animateBow);

    function launchArrow() {
        let finalStartX = ex - Math.cos(angle) * arrowLen, finalStartY = ey - Math.sin(angle) * arrowLen;
        let container = document.createElement('div');
        container.style.position = 'fixed'; container.style.left = sx + 'px'; container.style.top = sy + 'px';
        container.style.transformOrigin = '0 50%'; container.style.transform = `rotate(${angle}rad)`;
        container.style.zIndex = '10001'; container.style.pointerEvents = 'none';

        let line = document.createElement('div');
        line.style.position = 'absolute'; line.style.height = arrowThick + 'px';
        line.style.background = arrowColor;
        line.style.width = arrowLen + 'px'; line.style.left = '0px';
        line.style.top = (-arrowThick/2) + 'px';
        if (isMeteor) { line.style.boxShadow = '0 0 6px #FFA500'; }
        container.appendChild(line);

        let head = document.createElement('div');
        head.style.position = 'absolute'; head.style.width = '0'; head.style.height = '0';
        head.style.borderLeft = `${headSize}px solid ${arrowColor}`;
        head.style.borderTop = `${headSize/2}px solid transparent`;
        head.style.borderBottom = `${headSize/2}px solid transparent`;
        head.style.left = (arrowLen - headSize/2) + 'px';
        head.style.top = (-headSize/2) + 'px';
        if (isMeteor) { head.style.filter = 'drop-shadow(0 0 4px #FFA500)'; }
        container.appendChild(head);

        document.body.appendChild(container);
        let startFly = null;
        function flyStep(ts) { if (getPausedFn && getPausedFn()) { requestAnimationFrame(flyStep); return; } if (!startFly) startFly = ts; let p = Math.min(1, (ts - startFly) / flyDuration); let curStartX = sx + (finalStartX - sx) * p, curStartY = sy + (finalStartY - sy) * p; container.style.left = curStartX + 'px'; container.style.top = curStartY + 'px';
            if (p < 1) { requestAnimationFrame(flyStep); } else {
                container.style.left = finalStartX + 'px'; container.style.top = finalStartY + 'px';
                let defCell = gridD.children[idxD]; if (defCell) { applyImpactShrink(defCell, 300, getPausedFn); }

                // 流星赶月：命中后显示蓄力光圈
                if (isMeteor) {
                    let ring = document.createElement('div');
                    ring.style.cssText = `position:fixed;left:${ex}px;top:${ey}px;width:40px;height:40px;border:3px solid #FFD700;border-radius:50%;transform:translate(-50%,-50%);z-index:10002;pointer-events:none;box-shadow:0 0 12px #FFA500;animation:meteorRing 0.8s ease-out forwards;`;
                    document.body.appendChild(ring);
                    setTimeout(() => { if (ring.parentNode) ring.remove(); }, 800);
                }

                applyWholeShake([container], pauseAfterHit, [{x: finalStartX, y: finalStartY}], angle, getPausedFn, () => { if (container.parentNode) container.remove(); });
            } }
        requestAnimationFrame(flyStep);
    }
}

/**
 * 流星赶月分裂飞箭特效
 * 从目标位置向每个被溅射的单位发射小型橙色飞箭
 */
export function showSplashArrows(attacker, primaryTarget, splashTargets, speed, getPausedFn) {
    let gridAId = attacker.camp==='ally'?'allyGrid':'enemyGrid';
    let gridA = document.getElementById(gridAId);
    let orderA = attacker.camp==='enemy'?[7,8,9,4,5,6,1,2,3]:[1,2,3,4,5,6,7,8,9];
    let idxA = orderA.indexOf(attacker.pos);
    if(idxA<0||!gridA.children[idxA]) return;
    let rA = gridA.children[idxA].getBoundingClientRect();
    let ax = rA.left + rA.width/2, ay = rA.top + rA.height/2;
    
    let primaryGridId = primaryTarget.camp==='ally'?'allyGrid':'enemyGrid';
    let primaryGrid = document.getElementById(primaryGridId);
    let orderPrimary = primaryTarget.camp==='enemy'?[7,8,9,4,5,6,1,2,3]:[1,2,3,4,5,6,7,8,9];
    let idxPrimary = orderPrimary.indexOf(primaryTarget.pos);
    if(idxPrimary<0||!primaryGrid.children[idxPrimary]) return;
    let rPrimary = primaryGrid.children[idxPrimary].getBoundingClientRect();
    let px = rPrimary.left + rPrimary.width/2, py = rPrimary.top + rPrimary.height/2;
    
    splashTargets.forEach(st => {
        let gridDId = st.camp==='ally'?'allyGrid':'enemyGrid';
        let gridD = document.getElementById(gridDId);
        let orderD = st.camp==='enemy'?[7,8,9,4,5,6,1,2,3]:[1,2,3,4,5,6,7,8,9];
        let idxD = orderD.indexOf(st.pos);
        if(idxD<0||!gridD.children[idxD]) return;
        let rD = gridD.children[idxD].getBoundingClientRect();
        let sx = px, sy = py;
        let ex = rD.left + rD.width/2, ey = rD.top + rD.height/2;
        let dx = ex - sx, dy = ey - sy, dist = Math.sqrt(dx*dx+dy*dy);
        if(dist<1) return;
        
        let angle = Math.atan2(dy, dx);
        let arrowLen = 25;
        let flyDuration = 350 * (speed / 1000);
        
        let finalStartX = ex - Math.cos(angle) * arrowLen;
        let finalStartY = ey - Math.sin(angle) * arrowLen;
        
        let container = document.createElement('div');
        container.style.position = 'fixed'; container.style.left = sx + 'px'; container.style.top = sy + 'px';
        container.style.transformOrigin = '0 50%'; container.style.transform = `rotate(${angle}rad)`;
        container.style.zIndex = '10003'; container.style.pointerEvents = 'none';
        
        let line = document.createElement('div');
        line.style.position = 'absolute'; line.style.height = '1.5px'; line.style.background = '#FF8C00';
        line.style.width = arrowLen + 'px'; line.style.left = '0px'; line.style.top = '-0.5px';
        container.appendChild(line);
        
        let head = document.createElement('div');
        head.style.position = 'absolute'; head.style.width = '0'; head.style.height = '0';
        head.style.borderLeft = '6px solid #FF8C00';
        head.style.borderTop = '3px solid transparent'; head.style.borderBottom = '3px solid transparent';
        head.style.left = (arrowLen - 3) + 'px'; head.style.top = '-3px';
        container.appendChild(head);
        
        document.body.appendChild(container);
        
        let startFly = null;
        function flyStep(ts) {
            if (getPausedFn && getPausedFn()) { requestAnimationFrame(flyStep); return; }
            if (!startFly) startFly = ts;
            let p = Math.min(1, (ts - startFly) / flyDuration);
            let curStartX = sx + (finalStartX - sx) * p;
            let curStartY = sy + (finalStartY - sy) * p;
            container.style.left = curStartX + 'px';
            container.style.top = curStartY + 'px';
            if (p < 1) {
                requestAnimationFrame(flyStep);
            } else {
                let defCell = gridD.children[idxD];
                if (defCell) { applyImpactShrink(defCell, 250, getPausedFn); }
                setTimeout(() => { if (container.parentNode) container.remove(); }, 400);
            }
        }
        requestAnimationFrame(flyStep);
    });
}

/**
 * 九阴白骨爪特效
 * 凝结利爪 → 朝目标飞行（不旋转，爪尖朝向敌人） → 命中缩小抖动
 * 速度同飞箭，受击用通用 applyImpactShrink（黄色短闪）
 */
export function showBoneClaw(unitA, unitD, speed, getPausedFn, onHit) {
    if (window._fastForwardActive) { if (onHit) onHit(); return; }
    let gridAId = unitA.camp==='ally'?'allyGrid':'enemyGrid', gridDId = unitD.camp==='ally'?'allyGrid':'enemyGrid';
    let gridA = document.getElementById(gridAId), gridD = document.getElementById(gridDId);
    let orderA = unitA.camp==='enemy'?[7,8,9,4,5,6,1,2,3]:[1,2,3,4,5,6,7,8,9];
    let orderD = unitD.camp==='enemy'?[7,8,9,4,5,6,1,2,3]:[1,2,3,4,5,6,7,8,9];
    let idxA = orderA.indexOf(unitA.pos), idxD = orderD.indexOf(unitD.pos);
    if(idxA<0||idxD<0||!gridA.children[idxA]||!gridD.children[idxD]) { if (onHit) onHit(); return; }
    let rA = gridA.children[idxA].getBoundingClientRect(), rD = gridD.children[idxD].getBoundingClientRect();
    let sx=rA.left+rA.width/2, sy=rA.top+rA.height/2, ex=rD.left+rD.width/2, ey=rD.top+rD.height/2;
    let dx=ex-sx, dy=ey-sy, dist=Math.sqrt(dx*dx+dy*dy);
    if(dist<1) { if (onHit) onHit(); return; }
    let angle = Math.atan2(dy, dx);
    let chargeTime = 500 * (speed / 1000);
    let flyDuration = 600 * (speed / 1000);
    let pauseAfterHit = 500 * (speed / 1000);

    let claw = document.createElement('div');
    claw.style.position = 'fixed';
    claw.style.left = sx + 'px';
    claw.style.top = sy + 'px';
    claw.style.width = '44px';
    claw.style.height = '44px';
    claw.style.zIndex = '10001';
    claw.style.pointerEvents = 'none';
    claw.style.transformOrigin = 'center';
    // 整体旋转一次让爪尖指向目标（飞行过程中不再旋转）
    claw.style.transform = `translate(-50%,-50%) rotate(${angle}rad)`;
    // SVG 三道弯曲细长爪痕（像鹰爪），爪尖朝向飞行方向（右方，旋转后对准目标）
    claw.innerHTML = `<svg width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
        <path d="M 6 16 Q 14 22 26 30" stroke="#f0f0ff" stroke-width="2.6" fill="none" stroke-linecap="round"/>
        <path d="M 10 10 Q 18 18 28 32" stroke="#ffffff" stroke-width="2.8" fill="none" stroke-linecap="round"/>
        <path d="M 18 6 Q 24 18 30 34" stroke="#f0f0ff" stroke-width="2.6" fill="none" stroke-linecap="round"/>
        <path d="M 28 10 Q 30 22 32 34" stroke="#e8e8ff" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    </svg>`;
    claw.style.filter = 'drop-shadow(0 0 4px rgba(180,200,255,0.7))';
    document.body.appendChild(claw);

    // 凝结阶段：放大浮现
    let startCharge = null;
    function phaseCharge(ts) {
        if (getPausedFn && getPausedFn()) { requestAnimationFrame(phaseCharge); return; }
        if (!startCharge) startCharge = ts;
        let p = Math.min(1, (ts - startCharge) / chargeTime);
        let scale = 0.4 + 0.6 * p;
        claw.style.transform = `translate(-50%,-50%) rotate(${angle}rad) scale(${scale})`;
        claw.style.opacity = 0.5 + 0.5 * p;
        if (p < 1) { requestAnimationFrame(phaseCharge); }
        else { phaseFly(0); }
    }
    requestAnimationFrame(phaseCharge);

    // 飞行阶段：从攻击者位置飞向目标，不旋转（保持爪尖朝向目标）
    function phaseFly(ts) {
        if (!ts) { requestAnimationFrame(phaseFly); return; }
        if (getPausedFn && getPausedFn()) { requestAnimationFrame(phaseFly); return; }
        let startFly = claw._flyStart || (claw._flyStart = ts);
        let p = Math.min(1, (ts - startFly) / flyDuration);
        let cx = sx + (ex - sx) * p;
        let cy = sy + (ey - sy) * p;
        claw.style.left = cx + 'px';
        claw.style.top = cy + 'px';
        if (p < 1) { requestAnimationFrame(phaseFly); }
        else {
            // 命中：受击反馈 + 伤害数字
            let defCell = gridD.children[idxD];
            if (defCell) { applyImpactShrink(defCell, 250, getPausedFn); }
            if (onHit) onHit();
            // 短暂停留后移除爪
            setTimeout(() => { if (claw.parentNode) claw.remove(); }, pauseAfterHit);
        }
    }
}