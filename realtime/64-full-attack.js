// realtime/64-full-attack.js - 光明顶5v5 完整攻击流程
// V4.0.3 | ~4932 bytes | 2026-07-05
export const VER = 'realtime/64-full-attack.js V4.0.3';

import { rand, calcDamage } from './62-test-utils.js';

/**
 * 选择目标（简化版，不含精英技能的特殊选敌逻辑）
 */
function selectTarget(attacker, defenders) {
    const alive = defenders.filter(u => u.alive);
    if (alive.length === 0) return null;
    // 近战优先打前排，这里简单随机
    return alive[Math.floor(Math.random() * alive.length)];
}

/**
 * 判断是否未命中
 */
function isMiss(unit) {
    if (unit.isWei) return false;
    if (unit.role === '远程' || unit.role === '飞行') {
        return Math.random() <= 0.05;
    }
    return false;
}

/**
 * 闪避判定（简化版，不含韦一笑特殊闪避和Buff闪避）
 */
function isDodge(unit) {
    if (unit.role === '飞行') return Math.random() <= 0.15;
    return false;
}

/**
 * 获取防战K值（硬编码简化版，和旧配置一致）
 */
function getFangLevel(def, m) {
    const levels = [0.244, 0.264, 0.279, 0.292, 0.306, 0.322, 0.342, 0.373, 0.445, 0.520];
    const k = [0, 0.02, 0.04, 0.07, 0.10, 0.14, 0.19, 0.28, 0.50, 1.00, 2.50];
    const ratio = def / m;
    for (let i = levels.length - 1; i >= 0; i--) {
        if (ratio >= levels[i]) return k[i + 1] ?? k[k.length - 1];
    }
    return k[0];
}

/**
 * 核心：执行一次完整的攻击
 * 包含了旧引擎中的目标选择、伤害计算、连锁反应等所有逻辑
 */
export function performFullAttack(store, attackerUid, targetUid) {
    const state = store.getState();
    const attacker = state.units.find(u => u.uid === attackerUid);
    const target = state.units.find(u => u.uid === targetUid);

    if (!attacker || !target) return { success: false };
    if (!attacker.alive || !target.alive) return { success: false };

    const log = [];

    // 1. 目标选择（如果未指定，则自动选择）
    if (!targetUid) {
        const defenders = state.units.filter(u => u.camp !== attacker.camp);
        const defender = selectTarget(attacker, defenders);
        if (!defender) return { success: false };
        targetUid = defender.uid;
    }

    // 2. 未命中
    if (isMiss(attacker)) {
        log.push(`未命中！`);
        return { success: true, isMiss: true, log };
    }

    // 3. 计算攻击和防御波动
    const atkVar = rand(0, 6);
    const defVar = rand(0, 4);
    const atkAct = attacker.atk + atkVar;
    const defAct = target.def + defVar;

    // 4. 计算伤害
    let dmg;
    if (attacker.role === '防战') {
        // 防战K值破防
        const displayDef = attacker.def; // 简化，不含Buff
        const m = 100; // 简化M值
        const lv = getFangLevel(displayDef, m);
        const k = [0, 0.02, 0.04, 0.07, 0.10, 0.14, 0.19, 0.28, 0.50, 1.00, 2.50][lv];
        const penPart = calcDamage(atkAct, defAct);
        dmg = Math.floor(penPart + displayDef * k + attacker.maxHp * 0.01);
    } else {
        dmg = Math.floor(calcDamage(atkAct, defAct));
    }

    // 5. 应用伤害
    const newHp = Math.max(0, target.hp - dmg);
    const isDead = newHp <= 0;

    store.dispatch({
        type: 'APPLY_DAMAGE',
        payload: {
            unitId: target.uid,
            attackerId: attacker.uid,
            newHp,
            isDead,
            dmgDealt: (attacker.dmgDealt || 0) + dmg,
            dmgTaken: (target.dmgTaken || 0) + dmg
        }
    });

    if (isDead) {
        store.dispatch({ type: 'UNIT_DIED', payload: { unitId: target.uid } });
    }
    log.push(`${attacker.name} 对 ${target.name} 造成了 ${dmg} 点伤害，${target.name}血量 ${target.hp} → ${newHp}${isDead ? ' (阵亡)' : ''}`);

    // 6. 连锁反应：九阳神功
    if (attacker.isZhang && attacker.camp === 'ally' && attacker.alive) {
        const heal = Math.floor(attacker.maxHp * 0.05);
        const newAttackerHp = Math.min(attacker.maxHp, attacker.hp + heal);
        store.dispatch({
            type: 'APPLY_HEAL',
            payload: { unitId: attacker.uid, newHp: newAttackerHp }
        });
        log.push(`九阳神功为张无忌回复了 ${heal} 点生命。`);
    }

    // 7. 连锁反应：韦一笑吸血
    if (attacker.isWei && attacker.camp === 'ally' && !isDead) {
        const heal = Math.floor(dmg * 0.15);
        const newMaxHp = attacker.maxHp + heal;
        const newHp = Math.min(attacker.hp + heal, newMaxHp);
        store.dispatch({
            type: 'APPLY_HEAL',
            payload: { unitId: attacker.uid, newHp, newMaxHp }
        });
        log.push(`韦一笑吸血，生命上限变为 ${newMaxHp}。`);
    }

    return { success: true, isDead, log };
}