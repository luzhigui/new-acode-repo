// render/38-actions-translate-stat.js — fact → stageAction 翻译器·属性召唤族（38 拆分）
// V1.0.3 | 2026-10-22 translateSkillAnnounce 新增 dash 分支：唐文亮冲刺报幕补一条 DASH 舞台动作（fx/94 位移演出）
// V1.0.2 | ~8600 bytes | 2026-10-19 translateSkillAnnounce 新增 restoreActed 分支：雄鹰恢复行动力的报幕补一条
//          RESTORE_ACTED 舞台动作（render/39 双清账本 _acted 与视图镜像 _renderActed）
// V1.0.1 | ~8215 bytes | 2026-10-13 两仪互换注释随红血时机修正：事实序不再是「先换位再挨打」，
//          改挂 ON_UNIT_ACTED 后 swap 报幕落在整段攻击组之后，翻译逻辑零改动。
import { STAGE_ACTION_TYPES, FACT_TYPES, BUFF_EFFECT_TYPES } from '../infra/56-battle-enums.js';
export const VER = 'render/38-actions-translate-stat.js V1.0.3';

// 属性召唤族翻译器表（键=factType）
export const STAT_TRANSLATORS = {
    [FACT_TYPES.SKILL_ANNOUNCE]: (data, index) => translateSkillAnnounce(data, index),
    [FACT_TYPES.KU_LIAN]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.STAT_CHANGE,
        actorUid: data.unitUid ?? data.unit?.uid ?? null,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.RANGED_GROWTH]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.STAT_CHANGE,
        actorUid: data.unitUid ?? data.unit?.uid ?? null,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.FORTIFY_SHIELD]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.STAT_CHANGE,
        statKind: 'def',
        targetUid: data.unitUid ?? data.unit?.uid ?? null,
        gain: data.increment ?? 0,
        actorUid: data.unitUid ?? data.unit?.uid ?? null,
        factIndex: index,
        timing: 'afterText'
    }),
    // 2026-10-05 八卦阵飘字（老板拍板「第二拍」）：减攻+加防两条，紧跟其后的 ENDLESS_BREATH（❤+二选一）
    //   也是 afterText 连续落 → 视觉上凑成第二拍（掉血/坚盾是第一拍，靠攻击动画天然隔开）。
    //   此前 modules/26 只手动 push 文本行，fact 无翻译器 → 无飘字。
    [FACT_TYPES.BAGUA_ARRAY]: (data, index) => {
        const acts = [];
        if (data.atkDelta) acts.push({ kind: STAGE_ACTION_TYPES.STAT_CHANGE, statKind: 'atk', targetUid: data.unitUid ?? null, gain: Math.round(data.atkDelta), actorUid: data.unitUid ?? null, factIndex: index, timing: 'afterText' });
        if (data.defDelta) acts.push({ kind: STAGE_ACTION_TYPES.STAT_CHANGE, statKind: 'def', targetUid: data.unitUid ?? null, gain: Math.round(data.defDelta), actorUid: data.unitUid ?? null, factIndex: index, timing: 'afterText' });
        return acts;
    },
    [FACT_TYPES.CARRY_APPLY]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.STAT_CHANGE,
        actorUid: data.unitUid ?? data.unit?.uid ?? null,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.METEOR_SHOWER_MAIN]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.STAT_CHANGE,
        actorUid: data.unitUid ?? data.unit?.uid ?? null,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.METEOR_SPLASH_GROWTH]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.STAT_CHANGE,
        actorUid: data.unitUid ?? data.unit?.uid ?? null,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.QIAN_KUN_UPGRADED]: (data, index) => {
        const actions = [];
        if (data.attackerUid && data.rebound) {
            actions.push({
                kind: STAGE_ACTION_TYPES.REBOUND,
                actorUid: data.attackerUid,
                targetUid: data.attackerUid,
                dmg: Math.round(data.rebound),
                factIndex: index,
                timing: 'afterText'
            });
        }
        if (data.zhangUid && data.selfDmg) {
            actions.push({
                kind: STAGE_ACTION_TYPES.REBOUND,
                actorUid: data.zhangUid,
                targetUid: data.zhangUid,
                dmg: Math.round(data.selfDmg),
                factIndex: index,
                timing: 'afterText'
            });
        }
        return actions;
    },
    [FACT_TYPES.QIAN_KUN_BASIC]: (data, index) => {
        const actions = [];
        if (data.attackerUid && data.rebound) {
            actions.push({
                kind: STAGE_ACTION_TYPES.REBOUND,
                actorUid: data.attackerUid,
                targetUid: data.attackerUid,
                dmg: Math.round(data.rebound),
                factIndex: index,
                timing: 'afterText'
            });
        }
        if (data.zhangUid && data.selfDmg) {
            actions.push({
                kind: STAGE_ACTION_TYPES.REBOUND,
                actorUid: data.zhangUid,
                targetUid: data.zhangUid,
                dmg: Math.round(data.selfDmg),
                factIndex: index,
                timing: 'afterText'
            });
        }
        return actions;
    },
    [FACT_TYPES.QIAN_KUN_DERIVED]: (data, index) => {
        const actions = [];
        // 先回血后加攻：heal 挂锚点0（治疗文本），atk 挂锚点1（攻击文本）
        if (data.healTargetUid && data.heal) {
            actions.push({
                kind: STAGE_ACTION_TYPES.HEAL,
                actorUid: data.healTargetUid,
                targetUid: data.healTargetUid,
                amount: Math.round(data.heal),
                anchorIndex: 0,
                factIndex: index
            });
        }
        if (data.atkTargetUid && data.atkGain) {
            actions.push({
                kind: STAGE_ACTION_TYPES.BUFF_EFFECT,
                effectType: BUFF_EFFECT_TYPES.ATK_BUFF,
                targetUid: data.atkTargetUid,
                gain: data.atkGain,
                anchorIndex: 1,
                factIndex: index
            });
        }
        return actions;
    },
    [FACT_TYPES.HORSE_SUMMON]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.SUMMON,
        actorUid: data.horseUid ?? null,
        pos: data.pos ?? data.horsePos,
        taunt: data.horseTaunt ?? null,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.XIAO_ZHAO_HORSE]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.SUMMON,
        actorUid: data.horseUid ?? null,
        pos: data.pos ?? data.horsePos,
        taunt: data.horseTaunt ?? null,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.HORSE_DESTROY]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.DESTROY,
        actorUid: data.horseUid ?? null,
        success: data.success,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.XIN_HUN]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.BUFF_EFFECT,
        effectType: BUFF_EFFECT_TYPES.XIN_HUN,
        targetUid: data.zhouUid ?? null,
        dmg: data.hpDeduct ?? 0,
        factIndex: index,
        timing: 'beforeText'
    })
};

// 何太冲技能飘字/演出：箭靶标记（🎯×N）飘在出手者格；红血两仪互换带 swap 载荷 → 先翻连线换位 POS_SWAP。
//   带 floatText+floatUid 才产 SKILL_FLOAT；无浮字的报幕返回 null，只落战报行。
function translateSkillAnnounce(data, index) {
    if (!data) return null;
    // 2026-10-13 两仪互换（红血）：带 swap 载荷的报幕先翻出一条「连线换位」POS_SWAP（beforeText——触发已改挂
    //   ON_UNIT_ACTED，事实序在整段攻击组之后，先挨打成红血、演出完再播换位）；☯ 飘字照旧 afterText。
    //   返回数组由 translateFactsToStageActions 展平。
    if (data.swap && data.swap.aUid != null && data.swap.bUid != null) {
        const acts = [{
            kind: STAGE_ACTION_TYPES.POS_SWAP,
            actorUid: data.swap.aUid,
            targetUid: data.swap.bUid,
            oldPosA: data.swap.posA,
            oldPosB: data.swap.posB,
            connectLine: true,
            factIndex: index,
            timing: 'beforeText'
        }];
        if (data.floatText && data.floatUid != null) {
            acts.push({ kind: STAGE_ACTION_TYPES.SKILL_FLOAT, targetUid: data.floatUid, text: data.floatText, factIndex: index, timing: 'afterText' });
        }
        return acts;
    }
    // 2026-10-19 蓄意轰拳：播报载荷带 hlsBurst → 补一条 HANLISA_BURST 舞台动作（回放/从机没有引擎直发，
    //   靠这里补触发 fx/93；主机单机两条都到时 fx/93 按 seq 去重，取先到者）
    if (data.hlsBurst && data.hlsBurst.apexUid != null) {
        const acts = [{ kind: STAGE_ACTION_TYPES.HANLISA_BURST, actorUid: data.hlsBurst.apexUid, hlsBurst: data.hlsBurst, factIndex: index, timing: 'afterText' }];
        if (data.floatText && data.floatUid != null) {
            acts.push({ kind: STAGE_ACTION_TYPES.SKILL_FLOAT, targetUid: data.floatUid, text: data.floatText, factIndex: index, timing: 'afterText' });
        }
        return acts;
    }
    // 2026-10-22 唐文亮冲刺：带 dash 载荷 → 补一条 DASH 舞台动作（先演位移，再落战报行）
    if (data.dash && data.dash.fromUid != null) {
        const acts = [{ kind: STAGE_ACTION_TYPES.DASH, actorUid: data.dash.fromUid, dash: data.dash, factIndex: index, timing: 'beforeText' }];
        if (data.floatText && data.floatUid != null) acts.push({ kind: STAGE_ACTION_TYPES.SKILL_FLOAT, targetUid: data.floatUid, text: data.floatText, factIndex: index, timing: 'afterText' });
        return acts;
    }
    // 2026-10-19 雄鹰·恢复行动力：报幕带 restoreActed + floatUid=被恢复者 uid →
    //   除飘字外补一条 RESTORE_ACTED 舞台动作，让 render/39 把 _acted=false 同步进 store
    //   并清 _renderActed 视图镜像（判灰双路取或，镜像残留会仍判灰）。
    if (data.restoreActed && data.floatUid != null) {
        const acts = [{ kind: STAGE_ACTION_TYPES.RESTORE_ACTED, actorUid: data.floatUid, factIndex: index, timing: 'afterText' }];
        if (data.floatText) acts.push({ kind: STAGE_ACTION_TYPES.SKILL_FLOAT, targetUid: data.floatUid, text: data.floatText, factIndex: index, timing: 'afterText' });
        return acts;
    }
    if (!data.floatText || data.floatUid == null) return null;
    return {
        kind: STAGE_ACTION_TYPES.SKILL_FLOAT,
        targetUid: data.floatUid,
        text: data.floatText,
        factIndex: index,
        timing: 'afterText'
    };
}
