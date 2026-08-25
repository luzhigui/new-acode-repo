// render/31-stage-actions.js - 光明顶5v5 舞台动作翻译器
// V5.7.6 | ~15750 bytes| 2026-08-26 summon 动作携带 horseTaunt 台词
export const VER = 'render/31-stage-actions.js V5.7.6';

import { makeFXSnapshot } from '../infra/51-core-utils.js';

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
        case 'roundStart':
            return { kind: 'roundStart', round: data.round, factIndex: index, timing: 'beforeText' };
        case 'roundEnd':
            return { kind: 'roundEnd', round: data.round, factIndex: index, timing: 'afterText' };
        case 'pass':
            return {
                kind: 'rest',
                actorUid: data.unit?.uid ?? data.unitUid ?? null,
                reason: data.reason,
                factIndex: index,
                timing: 'beforeText'
            };

        // ---------- 攻击流程 ----------
        case 'attack':
            return makeAttackAction(data, index);
        case 'miss':
            return {
                kind: 'miss',
                actorUid: data.attacker?.uid ?? null,
                targetUid: data.target?.uid ?? null,
                fx: data.fxSnapshot || null,
                factIndex: index,
                timing: 'afterText'
            };
        case 'dodge':
            return {
                kind: 'dodge',
                actorUid: data.attacker?.uid ?? null,
                targetUid: data.dodger?.uid ?? null,
                reboundDmg: data.reboundDmg,
                dead: data.attackerHpAfter <= 0,
                fx: data.fxSnapshot || null,
                factIndex: index,
                timing: 'beforeText'
            };
        case 'immune':
            return {
                kind: 'immune',
                actorUid: data.attacker?.uid ?? null,
                targetUid: data.target?.uid ?? null,
                factIndex: index,
                timing: 'beforeText'
            };
        case 'emptyTarget':
            return {
                kind: 'emptyTarget',
                actorUid: data.attacker?.uid ?? null,
                reason: data.reason,
                factIndex: index,
                timing: 'beforeText'
            };
        case 'warriorExecute':
        case 'clawExecute':
            return {
                kind: 'execute',
                actorUid: data.unitUid ?? data.unit?.uid ?? null,
                targetUid: data.targetUid ?? data.uidD ?? data.target?.uid ?? null,
                dmg: data.dmg ?? null,
                dead: data.isDead ?? true,
                factIndex: index,
                timing: 'afterText'
            };
        case 'xinHunDeath':
            return {
                kind: 'death',
                actorUid: data.uidD ?? null,
                targetUid: data.uidD ?? null,
                dead: true,
                factIndex: index,
                timing: 'afterText'
            };
        case 'spiderStrike':
            return {
                kind: 'spiderStrike',
                actorUid: data.unitUid ?? null,
                targetUid: data.targetUid ?? null,
                dmg: data.totalDmg,
                dead: data.isDead,
                factIndex: index,
                timing: 'beforeText'
            };
        case 'horseRebound':
            return {
                kind: 'rebound',
                actorUid: data.attackerUid ?? null,
                targetUid: data.unitUid ?? null,
                dmg: Math.round(data.rebound ?? 0),
                factIndex: index,
                timing: 'afterText'
            };
        case 'fortifyRebound':
            return {
                kind: 'rebound',
                actorUid: data.attackerUid ?? null,
                targetUid: data.unitUid ?? null,
                dmg: Math.round(data.reboundDmg ?? 0),
                factIndex: index,
                timing: 'afterText'
            };

        // ---------- 血量 / 治疗 ----------
        case 'xuanmingDot':
            return {
                kind: 'dot',
                targetUid: data.uidD ?? null,
                dmg: data.dot,
                dead: data.isDead,
                factIndex: index,
                timing: 'beforeText'
            };
        case 'kuaiLeHeal':
        case 'nineYangHeal':
        case 'weiLeech':
        case 'phantomDisguiseHeal':
        case 'clawHeal':
        case 'hotBloodHeal':
        case 'bloodthirstLeech':
            return makeHealAction(data, index);

        // ---------- 位置 / 换位 / 击退 ----------
        case 'mindControlSwap':
            return {
                kind: 'posSwap',
                actorUid: data.unitA?.uid ?? null,
                targetUid: data.unitB?.uid ?? null,
                oldPosA: data.posA,
                oldPosB: data.posB,
                factIndex: index,
                timing: 'beforeText'
            };
        case 'windAssaultPush':
            return {
                kind: 'push',
                actorUid: data.target?.uid ?? null,
                targetUid: data.behindUnit?.uid ?? null,
                oldPos: data.oldPos,
                newPos: data.behindPos,
                behindOldPos: data.behindOldPos ?? null,
                factIndex: index,
                timing: 'beforeText'
            };

        // ---------- 属性 / 增益 ----------
        case 'kuLian':
        case 'rangedGrowth':
        case 'fortifyShield':
        case 'carryApply':
        case 'qianKunDerived':
        case 'meteorShowerMain':
        case 'meteorSplashGrowth':
            return {
                kind: 'statChange',
                actorUid: data.unitUid ?? data.unit?.uid ?? null,
                factIndex: index,
                timing: 'afterText'
            };

        // ---------- 召唤 / 销毁 ----------
        case 'horseSummon':
        case 'xiaoZhaoHorse':
            return {
                kind: 'summon',
                actorUid: data.horseUid ?? null,
                pos: data.pos ?? data.horsePos,
                taunt: data.horseTaunt ?? null,
                factIndex: index,
                timing: 'beforeText'
            };
        case 'horseDestroy':
            return {
                kind: 'destroy',
                actorUid: data.horseUid ?? null,
                success: data.success,
                factIndex: index,
                timing: 'afterText'
            };

        // ---------- 变身 / 飞行 ----------
        case 'zhangSwitch':
        case 'spiderTransform':
            return {
                kind: 'transform',
                actorUid: data.unitUid ?? data.zhang?.uid ?? null,
                factIndex: index,
                timing: 'beforeText'
            };
        case 'spiderFly':
            return {
                kind: 'flyMode',
                actorUid: data.spiderUid ?? data.unitUid ?? null,
                originalFactType: 'spiderFly',
                factIndex: index,
                timing: 'beforeText'
            };
        case 'spiderReturn':
            return {
                kind: 'flyMode',
                actorUid: data.spiderUid ?? data.unitUid ?? null,
                originalFactType: 'spiderReturn',
                factIndex: index,
                timing: 'beforeText'
            };
        case 'butterflyAttach':
            return {
                kind: 'flyMode',
                actorUid: data.sisterUid ?? null,
                hostUid: data.hostUid ?? null,
                originalFactType: 'butterflyAttach',
                factIndex: index,
                timing: 'beforeText'
            };
        case 'butterflyReturn':
            return {
                kind: 'flyMode',
                actorUid: data.sisterUid ?? null,
                hostUid: data.hostUid ?? null,
                originalFactType: 'butterflyReturn',
                factIndex: index,
                timing: 'beforeText'
            };
        case 'butterflyHostDead':
        case 'butterflyNoHost':
        case 'flySkip':
            return {
                kind: 'flyMode',
                actorUid: data.unitUid ?? data.spiderUid ?? data.sisterUid ?? data.unit?.uid ?? null,
                factIndex: index,
                timing: 'beforeText'
            };
        case 'stunSkip':
            return {
                kind: 'stun',
                actorUid: data.unitUid ?? data.unit?.uid ?? null,
                factIndex: index,
                timing: 'beforeText'
            };

        // ---------- 技能波及 / 附加 ----------
        case 'windAssaultSplash':
        case 'meteorShowerSplash':
            return {
                kind: 'splash',
                actorUid: data.attackerUid ?? data.unitUid ?? null,
                targetUid: data.primaryUid ?? null,
                splashUids: data.splashUids ?? data.targets?.map(t => t.uid) ?? [],
                splashDmg: data.splashDmg ?? null,
                factIndex: index,
                timing: 'afterText'
            };

        // ---------- 横幅 / 摘要 ----------
        case 'doubleStrike':
        case 'xingFenGrant':
        case 'doubleStrikeSummary':
            return {
                kind: 'banner',
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
        kind: 'attack',
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
        if (e.type === 'buff-splash' || (e.factType && ['meteorShowerSplash', 'windAssaultSplash'].includes(e.factType))) {
            afterTextEffects.push({
                kind: 'buffEffect',
                effectType: 'splash',
                attackerUid: e.attackerUid ?? attacker?.uid ?? null,
                primaryUid: e.primaryUid ?? target?.uid ?? null,
                splashUids: e.splashUids ?? (e.data?.targets?.map(t => t.uid) ?? []),
                splashDmg: e.splashDmg ?? null,
                buffType: e.buffType ?? null,
                factIndex: index,
                timing: 'afterText'
            });
        } else if (e.isClawHit || (e.factType && ['clawHit', 'clawExecute'].includes(e.factType))) {
            afterTextEffects.push({
                kind: 'buffEffect',
                effectType: 'boneClaw',
                attackerUid: e.clawAttackerUid ?? attacker?.uid ?? null,
                targetUid: e.clawTargetUid ?? target?.uid ?? null,
                isExecute: e.isExecute ?? false,
                factIndex: index,
                timing: 'afterText'
            });
        } else if (e.buffType === 'qiankun_atk' && e.atkTargetUid && e.atkGain) {
            afterTextEffects.push({
                kind: 'buffEffect',
                effectType: 'atkBuff',
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
                kind: 'hpPctDanmaku',
                targetUid: target?.uid ?? null,
                text: target?.camp === 'ally' ? '不好，必须反击了！' : '小儿安敢伤我！',
                factIndex: index,
                timing: 'afterText'
            });
        } else if (data.hpPctBefore > 20 && data.hpPctAfter <= 20) {
            hpPctEffects.push({
                kind: 'hpPctDanmaku',
                targetUid: target?.uid ?? null,
                text: target?.camp === 'ally' ? '撑住！' : '已是强弩之末！',
                factIndex: index,
                timing: 'afterText'
            });
        }
    }

    return [baseAction, ...afterTextEffects, ...hpPctEffects];
}

function makeHealAction(data, index) {
    return {
        kind: 'heal',
        actorUid: data.healUnitUid ?? data.unitUid ?? data.sourceUid ?? null,
        targetUid: data.healUnitUid ?? data.unitUid ?? data.sourceUid ?? null,
        amount: Math.round(data.heal ?? data.leechVal ?? data.leech ?? data.totalHeal ?? 0),
        factIndex: index,
        timing: 'beforeText'
    };
}

export const STAGE_ACTION_DEFS = {
    attack: { grid: 'sync', fx: 'sync', log: 'sync' },
    rebound: { grid: 'none', fx: 'sync', log: 'sync' },
    heal: { grid: 'sync', fx: 'sync', log: 'sync' },
    death: { grid: 'sync', fx: 'sync', log: 'sync' },
    posSwap: { grid: 'sync', fx: 'sync', log: 'sync' },
    push: { grid: 'sync', fx: 'sync', log: 'sync' },
    summon: { grid: 'sync', fx: 'sync', log: 'sync' },
    destroy: { grid: 'sync', fx: 'sync', log: 'sync' },
    transform: { grid: 'sync', fx: 'sync', log: 'sync' },
    flyMode: { grid: 'sync', fx: 'sync', log: 'sync' },
    roundStart: { grid: 'sync', fx: 'sync', log: 'sync' },
    roundEnd: { grid: 'sync', fx: 'sync', log: 'sync' },
    rest: { grid: 'sync', fx: 'sync', log: 'sync' },
    dot: { grid: 'sync', fx: 'sync', log: 'sync' },
    execute: { grid: 'sync', fx: 'sync', log: 'sync' },
    miss: { grid: 'none', fx: 'sync', log: 'sync' },
    immune: { grid: 'none', fx: 'sync', log: 'sync' },
    statChange: { grid: 'sync', fx: 'sync', log: 'sync' },
    banner: { grid: 'none', fx: 'sync', log: 'sync' },
    emptyTarget: { grid: 'none', fx: 'none', log: 'sync' },
    stun: { grid: 'sync', fx: 'sync', log: 'sync' },
    splash: { grid: 'sync', fx: 'sync', log: 'sync' },
    buffEffect: { grid: 'none', fx: 'sync', log: 'sync' },
    hpPctDanmaku: { grid: 'none', fx: 'sync', log: 'sync' }
};