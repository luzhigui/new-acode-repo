// modules/23elite-skills.js - 光明顶5v5 精英技能系统
// V5.0.1 | ~10585 bytes | 2026-07-05
export const VER = 'modules/23elite-skills.js V5.0.2';

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
 * 周芷若 - 九阴白骨爪：基础伤害 + 已损失生命追击 + 连锁触发自己 + 低血斩杀
 * 嫉妒：张无忌在场时基础伤害与比例提升
 * 斩杀：本次伤害打完后若剩余血量 ≤ 15% 直接斩杀（带走剩余血量）
 */
export function checkNineYinClaw(attacker, target, baseDmg, log) {
    if (attacker.name !== '周芷若') return 0;
    if (!target || !target.alive) return 0;
    const s = ES.nineYinClaw;

    // 嫉妒联动：张无忌在场 → 基础5+3%，否则 基础3+2%
    const zhangAlive = window._currentBattleState && window._currentBattleState.ally &&
        window._currentBattleState.ally.some(u => u.isZhang && u.alive);
    const baseHit = zhangAlive ? (s.jealousBaseDmg || 5) : (s.baseDmg || 3);
    const ratio = zhangAlive ? s.jealousLostHpRatio : s.lostHpRatio;

    // 首次必定触发，后续按 procChance
    if (!attacker._nineYinFirstDone) {
        attacker._nineYinFirstDone = true;
    } else {
        if (Math.random() > s.procChance) return 0;
    }

    let totalBonus = 0;
    let depth = 0;
    while (target.alive) {
        if (depth > 0 && Math.random() > s.chainProcChance) break;

        const lostHp = target.maxHp - target.hp;
        const ratioDmg = Math.floor(lostHp * ratio);
        let bonusDmg = baseHit + Math.max(0, ratioDmg);

        target.hp = Math.max(0, target.hp - bonusDmg);
        totalBonus += bonusDmg;
        attacker.dmgDealt += bonusDmg;
        target.dmgTaken += bonusDmg;

        const hpPctAfter = target.hp / target.maxHp;
        let isExecute = false;
        if (hpPctAfter <= s.executeThreshold && target.hp > 0) {
            bonusDmg += target.hp;
            target.hp = 0;
            isExecute = true;
        }

        if (target.hp <= 0) {
            target.hp = 0;
            target.alive = false;
            target._isDead = true;
            if (!target._deathTime) target._deathTime = Date.now();
        }
        if (typeof window._emitEvent === 'function') {
            window._emitEvent(target, 'hp-change', { hp: target.hp, maxHp: target.maxHp, alive: target.alive, atk: target.atk, def: target.def, _isDead: target._isDead });
        }

        log.push({
            type: 'info',
            text: `<span style="color:#222">🐾 九阴白骨爪${depth > 0 ? '连锁' : '追击'}！${attacker.name} 对 ${target.name} 造成 ${bonusDmg} 点伤害${isExecute ? '（斩杀）' : (zhangAlive ? '【嫉妒】' : '')}</span>`,
            buffType: 'elite_bonus',
            isClawHit: true,
            clawAttackerUid: attacker.uid,
            clawTargetUid: target.uid,
            clawTargetHpAfter: target.hp,
            clawTargetAlive: target.alive,
            clawTargetIsDead: target._isDead,
            isExecute: isExecute,
            uidD: target.uid,
            isDead: !target.alive
        });

        depth++;
        if (isExecute) break;
    }
    return totalBonus;
}

/**
 * 宋青书 - 叛逆突袭：锁定血量百分比最高目标
 */
export function getRebelTarget(attacker, enemySide) {
    if (attacker.name !== '宋青书') return null;
    const alive = enemySide.filter(u => u.alive);
    if (alive.length === 0) return null;
    return alive.reduce((a, b) => (a.hp / a.maxHp) > (b.hp / b.maxHp) ? a : b);
}

/**
 * 宋青书增伤比例
 */
export function getRebelDmgBonus(attacker) {
    if (attacker.name !== '宋青书') return 0;
    return ES.rebelStrike.dmgBonus;
}

/**
 * 宋青书 - 真实伤害
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
    if (unit.hp <= 0) {
        unit.hp = 0;
        unit.alive = false;
        unit._isDead = true;
        if (!unit._deathTime) unit._deathTime = Date.now();
    }
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
 * 苦练判定
 */
export function checkKuLian(allyTeam) {
    const song = allyTeam.find(u => u.name === '宋青书' && u.alive);
    if (!song) return null;
    const zhou = allyTeam.find(u => u.name === '周芷若' && u.alive);
    if (zhou) return null;
    return song;
}

/**
 * 性奋授予
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
 * 新婚扣血+叠快乐
 */
export function applyXinHunDeduction(attacker, allyTeam, log) {
    if (attacker.name !== '宋青书') return;
    const zhou = allyTeam.find(u => u.name === '周芷若' && u.alive);
    if (!zhou) return;
    zhou.hp = Math.max(0, zhou.hp - ES.xinHun.hpDeduct);
    zhou.dmgTaken += ES.xinHun.hpDeduct;
    if (typeof window._emitEvent === 'function') {
        window._emitEvent(zhou, 'hp-change', { hp: zhou.hp, maxHp: zhou.maxHp, alive: zhou.alive, atk: zhou.atk, def: zhou.def });
    }
    if (typeof emitEvent === 'function') {
        emitEvent(zhou, 'hp-change', { hp: zhou.hp, maxHp: zhou.maxHp, alive: zhou.alive, atk: zhou.atk, def: zhou.def });
    }
    zhou._kuaiLeStack.push({ healPct: ES.xinHun.healLevels[0] });
    log.push({
        type: 'info',
        text: `<span class="gold">💒 新婚：${attacker.name}攻击，${zhou.name}被扣除${ES.xinHun.hpDeduct}点血量，叠加一层快乐(16%)！当前快乐层数：${zhou._kuaiLeStack.length}</span>`,
        buffType: 'elite_xinhun',
        zhouUid: zhou.uid,
        zhouHpAfter: zhou.hp
    });
    if (zhou.hp <= 0) {
        zhou.hp = 0;
        zhou.alive = false;
        zhou._isDead = true;
        if (!zhou._deathTime) zhou._deathTime = Date.now();
        log.push({
            type: 'info',
            text: `<span class="red">💀 ${zhou.name} 因新婚扣血而阵亡！</span>`,
            uidD: zhou.uid,
            isDead: true
        });
    }
}

/**
 * 快乐回血+降级
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
            const levels = ES.xinHun.healLevels;
            const currentIdx = levels.indexOf(layer.healPct);
            if (currentIdx >= 0 && currentIdx < levels.length - 1) {
                newStack.push({ healPct: levels[currentIdx + 1] });
            }
        });
        if (totalHeal > 0) {
            const hpBefore = unit.hp;
            unit.hp = Math.min(unit.maxHp, unit.hp + totalHeal);
            unit.healDone += totalHeal;
            if (typeof window._emitEvent === 'function') {
                window._emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def });
            }
            log.push({
                type: 'info',
                text: `<span class="green">💚 快乐回血：${unit.name} 回复${totalHeal}点生命（${unit._kuaiLeStack.length}层触发），血量 ${Math.floor(hpBefore)} → ${Math.floor(unit.hp)}</span>`,
                buffType: 'elite_kuaile_heal',
                zhouUid: unit.uid,
                zhouHpAfter: unit.hp
            });
        }
        unit._kuaiLeStack = newStack;
    });
}

export function canXingFenTrigger(attacker) {
    if (attacker.name !== '宋青书') return false;
    if (!attacker._xingFenActive) return false;
    if (!attacker.alive) return false;
    return true;
}

export function consumeXingFen(attacker) {
    attacker._xingFenActive = false;
}