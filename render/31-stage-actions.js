// render/31-stage-actions.js - 光明顶5v5 舞台动作翻译器
// V5.7.8 | ~16200 bytes| 2026-08-26 特效单轨收尾：xinhun/连击横幅/乾坤加攻/张无忌弹幕/严阵横幅补翻译
export const VER = 'render/31-stage-actions.js V5.7.10';

import { makeFXSnapshot } from '../infra/51-core-utils.js';
import { eventBus } from '../infra/50-event-bus.js';
import { FX_SIGNALS } from '../infra/55-fx-signals.js';
import { GlobalStore } from '../infra/54-global-store.js';
import { AudioManager } from '../modules/22audio-manager.js';
import { STAGE_ACTION_TYPES, FACT_TYPES, CAMP_TYPES, STORE_ACTION_TYPES, UNIT_EVENT_TYPES, ROLE_TYPES, BUFF_EFFECT_TYPES, BUFF_SUBTYPES, FLY_MODE_TYPES } from '../infra/56-battle-enums.js';

// 本地查找单位（避免从 47 导入造成循环依赖）：先查 store 权威单位，再回退 UI 快照
function findUnitByUidLocal(c, uid) {
    if (!uid) return null;
    if (c && c.store) {
        const su = c.store.getState().units.find(u => u.uid === uid);
        if (su) return su;
    }
    const ui = (c && c.UI) || {};
    const all = (ui.allyTeam || []).concat(ui.enemyTeam || []);
    return all.find(u => u.uid === uid) || null;
}

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
                timing: 'beforeText'
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
    [FACT_TYPES.IMMUNE]: (data, index) => ({
        kind: STAGE_ACTION_TYPES.IMMUNE,
        actorUid: data.attacker?.uid ?? null,
        targetUid: data.target?.uid ?? null,
        factIndex: index,
        timing: 'beforeText'
    }),
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
        text: data.side === CAMP_TYPES.ENEMY ? '🌀 惑人心智：敌方判定！' : '🌀 惑人心智：己方判定！',
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
    [FACT_TYPES.QIAN_KUN_DERIVED]: (data, index) => data.atkTargetUid && data.atkGain
        ? {
            kind: STAGE_ACTION_TYPES.BUFF_EFFECT,
            effectType: BUFF_EFFECT_TYPES.ATK_BUFF,
            targetUid: data.atkTargetUid,
            gain: data.atkGain,
            factIndex: index,
            timing: 'afterText'
        }
        : null,
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
        ? { kind: STAGE_ACTION_TYPES.BANNER, text: '⚡ 概率连击！', factIndex: index, timing: 'beforeText' }
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
    [STAGE_ACTION_TYPES.ATTACK]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        store: (c, action, pendingDeaths) => {
            // 死亡标记不在 stageAction 阶段落地（会抢在攻击动画前显示死亡格），
            // 收集后由 playStep 在日志播完统一落地；近战另有 88 飞撞回调在动画结束时兜底
            if (action.dead && action.targetUid && pendingDeaths) pendingDeaths.push(action.targetUid);
        },
        fx: async (c, action) => {
            const attacker = findUnitByUidLocal(c, action.actorUid);
            const target = findUnitByUidLocal(c, action.targetUid);
            // 苦练蓄力特效
            if (action.isKuLianAttack && attacker) {
                const team = c.store.getState().units.filter(u => u.camp === attacker.camp);
                eventBus.emit(FX_SIGNALS.KULIAN, { unit: attacker, team });
                await new Promise(r => setTimeout(r, 1200));
            }
            // 飞撞/箭矢/台词弹幕（统一由 fx/88 的 _triggerFX 消费）
            if (attacker && target && action.attackerRole) {
                eventBus.emit(FX_SIGNALS.TRIGGER, {
                    fxSnapshot: action.fx,
                    unitA: attacker,
                    unitD: target,
                    isDead: action.dead,
                    isDodge: false,
                    isMiss: false,
                    isBlock: false,
                    dmg: action.dmg,
                    waveTaunt: action.waveTaunt || null,
                    waveUnitUid: action.waveUnitUid || null,
                    waveUnit: action.waveUnit || null,
                    attackerRole: action.attackerRole
                });
            }
        }
    },
    [STAGE_ACTION_TYPES.REBOUND]: {
        grid: 'none', log: 'sync', timing: 'afterText',
        fx: async (c, action) => {
            // 反伤：只飘字，不触发飞撞/箭矢/音效；严阵以待带横幅（fortifyRebound）
            if (action.bannerText && !GlobalStore.get('fastForwardActive')) {
                c.isPaused = true; GlobalStore.set('bulletTimeActive', true);
                await eventBus.emit(FX_SIGNALS.BANNER, { text: action.bannerText });
                GlobalStore.set('bulletTimeActive', false); c.isPaused = false;
            }
            const target = findUnitByUidLocal(c, action.targetUid);
            if (target && action.dmg && !GlobalStore.get('fastForwardActive')) {
                eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: target, dmg: action.dmg });
            }
        }
    },
    [STAGE_ACTION_TYPES.HEAL]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        fx: (c, action) => {
            const healUnit = findUnitByUidLocal(c, action.targetUid);
            if (healUnit && action.amount) {
                eventBus.emit(FX_SIGNALS.HEAL_FLOAT, { unit: healUnit, amount: action.amount });
            }
        }
    },
    [STAGE_ACTION_TYPES.DEATH]: { grid: 'sync', log: 'sync', timing: 'afterText' },
    [STAGE_ACTION_TYPES.DODGE]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        store: (c, action, pendingDeaths) => {
            // ★ 闪避反击后攻击者必须进入眩晕态，并在 store 里同步，否则渲染层读不到 _stunned，
            //   职业图标不会切换成 😵（renderGrid 里 isStunned 判断依赖 state._stunned）。
            //   同时清除攻击者 flash，避免闪避前残留的 attack/defend 蓝色或黄色特效。
            if (action.actorUid) {
                c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: action.actorUid, _stunned: true, _acted: true });
                c.store.dispatch({ type: STORE_ACTION_TYPES.CLEAR_UNIT_FLASH, uid: action.actorUid });
            }
            if (action.dead && action.actorUid && pendingDeaths) pendingDeaths.push(action.actorUid);
        },
        fx: async (c, action) => {
            const attacker = findUnitByUidLocal(c, action.actorUid);
            const dodger = findUnitByUidLocal(c, action.targetUid);
            if (attacker && action.reboundDmg && !GlobalStore.get('fastForwardActive')) {
                eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: attacker, dmg: action.reboundDmg });
            }
            // 华丽模式：子弹时间；简单模式：气泡
            if (c.dodgeEffectEnabled && attacker && dodger) {
                c.isPaused = true; GlobalStore.set('isPaused', true); GlobalStore.set('bulletTimeActive', true);
                await eventBus.emit(FX_SIGNALS.CRITICAL_BANNER, { text: '✨闪避反击✨' });
                // ★ 子弹时间必须走直接 await，不能走 eventBus 异步通道：
                //   emit 是同步调用（infra/50-event-bus.js），不等待监听器返回的 Promise，
                //   否则动画后台并行播放、战斗继续推进。主循环 await 阻塞，动画播完才恢复。
                const { showDodgeBulletTime } = await import('../fx/85fx-dodge-bullet.js');
                await showDodgeBulletTime(attacker, dodger, action.reboundDmg || 0);
                GlobalStore.set('bulletTimeActive', false); GlobalStore.set('isPaused', false); c.isPaused = false;
            } else if (attacker) {
                eventBus.emit(FX_SIGNALS.DODGE_BUBBLE, { unit: attacker, text: '闪避！' });
                // ★ 简单模式闪避反击：近战攻击者需补发 TRIGGER 信号，触发飞撞击退动画。
                //    _triggerFX 里 isDodge=true 且 dodgeEffectEnabled=false 时，会调用 showMeleeDodge(闪避者, 攻击者)，
                //    实现"飞撞过去 → 被击退回来"的完整动画。远程攻击者不走飞撞，只保持气泡提示。
                if (attacker.role !== ROLE_TYPES.RANGED && dodger) {
                    eventBus.emit(FX_SIGNALS.TRIGGER, {
                        fxSnapshot: action.fx || null,
                        unitA: attacker,
                        unitD: dodger,
                        isDead: false,
                        isDodge: true,
                        isMiss: false,
                        isBlock: false,
                        dmg: action.reboundDmg || 0,
                        waveTaunt: null,
                        waveUnitUid: null,
                        waveUnit: null,
                        attackerRole: attacker.role
                    });
                }
            }
            // ★ 闪避反击结束后，攻击者格子应进入眩晕显示（😵 图标），这里只是确保特效期间不残留样式；
            //   实际状态同步已由 store handler 完成，此处不重复写，避免与 store 双写冲突。
        }
    },
    [STAGE_ACTION_TYPES.POS_SWAP]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        store: (c, action, pendingDeaths) => {
            if (action.actorUid && action.targetUid) {
                c.store.dispatch({ type: STORE_ACTION_TYPES.APPLY_EVENTS, events: [
                    { eventType: UNIT_EVENT_TYPES.POS_CHANGE, uid: action.actorUid, pos: action.oldPosB },
                    { eventType: UNIT_EVENT_TYPES.POS_CHANGE, uid: action.targetUid, pos: action.oldPosA }
                ]});
            }
        },
        fx: async (c, action) => {
            const unitA = findUnitByUidLocal(c, action.actorUid);
            const unitB = findUnitByUidLocal(c, action.targetUid);
            if (unitA && unitB) {
                c.isPaused = true; GlobalStore.set('bulletTimeActive', true);
                // ★ 换位动画同样直接 await：原 eventBus.emit(POSITION_SWAP) 同步派发不等待动画完成。
                //   惑心判定横幅已由 MIND_CONTROL_BANNER → BANNER 动作独立播放（两条判定各一条），
                //   此处只负责换位特效，成功判定时紧跟在判定横幅之后
                const { animatePositionSwap } = await import('../fx/87fx-manager.js');
                await animatePositionSwap(unitA, unitB, c, {
                    skipDataChange: true,
                    oldPositions: (action.oldPosA != null && action.oldPosB != null) ? [action.oldPosA, action.oldPosB] : null
                });
                GlobalStore.set('bulletTimeActive', false); c.isPaused = false;
            }
        }
    },
    [STAGE_ACTION_TYPES.PUSH]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        store: (c, action, pendingDeaths) => {
            if (action.actorUid && action.targetUid) {
                c.store.dispatch({ type: STORE_ACTION_TYPES.APPLY_EVENTS, events: [
                    { eventType: UNIT_EVENT_TYPES.POS_CHANGE, uid: action.actorUid, pos: action.newPos },
                    { eventType: UNIT_EVENT_TYPES.POS_CHANGE, uid: action.targetUid, pos: action.oldPos }
                ]});
            } else if (action.actorUid && action.newPos != null) {
                c.store.dispatch({ type: STORE_ACTION_TYPES.APPLY_EVENTS, events: [
                    { eventType: UNIT_EVENT_TYPES.POS_CHANGE, uid: action.actorUid, pos: action.newPos }
                ]});
            }
        },
        fx: async (c, action) => {
            const target = findUnitByUidLocal(c, action.actorUid);
            if (!target) return;
            c.isPaused = true; GlobalStore.set('bulletTimeActive', true);
            await eventBus.emit(FX_SIGNALS.BANNER, { text: '🦅 乘风突袭！' });
            if (action.targetUid) {
                const behind = findUnitByUidLocal(c, action.targetUid);
                if (behind) {
                    await eventBus.emit(FX_SIGNALS.PUSH_SWAP, { target, behind, c, opts: { skipDataChange: true } });
                }
            } else {
                await eventBus.emit(FX_SIGNALS.PUSH_BACK, { target, c, newPos: action.newPos, opts: { skipDataChange: true } });
            }
            GlobalStore.set('bulletTimeActive', false); c.isPaused = false;
        }
    },
    [STAGE_ACTION_TYPES.SUMMON]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        store: (c, action, pendingDeaths) => {
            if (action.actorUid) {
                const unit = c.store.getState().units.find(u => u.uid === action.actorUid);
                if (unit) {
                    c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: unit.uid, _acted: false });
                }
            }
        },
        fx: async (c, action) => {
            const horse = findUnitByUidLocal(c, action.actorUid);
            if (horse) {
                c.isPaused = true;
                await eventBus.emit(FX_SIGNALS.BANNER, { text: '🐴 拒马阵！' + (action.taunt || '') });
                c.isPaused = false;
            }
        }
    },
    [STAGE_ACTION_TYPES.DESTROY]: {
        grid: 'sync', log: 'sync', timing: 'afterText',
        store: (c, action, pendingDeaths) => {
            if (action.success && action.actorUid) {
                c.store.dispatch({ type: STORE_ACTION_TYPES.REMOVE_UNIT, uid: action.actorUid });
            }
        },
        fx: async (c, action) => {
            if (action.success && action.actorUid) {
                c.isPaused = true;
                await eventBus.emit(FX_SIGNALS.BANNER, { text: '🐴 拒马已销毁' });
                c.isPaused = false;
            }
        }
    },
    [STAGE_ACTION_TYPES.TRANSFORM]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        store: (c, action, pendingDeaths) => {
            // 张无忌切近战：解除休息态（SPIDER_TRANSFORM 无副作用）
            if (action.actorUid && action.danmaku) {
                c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: action.actorUid, _resting: false });
            }
        },
        fx: (c, action) => {
            // 变身/切形态：张无忌弹幕（zhangSwitch），蛛变无特效
            const unit = findUnitByUidLocal(c, action.actorUid);
            if (action.danmaku && unit && !GlobalStore.get('fastForwardActive')) {
                eventBus.emit(FX_SIGNALS.DANMAKU, { unit, text: action.danmaku });
            }
        }
    },
    [STAGE_ACTION_TYPES.FLY_MODE]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        fx: (c, action) => {
            const unit = findUnitByUidLocal(c, action.actorUid);
            if (!unit) return;
            // butterflyAttach / butterflyReturn / spiderFly / spiderReturn 等由 31 翻译，
            // 特效按 originalFactType 区分
            if (action.originalFactType === FLY_MODE_TYPES.BUTTERFLY_ATTACH) {
                const host = findUnitByUidLocal(c, action.hostUid);
                if (host) eventBus.emit(FX_SIGNALS.BUTTERFLY_FLY_OUT, { sister: unit, host });
            } else if (action.originalFactType === FLY_MODE_TYPES.BUTTERFLY_RETURN) {
                const host = findUnitByUidLocal(c, action.hostUid);
                if (host) eventBus.emit(FX_SIGNALS.BUTTERFLY_FLY_BACK, { host, sister: unit });
            } else if (action.originalFactType === FLY_MODE_TYPES.SPIDER_FLY) {
                eventBus.emit(FX_SIGNALS.SPIDER_ASCEND, { unit });
            } else if (action.originalFactType === FLY_MODE_TYPES.SPIDER_RETURN) {
                eventBus.emit(FX_SIGNALS.SPIDER_DESCEND, { unit });
            }
        }
    },
    [STAGE_ACTION_TYPES.ROUND_START]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        store: (c, action, pendingDeaths) => {
            c.store.getState().units.forEach(u => {
                if (u.alive) c.store.dispatch({ type: STORE_ACTION_TYPES.SET_VISUAL, uid: u.uid, _acted: false });
            });
        }
    },
    [STAGE_ACTION_TYPES.ROUND_END]: { grid: 'sync', log: 'sync', timing: 'afterText' },
    [STAGE_ACTION_TYPES.REST]: { grid: 'sync', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.DOT]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        store: (c, action, pendingDeaths) => {
            if (action.dead && action.targetUid && pendingDeaths) pendingDeaths.push(action.targetUid);
        },
        fx: (c, action) => {
            const target = findUnitByUidLocal(c, action.targetUid);
            if (target && action.dmg && !GlobalStore.get('fastForwardActive')) {
                eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: target, dmg: action.dmg });
            }
        }
    },
    [STAGE_ACTION_TYPES.EXECUTE]: {
        grid: 'sync', log: 'sync', timing: 'afterText',
        store: (c, action, pendingDeaths) => {
            if (action.dead && action.targetUid && pendingDeaths) pendingDeaths.push(action.targetUid);
        },
        fx: (c, action) => {
            const target = findUnitByUidLocal(c, action.targetUid);
            if (target && action.dmg && !GlobalStore.get('fastForwardActive')) {
                eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: target, dmg: action.dmg });
            }
        }
    },
    [STAGE_ACTION_TYPES.MISS]: {
        grid: 'none', log: 'sync', timing: 'afterText',
        fx: (c, action) => {
            const attacker = findUnitByUidLocal(c, action.actorUid);
            const target = findUnitByUidLocal(c, action.targetUid);
            if (attacker && !GlobalStore.get('fastForwardActive')) {
                eventBus.emit(FX_SIGNALS.DODGE_BUBBLE, { unit: attacker, text: '未命中' });
                // 近战/飞行未命中补发飞撞击打动画（远程保持气泡即可）
                if (attacker.role !== ROLE_TYPES.RANGED && target) {
                    eventBus.emit(FX_SIGNALS.TRIGGER, {
                        fxSnapshot: action.fx || null,
                        unitA: attacker,
                        unitD: target,
                        isDead: false,
                        isDodge: false,
                        isMiss: true,
                        isBlock: false,
                        dmg: 0,
                        waveTaunt: null,
                        waveUnitUid: null,
                        waveUnit: null,
                        attackerRole: attacker.role
                    });
                }
            }
        }
    },
    [STAGE_ACTION_TYPES.IMMUNE]: { grid: 'none', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.STAT_CHANGE]: { grid: 'sync', log: 'sync', timing: 'afterText' },
    [STAGE_ACTION_TYPES.BANNER]: {
        grid: 'none', log: 'sync', timing: 'beforeText',
        fx: async (c, action) => {
            // 通用横幅（概率连击等）
            // ★ 必须直接 await showBuffBanner：eventBus.emit 为同步派发（infra/50，监听器 Promise 被丢弃），
            //   走 emit 则 isPaused 立即复位、横幅后台空转，视觉上"刷一下就过去"；直接 await 才能真正阻塞主循环
            if (action.text && !GlobalStore.get('fastForwardActive')) {
                c.isPaused = true; GlobalStore.set('bulletTimeActive', true);
                const { showBuffBanner } = await import('../fx/87fx-manager.js');
                await showBuffBanner(action.text);
                GlobalStore.set('bulletTimeActive', false); c.isPaused = false;
            }
        }
    },
    [STAGE_ACTION_TYPES.EMPTY_TARGET]: { grid: 'none', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.STUN]: { grid: 'sync', log: 'sync', timing: 'beforeText' },
    [STAGE_ACTION_TYPES.SPLASH]: {
        grid: 'sync', log: 'sync', timing: 'afterText',
        fx: (c, action) => {
            if (action.splashUids && action.splashDmg && !GlobalStore.get('fastForwardActive')) {
                action.splashUids.forEach(uid => {
                    const t = findUnitByUidLocal(c, uid);
                    if (t) eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: t, dmg: action.splashDmg });
                });
            }
        }
    },
    [STAGE_ACTION_TYPES.SPIDER_STRIKE]: {
        grid: 'sync', log: 'sync', timing: 'beforeText',
        store: (c, action, pendingDeaths) => {
            if (action.dead && action.targetUid && pendingDeaths) pendingDeaths.push(action.targetUid);
        },
        fx: async (c, action) => {
            const spiderUnit = findUnitByUidLocal(c, action.actorUid);
            const strikeTarget = findUnitByUidLocal(c, action.targetUid);
            if (spiderUnit && strikeTarget) {
                c.isPaused = true;
                GlobalStore.set('bulletTimeActive', true);
                await eventBus.emit(FX_SIGNALS.SPIDER_STRIKE, { spiderUnit, strikeTarget });
                GlobalStore.set('bulletTimeActive', false);
                c.isPaused = false;
            }
        }
    },
    [STAGE_ACTION_TYPES.BUFF_EFFECT]: {
        grid: 'none', log: 'sync',
        timing: (action) => (action && action.effectType === BUFF_EFFECT_TYPES.XIN_HUN) ? 'beforeText' : 'afterText',
        fx: async (c, action) => {
            const attacker = findUnitByUidLocal(c, action.attackerUid);
            const target = findUnitByUidLocal(c, action.targetUid);
            const primary = findUnitByUidLocal(c, action.primaryUid);
            if (action.effectType === BUFF_EFFECT_TYPES.SPLASH && attacker && primary && action.splashUids && action.splashUids.length > 0) {
                const splashTargets = action.splashUids.map(uid => findUnitByUidLocal(c, uid)).filter(u => u);
                if (splashTargets.length > 0) {
                    // 乘风突袭：风爪 + 专属横幅，不放箭、不延时；否则走流星箭雨
                    if (action.buffType === BUFF_SUBTYPES.WIND_ASSAULT) {
                        c.isPaused = true; GlobalStore.set('bulletTimeActive', true);
                        await eventBus.emit(FX_SIGNALS.BANNER, { text: '🦅 乘风突袭！' });
                        splashTargets.forEach(u => eventBus.emit(FX_SIGNALS.WIND_CLAW, { unit: u }));
                        GlobalStore.set('bulletTimeActive', false); c.isPaused = false;
                    } else {
                        c.isPaused = true; GlobalStore.set('bulletTimeActive', true);
                        await eventBus.emit(FX_SIGNALS.BANNER, { text: '☄️ 流星赶月！' });
                        eventBus.emit(FX_SIGNALS.SPLASH_ARROWS, { attacker, primary, targets: splashTargets, speed: c.speed, isPausedFn: () => c.isPaused });
                        splashTargets.forEach((st, i) => { setTimeout(() => AudioManager.playSfx(attacker.role || ROLE_TYPES.RANGED), i * 120); });
                        GlobalStore.set('bulletTimeActive', false); c.isPaused = false;
                        await new Promise(r => setTimeout(r, GlobalStore.get('fastForwardActive') ? 1 : 600));
                    }
                }
            } else if (action.effectType === BUFF_EFFECT_TYPES.BONE_CLAW && attacker && target) {
                if (action.dmg && !GlobalStore.get('fastForwardActive')) {
                    eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: target, dmg: action.dmg });
                }
                eventBus.emit(FX_SIGNALS.BONE_CLAW, { attacker, target, speed: c.speed, isPausedFn: () => c.isPaused, opts: { isExecute: action.isExecute } });
                // 每个爪击依次播放，避免多爪动画同时启动重叠
                if (!GlobalStore.get('fastForwardActive')) {
                    await new Promise(r => setTimeout(r, Math.max(600, c.speed * 1.2)));
                }
            } else if (action.effectType === BUFF_EFFECT_TYPES.ATK_BUFF && target && action.gain) {
                eventBus.emit(FX_SIGNALS.ATK_BUFF_FLOAT, { unit: target, gain: action.gain });
            } else if (action.effectType === BUFF_EFFECT_TYPES.XIN_HUN) {
                // 新婚快乐：宋青书/周芷若爱心 + 扣血飘字
                const song = c.store ? c.store.getState().units.find(u => u.name === '宋青书') : null;
                const zhou = findUnitByUidLocal(c, action.targetUid);
                if (song) eventBus.emit(FX_SIGNALS.HEART_EFFECT, { unit: song });
                if (zhou) eventBus.emit(FX_SIGNALS.HEART_EFFECT, { unit: zhou });
                if (zhou && zhou.alive) eventBus.emit(FX_SIGNALS.PINK_FLASH, { unit: zhou });
                if (zhou && action.dmg && !GlobalStore.get('fastForwardActive')) {
                    eventBus.emit(FX_SIGNALS.DAMAGE_FLOAT, { unit: zhou, dmg: action.dmg });
                }
            }
        }
    },
    [STAGE_ACTION_TYPES.HP_PCT_DANMAKU]: {
        grid: 'none', log: 'sync', timing: 'afterText',
        fx: (c, action) => {
            const target = findUnitByUidLocal(c, action.targetUid);
            if (target && action.text && !GlobalStore.get('fastForwardActive')) {
                eventBus.emit(FX_SIGNALS.DANMAKU, { unit: target, text: action.text });
            }
        }
    }
};