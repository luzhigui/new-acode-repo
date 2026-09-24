// core/07-target-strategies.js
// V1.0.0 | ~2400 bytes | 2026-09-24 默认选敌策略注册表：从 core/12 selectAttackTarget 抽出的三分支
// 与 registerDodgeRule 同模式：策略按注册顺序跑，第一个非 null 胜出。
// 声明层（BEFORE_SELECT_TARGET）优先于本表——声明给出 targetResult 时根本不会进本表。
export const VER = 'core/07-target-strategies.js V1.0.0';

import { getFronts } from './03battle-utils.js';
import { ROLE_TYPES } from '../infra/56-battle-enums.js';

const _strategies = [];

// 注册一条默认选敌策略。
// fn(unit, validTargets, ctx) => { target } | { abort: true } | null
//   { target }      = 命中，选它
//   { abort: true } = 主动放弃本次选敌（如近战无前排），不走后续兜底
//   null            = 本策略不适用，继续下一条
export function registerTargetStrategy(fn) {
    if (typeof fn !== 'function') {
        throw new Error('[07-target-strategies] registerTargetStrategy: fn 必须是函数');
    }
    _strategies.push(fn);
}

// 按注册顺序跑，返回第一个非 null 结果；全部不适用时返回 null
export function runTargetStrategies(unit, validTargets, ctx) {
    for (const fn of _strategies) {
        const r = fn(unit, validTargets, ctx);
        if (r) return r;
    }
    return null;
}

// —— 默认策略（顺序敏感：飞行 → 近战 → 兜底随机，与原 core/12 三分支同序）——

// 飞行：低血优先 → 前排 → 随机
registerTargetStrategy((unit, validTargets, ctx) => {
    if (unit.role !== ROLE_TYPES.FLYER) return null;
    const rng = ctx.rng;
    const lowHpTargets = validTargets.filter(u => u.hp / u.maxHp < 0.4);
    if (lowHpTargets.length > 0) {
        return { target: lowHpTargets[rng.nextInt(0, lowHpTargets.length - 1)] };
    }
    const fronts = getFronts(validTargets);
    if (fronts.length > 0) {
        return { target: fronts[rng.nextInt(0, fronts.length - 1)] };
    }
    return { target: validTargets[rng.nextInt(0, validTargets.length - 1)] };
});

// 近战 / 拒马：打前排；无前排则主动放弃（不走兜底）
registerTargetStrategy((unit, validTargets, ctx) => {
    if (!ctx.isMelee) return null;
    const fronts = getFronts(validTargets);
    if (fronts.length === 0) return { abort: true };
    return { target: fronts[ctx.rng.nextInt(0, fronts.length - 1)] };
});

// 兜底：全随机
registerTargetStrategy((unit, validTargets, ctx) => {
    return { target: validTargets[ctx.rng.nextInt(0, validTargets.length - 1)] };
});