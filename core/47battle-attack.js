// core/47battle-attack.js - 光明顶5v5 攻击流程模块
// V5.3.1 | ~6600 bytes| 2026-07-28 重构为事件总线驱动
export const VER = 'core/47battle-attack.js V5.3.1';

import { CONFIG, DEF_TAUNT, HP_TAUNT } from './01config-5v5-test.js';
import { rand, hasBuff, makeFXSnapshot } from './03battle-utils.js';

import { computeBuffStats, applyBuffEffectsBeforeAttack, applyBuffEffectsAfterAttack } from './04buff-system.js';
import {
    getRebelTarget, getRebelDmgBonus, getRebelTrueDmg,
    applyDamageModifiers, isXiaoZhaoPermanentActive,
    applyPhantomDisguise, applyXiaoZhaoMindControl, checkXiaoZhaoPermanentDoubleStrike,
    getXiaoZhaoHexEnhance
} from '../modules/23elite-skills.js';
import {
    selectAttackTarget,
    resolveAttackHit,
    calcFinalDamage,
    applyAttackResult,
    buildAttackGroup,
    resolveDamageImmune,
    resolveAfterDamageEffects,
    resolveDeaths
} from './49battle-attack-steps.js';
import { eventBus } from './00-event-bus.js';

import { emitEvent } from './50battle-shared.js';

const C = CONFIG, DT = DEF_TAUNT, HT = HP_TAUNT;



// ==================== 主攻击流程 ====================

export async function processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, lockedTargetUid) {
    // 统一拦截：眩晕单位无法响应任何攻击指令
    // 即使外部调用方（如联动、随机队友攻击）传入了眩晕单位，裁判直接拒绝
    if (unit._stunned) {
        log.push({ type:'info', text:`<span class="gray">💫 ${unit.name} 被眩晕，无法响应攻击指令</span>` });
        unit._acted = true;
        return false;
    }
    if (unit._spiderFlying || unit._flyMode === 'spider') {
        log.push({ type:'info', text:`<span class="gray">🕷️ ${unit.name} 正在飞天，无法行动</span>` });
        unit._acted = true;
        return false;
    }

    // 明教首次攻击前发射信号，由小昭姐组件自行处理蝶变附身
    if (unit.camp === 'ally' && A && !A._butterflyTriggered) {
        A._butterflyTriggered = true;
        const interceptResult = { intercepted: false, interceptUnitUid: null };
        eventBus.emit('beforeFirstAllyAttack', { A, log, unit, result: interceptResult });
        if (interceptResult.intercepted) {
            // 姐姐附身不占攻击次数，拦截后让明教第一人继续行动
            return true;
        }
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
            GlobalStore.flushBattleEvents();
            log.push(emptyGroup);
            unit._acted = true;
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
        GlobalStore.flushBattleEvents();
        log.push(emptyGroup);
        unit._acted = true;
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
        if (hitResult.retry) {
            const retryUid = hitResult.lockedTargetUid || null;
            await processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, retryUid);
        }
        return true;
    }

    // 闪避反击可能导致攻击者眩晕，眩晕后本次攻击的后续效果全部作废
    // 包括 afterAttack 信号、联动、性奋、白骨爪、飞天等均不触发
    // 裁判统一拦截，组件无需各自检查
    if (unit._stunned) {
        unit._acted = true;
        return true;
    }

    // 步骤3：伤害计算
    eventBus.emit('beforeAttack', { unit, allySide, enemySide, log });
    eventBus.emit('beforeDamageCalc', { unit, target, allySide, enemySide, log });
    let dmgCalc = calcFinalDamage(unit, target, attackerBuffStats, defenderBuffStats, allySide, enemySide, log);

    // 步骤4：应用伤害结果
    // 伤害免疫声明收集（小昭妹飞天等监听）——必须在扣血前发射，让监听器拿到攻击前血量
    const immuneDeclarations = [];
    eventBus.emit('beforeDamageApply', { target, dmg: dmgCalc.dmg, hpBefore: target.hp, A, log, declarations: immuneDeclarations });

    let dmgResult = applyAttackResult(unit, target, dmgCalc, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);
    const immuneResult = resolveDamageImmune(immuneDeclarations);
    if (immuneResult) {
        // 回退伤害，但构建攻击组日志让 UI 正常显示攻击动作
        target.hp = Math.min(target.maxHp, target.hp + dmgCalc.dmg);
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

        if (!unit._isLinkAttack) unit._acted = true;
        return true;
    }

    // 步骤5：构建攻击组日志
    let group = await buildAttackGroup(unit, target, dmgCalc, dmgResult, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, phantomLog);

    // ---------- 攻击后效果声明收集 ----------
    // 组件提交 { type: 'leech'|'heal'|'rebound'|'splash'|'defReduce'|'other', value, target, source }
    const afterDamageDeclarations = [];
    eventBus.emit('afterDamageApplied', { unit, target, dmg: dmgCalc.dmg, group, allySide, enemySide, log, A, B, declarations: afterDamageDeclarations });

    // 严阵以待反弹声明并入攻击后效果
    if (dmgResult.fortifyDeclarations && dmgResult.fortifyDeclarations.length > 0) {
        afterDamageDeclarations.push(...dmgResult.fortifyDeclarations);
    }
    // 攻击后效果结算 — 裁判按规则统一执行
    resolveAfterDamageEffects(afterDamageDeclarations, unit, target, group, log);

    if (!unit._isLinkAttack) unit._acted = true;

    // 攻击结束信号（玄冥二老联动、白骨爪追击等）
    const afterAttackData = { unit, target, dmg: dmgCalc.dmg, allySide, enemySide, log, A, B, state, retry: false, retryTargetUid: null };
    await eventBus.emit('afterAttack', afterAttackData);
    if (afterAttackData.retry && unit.alive) {
        const retryTargetUid = afterAttackData.retryTargetUid || (target && target.alive ? target.uid : null);
        unit._acted = false;
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