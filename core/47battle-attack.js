// core/47battle-attack.js - 光明顶5v5 攻击流程模块
// V5.2.1 | ~20000 bytes | 2026-07-18 拆分步骤至49battle-attack-steps
export const VER = 'core/47battle-attack.js V5.2.1';

import { CONFIG, DEF_TAUNT, HP_TAUNT } from './01config-5v5-test.js';
import { rand, calcDamage, getFangLevel, isMelee, getFronts, isBlocked, getFlyDodgeRate, getRandomTaunt, getZhangNearTaunt, makeFXSnapshot, hasBuff, getUnitCol, getUnitRow } from './03battle-utils.js';
import { computeBuffStats, applyBuffEffectsBeforeAttack, applyBuffEffectsAfterAttack } from './04buff-system.js';
// showDamageFloat 已随张无忌乾坤反弹迁移，47 不再直接使用
import {
    getRebelTarget, getRebelDmgBonus, getRebelTrueDmg,
    checkKuLian, applyXingFenGrant,
    applyDamageModifiers, isXiaoZhaoPermanentActive,
    applyPhantomDisguise, applyXiaoZhaoMindControl, checkXiaoZhaoPermanentDoubleStrike,
    getXiaoZhaoHexEnhance
} from '../modules/23elite-skills.js';
import {
    selectAttackTarget,
    resolveAttackHit,
    calcFinalDamage,
    applyAttackResult,
    buildAttackGroup
} from './49battle-attack-steps.js';
import { createXiaoZhaoSisterComponent } from '../modules/92elite-xiaozhao-sister.js';
const C = CONFIG, DT = DEF_TAUNT, HT = HP_TAUNT;

function emitEvent(unit, eventType, payload) {
    if (typeof window._emitEvent === 'function') window._emitEvent(unit, eventType, payload);
}

// ==================== 攻击后效果钩子 ====================

/**
 * 远程成长 + 飞行闪避栈 + 嗜血狂刀额外砍
 */
function applyRoleGrowth(unit, target, dmgCalc, group, unitActiveBuffs, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid) {
    if (unit.role === '远程' && dmgCalc.dmg > 0) {
        unit.atk += 2;
        if (unit._baseAtk !== undefined) unit._baseAtk += 2;
        emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def });
        group.entries.push({type:'detail', text:`<span class="blue small">🏹 ${unit.name} 远程熟练：攻击 +2 → ${Math.floor(unit.atk)}</span>`});
    }
    // 嗜血狂刀额外砍已移至 core/50buff-effects.js
}

// 已迁移至 modules/99elite-zhangwuji.js 组件

/**
 * 小昭衍生 + 韦一笑吸血
 */
// 已迁移：韦一笑吸血 → modules/98elite-weiyixiao.js 组件
// 已迁移：小昭衍生 → 后续小昭组件（modules/92/91）





// ==================== 伤害拦截器（小昭妹飞天等） ====================
const _damageInterceptors = [];

export function registerDamageInterceptor(fn) {
    _damageInterceptors.push(fn);
}

export function clearDamageInterceptors() {
    _damageInterceptors.length = 0;
}

// ==================== 主攻击流程 ====================

export function processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, lockedTargetUid) {
    // 🦋 小昭·姊蝶变附身
    if (unit.camp === 'ally' && A && !A._butterflyTriggered) {
        A._butterflyTriggered = true;
        const sisterComp = createXiaoZhaoSisterComponent();
        const sister = sisterComp.onBeforeFirstAttack(A, log);
        if (sister && unit.uid === sister.uid) {
            unit._acted = true;
            // 立即 flush 事件，确保 UI 第一时间刷新蝴蝶附身状态
            const events = [...window._battleEvents];
            window._battleEvents = [];
            if (window.GlobalStore) window.GlobalStore.flushBattleEvents();
            // 把事件附加到一条虚拟日志上，让播放器能立即消费
            log.push({ type: 'info', text: '', _events: events });
            return true;
        }
    }

    // 步骤1：选择目标
    let target, phantomLog;
    if (lockedTargetUid) {
        target = enemySide.find(u => u.uid === lockedTargetUid && u.alive) || null;
        phantomLog = null;
        if (!target) {
            let emptyGroup = { type:'attack-group', uidA:unit.uid, uidD:null, entries:[], isMiss:true, _fxSnapshot:null, waveTaunt:null, waveUnit:null, buffEffects: [] };
            emptyGroup.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span> 无法选择目标`});
            emptyGroup.entries.push({type:'info', text:`<span class="gray">锁定目标已阵亡，跳过行动</span>`});
            emptyGroup._events = [...window._battleEvents];
            window._battleEvents = [];
            if (window.GlobalStore) window.GlobalStore.flushBattleEvents();
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
        let emptyGroup = { type:'attack-group', uidA:unit.uid, uidD:null, entries:[], isMiss:true, _fxSnapshot:null, waveTaunt:null, waveUnit:null, buffEffects: [] };
        emptyGroup.entries.push({type:'combat-text', text:`<span class="${unit.camp==='ally'?'blue':'orange'}">${unit.camp==='ally'?'明教':'六大派'} ${unit.name}</span> 无法选择目标`});
        emptyGroup.entries.push({type:'info', text:`<span class="gray">无可选目标，跳过行动</span>`});
        emptyGroup._events = [...window._battleEvents];
        window._battleEvents = [];
        if (window.GlobalStore) window.GlobalStore.flushBattleEvents();
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
    unit.buffAtkBonus = attackerBuffStats.atkBonus;
    unit.buffDefBonus = attackerBuffStats.defBonus;
    unit.buffDodgeBonus = attackerBuffStats.dodgeBonus;
    unit.buffHpBonus = attackerBuffStats.hpBonus;

    let targetActiveBuffs = target.camp === 'ally' ? A._activeBuffs : B._activeBuffs;
    let targetAllyTeam = target.camp === 'ally' ? A : B;
    let defenderBuffStats = computeBuffStats(target, targetActiveBuffs, targetAllyTeam);
    target.buffAtkBonus = defenderBuffStats.atkBonus;
    target.buffDefBonus = defenderBuffStats.defBonus;
    target.buffDodgeBonus = defenderBuffStats.dodgeBonus;
    target.buffHpBonus = defenderBuffStats.hpBonus;

    // 成昆攻击前清除伪装已移至 modules/95elite-chengkun.js 组件

    // 步骤2：未命中+闪避判定
    let hitResult = resolveAttackHit(unit, target, attackerBuffStats, defenderBuffStats, log, A, B, doubleStrikeUnitUid);
    if (hitResult.skipped) {
        if (hitResult.retry) {
            const retryUid = hitResult.lockedTargetUid || null;
            processUnitAttack(unit, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, retryUid);
        }
        return true;
    }

    // 步骤3：伤害计算
    let dmgCalc = calcFinalDamage(unit, target, attackerBuffStats, defenderBuffStats, allySide, enemySide, log);

    // 步骤4：应用伤害结果
    let dmgResult = applyAttackResult(unit, target, dmgCalc, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);

    // 伤害拦截器（小昭妹飞天等）
    let immune = false;
    for (const interceptor of _damageInterceptors) {
        if (interceptor(target, dmgCalc.dmg, A, log)) {
            immune = true;
            break;
        }
    }
    if (immune) {
        target.hp = Math.min(target.maxHp, target.hp + dmgCalc.dmg);
        unit.dmgDealt -= dmgCalc.dmg;
        target.dmgTaken -= dmgCalc.dmg;
        emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def });
        unit._acted = true;
        // 立即 flush 事件，确保 UI 第一时间刷新蜘蛛飞天状态
        const events = [...window._battleEvents];
        window._battleEvents = [];
        if (window.GlobalStore) window.GlobalStore.flushBattleEvents();
        log.push({ type: 'info', text: '', _events: events });
        return true;
    }

    // 步骤5：构建攻击组日志
    let group = buildAttackGroup(unit, target, dmgCalc, dmgResult, attackerBuffStats, defenderBuffStats, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid, phantomLog);

    // 小昭·妹飞天免疫已移至 modules/91elite-xiaozhao-brother.js 组件

    // 攻击后效果 — 远程成长保留，其余已迁移
    applyRoleGrowth(unit, target, dmgCalc, group, unitActiveBuffs, allySide, enemySide, log, A, B, state, doubleStrikeUnitUid);
    
    if (!unit._isLinkAttack) unit._acted = true;

    // 玄冥二老联动攻击（主攻击命中后，搭档对同一目标发动额外攻击）
    if (!unit._isLinkAttack && dmgCalc.dmg > 0 && target.alive) {
        const isLuOrHe = (unit.name === '鹿杖客' || unit.name === '鹤笔翁');
        if (isLuOrHe) {
            const partnerName = unit.name === '鹿杖客' ? '鹤笔翁' : '鹿杖客';
            const partner = allySide.find(u => u.name === partnerName && u.alive && !u._linkTriggered);
            if (partner) {
                const wasActed = partner._acted;
                partner._isLinkAttack = true;
                partner._linkTriggered = true;
                partner._acted = false;
                log.push({type:'info', text:`<span class="gold">🔗 ${partner.name} 跟随 ${unit.name} 发动联动攻击！</span>`});
                processUnitAttack(partner, allySide, enemySide, log, A, B, state, null, target.uid);
                partner._isLinkAttack = false;
                if (wasActed) partner._acted = true;
            }
        }
    }

    // 空列和残血光环已移至回合开始时统一处理（core/48battle-round.js）
    return true;
}