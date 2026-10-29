// core/10battle-attack.js — 攻击主流程（选敌 → 命中/闪避 → 伤害 → 裁定 → 额外攻击/连锁 → 死亡结算）
export const VER = 'core/10battle-attack.js V6.4.8';

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

import { emitEvent, applyStatChange, recordCombatStat, moveUnitPosition } from './13battle-shared.js';
import { FACT_TYPES, BUFF_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, SIGNAL_TYPES, ROLE_TYPES } from '../infra/56-battle-enums.js';

const C = CONFIG;

// —— 额外攻击统一执行器 ——
// 三个信号口收来的 extraRequests 全走这一个函数：AFTER_MISS（打空/被闪避后的补刀）、
//   AFTER_DAMAGE_APPLIED（灭绝反击、母狮随动）、AFTER_ATTACK（双击、玄冥联动、跟随攻击）。
// 三个开关区分口径：doubleStrikeUnitUid（miss 口传外层双击 uid，补刀归并同一次双击）、
//   checkBlock（afterAttack 口的双击要判遮挡）、forceUnact（afterAttack 口请求者出手前先清行动权）。
// 新机制挂被动出手：监听上面三个信号，往 data.extraRequests push 一条
//   { unit, targetUid, reason, priority, actedMode, actedSnapshot }。
//   reason 进 LINK_REASONS 的（反击/随动/联动类）：执行期间自动置 _isLinkAttack——不吃行动权 + 不触发同类（防乒乓）；
//     想让额外出手也不占本回合行动权，配 actedMode:'restore' + actedSnapshot: unit.state._acted。
//   跨阵营反击自动按出手者阵营换边选目标；一次性不可闪避带 ignoreDodge: true（本次出手内生效，结束即清）。
const LINK_REASONS = new Set(['counterAttack', 'lionFollow', 'xuanmingLink', 'followAttack']);

// 标枪打不到人 → 往前压一行（789→456，456→123），压完由调用方重选目标。
//   core 只认 ROLE_TYPES.JAVELIN，不认识具体英雄。落位优先同列，其次该行任意空位。
function tryAdvanceJavelin(unit, allySide, log) {
    if (!unit || !unit.alive) return false;
    const col = (unit.pos - 1) % 3;
    let order;
    if (unit.pos >= 7) order = [4 + col, 5, 6, 4];
    else if (unit.pos >= 4) order = [1 + col, 2, 3, 1];
    else return false;                       // 已在 123：射程已覆盖全场，不再前进
    const occupied = new Set(allySide.filter(u => u.alive && u.uid !== unit.uid).map(u => u.pos));
    const landPos = order.find(p => p >= 1 && p <= 9 && !occupied.has(p));
    if (landPos == null) return false;       // 前排满员：原地不动，走原来的「无可选目标」
    if (moveUnitPosition(unit, landPos, log) === false) return false;   // 被控制免疫等挡住
    log.push({ factType: FACT_TYPES.SKILL_ANNOUNCE, data: {
        unitName: unit.name, unitUid: unit.uid, camp: unit.camp,
        skillName: '突进', note: `🥢 ${unit.name} 射程不及，向前压至 ${landPos} 号位`,
        // 前压是独立动作（本回合唯一一手），必须画分隔线自成一段 ——
        //   否则播放时 info 行无 needsSeparator，会紧贴上一单位攻击组末尾，读起来像那组的一部分。
        needsSeparator: true,
        highlight: true // 标记需要给该单位格套框高亮
    } });
    return true;
}

function runExtraAttackRequests(requests, opts) {
    if (!requests || requests.length === 0) return;
    const { log, A, B, state, allySide, enemySide, target, group = null, doubleStrikeUnitUid = null, checkBlock = false, forceUnact = false } = opts;
    requests.sort((a, b) => (a.priority || 0) - (b.priority || 0));
    const executedUids = new Set();
    for (const req of requests) {
        if (executedUids.has(req.unit.uid)) continue;
        if (!req.unit.alive) continue;
        // 「待死」= 本击已把他打到 0 血、死亡结算在更后面（resolveDeaths）——此时不得再出手。
        //   殷天正的反击请求在 AFTER_DAMAGE_APPLIED 入队，若同一击的白骨爪连锁（AFTER_ATTACK 之后才落地）
        //   把他斩了，只判 alive 仍会放行 →「已经死了还能反击」。这里与锁定目标判据同口径补严判据。
        if (req.unit.state._pendingDeath) continue;
        if (checkBlock && req.reason === 'doubleStrike' && !req.ignoreBlock && isBlocked(req.unit, allySide)) continue;
        executedUids.add(req.unit.uid);
        if (forceUnact) req.unit.state._acted = false;
        if (req.actedMode === 'allow') req.unit.state._acted = false;
        const isLinkReq = LINK_REASONS.has(req.reason);
        if (isLinkReq) req.unit.state._isLinkAttack = true;
        // 被动出手原因透传（纯展示用，不参与引擎判定）：反击/跟随/随动/联动/追击等
        //   reason 记进 _linkReason，core/12 快照进 attack fact → render/34 战报行内徽章 + render/39 出手帧头顶飘字
        if (req.reason) req.unit.state._linkReason = req.reason;
        // 提示行延迟到真正出手这一刻才落组（req.infoText）：入队时还不知道他是否真能出手
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
        // 被动出手伤害系数（反击×0.8/跟随×0.6）：进额外攻击前写 state，伤害计算统一乘，结束即清（-1=无）
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
    // 已死 / 待死不入攻击流程：core/11 的候选池与循环条件已排除，这里是第二道防线 ——
    //   extraRequests（反击/随动/双击）可能带着「本击刚被打死」的 uid 进来，
    //   那种情况下出手会产出「0 血单位攻击、反击 0 伤害、被反击击杀」的假战报。
    //   静默返回（战报里该单位的死亡行已由 resolveDeaths 产出，不需要额外 SKIP 行）。
    if (!unit || !unit.alive || unit.hp <= 0 || unit.state._pendingDeath) {
        if (unit && unit.state) unit.state._acted = true;
        return false;
    }
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
        // 补 pendingDeath：连锁带着已归零的 uid 进来时，不该再打
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

    if (!target && unit.role === ROLE_TYPES.JAVELIN && !lockedTargetUid) {
        // 标枪专属：射程覆盖不到时向前压一行。前压本身就是这一回合的行动 ——
        //   消耗行动力、本回合不再攻击（老板口径 2026-10-23：移动算一手，不能白嫖一次攻击）。
        //   前压失败（前排满/被免疫挡住）则落到下面 emptyFact 走「无可选目标」休息分支。
        if (tryAdvanceJavelin(unit, allySide, log)) {
            unit.state._acted = true;
            return false;
        }
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

    // 选敌完成·出手前带 log 广播：给「出手声明」类机制一个早于命中/闪避判定的日志通道
    //   （胖远桥掷骰声明若挂 AFTER_ATTACK / AFTER_DAMAGE_APPLIED，被闪避时两条都不发、声明被吞）。
    eventBus.emit(SIGNAL_TYPES.AFTER_SELECT_TARGET, { unit, target, log });

    let hitResult = resolveAttackHit(unit, target, attackerBuffStats, defenderBuffStats, eventBus, { log, A, B, doubleStrikeUnitUid, state });
    if (hitResult.skipped) {
        if (hitResult.missFact) {
            log.push({ factType: FACT_TYPES.MISS, data: hitResult.missFact });
        }
        if (hitResult.dodgeFact) {
            const dodgeFact = hitResult.dodgeFact;
            // 只挂 _pendingDeath，交由 resolveDeaths 统一结算（与 core/12 主伤害路径同口径）：
            //   直接 alive=false 会绕过结算——hp 不清零出「带血尸体」，且 ON_BEFORE_DEATH/ON_UNIT_DEATH 不发，
            //   watchUnit 判不到死亡、谢逊替死失效。
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

    // 引擎保底：空见死后其组件不再注册，但队友身上的护罩必须仍能消费，防 UI 残留
    if (target.state && target.state._immuneShield && !immuneDeclarations.some(d => d.immune)) {
        immuneDeclarations.push({ immune: true, reason: `🛡️ ${target.state._immuneShield.sourceName || '护罩'}：护罩挡下这一击` });
        target.state._immuneShield = null;
    }

    // 免疫回退只退「本次实际扣掉的血」（hpBeforeApply − 现血），不按 dmgCalc.dmg 全额补回：
    //   小昭·妹飞天时 core/13「天上无敌」已把这一击的 hp 扣减整段挡掉，全额补回会凭空加血顶满 maxHp。
    //   实际扣多少退多少：被挡掉时退 0，真正的免疫回退场景退真实损失。
    const hpBeforeApply = target.hp;
    let dmgResult = applyAttackResult(unit, target, dmgCalc, attackerBuffStats, defenderBuffStats, allySide, enemySide, { log, A, B, state, doubleStrikeUnitUid });
    const immuneResult = resolveDamageImmune(immuneDeclarations);
    if (immuneResult) {
        const hpLossApplied = Math.max(0, hpBeforeApply - target.hp);
        if (hpLossApplied > 0) applyStatChange(target, 'hp', hpLossApplied, null, '免疫回退', false, false);
        // 免疫必须连"致死标记"一起回退：applyAttackResult 在血≤0 时已设 _pendingDeath，
        //   只退 hp 不退标记 → 下一次 resolveDeaths 仍按"待死"判死（飞天保命的"即将阵亡"分支即此）。
        target.state._pendingDeath = false;
        // 免疫回退：只退实扣（hpLossApplied）——承伤/输出都按同一口径记账，
        //   被天上无敌挡掉时实扣为 0，本行即空转，不改任何统计
        recordCombatStat(unit, target, 'immuneRollback', {
            rawAmount: 0,
            actualAmount: hpLossApplied
        });
        emitEvent(target, UNIT_EVENT_TYPES.HP_CHANGE, { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def });

        const immuneHpPctBefore = Math.floor((Math.min(hpBeforeApply, target.maxHp) / target.maxHp) * 100);
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
            dmgCalc: dmgCalc, // 透传伤害计算结果，供前端渲染波动与原始伤害行
            events: []
        };
        immuneFact.events = flushBattleEvents();
        log.push({ factType: FACT_TYPES.IMMUNE, data: immuneFact });

        if (!unit.state._isLinkAttack) unit.state._acted = true;
        // 免疫专属广播：本击被免疫时上面 AFTER_ATTACK 分支提前 return 不广播，挂在那里的机制
        //   （宋青书性奋额外攻击）会被整段吞掉。补一条只服务「本击虽未落地、但仍算一次出手」的信号。
        eventBus.emit(SIGNAL_TYPES.AFTER_ATTACK_IMMUNE, { unit, target, allySide, enemySide, log, A, B, state });
        // 免疫分支账实一致：破防 modifier 已在 BEFORE_DAMAGE_CALC 执行（账本有词条），但本分支不走 buildAttackGroup，
        //   破防 fact 不落 →「账上扣了、战报没显示」。补一个最小 attack-group 只装破防条目
        //   （规则 135 要求破防行必须在攻击组内；直接建成带 text 的日志条目，避免裸 fact 流入 player/46 崩）。
        if (dmgCalc.pendingDefReduceFact) {
            const immuneBreakGroup = {
                type: 'attack-group',
                attacker: { uid: unit.uid, name: unit.name, camp: unit.camp, pos: unit.pos, atk: Math.floor(unit.atk), hp: fmtHp(unit.hp) },
                target: { uid: target.uid, name: target.name, camp: target.camp, pos: target.pos, def: Math.floor(target.def), hp: fmtHp(target.hp) },
                // 破防行必须在攻击组内（规则 135），但本 group 自身不带 factType、不经 renderAttackFact，
                // 故在此直接建成带 text 的日志条目（与 render/35 renderBreakDefFact 同格式），
                // 避免裸 fact 条目流入 player/46 在 playLogLine(entry2.text) 处崩（playLineText:26 text.includes）。
                entries: [{ type: 'detail', text: `<span class="purple small">🗡️ ${dmgCalc.pendingDefReduceFact.attackerName} 破防：${dmgCalc.pendingDefReduceFact.targetName} 防御 -${dmgCalc.pendingDefReduceFact.reduce}</span>` }],
                immuneBreak: true,
                events: []
            };
            log.push(immuneBreakGroup);
        }
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
    // payload 补 atkAct/defAct：张三丰严阵以待反弹(26 组件)需与通用防战 core/12 同口径，按"被防御抵消部分"计算
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
    // 本帧死亡结算后立刻把事件缓冲收进本组（谁打死的，死亡事件跟谁走）：
    //   留在全局缓冲会被上层攻击帧的 flush 捞走，播放层逐组 APPLY_EVENTS 就会演成死→活→死三段剧透。
    group._events = (group._events || []).concat(flushBattleEvents());

    return true;
}