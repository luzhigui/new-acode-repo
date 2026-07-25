// modules/96elite-zhouzhiruo.js - 周芷若精英组件
// V5.2.0 | ~800 bytes | 2026-07-25
export const VER = 'modules/96elite-zhouzhiruo.js V5.2.0';

import { CONFIG } from '../core/01config-5v5-test.js';
const ES = CONFIG.ELITE_SKILLS;

function emitEvent(unit, eventType, payload) {
    if (typeof window._emitEvent === 'function') {
        window._emitEvent(unit, eventType, payload);
    }
}

/**
 * 周芷若组件
 * 钩子：onAfterDamageCalc — 九阴白骨爪追击
 */
export function createZhouZhiruoComponent() {
    return {
        name: '周芷若',

        /**
         * 伤害计算完成后、应用前触发
         */
        onAfterDamageCalc(unit, target, dmg, log, allySide, enemySide) {
            if (unit.name !== '周芷若' || !target || !target.alive) return 0;

            const battleState = GlobalStore.get('currentBattleState');
            const zhangAlive = battleState && battleState.ally &&
                battleState.ally.some(u => u.isZhang && u.alive);
            const s = ES.nineYinClaw;
            const baseHit = zhangAlive ? (s.jealousBaseDmg || 5) : (s.baseDmg || 3);

            if (!unit._nineYinFirstDone) {
                unit._nineYinFirstDone = true;
            } else {
                if (Math.random() > s.procChance) return 0;
            }

            let totalBonus = 0;
            let depth = 0;
            while (target.alive) {
                if (depth > 0 && Math.random() > s.chainProcChance) break;

                const lostHp = target.maxHp - target.hp;
                const ratio = zhangAlive ? s.jealousLostHpRatio : s.lostHpRatio;
                const ratioDmg = Math.floor(lostHp * ratio + target.maxHp * (zhangAlive ? (s.jealousMaxHpRatio || 0.02) : (s.maxHpRatio || 0.01)));
                let bonusDmg = baseHit + Math.max(0, ratioDmg);

                target.hp = Math.max(0, target.hp - bonusDmg);
                totalBonus += bonusDmg;
                unit.dmgDealt += bonusDmg;
                target.dmgTaken += bonusDmg;

                const hpPctAfter = target.hp / target.maxHp;
                const execThreshold = zhangAlive ? (s.jealousExecuteThreshold || 0.15) : (s.executeThreshold || 0.12);
                let isExecute = false;
                if (hpPctAfter <= execThreshold && target.hp > 0) {
                    bonusDmg += target.hp;
                    target.hp = 0;
                    isExecute = true;
                }

                if (target.hp <= 0) {
                    target.hp = 0;
                    target.alive = false;
                    target._isDead = true;
                    if (!target._deathTime) target._deathTime = Date.now();
                }

                emitEvent(target, 'hp-change', {
                    hp: target.hp,
                    maxHp: target.maxHp,
                    alive: target.alive,
                    atk: target.atk,
                    def: target.def,
                    _isDead: target._isDead || false,
                    _isAbsolute: true
                });

                const clawEvents = [...window._battleEvents];
                window._battleEvents = [];
                if (window.GlobalStore) window.GlobalStore.flushBattleEvents();

                log.push({
                    type: 'info',
                    text: `<span style="color:#222">🐾 九阴白骨爪${depth > 0 ? '连锁' : '追击'}！${unit.name} 对 ${target.name} 造成 ${bonusDmg} 点伤害${isExecute ? '（斩杀）' : (zhangAlive ? '【嫉妒】' : '')}</span>`,
                    buffType: 'elite_bonus',
                    isClawHit: true,
                    clawAttackerUid: unit.uid,
                    clawTargetUid: target.uid,
                    clawTargetHpAfter: target.hp,
                    clawTargetAlive: target.alive,
                    clawTargetIsDead: target._isDead,
                    isExecute: isExecute,
                    uidD: target.uid,
                    isDead: !target.alive,
                    _events: clawEvents
                });

                depth++;
                if (isExecute) break;
            }
            return totalBonus;
        }
    };
}