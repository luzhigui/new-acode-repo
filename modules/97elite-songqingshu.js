// modules/97elite-songqingshu.js - 宋青书精英组件
// V5.2.1 | ~1000 bytes | 2026-07-25
export const VER = 'modules/97elite-songqingshu.js V5.2.1';

import { CONFIG } from '../core/01config-5v5-test.js';
const ES = CONFIG.ELITE_SKILLS;

function emitEvent(unit, eventType, payload) {
    if (typeof window._emitEvent === 'function') {
        window._emitEvent(unit, eventType, payload);
    }
}

/**
 * 宋青书组件
 */
export function createSongQingshuComponent() {
    return {
        name: '宋青书',

        /**
         * 攻击命中后触发：新婚扣血 + 性奋代价
         */
        onAfterApplyDamage(unit, target, dmgCalc, group, allySide, log) {
            if (unit.name !== '宋青书' || !unit.alive) return;

            // === 新婚扣血 ===
            const zhou = allySide.find(u => u.name === '周芷若' && u.alive);
            if (zhou) {
                zhou.hp = Math.max(0, zhou.hp - ES.xinHun.hpDeduct);
                zhou.dmgTaken += ES.xinHun.hpDeduct;
                emitEvent(zhou, 'hp-change', {
                    hp: zhou.hp,
                    maxHp: zhou.maxHp,
                    alive: zhou.alive,
                    atk: zhou.atk,
                    def: zhou.def,
                    _isAbsolute: true
                });
                zhou._kuaiLeStack.push({ healPct: ES.xinHun.healLevels[0] });
                log.push({
                    type: 'info',
                    text: `<span class="gold">💒 新婚：${unit.name}攻击，${zhou.name}被扣除${ES.xinHun.hpDeduct}点血量，叠加一层快乐(16%)！当前快乐层数：${zhou._kuaiLeStack.length}</span>`,
                    buffType: 'elite_xinhun',
                    zhouUid: zhou.uid,
                    zhouHpAfter: zhou.hp
                });
                if (zhou.hp <= 0) {
                    zhou.hp = 0;
                    zhou.alive = false;
                    zhou._isDead = true;
                    if (!zhou._deathTime) zhou._deathTime = Date.now();
                    emitEvent(zhou, 'hp-change', {
                        hp: 0,
                        maxHp: zhou.maxHp,
                        alive: false,
                        atk: zhou.atk,
                        def: zhou.def,
                        _isDead: true,
                        _isAbsolute: true
                    });
                    log.push({
                        type: 'info',
                        text: `<span class="red">💀 ${zhou.name} 因新婚扣血而阵亡！</span>`,
                        uidD: zhou.uid,
                        isDead: true
                    });
                }
            }

            // === 性奋代价 ===
            if (!unit._xingFenPenaltyCount) unit._xingFenPenaltyCount = 0;
            unit._xingFenPenaltyCount++;
            const penalty = unit._xingFenPenaltyCount;
            if (penalty > 0 && unit.maxHp > 1) {
                const oldMaxHp = unit.maxHp;
                unit.maxHp = Math.max(1, unit.maxHp - penalty);
                unit.hp = Math.min(unit.hp, unit.maxHp);
                emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def });
                log.push({ type:'info', text:`<span class="red">💗 性奋代价：${unit.name} 血量上限 ${oldMaxHp} → ${unit.maxHp}（-${penalty}）</span>` });
            }
        },

        /**
         * 攻击全部结束后：性奋额外攻击
         */
        onAfterAttack(unit, target, allySide, enemySide, log, A, B, state) {
            if (unit.name !== '宋青书' || !unit.alive) return;
            if (!unit._xingFenActive) return;
            if (!enemySide.some(u => u.alive)) return;

            unit._xingFenActive = false;
            log.push({ type:'info', text:`<span class="gold">💗 性奋：${unit.name} 获得额外攻击机会！</span>` });

            // 通过递归调用 processUnitAttack 触发额外攻击
            if (typeof processUnitAttack === 'function') {
                processUnitAttack(unit, allySide, enemySide, log, A, B, state, null);
            }
        }
    };
}