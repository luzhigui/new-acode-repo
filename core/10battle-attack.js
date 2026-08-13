// core/10battle-attack.js - 光明顶5v5 攻击流程模块
// V5.4.0 | ~12400 bytes| 2026-07-28 重构为事件总线驱动
export const VER = 'core/10battle-attack.js V5.4.0';

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
import { eventBus } from './00-event-bus.js';
import { flushBattleEvents } from './09-battle-event-store.js';

import { emitEvent } from './13battle-shared.js';

const C = CONFIG, DT = DEF_TAUNT, HT = HP_TAUNT;



// ==================== 主攻击流程 ====================

/**
 * 单次攻击流程编排：拦截检查 → 目标选择 → Buff计算 → 命中判定 → 伤害计算 → 免疫检查 → 应用伤害 → 构建日志 → 攻击后效果 → 死亡结算
 * 连击/性奋/联动等额外攻击通过 afterAttack 信号递归调用
 * @param {Unit} unit - 攻击者
 * @param {Array} allySide - 攻击者所在阵营
 * @param {Array} enemySide - 目标所在阵营
 * @param {Array} log - 日志数组
 * @param {Array} A - 明教方单位数组
 * @param {Array} B - 六大派方单位数组
 * @param {object} state - 战斗状态对象
 * @param {string|null} doubleStrikeUnitUid - 概率连击单位 uid
 * @param {string|null} lockedTargetUid - 锁定目标 uid（连击/联动时强制打同一目标）
 * @returns {Promise<boolean>} true=攻击完成，false=攻击被跳过（眩晕/飞天/无目标）
 */
export async function processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, lockedTargetUid) {
    // 统一拦截：眩晕单位无法响应任何攻击指令
    // 即使外部调用方（如联动、随机队友攻击）传入了眩晕单位，裁判直接拒绝
    if (unit.state._stunned) {
        log.push({ type:'info', text:`<span class="gray">💫 ${unit.name} 被眩晕，无法响应攻击指令</span>` });
        unit.state._acted = true;
        return false;
    }
    if (unit.state._spiderFlying || unit.state._flyMode === 'spider' || (unit._fsm && unit._fsm.is('flying'))) {
        log.push({ type:'info', text:`<span class="gray">🕷️ ${unit.name} 正在飞天，无法行动</span>` });
        unit.state._acted = true;
        return false;
    }



    // 步骤1：选择目标
    let target, phantomLog;
    if (lockedTargetUid) {
        target = enemySide.find(u => u.uid === lockedTargetUid && u.alive) || null;
        phantomLog = null;
        if (!target) {
            let emptyGroup = { type:'attack-group', uidA:unit.uid, uidD:null, entries:[], isMiss:true, _fxSnapshot:null, waveTaunt:null, waveUnit:null, buffEffects: [], needsSeparator: true };
            emptyGroup.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span> 无法选择目标`});
            emptyGroup.entries.push({type:'info', text:`<span class="gray">锁定目标已阵亡，跳过行动</span>`});
            flushBattleEvents();
            log.push(emptyGroup);
            unit.state._acted = true;
            return false;
        }
    } else {
        let targetResult = selectAttackTarget(unit, enemySide, allySide);
        target = targetResult.target;
        phantomLog = targetResult.phantomLog;
    }

    if (!target) {
        let emptyGroup = { type:'attack-group', uidA:unit.uid, uidD:null, entries:[], isMiss:true, _fxSnapshot:null, waveTaunt:null, waveUnit:null, buffEffects: [], needsSeparator: true };
        emptyGroup.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span> 无法选择目标`});
        emptyGroup.entries.push({type:'info', text:`<span class="gray">无可选目标，跳过行动</span>`});
        flushBattleEvents();
        log.push(emptyGroup);
        unit.state._acted = true;
        return false;
    }

    // 计算 Buff 加成
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

    // 步骤2：未命中+闪避判定
    let hitResult = resolveAttackHit(unit, target, attackerBuffStats, defenderBuffStats, log, A, B, doubleStrikeUnitUid, eventBus);
    if (hitResult.skipped) {
        if (hitResult.missGroup) {
            // 未命中 — 调用方拼日志
            const mg = hitResult.missGroup;
            mg.entries.push({type:'combat-text', text: mg.combatText});
            mg.entries.push({type:'info', text: mg.infoText});
            delete mg.combatText; delete mg.infoText;
            log.push(mg);
        }
        if (hitResult.dodgeGroup) {
            // 闪避 — 调用方拼日志
            const dg = hitResult.dodgeGroup;
            if (dg.weiHealData) {
                dg.entries.push({type:'info', text:`<span class="green">🦇 青翼蝠王·闪避反击吸血+${dg.weiHealData.heal}，上限→${dg.weiHealData.newMaxHp}</span>`, isHealEntry:true, healAmount:dg.weiHealData.heal, healUnitUid:target.uid});
                delete dg.weiHealData;
            }
            dg.entries.push({type:'combat-text', text: dg.combatText});
            dg.entries.push({type:'info', text: dg.dodgeText});
            dg.entries.push({type:'damage-text', text: dg.reboundText});
            if (dg.isDead) {
                unit.alive = false; unit.state._isDead = true;
                dg.hpAfter = 0;
                dg.entries.push({type:'info', text:`${unit.name}被反击击杀！`});
            }
            dg.entries.push({type:'info', text: dg.stunText});
            delete dg.combatText; delete dg.dodgeText; delete dg.reboundText; delete dg.stunText;
            log.push(dg);
        }
        if (hitResult.retry) {
            const retryUid = hitResult.lockedTargetUid || null;
            await processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, retryUid);
        }
        return true;
    }

    // 闪避反击可能导致攻击者眩晕，眩晕后本次攻击的后续效果全部作废
    // 包括 afterAttack 信号、联动、性奋、白骨爪、飞天等均不触发
    // 裁判统一拦截，组件无需各自检查
    if (unit.state._stunned) {
        unit.state._acted = true;
        return true;
    }

    // 步骤3：伤害计算
    eventBus.emit('beforeAttack', { unit, allySide, enemySide, log });
    let dmgCalc = calcFinalDamage(unit, target, attackerBuffStats, defenderBuffStats, allySide, enemySide, log);

    // 步骤4：应用伤害结果
    // 伤害免疫声明收集（小昭妹飞天等监听）——必须在扣血前发射，让监听器拿到攻击前血量
    const immuneDeclarations = [];
    eventBus.emit('beforeDamageApply', { target, dmg: dmgCalc.dmg, hpBefore: target.hp, A, log, declarations: immuneDeclarations });

    let dmgResult = applyAttackResult(unit, target, dmgCalc, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);
    const immuneResult = resolveDamageImmune(immuneDeclarations);
    if (immuneResult) {
        // 回退伤害，但构建攻击组日志让 UI 正常显示攻击动作
        applyStatChange(target, 'hp', dmgCalc.dmg, null, '免疫回退');
        unit.dmgDealt -= dmgCalc.dmg;
        target.dmgTaken -= dmgCalc.dmg;
        emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def });

        // 构建免疫攻击组：显示攻击动作但伤害为0，附带免疫原因
        let immuneHpPctBefore = Math.floor((Math.min(target.hp + dmgCalc.dmg, target.maxHp) / target.maxHp) * 100);
        let immuneHpPctAfter = Math.floor((target.hp / target.maxHp) * 100);
        let campA = unit.camp === 'ally' ? '明教' : '六大派';
        let campD = target.camp === 'ally' ? '明教' : '六大派';
        let ac = unit.camp === 'ally' ? 'blue' : 'orange';
        let dc = target.camp === 'ally' ? 'blue' : 'orange';
        let immuneGroup = { type:'attack-group', uidA:unit.uid, uidD:target.uid, entries:[
            {type:'combat-text', text:`<span class="${ac}">${campA} ${unit.name}</span>(攻${Math.floor(unit.atk)} 血${Math.floor(unit.hp)}) → <span class="${dc}">${campD} ${target.name}</span>(防${Math.floor(target.def)} 血${Math.floor(target.hp)})`},
        ], hpAfter:target.hp, alive:target.alive, isDead:false, isImmune:true, waveTaunt:null, waveUnit:null, unitRole:unit.role, _fxSnapshot:makeFXSnapshot(unit,target), _dmg:0, hpPctBefore: immuneHpPctBefore, hpPctAfter: immuneHpPctAfter, isMiss:false, isDodge:false, buffEffects:[], needsSeparator: true };
        if (immuneResult.reason) {
            immuneGroup.entries.push({type:'info', text:`<span class="gold">${immuneResult.reason}</span>`});
        }
        log.push(immuneGroup);

        if (!unit._isLinkAttack) unit.state._acted = true;
        return true;
    }

    // 步骤5：构建攻击组日志
    let group = await buildAttackGroup(unit, target, dmgCalc, dmgResult, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, phantomLog);

    // 追加乾坤衍生等暂存日志到当前攻击组末尾
    if (unit._pendingDerivedEntries) {
        for (const entry of unit._pendingDerivedEntries) {
            group.entries.push(entry);
        }
        delete unit._pendingDerivedEntries;
    }

    // ---------- 攻击后效果声明收集 ----------
    // 组件提交 { type: 'leech'|'heal'|'rebound'|'splash'|'defReduce'|'other', value, target, source }
    const afterDamageDeclarations = [];
    eventBus.emit('afterDamageApplied', { unit, target, dmg: dmgCalc.dmg, group, allySide, enemySide, log, A, B, declarations: afterDamageDeclarations });

    // 严阵以待反弹声明并入攻击后效果
    if (dmgResult.fortifyDeclarations && dmgResult.fortifyDeclarations.length > 0) {
        afterDamageDeclarations.push(...dmgResult.fortifyDeclarations);
    }
    // 攻击后效果结算 — 裁判执行，播放器拼日志
    const executedDecls = resolveAfterDamageEffects(afterDamageDeclarations, unit, target, group);
    for (const decl of executedDecls) {
        // 斩杀等声明携带的事件追加到当前攻击组，确保死亡特效不被延迟
        if (decl._events && decl._events.length > 0) {
            if (!group._events) group._events = [];
            group._events.push(...decl._events);
        }
        if (group && group.entries && decl.logText) {
            const entry = { type: decl.type === 'splash' ? 'buff-splash' : 'info', text: decl.logText };
            if (decl.type === 'leech' || decl.type === 'heal') {
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

    if (!unit._isLinkAttack) unit.state._acted = true;

    // 将本攻击产生的所有事件（hp-change等）写入攻击组，确保UI在连击/联动等后续攻击前刷新
    group._events = (group._events || []).concat(flushBattleEvents());

    // 攻击结束信号（玄冥二老联动、白骨爪追击等）
    const afterAttackData = { unit, target, dmg: dmgCalc.dmg, group, allySide, enemySide, log, A, B, state, retry: false, retryTargetUid: null };
    await eventBus.emit('afterAttack', afterAttackData);
    if (afterAttackData.retry && unit.alive) {
        const retryTargetUid = afterAttackData.retryTargetUid || (target && target.alive ? target.uid : null);
        unit.state._acted = false;
        await processUnitAttack(unit, allySide, enemySide, log, A, B, state, null, retryTargetUid);
    }

    // 队友受伤信号（乾坤反弹等）——排在白骨爪之后
    if (target.camp === 'ally') {
        eventBus.emit('allyDamaged', { attacker: unit, target, dmg: dmgCalc.dmg, allySide: A, enemySide: B, log });
    }

    // 死亡结算边裁：所有攻击后效果完成，统一裁定死亡
    resolveDeaths(allySide, enemySide, log);

    return true;
}