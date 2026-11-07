// render/417-actions-translate-control.js — fact → stageAction 翻译器·控制位移族（38 拆分）
import { STAGE_ACTION_TYPES, FACT_TYPES, FLY_MODE_TYPES } from '../infra/106-battle-enums.js';
export const VER = 'render/417-actions-translate-control.js V1.1.1';

// 控制位移族翻译器表（键=factType）
export const CONTROL_TRANSLATORS = {
    [FACT_TYPES.IMMUNE]: (data, index) => {
        const actions = [{
            kind: STAGE_ACTION_TYPES.IMMUNE,
            actorUid: data.attacker?.uid ?? null,
            targetUid: data.target?.uid ?? null,
            reason: data.reason ?? null,   // 免疫原因透传（core/10 immuneFact 自带 reason），金刚不坏碎裂特效按前缀判断
            // 飞天免疫（小昭·妹）标记：reason 在带 flyData 时为 null，只有靠它才能让 IMMUNE
            //   动作认出「先演攻击到接触帧、再起飞」，见 render/420 的 IMMUNE 分支
            flyData: data.flyData ?? null,
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
        const swaps = data.swaps || [];
        if (swaps.length === 0) return null;
        // 三格原地闪换：不再冒泡拆成两两 POS_SWAP（那样视觉上会连做两次两格互换，
        //   每次都带「闪 3 下 → 瞬移来回 → 红锁」，与惑心三格语义对不上）。
        //   引擎（core/215 shuffleThreeSlots）已经算好最终排列，原样交给 fx 做视觉：
        //   高亮 → 闪换 N 次 → 红锁凝固 → 落定终态 → dispatch POS_CHANGE。
        //   camp 从 data.side 取（applyMindControlCore 里就是按 side 归阵营的）。
        const acts = [{
            kind: STAGE_ACTION_TYPES.MIND_SWAP,
            camp: data.side,
            swaps: swaps.map(s => ({ uid: s.uid, fromPos: s.fromPos, toPos: s.toPos })),
            allPositions: data.allPositions || [],
            factIndex: index,
            timing: 'beforeText'
        }];
        if (data.dmg > 0) {
            for (const s of swaps) acts.push({ kind: STAGE_ACTION_TYPES.DAMAGE_FLOAT, targetUid: s.uid, dmg: data.dmg, factIndex: index, timing: 'afterText' });
        }
        if (data.heal > 0) {
            for (const s of swaps) acts.push({ kind: STAGE_ACTION_TYPES.HEAL, actorUid: s.uid, targetUid: s.uid, amount: data.heal, factIndex: index, timing: 'afterText' });
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
