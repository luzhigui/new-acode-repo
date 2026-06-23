// 07battle-engine-5v5-test.js - 光明顶对战 5v5 战斗引擎入口
// 版本: V1.0.26, 预估行数: 50
export const VER = '07battle-engine-5v5-test.js test V1.0.26';

// 补全所有子模块的函数导入
import { Unit } from './02unit.js';
import {
    rand, calcDamage, getFangLevel, isMelee,
    getFronts, isBlocked, getFlyDodgeRate,
    getRandomTaunt, getKillTaunt, getZhangNearTaunt,
    makeFXSnapshot, hasBuff, getUnitRow, getUnitCol,
    getAdjacentPositions, getActiveBuffs
} from './03battle-utils.js';
import {
    computeBuffStats,
    applyBuffEffectsBeforeAttack,
    applyBuffEffectsAfterAttack,
    logBuffSummary
} from './04buff-system.js';
import { spawnHorse, destroyHorse } from './05battle-horse.js';
import { runBattleRound, runBattle } from './06battle-engine-core.js';

// 子模块版本号
import { VER as VER_UNIT } from './02unit.js';
import { VER as VER_UTILS } from './03battle-utils.js';
import { VER as VER_BUFF } from './04buff-system.js';
import { VER as VER_HORSE } from './05battle-horse.js';
import { VER as VER_CORE } from './06battle-engine-core.js';

// 统一导出（main-5v5-test.js 需要通过这些名字引用）
export { Unit };
export { rand, calcDamage, getFangLevel, isMelee, getFronts, isBlocked, getFlyDodgeRate };
export { getRandomTaunt, getKillTaunt, getZhangNearTaunt, makeFXSnapshot };
export { hasBuff, getUnitRow, getUnitCol, getAdjacentPositions, getActiveBuffs };
export { computeBuffStats, applyBuffEffectsBeforeAttack, applyBuffEffectsAfterAttack, logBuffSummary };
export { spawnHorse, destroyHorse };
export { runBattleRound, runBattle };

export const ALL_VERS = {
    engine: VER,
    unit: VER_UNIT,
    utils: VER_UTILS,
    buff: VER_BUFF,
    horse: VER_HORSE,
    core: VER_CORE
};
window.isBlocked = isBlocked;