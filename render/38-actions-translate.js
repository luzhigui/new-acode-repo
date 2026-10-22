// render/38-actions-translate.js — fact → stageAction 翻译器入口（翻译域）
// V1.4.0 | 2026-10-13 | ~3700 bytes
// 加新 fact 的舞台动作：在对应族文件 FACT_TRANSLATORS 加一条（键=factType），
// 并在 infra/58 的 translateFn 登记函数名；漏加会在本文件末尾校验循环里报错。
import { STAGE_ACTION_TYPES, FACT_TYPES } from '../infra/56-battle-enums.js';
import { FACT_SPECS } from '../infra/58-fact-contract.js';
import { ATTACK_TRANSLATORS } from './38-actions-translate-attack.js';
import { HEAL_TRANSLATORS } from './38-actions-translate-heal.js';
import { CONTROL_TRANSLATORS } from './38-actions-translate-control.js';
import { STAT_TRANSLATORS } from './38-actions-translate-stat.js';
export const VER = 'render/38-actions-translate.js V1.4.0';

// 把 fact 列表翻译成舞台动作；导演只读 stageActions；timing=beforeText/afterText
export function translateFactsToStageActions(log) {
    const actions = [];
    for (let i = 0; i < log.length; i++) {
        const entry = log[i];
        if (!entry || !entry.factType) continue;
        const made = translateFact(entry, i);
        if (Array.isArray(made)) actions.push(...made.filter(Boolean));
        else if (made) actions.push(made);
    }
    return actions;
}

// 合成总表：四个 fact 族文件各出一张子表，键=factType（互不重叠），本文件补回合族三条
const FACT_TRANSLATORS = {
    ...ATTACK_TRANSLATORS,
    ...HEAL_TRANSLATORS,
    ...CONTROL_TRANSLATORS,
    ...STAT_TRANSLATORS,
    [FACT_TYPES.ROUND_START]: (data, index) => ({ kind: STAGE_ACTION_TYPES.ROUND_START, round: data.round, factIndex: index, timing: 'beforeText' }),
    [FACT_TYPES.ROUND_END]: (data, index) => ({ kind: STAGE_ACTION_TYPES.ROUND_END, round: data.round, factIndex: index, timing: 'afterText' }),
    [FACT_TYPES.PASS]: (data, index) => {
        const actions = [{
            kind: STAGE_ACTION_TYPES.REST,
            actorUid: data.unit?.uid ?? data.unitUid ?? null,
            reason: data.reason,
            factIndex: index,
            timing: 'beforeText'
        }];
        if (data.actualHeal > 0) {
            actions.push({
                kind: STAGE_ACTION_TYPES.HEAL,
                actorUid: data.unit?.uid ?? data.unitUid ?? null,
                targetUid: data.unit?.uid ?? data.unitUid ?? null,
                amount: data.actualHeal,
                factIndex: index,
                // 必须显式 afterText：HEAL 的 timing 函数只认 afterText，写 beforeText 会被当 anchor 且无 fxAnchors → 静默丢弃
                timing: 'afterText'
            });
        }
        return actions;
    }
};

// 校验：FACT_SPECS 中声明了 translateFn 的 factType 必须在 FACT_TRANSLATORS 里有对应条目，
// 漏加会立即报错，不会静默丢特效
for (const type of Object.keys(FACT_SPECS)) {
    const spec = FACT_SPECS[type];
    if (spec.translateFn && !FACT_TRANSLATORS[type]) {
        console.error(`[31] 缺翻译器: ${type}（${spec.translateFn}）`);
    }
}

function translateFact(entry, index) {
    const { factType, data } = entry;
    const translator = FACT_TRANSLATORS[factType];
    return translator ? translator(data, index) : null;
}
