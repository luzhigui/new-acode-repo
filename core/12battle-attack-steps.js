// core/12battle-attack-steps.js — 攻击流程入口（装配 + 出口）
// V7.0.0 | ~1400 bytes | 2026-10-18 拆分（纯搬移，零行为改动）：
//   本文件此前 642 行 / 32.5KB，把攻击链主干（选敌/命中/伤害/应用/构建 + 闪避效果）与边裁工具
//   （快照/闪避概率/免疫/后置效果/死亡结算）挤在一起。按 42/32/35 同款「父号 + 语义后缀」拆成两半：
//     · 12battle-attack-chain.js  攻击链主干（6 件，数据连续流转）
//     · 12battle-attack-edge.js   边裁与纯工具（6 件，常被外部单独 import）
//   本文件只做装配与转出口 + 顶部两条基础闪避规则注册：
//   外部 import 点零改动——core/10 的 8 个函数、core/11 的 resolveDeaths、modules/26-tangwenliang 的
//   computeDodgeChance/snapshotUnitForFact 全部仍从本文件取。
// ── 更早版本历史见 记录-更改履历.md
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