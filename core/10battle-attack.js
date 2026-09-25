// V6.3.3 | ~17900 bytes | 2026-09-25 闪避反击致死不再直接 alive=false：改挂 _pendingDeath 交 resolveDeaths 结算（修「带血尸体」hp 不清零 + DEATH 信号不发），判据从展示值 attackerHpAfter 改真实 unit.hp。承接 V6.3.2 额外攻击三口合一
export const VER = 'core/10battle-attack.js V6.3.3';

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
import { flushBattleEvents, fmtHp } from '../infra/51-core-utils.js';
import { resolveRoundStatGrants } from './16effect-handlers.js';

import { emitEvent, applyStatChange, recordCombatStat } from './13battle-shared.js';
import { FACT_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, SIGNAL_TYPES } from '../infra/56-battle-enums.js';

const C = CONFIG;

// —— 额外攻击统一执行器（2026-09-25 三口合一）——
// 三个信号口收来的 extraRequests 全走这一个函数：
//   AFTER_MISS（打空/被闪避后的双击补刀）/ AFTER_DAMAGE_APPLIED（灭绝反击、母狮随动）/ AFTER_ATTACK（双击、玄冥联动、跟随攻击）。
// 原先是三段各自抄改的循环，长歪的方向都不一样；合一后差异只剩三个开关（全部是旧账，逐位保留）：
//   doubleStrikeUnitUid：miss 口把外层双击 uid 传下去（双击的补刀归并到同一次双击）
//   checkBlock：afterAttack 口的双击要判遮挡（miss 口补刀不判）
//   forceUnact：afterAttack 口历史行为——请求者出手前先清行动权（双击靠这个补出手；跟随/联动带 restore 会立刻还原）
// 新机制挂被动出手看这里（不用再知道三条循环的差别）：
//   监听上面三个信号，往 data.extraRequests push 一条：
//     { unit, targetUid, reason, priority, actedMode, actedSnapshot }
//   reason 进 LINK_REASONS 的（反击/随动/联动类）：执行期间自动置 _isLinkAttack——不吃行动权 + 自身不会再触发同类（防乒乓链），
//     想让额外出手也不占本回合行动权，配 actedMode:'restore' + actedSnapshot: unit.state._acted；
//   跨阵营反击（如灭绝打对侧）自动按出手者阵营换边选目标，不会从自己人里挑；
//   一次性不可闪避带 ignoreDodge: true（只在这一次出手内生效，结束即清）。
const LINK_REASONS = new Set(['counterAttack', 'lionFollow', 'xuanmingLink', 'followAttack']);

function runExtraAttackRequests(requests, opts) {
    if (!requests || requests.length === 0) return;
    const { log, A, B, state, allySide, enemySide, target, doubleStrikeUnitUid = null, checkBlock = false, forceUnact = false } = opts;
    requests.sort((a, b) => (a.priority || 0) - (b.priority || 0));
    const executedUids = new Set();
    for (const req of requests) {
        if (executedUids.has(req.unit.uid)) continue;
        if (!req.unit.alive) continue;
        if (checkBlock && req.reason === 'doubleStrike' && !req.ignoreBlock && isBlocked(req.unit, allySide)) continue;
        executedUids.add(req.unit.uid);
        if (forceUnact) req.unit.state._acted = false;
        if (req.actedMode === 'allow') req.unit.state._acted = false;
        const isLinkReq = LINK_REASONS.has(req.reason);
        if (isLinkReq) req.unit.state._isLinkAttack = true;
        // 回退判据带 _pendingDeath：原目标同击致死后 alive 仍是 true（死亡结算才清），
        //   只判 alive 会把"待死"的 uid 当活人锁过去，锁定路径用严判据找不到人 → 白跳一次。回退 null 走正常选目标。
        const extraTargetUid = req.targetUid || (target && target.alive && !target.state._pendingDeath ? target.uid : null);
        // 跨阵营额外攻击（如灭绝反击）：allySide/enemySide 是「原行动者视角」，反击者在对侧，
        //   必须按出手者阵营重算两侧，否则会从自己人里挑目标（同阵营出手者重算结果不变，天然兼容）。
        const reqAllySide = req.unit.camp === CAMP_TYPES.ALLY ? A : B;
        const reqEnemySide = req.unit.camp === CAMP_TYPES.ALLY ? B : A;
        if (req.ignoreDodge) req.unit.state._ignoreDodge = true;
        processUnitAttack(req.unit, reqAllySide, reqEnemySide, log, A, B, state, doubleStrikeUnitUid, extraTargetUid);
        if (req.ignoreDodge) req.unit.state._ignoreDodge = false;
        if (isLinkReq) req.unit.state._isLinkAttack = false;
        if (req.actedMode === 'restore') req.unit.state._acted = req.actedSnapshot;
    }
}

// 同步流程：UI 层异步包装保持逐步渲染，这里纯同步
export function processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, lockedTargetUid) {
    if (unit.state._stunned) {
        log.push({ factType: FACT_TYPES.STUN_SKIP, data: { unitName: unit.name } });
        unit.state._acted = true;
        return false;
    }
    if (unit.state._spiderFlying || unit.state._flyMode === 'spider' || (unit._fsm && unit._fsm.is('flying'))) {
        log.push({ factType: FACT_TYPES.FLY_SKIP, data: { unitName: unit.name } });
        unit.state._acted = true;
        return false;
    }

    let target, phantomFact;
    if (lockedTargetUid) {
        // 2026-09-19 补 pendingDeath：连锁带着已归零的 uid 进来时，不该再打
        target = enemySide.find(u => u.uid === lockedTargetUid && u.alive && !u.state._pendingDeath) || null;
        phantomFact = null;
        if (!target) {
            // 锁定目标已阵亡，跳过行动
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

    let unitActiveBuffs = unit.camp === CAMP_TYPES.ALLY ? A._activeBuffs : B._activeBuffs;
    let unitAllyTeam = unit.camp === CAMP_TYPES.ALLY ? A : B;
    if (hasBuff(unitActiveBuffs, BUFF_TYPES.CARRY) && unit.camp === CAMP_TYPES.ALLY) {
        unitAllyTeam = unitAllyTeam.concat((state.allAllies || state.ally).filter(c => !c.alive));
        unitAllyTeam = unitAllyTeam.filter((u, i, arr) => arr.findIndex(v => v.uid === u.uid) === i);
    }
    let attackerBuffStats = computeBuffStats(unit, unitActiveBuffs, unitAllyTeam);
    let targetActiveBuffs = target.camp === CAMP_TYPES.ALLY ? A._activeBuffs : B._activeBuffs;
    let targetAllyTeam = target.camp === CAMP_TYPES.ALLY ? A : B;
    let defenderBuffStats = computeBuffStats(target, targetActiveBuffs, targetAllyTeam);

    let hitResult = resolveAttackHit(unit, target, attackerBuffStats, defenderBuffStats, log, A, B, doubleStrikeUnitUid, eventBus, state);
    if (hitResult.skipped) {
        if (hitResult.missFact) {
            log.push({ factType: FACT_TYPES.MISS, data: hitResult.missFact });
        }
        if (hitResult.dodgeFact) {
            const dodgeFact = hitResult.dodgeFact;
            // 2026-09-25 定案：与 core/12 主伤害路径同口径 —— 只挂 _pendingDeath，交由 resolveDeaths 统一结算
            //   （core/11:409 紧随 processUnitAttack 调用）。原先直接 alive=false 会绕过结算，造成两个洞：
            //   ① hp 不清零 →「带血尸体」（alive=false 但 hp>0），且 hp 为 0.8 时被 floor 误判致死；
            //   ② ON_BEFORE_DEATH/ON_UNIT_DEATH 不发 → watchUnit 判不到死亡、谢逊替死失效。
            if (unit.hp <= 0) {
                unit.state._pendingDeath = true;
                if (!unit.state._deathTime) unit.state._deathTime = Date.now();
                emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _isDead: false });
            }
            log.push({ factType: FACT_TYPES.DODGE, data: dodgeFact });
        }
        // 打空/被闪避后的补刀请求：双击 uid 传下去归并同一次双击；补刀不判遮挡（旧账）
        runExtraAttackRequests(hitResult.extraRequests, { log, A, B, state, allySide, enemySide, target, doubleStrikeUnitUid });
        return true;
    }

    if (unit.state._stunned) {
        unit.state._acted = true;
        return true;
    }

    eventBus.emit(SIGNAL_TYPES.BEFORE_ATTACK, { unit, allySide, enemySide, log });
    let dmgCalc = calcFinalDamage(unit, target, attackerBuffStats, defenderBuffStats, allySide, enemySide, log);

    const immuneDeclarations = [];
    eventBus.emit(SIGNAL_TYPES.BEFORE_DAMAGE_APPLY, { target, dmg: dmgCalc.dmg, hpBefore: target.hp, A, log, declarations: immuneDeclarations });

    let dmgResult = applyAttackResult(unit, target, dmgCalc, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);
    const immuneResult = resolveDamageImmune(immuneDeclarations);
    if (immuneResult) {
        applyStatChange(target, 'hp', dmgCalc.dmg, null, '免疫回退', false);
        // 2026-09-22 免疫必须连"致死标记"一起回退：
        //   applyAttackResult 在血≤0 时已设 target.state._pendingDeath（core/12 L348），
        //   只退 hp 不退标记 → 下一次 resolveDeaths 仍按"待死"把她 alive=false。
        //   小昭·妹飞天保命的"即将阵亡"分支就是这么被误判死的：血退回来了，人还是死了
        //   （血线触发不致死，所以第 8 回合那种看起来正常）。
        target.state._pendingDeath = false;
        // 免疫回退：承伤已记，只退输出（走统一记账入口）
        recordCombatStat(unit, target, 'immuneRollback', {
            rawAmount: 0,
            actualAmount: dmgCalc.dmg
        });
        emitEvent(target, UNIT_EVENT_TYPES.HP_CHANGE, { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def });

        const immuneHpPctBefore = Math.floor((Math.min(target.hp + dmgCalc.dmg, target.maxHp) / target.maxHp) * 100);
        const immuneHpPctAfter = Math.floor((target.hp / target.maxHp) * 100);
        const immuneFact = {
            type: 'immune',
            attacker: { uid: unit.uid, name: unit.name, camp: unit.camp },
            target: { uid: target.uid, name: target.name, camp: target.camp },
            reason: immuneResult.reason || null,
            flyData: immuneResult.flyData || null,
            attackerAtk: Math.floor(unit.atk),
            attackerHp: fmtHp(unit.hp),
            targetDef: Math.floor(target.def),
            targetHp: fmtHp(target.hp),
            hpPctBefore: immuneHpPctBefore,
            hpPctAfter: immuneHpPctAfter,
            events: []
        };
        immuneFact.events = flushBattleEvents();
        log.push({ factType: FACT_TYPES.IMMUNE, data: immuneFact });

        if (!unit.state._isLinkAttack) unit.state._acted = true;
        return true;
    }

    const group = buildAttackGroup(unit, target, dmgCalc, dmgResult, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, phantomFact);

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
    // 同步 eventBus.emit，所有监听器同步执行，无需 await
    eventBus.emit(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, { unit, target, dmg: dmgCalc.dmg, group, allySide, enemySide, log, A, B, declarations: afterDamageDeclarations, extraRequests: afterDamageExtraRequests });

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
    if ((target.state._pendingDeath || target.hp <= 0) && !dmgResult.dead) {
        const hasExecute = executedDecls.some(d => d.type === EFFECT_TYPES.EXECUTE && d.target === target);
        if (hasExecute) {
            dmgResult.executeKill = true;
        }
    }

    // 打中后触发的被动出手（灭绝反击、母狮随动）：reason 表自动置 _isLinkAttack（不吃行动权+防乒乓），
    //   灭绝跨阵营反击自动换边；被动出手照样计入她的「每第三次攻击」次数（modules/26 只认本信号）。
    runExtraAttackRequests(afterDamageExtraRequests, { log, A, B, state, allySide, enemySide, target });

    if (!unit.state._isLinkAttack) unit.state._acted = true;

    group._events = (group._events || []).concat(flushBattleEvents());

    const extraRequests = [];
    const afterAttackData = { unit, target, dmg: dmgCalc.dmg, group, allySide, enemySide, log, A, B, state, declarations: [], extraRequests };
    eventBus.emit(SIGNAL_TYPES.AFTER_ATTACK, afterAttackData);
    if (afterAttackData.declarations.length > 0) {
        // 先处理攻盾等回合级状态授予（不参与八类结算）
        resolveRoundStatGrants(afterAttackData.declarations);
        // 再处理既有八类结算
        const clawExecuted = resolveAfterDamageEffects(afterAttackData.declarations, unit, target, group, allySide, unitActiveBuffs);
        // 先处理爪击链日志，确保宋青书回血日志最后出现
        for (const decl of clawExecuted) {
            if (decl._events && decl._events.length > 0) {
                if (!group._events) group._events = [];
                group._events.push(...decl._events);
            }
            if (decl.type !== EFFECT_TYPES.CLAW_CHAIN) continue;
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
        }
        // 再处理其他声明（HEAL 回血日志放最后）
        for (const decl of clawExecuted) {
            if (decl.type === EFFECT_TYPES.CLAW_CHAIN) continue;
            if ((decl.logText || decl.factType) && group && group.data.entries) {
                group.data.entries.push(decl.factType
                    ? { factType: decl.factType, data: decl.factData }
                    : { type: 'info', text: decl.logText });
            }
        }
    }
    // 打完后的连锁（双击、玄冥联动、跟随攻击）：双击判遮挡；forceUnact 保留旧账——请求者出手前先清行动权
    runExtraAttackRequests(extraRequests, { log, A, B, state, allySide, enemySide, target, checkBlock: true, forceUnact: true });

    resolveDeaths(allySide, enemySide, log);

    return true;
}