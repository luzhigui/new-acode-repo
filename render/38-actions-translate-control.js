// render/38-actions-translate-control.js — fact → stageAction 翻译器·控制位移族（38 拆分）
// V1.0.1 | 2026-10-21 惑心换位补飘字：MIND_CONTROL_SWAP 由单动作改动作数组，按 data.dmg / data.heal
//          增发 DAMAGE_FLOAT / HEAL（afterText）
// V1.0.0 | ~5300 bytes | 2026-10-13 从 render/38-actions-translate.js 纯搬移：免疫/换位/击退/眩晕/变身/
//          飞行态（蛛化·蝶变）类 FACT_TRANSLATORS 条目，翻译逻辑零改动。表由 38 入口合成进 FACT_TRANSLATORS。
import { STAGE_ACTION_TYPES, FACT_TYPES, FLY_MODE_TYPES } from '../infra/56-battle-enums.js';
export const VER = 'render/38-actions-translate-control.js V1.0.1';

// 控制位移族翻译器表（键=factType）
export const CONTROL_TRANSLATORS = {
    [FACT_TYPES.IMMUNE]: (data, index) => {
        const actions = [{
            kind: STAGE_ACTION_TYPES.IMMUNE,
            actorUid: data.attacker?.uid ?? null,
            targetUid: data.target?.uid ?? null,
            factIndex: index,
            timing: 'beforeText'
        }];
        // 免疫附带 flyData（小昭·妹飞天）时，额外生成 FLY_MODE 特效动作
        if (data.flyData) {
            actions.push({
                kind: STAGE_ACTION_TYPES.FLY_MODE,
                actorUid: data.flyData.spiderUid ?? data.attacker?.uid ?? null,
                originalFactType: FLY_MODE_TYPES.SPIDER_FLY,
                factIndex: index,
                timing: 'beforeText'
            });
        }
        return actions;
    },
    [FACT_TYPES.MIND_CONTROL_BANNER]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.BANNER,
        text: '🌀 惑人心智',
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.MIND_CONTROL_SWAP]: (data, index) => {
        const acts = [{
            kind: STAGE_ACTION_TYPES.POS_SWAP,
            actorUid: data.unitA?.uid ?? null,
            targetUid: data.unitB?.uid ?? null,
            oldPosA: data.posA,
            oldPosB: data.posB,
            factIndex: index,
            timing: 'beforeText'
        }];
        if (data.dmg > 0) {
            acts.push({ kind: STAGE_ACTION_TYPES.DAMAGE_FLOAT, targetUid: data.unitA.uid, dmg: data.dmg, factIndex: index, timing: 'afterText' });
            acts.push({ kind: STAGE_ACTION_TYPES.DAMAGE_FLOAT, targetUid: data.unitB.uid, dmg: data.dmg, factIndex: index, timing: 'afterText' });
        }
        if (data.heal > 0) {
            acts.push({ kind: STAGE_ACTION_TYPES.HEAL, actorUid: data.unitA.uid, targetUid: data.unitA.uid, amount: data.heal, factIndex: index, timing: 'afterText' });
            acts.push({ kind: STAGE_ACTION_TYPES.HEAL, actorUid: data.unitB.uid, targetUid: data.unitB.uid, amount: data.heal, factIndex: index, timing: 'afterText' });
        }
        return acts;
    },
    [FACT_TYPES.WIND_ASSAULT_PUSH]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.PUSH,
        actorUid: data.target?.uid ?? null,
        targetUid: data.behindUnit?.uid ?? null,
        oldPos: data.oldPos,
        newPos: data.behindPos,
        behindOldPos: data.behindOldPos ?? null,
        label: data.label ?? null,
        factIndex: index,
        timing: 'beforeText'
    }),
    // 击退退无可退 → 眩晕（乘风突袭 / 胖远桥·年轻气盛共用）
    [FACT_TYPES.PUSH_STUN]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.STUN,
        actorUid: data.target?.uid ?? null,
        label: data.label ?? null,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.STUN_SKIP]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.STUN,
        actorUid: data.unit?.uid ?? null,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.ZHANG_SWITCH]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.TRANSFORM,
        actorUid: data.zhang?.uid ?? data.unitUid ?? null,
        danmaku: '不好，要顶上去了！',
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.SPIDER_TRANSFORM]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.TRANSFORM,
        actorUid: data.unitUid ?? data.zhang?.uid ?? null,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.SPIDER_FLY]: (data, index) => ({
        // 飞行类 fact（蛛化/蝶变）均由本表翻译为 FLY_MODE 动作，特效在 DEFS.FLY_MODE.fx 按 originalFactType 处理
        kind: STAGE_ACTION_TYPES.FLY_MODE,
        actorUid: data.spiderUid ?? data.unitUid ?? null,
        originalFactType: FLY_MODE_TYPES.SPIDER_FLY,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.SPIDER_RETURN]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.FLY_MODE,
        actorUid: data.spiderUid ?? data.unitUid ?? null,
        originalFactType: FLY_MODE_TYPES.SPIDER_RETURN,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.BUTTERFLY_ATTACH]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.FLY_MODE,
        actorUid: data.sisterUid ?? null,
        hostUid: data.hostUid ?? null,
        originalFactType: FLY_MODE_TYPES.BUTTERFLY_ATTACH,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.BUTTERFLY_RETURN]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.FLY_MODE,
        actorUid: data.sisterUid ?? null,
        hostUid: data.hostUid ?? null,
        originalFactType: FLY_MODE_TYPES.BUTTERFLY_RETURN,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.BUTTERFLY_HOST_DEAD]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.FLY_MODE,
        actorUid: data.unitUid ?? data.spiderUid ?? data.sisterUid ?? data.unit?.uid ?? null,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.BUTTERFLY_NO_HOST]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.FLY_MODE,
        actorUid: data.unitUid ?? data.spiderUid ?? data.sisterUid ?? data.unit?.uid ?? null,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.FLY_SKIP]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.FLY_MODE,
        actorUid: data.unitUid ?? data.spiderUid ?? data.sisterUid ?? data.unit?.uid ?? null,
        factIndex: index,
        timing: 'beforeText'
    })
};
