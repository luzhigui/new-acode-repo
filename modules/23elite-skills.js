// modules/23elite-skills.js - 光明顶5v5 精英技能系统
// V5.2.2 | ~8000 bytes | 2026-07-29 清理退役函数，保留仍在使用的精英技能
export const VER = 'modules/23elite-skills.js V5.2.2';

import { CONFIG } from '../core/01config-5v5-test.js';
import { ROLE_BONUS } from '../core/02unit.js';
import { hasBuff, rand } from '../core/03battle-utils.js';
import { emitEvent } from '../core/50battle-shared.js';
const ES = CONFIG.ELITE_SKILLS;

// ==================== 宋青书 — 叛逆突袭 ====================

export function getRebelTarget(attacker, enemySide) {
    if (attacker.name !== '宋青书') return null;
    const alive = enemySide.filter(u => u.alive);
    if (alive.length === 0) return null;
    return alive.reduce((a, b) => (a.hp / a.maxHp) > (b.hp / b.maxHp) ? a : b);
}

export function getRebelDmgBonus(attacker) {
    if (attacker.name !== '宋青书') return 0;
    return ES.rebelStrike.dmgBonus;
}

export function getRebelTrueDmg(attacker, target) {
    if (attacker.name !== '宋青书') return 0;
    return Math.floor(target.hp * ES.rebelStrike.currentHpRatio);
}

// ==================== 玄冥二老 — 中毒/鹿角 ====================

export function tickXuanmingPoison(unit) {
    if (!unit._xuanmingPoison || unit._xuanmingPoison.remaining <= 0) return 0;
    unit._xuanmingPoison.remaining--;
    const idx = Math.min(unit._xuanmingPoison.dotPercents.length - 1, ES.xuanmingPalm.duration - 1 - unit._xuanmingPoison.remaining);
    const pct = unit._xuanmingPoison.dotPercents[idx] || 0;
    const dot = Math.floor(unit.maxHp * pct);
    unit.hp -= dot;
    if (unit.hp <= 0) {
        unit.hp = 0;
        unit.alive = false;
        unit._isDead = true;
        if (!unit._deathTime) unit._deathTime = Date.now();
    }
    return dot;
}

// ==================== 乾坤大挪移升级版减伤 ====================

export function applyDamageModifiers(unit, target, dmg, allySide, enemySide, log) {
    let modifiedDmg = dmg;
    const entries = [];
    const ES = CONFIG.ELITE_SKILLS;

    const xiaoZhao = allySide.find(u => (u.isXiaoZhaoSister || u.isXiaoZhaoBrother) && u.alive);
    const zhangUpgraded = allySide.find(c => c.isZhang && c.alive);
    if (target.camp === 'ally' && xiaoZhao && zhangUpgraded && [2, 4, 6, 8].includes(target.pos)) {
        const reducedDmg = Math.round(dmg * (1 - ES.xiaoZhao.upgradedReducePct));
        const rebound = Math.floor(dmg * (ES.xiaoZhao.upgradedReboundPct || 0.20));
        const selfDmg = Math.max(1, Math.floor(dmg * (ES.xiaoZhao.upgradedSelfDmgPct || 0.10)));

        unit.hp = Math.max(0, unit.hp - rebound);
        unit.dmgTaken += rebound;
        zhangUpgraded.reboundDone += rebound;
        if (unit.hp <= 0) {
            unit.alive = false;
            unit._isDead = true;
            if (!unit._deathTime) unit._deathTime = Date.now();
        }

        zhangUpgraded.hp -= selfDmg;
        zhangUpgraded.dmgTaken += selfDmg;

        entries.push({
            type: 'buff-rebound-fortify',
            attackerUid: unit.uid,
            reboundDmg: rebound,
            selfDmg: selfDmg,
            selfDmgUid: zhangUpgraded.uid,
            text: `<span class="gold">🦋 乾坤大挪移（升级版）：减伤30%，反弹${rebound}给${unit.name}（无忌自伤${selfDmg}）</span>`,
            isDead: !unit.alive
        });

        modifiedDmg = reducedDmg;
    }

    return { modifiedDmg, entries };
}

// ==================== 宋青书/周芷若联动 — 回合级 ====================

export function checkKuLian(allyTeam) {
    const song = allyTeam.find(u => u.name === '宋青书' && u.alive);
    if (!song) return null;
    const zhou = allyTeam.find(u => u.name === '周芷若' && u.alive);
    if (zhou) return null;
    return song;
}

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

// ==================== 小昭·妹 — 蛛变/飞天/蛛落 ====================

export function spiderTransform(unit, log) {
    if (!unit.isXiaoZhaoBrother || !unit.alive) return;
    const roles = ['战士', '防战', '远程', '飞行'];
    let availableRoles = unit._lastRole ? roles.filter(r => r !== unit._lastRole) : roles;
    if (availableRoles.length === 0) availableRoles = roles;
    const newRole = availableRoles[Math.floor(Math.random() * availableRoles.length)];
    unit._lastRole = newRole;

    if (!unit._masteredRoles) unit._masteredRoles = [];
    if (!unit._masteredRoles.includes(newRole)) {
        unit._masteredRoles.push(newRole);
    }

    const newStats = ROLE_BONUS[newRole] || { atk: 0, def: 0, maxHp: 0 };
    unit.role = newRole;
    unit.atk += newStats.atk;
    unit.def += newStats.def;
    unit._baseAtk = (unit._baseAtk || unit.atk) + newStats.atk;
    unit._baseDef = (unit._baseDef || unit.def) + newStats.def;

    const prevMaxHp = unit.maxHp;
    const baseMaxHp = unit._baseMaxHp || unit.maxHp;
    let hpDelta = newStats.maxHp + 5;
    unit.maxHp += hpDelta;
    if (hpDelta > 0) {
        unit.hp += hpDelta;
    } else {
        const hpRatio = baseMaxHp > 0 ? unit.hp / baseMaxHp : 1;
        unit.hp = Math.floor(baseMaxHp * hpRatio);
    }

    emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, role: newRole });
    log.push({ type:'info', text:`<span class="gold">🕷️ 蛛变：${unit.name} 变换为<span class="gold">${newRole}</span>（已精通${unit._masteredRoles.length}/4）</span>` });
}

export function spiderReturn(unit, allyTeam, enemySide, log) {
    if (!unit.isXiaoZhaoBrother || !unit._spiderFlying) return;

    unit._spiderFlying = false;
    unit._flyMode = null;
    unit._acted = false;

    const order = [4, 5, 6, 7, 8, 9, 1, 2, 3];
    const occupied = new Set(allyTeam.filter(a => a.alive && !a.isHorse && a.uid !== unit.uid).map(a => a.pos));
    for (const p of order) {
        if (!occupied.has(p)) { unit.pos = p; break; }
    }

    log.push({ type:'info', text:`<span class="gold">🕷️ 蛛落：${unit.name} 从天而降，落在${unit.pos}号位！</span>` });

    const aliveEnemies = enemySide.filter(u => u.alive);
    if (aliveEnemies.length > 0) {
        const target = aliveEnemies[rand(0, aliveEnemies.length - 1)];
        if (!target.alive) { log.push({ type:'info', text:`<span class="gray">🕷️ 蛛袭：目标已死亡，攻击取消</span>` }); return; }
        const penetrationDmg = Math.floor(unit.atk * (unit.atk / (unit.atk + target.def)));
        const masteryCount = unit._masteredRoles?.length || 0;
        const extraDmgMap = [0, 5, 10, 15, 30];
        const extraDmg = extraDmgMap[Math.min(masteryCount, 4)] || 0;
        const totalDmg = penetrationDmg + extraDmg;
        target.hp = Math.max(0, target.hp - totalDmg);
        unit.dmgDealt += totalDmg;
        target.dmgTaken += totalDmg;
        if (target.hp <= 0) { target.hp = 0; target.alive = false; target._isDead = true; if (!target._deathTime) target._deathTime = Date.now(); }
        log.push({ type:'info', text:`<span class="gold">🕷️ 蛛袭：${unit.name} 落地攻击 ${target.name}，穿透${penetrationDmg} + 精通${extraDmg} = ${totalDmg} 伤害！</span>`, uidA: unit.uid, uidD: target.uid, isDead: !target.alive, isSpiderStrike: true });
    }
}

// ==================== 小昭共通 — 精通 + 永久海克斯 ====================

export function computeButterflyMastery(unit) {
    if (!unit.isXiaoZhaoBrother || !unit._masteredRoles) return { atk: 0, def: 0, hp: 0 };
    const count = unit._masteredRoles.length;
    const extra = count >= 4 ? 1 : 0;
    return {
        atk: (count + extra) * 1.5,
        def: (count + extra) * 2,
        hp: (count + extra) * 10
    };
}

export function addPermanentBuff(xiaoZhao, buffKey, buffName, extraFields = {}) {
    if (!xiaoZhao || !xiaoZhao.isXiaoZhaoBrother) return;
    if (!xiaoZhao._permanentBuffs) xiaoZhao._permanentBuffs = [];
    xiaoZhao._permanentBuffs.push({
        key: buffKey,
        target: 'ally',
        remaining: Infinity,
        name: buffName,
        ...extraFields
    });
}

export function isXiaoZhaoPermanentActive(unit, activeBuffs, buffKey) {
    if (!unit || !unit.isXiaoZhaoBrother || !unit._permanentBuffs) return false;
    if (activeBuffs && hasBuff(activeBuffs, buffKey)) return false;
    return unit._permanentBuffs.some(b => b.key === buffKey);
}

// ==================== 成昆幻影 / 小昭惑心 / 连击 ====================

export function applyPhantomDisguise(unit, enemySide, allySide = null) {
    if (unit.camp !== 'ally') return null;
    const chengkun = enemySide.find(u => u.name === '成昆' && u.alive && u._phantomTarget);
    if (!chengkun || unit._isLinkAttack) return null;
    if (chengkun._phantomTarget === unit.uid) return null;
    const lostPct = (chengkun.maxHp - chengkun.hp) / chengkun.maxHp;
    const chance = ES.phantomDisguise.baseChance + Math.floor(lostPct * 10) * ES.phantomDisguise.per10pctLost;
    if (Math.random() < chance) {
        const fakeTarget = allySide ? allySide.find(u => u.uid === chengkun._phantomTarget && u.alive && !u.isHorse) : null;
        if (fakeTarget) {
            return { target: fakeTarget, log: `🎭 幻影伪装！${unit.name}被混乱，误攻队友${fakeTarget.name}！` };
        }
    }
    return null;
}

export function applyXiaoZhaoMindControl(unit, allySide, enemySide) {
    if (unit.camp !== 'enemy') return null;
    const xiaoZhao = enemySide.find(u => (u.isXiaoZhaoSister || u.isXiaoZhaoBrother) && u.alive);
    if (!xiaoZhao || !xiaoZhao._permanentBuffs || !xiaoZhao._permanentBuffs.some(b => b.key === 'mindControl')) return null;
    if (hasBuff(enemySide._activeBuffs, 'mindControl')) return null;
    if (Math.random() < 0.15) {
        const xzFakeTarget = allySide.find(u => u.uid !== unit.uid && u.alive && !u.isHorse);
        if (xzFakeTarget) {
            return { target: xzFakeTarget, log: `🦋 蝶舞迷心！${unit.name}被小昭迷惑，误攻队友${xzFakeTarget.name}！` };
        }
    }
    return null;
}

export function checkXiaoZhaoPermanentDoubleStrike(unit, activeBuffs) {
    if (!(unit.isXiaoZhaoSister || unit.isXiaoZhaoBrother) || !unit.alive || !unit._permanentBuffs) return false;
    if (!unit._permanentBuffs.some(b => b.key === 'doubleStrike')) return false;
    if (unit._xiaoZhaoDoubleStriked) return false;
    if (hasBuff(activeBuffs, 'doubleStrike')) return false;
    const chance = ES.xiaoZhaoDoubleStrike ? ES.xiaoZhaoDoubleStrike.chance * 100 : 80;
    return rand(1, 100) <= chance;
}

export function getXiaoZhaoHexEnhance(allyTeam, activeBuffs, hexKey) {
    const xiaoZhao = allyTeam.find(u => u.isXiaoZhaoSister && u.alive);
    if (!xiaoZhao) return null;
    if (!hasBuff(activeBuffs, hexKey)) return null;
    const s = ES.xiaoZhao;
    if (!s || !s.hexEnhance || !s.hexEnhance[hexKey]) return null;
    return s.hexEnhance[hexKey];
}