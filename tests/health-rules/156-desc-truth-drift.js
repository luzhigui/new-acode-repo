// 回归规则：技能说明数字 == 引擎真值（参数「单一真值源」守卫）
//   背景：content/200game-data.json 的 skills.<键>.params 曾与 characters.<角色>.mechanics 各存一份
//   同一个数 —— 技能说明的 {占位符} 从 params 取、引擎战斗从 mechanics 读，改一处另一处不跟，
//   面板数字与实战就会漂移。2026-09-29 收口：真值只在 mechanics，技能说明里的这些占位符由
//   core/01config-5v5-test.js 的 DESC_TRUTH 查表取真值，params 里的死副本已整批删除。
//
// 判据：对 DESC_TRUTH 里每个 (角色, 技能, 占位符)，从 mechanics 求真值文本，断言 getSkillDesc()
//   渲染出的说明文字里**确实含这个数字**；真值取不到（登记了却查不到）也报红。
//   一句话：说明里写的数，必须就是引擎真正读的那个数。
//
// 为什么挂这里：DESC_TRUTH 是手写映射，与 content 的 mechanics 结构可能各自演化；本规则把它变成
//   机器可校验的事实，并接进 tests/param-read-guard.mjs（改 content/core 时立刻发现漂移）。
// 误报规避：只在 gameData 已加载时才有意义（规则回放器开跑前已 loadGameData）；此规则与战报无关，
//   不依赖 log，恒返回 pass/fail（不会恒 skip 空转）。
export const VER = 'tests/health-rules/156-desc-truth-drift.js V1.0.0';
import { getSkillDesc, resolveDescValue, DESC_TRUTH } from '../../core/01config-5v5-test.js';

/**
 * 检查「技能说明数字 == 引擎真值」。
 * @returns {string[]} 冲突描述列表；[] 表示全部一致。供本规则与 param-read-guard 共用。
 */
export function checkDescTruth() {
    const problems = [];
    for (const skillKey of Object.keys(DESC_TRUTH)) {
        const entry = DESC_TRUTH[skillKey];
        const character = entry.character;
        const desc = getSkillDesc(character, skillKey);
        if (!desc) { problems.push('取不到技能说明：' + character + '.' + skillKey + '（gameData 未加载或键名有误）'); continue; }
        for (const key of Object.keys(entry.fields)) {
            const truth = resolveDescValue(character, skillKey, key);
            if (truth === undefined) {
                problems.push('真值缺失：' + character + '.' + skillKey + '.{' + key + '}（mechanics 里查不到对应字段）');
                continue;
            }
            if (desc.indexOf(truth) === -1) {
                problems.push('说明与真值不符：' + character + '.' + skillKey + ' 说明里应含「' + truth
                    + '」（来自 mechanics），实为「' + desc + '」');
            }
        }
    }
    return problems;
}

export const rule156 = {
    group: '数值回归',
    name: '技能说明数字==引擎真值(单源守卫)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        const problems = checkDescTruth();
        if (problems.length === 0) return { fail: false };
        return { fail: true, msg: '复发：' + problems[0] };
    }
};
