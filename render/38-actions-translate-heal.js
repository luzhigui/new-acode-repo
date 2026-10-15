// render/38-actions-translate-heal.js — fact → stageAction 翻译器·回血族（38 拆分）
// V1.0.0 | ~5600 bytes | 2026-10-13 从 render/38-actions-translate.js 纯搬移：回血/吸血类 FACT_TRANSLATORS
//          条目 + makeHealAction / translateEndlessBreath，翻译逻辑零改动。表由 38 入口合成进 FACT_TRANSLATORS。
import { STAGE_ACTION_TYPES, FACT_TYPES } from '../infra/56-battle-enums.js';
export const VER = 'render/38-actions-translate-heal.js V1.0.0';

// 回血族翻译器表（键=factType）
export const HEAL_TRANSLATORS = {
    // 通用回血（2026-10-15）：任何走 FACT_TYPES.HEAL 的回血都从这里出动作 —— 新增回血无需再加条目
    [FACT_TYPES.HEAL]: (data, index) => makeHealAction(data, index),
    [FACT_TYPES.KUAI_LE_HEAL]: (data, index) => makeHealAction(data, index),
    [FACT_TYPES.NINE_YANG_HEAL]: (data, index) => makeHealAction(data, index),
    [FACT_TYPES.WEI_LEECH]: (data, index) => makeHealAction(data, index),
    [FACT_TYPES.PHANTOM_DISGUISE_HEAL]: (data, index) => makeHealAction(data, index),
    [FACT_TYPES.CLAW_HEAL]: (data, index) => makeHealAction(data, index),
    // 2026-09-27 生生不息：一个 fact 可能两口回血（自身 + 溢出接盘者），故单独翻译
    [FACT_TYPES.ENDLESS_BREATH]: (data, index) => translateEndlessBreath(data, index),
    [FACT_TYPES.HOT_BLOOD_HEAL]: (data, index) => makeHealAction(data, index),
    [FACT_TYPES.BLOOD_THIRST_LEECH]: (data, index) => makeHealAction(data, index),
    // 2026-10-07 飞行再生飘字改走 afterText（老板屏幕上仍不飘的终修）：
    // 原走 makeHealAction（不带 timing）→ HEAL 被 timing 函数判为 'anchor' → 飘字靠
    // 「锚文本与正文逐字匹配」触发——这条链已静默断过一次（10-06 空格案），今日机器复跑
    // 全链 16/16 信号全发（代码本体无病），但老板实测仍不飘，剩浏览器模块混搭/APK 旧包
    // 两种环境态。锚点通道的本质缺陷：任何一环文案漂移/缓存旧模块=无声哑火。
    // 改为显式 afterText：飘字跟张三丰生生不息同通道（老板 10-05 亲眼见过能飘），
    // 不再依赖任何文本匹配，本类故障从结构上消灭。
    [FACT_TYPES.FLYER_REGEN]: (data, index) => ({ ...makeHealAction(data, index), timing: 'afterText' })
};

// 通用回血动作（本族共用；攻击族 makeAttackAction 的组内 entries 回血也从这里取，故导出）
export function makeHealAction(data, index) {
    return {
        kind: STAGE_ACTION_TYPES.HEAL,
        actorUid: data.healUnitUid ?? data.unitUid ?? data.sourceUid ?? null,
        targetUid: data.healUnitUid ?? data.unitUid ?? data.sourceUid ?? null,
        amount: Math.round(data.heal ?? data.leechVal ?? data.leech ?? data.totalHeal ?? 0),
        anchorIndex: 0,
        factIndex: index
    };
}

// 张三丰·生生不息：自身与溢出接盘者各一条回血动作，timing 显式 afterText —— 弹幕跟在日志文字之后，
// 与 PASS 休息回血同款（不写 afterText 会被 HEAL 的 timing 函数当 anchor 处理）。
function translateEndlessBreath(data, index) {
    const actions = [];
    const selfHeal = Math.round(data.heal || 0);
    // 2026-10-08 付费触发扣攻飘字（⚔-N，与八卦阵 BAGUA_ARRAY 的 atkDelta 飘字同款；fail fact cost 为空自动跳过）
    const cost = Math.round(data.cost || 0);
    if (cost > 0 && data.unitUid) {
        actions.push({ kind: STAGE_ACTION_TYPES.STAT_CHANGE, statKind: 'atk', targetUid: data.unitUid, gain: -cost, factIndex: index, timing: 'afterText' });
    }
    if (selfHeal > 0 && data.unitUid) {
        actions.push({
            kind: STAGE_ACTION_TYPES.HEAL,
            actorUid: data.unitUid, targetUid: data.unitUid, amount: selfHeal,
            anchorIndex: 0, factIndex: index, timing: 'afterText'
        });
    }
    const overflowHeal = Math.round(data.overflowHealed || 0);
    if (overflowHeal > 0 && data.overflowToUid) {
        actions.push({
            kind: STAGE_ACTION_TYPES.HEAL,
            actorUid: data.overflowToUid, targetUid: data.overflowToUid, amount: overflowHeal,
            anchorIndex: 0, factIndex: index, timing: 'afterText'
        });
    }
    // 2026-10-01 攻防二选一的加成飘字（用户定调：该加攻加攻、该加防加防，随回血同时升）：
    //   atkGain→ATK_BUFF_FLOAT（橙⚔ 左上，原通道）、defGain→DEF_BUFF_FLOAT（钢蓝🛡 右上，新通道）。
    //   翻译器只派动作，emit 由 39 的 STAT_CHANGE 演出帧发——与回血弹幕同帧，不抢日志文字。
    const selfAtk = Math.round(data.atkGain || 0), selfDef = Math.round(data.defGain || 0);
    if (selfAtk > 0 && data.unitUid) {
        actions.push({ kind: STAGE_ACTION_TYPES.STAT_CHANGE, statKind: 'atk', targetUid: data.unitUid, gain: selfAtk, factIndex: index, timing: 'afterText' });
    }
    if (selfDef > 0 && data.unitUid) {
        actions.push({ kind: STAGE_ACTION_TYPES.STAT_CHANGE, statKind: 'def', targetUid: data.unitUid, gain: selfDef, factIndex: index, timing: 'afterText' });
    }
    const recvAtk = Math.round(data.overflowAtkGain || 0), recvDef = Math.round(data.overflowDefGain || 0);
    if (recvAtk > 0 && data.overflowToUid) {
        actions.push({ kind: STAGE_ACTION_TYPES.STAT_CHANGE, statKind: 'atk', targetUid: data.overflowToUid, gain: recvAtk, factIndex: index, timing: 'afterText' });
    }
    if (recvDef > 0 && data.overflowToUid) {
        actions.push({ kind: STAGE_ACTION_TYPES.STAT_CHANGE, statKind: 'def', targetUid: data.overflowToUid, gain: recvDef, factIndex: index, timing: 'afterText' });
    }
    return actions.length > 0 ? actions : null;
}
