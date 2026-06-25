// 23elite-skills.js - 光明顶对战 5v5 精英怪技能系统 (V3.1.0 宋青书/周芷若联动)
// 预估字节: 6800, 发送时间: 20260622 21:00, 版本: V3.1.0
export const VER = '23elite-skills.js V3.1.0';

import { CONFIG } from '../core/01config-5v5-test.js';
const ES = CONFIG.ELITE_SKILLS;

/**
 * 灭绝师太 - 灭绝双剑：残血反击
 */
export function checkExtinctionCounter(defender, dmg) {
    if (defender.name !== '灭绝师太') return 0;
    const s = ES.extinctionCounter;
    if (defender.hp / defender.maxHp >= s.hpThreshold) return 0;
    if (defender._extinctionUsed) return 0;
    defender._extinctionUsed = true;
    return Math.floor(defender.atk * s.counterRatio);
}

/**
 * 周芷若 - 九阴白骨爪：概率追击（含嫉妒联动）
 * 嫉妒：张无忌在场时伤害比例提升至40%
 */
export function checkNineYinClaw(attacker, baseDmg, log) {
    if (attacker.name !== '周芷若') return 0;
    const s = ES.nineYinClaw;
    const bonusRatio = (window._currentBattleState && window._currentBattleState.ally && 
        window._currentBattleState.ally.some(u => u.isZhang && u.alive)) ? s.jealousBonus : s.bonusRatio;
    
    let totalBonus = 0;
    for (let depth = 0; depth < s.maxChain; depth++) {
        if (Math.random() > s.procChance) break;
        const bonusDmg = Math.floor(baseDmg * bonusRatio);
        totalBonus += bonusDmg;
        log.push({
            type:'info', 
            text:`<span class="purple">🦅 九阴白骨爪追击！${attacker.name} 额外造成 ${bonusDmg} 点伤害（不可闪避）${bonusRatio > s.bonusRatio ? '【嫉妒】' : ''}</span>`, 
            buffType:'elite_bonus'
        });
    }
    return totalBonus;
}

/**
 * 宋青书 - 叛逆突袭：锁定血量最高目标
 */
export function getRebelTarget(attacker, enemySide) {
    if (attacker.name !== '宋青书') return null;
    const alive = enemySide.filter(u => u.alive);
    return alive.length > 0 ? alive.reduce((a, b) => a.hp > b.hp ? a : b) : null;
}

/**
 * 宋青书增伤比例（不含真实伤害，真实伤害在引擎中计算）
 */
export function getRebelDmgBonus(attacker) {
    if (attacker.name !== '宋青书') return 0;
    return ES.rebelStrike.dmgBonus;  // 0.3
}

/**
 * 宋青书 - 真实伤害（目标当前生命比例）
 */
export function getRebelTrueDmg(attacker, target) {
    if (attacker.name !== '宋青书') return 0;
    return Math.floor(target.hp * ES.rebelStrike.currentHpRatio);
}

/**
 * 成昆 - 混元霹雳劲
 */
export function getPhantomThunderBonus(attacker) {
    if (attacker.name !== '成昆') return 0;
    const lostHp = attacker.maxHp - attacker.hp;
    return Math.floor(lostHp * ES.phantomThunder.lostHpRatio);
}

/**
 * 鹿杖客 - 玄冥神掌
 */
export function applyXuanmingPalm(attacker, target) {
    if (attacker.name !== '鹿杖客') return null;
    const s = ES.xuanmingPalm;
    target._xuanmingPoison = {
        remaining: s.duration,
        dotValue: Math.floor(target.maxHp * s.dotPercent)
    };
    return {
        type: 'info',
        text: `<span class="purple">❄️ ${attacker.name} 的玄冥神掌使 ${target.name} 中毒！每回合损失 ${target._xuanmingPoison.dotValue} 点生命（持续 ${s.duration} 回合）</span>`
    };
}

export function tickXuanmingPoison(unit) {
    if (!unit._xuanmingPoison || unit._xuanmingPoison.remaining <= 0) return 0;
    unit._xuanmingPoison.remaining--;
    const dot = unit._xuanmingPoison.dotValue;
    unit.hp -= dot;
    if (unit.hp <= 0) { unit.hp = 0; unit.alive = false; }
    return dot;
}

/**
 * 鹤笔翁 - 鹿角杖法
 */
export function getHornStrikeBonus(attacker, target) {
    if (attacker.name !== '鹤笔翁') return { defIgnore: 0, dmgMultiplier: 1 };
    const s = ES.hornStrike;
    const poisoned = target._xuanmingPoison && target._xuanmingPoison.remaining > 0;
    return {
        defIgnore: s.defIgnore,
        dmgMultiplier: poisoned ? 1 + s.poisonedBonus : 1
    };
}

// ==================== V3.1.0 新增：宋青书/周芷若联动技能 ====================

/**
 * 苦练判定：场上无周芷若时，返回应率先行动的宋青书单位
 * @param {Array} allyTeam - 宋青书所在队伍
 * @returns {object|null} 宋青书单位，或null表示不触发
 */
export function checkKuLian(allyTeam) {
    const song = allyTeam.find(u => u.name === '宋青书' && u.alive);
    if (!song) return null;
    const zhou = allyTeam.find(u => u.name === '周芷若' && u.alive);
    if (zhou) return null;  // 周芷若在场，不触发苦练
    return song;
}

/**
 * 性奋授予：周芷若在场时，每回合开始时授予宋青书性奋状态
 * @param {Array} allyTeam - 敌方队伍（宋青书/周芷若所在队伍）
 * @param {Array} log - 日志数组
 */
export function applyXingFenGrant(allyTeam, log) {
    const zhou = allyTeam.find(u => u.name === '周芷若' && u.alive);
    const song = allyTeam.find(u => u.name === '宋青书' && u.alive);
    if (!zhou || !song) return;
    
    song._xingFenActive = true;
    log.push({
        type: 'buff-summary',
        text: `<span class="gold">💗 性奋：${song.name} 受${zhou.name}激励，本回合每次攻击后可再次攻击！</span>`,
        buffType: 'elite_xingfen'
    });
}

/**
 * 新婚扣血+叠快乐：宋青书每次攻击时，扣除周芷若1点血，并给周芷若叠一层16%快乐
 * @param {object} attacker - 宋青书
 * @param {Array} allyTeam - 所在队伍
 * @param {Array} log - 日志数组
 */
export function applyXinHunDeduction(attacker, allyTeam, log) {
    if (attacker.name !== '宋青书') return;
    const zhou = allyTeam.find(u => u.name === '周芷若' && u.alive);
    if (!zhou) return;
    
    // 扣血
    zhou.hp = Math.max(0, zhou.hp - ES.xinHun.hpDeduct);
    zhou.dmgTaken += ES.xinHun.hpDeduct;
    
    // 叠快乐
    zhou._kuaiLeStack.push({ healPct: ES.xinHun.healLevels[0] });  // 0.16
    
    log.push({
        type: 'info',
        text: `<span class="gold">💒 新婚：${attacker.name}攻击，${zhou.name}被扣除${ES.xinHun.hpDeduct}点血量，叠加一层快乐(16%)！当前快乐层数：${zhou._kuaiLeStack.length}</span>`,
        buffType: 'elite_xinhun'
    });
    
    if (zhou.hp <= 0) {
        zhou.hp = 0;
        zhou.alive = false;
        zhou._isDead = true;
        log.push({
            type: 'info',
            text: `<span class="red">💀 ${zhou.name} 因新婚扣血而阵亡！</span>`
        });
    }
}

/**
 * 快乐回血+降级：每回合开始时，遍历所有单位，触发快乐回血并降级
 * @param {Array} allUnits - 所有存活单位（双方合并）
 * @param {Array} log - 日志数组
 */
export function tickKuaiLeHeal(allUnits, log) {
    allUnits.forEach(unit => {
        if (!unit._kuaiLeStack || unit._kuaiLeStack.length === 0) return;
        if (!unit.alive) return;
        
        let totalHeal = 0;
        const newStack = [];
        
        unit._kuaiLeStack.forEach(layer => {
            const healAmount = Math.floor(unit.maxHp * layer.healPct);
            totalHeal += healAmount;
            
            // 降级：找到当前层在healLevels中的位置，取下一级
            const levels = ES.xinHun.healLevels;
            const currentIdx = levels.indexOf(layer.healPct);
            if (currentIdx >= 0 && currentIdx < levels.length - 1) {
                newStack.push({ healPct: levels[currentIdx + 1] });
            }
            // 如果已经是最后一级(0.01)，则不推入，即该层消失
        });
        
        if (totalHeal > 0) {
            unit.hp = Math.min(unit.maxHp, unit.hp + totalHeal);
            unit.healDone += totalHeal;
            log.push({
                type: 'info',
                text: `<span class="green">💚 快乐回血：${unit.name} 回复${totalHeal}点生命（${unit._kuaiLeStack.length}层触发），血量 ${Math.floor(unit.hp - totalHeal)} → ${Math.floor(unit.hp)}</span>`,
                buffType: 'elite_kuaile_heal'
            });
        }
        
        unit._kuaiLeStack = newStack;
    });
}

/**
 * 性奋额外攻击判定：宋青书攻击后，检查是否可触发性奋额外攻击
 * @param {object} attacker - 宋青书
 * @returns {boolean} 是否可触发额外攻击
 */
export function canXingFenTrigger(attacker) {
    if (attacker.name !== '宋青书') return false;
    if (!attacker._xingFenActive) return false;
    if (!attacker.alive) return false;
    return true;
}

/**
 * 消费性奋次数：额外攻击触发后调用
 * @param {object} attacker - 宋青书
 */
export function consumeXingFen(attacker) {
    attacker._xingFenActive = false;
}