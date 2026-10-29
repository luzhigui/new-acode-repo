// core/12battle-attack-steps.js — 攻击流程入口（装配 + 出口）
export const VER = 'core/12battle-attack-steps.js V7.0.0';

import { CONFIG } from './01config-5v5-test.js';
import { registerDodgeRule } from './20-registry-dodge.js';
import { ROLE_TYPES } from '../infra/56-battle-enums.js';

registerDodgeRule((unit, attacker) => {
    if (unit.role === ROLE_TYPES.FLYER) return CONFIG.BASE_DODGE_FLY || 0.15;
    return 0;
});

registerDodgeRule((unit, attacker) => {
    if (unit.role !== ROLE_TYPES.FLYER) return CONFIG.BASE_DODGE_GROUND || 0.05;
    return 0;
});

// 攻击链主干：selectAttackTarget / resolveAttackHit / calcFinalDamage / applyAttackResult / buildAttackGroup / resolveDodgeEffects
export * from './12battle-attack-chain.js';
// 边裁与纯工具：computeDodgeChance / snapshotUnitForFact / resolveDamageImmune / resolveAfterDamageEffects / resolveDeaths / isUnitStunned
export * from './12battle-attack-edge.js';