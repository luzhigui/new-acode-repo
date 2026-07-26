// ===== ../core/06battle-engine-core.js =====
// core/06battle-engine-core.js - 光明顶5v5 战斗核心入口
// V5.2.1 | ~22000 bytes | 2026-07-16 拆分攻击模块至47、回合模块至48
export const VER = 'core/06battle-engine-core.js V5.2.1';

import { CONFIG, DEF_TAUNT, HP_TAUNT } from './01config-5v5-test.js';
import { rand, calcDamage, getFangLevel, isMelee, getFronts, isBlocked, getFlyDodgeRate, getRandomTaunt, getZhangNearTaunt, makeFXSnapshot, hasBuff, getUnitCol, getUnitRow } from './03battle-utils.js';
import { Unit } from './02unit.js';

// 从共享模块导入
import {
    emitEvent,
    emitFullUnitState,
    finalizeDeaths,
    getNextAvailableUnit,
    checkZhangSwitch
} from './50battle-shared.js';

// 从攻击模块导入
import { processUnitAttack } from './47battle-attack.js';
import { calcAttackDamage, applyPostAttackEffects } from './49battle-attack-steps.js';

// 从回合模块导入
import { createRoundStepper, runBattleRound } from './48battle-round.js';

const C = CONFIG, DT = DEF_TAUNT, HT = HP_TAUNT;

// ==================== 重新导出 ====================
export {
    emitEvent,
    emitFullUnitState,
    finalizeDeaths,
    getNextAvailableUnit,
    checkZhangSwitch,
    calcAttackDamage,
    applyPostAttackEffects,
    processUnitAttack,
    createRoundStepper,
    runBattleRound
};