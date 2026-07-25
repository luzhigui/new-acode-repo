// modules/95elite-chengkun.js - 成昆精英组件
// V5.2.0 | ~1200 bytes | 2026-07-25
export const VER = 'modules/95elite-chengkun.js V5.2.0';

import { CONFIG } from '../core/01config-5v5-test.js';
import { rand } from '../core/03battle-utils.js';
const ES = CONFIG.ELITE_SKILLS;

function emitEvent(unit, eventType, payload) {
    if (typeof window._emitEvent === 'function') {
        window._emitEvent(unit, eventType, payload);
    }
}

export function createChengKunComponent() {
    return {
        name: '成昆',

        /**
         * 攻击命中后：幻影伪装 + 回复生命
         */
        onAfterApplyDamage(unit, target, dmgCalc, group, enemySide, log) {
            if (unit.name !== '成昆' || dmgCalc.dmg <= 0) return;

            const enemyAlive = enemySide.filter(u => u.alive && !u.isHorse);
            if (enemyAlive.length > 0) {
                unit._phantomTarget = enemyAlive[rand(0, enemyAlive.length - 1)].uid;
                const lostHp = unit.maxHp - unit.hp;
                if (lostHp > 0) {
                    const aliveCount = enemySide.filter(u => u.alive).length;
                    const heal = Math.floor(lostHp * 0.06 * aliveCount);
                    unit.hp = Math.min(unit.maxHp, unit.hp + heal);
                    unit.healDone += heal;
                    log.push({
                        type: 'info',
                        text: `<span class="green">🎭 幻影伪装：${unit.name} 回复 ${heal} 点生命</span>`,
                        isHealEntry: true,
                        healAmount: heal,
                        healUnitUid: unit.uid
                    });
                }
                emitEvent(unit, 'hp-change', {
                    hp: unit.hp,
                    maxHp: unit.maxHp,
                    alive: unit.alive,
                    atk: unit.atk,
                    def: unit.def,
                    _phantomTarget: unit._phantomTarget
                });
            }
        },

        /**
         * 伤害计算：混元霹雳劲
         */
        onDamageCalc(unit, target, rawDmg) {
            if (unit.name !== '成昆') return rawDmg;
            const lostHp = unit.maxHp - unit.hp;
            return rawDmg + Math.floor(lostHp * ES.phantomThunder.lostHpRatio);
        }
    };
}