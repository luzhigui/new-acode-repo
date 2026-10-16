// V6.4.7 | ~24500 bytes | 2026-10-16 三改（老板拍板）：①免疫分支（妹妹飞天）补广播新信号 AFTER_ATTACK_IMMUNE——
//          挂在 AFTER_ATTACK 的机制（宋青书性奋额外攻击）不再被免疫整段吞掉，第二下重新选敌照打；
//          ②runExtraAttackRequests 补 _pendingDeath 守卫（本击已把请求者打到 0 血 → 不得再出手）；
//          ③req.infoText 支持：被动出手的提示行延迟到真正出手那一刻才落组（入队时未必真能出手）
// V6.4.6 | 2026-10-16 被动出手原因透传：runExtraAttackRequests 执行期把 req.reason 写 state._linkReason
//          （纯展示、不参与判定），core/12 快照进 attack fact，render 层出【反击】徽章与头顶飘字；结束即清
// V6.4.5 | ~21200 bytes | 2026-10-15 选敌完成后、命中/闪避判定前新增 AFTER_SELECT_TARGET 广播（带 log）：
//          给「出手声明」类机制（胖远桥掷骰声明）一个早于 DODGE 的日志通道，被闪避反击时声明不再被吞。
// V6.4.4 | 2026-10-13 红血加血独立行拆除：何太冲红血触发改挂 ON_UNIT_ACTED（modules/26 V6.26.0），
//          加血发生在攻击行之后，「正伤害血反增」矛盾不再存在，BEFORE_DAMAGE_APPLY 血量对照补偿随之退役。
// ── 更早版本见 记录-更改履历.md
export const VER = 'core/10battle-attack.js V6.4.7';

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
    const { log, A, B, state, allySide, enemySide, target, group = null, doubleStrikeUnitUid = null, checkBlock = false, forceUnact = false } = opts;
    requests.sort((a, b) => (a.priority || 0) - (b.priority || 0));
    const executedUids = new Set();
    for (const req of requests) {
        if (executedUids.has(req.unit.uid)) continue;
        if (!req.unit.alive) continue;
        // 2026-10-16 「待死」= 本击已把他打到 0 血、死亡结算在更后面（resolveDeaths）——此时不得再出手。
        //   殷天正的反击请求在 AFTER_DAMAGE_APPLIED 入队，若同一击的白骨爪连锁（AFTER_ATTACK 之后才落地）
        //   把他斩了，只判 alive 仍会放行 →「已经死了还能反击」。这里与锁定目标判据同口径补严判据。
        if (req.unit.state._pendingDeath) continue;
        if (checkBlock && req.reason === 'doubleStrike' && !req.ignoreBlock && isBlocked(req.unit, allySide)) continue;
        executedUids.add(req.unit.uid);
        if (forceUnact) req.unit.state._acted = false;
        if (req.actedMode === 'allow') req.unit.state._acted = false;
        const isLinkReq = LINK_REASONS.has(req.reason);
        if (isLinkReq) req.unit.state._isLinkAttack = true;
        // 2026-10-16 被动出手原因透传（纯展示用，不参与引擎判定）：反击/跟随/随动/联动/追击等
        //   reason 记进 _linkReason，core/12 快照进 attack fact → render/34 战报行内徽章 + render/39 出手帧头顶飘字
        if (req.reason) req.unit.state._linkReason = req.reason;
        // 2026-10-16 提示行延迟到真正出手这一刻才落组（req.infoText）：入队时还不知道他是否真能出手
        //   （殷天正的反击请求可能被本击连锁斩杀作废），提前落行会写出「已死之人反击」的假日志
        if (req.infoText && group && group.data && group.data.entries) group.data.entries.push({ type: 'info', text: req.infoText });
        // 回退判据带 _pendingDeath：原目标同击致死后 alive 仍是 true（死亡结算才清），
        //   只判 alive 会把"待死"的 uid 当活人锁过去，锁定路径用严判据找不到人 → 白跳一次。回退 null 走正常选目标。
        const extraTargetUid = req.targetUid || (target && target.alive && !target.state._pendingDeath ? target.uid : null);
        // 跨阵营额外攻击（如灭绝反击）：allySide/enemySide 是「原行动者视角」，反击者在对侧，
        //   必须按出手者阵营重算两侧，否则会从自己人里挑目标（同阵营出手者重算结果不变，天然兼容）。
        const reqAllySide = req.unit.camp === CAMP_TYPES.ALLY ? A : B;
        const reqEnemySide = req.unit.camp === CAMP_TYPES.ALLY ? B : A;
        if (req.ignoreDodge) req.unit.state._ignoreDodge = true;
        // 2026-10-09 被动出手伤害系数（反击×0.8/跟随×0.6）：进额外攻击前写 state，伤害计算统一乘，结束即清（-1=无）
        if (req.dmgRatio != null) req.unit.state._extraDmgRatio = req.dmgRatio;
        processUnitAttack(req.unit, reqAllySide, reqEnemySide, log, A, B, state, doubleStrikeUnitUid, extraTargetUid);
        if (req.dmgRatio != null) req.unit.state._extraDmgRatio = -1;
        if (req.ignoreDodge) req.unit.state._ignoreDodge = false;
        if (isLinkReq) req.unit.state._isLinkAttack = false;
        req.unit.state._linkReason = null;
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

    // 2026-10-15 选敌完成·出手前带 log 广播：给「出手声明」类机制一个早于命中/闪避判定的日志通道。
    //   此前无此信号，胖远桥掷骰声明只能挂 AFTER_ATTACK / AFTER_DAMAGE_APPLIED，被闪避时两条都不发、声明被吞；
    //   此处置于 resolveAttackHit 之前 → 声明行天然排在 DODGE/MISS 行之前。
    eventBus.emit(SIGNAL_TYPES.AFTER_SELECT_TARGET, { unit, target, log });

    let hitResult = resolveAttackHit(unit, target, attackerBuffStats, defenderBuffStats, eventBus, { log, A, B, doubleStrikeUnitUid, state });
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

    let dmgResult = applyAttackResult(unit, target, dmgCalc, attackerBuffStats, defenderBuffStats, allySide, enemySide, { log, A, B, state, doubleStrikeUnitUid });
    const immuneResult = resolveDamageImmune(immuneDeclarations);
    if (immuneResult) {
        applyStatChange(target, 'hp', dmgCalc.dmg, null, '免疫回退', false, false);
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
        // 2026-10-16 免疫专属广播：本击被免疫（妹妹飞天）时上面 AFTER_ATTACK 分支提前 return 不广播，
        //   挂在 AFTER_ATTACK 的机制（宋青书性奋额外攻击）会被整段吞掉。补一条只服务「本击虽未落地、
        //   但仍算一次出手」的信号：性奋额外攻击照发并重新选敌（打别人 / 单目标时打第二下）。
        //   位置与 AFTER_ATTACK 一致（_acted 之后），nested 额外攻击行为与非免疫路径完全同构。
        eventBus.emit(SIGNAL_TYPES.AFTER_ATTACK_IMMUNE, { unit, target, allySide, enemySide, log, A, B, state });
        return true;
    }

    const group = buildAttackGroup(unit, target, dmgCalc, dmgResult, attackerBuffStats, defenderBuffStats, allySide, enemySide, { log, A, B, state, doubleStrikeUnitUid }, phantomFact);

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
    // 2026-10-02 payload 补 atkAct/defAct：张三丰严阵以待反弹(26 组件)需与通用防战 core/12 同口径，按"被防御抵消部分"计算
    eventBus.emit(SIGNAL_TYPES.AFTER_DAMAGE_APPLIED, { unit, target, dmg: dmgCalc.dmg, atkAct: dmgResult.atkAct, defAct: dmgResult.defAct, group, allySide, enemySide, log, A, B, declarations: afterDamageDeclarations, extraRequests: afterDamageExtraRequests });

    if (dmgResult.fortifyDeclarations && dmgResult.fortifyDeclarations.length > 0) {
        afterDamageDeclarations.push(...dmgResult.fortifyDeclarations);
    }
    if (dmgResult.horseReboundDeclarations && dmgResult.horseReboundDeclarations.length > 0) {
        afterDamageDeclarations.push(...dmgResult.horseReboundDeclarations);
    }
    const executedDecls = resolveAfterDamageEffects(afterDamageDeclarations, unit, target, group, allySide, unitActiveBuffs, log);
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
    runExtraAttackRequests(afterDamageExtraRequests, { log, A, B, state, allySide, enemySide, target, group });

    if (!unit.state._isLinkAttack) unit.state._acted = true;

    group._events = (group._events || []).concat(flushBattleEvents());

    const extraRequests = [];
    const afterAttackData = { unit, target, dmg: dmgCalc.dmg, group, allySide, enemySide, log, A, B, state, declarations: [], extraRequests };
    eventBus.emit(SIGNAL_TYPES.AFTER_ATTACK, afterAttackData);
    if (afterAttackData.declarations.length > 0) {
        // 先处理攻盾等回合级状态授予（不参与八类结算）
        resolveRoundStatGrants(afterAttackData.declarations);
        // 再处理既有八类结算
        const clawExecuted = resolveAfterDamageEffects(afterAttackData.declarations, unit, target, group, allySide, unitActiveBuffs, log);
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
                    // 本爪触发的小昭·姊乾坤衍生条目：紧跟该爪条目落组（core/16 逐爪广播回填；减伤已由 core/16 落地到爪伤）。
                    //   clawFast 标记经 projectFactEntry 透传进播放 entry：player/46 按随爪快节奏播（350ms+60ms），不再拖整场节奏
                    if (hit._derivedEntries && hit._derivedEntries.length > 0 && group && group.data.entries) {
                        for (const de of hit._derivedEntries) group.data.entries.push({ ...de, clawFast: true });
                    }
                }
            }
            if (decl.execute && (decl.execute.logText || decl.execute.factType) && group && group.data.entries) {
                const e = decl.execute.factType
                    ? { factType: decl.execute.factType, data: decl.execute.data }
                    : { type: 'info', text: decl.execute.logText };
                if (decl.execute.isClawHit) { e.isClawHit = true; e.clawAttackerUid = decl.execute.clawAttackerUid; e.clawTargetUid = decl.execute.clawTargetUid; e.isExecute = true; }
                group.data.entries.push(e);
                // 斩杀那一刀照杀不减，但仍触发乾坤衍生（治疗+加攻）：条目紧跟斩杀行落组（同 clawFast 快节奏）
                if (decl.execute._derivedEntries && decl.execute._derivedEntries.length > 0) {
                    for (const de of decl.execute._derivedEntries) group.data.entries.push({ ...de, clawFast: true });
                }
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
    runExtraAttackRequests(extraRequests, { log, A, B, state, allySide, enemySide, target, group, checkBlock: true, forceUnact: true });

    resolveDeaths(allySide, enemySide, log);
    // 2026-10-01 修「母狮随动 死→活→死」：resolveDeaths 发的事件此前留在全局缓冲里没人收，
    //   会被**上层攻击帧**（随动父帧）L268 的 flush 捞走 → 死亡被挂到更早播出的那个攻击组上；
    //   而随动子刀自己的 alive=true 事件又挂在更晚的组上。播放层逐组 APPLY_EVENTS（player/46 L146），
    //   于是目标先被前一组标死、再被后一组标活、步末才真正落地 → 死→活→死 三段剧透。
    //   修法：本帧死亡结算后立刻把缓冲收进本组，保证「谁打死的，死亡事件跟谁走」。
    //   日志文本顺序与死亡结算时机均不变（resolveDeaths 调用点没动）。
    group._events = (group._events || []).concat(flushBattleEvents());

    return true;
}