// modules/341-common-shield-steal.js — 武当张松溪·智取（普通兵机制）
// 规则：敌方（明教）任一单位获得护盾时，该次护盾减半，另一半转给场上的张松溪（进永久护盾 _permShield）。
// 说明：护盾写入点分散在 modules/319（寒离飒蓄力/九阳）与 core/216（通用九阳溢出）两处，
//       这里提供统一入口，写入点各调用一次；取不到 A/B 时原样返回，不影响原逻辑。
export const VER = 'modules/341-common-shield-steal.js V1.0.0';

import { CAMP_TYPES } from '../infra/106-battle-enums.js';

const STEALER_NAME = '张松溪';

/**
 * @param {object} unit   获得护盾的单位
 * @param {number} amount 本次获得护盾的数值
 * @param {Array}  A      明教方队伍
 * @param {Array}  B      六大派方队伍
 * @returns {number} 实际留给 unit 的护盾值（被偷走的部分已转给张松溪）
 */
export function stealShieldHalf(unit, amount, A, B) {
    if (!unit || !(amount > 0)) return amount;
    if (!Array.isArray(A) || !Array.isArray(B)) return amount;
    const foes = unit.camp === CAMP_TYPES.ALLY ? B : A;
    const thief = foes.find(u => u && u.alive && u.name === STEALER_NAME);
    if (!thief) return amount;
    const stolen = Math.floor(amount / 2);
    if (stolen <= 0) return amount;
    thief.state._permShield = (thief.state._permShield || 0) + stolen;
    return amount - stolen;
}
