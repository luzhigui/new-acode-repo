// render/31-stage-actions.js - 光明顶5v5 舞台动作翻译器
// V5.7.8 | ~16200 bytes| 2026-08-26 特效单轨收尾：xinhun/连击横幅/乾坤加攻/张无忌弹幕/严阵横幅补翻译
export const VER = 'render/31-stage-actions.js V5.7.9';

import { makeFXSnapshot } from '../infra/51-core-utils.js';
import { STAGE_ACTION_TYPES, FACT_TYPES, BUFF_EFFECT_TYPES, FLY_MODE_TYPES, CAMP_TYPES } from '../infra/56-battle-enums.js';

/**
 * 把一步的 fact 列表翻译成舞台动作列表。
 * 导演只读 stageActions，不读 fact；日志线仍读 fact。
 * 每个动作带 timing 字段：'beforeText'（文本播放前触发）或 'afterText'（文本播放后触发）。
 */
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

function translateFact(entry, index) {
    const { factType, data } = entry;
    switch (factType) {
        // ---------- 回合控制 ----------
        case FACT_TYPES.ROUND_START:
            return { kind: STAGE_ACTION_TYPES.ROUND_START, round: data.round, factIndex: index, timing: 'beforeText' };
        case FACT_TYPES.ROUND_END:
            return { kind: STAGE_ACTION_TYPES.ROUND_END, round: data.round, factIndex: index, timing: 'afterText' };
        case FACT_TYPES.PASS: {
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
                    timing: 'beforeText'
                });
            }
            return actions;
        }

        // ---------- 攻击流程 ----------
        case FACT_TYPES.ATTACK:
            return makeAttackAction(data, index);
        case FACT_TYPES.MISS:
            return {
                kind: STAGE_ACTION_TYPES.MISS,
                actorUid: data.attacker?.uid ?? null,
                targetUid: data.target?.uid ?? null,
                fx: data.fxSnapshot || null,
                factIndex: index,
                timing: 'afterText'
            };
        case FACT_TYPES.DODGE:
            return {
                kind: STAGE_ACTION_TYPES.DODGE,
                actorUid: data.attacker?.uid ?? null,
                targetUid: data.dodger?.uid ?? null,
                reboundDmg: data.reboundDmg,
                dead: data.attackerHpAfter <= 0,
                fx: data.fxSnapshot || null,
                factIndex: index,
                timing: 'beforeText'
            };
        case FACT_TYPES.IMMUNE:
            return {
                kind: STAGE_ACTION_TYPES.IMMUNE,
                actorUid: data.attacker?.uid ?? null,
                targetUid: data.target?.uid ?? null,
                factIndex: index,
                timing: 'beforeText'
            };
        case FACT_TYPES.EMPTY_TARGET:
            return {
                kind: STAGE_ACTION_TYPES.EMPTY_TARGET,
                actorUid: data.attacker?.uid ?? null,
                reason: data.reason,
                factIndex: index,
                timing: 'beforeText'
            };
        case FACT_TYPES.WARRIOR_EXECUTE:
        case FACT_TYPES.CLAW_EXECUTE:
            return {
                kind: STAGE_ACTION_TYPES.EXECUTE,
                actorUid: data.unitUid ?? data.unit?.uid ?? null,
                targetUid: data.targetUid ?? data.uidD ?? data.target?.uid ?? null,
                dmg: data.dmg ?? null,
                dead: data.isDead ?? true,
                factIndex: index,
                timing: 'afterText'
            };
        case FACT_TYPES.XIN_HUN_DEATH:
            return {
                kind: STAGE_ACTION_TYPES.DEATH,
                actorUid: data.uidD ?? null,
                targetUid: data.uidD ?? null,
                dead: true,
                factIndex: index,
                timing: 'afterText'
            };
        case FACT_TYPES.SPIDER_STRIKE:
            return {
                kind: STAGE_ACTION_TYPES.SPIDER_STRIKE,
                actorUid: data.unitUid ?? null,
                targetUid: data.targetUid ?? null,
                dmg: data.totalDmg,
                dead: data.isDead,
                factIndex: index,
                timing: 'beforeText'
            };
        case FACT_TYPES.HORSE_REBOUND:
            return {
                kind: STAGE_ACTION_TYPES.REBOUND,
                actorUid: data.attackerUid ?? null,
                targetUid: data.unitUid ?? null,
                dmg: Math.round(data.rebound ?? 0),
                factIndex: index,
                timing: 'afterText'
            };
        case FACT_TYPES.FORTIFY_REBOUND:
            return {
                kind: STAGE_ACTION_TYPES.REBOUND,
                actorUid: data.attackerUid ?? null,
                targetUid: data.unitUid ?? null,
                dmg: Math.round(data.reboundDmg ?? 0),
                bannerText: '🛡️ 严阵以待！',
                factIndex: index,
                timing: 'afterText'
            };

        // ---------- 血量 / 治疗 ----------
        case FACT_TYPES.XUAN_MING_DOT:
            return {
                kind: STAGE_ACTION_TYPES.DOT,
                targetUid: data.uidD ?? null,
                dmg: data.dot,
                dead: data.isDead,
                factIndex: index,
                timing: 'beforeText'
            };
        case FACT_TYPES.KUAI_LE_HEAL:
        case FACT_TYPES.NINE_YANG_HEAL:
        case FACT_TYPES.WEI_LEECH:
        case FACT_TYPES.PHANTOM_DISGUISE_HEAL:
        case FACT_TYPES.CLAW_HEAL:
        case FACT_TYPES.HOT_BLOOD_HEAL:
        case FACT_TYPES.BLOOD_THIRST_LEECH:
            return makeHealAction(data, index);

        // ---------- 位置 / 换位 / 击退 ----------
        case FACT_TYPES.MIND_CONTROL_BANNER:
            // 惑人心智判定横幅：六大派（敌方）/ 明教（己方）各一条，成功后由紧随的 POS_SWAP 出换位特效
            return {
                kind: STAGE_ACTION_TYPES.BANNER,
                text: data.side === CAMP_TYPES.ENEMY ? '🌀 惑人心智：敌方判定！' : '🌀 惑人心智：己方判定！',
                factIndex: index,
                timing: 'beforeText'
            };
        case FACT_TYPES.MIND_CONTROL_SWAP:
            return {
                kind: STAGE_ACTION_TYPES.POS_SWAP,
                actorUid: data.unitA?.uid ?? null,
                targetUid: data.unitB?.uid ?? null,
                oldPosA: data.posA,
                oldPosB: data.posB,
                factIndex: index,
                timing: 'beforeText'
            };
        case FACT_TYPES.WIND_ASSAULT_PUSH:
            return {
                kind: STAGE_ACTION_TYPES.PUSH,
                actorUid: data.target?.uid ?? null,
                targetUid: data.behindUnit?.uid ?? null,
                oldPos: data.oldPos,
                newPos: data.behindPos,
                behindOldPos: data.behindOldPos ?? null,
                factIndex: index,
                timing: 'beforeText'
            };

        // ---------- 属性 / 增益 ----------
        case FACT_TYPES.KU_LIAN:
        case FACT_TYPES.RANGED_GROWTH:
        case FACT_TYPES.FORTIFY_SHIELD:
        case FACT_TYPES.CARRY_APPLY:
        case FACT_TYPES.METEOR_SHOWER_MAIN:
        case FACT_TYPES.METEOR_SPLASH_GROWTH:
            return {
                kind: STAGE_ACTION_TYPES.STAT_CHANGE,
                actorUid: data.unitUid ?? data.unit?.uid ?? null,
                factIndex: index,
                timing: 'afterText'
            };
        case FACT_TYPES.QIAN_KUN_DERIVED:
            // 乾坤衍生：治疗走文本行，加攻飘字独立成 afterText 动作
            return data.atkTargetUid && data.atkGain
                ? {
                    kind: STAGE_ACTION_TYPES.BUFF_EFFECT,
                    effectType: BUFF_EFFECT_TYPES.ATK_BUFF,
                    targetUid: data.atkTargetUid,
                    gain: data.atkGain,
                    factIndex: index,
                    timing: 'afterText'
                }
                : null;

        // ---------- 召唤 / 销毁 ----------
        case FACT_TYPES.HORSE_SUMMON:
        case FACT_TYPES.XIAO_ZHAO_HORSE:
            return {
                kind: STAGE_ACTION_TYPES.SUMMON,
                actorUid: data.horseUid ?? null,
                pos: data.pos ?? data.horsePos,
                taunt: data.horseTaunt ?? null,
                factIndex: index,
                timing: 'beforeText'
            };
        case FACT_TYPES.HORSE_DESTROY:
            return {
                kind: STAGE_ACTION_TYPES.DESTROY,
                actorUid: data.horseUid ?? null,
                success: data.success,
                factIndex: index,
                timing: 'afterText'
            };

        // ---------- 变身 / 飞行 ----------
        case FACT_TYPES.ZHANG_SWITCH:
            return {
                kind: STAGE_ACTION_TYPES.TRANSFORM,
                actorUid: data.zhang?.uid ?? data.unitUid ?? null,
                danmaku: '不好，要顶上去了！',
                factIndex: index,
                timing: 'beforeText'
            };
        case FACT_TYPES.SPIDER_TRANSFORM:
            return {
                kind: STAGE_ACTION_TYPES.TRANSFORM,
                actorUid: data.unitUid ?? data.zhang?.uid ?? null,
                factIndex: index,
                timing: 'beforeText'
            };
        case FACT_TYPES.SPIDER_FLY:
            return {
                kind: STAGE_ACTION_TYPES.FLY_MODE,
                actorUid: data.spiderUid ?? data.unitUid ?? null,
                originalFactType: FLY_MODE_TYPES.SPIDER_FLY,
                factIndex: index,
                timing: 'beforeText'
            };
        case FACT_TYPES.SPIDER_RETURN:
            return {
                kind: STAGE_ACTION_TYPES.FLY_MODE,
                actorUid: data.spiderUid ?? data.unitUid ?? null,
                originalFactType: FLY_MODE_TYPES.SPIDER_RETURN,
                factIndex: index,
                timing: 'beforeText'
            };
        case FACT_TYPES.BUTTERFLY_ATTACH:
            return {
                kind: STAGE_ACTION_TYPES.FLY_MODE,
                actorUid: data.sisterUid ?? null,
                hostUid: data.hostUid ?? null,
                originalFactType: FLY_MODE_TYPES.BUTTERFLY_ATTACH,
                factIndex: index,
                timing: 'beforeText'
            };
        case FACT_TYPES.BUTTERFLY_RETURN:
            return {
                kind: STAGE_ACTION_TYPES.FLY_MODE,
                actorUid: data.sisterUid ?? null,
                hostUid: data.hostUid ?? null,
                originalFactType: FLY_MODE_TYPES.BUTTERFLY_RETURN,
                factIndex: index,
                timing: 'beforeText'
            };
        case FACT_TYPES.BUTTERFLY_HOST_DEAD:
        case FACT_TYPES.BUTTERFLY_NO_HOST:
        case FACT_TYPES.FLY_SKIP:
            return {
                kind: STAGE_ACTION_TYPES.FLY_MODE,
                actorUid: data.unitUid ?? data.spiderUid ?? data.sisterUid ?? data.unit?.uid ?? null,
                factIndex: index,
                timing: 'beforeText'
            };
        case FACT_TYPES.STUN_SKIP:
            return {
                kind: STAGE_ACTION_TYPES.STUN,
                actorUid: data.unitUid ?? data.unit?.uid ?? null,
                factIndex: index,
                timing: 'beforeText'
            };

        // ---------- 技能波及 / 附加 ----------
        case FACT_TYPES.WIND_ASSAULT_SPLASH:
        case FACT_TYPES.METEOR_SHOWER_SPLASH:
            return {
                kind: STAGE_ACTION_TYPES.SPLASH,
                actorUid: data.attackerUid ?? data.unitUid ?? null,
                targetUid: data.primaryUid ?? null,
                splashUids: data.splashUids ?? data.targets?.map(t => t.uid) ?? [],
                splashDmg: data.splashDmg ?? null,
                factIndex: index,
                timing: 'afterText'
            };

        // ---------- 横幅 / 摘要 ----------
        case FACT_TYPES.DOUBLE_STRIKE:
            return data.success
                ? { kind: STAGE_ACTION_TYPES.BANNER, text: '⚡ 概率连击！', factIndex: index, timing: 'beforeText' }
                : null;
        case FACT_TYPES.SPIDER_DOUBLE_STRIKE:
            return { kind: STAGE_ACTION_TYPES.BANNER, text: '⚡ 概率连击！', factIndex: index, timing: 'beforeText' };
        case FACT_TYPES.XING_FEN_GRANT:
        case FACT_TYPES.DOUBLE_STRIKE_SUMMARY:
            // 摘要正文已由文本线展示，无横幅实体
            return null;

        // ---------- 新婚快乐（宋青书/周芷若） ----------
        case FACT_TYPES.XIN_HUN:
            return {
                kind: STAGE_ACTION_TYPES.BUFF_EFFECT,
                effectType: BUFF_EFFECT_TYPES.XIN_HUN,
                targetUid: data.zhouUid ?? null,
                dmg: data.hpDeduct ?? 0,
                factIndex: index,
                timing: 'beforeText'
            };

        default:
            return null;
    }
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
        isKuLianAttack: data.snap?.isKuLianAttack ?? false
    };

    // 从 attack fact 的 entries 提取文本后特效（buff-splash / 白骨爪 / 乾坤攻击飘字 / 死亡画笔）
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
        } else if (e.isClawHit || (e.factType && [FACT_TYPES.CLAW_HIT, FACT_TYPES.CLAW_EXECUTE].includes(e.factType))) {
            afterTextEffects.push({
                kind: STAGE_ACTION_TYPES.BUFF_EFFECT,
                effectType: BUFF_EFFECT_TYPES.BONE_CLAW,
                attackerUid: e.clawAttackerUid ?? attacker?.uid ?? null,
                targetUid: e.clawTargetUid ?? target?.uid ?? null,
                dmg: e.data?.dmg ?? null,
                isExecute: e.isExecute ?? false,
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
        factIndex: index,
        timing: 'beforeText'
    };
}

/**
 * STAGE_ACTION_DEFS —— 舞台动作的唯一调度表。
 * 播放器 playStep 只读本表驱动三线（grid 格子线 / fx 特效线 / log 日志线）。
 * timing：'beforeText'（日志前特效）或 'afterText'（日志后特效）；
 * 可为函数 (action) => timing，用于同一 kind 按 effectType 分时序（如 buffEffect 的 xinHun）。
 * 新增 stageAction 只需在此登记 + 在 31 翻译器产出，播放器无需改动。
 */
export const STAGE_ACTION_DEFS = {
    [STAGE_ACTION_TYPES.ATTACK]: { grid: 'sync', fx: 'sync', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.REBOUND]: { grid: 'none', fx: 'sync', log: 'sync', timing: 'afterText' },
    [STAGE_ACTION_TYPES.HEAL]: { grid: 'sync', fx: 'sync', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.DEATH]: { grid: 'sync', fx: 'sync', log: 'sync', timing: 'afterText' },
    [STAGE_ACTION_TYPES.POS_SWAP]: { grid: 'sync', fx: 'sync', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.PUSH]: { grid: 'sync', fx: 'sync', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.SUMMON]: { grid: 'sync', fx: 'sync', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.DESTROY]: { grid: 'sync', fx: 'sync', log: 'sync', timing: 'afterText' },
    [STAGE_ACTION_TYPES.TRANSFORM]: { grid: 'sync', fx: 'sync', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.FLY_MODE]: { grid: 'sync', fx: 'sync', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.ROUND_START]: { grid: 'sync', fx: 'sync', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.ROUND_END]: { grid: 'sync', fx: 'sync', log: 'sync', timing: 'afterText' },
    [STAGE_ACTION_TYPES.REST]: { grid: 'sync', fx: 'sync', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.DOT]: { grid: 'sync', fx: 'sync', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.EXECUTE]: { grid: 'sync', fx: 'sync', log: 'sync', timing: 'afterText' },
    [STAGE_ACTION_TYPES.MISS]: { grid: 'none', fx: 'sync', log: 'sync', timing: 'afterText' },
    [STAGE_ACTION_TYPES.IMMUNE]: { grid: 'none', fx: 'sync', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.STAT_CHANGE]: { grid: 'sync', fx: 'sync', log: 'sync', timing: 'afterText' },
    [STAGE_ACTION_TYPES.BANNER]: { grid: 'none', fx: 'sync', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.EMPTY_TARGET]: { grid: 'none', fx: 'none', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.STUN]: { grid: 'sync', fx: 'sync', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.SPLASH]: { grid: 'sync', fx: 'sync', log: 'sync', timing: 'afterText' },
    [STAGE_ACTION_TYPES.SPIDER_STRIKE]: { grid: 'sync', fx: 'sync', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.BUFF_EFFECT]: {
        grid: 'none', fx: 'sync', log: 'sync',
        timing: (action) => (action && action.effectType === BUFF_EFFECT_TYPES.XIN_HUN) ? 'beforeText' : 'afterText'
    },
    [STAGE_ACTION_TYPES.HP_PCT_DANMAKU]: { grid: 'none', fx: 'sync', log: 'sync', timing: 'afterText' }
};