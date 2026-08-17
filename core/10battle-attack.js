// core/10battle-attack.js - 光明顶5v5 攻击流程模块
// V5.5.1 | ~11000 bytes| 2026-08-17 事实化重构：日志HTML移至渲染器
export const VER = 'core/10battle-attack.js V5.5.1';

import { CONFIG, DEF_TAUNT, HP_TAUNT } from './01config-5v5-test.js';
import { hasBuff, makeFXSnapshot } from './03battle-utils.js';

import { computeBuffStats, applyBuffEffectsBeforeAttack, applyBuffEffectsAfterAttack } from './04buff-system.js';
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
import { flushBattleEvents } from '../infra/53-battle-event-store.js';
import { renderMissFact, renderDodgeFact, renderEmptyTargetFact, renderImmuneFact, renderStunSkipFact, renderFlySkipFact, renderKillLineFact } from '../render/30-fact-renderer.js';

import { emitEvent, applyStatChange } from './13battle-shared.js';

const C = CONFIG, DT = DEF_TAUNT, HT = HP_TAUNT;

export async function processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, lockedTargetUid) {
    if (unit.state._stunned) {
        log.push(renderStunSkipFact({ unitName: unit.name }));
        unit.state._acted = true;
        return false;
    }
    if (unit.state._spiderFlying || unit.state._flyMode === 'spider' || (unit._fsm && unit._fsm.is('flying'))) {
        log.push(renderFlySkipFact({ unitName: unit.name }));
        unit.state._acted = true;
        return false;
    }

    let target, phantomLog;
    if (lockedTargetUid) {
        target = enemySide.find(u => u.uid === lockedTargetUid && u.alive) || null;
        phantomLog = null;
        if (!target) {
            const emptyFact = {
                type: 'emptyTarget',
                attacker: { uid: unit.uid, name: unit.name, camp: unit.camp },
                reason: '锁定目标已阵亡，跳过行动',
                events: []
            };
            emptyFact.events = flushBattleEvents();
            log.push(renderEmptyTargetFact(emptyFact));
            unit.state._acted = true;
            return false;
        }
    } else {
        let targetResult = selectAttackTarget(unit, enemySide, allySide);
        target = targetResult.target;
        phantomLog = targetResult.phantomLog;
    }

    if (!target) {
        const emptyFact = {
            type: 'emptyTarget',
            attacker: { uid: unit.uid, name: unit.name, camp: unit.camp },
            reason: '无可选目标，跳过行动',
            events: []
        };
        emptyFact.events = flushBattleEvents();
        log.push(renderEmptyTargetFact(emptyFact));
        unit.state._acted = true;
        return false;
    }

    let unitActiveBuffs = unit.camp === 'ally' ? A._activeBuffs : B._activeBuffs;
    let unitAllyTeam = unit.camp === 'ally' ? A : B;
    if (hasBuff(unitActiveBuffs, 'carry') && unit.camp === 'ally') {
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
            log.push(renderMissFact(hitResult.missFact));
        }
        if (hitResult.dodgeFact) {
            const dg = renderDodgeFact(hitResult.dodgeFact);
            if (dg.isDead) {
                unit.alive = false; unit._pendingDeath = true;
            }
            log.push(dg);
        }
        if (hitResult.retry) {
            const retryUid = hitResult.lockedTargetUid || null;
            await processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, retryUid);
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
        applyStatChange(target, 'hp', dmgCalc.dmg, null, '免疫回退');
        unit.dmgDealt -= dmgCalc.dmg;
        target.dmgTaken -= dmgCalc.dmg;
        emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def });

        const immuneHpPctBefore = Math.floor((Math.min(target.hp + dmgCalc.dmg, target.maxHp) / target.maxHp) * 100);
        const immuneHpPctAfter = Math.floor((target.hp / target.maxHp) * 100);
        const immuneFact = {
            type: 'immune',
            attacker: { uid: unit.uid, name: unit.name, camp: unit.camp },
            target: { uid: target.uid, name: target.name, camp: target.camp },
            reason: immuneResult.reason || null,
            attackerAtk: Math.floor(unit.atk),
            attackerHp: Math.floor(unit.hp),
            targetDef: Math.floor(target.def),
            targetHp: Math.floor(target.hp),
            hpPctBefore: immuneHpPctBefore,
            hpPctAfter: immuneHpPctAfter,
            events: []
        };
        immuneFact.events = flushBattleEvents();
        log.push(renderImmuneFact(immuneFact));

        if (!unit._isLinkAttack) unit.state._acted = true;
        return true;
    }

    let group = await buildAttackGroup(unit, target, dmgCalc, dmgResult, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, phantomLog);

    if (unit._pendingDerivedEntries) {
        for (const entry of unit._pendingDerivedEntries) {
            group.entries.push(entry);
        }
        delete unit._pendingDerivedEntries;
    }

    const afterDamageDeclarations = [];
    eventBus.emit('afterDamageApplied', { unit, target, dmg: dmgCalc.dmg, group, allySide, enemySide, log, A, B, declarations: afterDamageDeclarations });

    if (dmgResult.fortifyDeclarations && dmgResult.fortifyDeclarations.length > 0) {
        afterDamageDeclarations.push(...dmgResult.fortifyDeclarations);
    }
    if (dmgResult.horseReboundDeclarations && dmgResult.horseReboundDeclarations.length > 0) {
        afterDamageDeclarations.push(...dmgResult.horseReboundDeclarations);
    }
    const executedDecls = resolveAfterDamageEffects(afterDamageDeclarations, unit, target, group);
    for (const decl of executedDecls) {
        if (decl._events && decl._events.length > 0) {
            if (!group._events) group._events = [];
            group._events.push(...decl._events);
        }
        if (group && group.entries && decl.logText) {
            const entry = { type: decl.type === EFFECT_TYPES.SPLASH ? 'buff-splash' : 'info', text: decl.logText };
            if (decl.type === EFFECT_TYPES.LEECH || decl.type === EFFECT_TYPES.HEAL) {
                entry.isHealEntry = true;
                entry.healAmount = decl.value || 0;
                entry.healUnitUid = decl.source ? decl.source.uid : null;
            }
            if (decl.buffType) entry.buffType = decl.buffType;
            if (decl.attackerUid) entry.attackerUid = decl.attackerUid;
            if (decl.primaryUid) entry.primaryUid = decl.primaryUid;
            if (decl.splashUids) entry.splashUids = decl.splashUids;
            if (decl.splashDmg !== undefined) entry.splashDmg = decl.splashDmg;
            group.entries.push(entry);
        }
    }
    if ((target._pendingDeath || target.hp <= 0) && !dmgResult.dead) {
        const hasExecute = executedDecls.some(d => d.type === EFFECT_TYPES.EXECUTE && d.target === target);
        if (hasExecute) {
            group.isDead = true;
            const dmgEntry = group.entries.find(e => e.type === 'damage-text');
            if (dmgEntry) {
                dmgEntry.deadFlag = true;
                dmgEntry.text = renderKillLineFact({
                    ac: unit.camp === 'ally' ? 'blue' : 'orange',
                    dc: target.camp === 'ally' ? 'blue' : 'orange',
                    campA: unit.camp === 'ally' ? '明教' : '六大派',
                    campD: target.camp === 'ally' ? '明教' : '六大派',
                    unitName: unit.name,
                    dmg: dmgCalc.dmg,
                    targetName: target.name,
                    hpBefore: dmgResult.hpBefore,
                    hpNow: Math.floor(target.hp)
                }).text;
            }
        }
    }

    if (!unit._isLinkAttack) unit.state._acted = true;

    group._events = (group._events || []).concat(flushBattleEvents());

    const afterAttackData = { unit, target, dmg: dmgCalc.dmg, group, allySide, enemySide, log, A, B, state, retry: false, retryTargetUid: null, declarations: [] };
    await eventBus.emit('afterAttack', afterAttackData);
    if (afterAttackData.declarations.length > 0) {
        const clawExecuted = resolveAfterDamageEffects(afterAttackData.declarations, unit, target, group);
        for (const decl of clawExecuted) {
            if (decl._events && decl._events.length > 0) {
                if (!group._events) group._events = [];
                group._events.push(...decl._events);
            }
            if (decl.type === EFFECT_TYPES.CLAW_CHAIN) {
            if (decl.hits) {
                for (const hit of decl.hits) {
                    if (hit.logText && group && group.entries) {
                        const e = { type: 'info', text: hit.logText };
                        if (hit.isClawHit) { e.isClawHit = true; e.clawAttackerUid = hit.clawAttackerUid; e.clawTargetUid = hit.clawTargetUid; e.isExecute = hit.isExecute; }
                        group.entries.push(e);
                    }
                }
            }
            if (decl.execute && decl.execute.logText && group && group.entries) {
                const e = { type: 'info', text: decl.execute.logText };
                if (decl.execute.isClawHit) { e.isClawHit = true; e.clawAttackerUid = decl.execute.clawAttackerUid; e.clawTargetUid = decl.execute.clawTargetUid; e.isExecute = true; }
                group.entries.push(e);
            }
        } else if (decl.logText && group && group.entries) {
            group.entries.push({ type: 'info', text: decl.logText });
        }
        }
    }
    if (afterAttackData.retry && unit.alive) {
        const retryTargetUid = afterAttackData.retryTargetUid || (target && target.alive ? target.uid : null);
        unit.state._acted = false;
        await processUnitAttack(unit, allySide, enemySide, log, A, B, state, null, retryTargetUid);
    }

    if (target.camp === 'ally') {
        eventBus.emit('allyDamaged', { attacker: unit, target, dmg: dmgCalc.dmg, allySide: A, enemySide: B, log });
    }

    resolveDeaths(allySide, enemySide, log);

    return true;
}