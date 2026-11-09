// fx/620-sword-rain.js — 飞箭雨：小昭·姊「流星赶月」强化的全屏箭雨演出
//   只表现不改结算：真伤由 core/204 在声明阶段下发，这里只按敌方存活格撒箭。
//   方向：fx ← infra（只依赖时钟，不 import render/core）。
//   快进由订阅侧 fx/610 拦（isFxSkipped），本文件不做额外判断。
export const VER = 'fx/620-sword-rain.js V1.0.1';
// V1.0.1 | 2026-11-09 箭体 4×34 → 8×60、箭头 10×10 → 16×16；单支飞行 220ms → 520ms 起、整波间隔 40ms → 90ms/支，只改演出不改结算

import { clock } from '../infra/103-clock.js';

function makeArrow() {
    const el = document.createElement('div');
    el.dataset.fx = 'temporary';
    el.style.cssText = 'position:fixed;z-index:6000;pointer-events:none;width:8px;height:60px;'
        + 'transform:translate(-50%,-100%);';
    // 箭杆
    const shaft = document.createElement('div');
    shaft.style.cssText = 'position:absolute;left:2px;top:0;width:4px;height:48px;'
        + 'background:linear-gradient(180deg,#fff 0%,#9fe6ff 55%,rgba(159,230,255,0.15) 100%);';
    // 箭头（朝下三角）
    const head = document.createElement('div');
    head.style.cssText = 'position:absolute;left:-4px;bottom:0;width:0;height:0;'
        + 'border-left:8px solid transparent;border-right:8px solid transparent;border-top:16px solid #9fe6ff;';
    el.appendChild(shaft);
    el.appendChild(head);
    return el;
}

function makeImpact() {
    const el = document.createElement('div');
    el.dataset.fx = 'temporary';
    el.style.cssText = 'position:fixed;z-index:5999;pointer-events:none;width:38px;height:38px;'
        + 'border:3px solid rgba(159,230,255,0.9);border-radius:50%;'
        + 'transform:translate(-50%,-50%) scale(0.3);opacity:1;';
    return el;
}

// 敌方全屏箭雨：每个存活格 2~3 支，落地冲击圈 + 敌方网格震屏
export async function showSwordRain(enemySide) {
    const grid = document.getElementById('enemyGrid');
    if (!grid) return;
    const units = (enemySide || []).filter(u => u && u.alive && u.pos != null);
    if (units.length === 0) return;

    const jobs = [];
    units.forEach((u, i) => {
        const cell = grid.querySelector('[data-pos="' + u.pos + '"]');
        if (!cell) return;
        const rect = cell.getBoundingClientRect();
        if (!(rect.width > 0)) return;
        const count = 2 + (i % 2);              // 2~3 支，按顺位交替，不新增 RNG
        for (let k = 0; k < count; k++) {
            const x = rect.left + rect.width * ((k + 1) / (count + 1));
            const delay = 90 * k;
            jobs.push((async () => {
                if (delay > 0) await clock.waitReal(delay);
                const arrow = makeArrow();
                document.body.appendChild(arrow);
                const fromTop = rect.top - 140;
                const toTop = rect.bottom - 8;
                await clock.animateReal(520 + 60 * k, (p) => {
                    arrow.style.left = x + 'px';
                    arrow.style.top = (fromTop + (toTop - fromTop) * p) + 'px';
                });
                arrow.remove();
                const ring = makeImpact();
                ring.style.left = x + 'px';
                ring.style.top = toTop + 'px';
                document.body.appendChild(ring);
                await clock.animate(320, (p) => {
                    ring.style.transform = 'translate(-50%,-50%) scale(' + (0.3 + 0.9 * p) + ')';
                    ring.style.opacity = String(Math.max(0, 1 - p));
                });
                ring.remove();
            })());
        }
    });

    // 震屏（普通 timescale，与其它打击演出同口径）
    jobs.push(clock.animate(260, (p) => {
        const amp = 3 * (1 - p);
        grid.style.transform = 'translate(' + ((p < 0.5 ? -1 : 1) * amp) + 'px,' + ((p < 0.5 ? 1 : -1) * amp) + 'px)';
    }).then(() => { grid.style.transform = ''; }));

    await Promise.all(jobs);
}
