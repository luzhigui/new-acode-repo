// 21fx-blood-slash.js - 光明顶对战 5v5 嗜血狂刀吸血大剑特效 (初版)
// 预估行数: 200, 发送时间: 20260619 21:30, 版本: V1.0.0
export const VER = '21fx-blood-slash.js V1.0.0';

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function getCellCenter(unit) {
    if (!unit || unit.pos == null) return null;
    const grid = document.getElementById(unit.camp === 'ally' ? 'allyGrid' : 'enemyGrid');
    if (!grid) return null;
    const order = unit.camp === 'enemy' ? [7,8,9,4,5,6,1,2,3] : [1,2,3,4,5,6,7,8,9];
    const idx = order.indexOf(unit.pos);
    if (idx < 0 || !grid.children[idx]) return null;
    const rect = grid.children[idx].getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// 创建剑元素
function createSword(x, y, angle) {
    const container = document.createElement('div');
    container.style.cssText = `
        position: fixed; left: ${x}px; top: ${y}px;
        width: 90px; height: 10px;
        transform: rotate(${angle}rad);
        transform-origin: 0% 50%;
        z-index: 10010; pointer-events: none;
        filter: drop-shadow(0 0 6px rgba(255,255,200,0.6));
    `;

    // 剑身
    const blade = document.createElement('div');
    blade.style.cssText = `
        position: absolute; left: 15px; top: 1px;
        width: 65px; height: 8px;
        background: linear-gradient(90deg, #c0c0c0, #e8e8e8, #ffffff);
        border-radius: 2px;
    `;
    blade.className = 'sword-blade';
    container.appendChild(blade);

    // 剑尖
    const tip = document.createElement('div');
    tip.style.cssText = `
        position: absolute; left: 80px; top: -1px;
        width: 0; height: 0;
        border-left: 14px solid #d4d4d4;
        border-top: 6px solid transparent;
        border-bottom: 6px solid transparent;
    `;
    tip.className = 'sword-tip';
    container.appendChild(tip);

    // 剑柄
    const hilt = document.createElement('div');
    hilt.style.cssText = `
        position: absolute; left: 0px; top: 0px;
        width: 15px; height: 10px;
        background: linear-gradient(180deg, #8B4513, #A0522D);
        border-radius: 2px;
    `;
    container.appendChild(hilt);

    // 染血层（初始不可见）
    const blood = document.createElement('div');
    blood.style.cssText = `
        position: absolute; left: 80px; top: -1px;
        width: 0px; height: 12px;
        background: linear-gradient(90deg, #ff0000, #8b0000);
        border-radius: 2px;
        transition: width 0.3s ease-out;
    `;
    blood.className = 'sword-blood';
    container.appendChild(blood);

    document.body.appendChild(container);
    return { container, blade, tip, blood };
}

// 创建回吸血线粒子
function createBloodParticles(fromX, fromY, toX, toY) {
    const particles = [];
    const count = 6;
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        const size = 3 + Math.random() * 4;
        p.style.cssText = `
            position: fixed; left: ${fromX}px; top: ${fromY}px;
            width: ${size}px; height: ${size}px;
            background: #e74c3c;
            border-radius: 50%;
            z-index: 10015; pointer-events: none;
            opacity: 0.8;
            box-shadow: 0 0 ${size}px #ff0000;
        `;
        document.body.appendChild(p);

        // 贝塞尔控制点偏移
        const cp1x = fromX + (toX - fromX) * 0.3 + (Math.random() - 0.5) * 60;
        const cp1y = fromY + (toY - fromY) * 0.2 + (Math.random() - 0.5) * 40;
        const cp2x = fromX + (toX - fromX) * 0.7 + (Math.random() - 0.5) * 60;
        const cp2y = fromY + (toY - fromY) * 0.6 + (Math.random() - 0.5) * 40;

        particles.push({ el: p, fromX, fromY, toX, toY, cp1x, cp1y, cp2x, cp2y, delay: i * 60 });
    }
    return particles;
}

function animateBloodParticles(particles, duration) {
    const startTime = performance.now();
    return new Promise(res => {
        function step(now) {
            let allDone = true;
            for (const p of particles) {
                const elapsed = now - startTime - p.delay;
                if (elapsed < 0) { allDone = false; continue; }
                const t = Math.min(1, elapsed / duration);
                // 三次贝塞尔曲线
                const u = 1 - t;
                const x = u*u*u * p.fromX + 3*u*u*t * p.cp1x + 3*u*t*t * p.cp2x + t*t*t * p.toX;
                const y = u*u*u * p.fromY + 3*u*u*t * p.cp1y + 3*u*t*t * p.cp2y + t*t*t * p.toY;
                p.el.style.left = x + 'px';
                p.el.style.top = y + 'px';
                p.el.style.opacity = t < 0.8 ? 0.8 : 0.8 * (1 - (t - 0.8) / 0.2);
                if (t < 1) allDone = false;
            }
            if (allDone) {
                particles.forEach(p => p.el.remove());
                res();
            } else {
                requestAnimationFrame(step);
            }
        }
        requestAnimationFrame(step);
    });
}

// 主特效函数
export async function showBloodSlash(attacker, defender, healAmount) {
    const from = getCellCenter(attacker);
    const to = getCellCenter(defender);
    if (!from || !to) return;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const baseAngle = Math.atan2(dy, dx);

    // 剑的初始位置：攻击者前方 30px
    const startX = from.x + Math.cos(baseAngle) * 30;
    const startY = from.y + Math.sin(baseAngle) * 30;
    // 剑的终点：目标前方 20px（不撞上去）
    const endX = to.x - Math.cos(baseAngle) * 20;
    const endY = to.y - Math.sin(baseAngle) * 20;
    const flyDist = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);

    // 阶段一：凝剑
    const { container, blade, tip, blood } = createSword(startX, startY, baseAngle);
    container.style.opacity = '0';
    container.style.transition = 'opacity 0.2s ease';
    requestAnimationFrame(() => { container.style.opacity = '0.7'; });
    await wait(250);

    // 阶段二 + 三：旋飞 + 染血
    const flyStart = performance.now();
    const flyDuration = 450;
    await new Promise(res => {
        function step(now) {
            const t = Math.min(1, (now - flyStart) / flyDuration);
            const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
            const curX = startX + (endX - startX) * ease;
            const curY = startY + (endY - startY) * ease;
            container.style.left = curX + 'px';
            container.style.top = curY + 'px';

            // 旋转：从平放(rotateX 0)到竖直(rotateX 75deg)
            const rotX = 75 * ease;
            container.style.transform = `rotate(${baseAngle}rad) rotateX(${rotX}deg)`;

            // 染血：半程开始，从剑尖向剑柄蔓延
            if (t > 0.35) {
                const bloodProgress = (t - 0.35) / 0.65;
                blood.style.width = (bloodProgress * 79) + 'px';
                blood.style.left = (80 - bloodProgress * 79) + 'px';
            }

            if (t < 1) requestAnimationFrame(step);
            else res();
        }
        requestAnimationFrame(step);
    });

    // 阶段四：竖劈
    container.style.transition = 'transform 0.15s ease-out';
    container.style.transform = `rotate(${baseAngle}rad) rotateX(75deg) translateY(15px)`;
    // 目标格子震动
    const defCell = document.getElementById(defender.camp === 'ally' ? 'allyGrid' : 'enemyGrid')
        ?.children[[...[7,8,9,4,5,6,1,2,3], ...[1,2,3,4,5,6,7,8,9]][defender.camp === 'enemy' ? 0 : 1]?.indexOf(defender.pos)];
    if (defCell) {
        defCell.classList.add('shake');
        setTimeout(() => defCell.classList.remove('shake'), 400);
    }
    await wait(180);

    // 阶段五：回吸
    const bloodParticles = createBloodParticles(to.x, to.y, from.x, from.y);
    await animateBloodParticles(bloodParticles, 500);

    // 阶段六：收剑（治疗绿光 + 消散）
    container.style.transition = 'opacity 0.3s ease';
    container.style.opacity = '0';
    // 攻击者格子闪绿光
    const attCell = document.getElementById(attacker.camp === 'ally' ? 'allyGrid' : 'enemyGrid')
        ?.children[[...[7,8,9,4,5,6,1,2,3], ...[1,2,3,4,5,6,7,8,9]][attacker.camp === 'enemy' ? 0 : 1]?.indexOf(attacker.pos)];
    if (attCell) {
        attCell.style.transition = 'box-shadow 0.3s ease';
        attCell.style.boxShadow = '0 0 20px #2ecc71';
        setTimeout(() => { attCell.style.boxShadow = ''; }, 500);
    }
    await wait(350);
    container.remove();
}