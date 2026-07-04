// realtime/03-attack-steps.js - 光明顶5v5 攻击步骤函数
// V1.0.0 | 2026-07-04 基于新架构的攻击流程，状态变更全部通过 dispatch
export const VER = 'realtime/03-attack-steps.js V1.0.0';

import { rand, calcDamage } from './04-test-utils.js';

/**
 * 执行一次完整攻击
 * 
 * @param {object} store - 状态仓库（{ dispatch, getState }）
 * @param {string} attackerUid - 攻击者 uid
 * @param {string} defenderUid - 被攻击者 uid
 * @returns {object} { success: boolean, dmg: number, isDead: boolean }
 */
export function executeAttack(store, attackerUid, defenderUid) {
    const state = store.getState();
    const attacker = state.units.find(u => u.uid === attackerUid);
    const defender = state.units.find(u => u.uid === defenderUid);

    if (!attacker || !defender) return { success: false, dmg: 0, isDead: false };
    if (!attacker.alive || !defender.alive) return { success: false, dmg: 0, isDead: false };

    // 1. 判定未命中（远程/飞行 5%）
    if (!attacker.isWei && (attacker.role === '远程' || attacker.role === '飞行')) {
        if (rand(1, 100) <= 5) {
            console.log(`[ATTACK] ${attacker.name} 未命中 ${defender.name}`);
            return { success: true, dmg: 0, isDead: false, isMiss: true };
        }
    }

    // 2. 计算伤害（简化版，不含 Buff 加成和防战K值）
    const atkAct = attacker.atk + rand(0, 6);  // 攻击波动 0-6
    const defAct = defender.def + rand(0, 4);  // 防御波动 0-4
    const raw = calcDamage(atkAct, defAct);
    const dmg = Math.floor(raw);
    const newHp = Math.max(0, defender.hp - dmg);
    const isDead = newHp <= 0;

    // 3. 应用伤害
    store.dispatch({
        type: 'APPLY_DAMAGE',
        payload: {
            unitId: defenderUid,
            attackerId: attackerUid,
            newHp,
            isDead,
            dmgDealt: (attacker.dmgDealt || 0) + dmg,
            dmgTaken: (defender.dmgTaken || 0) + dmg
        }
    });

    // 4. 判定击杀
    if (isDead) {
        store.dispatch({
            type: 'UNIT_DIED',
            payload: { unitId: defenderUid }
        });
    }

    console.log(`[ATTACK] ${attacker.name} → ${defender.name}，伤害 ${dmg}，HP ${defender.hp} → ${newHp}${isDead ? ' 💀阵亡' : ''}`);

    return { success: true, dmg, isDead, isMiss: false };
}