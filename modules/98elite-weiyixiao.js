// modules/98elite-weiyixiao.js - 韦一笑精英组件
// V5.2.1 | ~800 bytes | 2026-07-25
export const VER = 'modules/98elite-weiyixiao.js V5.2.1';

/**
 * 韦一笑组件
 * 钩子：onAfterApplyDamage — 吸血 + 血上限成长
 */
export function createWeiYixiaoComponent() {
    return {
        name: '韦一笑',

        /**
         * 攻击命中并造成伤害后触发
         */
        onAfterApplyDamage(unit, target, dmgCalc, group, A, log) {
            if (unit.camp !== 'ally' || !unit.isWei || !unit.alive || dmgCalc.dmg <= 0) return;

            const healWei = Math.floor(dmgCalc.dmg * 0.18);
            const wasFullHpWei = (unit.hp >= unit.maxHp);
            const newMaxHpWei = Math.min(unit.maxHp + healWei, unit._baseMaxHp * 2);
            const hpDeltaWei = newMaxHpWei - unit.maxHp;
            unit.maxHp = newMaxHpWei;
            unit._baseMaxHp = Math.max(unit._baseMaxHp, newMaxHpWei);
            unit.hp = Math.min(unit.hp + hpDeltaWei, unit.maxHp);
            if (wasFullHpWei) {
                unit.hp = unit.maxHp;
            }
            unit.healDone += healWei;
            unit.leechDone += healWei;
            emitEvent(unit, 'hp-change', {
                hp: unit.hp,
                maxHp: unit.maxHp,
                alive: unit.alive,
                atk: unit.atk,
                def: unit.def
            });
            group.entries.push({
                type: 'info',
                text: `<span class="green">🦇 韦一笑吸血+${healWei}，上限→${Math.floor(unit.maxHp)}</span>`,
                isHealEntry: true,
                healAmount: healWei,
                healUnitUid: unit.uid
            });
        }
    };
}

function emitEvent(unit, eventType, payload) {
    if (typeof window._emitEvent === 'function') {
        window._emitEvent(unit, eventType, payload);
    }
}