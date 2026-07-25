// modules/91elite-xiaozhao-brother.js - 小昭·妹精英组件
// V5.2.0 | ~1200 bytes | 2026-07-25
export const VER = 'modules/91elite-xiaozhao-brother.js V5.2.0';

import { ROLE_BONUS } from '../core/02unit.js';
import { rand } from '../core/03battle-utils.js';

function emitEvent(unit, eventType, payload) {
    if (typeof window._emitEvent === 'function') {
        window._emitEvent(unit, eventType, payload);
    }
}

export function createXiaoZhaoBrotherComponent() {
    return {
        name: '小昭·妹',

        /**
         * 受到致命伤害后：飞天免疫判定
         * 返回 true 表示免疫了本次伤害
         */
        onBeforeDeath(unit, incomingDmg, A, log) {
            if (!unit.isXiaoZhaoBrother || !unit.alive || unit._spiderFlying || unit._flyMode === 'spider') return false;

            const hpBefore = unit.hp;
            const hpAfter = incomingDmg !== undefined ? hpBefore - incomingDmg : hpBefore;
            const maxHp = unit.maxHp;
            let reason = '';

            if (!unit._spiderTriggered70 && hpBefore > maxHp * 0.7 && hpAfter <= maxHp * 0.7) {
                reason = '血量即将低于70%';
                unit._spiderTriggered70 = true;
            } else if (!unit._spiderTriggered40 && hpBefore > maxHp * 0.4 && hpAfter <= maxHp * 0.4) {
                reason = '血量即将低于40%';
                unit._spiderTriggered40 = true;
            } else if (!unit._spiderTriggeredDeath && hpAfter <= 0) {
                reason = '即将阵亡';
                unit._spiderTriggeredHit = true;
            }

            if (!reason) return false;

            unit._spiderRemaining = (unit._spiderRemaining || 3) - 1;
            unit._spiderFlying = true;
            unit._flyMode = 'spider';
            unit._spiderAttacked = unit._acted;
            emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _flyMode: 'spider', _spiderFlying: true });

            log.push({ type:'info', text:`<span class="gold">🕷️ 飞天：${unit.name} ${reason}，免疫本次攻击的 ${incomingDmg || 0} 点伤害，化为蜘蛛遁走！剩余次数：${unit._spiderRemaining}</span>` });
            return true;
        },

        /**
         * 攻击命中后：蛛变精通 + 血上限成长
         */
        onAfterApplyDamage(unit) {
            if (!unit.isXiaoZhaoBrother || !unit.alive) return;

            // 蛛变由回合开始逻辑处理（spiderTransform），这里只处理精通加成
            const masteryCount = unit._masteredRoles?.length || 0;
            const extra = masteryCount >= 4 ? 1 : 0;
            const atkBonus = (masteryCount + extra) * 1.5;
            const defBonus = (masteryCount + extra) * 2;
            // 精通加成在 computeButterflyMastery 中计算，此处仅触发刷新
        }
    };
}