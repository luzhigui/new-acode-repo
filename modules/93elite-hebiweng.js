// modules/93elite-hebiweng.js - 鹤笔翁精英组件
// V5.2.1 | ~1300 bytes | 2026-07-27 联动改为直接伤害
export const VER = 'modules/93elite-hebiweng.js V5.2.1';

import { CONFIG } from '../core/01config-5v5-test.js';
const ES = CONFIG.ELITE_SKILLS;

function emitEvent(unit, eventType, payload) {
    if (typeof window._emitEvent === 'function') {
        window._emitEvent(unit, eventType, payload);
    }
}

export function createHeBiWengComponent() {
    return {
        name: '鹤笔翁',

        onDamageCalc(unit, target, rawDmg) {
            if (unit.name !== '鹤笔翁') return rawDmg;

            const s = ES.hornStrike;
            const poisoned = target._xuanmingPoison && target._xuanmingPoison.remaining > 0;

            return {
                defIgnore: s.defIgnore,
                dmgMultiplier: poisoned ? 1 + s.poisonedBonus : 1,
                rawDmg
            };
        }
    };
}