// V6.1.0 | 2026-09-13 统一时间层：手写 rAF/setTimeout 换 clock；含 showBoneClaw 与通用受击反馈
export const VER = 'fx/81fx-arrows-5v5-test.js V6.1.0';

import { markGridShake } from '../render/32-grid-render.js';
import { CAMP_TYPES } from '../infra/56-battle-enums.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { snapshotUnitCell, snapshotUnitCellRobust } from './90fx-ref-manager.js';
import { clock } from '../infra/52-clock.js';

function applyWholeShake(elements, durationMs, basePositions, angle, onComplete) {
    clock.animate(durationMs, (p) => {
        if (p >= 1) {
            for (let i = 0; i < elements.length; i++) {
                elements[i].style.left = basePositions[i].x + 'px';
                elements[i].style.top = basePositions[i].y + 'px';
                elements[i].style.transform = `rotate(${angle}rad)`;
            }
            if (onComplete) onComplete();
            return;
        }
        const decay = 1 - p;
        const offsetX = (Math.random() - 0.5) * 3 * decay;
        const offsetY = (Math.random() - 0.5) * 3 * decay;
        for (let i = 0; i < elements.length; i++) {
            elements[i].style.left = (basePositions[i].x + offsetX) + 'px';
            elements[i].style.top = (basePositions[i].y + offsetY) + 'px';
        }
    });
}

export function showRangedArrow(unitA, unitD, isMeteor = false, onHit = null, isMiss = false) {
    const rectA = snapshotUnitCell(unitA);
    const rectD = snapshotUnitCell(unitD);
    if (!rectA || !rectD) return;
    const sx = rectA.x, sy = rectA.y, ex = rectD.x, ey = rectD.y;
    const dx = ex - sx, dy = ey - sy, dist = Math.sqrt(dx*dx+dy*dy);
    if (dist < 1) return;
    const angle = Math.atan2(dy, dx);

    // 流星赶月参数；时长均为 1x 基准毫秒，clock 统一缩放
    let arrowLen = isMeteor ? 45 : 40;
    let arrowColor = isMeteor ? '#FFD700' : '#8B4513';
    let arrowThick = isMeteor ? 3 : 2;
    let headSize = isMeteor ? 10 : 8;
    let chargeTime = 500;
    // 2026-09-15 飞行时长按距离匀速：普通 0.6px/ms、流星 1.0px/ms，各带 300~900ms 兜底
    const flySpeed = isMeteor ? 1.0 : 0.6;
    let flyDuration = Math.max(300, Math.min(900, dist / flySpeed));
    let pauseAfterHit = isMeteor ? 1200 : 600;

    let bowIcon = document.createElement('div'); bowIcon.setAttribute('data-fx', 'temporary'); bowIcon.style.position = 'fixed'; bowIcon.style.left = (sx-12)+'px'; bowIcon.style.top = (sy-20)+'px'; bowIcon.style.fontSize = '22px'; bowIcon.style.zIndex = '10002'; bowIcon.style.pointerEvents = 'none'; bowIcon.textContent = '🏹';
    if (isMeteor) { bowIcon.style.filter = 'drop-shadow(0 0 6px gold)'; }
    document.body.appendChild(bowIcon);
    clock.animate(chargeTime, (p) => {
        if (p >= 1) {
            if (bowIcon.parentNode) bowIcon.remove();
            launchArrow();
        } else {
            let scale = 1 + 0.15 * Math.sin(p * Math.PI);
            bowIcon.style.transform = `scale(${scale})`;
        }
    });

    function launchArrow() {
        let finalStartX = ex - Math.cos(angle) * arrowLen, finalStartY = ey - Math.sin(angle) * arrowLen;
        let container = document.createElement('div');
        container.setAttribute('data-fx', 'temporary');
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
        clock.animate(flyDuration, (p) => {
            let curStartX, curStartY;
            if (isMiss) {
                if (p < 0.5) { curStartX = sx + (finalStartX - sx) * p * 2; curStartY = sy + (finalStartY - sy) * p * 2; }
                else { const p2 = (p - 0.5) * 2; const baseX = finalStartX; const baseY = finalStartY; curStartX = baseX - (finalStartX - sx) * 0.15 * p2 + (finalStartY - sy) * 0.3 * p2; curStartY = baseY - (finalStartY - sy) * 0.15 * p2 - (finalStartX - sx) * 0.3 * p2; }
            } else {
                curStartX = sx + (finalStartX - sx) * p;
                curStartY = sy + (finalStartY - sy) * p;
            }
            container.style.left = curStartX + 'px'; container.style.top = curStartY + 'px';
            if (p >= 1) {
                // 命中颤动由 88fx-trigger 统一决策，本函数只负责动画
                if (onHit) onHit();

                if (isMeteor) {
                    let ring = document.createElement('div');
                    ring.setAttribute('data-fx', 'temporary');
                    ring.style.cssText = `position:fixed;left:${ex}px;top:${ey}px;width:40px;height:40px;border:3px solid #FFD700;border-radius:50%;transform:translate(-50%,-50%);z-index:10002;pointer-events:none;box-shadow:0 0 12px #FFA500;animation:meteorRing 0.8s ease-out forwards;`;
                    document.body.appendChild(ring);
                    clock.wait(800).then(() => { if (ring.parentNode) ring.remove(); });
                }

                applyWholeShake([container], pauseAfterHit, [{x: finalStartX, y: finalStartY}], angle, () => { if (container.parentNode) container.remove(); });
            }
        });
    }
}

// 流星赶月分裂飞箭：向被溅射单位发射小型橙色飞箭
export async function showSplashArrows(attacker, primaryTarget, splashTargets, onHit) {
    const rectA = snapshotUnitCell(attacker);
    const rectPrimary = snapshotUnitCell(primaryTarget);
    if (!rectA || !rectPrimary) return;
    const px = rectPrimary.x, py = rectPrimary.y;

    // 蓄力停顿：在主目标位置显示金色光圈，模拟流星命中后的能量聚集
    const ring = document.createElement('div');
    ring.setAttribute('data-fx', 'temporary');
    ring.style.cssText = `position:fixed;left:${px}px;top:${py}px;width:40px;height:40px;border:3px solid #FFD700;border-radius:50%;transform:translate(-50%,-50%);z-index:10002;pointer-events:none;box-shadow:0 0 12px #FFA500;animation:meteorRing 0.8s ease-out forwards;`;
    document.body.appendChild(ring);
    clock.wait(800).then(() => { if (ring.parentNode) ring.remove(); });

    await clock.wait(300);

    splashTargets.forEach(st => {
        const rectD = snapshotUnitCell(st);
        if (!rectD) return;
        const sx = px, sy = py;
        const ex = rectD.x, ey = rectD.y;
        const dx = ex - sx, dy = ey - sy, dist = Math.sqrt(dx*dx+dy*dy);
        if (dist < 1) return;

        const angle = Math.atan2(dy, dx);
        const arrowLen = 25;
        const flyDuration = 350;

        const finalStartX = ex - Math.cos(angle) * arrowLen;
        const finalStartY = ey - Math.sin(angle) * arrowLen;

        const container = document.createElement('div');
        container.setAttribute('data-fx', 'temporary');
        container.style.position = 'fixed'; container.style.left = sx + 'px'; container.style.top = sy + 'px';
        container.style.transformOrigin = '0 50%'; container.style.transform = `rotate(${angle}rad)`;
        container.style.zIndex = '10003'; container.style.pointerEvents = 'none';

        const line = document.createElement('div');
        line.style.position = 'absolute'; line.style.height = '2.5px'; line.style.background = '#FF8C00';
        line.style.width = arrowLen + 'px'; line.style.left = '0px'; line.style.top = '-1.25px';
        container.appendChild(line);

        const head = document.createElement('div');
        head.style.position = 'absolute'; head.style.width = '0'; head.style.height = '0';
        head.style.borderLeft = '8px solid #FF8C00';
        head.style.borderTop = '4px solid transparent'; head.style.borderBottom = '4px solid transparent';
        head.style.left = (arrowLen - 4) + 'px'; head.style.top = '-4px';
        container.appendChild(head);

        document.body.appendChild(container);

        clock.animate(flyDuration, (p) => {
            let curStartX = sx + (finalStartX - sx) * p;
            let curStartY = sy + (finalStartY - sy) * p;
            container.style.left = curStartX + 'px';
            container.style.top = curStartY + 'px';
            if (p >= 1) {
                if (onHit) onHit(st);
                clock.wait(600).then(() => { if (container.parentNode) container.remove(); });
            }
        });
    });
}

// 九阴白骨爪：🫳凝结 → 飞向目标 → 命中（斩杀走碎开）
export function showBoneClaw(unitA, unitD, onHit, opts) {
    if (GlobalStore.get('fastForwardActive')) { if (onHit) onHit(); return; }
    opts = opts || {};
    const rectA = snapshotUnitCellRobust(unitA);
    const rectD = snapshotUnitCellRobust(unitD);
    if (!rectA || !rectD) { if (onHit) onHit(); return; }
    const sx = rectA.x, sy = rectA.y, ex = rectD.x, ey = rectD.y;
    const dx = ex - sx, dy = ey - sy, dist = Math.sqrt(dx*dx+dy*dy);
    if (dist < 1) { if (onHit) onHit(); return; }
    const angle = Math.atan2(dy, dx);
    const chargeTime = 500;
    // 飞行时间按距离给保底，最少 700ms；小昭衍生技交替触发时临时降到 450ms 提速配合节奏
    let baseMin = 700;
    if (unitD && unitD.hp !== undefined) {
        const battleState = GlobalStore.get('currentBattleState');
        const xiaoZhaoActive = battleState?.ally?.find(u => u.isXiaoZhaoSister && u.alive);
        if (xiaoZhaoActive) {
            const zhang = battleState?.ally?.find(u => u.isZhang && u.alive);
            if (!zhang) {
                const derivedHeal = Math.floor(unitD.def / 10);
                if (derivedHeal > 0) baseMin = 450;
            }
        }
    }
    let flyDuration = Math.max(baseMin, dist * 1.5);
    let pauseAfterHit = 500;

    let claw = document.createElement('div');
    claw.style.position = 'fixed';
    claw.style.left = sx + 'px';
    claw.style.top = sy + 'px';
    claw.style.width = '44px';
    claw.style.height = '44px';
    claw.style.zIndex = '10001';
    claw.style.pointerEvents = 'none';
    claw.style.transformOrigin = 'center';
    let clawRotation = angle + Math.PI / 2;
    claw.style.transform = `translate(-50%,-50%) rotate(${clawRotation}rad)`;
    claw.setAttribute('data-fx', 'temporary');
    claw.style.fontSize = '40px';
    claw.style.lineHeight = '1';
    claw.style.textAlign = 'center';
    claw.style.color = '#ffffff';
    claw.style.filter = 'drop-shadow(0 0 4px rgba(220,220,255,0.9)) brightness(1.6) saturate(0.6) hue-rotate(20deg)';
    claw.textContent = '🫳';
    document.body.appendChild(claw);

    // 凝结阶段：放大浮现
    clock.animate(chargeTime, (p) => {
        let scale = 0.4 + 0.6 * p;
        claw.style.transform = `translate(-50%,-50%) rotate(${clawRotation}rad) scale(${scale})`;
        claw.style.opacity = 0.5 + 0.5 * p;
        if (p >= 1) phaseFly();
    });

    // 飞行阶段：从攻击者位置飞向目标，不旋转（保持指尖朝向目标）
    function phaseFly() {
        clock.animate(flyDuration, (p) => {
            let cx = sx + (ex - sx) * p;
            let cy = sy + (ey - sy) * p;
            claw.style.left = cx + 'px';
            claw.style.top = cy + 'px';
            if (p >= 1) {
                // 命中：白骨爪属近战技能，不加受击颤动
                if (onHit) onHit();
                if (opts.isExecute) {
                    claw.style.transition = 'transform 0.4s ease-out, opacity 0.4s';
                    claw.style.transform = `translate(-50%,-50%) rotate(${clawRotation}rad) scale(2.2)`;
                    claw.style.opacity = '1';
                    clock.wait(500).then(() => {
                        claw.style.transition = 'opacity 0.3s';
                        claw.style.opacity = '0';
                        clock.wait(300).then(() => { if (claw.parentNode) claw.remove(); });
                    });
                    clock.wait(600).then(() => {
                        const finalRectD = snapshotUnitCellRobust(unitD);
                        if (finalRectD) triggerExecuteShatter(finalRectD);
                    });
                } else {
                    clock.wait(pauseAfterHit).then(() => { if (claw.parentNode) claw.remove(); });
                }
            }
        });
    }
}

// 斩杀特效：基于 rect 生成红色闪光和碎片（不持有 DOM 引用）
function triggerExecuteShatter(rect) {
    if (!rect) return;
    let redFlash = document.createElement('div');
    redFlash.setAttribute('data-fx', 'temporary');
    redFlash.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;background:radial-gradient(circle, rgba(255,30,30,0.95), rgba(180,0,0,0.6));z-index:9998;pointer-events:none;opacity:0.95;border-radius:4px;`;
    document.body.appendChild(redFlash);
    let cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    let shards = [];
    for (let i = 0; i < 14; i++) {
        let shard = document.createElement('div');
        let angle = (i / 14) * Math.PI * 2;
        let dist = 40 + Math.random() * 60;
        shard.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:8px;height:8px;background:#ff3030;z-index:9999;pointer-events:none;border-radius:1px;box-shadow:0 0 8px rgba(255,0,0,0.8);transition:transform 0.7s ease-out, opacity 0.7s;`;
        document.body.appendChild(shard);
        // 下一帧设终值触发 CSS transition（这是"下一帧"语义，非时长，保留 rAF）
        requestAnimationFrame(() => {
            shard.style.transform = `translate(${Math.cos(angle)*dist}px, ${Math.sin(angle)*dist}px) rotate(${Math.random()*360}deg) scale(0.2)`;
            shard.style.opacity = '0';
        });
        shards.push(shard);
    }
    clock.wait(300).then(() => {
        redFlash.style.transition = 'opacity 0.4s';
        redFlash.style.opacity = '0';
    });
    clock.wait(1000).then(() => {
        if (redFlash.parentNode) redFlash.parentNode.remove();
        shards.forEach(s => { if (s.parentNode) s.parentNode.remove(); });
    });
}