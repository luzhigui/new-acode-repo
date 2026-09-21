// render/38-actions-translate.js — fact → stageAction 翻译器（翻译域）
// V1.0.0 | ~26100 bytes | 2026-09-22 从 render/31 拆出：FACT_TRANSLATORS 全表 + 攻击/治疗装配
//
// 加新 fact 的舞台动作：在本文件 FACT_TRANSLATORS 加一条（键=factType），
// 并在 infra/58 的 translateFn 登记函数名；漏加会在本文件末尾校验循环里报错。
import { makeFXSnapshot } from '../infra/51-core-utils.js';
import { STAGE_ACTION_TYPES, FACT_TYPES, CAMP_TYPES, BUFF_EFFECT_TYPES, FLY_MODE_TYPES } from '../infra/56-battle-enums.js';
import { FACT_SPECS } from '../infra/58-fact-contract.js';
export const VER = 'render/38-actions-translate.js V1.0.0';

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

const FACT_TRANSLATORS = {
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
                // 2026-09-16 必须显式 afterText：HEAL 的 timing 函数只认 afterText，写 beforeText 会被当 anchor 且无 fxAnchors → 静默丢弃
                timing: 'afterText'
            });
        }
        return actions;
    },
    [FACT_TYPES.ATTACK]: (data, index) => makeAttackAction(data, index),
    [FACT_TYPES.MISS]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.MISS,
        actorUid: data.attacker?.uid ?? null,
        targetUid: data.target?.uid ?? null,
        fx: data.fxSnapshot || null,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.DODGE]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.DODGE,
        actorUid: data.attacker?.uid ?? null,
        targetUid: data.dodger?.uid ?? null,
        reboundDmg: data.reboundDmg,
        dead: data.attackerHpAfter <= 0,
        fx: data.fxSnapshot || null,
        factIndex: index,
        timing: 'beforeText'
    }),
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
    [FACT_TYPES.EMPTY_TARGET]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.EMPTY_TARGET,
        actorUid: data.attacker?.uid ?? null,
        reason: data.reason,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.WARRIOR_EXECUTE]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.EXECUTE,
        actorUid: data.unitUid ?? data.unit?.uid ?? null,
        targetUid: data.targetUid ?? data.uidD ?? data.target?.uid ?? null,
        dmg: data.dmg ?? null,
        dead: data.isDead ?? true,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.CLAW_EXECUTE]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.EXECUTE,
        actorUid: data.unitUid ?? data.unit?.uid ?? null,
        targetUid: data.targetUid ?? data.uidD ?? data.target?.uid ?? null,
        dmg: data.dmg ?? null,
        dead: data.isDead ?? true,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.XIN_HUN_DEATH]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.DEATH,
        actorUid: data.uidD ?? null,
        targetUid: data.uidD ?? null,
        dead: true,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.SPIDER_STRIKE]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.SPIDER_STRIKE,
        actorUid: data.unitUid ?? null,
        targetUid: data.targetUid ?? null,
        dmg: data.totalDmg,
        dead: data.isDead,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.HORSE_REBOUND]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.REBOUND,
        actorUid: data.attackerUid ?? null,
        targetUid: data.unitUid ?? null,
        dmg: Math.round(data.rebound ?? 0),
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.FORTIFY_REBOUND]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.REBOUND,
        actorUid: data.attackerUid ?? null,
        targetUid: data.unitUid ?? null,
        dmg: Math.round(data.reboundDmg ?? 0),
        bannerText: '🛡️ 严阵以待！',
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.XUAN_MING_DOT]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.DOT,
        targetUid: data.uidD ?? null,
        dmg: data.dot,
        dead: data.isDead,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.KUAI_LE_HEAL]: (data, index) => makeHealAction(data, index),
    [FACT_TYPES.NINE_YANG_HEAL]: (data, index) => makeHealAction(data, index),
    [FACT_TYPES.WEI_LEECH]: (data, index) => makeHealAction(data, index),
    [FACT_TYPES.PHANTOM_DISGUISE_HEAL]: (data, index) => makeHealAction(data, index),
    [FACT_TYPES.CLAW_HEAL]: (data, index) => makeHealAction(data, index),
    [FACT_TYPES.HOT_BLOOD_HEAL]: (data, index) => makeHealAction(data, index),
    [FACT_TYPES.BLOOD_THIRST_LEECH]: (data, index) => makeHealAction(data, index),
    [FACT_TYPES.MIND_CONTROL_BANNER]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.BANNER,
        text: '🌀 惑人心智',
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.MIND_CONTROL_SWAP]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.POS_SWAP,
        actorUid: data.unitA?.uid ?? null,
        targetUid: data.unitB?.uid ?? null,
        oldPosA: data.posA,
        oldPosB: data.posB,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.WIND_ASSAULT_PUSH]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.PUSH,
        actorUid: data.target?.uid ?? null,
        targetUid: data.behindUnit?.uid ?? null,
        oldPos: data.oldPos,
        newPos: data.behindPos,
        behindOldPos: data.behindOldPos ?? null,
        factIndex: index,
        timing: 'beforeText'
    }),
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
        actorUid: data.unitUid ?? data.unit?.uid ?? null,
        factIndex: index,
        timing: 'afterText'
    }),
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
    }),
    [FACT_TYPES.STUN_SKIP]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.STUN,
        actorUid: data.unitUid ?? data.unit?.uid ?? null,
        factIndex: index,
        timing: 'beforeText'
    }),
    [FACT_TYPES.WIND_ASSAULT_SPLASH]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.SPLASH,
        actorUid: data.attackerUid ?? data.unitUid ?? null,
        targetUid: data.primaryUid ?? null,
        splashUids: data.splashUids ?? data.targets?.map(t => t.uid) ?? [],
        splashDmg: data.splashDmg ?? null,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.METEOR_SHOWER_SPLASH]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.SPLASH,
        actorUid: data.attackerUid ?? data.unitUid ?? null,
        targetUid: data.primaryUid ?? null,
        splashUids: data.splashUids ?? data.targets?.map(t => t.uid) ?? [],
        splashDmg: data.splashDmg ?? null,
        factIndex: index,
        timing: 'afterText'
    }),
    [FACT_TYPES.DOUBLE_STRIKE]: (data, index) => data.success
        ? { kind: STAGE_ACTION_TYPES.BANNER, text: '⚡ 概率连击！', factIndex: index, timing: 'beforeText', nonBlocking: true }
        : null,
    [FACT_TYPES.SPIDER_DOUBLE_STRIKE]: (data, index) => ({ kind: STAGE_ACTION_TYPES.BANNER, text: '⚡ 概率连击！', factIndex: index, timing: 'beforeText' }),
    [FACT_TYPES.XING_FEN_GRANT]: () => null,
    [FACT_TYPES.DOUBLE_STRIKE_SUMMARY]: () => null,
    [FACT_TYPES.XIN_HUN]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.BUFF_EFFECT,
        effectType: BUFF_EFFECT_TYPES.XIN_HUN,
        targetUid: data.zhouUid ?? null,
        dmg: data.hpDeduct ?? 0,
        factIndex: index,
        timing: 'beforeText'
    })
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

function makeAttackAction(data, index) {
    const attacker = data.attacker;
    const target = data.target;
    const dmgResult = data.dmgResult;
    const dmg = Math.round(dmgResult?.dmg ?? 0);
    const dead = !!(dmgResult?.dead || dmgResult?.executeKill);
    const hpAfter = data.snap?.targetHpAfter !== undefined
        ? data.snap.targetHpAfter
        : Math.floor(target?.hp ?? 0);
    const hpBefore = dmgResult?.hpBefore ?? Math.floor(target?.hp ?? 0);

    const baseAction = {
        kind: STAGE_ACTION_TYPES.ATTACK,
        actorUid: attacker?.uid ?? null,
        targetUid: target?.uid ?? null,
        dmg,
        hpBefore,
        hpAfter,
        dead,
        fx: makeFXSnapshot(attacker, target),
        factIndex: index,
        timing: 'beforeText',
        // 演出字段（从 fact 携带到 stageAction，供 applyStageActionToFX 消费）
        attackerRole: data.snap?.attackerRole ?? attacker?.role ?? null,
        waveTaunt: data.dmgCalc?.waveTaunt ?? null,
        waveUnitUid: data.dmgCalc?.waveUnit?.uid ?? null,
        waveUnit: data.dmgCalc?.waveUnit ?? null,
        isKuLianAttack: data.snap?.isKuLianAttack ?? false,
        isLinkAttack: data.snap?.isLinkAttack ?? false
    };

    // 从 attack fact 的 entries 提取 afterText 特效，靠 e.type/e.factType 区分：溅射 / 白骨爪 / 乾坤飘字 / 死亡画笔
    const afterTextEffects = [];
    const entries = data.entries || [];
    for (const e of entries) {
        if (!e) continue;
        if (e.type === 'buff-splash' || (e.factType && [FACT_TYPES.METEOR_SHOWER_SPLASH, FACT_TYPES.WIND_ASSAULT_SPLASH].includes(e.factType))) {
            afterTextEffects.push({
                kind: STAGE_ACTION_TYPES.BUFF_EFFECT,
                effectType: BUFF_EFFECT_TYPES.SPLASH,
                attackerUid: e.attackerUid ?? attacker?.uid ?? null,
                primaryUid: e.primaryUid ?? target?.uid ?? null,
                splashUids: e.splashUids ?? (e.data?.targets?.map(t => t.uid) ?? []),
                splashDmg: e.splashDmg ?? null,
                buffType: e.buffType ?? null,
                factIndex: index,
                timing: 'afterText'
            });
        } else if (e.buffType === 'qiankun_atk' && e.atkTargetUid && e.atkGain) {
            afterTextEffects.push({
                kind: STAGE_ACTION_TYPES.BUFF_EFFECT,
                effectType: BUFF_EFFECT_TYPES.ATK_BUFF,
                targetUid: e.atkTargetUid,
                gain: e.atkGain,
                factIndex: index,
                timing: 'afterText'
            });
        } else if (e.factType && [FACT_TYPES.BLOOD_THIRST_LEECH, FACT_TYPES.HOT_BLOOD_HEAL, FACT_TYPES.NINE_YANG_HEAL, FACT_TYPES.WEI_LEECH, FACT_TYPES.PHANTOM_DISGUISE_HEAL, FACT_TYPES.CLAW_HEAL].includes(e.factType)) {
            const healAction = makeHealAction(e.data || {}, index);
            if (healAction && healAction.amount) {
                healAction.timing = 'afterText';
                afterTextEffects.push(healAction);
            }
            // 热血奋战：附一条 nonBlocking 横幅，翻倍时文案不同
            if (e.factType === FACT_TYPES.HOT_BLOOD_HEAL) {
                afterTextEffects.push({
                    kind: STAGE_ACTION_TYPES.BANNER,
                    text: e.data && e.data.isDouble ? '❤️‍🔥 热血奋战（翻倍）' : '❤️ 热血奋战',
                    factIndex: index,
                    timing: 'afterText',
                    nonBlocking: true
                });
            }
        } else if (e.factType === FACT_TYPES.QIAN_KUN_DERIVED) {
            const derivedData = e.data || {};
            if (derivedData.healTargetUid && derivedData.heal) {
                afterTextEffects.push({
                    kind: STAGE_ACTION_TYPES.HEAL,
                    actorUid: derivedData.healTargetUid,
                    targetUid: derivedData.healTargetUid,
                    amount: Math.round(derivedData.heal),
                    factIndex: index,
                    timing: 'afterText'
                });
            }
            if (derivedData.atkTargetUid && derivedData.atkGain) {
                afterTextEffects.push({
                    kind: STAGE_ACTION_TYPES.BUFF_EFFECT,
                    effectType: BUFF_EFFECT_TYPES.ATK_BUFF,
                    targetUid: derivedData.atkTargetUid,
                    gain: derivedData.atkGain,
                    factIndex: index,
                    timing: 'afterText'
                });
            }
        } else if (e.factType === FACT_TYPES.FORTIFY_REBOUND) {
            // 严阵以待反伤：飘在攻击者（受伤者）头上；横幅 nonBlocking，不阻塞主流程
            afterTextEffects.push({
                kind: STAGE_ACTION_TYPES.REBOUND,
                actorUid: e.data?.unitUid ?? null,
                targetUid: e.data?.attackerUid ?? null,
                dmg: Math.round(e.data?.reboundDmg ?? 0),
                factIndex: index,
                timing: 'afterText'
            });
            afterTextEffects.push({
                kind: STAGE_ACTION_TYPES.BANNER,
                text: '🛡️ 严阵以待！',
                factIndex: index,
                timing: 'afterText',
                nonBlocking: true
            });
        } else if (e.factType === FACT_TYPES.QIAN_KUN_UPGRADED || e.factType === FACT_TYPES.QIAN_KUN_BASIC) {
            // 2026-09-16 乾坤大挪移：翻译器永远不会被调用（fact 藏在 attack.data.entries 里，不在 log 顶层），
            // 飘字只能在这里扫 entries 产出。自伤与反弹各一条。
            const kd = e.data || {};
            if (kd.zhangUid && kd.selfDmg > 0) {
                afterTextEffects.push({
                    kind: STAGE_ACTION_TYPES.REBOUND,
                    actorUid: kd.zhangUid,
                    targetUid: kd.zhangUid,
                    dmg: Math.round(kd.selfDmg),
                    factIndex: index,
                    timing: 'afterText'
                });
            }
            if (kd.attackerUid && kd.rebound > 0) {
                afterTextEffects.push({
                    kind: STAGE_ACTION_TYPES.REBOUND,
                    actorUid: kd.attackerUid,
                    targetUid: kd.attackerUid,
                    dmg: Math.round(kd.rebound),
                    factIndex: index,
                    timing: 'afterText'
                });
            }
        } else if (e.factType === FACT_TYPES.HORSE_REBOUND) {
            // 拒马反伤：同上，飘在攻击者头上
            afterTextEffects.push({
                kind: STAGE_ACTION_TYPES.REBOUND,
                actorUid: e.data?.unitUid ?? null,
                targetUid: e.data?.attackerUid ?? null,
                dmg: Math.round(e.data?.rebound ?? 0),
                factIndex: index,
                timing: 'afterText'
            });
        }
    }

    // 血量线弹幕（文本后）
    const hpPctEffects = [];
    if (data.hpPctBefore !== undefined && data.hpPctAfter !== undefined) {
        if (data.hpPctBefore > 40 && data.hpPctAfter <= 40 && data.hpPctAfter > 20) {
            hpPctEffects.push({
                kind: STAGE_ACTION_TYPES.HP_PCT_DANMAKU,
                targetUid: target?.uid ?? null,
                text: target?.camp === CAMP_TYPES.ALLY ? '不好，必须反击了！' : '小儿安敢伤我！',
                factIndex: index,
                timing: 'afterText'
            });
        } else if (data.hpPctBefore > 20 && data.hpPctAfter <= 20) {
            hpPctEffects.push({
                kind: STAGE_ACTION_TYPES.HP_PCT_DANMAKU,
                targetUid: target?.uid ?? null,
                text: target?.camp === CAMP_TYPES.ALLY ? '撑住！' : '已是强弩之末！',
                factIndex: index,
                timing: 'afterText'
            });
        }
    }

    return [baseAction, ...afterTextEffects, ...hpPctEffects];
}

function makeHealAction(data, index) {
    return {
        kind: STAGE_ACTION_TYPES.HEAL,
        actorUid: data.healUnitUid ?? data.unitUid ?? data.sourceUid ?? null,
        targetUid: data.healUnitUid ?? data.unitUid ?? data.sourceUid ?? null,
        amount: Math.round(data.heal ?? data.leechVal ?? data.leech ?? data.totalHeal ?? 0),
        anchorIndex: 0,
        factIndex: index
    };
}
