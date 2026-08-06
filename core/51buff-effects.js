// core/51buff-effects.js - 光明顶5v5 海克斯效果函数库
// V5.2.1 | 按身份拆分：普通团队 / 姐姐强化 / 妹妹永久
export const VER = 'core/51buff-effects.js V5.3.1';

import { CONFIG } from './01config-5v5-test.js';
import { rand, hasBuff, getUnitRow, getUnitCol, getAdjacentPositions } from './03battle-utils.js';
import { isXiaoZhaoPermanentActive, getXiaoZhaoHexEnhance } from '../modules/23elite-skills.js';
import { emitEvent } from './50battle-shared.js';
import { eventBus } from './00-event-bus.js';
const C = CONFIG;

function emit(unit, payload) {
    emitEvent(unit, 'hp-change', payload);
}

// ==================== 嗜血狂刀 ====================
export function applyBloodthirst_Normal(unit, target, dmg, allySide, enemySide, log) {
    if (unit.role !== '战士') return;
    let leech = Math.floor(dmg * C.BUFFS.bloodthirst.leechRatio);
    let hpBefore = unit.hp;
    unit.hp = Math.min(unit.maxHp, unit.hp + leech);
    unit.healDone += leech;
    emit(unit, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def });
    log.push({type:'buff-leech', text:`<span class="green">🗡️ ${unit.name} 的嗜血狂刀吸血+${leech}，血量 ${hpBefore} → ${unit.hp}</span>`, isHealEntry:true, buffType:'leech', healAmount:leech, healUnitUid:unit.uid});
}

export async function applyBloodthirst_Sister(unit, target, dmg, allySide, enemySide, log) {
    applyBloodthirst_Normal(unit, target, dmg, allySide, enemySide, log);
    // 姐姐强化：发射信号，由引擎层统一调度额外攻击
    if (unit.alive && target.alive && !unit._bloodthirstStriked) {
        unit._bloodthirstStriked = true;
        eventBus.emit('requestExtraAttack', { unit, target, allySide, enemySide, log });
    }
}

export function applyBloodthirst_Brother(unit, target, dmg, allySide, enemySide, log) {
    if (unit.role !== '战士') return;
    let leech = Math.floor(dmg * 0.8);
    if (leech > 0) {
        unit.hp = Math.min(unit.maxHp, unit.hp + leech);
        unit.healDone += leech;
        log.push({type:'buff-leech', text:`<span class="green">🦋 蝶血：小昭嗜血狂刀吸血+${leech}</span>`, isHealEntry:true, healAmount:leech, healUnitUid:unit.uid});
    }
}

// ==================== 热血奋战 ====================
export function applyHotBlood_Normal(unit, target, dmg, allySide, enemySide, log) {
    if (!unit._hotBloodCount) unit._hotBloodCount = 0;
    unit._hotBloodCount++;
    if (unit.alive && unit.hp < unit.maxHp) {
        let ratio = (unit._hotBloodCount % 3 === 0) ? C.BUFFS.hotBlood.critRatio : C.BUFFS.hotBlood.leechRatio;
        let leech = Math.min(Math.floor((unit.maxHp - unit.hp) * ratio), unit.maxHp - unit.hp);
        let hpBefore = unit.hp;
        unit.hp = Math.min(unit.maxHp, unit.hp + leech);
        unit.healDone += leech;
        emit(unit, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def });
        let tag = (unit._hotBloodCount % 3 === 0) ? '❤️‍🔥 热血奋战(翻倍)' : '❤️ 热血奋战';
        log.push({type:'buff-leech', text:`<span class="green">${tag}：${unit.name} 回复+${leech}，血量 ${hpBefore} → ${unit.hp}</span>`, isHealEntry:true, buffType:'hotBlood', healAmount:leech, healUnitUid:unit.uid});
    }
}

export function applyHotBlood_Sister(unit, target, dmg, allySide, enemySide, log) {
    if (!unit._hotBloodCount) unit._hotBloodCount = 0;
    unit._hotBloodCount++;
    if (unit.alive && unit.hp < unit.maxHp) {
        let leechPct = 0.20;
        let critInterval = 2;
        let ratio = (unit._hotBloodCount % critInterval === 0) ? 0.40 : leechPct;
        let leech = Math.min(Math.floor((unit.maxHp - unit.hp) * ratio), unit.maxHp - unit.hp);
        let hpBefore = unit.hp;
        unit.hp = Math.min(unit.maxHp, unit.hp + leech);
        unit.healDone += leech;
        emit(unit, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def });
        let tag = (unit._hotBloodCount % critInterval === 0) ? '❤️‍🔥 热血奋战(翻倍)' : '❤️ 热血奋战';
        log.push({type:'buff-leech', text:`<span class="green">${tag}：${unit.name} 回复+${leech}，血量 ${hpBefore} → ${unit.hp}</span>`, isHealEntry:true, buffType:'hotBlood', healAmount:leech, healUnitUid:unit.uid});
    }
}

export function applyHotBlood_Brother(unit, target, dmg, allySide, enemySide, log) {
    if (!unit._hotBloodCount) unit._hotBloodCount = 0;
    unit._hotBloodCount++;
    if (unit.alive && unit.hp < unit.maxHp) {
        let ratio = (unit._hotBloodCount % 2 === 0) ? 0.40 : 0.20;
        let leech = Math.min(Math.floor((unit.maxHp - unit.hp) * ratio), unit.maxHp - unit.hp);
        unit.hp = Math.min(unit.maxHp, unit.hp + leech);
        unit.healDone += leech;
        let tag = (unit._hotBloodCount % 2 === 0) ? '🦋 热血(翻倍)' : '🦋 热血';
        log.push({type:'buff-leech', text:`<span class="green">${tag}：小昭回复+${leech}</span>`, isHealEntry:true, healAmount:leech, healUnitUid:unit.uid});
    }
}

// ==================== 乘风突袭 ====================
function applyWindAssaultCore(unit, target, dmg, allySide, enemySide, log, hitProb, pushProb, label) {
    if (unit.role !== '飞行' || !target.alive) return;
    if (rand(1,100) <= hitProb) {
        let row = getUnitRow(target.pos);
        let rowTargets = enemySide.filter(u => u.alive && getUnitRow(u.pos) === row && u.uid !== target.uid && !(u._flyMode === 'butterfly') && !(u._flyMode === 'spider') && !u._spiderFlying);
        if (rowTargets.length > 0) {
            let hitDmg = Math.floor(dmg);
            let details = rowTargets.map(rt => {
                let hpBefore = Math.floor(rt.hp);
                rt.hp -= hitDmg; unit.dmgDealt += hitDmg; rt.dmgTaken += hitDmg;
                if (rt.hp <= 0) { rt.hp = 0; rt.alive = false; }
                emit(rt, { hp: rt.hp, maxHp: rt.maxHp, alive: rt.alive, atk: rt.atk, def: rt.def });
                return `${rt.name}：${hpBefore}→${Math.floor(rt.hp)}`;
            }).join('，');
            log.push({type:'buff-splash', text:`<span class="orange">${label}波及${details}，各 -${hitDmg}</span>`, buffType:'wind_assault', attackerUid: unit.uid});
        }
    } else {
        log.push({type:'info', text:`<span class="gray">${label}波及触发失败</span>`});
    }
    if (rand(1,100) <= pushProb) {
        let behindPos = target.pos + 3;
        if (behindPos <= 9) {
            let oldPos = target.pos;
            let targetTeam = target.camp === 'ally' ? allySide : enemySide;
            let behindUnit = targetTeam.find(u => u.pos === behindPos && u.alive);
            if (behindUnit) {
                let behindOldPos = behindUnit.pos;
                let tempPos = target.pos; target.pos = behindPos; behindUnit.pos = tempPos;
                log.push({type:'buff-push', pushTargetUid: target.uid, behindUid: behindUnit.uid, oldPos: oldPos, newPos: behindPos, behindOldPos: behindOldPos, buffType:'push', text:`<span class="gold" style="font-size:1.1em;">${label}击退！${target.name}从${oldPos}号位击退至${behindPos}号位，${behindUnit.name}被迫从${behindOldPos}号位移至${oldPos}号位</span>`});
            } else {
                target.pos = behindPos;
                log.push({type:'buff-push', pushTargetUid: target.uid, behindUid: null, oldPos: oldPos, newPos: behindPos, buffType:'push', text:`<span class="gold" style="font-size:1.1em;">${label}击退！${target.name}从${oldPos}号位被击退至${behindPos}号位</span>`});
            }
        }
    } else {
        log.push({type:'info', text:`<span class="gray">${label}击退触发失败</span>`});
    }

    // 击退/换位完成后广播（被动技能监听，如张无忌前排检测）
    eventBus.emit('onPositionSwap', { allySide, enemySide, log });
}

export function applyWindAssault_Normal(unit, target, dmg, allySide, enemySide, log) {
    applyWindAssaultCore(unit, target, dmg, allySide, enemySide, log, 80, 60, '🦅 乘风突袭');
}

export function applyWindAssault_Sister(unit, target, dmg, allySide, enemySide, log) {
    applyWindAssaultCore(unit, target, dmg, allySide, enemySide, log, 100, 80, '🦅 乘风突袭');
}

export function applyWindAssault_Brother(unit, target, dmg, allySide, enemySide, log) {
    if (unit.role !== '飞行') return;
    applyWindAssaultCore(unit, target, dmg, allySide, enemySide, log, 80, 60, '🦋 蝶翼');
}

// ==================== 流星赶月 ====================
function applyMeteorShowerCore(unit, target, dmg, allySide, enemySide, log, label) {
    if (unit.role !== '远程') return;
    let bonusDmg = Math.floor(dmg * C.BUFFS.meteorShower.bonusRatio);
    unit.dmgDealt += bonusDmg;
    if (target.alive) {
        target.hp -= bonusDmg; target.dmgTaken += bonusDmg;
        target.def = Math.max(0, target.def - (C.BUFFS.meteorShower.mainDefReduce || 2));
        if (target.hp <= 0) { target.hp = 0; target.alive = false; }
        emit(target, { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def });
    }
    log.push({type:'buff-bonus', text:`<span class="gold">${label}伤害加深：${target.name} 额外-${bonusDmg}，防御-${C.BUFFS.meteorShower.mainDefReduce || 2}</span>`, buffType:'meteor_bonus', targetUid: target.uid, bonusDmg: bonusDmg});
    let splashDmg = Math.floor(dmg * C.BUFFS.meteorShower.splashRatio);
    let adjPositions = getAdjacentPositions(target.pos);
    const splashSide = target.camp === unit.camp ? allySide : enemySide;
    let splashTargets = splashSide.filter(u => u.alive && adjPositions.includes(u.pos) && !(u._flyMode === 'butterfly') && !(u._flyMode === 'spider') && !u._spiderFlying);
    if (splashTargets.length > 0) {
        let details = splashTargets.map(st => {
            let hpBefore = Math.floor(st.hp);
            st.hp -= splashDmg; unit.dmgDealt += splashDmg; st.dmgTaken += splashDmg;
            st.def = Math.max(0, st.def - (C.BUFFS.meteorShower.splashDefReduce || 1));
            if (st.hp <= 0) { st.hp = 0; st.alive = false; st._isDead = true; }
            emit(st, { hp: st.hp, maxHp: st.maxHp, alive: st.alive, atk: st.atk, def: st.def });
            return `${st.name}：${hpBefore}→${Math.floor(st.hp)}`;
        }).join('，');
        log.push({type:'buff-splash', text:`<span class="orange">${label}溅射：${details}，各-${splashDmg}，防御-${C.BUFFS.meteorShower.splashDefReduce || 1}</span>`, buffType:'meteor_splash', attackerUid: unit.uid, primaryUid: target.uid, splashUids: splashTargets.map(st => st.uid), splashDmg: splashDmg});
    }
}

export function applyMeteorShower_Normal(unit, target, dmg, allySide, enemySide, log) {
    applyMeteorShowerCore(unit, target, dmg, allySide, enemySide, log, '☄️ 流星赶月');
}

export function applyMeteorShower_Sister(unit, target, dmg, allySide, enemySide, log) {
    applyMeteorShower_Normal(unit, target, dmg, allySide, enemySide, log);
    // 姐姐强化：溅射命中后攻击者额外+2攻（在调度中心处理）
}

export function applyMeteorShower_Brother(unit, target, dmg, allySide, enemySide, log) {
    applyMeteorShowerCore(unit, target, dmg, allySide, enemySide, log, '🦋 蝶星');
}

// ==================== 严阵以待 ====================
// 严阵以待在 computeBuffStats 中处理（防御+50%），此处处理反弹
export function applyFortifyRebound(unit, target, atkAct, defAct, allySide, enemySide, log) {
    // 这个效果在攻击流程的 applyAttackResult 中触发
}

// ==================== 严阵以待防御加成 ====================
export function applyFortifyDef_Normal(unit, stats) { stats.defBonus += CONFIG.BUFFS.fortify.defBonus; }
export function applyFortifyDef_Sister(unit, stats) { stats.defBonus += CONFIG.BUFFS.fortify.defBonus; }
export function applyFortifyDef_Brother(unit, stats) { stats.defBonus += 0.5; }

// ==================== 流云身法闪避 ====================
export function applyCloudBodyDodge_Normal(unit, stats) { stats.dodgeBonus = CONFIG.BUFFS.cloudBody.dodgeBonus; }
export function applyCloudBodyDodge_Sister(unit, stats) { stats.dodgeBonus = CONFIG.BUFFS.cloudBody.dodgeBonus; }
export function applyCloudBodyDodge_Brother(unit, stats) { stats.dodgeBonus = 0.25; }

// ==================== 圣火令加成 ====================
export function applyHolyFlame_Normal(unit, allyTeam, activeBuffs, stats) {
    const holyFlameBuff = activeBuffs.find(b => b.key === 'holyFlame');
    if (!holyFlameBuff || unit.camp !== 'ally') return;
    const cols = holyFlameBuff.cols || (holyFlameBuff.col != null ? [holyFlameBuff.col] : []);
    const rows = holyFlameBuff.rows || (holyFlameBuff.row != null ? [holyFlameBuff.row] : []);
    if (cols.includes(getUnitCol(unit.pos))) stats.atkBonus += CONFIG.BUFFS.holyFlame.atkBonus;
    if (rows.includes(getUnitRow(unit.pos))) stats.defBonus += CONFIG.BUFFS.holyFlame.defBonus;
}

export function applyHolyFlame_Sister(unit, allyTeam, activeBuffs, stats) {
    applyHolyFlame_Normal(unit, allyTeam, activeBuffs, stats);
}

export function applyHolyFlame_Brother(unit, allyTeam, activeBuffs, stats) {
    stats.atkBonus += CONFIG.BUFFS.holyFlame.atkBonus;
    stats.defBonus += CONFIG.BUFFS.holyFlame.defBonus;
}

// ==================== Carry 加成 ====================
export function calcCarryBonus_Normal(unit, allyTeam) {
    if (unit.pos !== 5 || !unit.alive || unit.isHorse) return { atkAbs: 0, defAbs: 0, hpAbs: 0 };
    let carryAtkAbs = 0, carryDefAbs = 0, carryHpAbs = 0;
    let allAllies = allyTeam.filter(u => u.uid !== unit.uid && !u.isHorse);
    allAllies.forEach(a => {
        let mult = a.alive ? 1 : (CONFIG.BUFFS.carry.deathMultiplier || 3);
        carryAtkAbs += Math.floor(a.atk * (CONFIG.BUFFS.carry.atkBonus || 0.08) * mult);
        carryDefAbs += Math.floor(a.def * (CONFIG.BUFFS.carry.defBonus || 0.08) * mult);
        if (CONFIG.BUFFS.carry.hpBonus) carryHpAbs += Math.floor(a._baseMaxHp ? a._baseMaxHp * CONFIG.BUFFS.carry.hpBonus * mult : 0);
    });
    return { atkAbs: carryAtkAbs, defAbs: carryDefAbs, hpAbs: carryHpAbs };
}

export function calcCarryBonus_Sister(unit, allyTeam) {
    if ((unit.pos < 4 || unit.pos > 6) || !unit.alive || unit.isHorse) return { atkAbs: 0, defAbs: 0, hpAbs: 0 };
    let carryAtkAbs = 0, carryDefAbs = 0, carryHpAbs = 0;
    let allAllies = allyTeam.filter(u => u.uid !== unit.uid && !u.isHorse);
    allAllies.forEach(a => {
        let mult = a.alive ? 1 : (CONFIG.BUFFS.carry.deathMultiplier || 3);
        carryAtkAbs += Math.floor(a.atk * (CONFIG.BUFFS.carry.atkBonus || 0.08) * mult);
        carryDefAbs += Math.floor(a.def * (CONFIG.BUFFS.carry.defBonus || 0.08) * mult);
        if (CONFIG.BUFFS.carry.hpBonus) carryHpAbs += Math.floor(a._baseMaxHp ? a._baseMaxHp * CONFIG.BUFFS.carry.hpBonus * mult : 0);
    });
    return { atkAbs: carryAtkAbs, defAbs: carryDefAbs, hpAbs: carryHpAbs };
}
export function applyFortifyRebound_Normal(unit, target, atkAct, defAct, allySide, enemySide, log) {
    let reboundDmg = Math.floor((atkAct - Math.floor(atkAct * (atkAct / (atkAct + defAct)))) / 2);
    if (reboundDmg <= 0) return null;
    let attHpBefore = Math.floor(unit.hp);
    unit.hp -= reboundDmg; target.reboundDone += reboundDmg;
    unit.dmgTaken += reboundDmg;
    if (unit.hp <= 0) { unit.hp = 0; unit.alive = false; unit._isDead = true; if (!unit._deathTime) unit._deathTime = Date.now(); }
    emit(unit, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _isDead: unit._isDead || false });
    return {
        type: 'buff-rebound-fortify',
        text: `<span class="gold">🛡️ 严阵以待反弹${reboundDmg}给${unit.name}，${unit.name}血量 ${attHpBefore} → ${Math.floor(unit.hp)}</span>`,
        buffType: 'fortify_rebound', reboundDmg: reboundDmg, attackerUid: unit.uid, defenderUid: target.uid, uidD: unit.uid, isDead: !unit.alive
    };
}

export function applyFortifyRebound_Sister(unit, target, atkAct, defAct, allySide, enemySide, log) {
    let reboundDmg = Math.floor((atkAct - Math.floor(atkAct * (atkAct / (atkAct + defAct)))) / 2);
    if (reboundDmg <= 0) return null;
    let attHpBefore = Math.floor(unit.hp);
    unit.hp -= reboundDmg; target.reboundDone += reboundDmg;
    unit.dmgTaken += reboundDmg;
    if (unit.hp <= 0) { unit.hp = 0; unit.alive = false; unit._isDead = true; if (!unit._deathTime) unit._deathTime = Date.now(); }
    // 姐姐强化：反弹同时回复等量血量
    target.hp = Math.min(target.maxHp, target.hp + reboundDmg);
    target.healDone += reboundDmg;
    emit(unit, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _isDead: unit._isDead || false });
    emit(target, { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def });
    return {
        type: 'buff-rebound-fortify',
        text: `<span class="gold">🛡️ 严阵以待反弹${reboundDmg}给${unit.name}（姐姐强化：回复${reboundDmg}），${unit.name}血量 ${attHpBefore} → ${Math.floor(unit.hp)}</span>`,
        buffType: 'fortify_rebound', reboundDmg: reboundDmg, attackerUid: unit.uid, defenderUid: target.uid, uidD: unit.uid, isDead: !unit.alive
    };
}

export function applyFortifyRebound_Brother(unit, target, atkAct, defAct, allySide, enemySide, log) {
    return applyFortifyRebound_Normal(unit, target, atkAct, defAct, allySide, enemySide, log);
}

// ==================== 惑人心智 ====================
function applyMindControlCore(unit, allySide, enemySide, log, swapChanceEnemy, swapChanceAlly) {
    let frontUnit = allySide.filter(u => u.alive && !u.isHorse).sort((a,b) => a.pos - b.pos)[0];
    if (!frontUnit || frontUnit.uid !== unit.uid) return;
    
    if (rand(1,100) <= swapChanceEnemy) {
        let enemies = enemySide.filter(u => u.alive && u._flyMode !== 'butterfly' && u._flyMode !== 'spider' && !u._spiderFlying);
        if (enemies.length >= 2) {
            let a = enemies[rand(0, enemies.length-1)];
            let b; do { b = enemies[rand(0, enemies.length-1)]; } while (b.uid === a.uid);
            let posA = a.pos, posB = b.pos;
            a.pos = posB; b.pos = posA;
            log.push({type:'buff-swap', uidA: a.uid, uidB: b.uid, oldPosA: posA, oldPosB: posB, buffType:'swap', text:`<span class="gold">🌀 惑人心智：${posA}号位${a.name}与${posB}号位${b.name}互换位置！</span>`});
        } else {
            log.push({type:'info', text:`<span class="gray">🌀 惑人心智敌方换位失败（可用单位不足）</span>`});
        }
    } else {
        log.push({type:'info', text:`<span class="gray">🌀 惑人心智敌方换位未触发</span>`});
    }
    if (rand(1,100) <= swapChanceAlly) {
        let allies = allySide.filter(u => u.alive && u._flyMode !== 'butterfly' && u._flyMode !== 'spider' && !u._spiderFlying);
        if (allies.length >= 2) {
            let a = allies[rand(0, allies.length-1)];
            let b; do { b = allies[rand(0, allies.length-1)]; } while (b.uid === a.uid);
            let posA = a.pos, posB = b.pos;
            a.pos = posB; b.pos = posA;
            log.push({type:'buff-swap', uidA: a.uid, uidB: b.uid, oldPosA: posA, oldPosB: posB, buffType:'swap', text:`<span class="gold">🌀 惑人心智：己方${posA}号位${a.name}与${posB}号位${b.name}互换位置！</span>`});
        } else {
            log.push({type:'info', text:`<span class="gray">🌀 惑人心智己方换位失败（可用单位不足）</span>`});
        }
    } else {
        log.push({type:'info', text:`<span class="gray">🌀 惑人心智己方换位未触发</span>`});
    }

    // 换位完成后广播（被动技能监听，如张无忌前排检测）
    eventBus.emit('onPositionSwap', { allySide, enemySide, log });
}

export function applyMindControl_Normal(unit, allySide, enemySide, log) {
    applyMindControlCore(unit, allySide, enemySide, log, 80, 40);
}

export function applyMindControl_Sister(unit, allySide, enemySide, log) {
    applyMindControlCore(unit, allySide, enemySide, log, 95, 50);
}