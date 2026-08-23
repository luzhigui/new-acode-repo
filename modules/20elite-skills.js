// modules/20elite-skills.js - 光明顶5v5 精英技能系统
// V5.5.3 | ~12522 bytes| 2026-08-21 战报记账修正：乾坤自伤改非记账，玄冥中毒补鹿杖客输出源
export const VER = 'modules/20elite-skills.js V5.5.3';

import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { ROLE_BONUS } from '../core/02unit.js';
import { hasBuff } from '../core/03battle-utils.js';
import { emitEvent, applyStatChange, applyMaxHpChange, registerQuery, getBattleRng } from '../core/13battle-shared.js';
const ES = CONFIG.ELITE_SKILLS;

// ==================== 玄冥二老 — 中毒/鹿角 ====================

export function tickXuanmingPoison(unit, source) {
    if (!unit.alive) return 0;
    if (!unit._xuanmingPoison || unit._xuanmingPoison.remaining <= 0) return 0;
    unit._xuanmingPoison.remaining--;
    const s = getSkillParams('鹿杖客', 'xuanmingPalm') || ES.xuanmingPalm;
    const idx = Math.min(unit._xuanmingPoison.dotPercents.length - 1, s.duration - 1 - unit._xuanmingPoison.remaining);
    const pct = unit._xuanmingPoison.dotPercents[idx] || 0;
    const dot = Math.floor(unit.maxHp * pct);
    applyStatChange(unit, 'hp', -dot, source, '玄冥中毒');
    return dot;
}

// ==================== 乾坤大挪移升级版减伤 ====================

export function applyDamageModifiers(unit, target, dmg, allySide, enemySide, log) {
    let modifiedDmg = dmg;
    const entries = [];
    const xiaoZhao = allySide.find(u => (u.isXiaoZhaoSister || u.isXiaoZhaoBrother) && u.alive);
    const zhang = allySide.find(c => c.isZhang && c.alive && c.rangedForm && !c.state._stunned);
    if (target.camp !== 'ally' || !zhang) return { modifiedDmg, entries };

    if (xiaoZhao && [2, 4, 6, 8].includes(target.pos)) {
        const s = getSkillParams('小昭', 'qianKunUpgraded') || ES.xiaoZhao;
        const reducePct = s.reducePct || 30;
        const reboundPct = s.reboundPct || 20;
        const selfDmgPct = s.selfDmgPct || 10;
        const reducedDmg = Math.round(dmg * (1 - reducePct / 100));
        const rebound = Math.floor(dmg * (reboundPct / 100));
        const selfDmg = Math.max(1, Math.floor(dmg * (selfDmgPct / 100)));

        zhang.reboundDone += rebound;
        applyStatChange(unit, 'hp', -rebound, zhang, '乾坤反弹');
        applyStatChange(zhang, 'hp', -selfDmg, unit, '乾坤自伤', false);

        entries.push({
            factType: 'qianKunUpgraded',
            data: {
                attackerName: unit.name,
                zhangName: zhang.name,
                reducePct,
                rebound,
                selfDmg
            }
        });

        modifiedDmg = reducedDmg;
    } else if (!xiaoZhao && (target.pos === 4 || target.pos === 6)) {
        const s = getSkillParams('张无忌', 'qianKun') || { reducePct: 10, reboundPct: 10, selfDmgPct: 10 };
        const reducePct = s.reducePct || 10;
        const reboundPct = s.reboundPct || 10;
        const selfDmgPct = s.selfDmgPct || 10;
        const reducedDmg = Math.round(dmg * (1 - reducePct / 100));
        const rebound = Math.floor(dmg * (reboundPct / 100));
        const selfDmg = Math.max(1, Math.floor(dmg * (selfDmgPct / 100)));

        zhang.reboundDone += rebound;
        applyStatChange(unit, 'hp', -rebound, zhang, '乾坤反弹');
        applyStatChange(zhang, 'hp', -selfDmg, unit, '乾坤自伤', false);

        entries.push({
            factType: 'qianKunBasic',
            data: {
                attackerName: unit.name,
                zhangName: zhang.name,
                reducePct,
                rebound,
                selfDmg
            }
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
        factType: 'xingFenGrant',
        data: { zhouName: zhou.name, songName: song.name }
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
            const hpBefore = Math.floor(unit.hp);
            applyStatChange(unit, 'hp', totalHeal, null, '快乐回血');
            log.push({
                factType: 'kuaiLeHeal',
                data: {
                    unitName: unit.name,
                    unitUid: unit.uid,
                    heal: totalHeal,
                    hpBefore,
                    hpAfter: Math.floor(unit.hp),
                    layers: unit._kuaiLeStack.length
                }
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
    const rng = getBattleRng();
    const roles = ['战士', '防战', '远程', '飞行'];
    let availableRoles = roles.filter(r => r !== unit.role);
    if (availableRoles.length === 0) availableRoles = roles;
    const newRole = availableRoles[rng.nextInt(0, availableRoles.length - 1)];
    unit._lastRole = newRole;

    if (!unit._masteredRoles) unit._masteredRoles = [];
    if (!unit._masteredRoles.includes(newRole)) {
        unit._masteredRoles.push(newRole);
    }

    const newStats = ROLE_BONUS[newRole] || { atk: 0, def: 0, maxHp: 0 };
    unit.role = newRole;
    if (newRole === '防战') unit._hpDmgRatio = 0.03;
    applyStatChange(unit, 'atk', newStats.atk, null, '蛛变');
    applyStatChange(unit, 'def', newStats.def, null, '蛛变');
    unit._baseAtk = (unit._baseAtk || unit.atk) + newStats.atk;
    unit._baseDef = (unit._baseDef || unit.def) + newStats.def;

    const st = getSkillParams('小昭', 'spiderTransform') || { hpBonus: 5 };
    let hpDelta = newStats.maxHp + (st.hpBonus || 5);
    unit._baseMaxHp = (unit._baseMaxHp || unit.maxHp) + hpDelta;
    applyMaxHpChange(unit, unit.maxHp + hpDelta, null, '蛛变');

    emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, role: newRole });
    log.push({ factType: 'spiderTransform', data: { unitName: unit.name, newRole, mastered: unit._masteredRoles.length } });
}

export function spiderReturn(unit, allyTeam, enemySide, log) {
    if (!unit.isXiaoZhaoBrother) return;
    const rng = getBattleRng();

    unit.state._spiderFlying = false;
    unit.state._flyMode = null;
    unit.state._acted = false;

    const order = [4, 5, 6, 7, 8, 9, 1, 2, 3];
    const occupied = new Set(allyTeam.filter(a => a.alive && !a.isHorse && a.uid !== unit.uid).map(a => a.pos));
    for (const p of order) {
        if (!occupied.has(p)) { unit.pos = p; break; }
    }

    emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _flyMode: null, _spiderFlying: false });
    emitEvent(unit, 'pos-change', { pos: unit.pos });

    log.push({ factType: 'spiderReturn', data: { unitName: unit.name, spiderUid: unit.uid, pos: unit.pos } });

    const aliveEnemies = enemySide.filter(u => u.alive);
    if (aliveEnemies.length > 0) {
        const target = aliveEnemies[rng.nextInt(0, aliveEnemies.length - 1)];
        if (!target.alive) { log.push({ factType: 'spiderDeadTarget', data: {} }); return; }
        const penetrationDmg = Math.floor(unit.atk * (unit.atk / (unit.atk + target.def)));
        const masteryCount = unit._masteredRoles?.length || 0;
        const params = getSkillParams('小昭', 'spiderStrike') || { extraDmgMap: [0, 5, 10, 15, 30] };
        const extraDmgMap = params.extraDmgMap || [0, 5, 10, 15, 30];
        const extraDmg = extraDmgMap[Math.min(masteryCount, 4)] || 0;
        const totalDmg = penetrationDmg + extraDmg;
        applyStatChange(target, 'hp', -totalDmg, unit, '蛛袭');
        log.push({
            factType: 'spiderStrike',
            data: {
                unitName: unit.name,
                targetName: target.name,
                penetrationDmg,
                extraDmg,
                totalDmg,
                isDead: !target.alive,
                unitUid: unit.uid,
                targetUid: target.uid
            }
        });
    }
}

// ==================== 小昭共通 — 精通 + 永久海克斯 ====================

export function computeButterflyMastery(unit) {
    if (!unit.isXiaoZhaoBrother || !unit._masteredRoles) return { atk: 0, def: 0, hp: 0 };
    const count = unit._masteredRoles.length;
    let layers = count;
    if (count >= 4) layers = count + 2;
    const m = getSkillParams('小昭', 'mastery') || { atkPer: 2, defPer: 2, hpPer: 5 };
    return {
        atk: layers * (m.atkPer || 2),
        def: layers * (m.defPer || 2),
        hp: layers * (m.hpPer || 5)
    };
}

export function addPermanentBuff(xiaoZhao, buffKey, buffName, extraFields = {}) {
    if (!xiaoZhao || !xiaoZhao.isXiaoZhaoBrother) return;
    if (!xiaoZhao._permanentBuffs) xiaoZhao._permanentBuffs = [];
    if (xiaoZhao._permanentBuffs.some(b => b.key === buffKey)) return;
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

export function getXiaoZhaoHexEnhance(allyTeam, activeBuffs, hexKey) {
    const xiaoZhao = allyTeam.find(u => u.isXiaoZhaoSister && u.alive);
    if (!xiaoZhao) return null;
    if (!hasBuff(activeBuffs, hexKey)) return null;
    const s = ES.xiaoZhao;
    if (!s || !s.hexEnhance || !s.hexEnhance[hexKey]) return null;
    return s.hexEnhance[hexKey];
}

// ==================== 查询注册 ====================
registerQuery('xiaoHexEnhance', getXiaoZhaoHexEnhance);
registerQuery('xiaoPermanentActive', isXiaoZhaoPermanentActive);
registerQuery('butterflyMastery', computeButterflyMastery);
registerQuery('damageModifiers', applyDamageModifiers);