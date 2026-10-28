// modules/20elite-skills.js — 精英技能公共实现（小昭蛛变/飞天/蛛袭、乾坤减伤、永久海克斯查询）
// 飞天落地回血先 previewHeal 预演再落账：文案/飘字取实际值，声明值只记审计。
//   landHeal 提前算好写进 SPIDER_RETURN fact data（数值对照器声明侧；不落地记 0，与 addMod 同条件同值）。
// V6.3.2 | 2026-10-22 | ~15500 bytes
export const VER = 'modules/20elite-skills.js V6.3.2';

import { CONFIG, getSkillParams } from '../core/01config-5v5-test.js';
import { getRoleBonus, getHpDmgRatio } from '../core/02unit.js';
import { hasBuff, canBeTargeted } from '../core/03battle-utils.js';
import { emitEvent, applyStatChange, refreshMaxHp, registerQuery, getBattleRng, addMod, removeModsByGroup, getStat, recordHpAudit, previewHeal } from '../core/13battle-shared.js';
import { FACT_TYPES, UNIT_EVENT_TYPES, CAMP_TYPES, ROLE_TYPES, STATE_CHANGE_TYPES } from '../infra/56-battle-enums.js';
import { emitStateChange } from '../infra/59-state-change.js';
import { pushSkillAnnounce } from './23elite-helpers.js';

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

// 乾坤保护域：张无忌当前所站的四邻格（前后左右）。3x3 棋盘 1-9：上=p-3、下=p+3、左=p-1（非左列）、右=p+1（非右列）。
// 站中心 5 号时恰为旧版固定 2/4/6/8；站边角时邻格只有 2-3 个，保护范围随之收窄。
function qianKunZone(pos) {
    const zone = [];
    if (pos > 3) zone.push(pos - 3);
    if (pos <= 6) zone.push(pos + 3);
    if (pos % 3 !== 1) zone.push(pos - 1);
    if (pos % 3 !== 0) zone.push(pos + 1);
    return zone;
}

export function applyDamageModifiers(unit, target, dmg, allySide, enemySide, log) {
    let modifiedDmg = dmg;
    const entries = [];
    const xiaoZhao = allySide.find(u => (u.isXiaoZhaoSister || u.isXiaoZhaoBrother) && u.alive);
    const zhang = allySide.find(c => c.isZhang && c.alive && c.rangedForm && !c.state._stunned);
    if (target.camp !== CAMP_TYPES.ALLY || !zhang) return { modifiedDmg, entries };

    let isProtected = false;
    let reducePct, reboundPct, selfDmgPct;
    let label;

    if (xiaoZhao && qianKunZone(zhang.pos).includes(target.pos)) {
        const s = getSkillParams('小昭', 'qianKunUpgraded');
        if (!s) throw new Error('缺技能参数: 小昭.qianKunUpgraded');
        reducePct = s.reducePct; reboundPct = s.reboundPct; selfDmgPct = s.selfDmgPct;
        isProtected = true; label = 'QIAN_KUN_UPGRADED';
    } else if (!xiaoZhao && qianKunZone(zhang.pos).includes(target.pos)) {
        const s = getSkillParams('张无忌', 'qianKun');
        if (!s) throw new Error('缺技能参数: 张无忌.qianKun');
        reducePct = s.reducePct; reboundPct = s.reboundPct; selfDmgPct = s.selfDmgPct;
        isProtected = true; label = 'QIAN_KUN_BASIC';
    }

    if (isProtected) {
        const reducedDmg = Math.round(dmg * (1 - reducePct));
        const rebound = Math.floor(dmg * reboundPct);
        const selfDmg = Math.max(1, Math.floor(dmg * selfDmgPct));

        zhang.reboundDone += rebound;
        applyStatChange(unit, 'hp', -rebound, zhang, '乾坤反弹');
        applyStatChange(zhang, 'hp', -selfDmg, unit, '乾坤自伤', false);

        // 新增：张无忌如果有护盾，优先用护盾替队友全额挡下剩余伤害
        let absorbed = 0;
        let shieldLeft = (zhang.state._shield || 0) + (zhang.state._permShield || 0);
        if (shieldLeft > 0 && reducedDmg > 0) {
            absorbed = Math.min(shieldLeft, reducedDmg);
            let remainAbsorb = absorbed;

            // 先扣临时盾
            if (zhang.state._shield > 0) {
                const deduct = Math.min(zhang.state._shield, remainAbsorb);
                zhang.state._shield -= deduct;
                remainAbsorb -= deduct;
            }
            // 再扣永久盾
            if (remainAbsorb > 0 && zhang.state._permShield > 0) {
                const deduct = Math.min(zhang.state._permShield, remainAbsorb);
                zhang.state._permShield -= deduct;
                remainAbsorb -= deduct;
            }

            // 刷新张无忌的 UI（血量/护盾状态）
            emitEvent(zhang, UNIT_EVENT_TYPES.HP_CHANGE, { hp: zhang.hp, maxHp: zhang.maxHp, alive: zhang.alive, atk: getStat(zhang, 'atk'), def: getStat(zhang, 'def') });
        }

        entries.push({
            factType: FACT_TYPES[label],
            data: {
                attackerName: unit.name,
                zhangName: zhang.name,
                reducePct,
                rebound,
                selfDmg,
                absorbed,
                attackerUid: unit.uid,
                zhangUid: zhang.uid
            }
        });

        modifiedDmg = reducedDmg - absorbed;
    }

    return { modifiedDmg, entries };
}

// 小昭·妹 — 蛛变/飞天/蛛落

// 精通层数：每职业 1 层，全 4 门后 +2 层（封顶 6）
function masteryLayers(count) { return count >= CONFIG.ROLES.length ? count + CONFIG.MASTERY_FULL_BONUS_LAYERS : count; }

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
    addMod(unit, 'atk', { source: '蛛变·' + newRole, value: newStats.atk, ttl: 'permanent', group: 'spiderTransform', op: 'add' });
    addMod(unit, 'def', { source: '蛛变·' + newRole, value: newStats.def, ttl: 'permanent', group: 'spiderTransform', op: 'add' });
    addMod(unit, 'maxHp', { source: '蛛变·' + newRole, value: newStats.maxHp, ttl: 'permanent', group: 'spiderTransform', op: 'add' });
    refreshMaxHp(unit, null, '蛛变');
    emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: getStat(unit, 'atk'), def: getStat(unit, 'def') });

    // 精通加成：首次精通时按层数差结算，全精通补 2 层
    let masteryGain = null;
    if (isNewMastery) {
        const m = getSkillParams('小昭', 'mastery');
        if (!m) throw new Error('缺技能参数: 小昭.mastery');
        const gained = masteryLayers(unit.state._masteredRoles.length) - masteryLayers(unit.state._masteredRoles.length - 1);
        if (gained > 0) {
            const gAtk = gained * m.atkPer, gDef = gained * m.defPer, gHp = gained * m.hpPer;
            addMod(unit, 'atk', { source: '精通', value: gAtk, ttl: 'permanent', group: 'spiderMastery', op: 'add' });
            addMod(unit, 'def', { source: '精通', value: gDef, ttl: 'permanent', group: 'spiderMastery', op: 'add' });
            addMod(unit, 'maxHp', { source: '精通', value: gHp, ttl: 'permanent', group: 'spiderMastery', op: 'add' });
            refreshMaxHp(unit, null, '精通');
            emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: getStat(unit, 'atk'), def: getStat(unit, 'def') });
            masteryGain = { atk: gAtk, def: gDef, hp: gHp };
        }
    }

    emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: getStat(unit, 'atk'), def: getStat(unit, 'def'), role: newRole });
    emitStateChange(unit, STATE_CHANGE_TYPES.ROLE_CHANGED, { newRole }, log);
    // 体检对照增量字段：atkDelta/defDelta/maxHpDelta = 本次蛛变实际登记的职业加成（与上方 addMod 入参同源）；
    //   masteryGain 是精通层数的独立增量，勿混用
    log.push({ factType: FACT_TYPES.SPIDER_TRANSFORM, data: { unitName: unit.name, unitUid: unit.uid, newRole, mastered: unit.state._masteredRoles.length, masteryGain, atkDelta: newStats.atk, defDelta: newStats.def, maxHpDelta: newStats.maxHp } });
}

export function spiderReturn(unit, allyTeam, enemySide, log) {
    if (!unit.isXiaoZhaoBrother) return;
    const rng = getBattleRng();

    Object.assign(unit.state, { _spiderFlying: false, _flyMode: null });
    unit.state._acted = false;

    // 落格规矩（老板定稿）：回原格优先——自己是几号位先落哪，原格被占再按「原格+1 环形顺延」
    //   （7 → 8,9,1,2,3,4,5,6）。一切存活队友都算占格：拒马/狮子/召唤物/天上的蝶/蛛/附身者（旧版
    //   后排优先 [4,5,6...] 且把拒马当空气，会一头落进拒马格子——seed15 stage5 R9 重叠案，体检不变量
    //   「pos 冲突」即此）。飞天期间 pos 不动（自己原格天然保留），anchor 即原格。
    const anchor = unit.pos || 4;
    const order = [];
    for (let i = 0; i < 9; i++) order.push(((anchor - 1 + i) % 9) + 1);
    const occupied = new Set(allyTeam.filter(a => a.alive && a.uid !== unit.uid).map(a => a.pos));
    for (const p of order) {
        if (!occupied.has(p)) { unit.pos = p; break; }
    }

    emitEvent(unit, UNIT_EVENT_TYPES.HP_CHANGE, { hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive, atk: getStat(unit, 'atk'), def: getStat(unit, 'def'), _flyMode: null, _spiderFlying: false });
    emitEvent(unit, UNIT_EVENT_TYPES.POS_CHANGE, { pos: unit.pos });
    emitStateChange(unit, STATE_CHANGE_TYPES.LANDING, { pos: unit.pos }, log);

    // 落地回血：70/40 档回 maxHp 的 landHealRatio，
    //   致死档回 landHealRatioDeath；孵化落地不回（血钉 eggHatchHpRatio）。档位随 _spiderLandTier 带入。
    // landHeal 提前算好并写进 SPIDER_RETURN fact（数值对照器 SPIDER_LAND_HEAL 契约的声明侧，体检第 88 轮转交）；
    //   不落地（孵化/满血/比率为 0）时记 0，与 addMod 记账同条件同值
    let landHeal = 0;
    if (!unit.state._spiderEggHatch) {
        const flyParams = getSkillParams('小昭', 'spiderFly');
        if (!flyParams) throw new Error('缺技能参数: 小昭.spiderFly');
        const ratio = unit.state._spiderLandTier === 'death' ? flyParams.landHealRatioDeath : flyParams.landHealRatio;
        const heal = Math.floor(unit.maxHp * ratio);
        if (heal > 0 && unit.hp < unit.maxHp) landHeal = heal;
    }

    // 2026-10-22 体检第 115 轮转交：fact/账本/飘字三处同报实际落地值（截脉/寒毒打折后），
    //   与九阳/嗜血/热血/快乐/寒离飒吸血同口径（landHeal 仍是公式原值，只作 applyStatChange 入参）
    let actualLandHeal = 0;
    if (landHeal > 0) actualLandHeal = previewHeal(unit, landHeal);

    log.push({ factType: FACT_TYPES.SPIDER_RETURN, data: { unitName: unit.name, spiderUid: unit.uid, pos: unit.pos, landHeal: actualLandHeal } });

    if (landHeal > 0) {
        const hpBeforeHeal = Math.floor(unit.hp);
        applyStatChange(unit, 'hp', landHeal, unit, '飞天落地回血');
        recordHpAudit(unit, 'spiderLandHeal', actualLandHeal, '飞天落地回血');
        pushSkillAnnounce(log, unit, '飞天落地回血', `🕷️ ${unit.name} 飞天落地回血：生命 +${actualLandHeal}（${hpBeforeHeal} → ${hpBeforeHeal + actualLandHeal}）`, { floatText: `+${actualLandHeal}`, floatUid: unit.uid });
    }

    // 落地打击目标池统一走 canBeTargeted：不打天上的蝶/蛛、不打不可选单位（与主攻击门禁同口径）
    const aliveEnemies = enemySide.filter(u => u.alive && canBeTargeted(u));
    if (aliveEnemies.length > 0) {
        const target = aliveEnemies[rng.nextInt(0, aliveEnemies.length - 1)];
        if (!target.alive) { log.push({ factType: FACT_TYPES.SPIDER_DEAD_TARGET, data: {} }); return; }
        const atk = getStat(unit, 'atk');
        const def = getStat(target, 'def');
        // 老板拍板：落地蛛袭的穿透伤害减半（精通额外伤害保持不变）
        const penetrationDmg = Math.floor(atk * (atk / (atk + def)) * 0.5);
        const masteryCount = unit.state._masteredRoles?.length || 0;
        const params = getSkillParams('小昭', 'spiderStrike');
        if (!params) throw new Error('缺技能参数: 小昭.spiderStrike');
        const extraDmgMap = params.extraDmgMap;
        const extraDmg = extraDmgMap[Math.min(masteryCount, Object.keys(extraDmgMap).length - 1)] || 0;
        const totalDmg = penetrationDmg + extraDmg;
        applyStatChange(target, 'hp', -totalDmg, unit, '蛛袭');
        // 审计账本：记进 unit._audit.hp，零游戏逻辑副作用
        recordHpAudit(target, 'spiderStrike', -totalDmg, '蛛袭');
        log.push({
            factType: FACT_TYPES.SPIDER_STRIKE,
            data: {
                unitName: unit.name,
                targetName: target.name,
                penetrationDmg,
                extraDmg,
                totalDmg,
                isDead: target.hp <= 0,          // 原 isDead: !target.alive —— 上一步 applyStatChange 已即时扣血（hp 夹到 0 不保 1），
                                                 //   alive 要到 finalizeDeaths 才置 false，故旧写法恒为 false、击杀标记永远不出现
                unitUid: unit.uid,
                targetUid: target.uid
            }
        });
    }
}

// 永久海克斯 — 仅小昭·妹可用（isXiaoZhaoBrother）；姊走 hexEnhance 增强路线，不继承永久效果

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