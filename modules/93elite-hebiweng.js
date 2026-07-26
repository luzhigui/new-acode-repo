// modules/93elite-hebiweng.js - 鹤笔翁精英组件
// V5.2.1 | ~1200 bytes | 2026-07-25
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
        },

        onAfterAttack(unit, target, dmgCalc, allySide, enemySide, log, A, B, state) {
            if (unit.name !== '鹤笔翁' || unit._isLinkAttack || dmgCalc.dmg <= 0 || !target.alive) return;
            const lu = allySide.find(u => u.name === '鹿杖客' && u.alive && !u._acted);
            const luActed = !lu ? allySide.find(u => u.name === '鹿杖客' && u.alive && u._acted && !u._linkTriggered) : null;
            const partner = lu || luActed;
            if (partner && !partner._linkTriggered) {
                partner._isLinkAttack = true;
                partner._linkTriggered = true;
                log.push({type:'info', text:`<span class="gold">🔗 ${partner.name} 跟随 ${unit.name} 发动联动攻击！</span>`});
                if (typeof processUnitAttack === 'function') {
                    const linkResult = processUnitAttack(partner, allySide, enemySide, log, A, B, state, null, target.uid);
                    if (!linkResult) {
                        partner._acted = true;
                    }
                }
                partner._isLinkAttack = false;
                partner._linkTriggered = false;
                emitEvent(partner, 'hp-change', { hp: partner.hp, maxHp: partner.maxHp, alive: partner.alive, atk: partner.atk, def: partner.def });
            }
        }
    };
}