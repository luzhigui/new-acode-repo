// core/10battle-attack.js - 光明顶5v5 攻击流程模块
// V5.6.3 | ~10750 bytes| 2026-08-26 修复 processUnitAttack 内孤立多余 }（函数提前闭合导致 ESM 加载失败）
export const VER = 'core/10battle-attack.js V5.6.3';

import { CONFIG } from './01config-5v5-test.js';
import { hasBuff, makeFXSnapshot, isBlocked } from './03battle-utils.js';

import { computeBuffStats } from './04buff-system.js';
import {
    selectAttackTarget,
    resolveAttackHit,
    calcFinalDamage,
    applyAttackResult,
    buildAttackGroup,
    resolveDamageImmune,
    resolveAfterDamageEffects,
    resolveDeaths
} from './12battle-attack-steps.js';
import { eventBus, EFFECT_TYPES } from '../infra/50-event-bus.js';
import { flushBattleEvents } from '../infra/51-core-utils.js';
import { getEliteState } from './18-elite-state.js';

import { emitEvent, applyStatChange, recordCombatStat } from './13battle-shared.js';
import { FACT_TYPES, BUFF_TYPES } from '../infra/56-battle-enums.js';

const C = CONFIG;

export async function processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, lockedTargetUid) {
    if (unit.state._stunned) {
        log.push({ factType: FACT_TYPES.STUN_SKIP, data: { unitName: unit.name } });
        unit.state._acted = true;
        return false;
    }
    if (getEliteState(unit.uid)._spiderFlying || getEliteState(unit.uid)._flyMode === 'spider' || (unit._fsm && unit._fsm.is('flying'))) {
        log.push({ factType: FACT_TYPES.FLY_SKIP, data: { unitName: unit.name } });
        unit.state._acted = true;
        return false;
    }

    let target, phantomFact;
    if (lockedTargetUid) {
        target = enemySide.find(u => u.uid === lockedTargetUid && u.alive) || null;
        phantomFact = null;
        if (!target) {
            const emptyFact = {
                type: 'emptyTarget',
                attacker: { uid: unit.uid, name: unit.name, camp: unit.camp },
                reason: '锁定目标已阵亡，跳过行动',
                events: []
            };
            emptyFact.events = flushBattleEvents();
            log.push({ factType: FACT_TYPES.EMPTY_TARGET, data: emptyFact });
            unit.state._acted = true;
            return false;
        }
    } else {
        let targetResult = selectAttackTarget(unit, enemySide, allySide);
        target = targetResult.target;
        phantomFact = targetResult.phantomFact;
    }

    if (!target) {
        const emptyFact = {
            type: 'emptyTarget',
            attacker: { uid: unit.uid, name: unit.name, camp: unit.camp },
            reason: '无可选目标，跳过行动',
            events: []
        };
        emptyFact.events = flushBattleEvents();
        log.push({ factType: FACT_TYPES.EMPTY_TARGET, data: emptyFact });
        unit.state._acted = true;
        return false;
    }

    let unitActiveBuffs = unit.camp === 'ally' ? A._activeBuffs : B._activeBuffs;
    let unitAllyTeam = unit.camp === 'ally' ? A : B;
    if (hasBuff(unitActiveBuffs, BUFF_TYPES.CARRY) && unit.camp === 'ally') {
        unitAllyTeam = unitAllyTeam.concat((state.allAllies || state.ally).filter(c => !c.alive));
        unitAllyTeam = unitAllyTeam.filter((u, i, arr) => arr.findIndex(v => v.uid === u.uid) === i);
    }
    let attackerBuffStats = computeBuffStats(unit, unitActiveBuffs, unitAllyTeam);
    let targetActiveBuffs = target.camp === 'ally' ? A._activeBuffs : B._activeBuffs;
    let targetAllyTeam = target.camp === 'ally' ? A : B;
    let defenderBuffStats = computeBuffStats(target, targetActiveBuffs, targetAllyTeam);

    let hitResult = resolveAttackHit(unit, target, attackerBuffStats, defenderBuffStats, log, A, B, doubleStrikeUnitUid, eventBus);
    if (hitResult.skipped) {
        if (hitResult.missFact) {
            log.push({ factType: FACT_TYPES.MISS, data: hitResult.missFact });
        }
        if (hitResult.dodgeFact) {
            const dodgeFact = hitResult.dodgeFact;
            if (dodgeFact.attackerHpAfter <= 0) {
                unit.alive = false; unit._pendingDeath = true;
                emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: false, atk: unit.atk, def: unit.def, _isDead: true });
            }
            log.push({ factType: FACT_TYPES.DODGE, data: dodgeFact });
        }
        if (hitResult.extraRequests && hitResult.extraRequests.length > 0) {
            hitResult.extraRequests.sort((a, b) => (a.priority || 0) - (b.priority || 0));
            const executedUids = new Set();
            for (const req of hitResult.extraRequests) {
                if (executedUids.has(req.unit.uid)) continue;
                if (!req.unit.alive) continue;
                executedUids.add(req.unit.uid);
                if (req.actedMode === 'allow') req.unit.state._acted = false;
                const retryUid = req.targetUid || null;
                await processUnitAttack(req.unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, retryUid);
            }
        }
        return true;
    }

    if (unit.state._stunned) {
        unit.state._acted = true;
        return true;
    }

    eventBus.emit('beforeAttack', { unit, allySide, enemySide, log });
    let dmgCalc = calcFinalDamage(unit, target, attackerBuffStats, defenderBuffStats, allySide, enemySide, log);

    const immuneDeclarations = [];
    eventBus.emit('beforeDamageApply', { target, dmg: dmgCalc.dmg, hpBefore: target.hp, A, log, declarations: immuneDeclarations });

    let dmgResult = applyAttackResult(unit, target, dmgCalc, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);
    const immuneResult = resolveDamageImmune(immuneDeclarations);
    if (immuneResult) {
        applyStatChange(target, 'hp', dmgCalc.dmg, null, '免疫回退', false);
        // 免疫回退：承伤已记，只退输出（走统一记账入口）
        recordCombatStat(unit, target, 'immuneRollback', {
            rawAmount: 0,
            actualAmount: dmgCalc.dmg
        });
        emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def });

        const immuneHpPctBefore = Math.floor((Math.min(target.hp + dmgCalc.dmg, target.maxHp) / target.maxHp) * 100);
        const immuneHpPctAfter = Math.floor((target.hp / target.maxHp) * 100);
        const immuneFact = {
            type: 'immune',
            attacker: { uid: unit.uid, name: unit.name, camp: unit.camp },
            target: { uid: target.uid, name: target.name, camp: target.camp },
            reason: immuneResult.reason || null,
            flyData: immuneResult.flyData || null,
            attackerAtk: Math.floor(unit.atk),
            attackerHp: Math.floor(unit.hp),
            targetDef: Math.floor(target.def),
            targetHp: Math.floor(target.hp),
            hpPctBefore: immuneHpPctBefore,
            hpPctAfter: immuneHpPctAfter,
            events: []
        };
        immuneFact.events = flushBattleEvents();
        log.push({ factType: FACT_TYPES.IMMUNE, data: immuneFact });

        if (!getEliteState(unit.uid)._isLinkAttack) unit.state._acted = true;
        return true;
    }

    const group = await buildAttackGroup(unit, target, dmgCalc, dmgResult, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, phantomFact);

    log.push(group);

    const postReboundEntry = dmgResult.reboundEntry;
    if (postReboundEntry) { log.push(postReboundEntry); }

    if (dmgCalc.derivedEntries && dmgCalc.derivedEntries.length > 0) {
        for (const entry of dmgCalc.derivedEntries) {
            group.data.entries.push(entry);
        }
    }

    const afterDamageExtraRequests = [];
    const afterDamageDeclarations = [];
    eventBus.emit('afterDamageApplied', { unit, target, dmg: dmgCalc.dmg, group, allySide, enemySide, log, A, B, declarations: afterDamageDeclarations, extraRequests: afterDamageExtraRequests });

    if (dmgResult.fortifyDeclarations && dmgResult.fortifyDeclarations.length > 0) {
        afterDamageDeclarations.push(...dmgResult.fortifyDeclarations);
    }
    if (dmgResult.horseReboundDeclarations && dmgResult.horseReboundDeclarations.length > 0) {
        afterDamageDeclarations.push(...dmgResult.horseReboundDeclarations);
    }
    const executedDecls = resolveAfterDamageEffects(afterDamageDeclarations, unit, target, group, allySide, unitActiveBuffs);
    for (const decl of executedDecls) {
        if (decl._events && decl._events.length > 0) {
            if (!group._events) group._events = [];
            group._events.push(...decl._events);
        }
        if (group && group.data.entries && (decl.logText || decl.factType)) {
            const entry = decl.factType
                ? { factType: decl.factType, data: decl.factData }
                : { type: decl.type === EFFECT_TYPES.SPLASH ? 'buff-splash' : 'info', text: decl.logText };
            if (decl.type === EFFECT_TYPES.LEECH || decl.type === EFFECT_TYPES.HEAL) {
                entry.isHealEntry = true;
                entry.healAmount = decl.value || 0;
                entry.healUnitUid = decl.source ? decl.source.uid : null;
            }
            if (decl.buffType) entry.buffType = decl.buffType;
            if (decl.isDouble) entry.isDouble = decl.isDouble;
            if (decl.attackerUid) entry.attackerUid = decl.attackerUid;
            if (decl.primaryUid) entry.primaryUid = decl.primaryUid;
            if (decl.splashUids) entry.splashUids = decl.splashUids;
            if (decl.splashDmg !== undefined) entry.splashDmg = decl.splashDmg;
            group.data.entries.push(entry);
        }
    }
    if ((target._pendingDeath || target.hp <= 0) && !dmgResult.dead) {
        const hasExecute = executedDecls.some(d => d.type === EFFECT_TYPES.EXECUTE && d.target === target);
        if (hasExecute) {
            dmgResult.executeKill = true;
        }
    }

    if (afterDamageExtraRequests.length > 0) {
        afterDamageExtraRequests.sort((a, b) => (a.priority || 0) - (b.priority || 0));
        const executedUids = new Set();
        for (const req of afterDamageExtraRequests) {
            if (executedUids.has(req.unit.uid)) continue;
            if (!req.unit.alive) continue;
            executedUids.add(req.unit.uid);
            if (req.actedMode === 'allow') req.unit.state._acted = false;
            const extraTargetUid = req.targetUid || (target && target.alive ? target.uid : null);
            await processUnitAttack(req.unit, allySide, enemySide, log, A, B, state, null, extraTargetUid);
        }
    }

    if (!getEliteState(unit.uid)._isLinkAttack) unit.state._acted = true;

    group._events = (group._events || []).concat(flushBattleEvents());

    const extraRequests = [];
    const afterAttackData = { unit, target, dmg: dmgCalc.dmg, group, allySide, enemySide, log, A, B, state, declarations: [], extraRequests };
    await eventBus.emit('afterAttack', afterAttackData);
    if (afterAttackData.declarations.length > 0) {
        const clawExecuted = resolveAfterDamageEffects(afterAttackData.declarations, unit, target, group, allySide, unitActiveBuffs);
        for (const decl of clawExecuted) {
            if (decl._events && decl._events.length > 0) {
                if (!group._events) group._events = [];
                group._events.push(...decl._events);
            }
            if (decl.type === EFFECT_TYPES.CLAW_CHAIN) {
            if (decl.hits) {
                for (const hit of decl.hits) {
                    if ((hit.logText || hit.factType) && group && group.data.entries) {
                        const e = hit.factType
                            ? { factType: hit.factType, data: hit.data }
                            : { type: 'info', text: hit.logText };
                        if (hit.isClawHit) { e.isClawHit = true; e.clawAttackerUid = hit.clawAttackerUid; e.clawTargetUid = hit.clawTargetUid; e.isExecute = hit.isExecute; }
                        group.data.entries.push(e);
                    }
                }
            }
            if (decl.execute && (decl.execute.logText || decl.execute.factType) && group && group.data.entries) {
                const e = decl.execute.factType
                    ? { factType: decl.execute.factType, data: decl.execute.data }
                    : { type: 'info', text: decl.execute.logText };
                if (decl.execute.isClawHit) { e.isClawHit = true; e.clawAttackerUid = decl.execute.clawAttackerUid; e.clawTargetUid = decl.execute.clawTargetUid; e.isExecute = true; }
                group.data.entries.push(e);
            }
        } else if ((decl.logText || decl.factType) && group && group.data.entries) {
            group.data.entries.push(decl.factType
                ? { factType: decl.factType, data: decl.factData }
                : { type: 'info', text: decl.logText });
        }
        }
    }
    if (extraRequests.length > 0) {
        extraRequests.sort((a, b) => (a.priority || 0) - (b.priority || 0));
        const executedUids = new Set();
        for (const req of extraRequests) {
            if (executedUids.has(req.unit.uid)) continue;
            if (!req.unit.alive) continue;
            if (req.reason === 'doubleStrike' && !req.ignoreBlock && isBlocked(req.unit, allySide)) continue;
            executedUids.add(req.unit.uid);
            req.unit.state._acted = false;
            const extraTargetUid = req.targetUid || (target && target.alive ? target.uid : null);
            await processUnitAttack(req.unit, allySide, enemySide, log, A, B, state, null, extraTargetUid);
            if (req.actedMode === 'restore') {
                req.unit.state._acted = req.actedSnapshot;
            }
        }
    }

    resolveDeaths(allySide, enemySide, log);

    return true;
}