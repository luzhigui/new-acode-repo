// modules/20elite-skills.js - 光明顶5v5 精英技能系统
// V5.7.1 | ~12200 bytes| 2026-08-24 蛛变职业加成改回永久叠加（仅删固定+5血），精通首次掌握按层数差给属性；删除断头的 computeButterflyMastery 查询链
export const VER = 'modules/20elite-skills.js V5.7.1';

import { getSkillParams } from '../core/01config-5v5-test.js';
import { getRoleBonus } from '../core/02unit.js';
import { hasBuff } from '../core/03battle-utils.js';
import { emitEvent, applyStatChange, applyMaxHpChange, registerQuery, getBattleRng } from '../core/13battle-shared.js';

// ==================== 玄冥二老 — 中毒/鹿角 ====================

export function tickXuanmingPoison(unit, source) {
    if (!unit.alive) return 0;
    if (!unit._xuanmingPoison || unit._xuanmingPoison.remaining <= 0) return 0;
    unit._xuanmingPoison.remaining--;
    const s = getSkillParams('鹿杖客', 'xuanmingPalm');
    if (!s) throw new Error('缺技能参数: 鹿杖客.xuanmingPalm');
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
        const s = getSkillParams('小昭', 'qianKunUpgraded');
        if (!s) throw new Error('缺技能参数: 小昭.qianKunUpgraded');
        const reducePct = s.reducePct;
        const reboundPct = s.reboundPct;
        const selfDmgPct = s.selfDmgPct;
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
        const s = getSkillParams('张无忌', 'qianKun');
        if (!s) throw new Error('缺技能参数: 张无忌.qianKun');
        const reducePct = s.reducePct;
        const reboundPct = s.reboundPct;
        const selfDmgPct = s.selfDmgPct;
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
            const levels = getSkillParams('宋青书', 'xinHun').healLevels;
            if (!levels) throw new Error('缺技能参数: 宋青书.xinHun.healLevels');
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

// 精通层数：每门职业 1 层，全部 4 门精通后额外 +2 层（封顶 6 层）
function masteryLayers(count) { return count >= 4 ? count + 2 : count; }

export function spiderTransform(unit, log) {
    if (!unit.isXiaoZhaoBrother || !unit.alive) return;
    const rng = getBattleRng();
    const roles = ['战士', '防战', '远程', '飞行'];
    let availableRoles = roles.filter(r => r !== unit.role);
    if (availableRoles.length === 0) availableRoles = roles;
    const newRole = availableRoles[rng.nextInt(0, availableRoles.length - 1)];
    unit._lastRole = newRole;

    if (!unit._masteredRoles) unit._masteredRoles = [];
    const isNewMastery = !unit._masteredRoles.includes(newRole);
    if (isNewMastery) unit._masteredRoles.push(newRole);

    // 蛛变：职业加成永久叠加（每变一次吃一份新职业加成，不扣旧的），本身无额外属性
    const newStats = getRoleBonus(newRole);
    unit.role = newRole;
    if (newRole === '防战') unit._hpDmgRatio = 0.03;
    applyStatChange(unit, 'atk', newStats.atk, null, '蛛变');
    applyStatChange(unit, 'def', newStats.def, null, '蛛变');
    unit._baseAtk = (unit._baseAtk || unit.atk) + newStats.atk;
    unit._baseDef = (unit._baseDef || unit.def) + newStats.def;
    unit._baseMaxHp = (unit._baseMaxHp || unit.maxHp) + newStats.maxHp;
    applyMaxHpChange(unit, unit.maxHp + newStats.maxHp, null, '蛛变');

    // 精通加成：首次精通新职业时按层数差结算（全精通时一次性补 2 层）
    let masteryGain = null;
    if (isNewMastery) {
        const m = getSkillParams('小昭', 'mastery');
        if (!m) throw new Error('缺技能参数: 小昭.mastery');
        const gained = masteryLayers(unit._masteredRoles.length) - masteryLayers(unit._masteredRoles.length - 1);
        if (gained > 0) {
            const gAtk = gained * m.atkPer, gDef = gained * m.defPer, gHp = gained * m.hpPer;
            applyStatChange(unit, 'atk', gAtk, null, '精通');
            applyStatChange(unit, 'def', gDef, null, '精通');
            unit._baseAtk += gAtk;
            unit._baseDef += gDef;
            unit._baseMaxHp += gHp;
            applyMaxHpChange(unit, unit.maxHp + gHp, null, '精通');
            masteryGain = { atk: gAtk, def: gDef, hp: gHp };
        }
    }

    emitEvent(unit, 'hp-change', { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, role: newRole });
    log.push({ factType: 'spiderTransform', data: { unitName: unit.name, newRole, mastered: unit._masteredRoles.length, masteryGain } });
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
        const params = getSkillParams('小昭', 'spiderStrike');
        if (!params) throw new Error('缺技能参数: 小昭.spiderStrike');
        const extraDmgMap = params.extraDmgMap;
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

// ==================== 小昭共通 — 永久海克斯 ====================
// 精通加成已在 spiderTransform 首次掌握时增量结算进 _base 属性（见 masteryLayers），
// 原 computeButterflyMastery → computeBuffStats 断头查询链已删除

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
    const s = getSkillParams('小昭', 'hexEnhance');
    if (!s) throw new Error('缺技能参数: 小昭.hexEnhance');
    return s[hexKey] || null;
}

// ==================== 查询注册 ====================
registerQuery('xiaoHexEnhance', getXiaoZhaoHexEnhance);
registerQuery('xiaoPermanentActive', isXiaoZhaoPermanentActive);
registerQuery('damageModifiers', applyDamageModifiers);