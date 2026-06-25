// 22fx-fortify-counter.js - 光明顶对战 5v5 严阵以待防守反击特效 (初版)
// 预估行数: 200, 发送时间: 20260619 22:30, 版本: V1.0.0
export const VER = '22fx-fortify-counter.js V1.0.0';

import { showDamageFloat, showComicBubble } from './15fx-common-5v5-test.js';

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

// ==================== 光盾元素 ====================
function createShield(x, y) {
    const container = document.createElement('div');
    container.style.cssText = `
        position: fixed; left: ${x}px; top: ${y}px;
        width: 0px; height: 0px;
        z-index: 10020; pointer-events: none;
    `;

    // 盾牌主体（椭圆形光盾）
    const shield = document.createElement('div');
    shield.style.cssText = `
        position: absolute; left: -30px; top: -25px;
        width: 60px; height: 50px;
        background: radial-gradient(ellipse, rgba(255,215,0,0.3) 0%, rgba(255,215,0,0.1) 60%, transparent 100%);
        border: 3px solid rgba(255,215,0,0.8);
        border-radius: 50% / 40%;
        box-shadow: 0 0 20px rgba(255,215,0,0.5), 0 0 40px rgba(255,180,0,0.3);
        transform: rotateX(70deg);
        opacity: 0;
        transition: opacity 0.2s ease, transform 0.4s ease;
    `;
    container.appendChild(shield);

    // 光盾辉光外层
    const glow = document.createElement('div');
    glow.style.cssText = `
        position: absolute; left: -40px; top: -35px;
        width: 80px; height: 70px;
        background: radial-gradient(ellipse, rgba(255,215,0,0.15) 0%, transparent 70%);
        border-radius: 50%;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    container.appendChild(glow);

    document.body.appendChild(container);
    return { container, shield, glow };
}

// 小光盾幻影（飞箭反击用）
function createMiniShield(x, y) {
    const mini = document.createElement('div');
    mini.style.cssText = `
        position: fixed; left: ${x}px; top: ${y}px;
        width: 24px; height: 20px;
        background: radial-gradient(ellipse, rgba(255,215,0,0.6) 0%, transparent 70%);
        border: 2px solid rgba(255,215,0,1);
        border-radius: 50% / 40%;
        box-shadow: 0 0 15px rgba(255,215,0,0.8);
        transform: rotateX(70deg) scale(0.5);
        opacity: 0;
        z-index: 10025; pointer-events: none;
    `;
    document.body.appendChild(mini);
    return mini;
}

// ==================== 主特效函数 ====================
/**
 * 严阵以待防守反击特效
 * @param {object} attacker - 攻击者单位
 * @param {object} defender - 防战单位
 * @param {number} dmg - 防战承受的伤害
 * @param {number} reboundDmg - 反弹给攻击者的伤害
 * @param {boolean} isRanged - true=飞剑版 / false=飞撞版
 */
export async function showFortifyCounter(attacker, defender, dmg, reboundDmg, isRanged) {
    const defCenter = getCellCenter(defender);
    const attCenter = getCellCenter(attacker);
    if (!defCenter || !attCenter) return;

    const dx = defCenter.x - attCenter.x;
    const dy = defCenter.y - attCenter.y;
    const angle = Math.atan2(dy, dx);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    // ============ 阶段一：举盾 ============
    const { container, shield, glow } = createShield(defCenter.x, defCenter.y);

    // 光盾从平放缓缓立起
    shield.style.transition = 'opacity 0.2s ease, transform 0.5s ease';
    shield.style.opacity = '1';
    shield.style.transform = 'rotateX(0deg)';
    glow.style.transition = 'opacity 0.3s ease';
    glow.style.opacity = '1';
    await wait(500);

    // ============ 阶段二：迟滞（此处仅做停顿，实际打断飞撞/飞箭需在调用方处理） ============
    // 弹幕提示
    showComicBubble('严阵以待！', defCenter.x, defCenter.y - 40, 'bubble-arrow-up', 2000);
    await wait(600);

    if (isRanged) {
        // ============ 飞箭版：碎箭 + 甩盾 ============
        // 碎箭：盾牌闪一下白光，模拟箭被震碎
        shield.style.transition = 'box-shadow 0.15s ease';
        shield.style.boxShadow = '0 0 40px rgba(255,255,255,0.9), 0 0 60px rgba(255,215,0,0.6)';
        await wait(150);
        shield.style.boxShadow = '0 0 20px rgba(255,215,0,0.5), 0 0 40px rgba(255,180,0,0.3)';

        // 防战受伤害
        showDamageFloat(defender, dmg);
        await wait(200);

        // 甩小盾牌回去
        const mini = createMiniShield(defCenter.x, defCenter.y);
        mini.style.transition = 'opacity 0.2s ease';
        mini.style.opacity = '1';
        await wait(100);

        // 小盾沿反方向飞向攻击者
        const flyStart = performance.now();
        const flyDuration = 400;
        const startX = defCenter.x;
        const startY = defCenter.y;
        const targetX = attCenter.x;
        const targetY = attCenter.y;

        await new Promise(res => {
            function step(ts) {
                const t = Math.min(1, (ts - flyStart) / flyDuration);
                const ease = 1 - Math.pow(1 - t, 3);
                const curX = startX + (targetX - startX) * ease;
                const curY = startY + (targetY - startY) * ease;
                mini.style.left = curX + 'px';
                mini.style.top = curY + 'px';
                mini.style.transform = `rotateX(70deg) scale(${0.5 + t * 0.3})`;
                if (t < 1) requestAnimationFrame(step);
                else res();
            }
            requestAnimationFrame(step);
        });

        // 小盾命中，攻击者飘伤害
        showDamageFloat(attacker, reboundDmg);
        mini.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        mini.style.transform = 'rotateX(70deg) scale(1.5)';
        mini.style.opacity = '0';
        await wait(200);
        mini.remove();

    } else {
        // ============ 飞撞版：盾击前顶 ============
        // 盾牌向前猛推一段距离再收回
        const pushDist = Math.min(30, dist * 0.25);
        const pushX = Math.cos(angle) * pushDist;
        const pushY = Math.sin(angle) * pushDist;

        shield.style.transition = 'transform 0.2s ease-out';
        shield.style.transform = `translate(${pushX}px, ${pushY}px) scale(1.2)`;
        await wait(200);

        // 碰撞：双方同时飘伤害
        showDamageFloat(defender, dmg);
        showDamageFloat(attacker, reboundDmg);

        shield.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        shield.style.transform = 'translate(0, 0) scale(1)';
        await wait(300);
    }

    // ============ 阶段四：收盾 ============
    shield.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    shield.style.opacity = '0';
    shield.style.transform = 'rotateX(70deg)';
    glow.style.transition = 'opacity 0.3s ease';
    glow.style.opacity = '0';
    await wait(300);

    container.remove();
}