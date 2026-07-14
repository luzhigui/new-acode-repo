// core/07battle-engine-5v5-test.js - 光明顶5v5 战斗引擎入口
// V5.0.1 | ~2752 bytes | 2026-07-05
export const VER = 'core/07battle-engine-5v5-test.js V5.0.1';

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

// 特效函数
import { showRangedArrow, showSplashArrows } from '../fx/16fx-arrows-5v5-test.js';
import { showMeleeCrash, showMeleeDodge, showMeleeMiss } from '../fx/17fx-crash-5v5-test.js';
import { animatePositionSwap } from '../fx/18fx-position-swap.js';
import { animatePushBack, animatePushSwap } from '../fx/19fx-push-back.js';
import { showDodgeBulletTime } from '../fx/20fx-dodge-bullet.js';

// 精英技能函数
import {
    checkExtinctionCounter,
    checkNineYinClaw,
    getRebelTarget,
    getRebelDmgBonus,
    getRebelTrueDmg,
    getPhantomThunderBonus,
    applyXuanmingPalm,
    tickXuanmingPoison,
    getHornStrikeBonus,
    checkKuLian,
    applyXingFenGrant,
    applyXinHunDeduction,
    tickKuaiLeHeal,
    canXingFenTrigger,
    consumeXingFen,
    applyDamageModifiers
} from '../modules/23elite-skills.js';

// Buff UI 函数（海克斯弹窗）
import { showBuffPopup } from '../player/09player-buff-ui.js';

// 子模块版本号
import { VER as VER_UNIT } from './02unit.js';
import { VER as VER_UTILS } from './03battle-utils.js';
import { VER as VER_BUFF } from './04buff-system.js';
import { VER as VER_HORSE } from './05battle-horse.js';
import { VER as VER_CORE } from './06battle-engine-core.js';

// ===================== 原有导出 (保持不变) =====================
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
window.ALL_VERS = ALL_VERS;