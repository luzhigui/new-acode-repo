// modules/94elite-luzhangke.js - 鹿杖客精英组件
// V5.2.0 | ~600 bytes | 2026-07-25
export const VER = 'modules/94elite-luzhangke.js V5.2.0';

import { CONFIG } from '../core/01config-5v5-test.js';
const ES = CONFIG.ELITE_SKILLS;

export function createLuZhangKeComponent() {
    return {
        name: '鹿杖客',

        /**
         * 攻击命中后：玄冥神掌上毒
         */
        onAfterApplyDamage(unit, target, dmgCalc, group, allySide, log) {
            if (unit.name !== '鹿杖客') return;

            const s = ES.xuanmingPalm;
            target._xuanmingPoison = {
                remaining: s.duration,
                dotPercents: [...s.dotPercents]
            };
            const firstDot = Math.floor(target.maxHp * s.dotPercents[0]);
            log.push({
                type: 'info',
                text: `<span class="purple">❄️ ${unit.name} 的玄冥神掌使 ${target.name} 中毒！每回合损失生命（4%→2%→1%→消失）</span>`
            });
        }
    };
}