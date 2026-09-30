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
//
// V1.1.0（2026-09-30）：新增第二条全量判据 checkDescHygiene()——遍历 content 里**所有角色的所有技能**，
//   逐个渲染（有 descJealous 的额外渲染强化档）后抓两类「面板会漏到人眼前」的事故：
//     ① 未替换占位符：渲染结果里仍残留 {...} 形态。根因是 core/01 的替换正则 /\{([\w.]+)\}/g 只吃
//        [\w.]（字母数字下划线点），遇到 {hpThresholds[0]} / {a-b} 这类**根本不会替换**，原样漏到面板。
//        → 判残留用宽松表达式 /\{[^}\s]*\}/ 扫，不照抄那个替换正则（照抄就永远抓不到）。
//     ② 百分数未换算：渲染结果里出现「<1 的小数紧跟 %」（典型 0.8%）。参数已统一按「1 = 100%」存，
//        面板若还印 0.xx% 说明该占位符没进 PCT_PARAM_KEYS 白名单、也没走 DESC_TRUTH。
//        → 表达式 /(?<![\d.])(\d*\.\d+)\s*%/，负向后顾避免把 12.5% 切出「2.5%」误报，且只报 <1 的数。
//   反例（有意不报，已实跑确认）：灭绝师太「反击」的 {dmgRatio}=0.6 是**倍率**，模板里后面没有 %，
//     渲染成「伤害×0.6」，本判据不命中。
//   该判据与战报无关、不依赖 log，恒返回 pass/fail（不会恒 skip）。
export const VER = 'tests/health-rules/156-desc-truth-drift.js V1.1.0';
import { getSkillDesc, resolveDescValue, DESC_TRUTH, getGameData } from '../../core/01config-5v5-test.js';

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

// 残留占位符：宽松扫描（替换正则 /\{([\w.]+)\}/g 匹配不到的形态正是本判据要抓的，故不照抄它）
const RESIDUAL_PLACEHOLDER = /\{[^}\s]*\}/;
// 「<1 的小数 + %」（如 0.8%）：负向后顾排除 12.5% 这类，被切出「2.5%」的误报；数值再判 <1
const SMALL_PCT = /(?<![\d.])(\d*\.\d+)\s*%/g;

/**
 * 全量技能说明「卫生」扫描：遍历 gameData 所有角色所有技能，渲染说明后抓两类事故。
 *   ① 未替换占位符（/{...}/ 残留）② 百分数未换算（0.xx% 形态）。
 * @returns {string[]} 问题描述列表；[] 表示全部干净。与战报无关，恒有结论（不 skip）。
 */
export function checkDescHygiene() {
    const problems = [];
    const gd = getGameData();
    if (!gd || !gd.characters) return ['取不到 gameData.characters（gameData 未加载，无法扫描技能说明）'];
    for (const characterName of Object.keys(gd.characters)) {
        const skills = gd.characters[characterName].skills || {};
        for (const skillKey of Object.keys(skills)) {
            const skill = skills[skillKey];
            if (!skill || !skill.desc) continue;
            // 非强化档必渲染；有 descJealous 的额外渲染一次强化档
            const jealousLevels = skill.descJealous ? [false, true] : [false];
            for (const jealous of jealousLevels) {
                const text = getSkillDesc(characterName, skillKey, jealous);
                if (!text) continue;
                const tag = characterName + '.' + skillKey + (jealous ? '(强化档)' : '');
                const rm = text.match(RESIDUAL_PLACEHOLDER);
                if (rm) problems.push('未替换占位符：' + tag + ' 残留 ' + rm[0]);
                SMALL_PCT.lastIndex = 0;
                let pm;
                while ((pm = SMALL_PCT.exec(text)) !== null) {
                    if (!(parseFloat(pm[1]) < 1)) continue;
                    problems.push('百分数未换算：' + tag + ' 出现 ' + pm[0].replace(/\s+/g, ''));
                }
            }
        }
    }
    return problems;
}

export const rule156 = {
    group: '数值回归',
    name: '技能说明数字==引擎真值(单源守卫)',
    test: function(ctx, log, beforeA, beforeE, afterA, afterE) {
        const problems = checkDescTruth().concat(checkDescHygiene());
        if (problems.length === 0) return { fail: false };
        return { fail: true, msg: '复发：' + problems[0] };
    }
};
