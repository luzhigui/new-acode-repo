// V5.7.2 | ~12200 bytes | 2026-08-24 蛛变防战 z 值改查分档表（getHpDmgRatio(0.5)=0.03），删硬编码
export const VER = 'modules/20elite-skills.js V5.7.2';

import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { getRoleBonus, getHpDmgRatio } from '../core/02unit.js';
import { hasBuff } from '../core/03battle-utils.js';
import { emitEvent, applyStatChange, applyMaxHpChange, registerQuery, getBattleRng } from '../core/13battle-shared.js';
import { FACT_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, ROLE_TYPES } from '../infra/56-battle-enums.js';

// 玄冥二老 — 中毒/鹿角

export function tickXuanmingPoison(unit, source) {
    if (!unit.alive) return 0;
    const poison = unit.state._xuanmingPoison;
    if (!poison || poison.remaining <= 0) return 0;
    poison.remaining--;
    const s = getSkillParams('鹿杖客', 'xuanmingPalm');
    if (!s) throw new Error('缺技能参数: 鹿杖客.xuanmingPalm');
    const idx = Math.min(poison.dotPercents.length - 1, s.duration - 1 - poison.remaining);
    const pct = poison.dotPercents[idx] || 0;
    const dot = Math.floor(unit.maxHp * pct);
    applyStatChange(unit, 'hp', -dot, source, '玄冥中毒');
    return dot;
}

// 乾坤大挪移升级版减伤

export function applyDamageModifiers(unit, target, dmg, allySide, enemySide, log) {
    let modifiedDmg = dmg;
    const entries = [];
    const xiaoZhao = allySide.find(u => (u.isXiaoZhaoSister || u.isXiaoZhaoBrother) && u.alive);
    const zhang = allySide.find(c => c.isZhang && c.alive && c.rangedForm && !c.state._stunned);
    if (target.camp !== CAMP_TYPES.ALLY || !zhang) return { modifiedDmg, entries };

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
            factType: FACT_TYPES.QIAN_KUN_UPGRADED,
            data: {
                attackerName: unit.name,
                zhangName: zhang.name,
                reducePct,
                rebound,
                selfDmg,
                attackerUid: unit.uid,
                zhangUid: zhang.uid
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
            factType: FACT_TYPES.QIAN_KUN_BASIC,
            data: {
                attackerName: unit.name,
                zhangName: zhang.name,
                reducePct,
                rebound,
                selfDmg,
                attackerUid: unit.uid,
                zhangUid: zhang.uid
            }
        });

        modifiedDmg = reducedDmg;
    }

    return { modifiedDmg, entries };
}

// 宋青书/周芷若联动函数已迁入 core/15-skill-mechanisms.js
// （消除 core→modules 循环依赖）

// 小昭·妹 — 蛛变/飞天/蛛落

// 精通层数：每职业 1 层，全 4 门后 +2 层（封顶 6）
function masteryLayers(count) { return count >= 4 ? count + 2 : count; }

export function spiderTransform(unit, log) {
    if (!unit.isXiaoZhaoBrother || !unit.alive) return;
    const rng = getBattleRng();
    const roles = [ROLE_TYPES.WARRIOR, ROLE_TYPES.DEFENDER, ROLE_TYPES.RANGED, ROLE_TYPES.FLYER];
    let availableRoles = roles.filter(r => r !== unit.role);
    if (availableRoles.length === 0) availableRoles = roles;
    const newRole = availableRoles[rng.nextInt(0, availableRoles.length - 1)];
    unit.state._lastRole = newRole;

    if (!unit.state._masteredRoles) Object.assign(unit.state, { _masteredRoles: [] });
    const isNewMastery = !unit.state._masteredRoles.includes(newRole);
    if (isNewMastery) unit.state._masteredRoles.push(newRole);

    // 蛛变：每次变身叠加新职业加成，不扣旧
    const newStats = getRoleBonus(newRole);
    unit.role = newRole;
    if (newRole === ROLE_TYPES.DEFENDER) unit.state._hpDmgRatio = getHpDmgRatio(0.5);
    applyStatChange(unit, 'atk', newStats.atk, null, '蛛变');
    applyStatChange(unit, 'def', newStats.def, null, '蛛变');
    unit.state._baseAtk = (unit.state._baseAtk || unit.atk) + newStats.atk;
    unit.state._baseDef = (unit.state._baseDef || unit.def) + newStats.def;
    unit.state._baseMaxHp = (unit.state._baseMaxHp || unit.maxHp) + newStats.maxHp;
    applyMaxHpChange(unit, unit.maxHp + newStats.maxHp, null, '蛛变');
    emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _baseAtk: unit.state._baseAtk, _baseDef: unit.state._baseDef, _baseMaxHp: unit.state._baseMaxHp });

    // 精通加成：首次精通时按层数差结算，全精通补 2 层
    let masteryGain = null;
    if (isNewMastery) {
        const m = getSkillParams('小昭', 'mastery');
        if (!m) throw new Error('缺技能参数: 小昭.mastery');
        const gained = masteryLayers(unit.state._masteredRoles.length) - masteryLayers(unit.state._masteredRoles.length - 1);
        if (gained > 0) {
            const gAtk = gained * m.atkPer, gDef = gained * m.defPer, gHp = gained * m.hpPer;
            applyStatChange(unit, 'atk', gAtk, null, '精通');
            applyStatChange(unit, 'def', gDef, null, '精通');
            unit.state._baseAtk += gAtk;
            unit.state._baseDef += gDef;
            unit.state._baseMaxHp += gHp;
            applyMaxHpChange(unit, unit.maxHp + gHp, null, '精通');
            emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _baseAtk: unit.state._baseAtk, _baseDef: unit.state._baseDef, _baseMaxHp: unit.state._baseMaxHp });
            masteryGain = { atk: gAtk, def: gDef, hp: gHp };
        }
    }

    emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, role: newRole });
    log.push({ factType: FACT_TYPES.SPIDER_TRANSFORM, data: { unitName: unit.name, newRole, mastered: unit.state._masteredRoles.length, masteryGain } });
}

export function spiderReturn(unit, allyTeam, enemySide, log) {
    if (!unit.isXiaoZhaoBrother) return;
    const rng = getBattleRng();

    Object.assign(unit.state, { _spiderFlying: false, _flyMode: null });
    unit.state._acted = false;

    const order = [4, 5, 6, 7, 8, 9, 1, 2, 3];
    const occupied = new Set(allyTeam.filter(a => a.alive && !a.isHorse && a.uid !== unit.uid).map(a => a.pos));
    for (const p of order) {
        if (!occupied.has(p)) { unit.pos = p; break; }
    }

    emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: unit.atk, def: unit.def, _flyMode: null, _spiderFlying: false });
    emitEvent(unit, UNIT_EVENT_TYPES.POS_CHANGE, { pos: unit.pos });

    log.push({ factType: FACT_TYPES.SPIDER_RETURN, data: { unitName: unit.name, spiderUid: unit.uid, pos: unit.pos } });

    const aliveEnemies = enemySide.filter(u => u.alive);
    if (aliveEnemies.length > 0) {
        const target = aliveEnemies[rng.nextInt(0, aliveEnemies.length - 1)];
        if (!target.alive) { log.push({ factType: FACT_TYPES.SPIDER_DEAD_TARGET, data: {} }); return; }
        const penetrationDmg = Math.floor(unit.atk * (unit.atk / (unit.atk + target.def)));
        const masteryCount = unit.state._masteredRoles?.length || 0;
        const params = getSkillParams('小昭', 'spiderStrike');
        if (!params) throw new Error('缺技能参数: 小昭.spiderStrike');
        const extraDmgMap = params.extraDmgMap;
        const extraDmg = extraDmgMap[Math.min(masteryCount, 4)] || 0;
        const totalDmg = penetrationDmg + extraDmg;
        applyStatChange(target, 'hp', -totalDmg, unit, '蛛袭');
        log.push({
            factType: FACT_TYPES.SPIDER_STRIKE,
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

// 小昭共通 — 永久海克斯
// 精通加成已在 spiderTransform 时结算进 _base，无独立查询链

export function addPermanentBuff(xiaoZhao, buffKey, buffName, extraFields = {}) {
    if (!xiaoZhao || !xiaoZhao.isXiaoZhaoBrother) return;
    if (!CONFIG.XIAO_ZHAO_PERMANENT_BUFFS.includes(buffKey)) return;
    if (!xiaoZhao.state._permanentBuffs) Object.assign(xiaoZhao.state, { _permanentBuffs: [] });
    if (xiaoZhao.state._permanentBuffs.some(b => b.key === buffKey)) return;
    xiaoZhao.state._permanentBuffs.push({
        key: buffKey,
        target: CAMP_TYPES.ALLY,
        remaining: Infinity,
        name: buffName,
        ...extraFields
    });
}

export function isXiaoZhaoPermanentActive(unit, activeBuffs, buffKey) {
    if (!unit || !unit.isXiaoZhaoBrother || !unit.state._permanentBuffs) return false;
    if (!CONFIG.XIAO_ZHAO_PERMANENT_BUFFS.includes(buffKey)) return false;
    if (activeBuffs && hasBuff(activeBuffs, buffKey)) return false;
    return unit.state._permanentBuffs.some(b => b.key === buffKey);
}

export function getXiaoZhaoHexEnhance(allyTeam, activeBuffs, hexKey) {
    const xiaoZhao = allyTeam.find(u => u.isXiaoZhaoSister && u.alive);
    if (!xiaoZhao) return null;
    if (!hasBuff(activeBuffs, hexKey)) return null;
    const s = getSkillParams('小昭', 'hexEnhance');
    if (!s) throw new Error('缺技能参数: 小昭.hexEnhance');
    return s[hexKey] || null;
}

// 查询注册
registerQuery('xiaoHexEnhance', getXiaoZhaoHexEnhance);
registerQuery('xiaoPermanentActive', isXiaoZhaoPermanentActive);
registerQuery('damageModifiers', applyDamageModifiers);