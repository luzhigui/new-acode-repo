// modules/93elite-hebiweng.js - 鹤笔翁精英组件
// V5.2.0 | ~500 bytes | 2026-07-25
export const VER = 'modules/93elite-hebiweng.js V5.2.0';

import { CONFIG } from '../core/01config-5v5-test.js';
const ES = CONFIG.ELITE_SKILLS;

export function createHeBiWengComponent() {
    return {
        name: '鹤笔翁',

        /**
         * 伤害计算：鹿角杖法 — 忽略防御 + 中毒目标增伤
         */
        onDamageCalc(unit, target, rawDmg) {
            if (unit.name !== '鹤笔翁') return rawDmg;

            const s = ES.hornStrike;
            const poisoned = target._xuanmingPoison && target._xuanmingPoison.remaining > 0;

            // 防御修正和伤害倍率在 calcFinalDamage 中处理，此处仅返回标记
            return {
                defIgnore: s.defIgnore,
                dmgMultiplier: poisoned ? 1 + s.poisonedBonus : 1,
                rawDmg
            };
        }
    };
}