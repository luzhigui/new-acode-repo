// render/38-actions-translate-control.js — fact → stageAction 翻译器·控制位移族（38 拆分）
import { STAGE_ACTION_TYPES, FACT_TYPES, FLY_MODE_TYPES } from '../infra/56-battle-enums.js';
export const VER = 'render/38-actions-translate-control.js V1.1.0';

// 控制位移族翻译器表（键=factType）
export const CONTROL_TRANSLATORS = {
    [FACT_TYPES.IMMUNE]: (data, index) => {
        const actions = [{
            kind: STAGE_ACTION_TYPES.IMMUNE,
            actorUid: data.attacker?.uid ?? null,
            targetUid: data.target?.uid ?? null,
            reason: data.reason ?? null,   // 免疫原因透传（core/10 immuneFact 自带 reason），金刚不坏碎裂特效按前缀判断
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
        // 按单位追的方式生成 POS_SWAP 序列（冒泡式：每次把当前单位换到目标位置）
        const posToUid = new Map();
        for (const s of swaps) posToUid.set(s.fromPos, s.uid);
        const acts = [];
        for (const s of swaps) {
            let curPos = null;
            for (const [pos, uid] of posToUid) {
                if (uid === s.uid) { curPos = pos; break; }
            }
            if (curPos === null || curPos === s.toPos) continue;
            const otherUid = posToUid.get(s.toPos);
            if (otherUid === undefined) continue;
            acts.push({
                kind: STAGE_ACTION_TYPES.POS_SWAP,
                actorUid: s.uid,
                targetUid: otherUid,
                oldPosA: curPos,
                oldPosB: s.toPos,
                factIndex: index,
                timing: 'beforeText'
            });
            posToUid.set(curPos, otherUid);
            posToUid.set(s.toPos, s.uid);
        }
        if (data.dmg > 0) {
            for (const s of swaps) acts.push({ kind: STAGE_ACTION_TYPES.DAMAGE_FLOAT, targetUid: s.uid, dmg: data.dmg, factIndex: index, timing: 'afterText' });
        }
        if (data.heal > 0) {
            for (const s of swaps) acts.push({ kind: STAGE_ACTION_TYPES.HEAL, actorUid: s.uid, targetUid: s.uid, amount: data.heal, factIndex: index, timing: 'afterText' });
        }
        return acts.length > 0 ? acts : null;
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
