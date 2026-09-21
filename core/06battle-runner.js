// core/06battle-runner.js — 无头整局跑（headless full-battle runner）
// V1.0.0 | 2026-09-21 抽出「跑完一整局」外循环，收口 tools/101、tools/116(×3)、tools/110 四处重复
//
// ⚠️⚠️ 三条死守（防止 UI 提前剧透 / 演出错序）——改本文件前先把这三条读完 ⚠️⚠️
//
//   1. 只给无头场景用。消费方仅限 tools/ 批量模拟与 tests/ 体检。
//      【禁止 player/42 或任何带画面的路径 import】。带画面的播放必须继续走
//      createRoundStepper 逐步推进：每一步停下来播特效、念日志、等"下一回合"按钮。
//      本函数一口气跑到分出胜负，产出的是【一局已结束后的完整记录】——
//      拿它去驱动播放，等于把所有演出压成一帧，画面在日志之前就全落完了（这就是剧透）。
//
//   2. 本文件不做任何 UI / store / DOM 写入。不 dispatch battleStore、不调
//      GlobalStore.setUIHandler、不碰 document。引擎自身在 createRoundStepper 内部
//      已经做的事（clearAll、currentBattleState 等）不属于本文件职责，不在此追加。
//      将来若要把结果呈现到界面：先跑完，再由【调用方】决定怎么呈现，不在本文件里做。
//
//   3. 产出的 facts 是【给机器用的类型序列】，不是给渲染层消费的 fact 对象。
//      要渲染的 fact 走 createRoundStepper 的 ui / translateFacts 参数，本文件不生成、
//      也不应该被拿去生成。

import { createRoundStepper } from './11battle-round.js';
import { SeededRNG } from '../infra/51-core-utils.js';

/**
 * 跑完一整局（无头）。
 *
 * @param {Object}   o
 * @param {Unit[]}   o.ally          明教侧初始阵容（内部会 clone，不改原数组）
 * @param {Unit[]}   o.enemy         六大派侧初始阵容（同上）
 * @param {number}   o.seed          随机种子（决定同 seed 同结果）
 * @param {number}   [o.maxRounds]   回合上限，默认 CONFIG.MAX_ROUND=35
 * @param {Array}    [o.initialBuffs] 开局 buff 列表，默认空
 * @param {Function} [o.hexPicker]   每 hexInterval 回合补一个 buff 的回调：(activeBuffs, allySide, rng) => buff|null
 *                                   传 null 表示本局不补海克斯（裸机基线）
 * @param {number}   [o.hexInterval] 补海克斯的间隔，默认 3
 * @param {string}   [o.firstSide]   先手阵营，默认引擎规则（'ally' | 'enemy'）
 * @param {boolean}  [o.collectFacts] 是否收集 factType 序列，默认 false
 * @param {Function} [o.onRoundEnd]  回合结束回调：(ctx) => void，ctx 见下。供调用方记账（如收集选了哪些海克斯）
 * @returns {{ winner:string|null, ally:Unit[], enemy:Unit[], rounds:number, facts:string[], meta:any }}
 *          winner 为 null = 到达回合上限仍未分出胜负
 */
export function runBattle(o) {
    const {
        ally, enemy, seed,
        maxRounds = 35,
        initialBuffs = [],
        hexPicker = null,
        hexInterval = 3,
        firstSide = null,
        collectFacts = false,
        onRoundEnd = null
    } = o || {};

    const facts = [];
    const rng = new SeededRNG(seed);

    // 初始状态：引擎的 createRoundStepper 会 clone 一份，这里给的就是"干净起点"
    let state = {
        ally: ally.map(u => u.clone()),
        enemy: enemy.map(u => u.clone()),
        round: 1,
        activeBuffs: initialBuffs.map(b => ({ ...b })),
        allAllies: ally.map(u => u.clone()),
        _rng: rng
    };
    if (firstSide) state._firstSide = firstSide;

    let winner = null;
    let lastStep = null;
    let round = 1;

    for (; round <= maxRounds; round++) {
        const stepper = createRoundStepper(state, { ui: false });
        lastStep = null;
        for (const step of stepper) {
            lastStep = step;
            if (collectFacts && step.log) {
                for (const e of step.log) if (e && e.factType) facts.push(e.factType);
            }
            if (step.winner) break;
        }
        if (!lastStep) break;
        if (lastStep.winner) { winner = lastStep.winner; break; }

        // 下一回合的起点：引擎回传的 A/B 就是权威
        // 注意：不再手工搬 allAllies —— createRoundStepper 内部已自行与 ally 对齐（实测空操作）
        state.ally = lastStep.ally;
        state.enemy = lastStep.enemy;

        // buff 递减：以引擎回传的 _activeBuffs 为准（引擎在 finalizeRoundEnd 已递减过一轮）
        state.activeBuffs = (lastStep.ally._activeBuffs || [])
            .filter(b => b && b.remaining > 0)
            .map(b => ({ ...b }));

        // 补海克斯（可选）：按 hexInterval 间隔，用同一个 rng，保证同 seed 同序列
        let picked = null;
        if (hexPicker && hexInterval > 0 && state.round % hexInterval === 0) {
            picked = hexPicker(state.activeBuffs, lastStep.ally, rng);
            if (picked) state.activeBuffs.push(picked);
        }

        if (onRoundEnd) {
            try { onRoundEnd({ round: state.round, lastStep, activeBuffs: state.activeBuffs, picked, rng }); }
            catch (e) { console.error('[06battle-runner] onRoundEnd 回调出错:', e); }
        }

        state.round = round + 1;
    }

    return {
        winner,
        ally: (lastStep && lastStep.ally) || state.ally,
        enemy: (lastStep && lastStep.enemy) || state.enemy,
        rounds: round,
        facts,
        meta: { seed, maxRounds, firstSide: firstSide || null }
    };
}