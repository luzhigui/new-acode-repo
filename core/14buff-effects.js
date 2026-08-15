// core/14buff-effects.js - 光明顶5v5 海克斯效果函数库
// V5.3.1 | 按身份拆分：普通团队 / 姐姐强化 / 妹妹永久
// 死代码已清理：Bloodthirst/HotBlood/WindAssault/MeteorShower/FortifyRebound 系列已迁移至事件总线监听器
export const VER = 'core/14buff-effects.js V5.4.0';

import { CONFIG } from './01config-5v5-test.js';
import { getUnitRow, getUnitCol } from './03battle-utils.js';
import { eventBus } from './00-event-bus.js';
import { getBattleRng, swapUnitPositions } from './13battle-shared.js';
const C = CONFIG;

// ==================== 严阵以待防御加成 ====================
// 严阵-普通：防战防御比率加成
export function applyFortifyDef_Normal(unit, stats) { stats.defBonus += CONFIG.BUFFS.fortify.defBonus; }
// 严阵-姐姐：防战防御比率加成（同普通）
export function applyFortifyDef_Sister(unit, stats) { stats.defBonus += CONFIG.BUFFS.fortify.defBonus; }
// 严阵-妹妹：防战固定50%防御加成
export function applyFortifyDef_Brother(unit, stats) { stats.defBonus += 0.5; }

// ==================== 流云身法闪避 ====================
// 流云-普通：全队闪避率加成
export function applyCloudBodyDodge_Normal(unit, stats) { stats.dodgeBonus = CONFIG.BUFFS.cloudBody.dodgeBonus; }
// 流云-姐姐：全队闪避率加成（同普通）
export function applyCloudBodyDodge_Sister(unit, stats) { stats.dodgeBonus = CONFIG.BUFFS.cloudBody.dodgeBonus; }
// 流云-妹妹：固定25%闪避率
export function applyCloudBodyDodge_Brother(unit, stats) { stats.dodgeBonus = 0.25; }

// ==================== 圣火令加成 ====================
// 圣火-普通：按随机行列加攻防比率
export function applyHolyFlame_Normal(unit, allyTeam, activeBuffs, stats) {
    const holyFlameBuff = activeBuffs.find(b => b.key === 'holyFlame');
    if (!holyFlameBuff || unit.camp !== 'ally') return;
    const cols = holyFlameBuff.cols || (holyFlameBuff.col != null ? [holyFlameBuff.col] : []);
    const rows = holyFlameBuff.rows || (holyFlameBuff.row != null ? [holyFlameBuff.row] : []);
    if (cols.includes(getUnitCol(unit.pos))) stats.atkBonus += CONFIG.BUFFS.holyFlame.atkBonus;
    if (rows.includes(getUnitRow(unit.pos))) stats.defBonus += CONFIG.BUFFS.holyFlame.defBonus;
}

// 圣火-姐姐：同普通圣火令
export function applyHolyFlame_Sister(unit, allyTeam, activeBuffs, stats) {
    applyHolyFlame_Normal(unit, allyTeam, activeBuffs, stats);
}

// 圣火-妹妹：全队攻防比率加成
export function applyHolyFlame_Brother(unit, allyTeam, activeBuffs, stats) {
    stats.atkBonus += CONFIG.BUFFS.holyFlame.atkBonus;
    stats.defBonus += CONFIG.BUFFS.holyFlame.defBonus;
}

// ==================== Carry 加成 ====================
// Carry-普通：5号位获取队友属性加成（死亡翻倍）
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

// Carry-姐姐：4-6号位获取队友属性加成
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

// ==================== 惑人心智 ====================
function applyMindControlCore(unit, allySide, enemySide, log, swapChanceEnemy, swapChanceAlly) {
    const rng = getBattleRng();
    let frontUnit = allySide.filter(u => u.alive && !u.isHorse).sort((a,b) => a.pos - b.pos)[0];
    if (!frontUnit || frontUnit.uid !== unit.uid) return;

    if (rng.nextInt(1,100) <= swapChanceEnemy) {
        let enemies = enemySide.filter(u => u.alive && u.state._flyMode !== 'butterfly' && u.state._flyMode !== 'spider' && !u.state._spiderFlying);
        if (enemies.length >= 2) {
            let a = enemies[rng.nextInt(0, enemies.length-1)];
            let b; do { b = enemies[rng.nextInt(0, enemies.length-1)]; } while (b.uid === a.uid);
            let posA = a.pos, posB = b.pos;
            swapUnitPositions(a, b);
            log.push({type:'buff-swap', uidA: a.uid, uidB: b.uid, oldPosA: posA, oldPosB: posB, buffType:'swap', text:`<span class="gold">🌀 惑人心智：${posA}号位${a.name}与${posB}号位${b.name}互换位置！</span>`});
        } else {
            log.push({type:'info', text:`<span class="gray">🌀 惑人心智敌方换位失败（可用单位不足）</span>`});
        }
    } else {
        log.push({type:'info', text:`<span class="gray">🌀 惑人心智敌方换位未触发</span>`});
    }
    if (rng.nextInt(1,100) <= swapChanceAlly) {
        let allies = allySide.filter(u => u.alive && u.state._flyMode !== 'butterfly' && u.state._flyMode !== 'spider' && !u.state._spiderFlying);
        if (allies.length >= 2) {
            let a = allies[rng.nextInt(0, allies.length-1)];
            let b; do { b = allies[rng.nextInt(0, allies.length-1)]; } while (b.uid === a.uid);
            let posA = a.pos, posB = b.pos;
            swapUnitPositions(a, b);
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

// 惑心-普通：80%扰乱敌方换位，40%己方换位
export function applyMindControl_Normal(unit, allySide, enemySide, log) {
    applyMindControlCore(unit, allySide, enemySide, log, 80, 40);
}

// 惑心-姐姐：95%扰乱敌方换位，50%己方换位
export function applyMindControl_Sister(unit, allySide, enemySide, log) {
    applyMindControlCore(unit, allySide, enemySide, log, 95, 50);
}
