// modules/94elite-luzhangke.js - 鹿杖客精英组件
// V5.2.1 | ~1300 bytes | 2026-07-27 联动改为直接伤害
export const VER = 'modules/94elite-luzhangke.js V5.2.1';

import { CONFIG } from '../core/01config-5v5-test.js';
const ES = CONFIG.ELITE_SKILLS;

function emitEvent(unit, eventType, payload) {
    if (typeof window._emitEvent === 'function') {
        window._emitEvent(unit, eventType, payload);
    }
}

export function createLuZhangKeComponent() {
    return {
        name: '鹿杖客',

        onAfterApplyDamage(unit, target, dmgCalc, group, allySide, log) {
            if (unit.name !== '鹿杖客') return;

            const s = ES.xuanmingPalm;
            target._xuanmingPoison = {
                remaining: s.duration,
                dotPercents: [...s.dotPercents]
            };
            log.push({
                type: 'info',
                text: `<span class="purple">❄️ ${unit.name} 的玄冥神掌使 ${target.name} 中毒！每回合损失生命（4%→2%→1%→消失）</span>`
            });
        }
    };
}