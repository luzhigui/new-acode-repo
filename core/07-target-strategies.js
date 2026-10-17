// core/07-target-strategies.js
// V1.2.0 | ~3500 bytes | 2026-10-17 新增「标枪」选敌分支（唐文亮·弱精英重做）：中程投射，按自身行段取对方射程内
//   目标（4~6 号位 → 对方 1~6；7~9 号位 → 对方 1~3），射程内无人则主动放弃（休息）；
//   射程表来自 content roles.标枪.rangeByRow（数据驱动，站位与射程同源）。分支注册在兜底之前。
// V1.1.0 | ~3100 bytes | 2026-10-13 新增候选池过滤器注册面 registerTargetPoolFilter（飞行分支取目标前依次过滤）：
//   杨逍「排除已点穴/截脉的敌人」用——通用飞行分支本身不动，过滤只由模块侧注册的过滤器决定
// V1.0.0 | 2026-09-24 默认选敌策略注册表：从 core/12 selectAttackTarget 抽出的三分支
// 与 registerDodgeRule 同模式：策略按注册顺序跑，第一个非 null 胜出。
// 声明层（BEFORE_SELECT_TARGET）优先于本表——声明给出 targetResult 时根本不会进本表。
export const VER = 'core/07-target-strategies.js V1.2.0';

import { getFronts } from './03battle-utils.js';
import { getGameData } from './01config-5v5-test.js';
import { ROLE_TYPES } from '../infra/56-battle-enums.js';

const _strategies = [];
const _poolFilters = [];

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

// 注册一条候选池过滤器（模块侧）。
// fn(unit, candidates, ctx) => 数组 | null
//   返回非空数组 = 用这个池替换候选；返回 null / 空数组 = 不干预（保持原池）。
//   过滤后为空同样不干预——设计口径「极端情况候选全被排除时照默认照打」。
export function registerTargetPoolFilter(fn) {
    if (typeof fn !== 'function') {
        throw new Error('[07-target-strategies] registerTargetPoolFilter: fn 必须是函数');
    }
    _poolFilters.push(fn);
}

// 依次过所有过滤器；只有返回非空数组的才替换池
export function runTargetPoolFilters(unit, candidates, ctx) {
    let pool = candidates;
    for (const fn of _poolFilters) {
        const r = fn(unit, pool, ctx);
        if (Array.isArray(r) && r.length > 0) pool = r;
    }
    return pool;
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

// 飞行：低血优先 → 前排 → 随机（池先过模块侧过滤器：杨逍排除已点穴/截脉的敌人）
registerTargetStrategy((unit, validTargets, ctx) => {
    if (unit.role !== ROLE_TYPES.FLYER) return null;
    const rng = ctx.rng;
    const pool = runTargetPoolFilters(unit, validTargets, ctx);
    const lowHpTargets = pool.filter(u => u.hp / u.maxHp < 0.4);
    if (lowHpTargets.length > 0) {
        return { target: lowHpTargets[rng.nextInt(0, lowHpTargets.length - 1)] };
    }
    const fronts = getFronts(pool);
    if (fronts.length > 0) {
        return { target: fronts[rng.nextInt(0, fronts.length - 1)] };
    }
    return { target: pool[rng.nextInt(0, pool.length - 1)] };
});

// 近战 / 拒马：打前排；无前排则主动放弃（不走兜底）
registerTargetStrategy((unit, validTargets, ctx) => {
    if (!ctx.isMelee) return null;
    const fronts = getFronts(validTargets);
    if (fronts.length === 0) return { abort: true };
    return { target: fronts[ctx.rng.nextInt(0, fronts.length - 1)] };
});

// 标枪：中程投射——按自身行段取对方射程内目标（4~6 号位打对方 1~6，7~9 号位只打对方 1~3）；
//   射程内无人 → 主动放弃（休息，不走兜底）。射程表读 content roles.标枪.rangeByRow（数据驱动）
registerTargetStrategy((unit, validTargets, ctx) => {
    if (unit.role !== ROLE_TYPES.JAVELIN) return null;
    const rowKey = unit.pos >= 7 ? 'back' : 'mid';
    const range = getGameData()?.roles?.[ROLE_TYPES.JAVELIN]?.rangeByRow?.[rowKey] || [];
    const pool = validTargets.filter(t => range.includes(t.pos));
    if (pool.length === 0) return { abort: true };
    return { target: pool[ctx.rng.nextInt(0, pool.length - 1)] };
});

// 兜底：全随机
registerTargetStrategy((unit, validTargets, ctx) => {
    return { target: validTargets[ctx.rng.nextInt(0, validTargets.length - 1)] };
});